const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../ticket-reference'), A = require('../alerts-engine.cjs');
const now = Date.parse('2026-11-15T10:00:00Z');
function record(day='2026-11-15', status='pending') {
  return {id:'paper-v2|'+day+'|algo|football',mode:'paper',day,method:'algo',sport:'football',status,createdAt:day+'T09:45:00Z',odds:3.24,probability:.29,simulatedStake:50,legs:status==='no_pick'?[]:[{home:'A',away:'B',label:'Victoire A',code:'1',o:1.8,kickoff:day+'T18:00:00Z',asOf:day+'T09:40:00Z',bookKey:'winamax_fr',quoteSource:'api',est:false},{home:'C',away:'D',label:'Victoire C',code:'1',o:1.8,kickoff:day+'T20:00:00Z',asOf:day+'T09:40:00Z',bookKey:'winamax_fr',quoteSource:'api',est:false}]};
}
test('Algo et alerte choisissent la même référence exacte, sans chercher un autre jour', () => {
  const selected=record(), journal={records:[record('2026-11-14'), selected, record('2026-11-16')]}, before=JSON.stringify(journal);
  const payload=A.payload(selected,'private-channel');
  assert.equal(R.forDay(journal,selected.day,'algo','football'),selected);
  assert.equal(R.find(journal,new URL(payload.click).searchParams.get('ticket')),selected);
  assert.equal(R.forDay(journal,'2026-11-17','algo','football'),null);
  assert.equal(R.find(journal,'unknown'),null);
  assert.match(R.render(selected,{now}),/3,24/);
  assert.match(R.copyText(selected),/50 € fictifs/);
  assert.equal(JSON.stringify(journal),before);
});
test('La référence conserve les sélections et cotes figées malgré le temps, sans devenir une nouvelle proposition', () => {
  const r=record(), before=JSON.stringify(r);
  assert.equal(R.status(r,now),'upcoming');
  assert.equal(R.status(r,now+3600000),'stale');
  assert.match(R.render(r,{now:now+3600000}),/Le ticket de référence reste inchangé/);
  assert.equal(R.status(r,Date.parse('2026-11-15T18:00:00Z')),'started');
  assert.match(R.render(r,{now:Date.parse('2026-11-15T18:00:00Z')}),/ce n’est plus une proposition à jouer/);
  assert.equal(JSON.stringify(r),before);
});
test('Absence ou aucun ticket : aucune sélection, cote ou action de mise de remplacement', () => {
  const r=record('2026-11-15','no_pick');
  assert.equal(R.forDay({records:[r]},r.day,'algo','football'),r);
  assert.match(R.render(r,{now}),/Aucun ticket admissible/);
  assert.doesNotMatch(R.render(r,{now}),/Ouvrir Winamax|data-reference-copy/);
  assert.match(R.render(null,{unavailable:true}),/journal de référence n’a pas pu être chargé/);
  assert.match(R.render(null,{requestedId:'unknown'}),/Aucun autre ticket ne la remplace/);
});
