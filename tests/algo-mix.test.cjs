const test=require('node:test'),assert=require('node:assert/strict'),A=require('../algo-mix-engine');
const now=Date.parse('2026-11-23T07:00:00Z'),asOf='2026-11-23T06:50:00Z';
function g(id,family,outs,line){return {id,family,unit:family==='totals'?'goals':'match',line:line===undefined?null:line,participant:'',bookKey:'winamax_fr',asOf,outcomes:outs.map(([code,side,odds])=>({code,side,label:code,odds,participant:''}))};}
function match(id,[o1,oX,o2],[ov,un],[by,bn]){return {id,sport:'football',home:'H'+id,away:'A'+id,league:'EPL',kickoff:'2026-11-23T20:00:00Z',asOf,bookKey:'winamax_fr',markets:[
 g('h2h||None','h2h',[['1','1',o1],['2','2',o2],['X','X',oX]]),g('totals||2.5','totals',[['O2.5','over',ov],['U2.5','under',un]],2.5),g('btts||None','btts',[['BTTS_Y','yes',by],['BTTS_N','no',bn]])]};}
function doc(ms){return {sport:'football',bookKey:'winamax_fr',status:'ok',updatedAt:asOf,matches:ms};}
const day=[match('a',[2.9,3.3,2.5],[1.45,2.7],[1.5,2.5]),match('b',[1.35,5,8],[1.9,1.9],[1.95,1.8]),match('c',[2.6,3.2,2.8],[2.2,1.65],[2.1,1.7]),match('d',[1.8,3.6,4.4],[1.6,2.3],[1.75,2.0])];
test('Mélange victoires, buts et les deux marquent, cote 3 à 5, un pari par match',()=>{const b=A.build(doc(day),now);
 assert.ok(b.ticket);assert.ok(b.ticket.odds>=3&&b.ticket.odds<=5);
 assert.equal(new Set(b.ticket.legs.map(l=>l.matchId)).size,b.ticket.legs.length);
 assert.ok(b.ticket.legs.every(l=>l.p>=.5&&l.bookKey==='winamax_fr'&&l.est===false&&['1','2','O2.5','U2.5','BTTS_Y','BTTS_N'].includes(l.code)));
 assert.ok(b.ticket.legs.some(l=>l.marketFamily!=='h2h'));
 assert.deepEqual([...new Set(A.candidates(day,now,'2026-11-23').map(l=>l.marketFamily))].sort(),['btts','h2h','totals']);});
test('Jamais de match nul, ni de cote trop ancienne',()=>{const old=doc(day.map(m=>Object.assign({},m,{asOf:'2026-11-23T05:00:00Z'})));assert.equal(A.build(old,now).ticket,null);
 const pool=A.candidates(day,now,'2026-11-23');assert.ok(pool.length&&pool.every(l=>l.code!=='X'));});
test('Seule la ligne 2,5 est retenue',()=>{const m=match('e',[1.5,4,6],[1.3,3.4],[1.9,1.9]);m.markets[1].line=3.5;assert.ok(A.candidates([m],now,'2026-11-23').every(l=>l.marketFamily!=='totals'));});
test('Un seul ticket par jour, réglé avec le score (les deux marquent compris)',()=>{let j=A.append({records:[]},A.build(doc(day),now),now);j=A.append(j,A.build(doc(day),now+60000),now+60000);
 assert.equal(j.records.length,1);assert.equal(j.records[0].method,'algo_mix');assert.equal(j.records[0].simulatedStake,50);
 const r=j.records[0];assert.equal(A.settle(r,[],'2026-11-24').status,'pending');assert.equal(A.settle(r,day.map(m=>Object.assign({},m,{score:'2-1'})),'2026-11-23').status,'pending');
 const win=day.map(m=>{const l=r.legs.find(l=>l.matchId===m.id);let s='1-1';if(l)s={'1':'2-1','2':'1-2','O2.5':'2-1','U2.5':'1-0','BTTS_Y':'1-1','BTTS_N':'1-0'}[l.code];return Object.assign({},m,{score:s});});
 const ok=r.legs.every(l=>A.legResult(l,...win.find(m=>m.id===l.matchId).score.split('-').map(Number)));
 assert.ok(ok);assert.equal(A.settle(r,win,'2026-11-24').status,'won');
 const lose=day.map(m=>Object.assign({},m,{score:'0-0'}));const any=r.legs.some(l=>!A.legResult(l,0,0));assert.equal(A.settle(r,lose,'2026-11-24').status,any?'lost':'won');});
test('Résultat des paris',()=>{assert.equal(A.legResult({code:'BTTS_Y'},1,1),true);assert.equal(A.legResult({code:'BTTS_Y'},2,0),false);assert.equal(A.legResult({code:'BTTS_N'},0,0),true);
 assert.equal(A.legResult({code:'O2.5'},2,1),true);assert.equal(A.legResult({code:'U2.5'},2,1),false);assert.equal(A.legResult({code:'2'},0,1),true);});
