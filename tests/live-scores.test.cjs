// Scores en direct (ESPN) et règlement des tickets dès le score final.
const assert=require('node:assert/strict');
const L=require('../live-scores.js'),Paper=require('../paper-engine.js'),Algo=require('../algo-mix-engine.js');
const now=Date.parse('2026-11-22T13:00:00Z');
function ev(state,h,a,extra){return Object.assign({date:'2026-11-22T11:30Z',competitions:[{date:'2026-11-22T11:30Z',status:{period:state==='post'?2:2,displayClock:"67'",type:{state:state,completed:state==='post',name:state==='post'?'STATUS_FULL_TIME':'STATUS_SECOND_HALF',shortDetail:state==='post'?'FT':"67'"}},competitors:[{homeAway:'home',score:String(h),team:{displayName:'Juventus',shortDisplayName:'Juventus'}},{homeAway:'away',score:String(a),team:{displayName:'Venezia',shortDisplayName:'Venezia'}}]}]},extra||{});}
function juve(){return {id:'sa-juventus-venezia',league:'SA',kickoff:'2026-11-22T11:30Z',home:'Juventus',away:'Venezia'};}
async function main(){
 // Pendant le match : score en direct affiché, jamais de score final.
 let m=juve(),urls=[];
 let r=await L.refresh([m],{now,fetch:async u=>{urls.push(u);return {ok:true,json:async()=>({events:[ev('in',2,0)]})};}});
 assert.equal(urls.length,1);assert.match(urls[0],/soccer\/ita\.1\/scoreboard\?dates=20261122/);
 assert.equal(m.score,undefined);assert.deepEqual([m.live.score,m.live.clock],['2-0',"67'"]);assert.equal(r.live,1);
 assert.match(L.badge(m),/2 - 0/);
 // Coup de sifflet final (2 périodes) : score final réglable.
 r=await L.refresh([m],{now:now+3600000,fetch:async()=>({ok:true,json:async()=>({events:[ev('post',4,0)]})})});
 assert.equal(m.score,'4-0');assert.equal(m.completed,true);assert.equal(m.scoreStatus,'final');assert.equal(m.live,undefined);assert.equal(L.badge(m),'');
 // Prolongations / tirs au but : pas de score final du temps réglementaire.
 m=juve();const extra=ev('post',1,1);extra.competitions[0].status.period=4;extra.competitions[0].status.type.name='STATUS_FINAL_PEN';
 await L.refresh([m],{now,fetch:async()=>({ok:true,json:async()=>({events:[extra]})})});assert.equal(m.score,undefined);assert.equal(m.live.ended,true);
 // Autre rencontre, mauvaise heure, ligue non couverte, match pas commencé : rien.
 m=juve();const other=ev('in',1,0);other.competitions[0].competitors[1].team={displayName:'Torino'};other.competitions[0].competitors[0].team={displayName:'Inter'};
 await L.refresh([m],{now,fetch:async()=>({ok:true,json:async()=>({events:[other]})})});assert.equal(m.live,undefined);
 let called=0;const f=async()=>{called++;return {ok:true,json:async()=>({events:[]})};};
 await L.refresh([Object.assign(juve(),{league:'UKR'}),Object.assign(juve(),{kickoff:'2026-11-22T18:00Z'}),Object.assign(juve(),{score:'1-0',completed:true})],{now,fetch:f});assert.equal(called,0);
 // Réseau en panne : rien n'est effacé.
 m=Object.assign(juve(),{live:{score:'1-0',clock:"30'"}});r=await L.refresh([m],{now,fetch:async()=>{throw new Error('offline');}});assert.equal(r.failed,1);assert.equal(m.live.score,'1-0');
 // Noms un peu différents entre les deux sources.
 assert.ok(L.findEvent({home:'1. FC Heidenheim',away:'Bayern Munich',kickoff:'2026-11-22T14:30Z'},[{kickoff:'2026-11-22T14:30Z',home:['1. FC Heidenheim 1846'],away:['Bayern Munich']}]));

 // Règlement le jour même : perdu dès un pari perdu terminé, gagné quand tout est terminé et gagné.
 const rec={id:'x',day:'2026-11-22',status:'pending',legs:[{sport:'football',matchId:'a',home:'A',away:'B',kickoff:'2026-11-22T11:30Z',code:'1'},{sport:'football',matchId:'c',home:'C',away:'D',kickoff:'2026-11-22T19:45Z',code:'2'}]};
 const fin=(id,k,s)=>({id,kickoff:k,score:s,completed:true,scoreStatus:'final'});
 assert.equal(Paper.settle(rec,[fin('a',rec.legs[0].kickoff,'0-1')],'2026-11-22').status,'lost');
 assert.equal(Paper.settle(rec,[fin('a',rec.legs[0].kickoff,'2-0')],'2026-11-22').status,'pending');
 assert.equal(Paper.settle(rec,[fin('a',rec.legs[0].kickoff,'2-0'),fin('c',rec.legs[1].kickoff,'0-3')],'2026-11-22').status,'won');
 // Score sans marque « terminé » le jour même, ou score en direct : on attend.
 assert.equal(Paper.settle(rec,[{id:'a',kickoff:rec.legs[0].kickoff,score:'0-1'}],'2026-11-22').status,'pending');
 assert.equal(Paper.settle(rec,[{id:'a',kickoff:rec.legs[0].kickoff,score:'0-1',scoreStatus:'live'}],'2026-11-22').status,'pending');
 // Lendemain : comme avant, un score publié suffit.
 assert.equal(Paper.settle(rec,[{id:'a',kickoff:rec.legs[0].kickoff,score:'2-0'},{id:'c',kickoff:rec.legs[1].kickoff,score:'1-1'}],'2026-11-23').status,'lost');
 // Ticket d'un jour à venir : jamais réglé.
 assert.equal(Paper.settle(Object.assign({},rec,{day:'2026-11-23'}),[fin('a',rec.legs[0].kickoff,'0-1')],'2026-11-22').status,'pending');
 // Algo (victoires + buts) : mêmes règles.
 const a=Object.assign({},rec,{legs:[Object.assign({},rec.legs[0],{code:'O2.5'}),Object.assign({},rec.legs[1],{code:'BTTS_Y'})]});
 assert.equal(Algo.settle(a,[fin('a',a.legs[0].kickoff,'1-0')],'2026-11-22').status,'lost');
 assert.equal(Algo.settle(a,[fin('a',a.legs[0].kickoff,'2-1')],'2026-11-22').status,'pending');
 assert.equal(Algo.settle(a,[{id:'a',kickoff:a.legs[0].kickoff,score:'1-0'}],'2026-11-22').status,'pending');
 console.log('live-scores ok');
}
main().catch(e=>{console.error(e);process.exit(1);});
