
const ORIGIN="*";
const H={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store"};
const PROJECT=Deno.env.get("SUPABASE_URL")||"https://acpwxupqpbyesbhuixkq.supabase.co";
const PUBLIC_KEY="sb_publishable_9MEM0vRtaqMMaTIewFH1NA_b4AG0OH7";
const ODDS_KEY=Deno.env.get("THE_ODDS_API_KEY")||"";
const SPORTS:Record<string,string>={UFC:"mma_mixed_martial_arts",NBA:"basketball_nba",NFL:"americanfootball_nfl",MLB:"baseball_mlb",NCAAB:"basketball_ncaab",NCAAF:"americanfootball_ncaaf"};
const ALL=new Set(["UFC","ATP","WTA","NBA","NFL","MLB","NCAAB","NCAAF"]);
const respond=(v:unknown,s=200)=>Response.json(v,{status:s,headers:H});
const implied=(o:number)=>o>0?100/(100+o):Math.abs(o)/(100+Math.abs(o));
const decimal=(o:number)=>o>0?1+o/100:1+100/Math.abs(o);
const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isInteger(v)&&(v>=100||v<=-100);
const rnd=(v:number)=>Number(v.toFixed(2));
function mc(p:number,n=10000){let wins=0;for(let i=0;i<n;i++)wins+=Math.random()<p?1:0;return wins/n}
function todayPR(s:string){const d=new Date(s);const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Puerto_Rico",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day}
async function fetchOdds(sport:string){const url=new URL("https://api.the-odds-api.com/v4/sports/"+encodeURIComponent(sport)+"/odds");url.searchParams.set("regions","us");url.searchParams.set("markets","h2h");url.searchParams.set("oddsFormat","american");const r=await fetch(url,{headers:{"x-api-key":ODDS_KEY},signal:AbortSignal.timeout(15000)});const payload=await r.json();if(!r.ok)throw Error("ODDS_HTTP_"+r.status);return Array.isArray(payload)?payload:[]}
function analyze(events:any[],sport:string){
 const result:any[]=[];
 for(const e of events){
  if(!e?.commence_time||!Number.isFinite(Date.parse(e.commence_time))||Date.parse(e.commence_time)<=Date.now()||todayPR(e.commence_time)!==todayPR(new Date().toISOString()))continue;
  const books=(Array.isArray(e.bookmakers)?e.bookmakers:[]).map((book:any)=>{
   const market=book?.markets?.find((m:any)=>m.key==="h2h");
   if(!market||!Array.isArray(market.outcomes)||market.outcomes.length<2)return null;
   const t=Date.parse(market.last_update||book.last_update||"");
   if(!Number.isFinite(t)||Date.now()-t>30*60000||t>Date.now()+120000)return null;
   const odds=market.outcomes;if(!odds.every((x:any)=>typeof x.name==="string"&&valid(x.price)))return null;
   if(new Set(odds.map((x:any)=>x.name)).size!==odds.length)return null;
   const total=odds.reduce((sum:number,x:any)=>sum+implied(x.price),0);
   if(total<.99||total>1.45)return null;
   return {book:book.title||book.key,prices:Object.fromEntries(odds.map((x:any)=>[x.name,{odds:x.price,p:implied(x.price)/total}]))};
  }).filter(Boolean);
  for(const target of books){
   const names=Object.keys(target.prices).sort();
   const peers=books.filter((b:any)=>b!==target&&JSON.stringify(Object.keys(b.prices).sort())===JSON.stringify(names));
   if(peers.length<2)continue;
   for(const name of names){
    const vals=peers.map((b:any)=>b.prices[name].p).sort((a:number,b:number)=>a-b);
    const p=vals.length%2?vals[(vals.length-1)/2]:(vals[vals.length/2-1]+vals[vals.length/2])/2;
    const odds=target.prices[name].odds;
    const ev=(p*decimal(odds)-1)*100;
    if(!Number.isFinite(ev)||ev<=0)continue;
    const spread=Math.max(...vals)-Math.min(...vals);
    result.push({sport,event:[e.away_team,e.home_team].filter(Boolean).join(" vs "),selection:name,bookmaker:target.book,odds,probabilityPercent:rnd(100*p),simulatedPercent:rnd(mc(p)*100),evPercent:rnd(ev),risk:spread>.08?"ALTO":spread>.04?"MEDIO":"DISPERSIÓN BAJA",startsAt:e.commence_time});
   }
  }
 }
 return result.sort((a,b)=>b.evPercent-a.evPercent).slice(0,5);
}


const MODEL_VERSION="HYDRAX_INDEPENDENT_FORM_V1";
const ESPN:Record<string,string>={NBA:"basketball/nba",NCAAB:"basketball/mens-college-basketball",NFL:"football/nfl",NCAAF:"football/college-football",MLB:"baseball/mlb"};
function norm(s:string){return String(s||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9 ]/g," ").replace(/\b(university|college|the|of|at)\b/g," ").replace(/\s+/g," ").trim()}
function similar(a:string,b:string){
 const x=norm(a),y=norm(b);if(x===y)return 1;
 const tx=x.split(" ").filter(w=>w.length>1),ty=y.split(" ").filter(w=>w.length>1);
 if(!tx.length||!ty.length)return 0;
 const intersect=tx.filter(w=>ty.includes(w)).length;
 if(intersect<2)return 0;
 return (2*intersect)/(tx.length+ty.length);
}
async function jsonFetch(url:string){
 let lastError="UNKNOWN";
 for(let attempt=0;attempt<2;attempt++){
  try{
   const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"HYDRAX/1.0"},signal:AbortSignal.timeout(6500)});
   if(r.ok)return await r.json();
   lastError="HTTP_"+r.status;
   if(r.status===403||r.status===404)break;
  }catch(e){lastError=e instanceof Error?e.name+":"+e.message:String(e)}
 }
 throw Error("STATS_SOURCE_"+lastError);
}
function extractTeams(scoreboard:any){
 const teams:any[]=[];
 for(const event of (Array.isArray(scoreboard?.events)?scoreboard.events:[]))for(const competition of (event.competitions||[]))for(const comp of (competition.competitors||[])){
  if(comp.team?.id)teams.push({id:String(comp.team.id),displayName:comp.team.displayName||"",shortDisplayName:comp.team.shortDisplayName||"",name:comp.team.name||""});
 }
 return teams;
}
async function discoverTeams(base:string,date:string){
 const attempts=[base+"/scoreboard?dates="+date+"&limit=500",base+"/teams?limit=500"];
 const errors:string[]=[];
 for(const url of attempts){
  try{
   const response=await jsonFetch(url);
   let teams=extractTeams(response);
   if(!teams.length){
    const groups=response?.sports?.[0]?.leagues?.[0]?.teams || [];
    teams=(Array.isArray(groups)?groups:[]).map((v:any)=>v.team||v).filter((v:any)=>v.id).map((t:any)=>({id:String(t.id),displayName:t.displayName||"",shortDisplayName:t.shortDisplayName||"",name:t.name||""}));
   }
   if(teams.length)return {teams,source:url.includes("/scoreboard")?"SCOREBOARD":"TEAMS_INDEX"};
   errors.push("EMPTY_TEAMS_"+(url.includes("/scoreboard")?"SCOREBOARD":"TEAMS_INDEX"));
  }catch(e){errors.push((url.includes("/scoreboard")?"SCOREBOARD":"TEAMS_INDEX")+":"+(e instanceof Error?e.message:String(e)))}
 }
 throw Error(errors.join("|").slice(0,200));
}
function matchTeam(name:string,teams:any[]){
 const ranked=teams.map((t:any)=>({...t,sim:Math.max(similar(name,t.displayName),similar(name,t.shortDisplayName),similar(name,t.name))})).sort((a:any,b:any)=>b.sim-a.sim);
 return ranked[0]?.sim>=.78 && (!ranked[1]||ranked[0].sim-ranked[1].sim>.08)?ranked[0]:null;
}
function history(events:any[],teamId:string){
 const result:{margin:number,date:number}[]=[];
 for(const event of events){
   const c=event?.competitions?.[0];
   if(!c || event?.status?.type?.completed!==true)continue;
   const team=c.competitors?.find((x:any)=>String(x.id||x.team?.id)===teamId);
   const opp=c.competitors?.find((x:any)=>String(x.id||x.team?.id)!==teamId);
   if(!team||!opp)continue;
   const a=Number(typeof team.score==="object"?team.score?.value:team.score);
   const b=Number(typeof opp.score==="object"?opp.score?.value:opp.score);
   const date=Date.parse(event.date);
   if(Number.isFinite(a)&&Number.isFinite(b)&&Number.isFinite(date)&&date<Date.now())result.push({margin:a-b,date});
 }
 return result.sort((a,b)=>b.date-a.date).slice(0,8);
}
function formModel(home:{margin:number,date:number}[],away:{margin:number,date:number}[],sport:string){
 const sd=sport==="MLB"?4:sport==="NFL"||sport==="NCAAF"?15:16;
 const hfa=sport==="MLB"?0.25:sport==="NFL"||sport==="NCAAF"?1.5:2;
 const h=home.reduce((s,g)=>s+g.margin,0)/home.length;
 const a=away.reduce((s,g)=>s+g.margin,0)/away.length;
 const shrink=Math.min(home.length,away.length)/ (Math.min(home.length,away.length)+5);
 const expected=(h-a)*shrink+hfa;
 const iterations=10000;let hw=0;
 for(let i=0;i<iterations;i++){
   // Box-Muller draws sport-specific outcome uncertainty independent of sportsbook prices.
   const z=Math.sqrt(-2*Math.log(Math.max(1e-9,Math.random())))*Math.cos(2*Math.PI*Math.random());
   if(expected+sd*z>0)hw++;
 }
 return {homeProbability:hw/iterations,awayProbability:1-hw/iterations,expectedMargin:Number(expected.toFixed(2)),iterations,homeGames:home.length,awayGames:away.length,assumedStdDev:sd,statistic:"RECENT_COMPLETED_GAME_SCORE_MARGIN",modelVersion:MODEL_VERSION,calibrated:false,validated:false};
}

