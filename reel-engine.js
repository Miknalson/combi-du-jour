/* Ticket « Réel » : le ticket sur lequel Nano mise en vrai (50 € minimum), un chaque jour, cote Winamax totale 1,50 à 3,00
   (demandé le 28/11/2026 : « 1,5 à 3 mais toujours très sûr »). Priorité absolue : il passe avant tous les autres tickets (ticket-spread.js).
   Choix : la combinaison la plus probable dans la fourchette, 1 à 3 sélections, un seul pari par match.
   Marchés : d'abord les victoires seules, car Winamax y prend le moins de marge (~6 % sur les favoris, contre ~12 %
   sur plus/moins 2,5 buts et « les deux équipes marquent », relevé du 28/11). Les buts ne servent que si aucune
   combinaison de victoires ne tombe dans la fourchette.
   v2 (28/11, validé par Nano) : plus de pari forcé. Le Réel ne sort que si le ticket atteint 58 % (sélections 60 % mini) ;
   sinon « pas de Réel aujourd'hui ». Rétro-test 32 jours (cotes moyennes −4 % ≈ Winamax) : Réel ~19 jours sur 32,
   gagné 14 fois. Cotes Winamax réelles uniquement. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./safe-multi-engine'),require('./paper-engine'),require('./algo-mix-engine'));else root.TicketReel=factory(root.SafeMulti,root.PaperTests,root.AlgoMix);})(typeof globalThis!=='undefined'?globalThis:this,function(Safe,Paper,AlgoMix){
'use strict';
var RULES={version:'reel-v2',sport:'football',mode:'paper',realMoneyEnabled:false,stake:50,currency:'EUR',
 minOdds:1.50,maxOdds:3.00,minLegs:1,maxLegs:3,minLegOdds:1.10,maxPool:16,quoteMaxAgeMinutes:60,minTicketProbability:.58,
 steps:[{families:['h2h'],codes:['1','2'],minLegProbability:.60},
        {families:['h2h','totals','btts'],codes:['1','2','O2.5','U2.5','BTTS_Y','BTTS_N'],minLegProbability:.60}],
 quotes:'cotes Winamax France relevées par API, jamais une moyenne ni une estimation'};
var SIDES={h2h:'1,2,X',totals:'over,under',btts:'no,yes'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function groupValid(g,step){return g&&g.bookKey!=='user'&&!g.est&&g.quoteSource!=='user'&&step.families.includes(g.family)&&Array.isArray(g.outcomes)
 &&g.outcomes.map(function(o){return o.side;}).sort().join(',')===SIDES[g.family]&&g.outcomes.every(function(o){return typeof o.code==='string'&&Number.isFinite(o.odds)&&o.odds>1;})
 &&(g.family!=='totals'||g.line===2.5);}
function candidates(matches,now,day,step){var out=[],seen={};(matches||[]).forEach(function(m){
 if(!m||m.sport!=='football'||typeof m.id!=='string'||m.home===m.away||m.bookKey&&m.bookKey!=='winamax_fr'||Date.parse(m.kickoff)<=now||Safe.paris(m.kickoff)!==day||!recent(m.asOf,now))return;
 (m.markets||[]).filter(function(g){return (!g.bookKey||g.bookKey==='winamax_fr')&&groupValid(g,step)&&recent(g.asOf,now);}).forEach(function(g){
  var p=Safe.probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return;
  g.outcomes.forEach(function(o,i){if(!step.codes.includes(o.code)||p[i]+1e-12<step.minLegProbability||o.odds<RULES.minLegOdds-1e-9||o.odds>RULES.maxOdds+1e-9)return;
   var id='football|'+m.id+'|'+m.kickoff+'|'+g.id+'|'+o.code;if(seen[id])return;seen[id]=1;
   out.push({id:id,matchId:m.id,sport:'football',gender:m.gender||'unspecified',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:Safe.paris(m.kickoff),code:o.code,label:o.label,o:o.odds,p:p[i],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:g.family,marketLine:g.line,marketParticipant:g.participant||'',est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'});});});});
 out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);});
 // Les combinés se cherchent parmi les sélections les plus probables ; un pari seul dans la fourchette est toujours gardé.
 return out.filter(function(l,i){return i<RULES.maxPool||l.o>=RULES.minOdds-1e-9;});}
function same(a,b){function k(s){return String(s||'').trim().toLowerCase();}return a.matchId===b.matchId||[a.home,a.away].some(function(n){return [k(b.home),k(b.away)].includes(k(n));});}
// Combinaison la plus probable dans la fourchette ; à égalité, moins de sélections.
function choose(pool){var best=null;
 function consider(legs){var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
  if(legs.length<RULES.minLegs||odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9||p+1e-12<RULES.minTicketProbability)return;var sig=legs.map(function(l){return l.id;}).sort().join('|');
  if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 (function walk(start,legs){if(legs.length)consider(legs);if(legs.length>=RULES.maxLegs)return;
  for(var i=start;i<pool.length;i++){if(i>=RULES.maxPool&&legs.length)break;if(legs.some(function(l){return same(l,pool[i]);}))continue;walk(i+1,legs.concat([pool[i]]));}})(0,[]);
 return best;}
// docs : documents Winamax football (data/sports/football.json puis football-goals.json), essayés dans l'ordre à chaque étape.
function build(docs,now){var day=Safe.paris(now),ok=(docs||[]).filter(function(d){return d&&d.status==='ok'&&(!d.bookKey||d.bookKey==='winamax_fr');}),ticket=null,step=-1,count=0;
 for(var s=0;s<RULES.steps.length&&!ticket;s++)for(var d=0;d<ok.length&&!ticket;d++){var pool=candidates(ok[d].matches,now,day,RULES.steps[s]);count=Math.max(count,pool.length);ticket=choose(pool);if(ticket)step=s;}
 if(ticket)ticket.step=step;
 return {day:day,ticket:ticket,candidates:count,source:ok.length?ok.map(function(d){return {status:d.status,updatedAt:d.updatedAt,matches:(d.matches||[]).length,source:d.source||null};}):null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(out.records.some(function(r){return r.id===id||r.day===built.day&&r.method==='reel';}))return out;var t=built.ticket;if(t&&!Paper.verified(t,now))return out;
 out.records.push({id:id,day:built.day,method:'reel',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',minOdds:RULES.minOdds,maxOdds:RULES.maxOdds,odds:t?t.odds:null,probability:t?t.p:null,step:t?t.step:null,legs:t?clone(t.legs).map(function(l){return l;}):[],executionVerified:false,sourceSnapshots:built.source?clone(built.source):[]});return out;}
return {rules:clone(RULES),candidates:candidates,choose:choose,build:build,append:append,settle:AlgoMix.settle};
});
