const test=require('node:test'),assert=require('node:assert/strict'),J=require('../reel-engine');
const now=Date.parse('2026-11-28T08:00:00Z'),asOf='2026-11-28T07:50:00Z';
function match(id,home,away,o1,oX,o2,kick){return {id,sport:'football',home,away,kickoff:kick||'2026-11-28T15:00Z',asOf,bookKey:'winamax_fr',markets:[{id:'h2h||None',family:'h2h',line:null,bookKey:'winamax_fr',asOf,outcomes:[{code:'1',side:'1',label:'Victoire '+home,odds:o1},{code:'X',side:'X',label:'Nul',odds:oX},{code:'2',side:'2',label:'Victoire '+away,odds:o2}]}]};}
const doc=m=>({status:'ok',updatedAt:asOf,bookKey:'winamax_fr',matches:m});
test('ticket le plus probable entre 1,50 et 3, victoires Winamax réelles',()=>{
 const r=J.build([doc([match('a','A','B',1.25,6,11),match('c','C','D',1.35,5,8),match('e','E','F',1.75,3.8,4.5)])],now);
 assert.ok(r.ticket);assert.ok(r.ticket.odds>=1.5&&r.ticket.odds<=3);assert.ok(r.ticket.legs.every(l=>l.bookKey==='winamax_fr'&&l.est===false));
 assert.ok(r.ticket.p>=.5);});
test('un pari seul dans la fourchette reste possible même hors des 16 plus probables',()=>{
 const many=Array.from({length:20},(_,i)=>match('m'+i,'H'+i,'W'+i,1.05,15,30));many.push(match('s','S','T',1.72,3.9,4.6));
 const r=J.build([doc(many)],now);assert.ok(r.ticket);assert.ok(r.ticket.odds>=1.5&&r.ticket.odds<=3);});
test('sans victoire possible, passe aux buts puis aux sélections à 40 %',()=>{
 const r=J.build([doc([match('x','X','Y',2.3,3.2,3.1)])],now);assert.ok(r.ticket);assert.equal(r.ticket.step,2);});
test('journal : un seul ticket par jour',()=>{
 const b=J.build([doc([match('e','E','F',1.75,3.8,4.5)])],now),j=J.append(J.append({records:[]},b,now),b,now);
 assert.equal(j.records.length,1);assert.equal(j.records[0].method,'reel');assert.equal(j.records[0].status,'pending');});
