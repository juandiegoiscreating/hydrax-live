import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ODDS_KEY = Deno.env.get("THE_ODDS_API_KEY") || "";
const BASE = "https://api.the-odds-api.com/v4";
const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-hydrax-job-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};
const SUPPORTED_SCORES = new Set([
  "basketball_nba", "basketball_ncaab",
  "americanfootball_nfl", "americanfootball_ncaaf", "baseball_mlb",
  "tennis_atp_canadian_open", "tennis_atp_china_open",
  "tennis_atp_cincinnati_open", "tennis_atp_japan_open",
  "tennis_atp_shanghai_masters", "tennis_atp_swiss_indoors",
  "tennis_atp_us_open", "tennis_atp_vienna_open",
  "tennis_atp_washington_open", "tennis_wta_canadian_open",
  "tennis_wta_china_open", "tennis_wta_cincinnati_open",
  "tennis_wta_guadalajara_open", "tennis_wta_monterrey_open",
  "tennis_wta_ningbo_open", "tennis_wta_pan_pacific_open",
  "tennis_wta_singapore_open", "tennis_wta_us_open",
  "tennis_wta_washington_open", "tennis_wta_wuhan_open"
]);
type Obj = Record<string, any>;
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {auth:{persistSession:false,autoRefreshToken:false}})
  : null;

