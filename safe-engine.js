(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SafeDay=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var SPORTS=['football','basket','tennis'],MAX_AGE=86400000,MIN_PROBABILITY=.70;
function paris(stamp){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));}
function fresh(stamp,now){var age=now-Date.parse(stamp);return Number.isFinite(age)&&age>=0&&age<=MAX_AGE;}
function probabilities(prices){
 if(!Array.isArray(prices)||![2,3].includes(prices.length)||prices.some(function(o){return !Number.isFinite(o)||o<=1;}))return null;
 var inverse=prices.map(function(o){return 1/o;}),sum=inverse.reduce(function(a,b){return a+b;},0);if(sum<1-1e-9||sum>1.5)return null;
 var lo=0,hi=1;while(inverse.reduce(function(a,x){return a+Math.pow(x,hi);},0)>1&&hi<1024)hi*=2;
 for(var i=0;i<70;i++){var k=(lo+hi)/2;if(inverse.reduce(function(a,x){return a+Math.pow(x,k);},0)>1)lo=k;else hi=k;}
 var p=inverse.map(function(x){return Math.pow(x,(lo+hi)/2);}),total=p.reduce(function(a,b){return a+b;},0);return p.map(function(x){return x/total;});
}
function valid(m,now,day){return m&&SPORTS.includes(m.sport)&&typeof m.id==='string'&&m.id&&typeof m.home==='string'&&typeof m.away==='string'&&m.home!==m.away&&m.bookKey==='winamax_fr'&&!m.est&&Date.parse(m.kickoff)>now&&fresh(m.asOf,now)&&(!day||paris(m.kickoff)===day);}
function marketValid(g,m,now){
 if(!g||g.bookKey!=='winamax_fr'||g.quoteSource==='user'||g.est||!fresh(g.asOf,now)||!Array.isArray(g.outcomes))return false;
 if(g.family==='h2h'){var sides=g.outcomes.map(function(o){return o.side;}).sort().join(',');return m.sport==='football'?sides==='1,2,X':sides==='1,2';}
 if(!['spreads','totals','sets','team_totals'].includes(g.family)||g.outcomes.length!==2||!Number.isFinite(g.line)||Math.abs(Math.abs(g.line%1)-.5)>1e-8)return false;
 if(['totals','sets','team_totals'].includes(g.family)&&g.line<=0)return false;
 if(g.family==='sets'&&(m.sport!=='tennis'||g.line!==.5||![m.home,m.away].includes(g.participant)))return false;
 if(g.family==='team_totals'&&![m.home,m.away].includes(g.participant))return false;
 return g.outcomes.map(function(o){return o.side;}).sort().join(',')===(g.family==='spreads'?'1,2':'over,under');
}
function candidates(matches,options){
 var now=options.now===undefined?Date.now():options.now,out=[],seen=new Set();
 (matches||[]).forEach(function(m){if(!valid(m,now,options.day))return;
  (m.markets||[]).filter(function(g){return marketValid(g,m,now);}).forEach(function(g){
   var p=probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return;
   g.outcomes.forEach(function(o,i){
    if(!o||typeof o.label!=='string'||!o.label||p[i]<=MIN_PROBABILITY||o.odds>2||g.family==='sets'&&o.side!=='over')return;
    var id=m.sport+'|'+m.id+'|'+m.kickoff+'|'+g.id+'|'+o.code;if(seen.has(id))return;seen.add(id);
    out.push({id:id,matchId:m.id,sport:m.sport,league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:paris(m.kickoff),code:o.code,label:o.label,o:o.odds,p:p[i],bookKey:'winamax_fr',asOf:g.asOf,marketId:g.id,marketFamily:g.family,est:false,quoteSource:'api',probabilityMethod:'winamax-power-devig'});
   });
  });
 });return out.sort(function(a,b){return b.p-a.p||a.o-b.o||a.id.localeCompare(b.id);});
}
function ticket(legs){return {legs:legs.slice(),odds:legs.reduce(function(a,l){return a*l.o;},1),p:legs.reduce(function(a,l){return a*l.p;},1),signature:legs.map(function(l){return l.id;}).sort().join('|')};}
function better(a,b){return !b||a.p>b.p+1e-12||Math.abs(a.p-b.p)<1e-12&&(a.legs.length<b.legs.length||a.legs.length===b.legs.length&&a.signature<b.signature);}
function distinct(legs,l){return !legs.some(function(x){return x.sport===l.sport&&(x.matchId===l.matchId||[x.home,x.away].some(function(n){return [l.home,l.away].map(function(s){return s.trim().toLowerCase();}).includes(n.trim().toLowerCase());}));});}
function choose(pool,mixed){
 var best=null,groups=[];
 if(mixed){groups=SPORTS.map(function(s){return pool.filter(function(l){return l.sport===s;});});if(groups.some(function(g){return !g.length;}))return null;}
 function visit(legs,start,odds,p){
  if(odds>2+1e-9||p<=MIN_PROBABILITY||best&&p<best.p-1e-12)return;
  if(legs.length&&odds>=1.5-1e-9&&p>MIN_PROBABILITY&&(!mixed||legs.length===3)){var t=ticket(legs);if(better(t,best))best=t;}
  if(legs.length===3||!mixed&&odds>=1.5-1e-9)return;
  var list=mixed?groups[legs.length]:pool;
  for(var i=mixed?0:start;i<list.length;i++){var l=list[i];if(!distinct(legs,l))continue;visit(legs.concat([l]),i+1,odds*l.o,p*l.p);}
 }
 visit([],0,1,1);return best;
}
function build(matches,options){var pool=candidates(matches,options),slots={};SPORTS.forEach(function(s){slots[s]=choose(pool.filter(function(l){return l.sport===s;}),false);});slots.mixed=choose(pool,true);return {day:options.day,generatedAt:new Date(options.now===undefined?Date.now():options.now).toISOString(),slots:slots,shortlist:pool,candidateCounts:Object.fromEntries(SPORTS.map(function(s){return [s,pool.filter(function(l){return l.sport===s;}).length];}))};}
function documents(docs){return (docs||[]).filter(function(d){return d&&d.status==='ok'&&d.bookKey==='winamax_fr'&&SPORTS.includes(d.sport)&&Array.isArray(d.matches);}).flatMap(function(d){return d.matches.filter(function(m){return m.sport===d.sport;});});}
return {MIN_PROBABILITY:MIN_PROBABILITY,SPORTS:SPORTS,paris:paris,fresh:fresh,probabilities:probabilities,candidates:candidates,build:build,documents:documents,valid:valid};
});
