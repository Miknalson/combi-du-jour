const test=require('node:test'),assert=require('node:assert/strict'),C=require('../combi23-engine');
const now=Date.parse('2026-11-22T06:00:00Z'),asOf='2026-11-22T05:50:00Z';
function match(id,o1,oX,o2){return {id,sport:'football',home:'H'+id,away:'A'+id,league:'SA',kickoff:'2026-11-22T14:00:00Z',asOf,bookKey:'winamax_fr',markets:[{id:'h2h||None',family:'h2h',unit:'match',line:null,participant:'',bookKey:'winamax_fr',asOf,outcomes:[{code:'1',side:'1',label:'Victoire H'+id,odds:o1},{code:'X',side:'X',label:'Nul',odds:oX},{code:'2',side:'2',label:'Victoire A'+id,odds:o2}]}]};}
function doc(ms){return {sport:'football',bookKey:'winamax_fr',status:'ok',updatedAt:asOf,matches:ms};}
test('Combinaison de victoires Winamax la plus probable entre 2 et 3',()=>{const b=C.build(doc([match('a',1.3,5,9),match('b',1.6,3.9,5.5),match('c',1.45,4.4,6.5),match('d',2.6,3.2,2.8)]),now);
 assert.ok(b.ticket);assert.ok(b.ticket.odds>=2&&b.ticket.odds<=3);assert.ok(b.ticket.legs.length>=2);
 assert.ok(b.ticket.legs.every(l=>['1','2'].includes(l.code)&&l.bookKey==='winamax_fr'&&l.p>=.5));
 assert.equal(new Set(b.ticket.legs.map(l=>l.matchId)).size,b.ticket.legs.length);});
test('Jamais de match nul ni de sélection sous 50 %',()=>{assert.equal(C.build(doc([match('a',2.7,3.1,2.8),match('b',2.9,3,2.6)]),now).ticket,null);});
test('Un seul ticket figé par jour, réglé avec le score',()=>{const d=doc([match('a',1.3,5,9),match('b',1.6,3.9,5.5)]);let j=C.append({records:[]},C.build(d,now),now);j=C.append(j,C.build(d,now+60000),now+60000);
 assert.equal(j.records.length,1);assert.equal(j.records[0].method,'combi23');assert.equal(j.records[0].simulatedStake,50);
 const sc=d.matches.map(m=>Object.assign({},m,{score:'2-0'}));assert.equal(C.settle(j.records[0],sc,'2026-11-23').status,'won');
 const sc2=d.matches.map((m,i)=>Object.assign({},m,{score:i?'1-1':'2-0'}));assert.equal(C.settle(j.records[0],sc2,'2026-11-23').status,'lost');});
