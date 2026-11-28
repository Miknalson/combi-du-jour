const test=require('node:test'),assert=require('node:assert/strict'),B=require('../safe-but-engine'),fs=require('node:fs'),vm=require('node:vm');
const now=Date.parse('2026-11-28T08:00Z'),at='2026-11-28T07:50Z';
function match(id,extra={}){return Object.assign({id,sport:'football',league:'test',home:'Home '+id,away:'Away '+id,kickoff:'2026-11-28T15:00Z',bookKey:'winamax_fr',asOf:at,markets:[{id:'btts||None',family:'btts',bookKey:'winamax_fr',asOf:at,outcomes:[{side:'yes',code:'BTTS_Y',odds:1.3},{side:'no',code:'BTTS_N',odds:3.2}]}]},extra);}
function doc(matches,extra={}){return Object.assign({status:'ok',sport:'football',bookKey:'winamax_fr',updatedAt:at,matches},extra);}
function fixture(){return doc([match('a'),match('b')]);}
test('BTTS Oui : deux rencontres minimum, jamais un pari seul ni un marché de buts',()=>{
 assert.equal(B.build(doc([match('a')]),now).ticket,null);
 const t=B.build(fixture(),now).ticket;assert.equal(t.legs.length,2);assert.ok(t.legs.every(l=>l.code==='BTTS_Y'&&l.est===false&&l.bookKey==='winamax_fr'));assert.ok(Math.abs(t.odds-1.69)<1e-9);
 const other=match('tot');other.markets[0].family='totals';assert.equal(B.build(doc([other,match('b')]),now).ticket,null);
});
test('données réelles uniquement : refuse source différente, paire absente, estimation et cote périmée',()=>{
 for(const mutate of [m=>{m.markets[0].outcomes.pop();},m=>{m.markets[0].est=true;},m=>{m.bookKey='other';},m=>{m.markets[0].bookKey='other';},m=>{m.markets[0].asOf='2026-11-27T07:50Z';},m=>{m.markets[0].asOf='2026-11-28T08:01Z';},m=>{m.markets[0].outcomes[0].odds='1.3';},m=>{m.kickoff='invalid';},m=>{m.kickoff='2026-11-28T07:00Z';}]){const m=match('a');mutate(m);assert.equal(B.build(doc([m,match('b')]),now).ticket,null);}
});
test('fusion des relevés sans doublons, ni deux paris sur la même équipe',()=>{
 assert.equal(B.candidates([fixture(),fixture()],now).length,2);
 assert.equal(B.build(doc([match('a'),match('b',{home:'Away a'})]),now).ticket,null);
});
test('sans paire admissible : no_pick, pas de relâchement des seuils',()=>{
 const d=fixture();d.matches.forEach(m=>{m.markets[0].outcomes=[{side:'yes',code:'BTTS_Y',odds:1.8},{side:'no',code:'BTTS_N',odds:1.9}];});
 assert.equal(B.build(d,now).ticket,null);
 const j=B.append({records:[]},B.build(d,now),now);assert.equal(j.records[0].status,'no_pick');assert.equal(j.records[0].simulatedStake,0);
});
test('journal prospectif distinct : anciens tickets conservés, un seul nouveau ticket par jour',()=>{
 const old={id:'safe-but-v2|2026-11-28|football',method:'safe_but',legs:[],status:'no_pick'};
 const before={records:[old]},b=B.build(fixture(),now);let j=B.append(before,b,now);j=B.append(j,b,now+60000);
 assert.deepEqual(before,{records:[old]});assert.deepEqual(j.records[0],old);assert.equal(j.records.length,2);assert.equal(j.records[1].method,'btts');assert.equal(j.records[1].version,'btts-v1');assert.equal(j.records[1].executionVerified,false);
 const single=JSON.parse(JSON.stringify(b));single.ticket.legs.pop();assert.equal(B.append({records:[]},single,now).records.length,0);
 assert.equal(B.append({records:[]},b,Date.parse('2026-11-28T16:00Z')).records.length,0);
});
test('règlement : les deux équipes marquent sur TOUS les matchs ; score final uniquement',()=>{
 const r=B.append({records:[]},B.build(fixture(),now),now).records[0];
 const scores=[match('a',{score:'1-1',completed:true}),match('b',{score:'2-1',completed:true})];
 assert.equal(B.settle(r,scores,r.day).status,'won');scores[1].score='2-0';assert.equal(B.settle(r,scores,r.day).status,'lost');
 scores[1].completed=false;scores[1].scoreStatus='live';assert.equal(B.settle(r,scores,r.day).status,'pending');
 scores[1].completed=true;scores[1].scoreStatus='final';scores[1].scoreScope='including_extra_time';assert.equal(B.settle(r,scores,r.day).status,'pending');
});
test('anciens tickets plus/moins : règlement historique préservé',()=>{
 const old={day:'2026-11-28',method:'safe_but',status:'pending',legs:[{matchId:'a',sport:'football',kickoff:'2026-11-28T15:00Z',code:'O2.5'}]};
 assert.equal(B.settle(old,[match('a',{score:'2-1',completed:true})],old.day).status,'won');
});
test('affichage et workflow : nouvelle catégorie et bilan ancien séparés, vérification sur flux BTTS',()=>{
 const ui=fs.readFileSync('today-tickets.js','utf8');new vm.Script(ui);
 assert.match(ui,/btts:\{name:'BTTS Oui'/);assert.match(ui,/safe_but:\{name:'Safe but \(ancien\)'/);
 assert.match(fs.readFileSync('scripts/safe_but.cjs','utf8'),/football-goals\.json/);
 assert.match(fs.readFileSync('scripts/news_filter.cjs','utf8'),/B\.build\(\[foot\(N\.apply\(goals/);
});
