const test=require('node:test'),assert=require('node:assert/strict'),T=require('../tres-sur-bas-engine');
test('règles : cote 1,20 à 1,35, sélections 75 % mini, ticket 70 % mini',()=>{
 assert.equal(T.rules.minOdds,1.20);assert.equal(T.rules.maxOdds,1.35);assert.equal(T.rules.minLegProbability,.75);assert.equal(T.rules.minTicketProbability,.70);});
test('choisit la combinaison la plus probable dans la fourchette',()=>{
 const legs=[{id:'a',matchId:'a',home:'A',away:'B',o:1.25,p:.78},{id:'c',matchId:'c',home:'C',away:'D',o:1.10,p:.88},{id:'e',matchId:'e',home:'E',away:'F',o:1.12,p:.86}];
 const t=T.choose(legs);assert.ok(t.odds>=1.2&&t.odds<=1.35);assert.ok(t.p>=.7);});
test('journal : un seul ticket par jour, méthode tres_sur_bas',()=>{
 const j=T.append({records:[]},{day:'2026-11-28',ticket:null,candidates:0,source:null},Date.now());
 assert.equal(j.records[0].method,'tres_sur_bas');assert.equal(j.records[0].status,'no_pick');
 assert.equal(T.append(j,{day:'2026-11-28',ticket:null},Date.now()).records.length,1);});
