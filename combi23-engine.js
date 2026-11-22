/* Ticket « Combiné 2 à 3 » : 2 à 5 victoires football, cote Winamax totale 2,00 à 3,00, mise fictive 50 €.
   Demandé par Nano le 22/11/2026 pour comparer avec l'Algo (3 à 5). Fichier séparé : le journal v2 n'est pas modifié.
   Test historique 2019-2024 (grands championnats) : ~44 % de tickets gagnés, rentabilité ~ −5 %. Aucune mise réelle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./safe-multi-engine'),require('./paper-engine'));else root.Combi23=factory(root.SafeMulti,root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Safe,Paper){
'use strict';
var RULES={version:'combi23-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:50,currency:'EUR',
 minOdds:2.00,maxOdds:3.00,minLegs:2,maxLegs:5,minLegProbability:.50,minLegOdds:1.10,maxPool:12,families:['h2h'],outcomes:['1','2'],quoteMaxAgeMinutes:60,
 quotes:'cotes Winamax France relevées par API, victoires uniquement (pas de nul ni de double chance)'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function candidates(matches,now,day){var out=[];(matches||[]).forEach(function(m){
 if(!m||m.sport!=='football'||!Safe.valid(m,now,day)||!recent(m.asOf,now))return;
 (m.markets||[]).filter(function(g){return RULES.families.includes(g.family)&&Safe.marketValid(g,m,now)&&recent(g.asOf,now);}).forEach(function(g){
  var p=Safe.probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return;
  g.outcomes.forEach(function(o,i){if(!RULES.outcomes.includes(o.code)||p[i]+1e-12<RULES.minLegProbability||o.odds<RULES.minLegOdds-1e-9)return;
   out.push({id:'football|'+m.id+'|'+m.kickoff+'|'+g.id+'|'+o.code,matchId:m.id,sport:'football',gender:m.gender||'unspecified',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:Safe.paris(m.kickoff),code:o.code,label:o.label,o:o.odds,p:p[i],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:g.family,marketLine:g.line,marketParticipant:g.participant,est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'});});});});
 return out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);}).slice(0,RULES.maxPool);}
function same(a,b){function k(s){return String(s||'').trim().toLowerCase();}return a.matchId===b.matchId||[a.home,a.away].some(function(n){return [k(b.home),k(b.away)].includes(k(n));});}
// Combinaison la plus probable dans la fourchette ; à égalité, moins de sélections.
function choose(pool){var best=null;
 function consider(legs){var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
  if(legs.length<RULES.minLegs||odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9)return;var sig=legs.map(function(l){return l.id;}).sort().join('|');
  if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 (function walk(start,legs){consider(legs);if(legs.length>=RULES.maxLegs)return;
  for(var i=start;i<pool.length;i++){if(legs.some(function(l){return same(l,pool[i]);}))continue;walk(i+1,legs.concat([pool[i]]));}})(0,[]);
 return best;}
function build(doc,now){var day=Safe.paris(now),pool=doc&&doc.status==='ok'&&doc.bookKey==='winamax_fr'?candidates(doc.matches,now,day):[];return {day:day,ticket:choose(pool),candidates:pool.length,source:doc?{status:doc.status,updatedAt:doc.updatedAt,partial:!!doc.partial,matches:(doc.matches||[]).length}:null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;if(t&&!Paper.verified(t,now))return out;
 out.records.push({id:id,day:built.day,method:'combi23',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?t.odds:null,probability:t?t.p:null,legs:t?clone(t.legs):[],executionVerified:false,sourceSnapshots:built.source?[clone(built.source)]:[]});return out;}
return {rules:clone(RULES),candidates:candidates,choose:choose,build:build,append:append,settle:Paper.settle};
});
