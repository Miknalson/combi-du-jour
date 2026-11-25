'use strict';
const WINAMAX='https://www.winamax.fr/paris-sportifs',SITE='https://miknalson.github.io/combi-du-jour/';
function eligible(r,now){return r&&r.mode==='paper'&&r.status==='pending'&&['safe','algo','tres_sur'].includes(r.method)&&Array.isArray(r.legs)&&r.legs.length>0&&r.legs.every(l=>l.bookKey==='winamax_fr'&&!l.est&&l.quoteSource==='api'&&Date.parse(l.kickoff)>now&&now-Date.parse(l.asOf)>=0&&now-Date.parse(l.asOf)<=3600000);}
function payload(r,topic){const url=r.method==='tres_sur'?SITE:SITE+'notifications.html?ticket='+encodeURIComponent(r.id);return {topic,title:(r.method==='tres_sur'?'TRÈS SÛR':r.method.toUpperCase())+' · '+r.sport+' · à vérifier',message:r.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join('\n')+'\nCote relevée : '+r.odds.toFixed(2)+'. Mise du test : '+r.simulatedStake+' € fictifs. Aucun pari placé. Vérifie les marchés et la cote sur Winamax.',click:url,actions:[{action:'view',label:'Winamax',url:WINAMAX},{action:'view',label:'Détail du ticket',url}]};}
// Panne : il reste des matchs de football aujourd'hui mais aucun ticket Très sûr / Safe / Algo n'a pu être créé,
// faute de cotes Winamax récentes. Une journée « sans ticket admissible » (no_pick) n'est pas une panne.
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
function parisHour(t){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(new Date(t)));}
function when(t){return Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'jamais';}
function outage(src,now){
 var day=paris(now),left=((src.day&&src.day.matches)||[]).filter(function(m){var t=Date.parse(m.kickoff);return t>now&&paris(t)===day;}).length;
 var base={day:day,checkedAt:new Date(now).toISOString(),matchesLeft:left,footballUpdatedAt:src.football&&src.football.updatedAt||null,goalsUpdatedAt:src.goals&&src.goals.updatedAt||null};
 if(!left)return Object.assign(base,{status:'ok',reasons:[],message:'Plus de match de football à relever aujourd’hui.'});
 if(parisHour(now)<8)return Object.assign(base,{status:'waiting',reasons:[],message:'Collecte du matin pas encore passée.'});
 var has=function(records,test){return (records||[]).some(function(r){return r.day===day&&test(r);});};
 var reasons=[];
 if(!has(src.tresSur&&src.tresSur.records,function(r){return r.method==='tres_sur';}))reasons.push('Très sûr non créé');
 if(!has(src.paper&&src.paper.records,function(r){return r.sport==='football';}))reasons.push('Safe et Algo football non créés');
 if(!reasons.length)return Object.assign(base,{status:'ok',reasons:[],message:'Tickets du jour créés avec des cotes Winamax récentes.'});
 return Object.assign(base,{status:'panne',reasons:reasons,message:'Panne : '+reasons.join(', ')+'. Dernier relevé Winamax football : '+when(base.footballUpdatedAt)+' (victoires), '+when(base.goalsUpdatedAt)+' (buts). '+left+' match(s) restent aujourd’hui.'});
}
module.exports={eligible,payload,outage,WINAMAX,SITE};
