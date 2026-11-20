import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.0";
const target=document.getElementById("autoSyncStatus");
const base="https://acpwxupqpbyesbhuixkq.supabase.co";
const url=localStorage.getItem("hydrax_url")||base;
const key=localStorage.getItem("hydrax_key")||"sb_publishable_9MEM0vRtaqMMaTIewFH1NA_b4AG0OH7";
if(url.replace(/\/+$/,"")===base){
 const sb=createClient(url,key);
 let working=false,lastChecked=0;
 async function check(){
  if(working||document.visibilityState!=="visible"||Date.now()-lastChecked<10*60*1000)return;
  working=true;lastChecked=Date.now();
  try{
   const {data:{session}}=await sb.auth.getSession();
   if(!session){if(target)target.textContent="Inicia sesión para activar la verificación.";return}
   if(target)target.textContent="Comprobando resultados finales...";
   const {data,error}=await sb.functions.invoke("hydrax-auto-settlement",{body:{action:"sync"}});
   if(error)throw error;
   if(!data?.ok)throw Error(data?.error||"SYNC_FAILED");
   if(target)target.textContent="Comprobado "+new Date().toLocaleTimeString("es-PR")+
    " · "+data.settled_bets+" apuestas liquidadas · "+data.review+" en revisión";
   if(data.settled_bets>0)location.reload();
  }catch(e){if(target)target.textContent="Verificación no disponible: "+String(e?.message||e)}
  finally{working=false}
 }
 setTimeout(check,1500);
 setInterval(check,60*1000);
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check()});
}