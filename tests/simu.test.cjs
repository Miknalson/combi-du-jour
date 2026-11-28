const test=require('node:test'),assert=require('node:assert/strict'),S=require('../simu-engine');
const now=Date.parse('2026-11-28T08:00:00Z'),asOf='2026-11-28T07:50:00Z';
function match(id,home,away,o1,oX,o2,kick){return {id,sport:'football',home,away,kickoff:kick||'2026-11-28T15:00Z',asOf,bookKey:'winamax_fr',markets:[{id:'h2h||None',family:'h2h',line:null,bookKey:'winamax_fr',asOf,outcomes:[{code:'1',side:'1',label:'Victoire '+home,odds:o1},{code:'X',side:'X',label:'Nul',odds:oX},{code:'2',side:'2',label:'Victoire '+away,odds:o2}]}]};}
const doc=ms=>({status:'ok',updatedAt:asOf,bookKey:'winamax_fr',sport:'football',matches:ms});
const day=[match('a','A1','A2',1.3,5,9),match('b','B1','B2',2.5,3.2,2.8),match('c','C1','C2',1.9,3.4,4),match('d','D1','D2',3.1,3.3,2.3),match('e','E1','E2',2.2,3.2,3.3)];

test('Ticket entre 2 et 3, un pari par match, au moins 50 % par sélection',()=>{const b=S.build([doc(day)],now);
 assert.ok(b.ticket);assert.ok(b.ticket.odds>=2&&b.ticket.odds<=3);assert.ok(b.ticket.legs.length>=2&&b.ticket.legs.length<=5);
 assert.equal(new Set(b.ticket.legs.map(l=>l.matchId)).size,b.ticket.legs.length);assert.ok(b.ticket.legs.every(l=>l.p>=.5&&l.o>=1.1));});

test('Les handicaps sont marqués comme cotes estimées',()=>{const b=S.build([doc(day)],now),h=b.ticket.legs.filter(l=>/^H/.test(l.code));
 assert.ok(h.length>0,'des handicaps sont proposés');assert.ok(h.every(l=>l.est===true&&l.quoteSource==='estimate'));
 assert.ok(b.ticket.legs.filter(l=>!/^H/.test(l.code)).every(l=>l.est===false));});

test('Le handicap +1,5 gagne si l’équipe perd d’un but, perd sinon',()=>{
 assert.equal(S.settleCode('H2+1.5',2,1),true);assert.equal(S.settleCode('H2+1.5',3,1),false);
 assert.equal(S.settleCode('H1-1.5',2,0),true);assert.equal(S.settleCode('H1-1.5',1,0),false);assert.equal(S.settleCode('H1+2.5',0,2),true);});

test('Un seul ticket par jour, réglé avec le score',()=>{const b=S.build([doc(day)],now);let j=S.append({records:[]},b,now);j=S.append(j,S.build([doc(day)],now+60000),now+60000);
 assert.equal(j.records.length,1);const r=j.records[0];assert.equal(r.method,'simu');assert.equal(r.simulatedStake,50);
 const scores=r.legs.map(l=>{const ok=['0-0','1-0','0-1','2-1','1-2','3-0','0-3'].find(s=>{const [h,a]=s.split('-').map(Number);return S.settleCode(l.code,h,a);});return {id:l.matchId,home:l.home,away:l.away,kickoff:l.kickoff,score:ok,scoreStatus:'final',completed:true};});
 assert.equal(S.settle(r,scores,'2026-11-29').status,'won');
 const bad=scores.map((s,i)=>i?s:Object.assign({},s,{score:['0-0','1-0','0-1','5-0','0-5'].find(x=>{const [h,a]=x.split('-').map(Number);return !S.settleCode(r.legs[0].code,h,a);})}));
 assert.equal(S.settle(r,bad,'2026-11-29').status,'lost');});

test('Cotes trop vieilles ou match commencé : pas de ticket',()=>{assert.equal(S.build([doc(day)],now+2*3600000).ticket,null);
 assert.equal(S.build([doc(day.map(m=>Object.assign({},m,{kickoff:'2026-11-28T07:00Z'})))],now).ticket,null);});
