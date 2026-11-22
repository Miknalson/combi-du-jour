/* Ticket « Safe but » : 1 à 3 paris « plus / moins de X,5 buts », cote totale 1,50 à 2,00, mise fictive 100 €.
   La source ne fournit pas les cotes de buts Winamax : on part de la cote moyenne du marché (data/days)
   et on retire 5 % pour approcher le prix Winamax sans gonfler la rentabilité. Aucune mise réelle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./paper-engine'));else root.SafeBut=factory(root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Paper){
'use strict';
var RULES={version:'safe-but-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:100,currency:'EUR',
 minOdds:1.50,maxOdds:2.00,minLegProbability:.60,minTicketProbability:.60,maxLegs:3,maxPool:14,oddsHaircut:.05,quoteMaxAgeMinutes:240,
 markets:'plus / moins de X,5 buts (lignes entières et quarts exclus)',
 quotes:'cote moyenne des bookmakers européens moins 5 %, faute de cote de buts Winamax chez le fournisseur ; à vérifier dans l’appli Winamax'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
// Probabilités hors marge par la méthode puissance : (1/oA)^k + (1/oB)^k = 1.
function power(a,b){if(!(a>1&&b>1))return null;var lo=.3,hi=3;for(var i=0;i<80;i++){var k=(lo+hi)/2,s=Math.pow(1/a,k)+Math.pow(1/b,k);if(s>1)lo=k;else hi=k;}var k2=(lo+hi)/2;return [Math.pow(1/a,k2),Math.pow(1/b,k2)];}
function line(l){return String(l).replace('.',',');}
function candidates(doc,now){var out=[],day=paris(now);
 (doc&&doc.matches||[]).forEach(function(m){
  var t=Date.parse(m.kickoff);if(!m||!m.ou||!m.mine||!Number.isFinite(t)||t<=now||paris(t)!==day||m.score)return;
  Object.keys(m.ou).forEach(function(k){var n=Number(k),q=m.ou[k];if(!Number.isFinite(n)||Math.abs(n%1-.5)>1e-9||!q)return;
   var p=power(Number(q.o),Number(q.u));if(!p)return;
   [['O',q.o,p[0],'Plus de '+line(k)+' buts'],['U',q.u,p[1],'Moins de '+line(k)+' buts']].forEach(function(s){
    var o=Math.round(Number(s[1])*(1-RULES.oddsHaircut)*100)/100;if(s[2]+1e-12<RULES.minLegProbability||!(o>1)||o>RULES.maxOdds+1e-9)return;
    out.push({id:'football|'+m.id+'|'+m.kickoff+'|totals|'+s[0]+k,matchId:m.id,sport:'football',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:paris(t),
     code:s[0]+k,label:s[3],o:o,marketOdds:Number(s[1]),p:s[2],bookKey:'market_avg',asOf:doc.updatedAt,marketFamily:'totals',marketLine:n,est:true,quoteSource:'market-average-minus-5pct',probabilityMethod:'market-power-devig'});});});});
 return out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);}).slice(0,RULES.maxPool);}
// Ticket le plus probable dans la fourchette, une sélection par match ; à égalité, moins de sélections.
function choose(pool){var best=null;
 function consider(legs){var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
  if(odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9||p+1e-12<RULES.minTicketProbability)return;var sig=legs.map(function(l){return l.id;}).sort().join('|');
  if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 (function walk(start,legs){if(legs.length)consider(legs);if(legs.length>=RULES.maxLegs)return;
  for(var i=start;i<pool.length;i++){if(legs.some(function(l){return l.matchId===pool[i].matchId;}))continue;walk(i+1,legs.concat([pool[i]]));}})(0,[]);
 return best;}
function fresh(doc,now){var age=now-Date.parse(doc&&doc.updatedAt);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function build(doc,now){var pool=fresh(doc,now)?candidates(doc,now):[];return {day:paris(now),ticket:choose(pool),candidates:pool.length,fresh:fresh(doc,now),source:doc?{updatedAt:doc.updatedAt,source:doc.source,matches:(doc.matches||[]).length}:null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(!built.fresh||out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;
 if(t&&!t.legs.every(function(l){return Date.parse(l.kickoff)>now&&l.o>1;}))return out;
 out.records.push({id:id,day:built.day,method:'safe_but',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?Math.round(t.odds*1e4)/1e4:null,probability:t?t.p:null,legs:t?clone(t.legs):[],oddsNote:'cote marché −5 %, à vérifier chez Winamax',executionVerified:false,sourceSnapshots:built.source?[clone(built.source)]:[]});
 return out;}
return {rules:clone(RULES),power:power,candidates:candidates,choose:choose,build:build,append:append,settle:Paper.settle};
});
