/* Ticket « Très sûr » : 1 ou 2 sélections football, cote Winamax totale 1,10 à 1,25.
   Fichier séparé : le journal v2 (Algo / Safe) et ses empreintes ne sont pas modifiés. Aucune mise réelle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./safe-multi-engine'),require('./paper-engine'));else root.TresSur=factory(root.SafeMulti,root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Safe,Paper){
'use strict';
var RULES={version:'tres-sur-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:100,currency:'EUR',
 minOdds:1.10,maxOdds:1.25,minLegProbability:.75,minTicketProbability:.75,maxLegs:2,families:['h2h','totals'],quoteMaxAgeMinutes:60,
 quotes:'cotes Winamax France relevées par API, jamais une moyenne de bookmakers ni une cote estimée'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function candidates(matches,now,day){var out=[],seen=new Set();(matches||[]).forEach(function(m){
 if(!m||m.sport!=='football'||!Safe.valid(m,now,day)||!recent(m.asOf,now))return;
 (m.markets||[]).filter(function(g){return RULES.families.includes(g.family)&&Safe.marketValid(g,m,now)&&recent(g.asOf,now);}).forEach(function(g){
  var p=Safe.probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return;
  g.outcomes.forEach(function(o,i){if(p[i]+1e-12<RULES.minLegProbability||!(o.odds>1)||o.odds>RULES.maxOdds+1e-9)return;
   var id='football|'+m.id+'|'+m.kickoff+'|'+g.id+'|'+o.code;if(seen.has(id))return;seen.add(id);
   out.push({id:id,matchId:m.id,sport:'football',gender:m.gender||'unspecified',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:Safe.paris(m.kickoff),code:o.code,label:o.label,o:o.odds,p:p[i],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:g.family,marketLine:g.line,marketParticipant:g.participant,est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'});});});});
 return out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);});}
function same(a,b){return a.matchId===b.matchId||[a.home,a.away].some(function(n){return [b.home,b.away].map(function(s){return s.trim().toLowerCase();}).includes(n.trim().toLowerCase());});}
// Ticket le plus probable dont la cote Winamax totale est dans la fourchette ; à égalité, moins de sélections.
function choose(pool){var best=null;function consider(legs){var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
 if(odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9||p+1e-12<RULES.minTicketProbability)return;var sig=legs.map(function(l){return l.id;}).sort().join('|');
 if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 pool.forEach(function(a,i){consider([a]);if(RULES.maxLegs>1)for(var j=i+1;j<pool.length;j++)if(!same(a,pool[j]))consider([a,pool[j]]);});return best;}
function build(doc,now){var day=Safe.paris(now),pool=doc&&doc.status==='ok'&&doc.bookKey==='winamax_fr'?candidates(doc.matches,now,day):[];return {day:day,ticket:choose(pool),candidates:pool.length,source:doc?{status:doc.status,updatedAt:doc.updatedAt,partial:!!doc.partial,matches:(doc.matches||[]).length}:null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;if(t&&!Paper.verified(t,now))return out;
 out.records.push({id:id,day:built.day,method:'tres_sur',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?t.odds:null,probability:t?t.p:null,legs:t?clone(t.legs):[],executionVerified:false,sourceSnapshots:built.source?[clone(built.source)]:[]});return out;}
function forDay(journal,day){return (journal&&journal.records||[]).find(function(r){return r.day===day&&r.method==='tres_sur';})||null;}
function stats(journal){return Paper.stats((journal&&journal.records||[]).filter(function(r){return r.method==='tres_sur';}),{});}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function price(v){return Number.isFinite(v)?v.toFixed(2).replace('.',','):'—';}
function hour(k){return new Date(k).toLocaleString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});}
function render(journal,day,now){var r=forDay(journal,day),s=stats(journal),head='<div class="eyebrow">Très sûr du jour</div><h2>La sélection la plus sûre · cote Winamax 1,10 à 1,25</h2>';
 var bilan=s.count?'<p class="status">Bilan : '+s.won+' gagné(s) / '+s.lost+' perdu(s) · réussite '+Math.round(100*s.won/s.count)+' %'+(s.pending?' · '+s.pending+' en attente':'')+'.</p>':'<p class="status">Nouveau ticket : pas encore de bilan.</p>';
 if(!journal)return head+'<p class="status">Journal Très sûr indisponible pour le moment.</p>';
 if(!r)return head+'<p class="status">Pas encore de ticket Très sûr pour ce jour. Il est créé à la collecte Winamax du matin.</p>'+bilan;
 if(r.status==='no_pick')return head+'<p class="status">Aucune sélection assez sûre dans la fourchette 1,10 à 1,25 parmi les cotes Winamax relevées ce jour-là.</p>'+bilan;
 var st={pending:'En attente',won:'Gagné',lost:'Perdu',void:'Annulé'}[r.status]||r.status;
 var now0=now===undefined?Date.now():now,started=r.legs.some(function(l){return Date.parse(l.kickoff)<=now0;});
 return head+'<ul class="tres-sur-legs">'+r.legs.map(function(l){return '<li><b>'+esc(l.home)+' – '+esc(l.away)+'</b> · '+esc(hour(l.kickoff))+'<br>'+esc(l.label)+' · cote Winamax <b>'+price(l.o)+'</b> · '+Math.round(100*l.p)+' %</li>';}).join('')+'</ul>'+
  '<p><b>Cote totale Winamax : '+price(r.odds)+'</b> · chance estimée '+Math.round(100*r.probability)+' % · '+esc(st)+'</p>'+
  '<p class="status">Cotes relevées directement chez Winamax le '+esc(new Date(r.legs[0].asOf||r.createdAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+' (pas de moyenne ni d’estimation). Vérifie la cote avant de miser'+(started?'':' : si elle est passée sous 1,10, le ticket ne vaut plus le coup')+'.</p>'+bilan;}
return {rules:clone(RULES),candidates:candidates,choose:choose,build:build,append:append,settle:Paper.settle,forDay:forDay,stats:stats,render:render};
});
