/* Ticket « Safe but » : 1 à 3 paris « plus / moins de X,5 buts », cote totale 1,50 à 2,00, mise fictive 100 €.
   v2 (28/11/2026) : le ticket n'était jamais sorti. Trois raisons :
   - il ne lisait que la cote moyenne du marché (m.ou), absente depuis la panne de crédits du 24/11, alors que
     les vraies cotes de buts Winamax sont maintenant relevées (m.mine.ou, via OddsPapi) ;
   - la fraîcheur se mesurait à l'heure du fichier (updatedAt), restée bloquée, et non à l'heure des cotes ;
   - 60 % de réussite pour une cote d'au moins 1,50 est quasi impossible avec la marge de Winamax sur les buts
     (1 ticket possible en 30 jours) : seuil du ticket ramené à 50 %, comme le Safe foot. Sélections toujours ≥ 60 %.
   Priorité aux cotes Winamax réelles ; à défaut, cote moyenne du marché moins 5 %. Aucune mise réelle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./paper-engine'));else root.SafeBut=factory(root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Paper){
'use strict';
var RULES={version:'safe-but-v2',sport:'football',mode:'paper',realMoneyEnabled:false,stake:100,currency:'EUR',
 minOdds:1.50,maxOdds:2.00,minLegProbability:.60,minTicketProbability:.50,maxLegs:3,maxPool:14,oddsHaircut:.05,quoteMaxAgeMinutes:240,
 markets:'plus / moins de X,5 buts (lignes entières et quarts exclus)',
 quotes:'cote de buts Winamax relevée (OddsPapi) ; à défaut, cote moyenne des bookmakers européens moins 5 %'};
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function clone(v){return JSON.parse(JSON.stringify(v));}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
// Probabilités hors marge par la méthode puissance : (1/oA)^k + (1/oB)^k = 1.
function power(a,b){if(!(a>1&&b>1))return null;var lo=.3,hi=3;for(var i=0;i<80;i++){var k=(lo+hi)/2,s=Math.pow(1/a,k)+Math.pow(1/b,k);if(s>1)lo=k;else hi=k;}var k2=(lo+hi)/2;return [Math.pow(1/a,k2),Math.pow(1/b,k2)];}
function line(l){return String(l).replace('.',',');}
// Cotes de buts d'un match : Winamax réelles si récentes, sinon moyenne du marché moins 5 % si le fichier est récent.
function quotes(m,doc,now){var own=m.mine&&m.mine.ou||{},out={};
 Object.keys(own).forEach(function(k){var q=own[k],at=q&&(q.asOf||m.mine.asOf);if(q&&Number(q.o)>1&&Number(q.u)>1&&recent(at,now))out[k]={o:Number(q.o),u:Number(q.u),asOf:at,winamax:true};});
 if(Object.keys(out).length||!recent(doc.updatedAt,now))return out;
 Object.keys(m.ou||{}).forEach(function(k){var q=m.ou[k];if(q&&Number(q.o)>1&&Number(q.u)>1)out[k]={o:Number(q.o),u:Number(q.u),asOf:doc.updatedAt,winamax:false};});
 return out;}
function candidates(doc,now){var out=[],day=paris(now);
 (doc&&doc.matches||[]).forEach(function(m){
  var t=Date.parse(m&&m.kickoff);if(!m||!m.mine||!Number.isFinite(t)||t<=now||paris(t)!==day||m.score)return;var ou=quotes(m,doc,now);
  Object.keys(ou).forEach(function(k){var n=Number(k),q=ou[k];if(!Number.isFinite(n)||Math.abs(n%1-.5)>1e-9)return;
   var p=power(q.o,q.u);if(!p)return;
   [['O',q.o,p[0],'Plus de '+line(k)+' buts'],['U',q.u,p[1],'Moins de '+line(k)+' buts']].forEach(function(s){
    var o=q.winamax?s[1]:Math.round(s[1]*(1-RULES.oddsHaircut)*100)/100;if(s[2]+1e-12<RULES.minLegProbability||!(o>1)||o>RULES.maxOdds+1e-9)return;
    out.push({id:'football|'+m.id+'|'+m.kickoff+'|totals|'+s[0]+k,matchId:m.id,sport:'football',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:paris(t),
     code:s[0]+k,label:s[3],o:o,marketOdds:s[1],p:s[2],bookKey:q.winamax?'winamax_fr':'market_avg',asOf:q.asOf,marketFamily:'totals',marketLine:n,est:!q.winamax,
     quoteSource:q.winamax?'winamax':'market-average-minus-5pct',probabilityMethod:q.winamax?'winamax-power-devig':'market-power-devig'});});});});
 return out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);}).slice(0,RULES.maxPool);}
// Ticket le plus probable dans la fourchette, une sélection par match ; à égalité, moins de sélections.
function choose(pool){var best=null;
 function consider(legs){var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
  if(odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9||p+1e-12<RULES.minTicketProbability)return;var sig=legs.map(function(l){return l.id;}).sort().join('|');
  if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 (function walk(start,legs){if(legs.length)consider(legs);if(legs.length>=RULES.maxLegs)return;
  for(var i=start;i<pool.length;i++){if(legs.some(function(l){return l.matchId===pool[i].matchId;}))continue;walk(i+1,legs.concat([pool[i]]));}})(0,[]);
 return best;}
// « Frais » = au moins une cote de buts récente (Winamax, ou moyenne du marché d'un fichier récent).
function fresh(doc,now){return !!(doc&&(doc.matches||[]).some(function(m){return m&&m.mine&&Object.keys(quotes(m,doc,now)).length;}));}
function build(doc,now){var ok=fresh(doc,now),pool=ok?candidates(doc,now):[];return {day:paris(now),ticket:choose(pool),candidates:pool.length,fresh:ok,source:doc?{updatedAt:doc.updatedAt,source:doc.source,matches:(doc.matches||[]).length}:null};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(!built.fresh||out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;
 if(t&&!t.legs.every(function(l){return Date.parse(l.kickoff)>now&&l.o>1;}))return out;
 out.records.push({id:id,day:built.day,method:'safe_but',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?Math.round(t.odds*1e4)/1e4:null,probability:t?t.p:null,legs:t?clone(t.legs):[],oddsNote:t&&t.legs.every(function(l){return !l.est;})?'cotes Winamax relevées, à vérifier avant de miser':'cote marché −5 %, à vérifier chez Winamax',executionVerified:false,sourceSnapshots:built.source?[clone(built.source)]:[]});
 return out;}
return {rules:clone(RULES),power:power,candidates:candidates,choose:choose,build:build,append:append,settle:Paper.settle};
});