async function attachIndependent(picks:any[],sport:string){
 if(!ESPN[sport])return picks.map((p:any)=>({...p,independentModel:{status:"NO_INDEPENDENT_DATA",reason:"NO_VERIFIED_SPORT_SPECIFIC_HISTORY",decision:"NO_BET"}}));
 if(!picks.length)return [];
 const base="https://site.api.espn.com/apis/site/v2/sports/"+ESPN[sport];
 let teams:any[]=[],lookupSource="UNKNOWN";
 try{
   const discovered=await discoverTeams(base,todayPR(new Date().toISOString()).replaceAll("-",""));
   teams=discovered.teams;lookupSource=discovered.source;
 }catch(e){
   const detail=e instanceof Error?e.message:String(e);
   console.warn("HYDRAX_STATS_SOURCE_ERROR",sport,detail);
   return picks.map((pick:any)=>({...pick,independentModel:{status:"DATA_UNAVAILABLE",reason:"SPORTS_STATS_SOURCE_UNAVAILABLE",sourceError:detail,decision:"NO_BET"}}));
 }
 const histories=new Map<string,Promise<{margin:number,date:number}[]>>();
 const getHistory=(id:string)=>{
  if(!histories.has(id))histories.set(id,(async()=>{
   const response=await jsonFetch(base+"/teams/"+encodeURIComponent(id)+"/schedule?limit=60");
   return history(Array.isArray(response?.events)?response.events:[],id);
  })());
  return histories.get(id)!;
 };
 return await Promise.all(picks.map(async(pick:any)=>{
   const sides=String(pick.event||"").split(" vs ");
   const away=matchTeam(sides[0]||"",teams),home=matchTeam(sides[1]||"",teams);
   if(!away||!home||away.id===home.id)return {...pick,independentModel:{status:"UNMATCHED_TEAMS",reason:"TEAM_MATCH_NOT_VERIFIED",decision:"NO_BET"}};
   try{
     const [h,a]=await Promise.all([getHistory(home.id),getHistory(away.id)]);
     if(h.length<5||a.length<5)return {...pick,independentModel:{status:"INSUFFICIENT_HISTORY",homeGames:h.length,awayGames:a.length,decision:"NO_BET"}};
     const m=formModel(h,a,sport);
     const s=String(pick.selection||home.displayName);
     const sh=similar(s,home.displayName),sa=similar(s,away.displayName);
     if(Math.max(sh,sa)<.78)return {...pick,independentModel:{status:"UNMATCHED_SELECTION",reason:"SELECTION_NOT_VERIFIED",decision:"NO_BET"}};
     const probability=sh>sa?m.homeProbability:m.awayProbability;
     const odds=Number(pick.odds);
     const ev=valid(odds)?rnd((probability*decimal(odds)-1)*100):null;
     return {...pick,independentModel:{...m,status:"RESEARCH_ESTIMATE",probabilityPercent:rnd(probability*100),expectedValuePercent:ev,homeTeam:home.displayName,awayTeam:away.displayName,
      source:"ESPN team schedule (completed games)",statsDiscoverySource:lookupSource,decision:"NO_BET",reason:"UNVALIDATED_FORM_MODEL;INJURY_AND_LINEUP_NOT_ADJUSTED"}};
   }catch(e){
     return {...pick,independentModel:{status:"DATA_UNAVAILABLE",reason:"TEAM_HISTORY_FETCH_FAILED",sourceError:e instanceof Error?e.message:String(e),decision:"NO_BET"}};
   }
 }));
}
function previewEnrichmentInput(p:any){
 const sides=String(p.event||"").split(" vs ");
 const selection=sides[1]||sides[0]||"";
 const odds=Array.isArray(p.bestPrices)?p.bestPrices.find((x:any)=>norm(x.team)===norm(selection))?.odds:null;
 return {...p,selection,odds};
}
async function enrichPreviewBatch(previews:any[],sport:string){
 if(!previews.length)return previews;
 const enriched=await attachIndependent(previews.map(previewEnrichmentInput),sport);
 return enriched.map((e:any)=>({...e,independentModel:e.independentModel||{status:"NO_INDEPENDENT_DATA",decision:"NO_BET"},
   readiness:{hasScheduledEvent:true,verifiedStats:e.independentModel?.status==="RESEARCH_ESTIMATE",
    modelCalibrated:false,injuriesConfirmed:false,lineupsConfirmed:false,
    dataQuality:e.independentModel?.status==="RESEARCH_ESTIMATE"?"FORM_EXPERIMENTAL":"UNVERIFIED",
    decision:"NO_BET"}}));
}
async function availabilityReport(sport:string){
 const source=ESPN[sport]?"ESPN_INJURIES":"NO_VERIFIED_INJURY_FEED";
 const base=ESPN[sport]?"https://site.api.espn.com/apis/site/v2/sports/"+ESPN[sport]+"/injuries":null;
 if(!base)return {source,status:"UNAVAILABLE",checkedAt:new Date().toISOString(),injuriesVerified:false,lineupsVerified:false,reason:"NO_STRUCTURED_PROVIDER"};
 try{
   const result=await jsonFetch(base);
   const count=Array.isArray(result?.injuries)?result.injuries.length:Array.isArray(result?.items)?result.items.length:null;
   return {source,status:count===null?"SCHEMA_UNVERIFIED":"RESPONSE_RECEIVED",checkedAt:new Date().toISOString(),
     reportedEntries:count,injuriesVerified:false,lineupsVerified:false,reason:"TEAM_PLAYER_MATCH_NOT_CONFIRMED; NO_PREMATCH_LINEUP_VALIDATION"};
 }catch(e){
   return {source,status:"DATA_UNAVAILABLE",checkedAt:new Date().toISOString(),injuriesVerified:false,lineupsVerified:false,
     reason:e instanceof Error?e.message:String(e)};
 }
}
function modelAudit(){
 return {status:"NOT_VALIDATED",backtestN:0,brierScore:null,calibrationError:null,roi:null,yield:null,
   reason:"No point-in-time pregame statistical history and sportsbook odds available for leakage-free holdout evaluation.",
   actionability:"RESEARCH_ONLY",stakingAllowed:false};
}

