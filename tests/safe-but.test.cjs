const test=require('node:test'),assert=require('node:assert/strict'),B=require('../safe-but-engine');
const now=Date.parse('2026-11-22T07:00:00Z'),updatedAt='2026-11-22T06:50:00Z';
function m(id,ou,extra){return Object.assign({id,league:'SA',home:'H'+id,away:'A'+id,kickoff:'2026-11-22T15:00:00Z',o1:2,oX:3.4,o2:3.6,ou,mine:{bookKey:'winamax_fr',o1:1.9,oX:3.3,o2:3.5,ou:{}}},extra||{});}
function doc(ms,at){return {updatedAt:at||updatedAt,source:'test',matches:ms};}
test('Probabilités hors marge par la méthode puissance',()=>{const p=B.power(1.5,2.6);assert.ok(Math.abs(p[0]+p[1]-1)<1e-9);assert.ok(p[0]>.6);});
test('Choisit le pari buts le plus probable entre 1,50 et 2,00 avec la cote marché moins 5 %',()=>{
 const b=B.build(doc([m('a',{'2.5':{o:1.58,u:2.45}}),m('b',{'2.5':{o:1.9,u:1.9}})]),now);
 assert.equal(b.ticket.legs.length,1);const l=b.ticket.legs[0];
 assert.equal(l.code,'O2.5');assert.equal(l.o,Math.round(1.58*.95*100)/100);assert.equal(l.label,'Plus de 2,5 buts');
 assert.ok(b.ticket.odds>=1.5&&b.ticket.odds<=2&&b.ticket.p>=.6);assert.equal(l.est,true);});
test('Combine deux sélections quand une seule ne suffit pas, jamais deux fois le même match',()=>{
 const t=B.choose([{id:'a1',matchId:'a',o:1.3,p:.8},{id:'a2',matchId:'a',o:1.3,p:.8},{id:'b1',matchId:'b',o:1.25,p:.78}]);
 assert.deepEqual(t.legs.map(l=>l.id).sort(),['a1','b1']);assert.ok(Math.abs(t.odds-1.625)<1e-9);});
test('Ignore lignes entières, matchs commencés, absents de Winamax, et cotes trop anciennes',()=>{
 assert.equal(B.build(doc([m('a',{'3.0':{o:1.58,u:2.45}})]),now).ticket,null);
 assert.equal(B.build(doc([m('a',{'2.5':{o:1.58,u:2.45}},{kickoff:'2026-11-22T06:00:00Z'})]),now).ticket,null);
 assert.equal(B.build(doc([m('a',{'2.5':{o:1.58,u:2.45}},{mine:null})]),now).ticket,null);
 assert.equal(B.build(doc([m('a',{'2.5':{o:1.58,u:2.45}})],'2026-11-21T07:00:00Z'),now).ticket,null);});
test('Un seul ticket par jour, réglé avec le score final',()=>{
 const d=doc([m('a',{'2.5':{o:1.58,u:2.45}})]);let j=B.append({records:[]},B.build(d,now),now);j=B.append(j,B.build(d,now+60000),now+60000);
 assert.equal(j.records.length,1);assert.equal(j.records[0].method,'safe_but');assert.equal(j.records[0].simulatedStake,100);
 const won=B.settle(j.records[0],[Object.assign({},d.matches[0],{score:'2-1'})],'2026-11-23');assert.equal(won.status,'won');
 const lost=B.settle(j.records[0],[Object.assign({},d.matches[0],{score:'1-0'})],'2026-11-23');assert.equal(lost.status,'lost');});
test('v2 : utilise les vraies cotes de buts Winamax même sans moyenne du marché ni fichier récent',()=>{
 const w=m('w',undefined,{mine:{bookKey:'winamax_fr',asOf:'2026-11-22T06:40:00Z',o1:1.9,oX:3.3,o2:3.5,ou:{'2.5':{o:1.25,u:3.6,asOf:'2026-11-22T06:40:00Z'}}}});
 const v=m('v',undefined,{mine:{bookKey:'winamax_fr',asOf:'2026-11-22T06:40:00Z',o1:1.9,oX:3.3,o2:3.5,ou:{'2.5':{o:1.3,u:3.2,asOf:'2026-11-22T06:40:00Z'}}}});
 const b=B.build(doc([w,v],'2026-11-20T07:00:00Z'),now);
 assert.equal(b.fresh,true);assert.ok(b.ticket);assert.equal(b.ticket.legs.length,2);
 b.ticket.legs.forEach(l=>{assert.equal(l.est,false);assert.equal(l.bookKey,'winamax_fr');});
 assert.ok(Math.abs(b.ticket.odds-1.625)<1e-9);assert.ok(b.ticket.p>=.5);
 const j=B.append({records:[]},b,now);assert.equal(j.records[0].version,'safe-but-v2');assert.match(j.records[0].oddsNote,/Winamax relevées/);});
test('v2 : cotes Winamax trop anciennes = rien enregistré (on réessaie plus tard)',()=>{
 const w=m('w',undefined,{mine:{bookKey:'winamax_fr',ou:{'2.5':{o:1.25,u:3.6,asOf:'2026-11-21T06:40:00Z'}}}});
 const b=B.build(doc([w],'2026-11-21T07:00:00Z'),now);assert.equal(b.fresh,false);assert.equal(B.append({records:[]},b,now).records.length,0);});
test('v2 : un ticket à 50–60 % est maintenant accepté, pas en dessous de 50 %',()=>{
 assert.ok(B.choose([{id:'a',matchId:'a',o:1.55,p:.55}]));assert.equal(B.choose([{id:'a',matchId:'a',o:1.55,p:.49}]),null);});
