/* Ticket « Algo » mélangé : victoires, plus/moins 2,5 buts et « les deux équipes marquent », cote Winamax totale 3 à 5.
   Choisi par Nano le 23/11/2026 après le test historique 2019-2024 (5 grands championnats) : ~32 % de tickets gagnés,
   rentabilité ~ −1 %, contre ~29 % et ~ −10 % pour l'Algo victoires seules. Mise fictive 50 €, aucune mise réelle.
   Cotes : data/sports/football-goals.json (OddsPapi, Winamax FR). Un seul pari par match. Journal séparé du journal v2. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./safe-multi-engine'),require('./paper-engine'));else root.AlgoMix=factory(root.SafeMulti,root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Safe,Paper){
'use strict';
var RULES={version:'algo-mix-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:50,currency:'EUR',
 minOdds:3.00,maxOdds:5.00,minLegs:2,maxLegs:5,minLegProbability:.50,minLegOdds:1.10,maxPool:14,
 families:['h2h','totals','btts'],codes:['1','2','O2.5','U2.5','BTTS_Y','BTTS_N'],quoteMaxAgeMinutes:60,
 quotes:'cotes Winamax France relevées par API : victoires, plus/moins 2,5 buts, les deux équipes marquent'};
var SIDES={h2h:'1,2,X',totals:'over,under',btts:'no,yes'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function groupValid(g){return g&&g.bookKey==='winamax_fr'&&!g.est&&g.quoteSource!=='user'&&RULES.families.includes(g.family)&&Array.isArray(g.outcomes)
 &&g.outcomes.map(function(o){return o.side;}).sort().join(',')===SIDES[g.family]&&g.outcomes.every(function(o){return typeof o.code==='string'&&typeof o.label==='string'&&Number.isFinite(o.odds)&&o.odds>1;})
 &&(g.family!=='totals'||g.line===2.5);}
function candidates(matches,now,day){var out=[];(matches||[]).forEach(function(m){
 if(!m||m.sport!=='football'||typeof m.id!=='string'||m.home===m.away||m.bookKey!=='winamax_fr'||Date.parse(m.kickoff)<=now||Safe.paris(m.kickoff)!==day||!recent(m.asOf,now))return;
 (m.markets||[]).filter(function(g){return groupValid(g)&&recent(g.asOf,now);}).forEach(function(g){
  var p=Safe.probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return;
  g.outcomes.forEach(function(o,i){if(!RULES.codes.includes(o.code)||p[i]+1e-12<RULES.minLegProbability||o.odds<RULES.minLegOdds-1e-9)return;
   out.push({id:'football|'+m.id+'|'+m.kickoff+'|'+g.id+'|'+o.code,matchId:m.id,sport:'football',gender:m.gender||'unspecified',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:Safe.paris(m.kickoff),code:o.code,label:o.label,o:o.odds,p:p[i],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:g.family,marketLine:g.line,marketParticipant:g.participant||'',est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'});});});});
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
function build(doc,now){var day=Safe.paris(now),pool=doc&&doc.status==='ok'&&doc.bookKey==='winamax_fr'?candidates(doc.matches,now,day):[];return {day:day,ticket:choose(pool),candidates:pool.length,source:doc?{status:doc.status,updatedAt:doc.updatedAt,matches:(doc.matches||[]).length,source:doc.source||null}:null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;if(t&&!Paper.verified(t,now))return out;
 out.records.push({id:id,day:built.day,method:'algo_mix',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?t.odds:null,probability:t?t.p:null,legs:t?clone(t.legs):[],executionVerified:false,sourceSnapshots:built.source?[clone(built.source)]:[]});return out;}
function legResult(l,h,a){if(l.code==='1')return h>a;if(l.code==='2')return a>h;if(l.code==='O2.5')return h+a>2.5;if(l.code==='U2.5')return h+a<2.5;if(l.code==='BTTS_Y')return h>0&&a>0;if(l.code==='BTTS_N')return h===0||a===0;return null;}
// Règlement avec les scores de l'appli (data/days), mêmes règles d'appariement que les autres tickets.
// Comme Paper.settle : réglé dès les scores finaux (le jour même s'ils sont marqués terminés), perdu dès un pari perdu.
function settle(record,matches,today){if(record.status!=='pending'||record.day>today)return record;var done=true,lost=false;
 function k(s){return String(s||'').trim().toLowerCase();}
 record.legs.forEach(function(l){var m=(matches||[]).find(function(m){return Date.parse(m.kickoff)===Date.parse(l.kickoff)&&(m.id===l.matchId||k(m.home)===k(l.home)&&k(m.away)===k(l.away));});
  if(!m||!/^\d+\s*-\s*\d+$/.test(String(m.score||''))||m.scoreStatus==='live'||m.completed===false||record.day>=today&&m.completed!==true&&m.scoreStatus!=='final'){done=false;return;}var s=m.score.split('-').map(Number),ok=legResult(l,s[0],s[1]);if(ok===null)done=false;else if(!ok)lost=true;});
 if(!done&&!lost)return record;return Object.assign({},record,{status:lost?'lost':'won',resultSource:'application-football-score'});}
return {rules:clone(RULES),candidates:candidates,choose:choose,build:build,append:append,settle:settle,legResult:legResult};
});