const SR=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const TABLE=PROJECT+"/rest/v1/hydrax_market_cache";
const TTL_MS=2*60*60*1000;
const MODEL_CACHE_VERSION=6;
const LIMIT_PER_SPORT_DAY=4;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store"};
const output=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
async function cached(sport:string){
 const r=await fetch(TABLE+"?sport=eq."+encodeURIComponent(sport)+"&select=sport,payload,updated_at,quota_date,refresh_count",{headers:{apikey:SR,Authorization:"Bearer "+SR},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error("CACHE_READ_HTTP_"+r.status);
 const x=await r.json();return Array.isArray(x)?x[0]||null:null;
}
async function store(sport:string,payload:unknown,count:number,day:string){
 const r=await fetch(TABLE,{method:"POST",headers:{apikey:SR,Authorization:"Bearer "+SR,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({sport,payload,updated_at:new Date().toISOString(),quota_date:day,refresh_count:count}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error("CACHE_WRITE_HTTP_"+r.status);
}


function eventPreview(e:any,sport:string){
 const books=(Array.isArray(e.bookmakers)?e.bookmakers:[]).map((b:any)=>{
  const market=b.markets?.find((x:any)=>x.key==="h2h");
  const outs=Array.isArray(market?.outcomes)?market.outcomes:[];
  const t=Date.parse(market?.last_update||b.last_update||"");
  return {name:b.title||b.key,updatedAt:Number.isFinite(t)?new Date(t).toISOString():null,
   ageMinutes:Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null,
   outcomes:outs.filter((x:any)=>typeof x.name==="string"&&valid(x.price)).map((x:any)=>({team:x.name,odds:x.price}))};
 }).filter((b:any)=>b.outcomes.length>=2);
 const recent=books.filter((b:any)=>b.ageMinutes!==null&&b.ageMinutes<=30);
 const best=new Map<string,any>();
 for(const book of recent){
   for(const quote of book.outcomes){
     const key=norm(quote.team),old=best.get(key);
     if(!old||decimal(quote.odds)>decimal(old.odds))best.set(key,{...quote,bookmaker:book.name,updatedAt:book.updatedAt});
   }
 }
 const selected=Array.from(best.values()).slice(0,3);
 return {sport,id:String(e.id||""),event:[e.away_team,e.home_team].filter(Boolean).join(" vs "),
  startsAt:e.commence_time,bookmakerCount:books.length,recentBookmakerCount:recent.length,
  status:recent.length>=3?"MARKET_DATA_AVAILABLE":"INSUFFICIENT_FRESH_ODDS",
  bestPrices:selected,latestBookmakerUpdate:recent.map((x:any)=>x.updatedAt).filter(Boolean).sort().at(-1)||null,
  decision:"NO_BET"};
}
async function generate(sport:string){
 let keys:string[]=[];
 if(sport==="ATP"||sport==="WTA"){
   const r=await fetch("https://api.the-odds-api.com/v4/sports/",{headers:{"x-api-key":ODDS_KEY},signal:AbortSignal.timeout(9500)});
   if(!r.ok)throw Error("SPORTS_DISCOVERY_HTTP_"+r.status);
   const list=await r.json();
   keys=(Array.isArray(list)?list:[]).filter((x:any)=>x.active&&typeof x.key==="string"&&x.key.startsWith("tennis_")&&String(x.title||x.key).toUpperCase().includes(sport)).slice(0,3).map((x:any)=>x.key);
 }else keys=[SPORTS[sport]];
 const events:any[]=[],failures:string[]=[];
 for(const key of keys){try{events.push(...await fetchOdds(key))}catch(e){failures.push(key+":"+(e instanceof Error?e.message:String(e)))}}
 const day=todayPR(new Date().toISOString());
 const today=events.filter((e:any)=>Number.isFinite(Date.parse(e.commence_time||""))&&Date.parse(e.commence_time)>Date.now()&&todayPR(e.commence_time)===day);
 const previews=today.slice(0,5).map((e:any)=>eventPreview(e,sport));
 const candidates=analyze(events,sport);
 const [explained,valued,availability]=await Promise.all([
  enrichPreviewBatch(previews,sport),
  attachIndependent(candidates,sport),
  availabilityReport(sport)
 ]);
 // Research-only, not actionable; never equate market disparity with validated positive EV.
 return {ok:true,sport,eventsCount:today.length,providerEventsCount:events.length,events:explained,eventsTruncated:today.length>5,
  picks:valued.map((x:any)=>({...x,decision:"NO_BET",validatedValue:false})),
  predictionType:"SPORT_SPECIFIC_RESEARCH_ONLY",modelVersion:MODEL_VERSION,modelCacheVersion:MODEL_CACHE_VERSION,monteCarloIterations:10000,
  modelValidation:modelAudit(),playerAvailability:availability,sourceQuality:{market:"THE_ODDS_API",statistics:ESPN[sport]?"ESPN_UNOFFICIAL_JSON":"NOT_CONFIGURED",
   dataTimestamp:new Date().toISOString(),sportsbooksQueried:today.reduce((n:number,e:any)=>n+(Array.isArray(e.bookmakers)?e.bookmakers.length:0),0),oddsFreshnessPolicyMinutes:30},
  retrievedAt:new Date().toISOString(),message:today.length?"Se analizaron encuentros. Todos siguen NO BET hasta validar el modelo.":"No hay eventos futuros hoy, hora de Puerto Rico.",
  warning:failures.join("; ")||"Predicciones experimentales; sin verificación de lesiones y alineaciones, ni resultados históricos suficientes para calibración."};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method==="GET")return output({ok:true,service:"HYDRAX_PUBLIC_INTELLIGENCE",authRequired:false,personalDataExposed:false,cacheTTLMinutes:120,refreshLimitPerSportPerDay:LIMIT_PER_SPORT_DAY,modelVersion:MODEL_VERSION,modelAudit:modelAudit()});
 if(req.method!=="POST")return output({error:"METHOD_NOT_ALLOWED"},405);
 try{
   const input=await req.json();
   const sport=String(input?.sport||"").toUpperCase();
   if(!ALL.has(sport))return output({error:"INVALID_SPORT"},400);
   if(!SR)return output({error:"CACHE_AUTH_UNAVAILABLE"},503);
   if(!ODDS_KEY)return output({error:"ODDS_PROVIDER_NOT_CONFIGURED"},503);
   const day=todayPR(new Date().toISOString());
   const existing=await cached(sport);
   const payload=existing?.payload;
   const hasPayload=payload?.ok===true && payload?.modelCacheVersion===MODEL_CACHE_VERSION;
   const sameDay=existing?.quota_date===day;
   const age=existing?.updated_at?Date.now()-Date.parse(existing.updated_at):Number.POSITIVE_INFINITY;
   if(hasPayload&&(age<TTL_MS || (sameDay&&existing.refresh_count>=LIMIT_PER_SPORT_DAY))){
     return output({...payload,fromCache:true,cacheUpdatedAt:existing.updated_at,warning:[payload.warning,age>=TTL_MS?"Límite diario de refrescos alcanzado; precios pueden estar desactualizados":""].filter(Boolean).join("; ")});
   }

   // Upgrade cached sportsbook observations without spending another Odds API request.
   if(payload?.ok===true&&Number(payload?.modelCacheVersion)>=3 && Number(payload?.modelCacheVersion)<MODEL_CACHE_VERSION
     && Array.isArray(payload.events) && Array.isArray(payload.picks)){
      const [events,picks,availability]=await Promise.all([
       enrichPreviewBatch(payload.events.slice(0,5),sport),
       attachIndependent(payload.picks.slice(0,5),sport),
       availabilityReport(sport)
      ]);
      const refreshed={...payload,events,picks:picks.map((x:any)=>({...x,decision:"NO_BET",validatedValue:false})),
       modelCacheVersion:MODEL_CACHE_VERSION,modelVersion:MODEL_VERSION,predictionType:"SPORT_SPECIFIC_RESEARCH_ONLY",
       modelValidation:modelAudit(),playerAvailability:availability,
       sourceQuality:{market:"THE_ODDS_API",statistics:ESPN[sport]?"ESPN_UNOFFICIAL_JSON":"NOT_CONFIGURED",
       dataTimestamp:payload.retrievedAt,oddsFreshnessPolicyMinutes:30},
       warning:"Datos del mercado reutilizados desde caché; estimaciones experimentales, NO BET hasta validación."};
      const sameCount=sameDay?Number(existing.refresh_count||0):0;
      await store(sport,refreshed,sameCount,day);
      return output({...refreshed,fromCache:true,cacheUpdatedAt:new Date().toISOString()});
   }
   const count=sameDay?Number(existing.refresh_count||0):0;
   if(count>=LIMIT_PER_SPORT_DAY)return output({ok:false,error:"DAILY_SOURCE_LIMIT",message:"Se agotó el límite diario de consultas gratuitas."},429);
   // Reserve a daily quota slot before calling the provider.
   await store(sport,hasPayload?payload:{ok:false},count+1,day);
   try{
     const data=await generate(sport);
     await store(sport,data,count+1,day);
     return output({...data,fromCache:false});
   }catch(e){
     if(hasPayload)return output({...payload,fromCache:true,warning:"Proveedor temporalmente no disponible; respuesta anterior. "+(e instanceof Error?e.message:"Error")});
     return output({error:"DATA_SOURCE_FAILED",detail:e instanceof Error?e.message:String(e)},502);
   }
 }catch(e){return output({error:"HYDRAX_PUBLIC_ERROR",detail:e instanceof Error?e.message:String(e)},500)}
});