function json(status:number,data:unknown) {
  return Response.json(data,{status,headers:JSON_HEADERS});
}
function matchSport(key:string):string|null {
  const known: Record<string,string> = {
    "basketball_nba":"NBA","basketball_ncaab":"NCAAB",
    "americanfootball_nfl":"NFL","americanfootball_ncaaf":"NCAAF",
    "baseball_mlb":"MLB","mma_mixed_martial_arts":"UFC"
  };
  if (known[key]) return known[key];
  if (/^tennis_atp_[a-z0-9_]+$/.test(key)) return "ATP";
  if (/^tennis_wta_[a-z0-9_]+$/.test(key)) return "WTA";
  return null;
}
function normal(s:unknown) {
  return String(s||"").trim().normalize("NFKC").toLocaleLowerCase("en-US");
}
function validOdds(n:unknown) {
  return Number.isInteger(n) && (n <= -100 || n >= 100) && Math.abs(n)<=100000;
}
function saneMoney(n:unknown) {
  return typeof n==="number" && Number.isFinite(n) && n>0 && n<=100000000
    && Math.abs(Math.round(n*100)-n*100)<1e-6;
}
async function provider(path:string) {
  if (!ODDS_KEY) throw new Error("THE_ODDS_API_KEY_MISSING");
  const r = await fetch(BASE + path,{
    headers:{"x-api-key":ODDS_KEY,"Accept":"application/json"},
    signal:AbortSignal.timeout(16000)
  });
  let payload:any;
  try { payload = await r.json(); } catch { throw new Error("INVALID_PROVIDER_RESPONSE"); }
  if (!r.ok) throw new Error("SPORTS_PROVIDER_HTTP_" + r.status +
    (typeof payload?.error_code==="string" ? "_" + payload.error_code : ""));
  return {payload,remaining:Number(r.headers.get("x-requests-remaining")),cost:Number(r.headers.get("x-requests-last"))};
}
async function verifiedUser(req:Request) {
  const authorization=req.headers.get("Authorization")||"";
  const token=authorization.startsWith("Bearer ")? authorization.slice(7):"";
  if (!token||!SUPABASE_URL||!ANON_KEY) return null;
  const client=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  return error?null:data.user;
}
async function inputLegs(value:unknown) {
  if (!Array.isArray(value)||value.length<1||value.length>10) throw new Error("Se requieren de 1 a 10 selecciones");
  const groups=new Map<string,any[]>();
  for (const l of value) {
    const key=String(l?.sport_key||"");
    if (!matchSport(key)||!l?.event_id||!/^[a-zA-Z0-9_-]{8,128}$/.test(String(l.event_id))) throw new Error("Evento o deporte inválido");
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key)!.push(l);
  }
  if(groups.size>10) throw new Error("Demasiados torneos");
  const eventLookup=new Map<string,any>();
  for(const key of groups.keys()){
    const {payload}=await provider("/sports/"+encodeURIComponent(key)+"/events");
    if(!Array.isArray(payload)) throw new Error("Formato de eventos inesperado");
    for(const e of payload) {
      if(typeof e?.id==="string") eventLookup.set(key+"|"+e.id,e);
    }
  }
  const result:any[]=[];
  const seen=new Set<string>();
  for (const l of value) {
    const key=String(l.sport_key);
    const evt=eventLookup.get(key+"|"+l.event_id);
    if(!evt||typeof evt.home_team!=="string"||typeof evt.away_team!=="string"
       || !Number.isFinite(Date.parse(evt.commence_time))) throw new Error("Evento no disponible; vuelve a buscarlo");
    const selection=String(l.selection||"").trim();
    if(![normal(evt.home_team),normal(evt.away_team)].includes(normal(selection)))
      throw new Error("La selección debe ser uno de los dos participantes");
    if (seen.has(key+"|"+evt.id)) throw new Error("No repitas el mismo evento en un parlay");
    seen.add(key+"|"+evt.id);
    result.push({
      sport:matchSport(key),provider_sport_key:key,provider_event_id:evt.id,
      event_name:(evt.away_team+" vs "+evt.home_team).slice(0,240),
      home_name:evt.home_team,away_name:evt.away_team,
      starts_at:evt.commence_time,selection,market:"h2h",
      status:"pending"
    });
  }
  return result;
}
async function createOrAttach(body:Obj,user:Obj,attach:boolean){
  const legs=await inputLegs(body.legs);
  const betType=legs.length>1?"parlay":"single";
  if(attach){
    const id=String(body.bet_id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id)) return json(400,{ok:false,error:"BET_ID_INVALID"});
    const {data:bet,error}=await admin!.from("hydrax_bets")
      .select("id,user_id,status,bet_type").eq("id",id).eq("user_id",user.id).maybeSingle();
    if(error) throw error;
    if(!bet||bet.status!=="pending") return json(404,{ok:false,error:"PENDING_BET_NOT_FOUND"});
    if(bet.bet_type!==betType) return json(400,{ok:false,error:"SINGLE_PARLAY_MISMATCH"});
    const {count,error:ce}=await admin!.from("hydrax_bet_legs")
      .select("id",{count:"exact",head:true}).eq("bet_id",id);
    if(ce) throw ce;
    if((count||0)>0) return json(409,{ok:false,error:"ALREADY_TRACKED"});
    const records=legs.map((l,i)=>({...l,bet_id:id,user_id:user.id,leg_index:i+1}));
    const {error:le}=await admin!.from("hydrax_bet_legs").insert(records);
    if(le) throw le;
    return json(200,{ok:true,bet_id:id,legs:records.length,auto_eligible:records.every(l=>SUPPORTED_SCORES.has(l.provider_sport_key))});
  }
  if(!saneMoney(body.stake)||!validOdds(body.american_odds)) return json(400,{ok:false,error:"STAKE_OR_ODDS_INVALID"});
  const sportsbook=String(body.sportsbook||"Caesars").slice(0,100);
  const sports=new Set(legs.map(l=>l.sport));
  const sport=sports.size===1?legs[0].sport:"MIXED";
  const event_name=(legs.length===1?legs[0].event_name:
    (legs.length+" selecciones: "+legs.map(l=>l.event_name).join("; "))).slice(0,240);
  const selection=(legs.length===1?legs[0].selection:
    legs.map(l=>l.selection).join(" + ")).slice(0,240);
  const {data:bet,error}=await admin!.from("hydrax_bets")
    .insert({user_id:user.id,sport,event_name,selection,market:"h2h",
      bet_type:betType,sportsbook,stake:body.stake,american_odds:body.american_odds,status:"pending"})
    .select("id").single();
  if(error) throw error;
  const records=legs.map((l,i)=>({...l,bet_id:bet.id,user_id:user.id,leg_index:i+1}));
  const {error:legError}=await admin!.from("hydrax_bet_legs").insert(records);
  if(legError){
    await admin!.from("hydrax_bets").delete().eq("id",bet.id).eq("status","pending");
    throw legError;
  }
  return json(201,{ok:true,bet_id:bet.id,legs:records.length,auto_eligible:records.every(l=>SUPPORTED_SCORES.has(l.provider_sport_key))});
}
function outcome(event:Obj, leg:Obj):"won"|"lost"|"review"|"pending" {
  if(event.completed!==true) return "pending";
  if(normal(event.home_team)!==normal(leg.home_name)||
     normal(event.away_team)!==normal(leg.away_name)) return "review";
  if(!Array.isArray(event.scores)||event.scores.length!==2) return "review";
  const scores=new Map<string,number>();
  for(const item of event.scores) {
    const s=String(item?.score||"").trim();
    if(!/^\d+(\.\d+)?$/.test(s)) return "review";
    scores.set(normal(item?.name),Number(s));
  }
  const a=scores.get(normal(leg.home_name));
  const b=scores.get(normal(leg.away_name));
  if(a===undefined||b===undefined||a===b) return "review";
  const winner=a>b?leg.home_name:leg.away_name;
  return normal(winner)===normal(leg.selection)?"won":"lost";
}
async function scoresFor(key:string){
  const {data:cache,error}=await admin!.from("hydrax_score_cache")
    .select("payload,fetched_at,remaining_quota").eq("provider_sport_key",key).maybeSingle();
  if(error) throw error;
  if(cache&&Date.now()-Date.parse(cache.fetched_at)<12*60*1000)
    return {events:cache.payload as Obj[],cached:true,remaining:cache.remaining_quota};
  const p=await provider("/sports/"+encodeURIComponent(key)+"/scores/?daysFrom=3");
  if(!Array.isArray(p.payload)) throw new Error("INVALID_SCORES_PAYLOAD");
  await admin!.from("hydrax_score_cache").upsert({
    provider_sport_key:key,payload:p.payload,fetched_at:new Date().toISOString(),
    remaining_quota:Number.isFinite(p.remaining)?p.remaining:null,
    last_cost:Number.isFinite(p.cost)?p.cost:null
  });
  return {events:p.payload as Obj[],cached:false,remaining:p.remaining};
}
async function synchronize(userId:string|null) {
  if(!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY_MISSING");
  let q=admin.from("hydrax_bet_legs").select("*")
    .in("status",["pending","review"]).order("starts_at",{ascending:true}).limit(250);
  if(userId) q=q.eq("user_id",userId);
  const {data:legs,error}=await q;
  if(error) throw error;
  if(!legs?.length) return {checked:0,updated_legs:0,settled_bets:0,review:0,waiting:0,quota_remaining:null};
  const ids=[...new Set(legs.map(l=>l.bet_id))];
  const {data:bets,error:be}=await admin.from("hydrax_bets")
    .select("id,status,user_id").in("id",ids).eq("status","pending");
  if(be) throw be;
  const active=new Set((bets||[]).map(b=>b.id));
  const now=Date.now();
  const eligible=legs.filter(l=>active.has(l.bet_id) && Date.parse(l.starts_at)<=now
      && l.status!=="won" && l.status!=="lost");
  const groups=new Map<string,Obj[]>();
  let review=0,waiting=0,checked=0,changed=0,quota:number|null=null;
  const affected=new Set<string>();
  for(const leg of eligible){
    const age=now-Date.parse(leg.starts_at);
    let reason:string|null=null;
    if(!SUPPORTED_SCORES.has(leg.provider_sport_key)) reason="NO_FINAL_SCORES_FOR_THIS_LEAGUE";
    else if(age>72*60*60*1000) reason="SCORES_OLDER_THAN_3_DAYS_REVIEW";
    if(reason){
      if(leg.status!=="review"||leg.reason!==reason){
        const {error:e}=await admin.from("hydrax_bet_legs").update({
          status:"review",reason,last_checked_at:new Date().toISOString()
        }).eq("id",leg.id).in("status",["pending","review"]);
        if(e)throw e;
      }
      review++; continue;
    }
    if(!groups.has(leg.provider_sport_key)) groups.set(leg.provider_sport_key,[]);
    groups.get(leg.provider_sport_key)!.push(leg);
  }
  const errors:string[]=[];
  for(const [key,items] of [...groups.entries()].slice(0,12)){
    let events:Obj[]=[];
    try {
      const res=await scoresFor(key);
      events=res.events;
      quota=Number.isFinite(res.remaining)?res.remaining:quota;
    } catch(e) {
      errors.push(key+":"+String(e instanceof Error?e.message:e));
      continue;
    }
    const byId=new Map(events.map(e=>[String(e.id),e]));
    for(const leg of items){
      const game=byId.get(leg.provider_event_id);
      if(!game){ waiting++; continue; }
      const result=outcome(game,leg);
      checked++;
      if(result==="pending"){waiting++;continue;}
      const newStatus=result==="review"?"review":result;
      const payload={
        status:newStatus,
        reason:result==="review"?"INCOMPLETE_OR_AMBIGUOUS_FINAL_SCORE":null,
        last_checked_at:new Date().toISOString(),
        source:"The Odds API",
        source_updated_at:game.last_update||null,
        settled_at:result==="review"?null:new Date().toISOString(),
        result_details:{
          provider_event_id:game.id,completed:game.completed,
          home_team:game.home_team,away_team:game.away_team,scores:game.scores
        }
      };
      const {error:ue}=await admin.from("hydrax_bet_legs").update(payload)
        .eq("id",leg.id).in("status",["pending","review"]);
      if(ue){errors.push("LEG_UPDATE_ERROR");continue;}
      if(result==="review") review++;
      else {changed++;affected.add(leg.bet_id);}
    }
  }
  let settled=0;
  if(affected.size){
    const {data:allLegs,error:ae}=await admin.from("hydrax_bet_legs")
      .select("bet_id,status").in("bet_id",[...affected]);
    if(ae)throw ae;
    for(const betId of affected){
      const own=(allLegs||[]).filter(l=>l.bet_id===betId);
      const status=own.some(l=>l.status==="lost")?"lost":
        own.length>0&&own.every(l=>l.status==="won")?"won":null;
      if(!status)continue;
      const {data:done,error:de}=await admin.from("hydrax_bets")
        .update({status,settled_at:new Date().toISOString(),
          settlement_source:"The Odds API",settlement_verified_at:new Date().toISOString()})
        .eq("id",betId).eq("status","pending").select("id").maybeSingle();
      if(de)errors.push("BET_UPDATE_ERROR");
      else if(done) settled++;
    }
  }
  return {checked,updated_legs:changed,settled_bets:settled,review,waiting,
    quota_remaining:quota,errors:errors.slice(0,12)};
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:JSON_HEADERS});
  if(req.method==="GET"){
    if(new URL(req.url).searchParams.get("check")==="logic"){
      const game={id:"unit-test-event",completed:true,home_team:"Home",away_team:"Away",
        scores:[{name:"Home",score:"105"},{name:"Away",score:"100"}]};
      const sample={home_name:"Home",away_name:"Away",selection:"Home"};
      const cases={
        won:outcome(game,sample)==="won",
        lost:outcome(game,{...sample,selection:"Away"})==="lost",
        pending:outcome({...game,completed:false},sample)==="pending",
        draw_review:outcome({...game,scores:[{name:"Home",score:"100"},{name:"Away",score:"100"}]},sample)==="review",
        mismatch_review:outcome({...game,home_team:"Wrong"},sample)==="review"
      };
      return json(Object.values(cases).every(Boolean)?200:500,{ok:Object.values(cases).every(Boolean),module:"HYDRAX LOGIC SMOKE",cases});
    }
    if(new URL(req.url).searchParams.get("check")==="provider"){
      try{const d=await provider("/sports/");return json(200,{ok:true,module:"HYDRAX AUTO SETTLEMENT v1",provider_verified:true,available_sports:Array.isArray(d.payload)?d.payload.length:null});}
      catch(e){return json(503,{ok:false,provider_verified:false,error:String(e instanceof Error?e.message:e)});}
    }
    return json(200,{ok:true,module:"HYDRAX AUTO SETTLEMENT v1",live:true,markets:["h2h"],api_configured:!!ODDS_KEY,background_job_supported:true});
  }
  if(req.method!=="POST")return json(405,{ok:false,error:"POST_REQUIRED"});
  if(!admin)return json(503,{ok:false,error:"SERVER_CONFIGURATION_MISSING"});
  let body:Obj;
  try {
    const raw=await req.text();
    if(raw.length>30000)return json(413,{ok:false,error:"BODY_TOO_LARGE"});
    body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body))throw Error();
  }catch{return json(400,{ok:false,error:"INVALID_JSON"});}
  const action=String(body.action||"");
  if(action==="sync_all"){
    const candidate=req.headers.get("x-hydrax-job-token")||"";
    if(candidate.length<40)return json(403,{ok:false,error:"JOB_UNAUTHORIZED"});
    const {data,error}=await admin.rpc("hydrax_validate_settlement_job",{p_token:candidate});
    if(error||data!==true)return json(403,{ok:false,error:"JOB_UNAUTHORIZED"});
    try{return json(200,{ok:true,mode:"scheduled",...(await synchronize(null))});}
    catch(e){return json(503,{ok:false,error:String(e instanceof Error?e.message:e)});}
  }
  const user=await verifiedUser(req);
  if(!user)return json(401,{ok:false,error:"SIGN_IN_REQUIRED"});
  try {
    if(action==="catalog") {
      const {payload}=await provider("/sports/?all=false");
      if(!Array.isArray(payload))throw new Error("INVALID_SPORTS_PAYLOAD");
      return json(200,{ok:true,sports:payload.filter(s=>matchSport(String(s.key))!==null)
        .map(s=>({key:s.key,title:s.title,sport:matchSport(s.key),auto_eligible:SUPPORTED_SCORES.has(s.key)}))});
    }
    if(action==="events") {
      const key=String(body.sport_key||"");
      if(!matchSport(key))return json(400,{ok:false,error:"SPORT_NOT_SUPPORTED"});
      const {payload}=await provider("/sports/"+encodeURIComponent(key)+"/events");
      if(!Array.isArray(payload))throw new Error("INVALID_EVENTS_PAYLOAD");
      return json(200,{ok:true,events:payload.slice(0,200)
        .filter(e=>typeof e.id==="string"&&typeof e.away_team==="string"&&typeof e.home_team==="string")
        .map(e=>({id:e.id,away_team:e.away_team,home_team:e.home_team,starts_at:e.commence_time})),
        auto_eligible:SUPPORTED_SCORES.has(key)});
    }
    if(action==="pending_untracked"){
      const {data:bets,error}=await admin.from("hydrax_bets")
        .select("id,event_name,selection,sport,bet_type,stake,status,placed_at")
        .eq("user_id",user.id).eq("status","pending").order("placed_at",{ascending:false}).limit(100);
      if(error)throw error;
      const ids=(bets||[]).map(b=>b.id);
      if(ids.length===0)return json(200,{ok:true,bets:[]});
      const {data:existing,error:ee}=await admin.from("hydrax_bet_legs")
        .select("bet_id").in("bet_id",ids);
      if(ee)throw ee;
      const has=new Set((existing||[]).map(l=>l.bet_id));
      return json(200,{ok:true,bets:(bets||[]).filter(b=>!has.has(b.id))});
    }
    if(action==="create"||action==="attach") return await createOrAttach(body,user,action==="attach");
    if(action==="list"){
      const {data:bets,error}=await admin.from("hydrax_bets").select("id,sport,event_name,selection,stake,american_odds,status,net_profit,settlement_source,settlement_verified_at,placed_at")
        .eq("user_id",user.id).order("placed_at",{ascending:false}).limit(100);
      if(error)throw error;
      const ids=(bets||[]).map(b=>b.id);
      if(!ids.length)return json(200,{ok:true,bets:[]});
      const {data:legs,error:le}=await admin.from("hydrax_bet_legs")
        .select("bet_id,leg_index,sport,event_name,selection,status,reason,source,source_updated_at,last_checked_at,starts_at")
        .in("bet_id",ids).order("leg_index",{ascending:true});
      if(le)throw le;
      return json(200,{ok:true,bets:(bets||[]).map(b=>({
        ...b,legs:(legs||[]).filter(l=>l.bet_id===b.id)
      }))});
    }
    if(action==="sync")return json(200,{ok:true,mode:"user",...(await synchronize(user.id))});
    return json(400,{ok:false,error:"INVALID_ACTION"});
  } catch(e) {
    return json(503,{ok:false,error:String(e instanceof Error?e.message:e)});
  }
});