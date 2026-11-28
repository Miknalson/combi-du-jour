const test=require('node:test'),assert=require('node:assert/strict'),S=require('../ticket-spread');
const doc={sport:'football',matches:[{id:'a',sport:'football',home:'Groningen',away:'Willem II'},{id:'b',sport:'football',home:'Leuven',away:'KV Kortrijk'},{id:'c',sport:'football',home:'Brest',away:'Paris FC'}]};
test('retire les matchs déjà pris par un ticket du jour (id ou équipe)',()=>{
 const out=S.apply(doc,[{matchId:'a',home:'Groningen',away:'Willem II'},{matchId:'autre-id',home:'leuven ',away:'KV Kortrijk'}]);
 assert.deepEqual(out.matches.map(m=>m.id),['c']);assert.deepEqual(out.spreadExcluded,['a','b']);assert.equal(doc.matches.length,3);});
test('sans sélection prise ou pour un autre sport, le document est inchangé',()=>{
 assert.equal(S.apply(doc,[]),doc);assert.equal(S.apply({sport:'tennis',matches:[{id:'a',home:'Groningen'}]},[{matchId:'a'}]).matches.length,1);});
test('ne garde que les sélections football du jour demandé',()=>{
 const legs=S.legsOf([{day:'2026-11-27',legs:[{matchId:'a',sport:'football'},{matchId:'t',sport:'tennis'}]},{day:'2026-11-26',legs:[{matchId:'z'}]}],'2026-11-27');
 assert.deepEqual(legs.map(l=>l.matchId),['a']);});
