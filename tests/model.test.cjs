const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../model.js'),report=require('../data/model-report.json');
const now=Date.parse('2026-10-30T12:00:00Z');
const freshMatch=()=>({id:'fixture',league:'PL',home:'Home',away:'Away',kickoff:'2026-10-30T17:00:00Z',
  o1:1.5,oX:4.5,o2:7,books:10,referenceAt:'2026-10-30T11:50:00Z',
  mine:{bookKey:'winamax_fr',book:'Winamax',asOf:'2026-10-30T11:50:00Z',o1:2.2,oX:4.5,o2:7}});
const validated=()=>({...structuredClone(report),productionEnabled:true,validatedBook:'winamax_fr',
  rules:{value_single:{profitableEvidence:true,tickets:500,roi95:[.01,.1]}}});

test('Probabilités normalisées et marché symétrique',()=>{
  const p=model.probabilities([3,3,3]);p.forEach(x=>assert(Math.abs(x-1/3)<1e-12));
  for(const odds of [[1.1,9,26],[2,3,4],[20,8,1.15]]){
    const q=model.probabilities(odds,report.parameters);assert(Math.abs(q.reduce((a,b)=>a+b)-1)<1e-12);assert(q.every(x=>x>0&&x<1));
  }
  assert.equal(model.probabilities([0,2,3]),null);
  assert.equal(model.probabilities([Infinity,2,3]),null);
});
test('Aucune mise autorisée par le rapport réel, même avec une belle cote',()=>{
  const r=model.assess([freshMatch()],report,now);assert.equal(r.status,'observation');assert.equal(r.picks.length,0);
  assert(r.observations.some(c=>c.edge>0));
});
test('Une cote moyenne ou non horodatée ne devient jamais une cote jouable',()=>{
  const m=freshMatch();delete m.mine;assert.equal(model.assess([m],validated(),now).picks.length,0);
  const m2=freshMatch();delete m2.mine.asOf;assert.equal(model.assess([m2],validated(),now).picks.length,0);
});
test('Refuse les matchs commencés, scores connus, cotes anciennes et futures',()=>{
  for(const mutate of [m=>m.kickoff='2026-10-30T11:00:00Z',m=>m.score='2-0',
    m=>m.mine.asOf='2026-10-30T09:00:00Z',m=>m.referenceAt='2026-10-30T09:00:00Z',
    m=>m.mine.asOf='2026-10-30T13:00:00Z',m=>m.mine.bookKey='winamax_de',m=>m.league='RUS']){
    const m=freshMatch();mutate(m);assert.equal(model.assess([m],validated(),now).picks.length,0);
  }
});
test('Un résultat statistique non démontré ne peut être activé par un simple drapeau',()=>{
  const r={...structuredClone(report),productionEnabled:true};assert.equal(model.assess([freshMatch()],r,now).picks.length,0);
});
test('Un seul pari simple et seulement avec un avantage après marge de prudence',()=>{
  const one=freshMatch(),two={...freshMatch(),id:'other'};assert.equal(model.assess([one,two],validated(),now).picks.length,1);
  one.mine.o1=1.2;assert.equal(model.assess([one],validated(),now).picks.length,0);
});
test('Rapport manquant : fermeture prudente',()=>{
  assert.equal(model.assess([freshMatch()],null,now).status,'unavailable');
  assert.equal(model.assess([freshMatch()],{},now).picks.length,0);
});
