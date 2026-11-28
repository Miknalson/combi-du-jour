/* Remplacement de Safe but : BTTS Oui sur 2 à 3 rencontres distinctes.
   Cotes Winamax collectées uniquement ; journal fictif, anciennes versions conservées. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./paper-engine'),require('./bet-results'));else root.SafeBut=factory(root.PaperTests,root.BetResults);})(typeof globalThis!=='undefined'?globalThis:this,function(Paper,Results){
'use strict';
var RULES={version:'btts-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:100,currency:'EUR',
 minOdds:1.50,maxOdds:2.00,minLegs:2,maxLegs:3,minLegProbability:.60,minTicketProbability:.50,quoteMaxAgeMinutes:60,
 markets:'les deux équipes marquent : oui, sur au moins deux matchs distincts',quotes:'cotes Winamax France collectées, aucune estimation'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function power(a,b){if(!Number.isFinite(a)||!Number.isFinite(b)||a<=1||b<=1)return null;var lo=0,hi=1;while(Math.pow(1/a,hi)+Math.pow(1/b,hi)>1&&hi<1024)hi*=2;for(var i=0;i<80;i++){var k=(lo+hi)/2;if(Math.pow(1/a,k)+Math.pow(1/b,k)>1)lo=k;else hi=k;}var k2=(lo+hi)/2;return [Math.pow(1/a,k2),Math.pow(1/b,k2)];}
function documents(docs){return Array.isArray(docs)?docs:[docs];}
function candidates(docs,now){var day=paris(now),by={};documents(docs).forEach(function(doc){
 if(!doc||doc.status!=='ok'||doc.bookKey!=='winamax_fr')return;
 (doc.matches||[]).forEach(function(m){var t=Date.parse(m&&m.kickoff);
 if(!m||m.sport!=='football'||!m.id||!m.home||!m.away||m.home===m.away||m.bookKey!=='winamax_fr'||!Number.isFinite(t)||t<=now||paris(t)!==day||m.score||!recent(m.asOf,now))return;
 (m.markets||[]).forEach(function(g){if(!g||g.family!=='btts'||g.bookKey!=='winamax_fr'||g.est||g.quoteSource==='user'||!recent(g.asOf,now)||!Array.isArray(g.outcomes)||g.outcomes.length!==2)return;
 var y=g.outcomes.find(function(o){return o.side==='yes'&&o.code==='BTTS_Y';}),n=g.outcomes.find(function(o){return o.side==='no'&&o.code==='BTTS_N';});
 if(!y||!n)return;var p=power(y.odds,n.odds);if(!p||p[0]+1e-12<RULES.minLegProbability||y.odds>RULES.maxOdds)return;
 var l={id:'football|'+m.id+'|'+m.kickoff+'|btts|BTTS_Y',matchId:m.id,sport:'football',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:day,
 code:'BTTS_Y',label:'Les deux équipes marquent : Oui',o:y.odds,p:p[0],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:'btts',marketLine:null,est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'};
 var key=m.home.trim().toLowerCase()+'|'+m.away.trim().toLowerCase()+'|'+t,prev=by[key];if(!prev||Date.parse(l.asOf)>Date.parse(prev.asOf))by[key]=l;
 });});});return Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return b.p-a.p||a.id.localeCompare(b.id);});}
function same(a,b){function k(s){return String(s||'').trim().toLowerCase();}return a.matchId===b.matchId||[k(a.home),k(a.away)].some(function(n){return [k(b.home),k(b.away)].includes(n);});}
function choose(pool){var best=null;
 function walk(start,legs,odds,p){if(odds>RULES.maxOdds+1e-9||p+1e-12<RULES.minTicketProbability||best&&p<best.p-1e-12)return;
 if(legs.length>=RULES.minLegs&&odds>=RULES.minOdds-1e-9){var sig=legs.map(function(l){return l.id;}).sort().join('|');if(!best||p>best.p+1e-12||Math.abs(p-best.p)<1e-12&&(legs.length<best.legs.length||legs.length===best.legs.length&&sig<best.signature))best={legs:clone(legs),odds:odds,p:p,signature:sig};}
 if(legs.length===RULES.maxLegs)return;for(var i=start;i<pool.length;i++){var l=pool[i];if(l.code!=='BTTS_Y'||l.est||l.bookKey!=='winamax_fr'||l.p+1e-12<RULES.minLegProbability||legs.some(function(x){return same(x,l);}))continue;walk(i+1,legs.concat([l]),odds*l.o,p*l.p);}}
 walk(0,[],1,1);return best;}
function build(docs,now){var pool=candidates(docs,now),src=documents(docs).filter(Boolean);return {day:paris(now),ticket:choose(pool),candidates:pool.length,fresh:src.some(function(d){return d.status==='ok'&&d.bookKey==='winamax_fr'&&recent(d.updatedAt,now);})||pool.length>0,source:src.map(function(d){return {status:d.status,updatedAt:d.updatedAt,matches:(d.matches||[]).length};})};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';if(!built.fresh||out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;
 if(t&&(!Paper.verified(t,now)||t.legs.length<RULES.minLegs||t.legs.length>RULES.maxLegs||t.legs.some(function(l,i){return l.code!=='BTTS_Y'||t.legs.slice(0,i).some(function(x){return same(x,l);});})))return out;
 out.records.push({id:id,day:built.day,method:'btts',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?t.odds:null,probability:t?t.p:null,legs:t?clone(t.legs):[],executionVerified:false,sourceSnapshots:clone(built.source||[])});return out;}
function settle(record,matches,today){if(record.method!=='btts')return Paper.settle(record,matches,today);if((record.status!=='pending'&&record.resultSource!=='application-football-score')||record.day>today)return record;
 var done=true,lost=false;record.legs.forEach(function(l){var m=Results.findMatch(l,matches);if(!m||!Paper.finalFor(m,record.day,today)||m.scoreScope&&m.scoreScope!=='regulation'){done=false;return;}var s=m.score.split('-').map(Number);if(l.code!=='BTTS_Y')done=false;else if(s[0]===0||s[1]===0)lost=true;});
 if(!done&&!lost)return record;var status=lost?'lost':'won';if(status===record.status&&record.resultSource==='application-football-score')return record;return Object.assign({},record,{status:status,resultSource:'application-football-score'});}
return {rules:clone(RULES),power:power,candidates:candidates,choose:choose,build:build,append:append,settle:settle};
});
