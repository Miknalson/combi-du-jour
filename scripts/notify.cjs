'use strict';
// Alerts contain public snapshots only. No Winamax account or betting endpoint.
const fs=require('node:fs'),path=require('node:path'),A=require('../alerts-engine.cjs');
const root=path.resolve(__dirname,'..'),statusFile=path.join(root,'data/notification-status.json');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8'));}catch(e){return fallback;}}
function saveStatus(value){fs.writeFileSync(statusFile,JSON.stringify({...value,updatedAt:new Date().toISOString()},null,2)+'\n');}
async function main(){
 const topic=process.env.NTFY_TOPIC;
 if(!topic){saveStatus({status:'unconfigured',topicConfigured:false,message:'Notifications automatiques non configurées : ajouter le secret GitHub NTFY_TOPIC.'});console.log('Notifications non configurées : ajouter le secret NTFY_TOPIC.');return;}
 if(!/^[a-zA-Z0-9_-]{32,64}$/.test(topic))throw Error('invalid_topic');
 const stateFile=path.join(root,'data/notification-state.json'),journal=read('paper-tests-v2.json',{records:[]}),extra=read('tres-sur-tests.json',{records:[]}),state=read('notification-state.json',{sent:[],dailyReports:[]}),sent=new Set(state.sent||[]),reports=new Set(state.dailyReports||[]),now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 let count=0;
 async function send(payload){const response=await fetch('https://ntfy.sh/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('send_failed');}
 function persist(){state.updatedAt=new Date().toISOString();fs.writeFileSync(stateFile,JSON.stringify({...state,sent:[...sent],dailyReports:[...reports]},null,2)+'\n');}
 const eligible=journal.records.concat(extra.records||[]).filter(r=>A.eligible(r,now));
 for(const r of eligible){if(sent.has(r.id))continue;await send(A.payload(r,topic));sent.add(r.id);persist();count++;}
 let digest=false;
 if(!eligible.length&&!reports.has(day)){
  const health=read('collection-health.json',null),noPick=journal.records.filter(r=>r.day===day&&r.status==='no_pick').length;
  const detail=health&&health.message?health.message:'Aucun ticket ne dispose actuellement de cotes assez récentes pour une alerte.';
  await send({topic,title:'Combiné du Jour · bilan de collecte',message:'Aucun nouveau ticket à notifier pour cette collecte. '+detail+(noPick?' '+noPick+' catégorie(s) sans ticket admissible.':'')+' Aucun pari placé.',click:A.SITE+'notifications.html#deliveryStatus'});
  reports.add(day);persist();digest=true;
 }
 saveStatus({status:count?'sent':digest?'daily_report_sent':eligible.length?'up_to_date':'waiting_for_ticket',topicConfigured:true,sentNow:count,dailyReportSent:digest,eligible:eligible.length,lastSentAt:state.updatedAt||null,message:count?count+' alerte(s) acceptée(s) par ntfy.':digest?'Bilan de collecte accepté par ntfy. Aucun ticket admissible et récent à notifier.':eligible.length?'Les tickets admissibles ont déjà été notifiés.':'Aucun nouveau ticket admissible avec des cotes de moins d’une heure. Le bilan quotidien a déjà été envoyé.'});
 console.log(count+' alerte(s) de ticket, bilan quotidien : '+(digest?'envoyé':'aucun nouvel envoi')+'. Aucun ordre de pari.');
}
main().catch(()=>{saveStatus({status:'failed',topicConfigured:!!process.env.NTFY_TOPIC,message:'L’envoi à ntfy a échoué. Vérifier le canal et la connexion du service dans GitHub Actions.'});console.error('Échec de notification ; les canaux privés et les réponses du service ne sont pas journalisés.');process.exitCode=1;});
