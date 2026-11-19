/**
 * HYDRAX retrospective research-only test, with strict look-ahead prevention.
 * Runs in Node 22+. Reads only public completed game scoreboards.
 * Does not ingest historical sportsbook odds and cannot validate value/ROI.
 */
import { writeFileSync } from "node:fs";
const SPORT=(process.env.HYDRAX_SPORT||"NBA").toUpperCase();
const PATHS={NBA:"basketball/nba",NCAAB:"basketball/mens-college-basketball",NFL:"football/nfl",NCAAF:"football/college-football",MLB:"baseball/mlb"};
if(!PATHS[SPORT]){console.error("BACKTEST_UNAVAILABLE_FOR_SPORT:"+SPORT);process.exit(2)}
const DAY_MS=86400000;
const now=new Date();
const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-1));
const start=SPORT==="MLB" && now.getUTCMonth()>=10?new Date(Date.UTC(now.getUTCFullYear(),8,1)):new Date(end.getTime()-68*DAY_MS);
const dateStr=d=>d.toISOString().slice(0,10).replaceAll("-","");
function dates(a,b){const result=[];for(let t=a.getTime();t<=b.getTime();t+=DAY_MS)result.push(dateStr(new Date(t)));return result}
const days=dates(start,end),url=d=>"https://site.api.espn.com/apis/site/v2/sports/"+PATHS[SPORT]+"/scoreboard?dates="+d+"&limit=500";
async function load(d){
 try{
  const response=await fetch(url(d),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
  if(!response.ok)return {day:d,error:"HTTP_"+response.status,games:[]};
  const j=await response.json();
  return {day:d,games:(Array.isArray(j.events)?j.events:[]).map(ev=>{
   const comp=ev.competitions?.[0],home=comp?.competitors?.find(x=>x.homeAway==="home"),away=comp?.competitors?.find(x=>x.homeAway==="away");
   const hs=Number(typeof home?.score==="object"?home.score?.value:home?.score);
   const as=Number(typeof away?.score==="object"?away.score?.value:away?.score);
   const dt=Date.parse(ev.date);
   if(!ev.status?.type?.completed || !home?.team?.id || !away?.team?.id || !Number.isFinite(hs)||!Number.isFinite(as)||!Number.isFinite(dt))return null;
   return {id:String(ev.id),date:dt,h:String(home.team.id),a:String(away.team.id),hs,as};
  }).filter(Boolean)};
 }catch(e){return {day:d,error:e instanceof Error?e.message:String(e),games:[]}}
}
async function pool(values,n,fn){const out=new Array(values.length);let pos=0;await Promise.all(Array.from({length:n},async()=>{while(pos<values.length){const i=pos++;out[i]=await fn(values[i])}}));return out}
const responses=await pool(days,4,load);
const games=[...new Map(responses.flatMap(x=>x.games).map(x=>[x.id,x])).values()].sort((a,b)=>a.date-b.date);
const errors=responses.filter(x=>x.error).map(x=>({day:x.day,error:x.error}));
const params={MLB:{sd:4,hfa:0.25},NBA:{sd:16,hfa:2},NCAAB:{sd:16,hfa:2},NFL:{sd:15,hfa:1.5},NCAAF:{sd:15,hfa:1.5}}[SPORT];
function erf(x){const sign=Math.sign(x),v=Math.abs(x),t=1/(1+0.3275911*v),p=1-((((((1.061405429*t)-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-v*v));return sign*p}
const normalCDF=x=>Math.max(.001,Math.min(.999,.5*(1+erf(x/Math.SQRT2))));
const form=(home,away)=>{
 const h=home.reduce((v,x)=>v+x,0)/home.length,a=away.reduce((v,x)=>v+x,0)/away.length;
 const k=Math.min(home.length,away.length),mu=(h-a)*k/(k+5)+params.hfa;
 return normalCDF(mu/params.sd)
};
const seen=new Map(),predictions=[];
for(const g of games){
 const hh=seen.get(g.h)||[],aa=seen.get(g.a)||[];
 if(hh.length>=5&&aa.length>=5){
  const p=form(hh.slice(-8),aa.slice(-8));
  predictions.push({p,result:g.hs>g.as?1:0,date:new Date(g.date).toISOString().slice(0,10)})
 }
 seen.set(g.h,[...hh,g.hs-g.as].slice(-8));
 seen.set(g.a,[...aa,g.as-g.hs].slice(-8));
}
const n=predictions.length;
const brier=n?predictions.reduce((s,x)=>s+(x.p-x.result)**2,0)/n:null;
const baseBrier=n?predictions.reduce((s,x)=>s+(.5-x.result)**2,0)/n:null;
const bins=[0,0,0,0,0].map((_,i)=>{
 const a=predictions.filter(x=>Math.min(4,Math.floor(x.p*5))===i);
 return {lower:i/5,upper:(i+1)/5,n:a.length,avgPred:a.length?a.reduce((s,x)=>s+x.p,0)/a.length:null,actual:a.length?a.reduce((s,x)=>s+x.result,0)/a.length:null};
});
const calibrationError=n?bins.reduce((s,b)=>s+(b.n/n)*Math.abs((b.avgPred??0)-(b.actual??0)),0):null;
const result={
 product:"HYDRAX – Sports Intelligence by JD",sport:SPORT,computedAt:new Date().toISOString(),
 source:"ESPN unofficial completed game scoreboards",period:{from:dateStr(start),through:dateStr(end)},
 eventsFetched:games.length,daysAttempted:days.length,failedDays:errors.length,
 evaluated:n,minimumRequired:100,
 brierScore:brier,baselineBrier:baseBrier,calibrationError,
 calibrated:false,validatedValue:false,backtestStatus:n<100?"INSUFFICIENT_SAMPLE":"RESEARCH_BACKTEST_ONLY",
 constraints:["No historical pre-match sportsbook prices","No verified injuries or lineups","Recent score-margin heuristic only","No ROI/yield or wagering validation","Look-ahead excluded: each prediction uses only earlier completed games"],
 calibrationBins:bins,sourceErrors:errors.slice(0,8),stakingAllowed:false
};
writeFileSync(process.env.HYDRAX_REPORT||"hydrax-backtest-report.json",JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
