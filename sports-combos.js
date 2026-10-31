(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SportCombos=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function fresh(stamp,now){var age=now-Date.parse(stamp);return age>=0&&age<=86400000;}
function valid(m,now){return typeof m.id==='string'&&m.id.length>0&&['basket','tennis'].includes(m.sport)&&m.bookKey==='winamax_fr'&&m.market==='h2h'&&Date.parse(m.kickoff)>now&&fresh(m.asOf,now)&&Number.isFinite(m.o1)&&Number.isFinite(m.o2)&&m.o1>1&&m.o2>1;}
function key(m){return m.sport+'|'+m.id+'|'+m.kickoff;}
function probabilities(prices){
 if(prices.length!==2||prices.some(function(o){return !Number.isFinite(o)||o<=1;}))return null;
 var inverse=prices.map(function(o){return 1/o;}),lo=0,hi=1;
 while(inverse.reduce(function(a,x){return a+Math.pow(x,hi);},0)>1&&hi<1024)hi*=2;
 for(var i=0;i<70;i++){var k=(lo+hi)/2;if(inverse.reduce(function(a,x){return a+Math.pow(x,k);},0)>1)lo=k;else hi=k;}
 var values=inverse.map(function(x){return Math.pow(x,(lo+hi)/2);}),sum=values[0]+values[1];return values.map(function(v){return v/sum;});
}
function markets(m,now){
 if(!valid(m,now))return [];
 var fallback={id:'h2h',family:'h2h',unit:'match',bookKey:m.bookKey,asOf:m.asOf,outcomes:[{code:'1',label:'Victoire '+m.home,participant:m.home,side:'1',odds:m.o1},{code:'2',label:'Victoire '+m.away,participant:m.away,side:'2',odds:m.o2}]};
 var groups=[fallback].concat((m.markets||[]).filter(function(g){return g.family!=='h2h';}));
 var unique=new Map();groups.forEach(function(g){if(!g||!Array.isArray(g.outcomes))return;var id=g.family+'|'+g.line+'|'+(g.participant||'');var old=unique.get(id);if(!old||Date.parse(g.asOf)>Date.parse(old.asOf))unique.set(id,g);});
 return Array.from(unique.values()).filter(function(g){return g.bookKey==='winamax_fr'&&fresh(g.asOf,now)&&['h2h','spreads','totals','sets','team_totals'].includes(g.family)&&g.outcomes&&g.outcomes.length===2&&g.outcomes.every(function(o){return o&&typeof o.label==='string';});}).map(function(g){var p=probabilities(g.outcomes.map(function(o){return o.odds;}));if(!p)return null;return Object.assign({},g,{outcomes:g.outcomes.map(function(o,i){return Object.assign({},o,{probability:p[i]});})});}).filter(Boolean);
}
function candidates(m,options){
 var now=options.now===undefined?Date.now():options.now,groups=markets(m,now),h2h=groups.find(function(g){return g.family==='h2h';});if(!h2h)return [];
 var favourite=h2h.outcomes[0].probability>=h2h.outcomes[1].probability?'1':'2',minimum=options.minimumProbability===undefined?.5:Number(options.minimumProbability),allowed=options.families||['h2h','spreads','totals','sets','team_totals'];
 // A fixed direction per market family, before the number of selections or odds range is considered.
 var anchors={};groups.filter(function(g){return g.family==='totals'||g.family==='team_totals';}).forEach(function(g){var candidate=g.outcomes[0].probability>=g.outcomes[1].probability?g.outcomes[0]:g.outcomes[1],anchor=g.family+'|'+(g.participant||'');if(!anchors[anchor]||candidate.probability>anchors[anchor].probability)anchors[anchor]=candidate;});
 if(!Number.isFinite(minimum)||minimum<0||minimum>1)return [];
 var out=[];groups.forEach(function(g){if(!allowed.includes(g.family))return;g.outcomes.forEach(function(o){
  if(o.probability+1e-12<minimum)return;
  if(g.family==='h2h'&&o.side!==favourite)return;
  if(g.family==='spreads'&&o.side!==favourite)return;
  if(g.family==='sets'&&(g.line!==.5||o.side!=='over'))return;
  if((g.family==='totals'||g.family==='team_totals')&&o.side!==anchors[g.family+'|'+(g.participant||'')].side)return;
  out.push({match:m,code:o.code,label:o.label,o:o.odds,p:o.probability,marketId:g.id,family:g.family,asOf:g.asOf,quoteSource:g.quoteSource||'api'});
 });});return out.sort(function(a,b){return b.p-a.p||a.code.localeCompare(b.code);});
}
function find(matches,options){
 var min=Number(options.min),max=Number(options.max),count=Number(options.count),now=options.now===undefined?Date.now():options.now;
 if(!Number.isFinite(min)||!Number.isFinite(max)||min<=1||max<min||max>100||![2,3,4].includes(count))return [];
 var seen=new Set(),pool=matches.filter(function(m){var k=m.sport+'|'+m.id;if(!valid(m,now)||seen.has(k))return false;seen.add(k);return true;}).sort(function(a,b){return Date.parse(a.kickoff)-Date.parse(b.kickoff)||key(a).localeCompare(key(b));}).slice(0,12).map(function(m){var used=new Set(),legs=candidates(m,options).filter(function(l){var group=l.family+'|'+(l.family==='sets'||l.family==='team_totals'?l.label.split(' · ')[0]:'');if(used.has(group))return false;used.add(group);return true;});return {match:m,legs:legs.slice(0,6)};});
 var out=[];
 function rank(a,b){return b.p-a.p||Math.abs(a.odds-(min+max)/2)-Math.abs(b.odds-(min+max)/2)||a.signature.localeCompare(b.signature);}
 function visit(start,legs,odds,p,participants){
  if(legs.length===count){if(odds+1e-9<min||odds-1e-9>max)return;if(options.mixed&&new Set(legs.map(function(l){return l.match.sport;})).size!==2)return;out.push({legs:legs.slice(),odds:odds,p:p,signature:legs.map(function(l){return key(l.match)+l.code;}).join('|')});out.sort(rank);if(out.length>6)out.pop();return;}
  if(out.length===6&&p<out[5].p)return;
  for(var i=start;i<=pool.length-(count-legs.length);i++){
   var m=pool[i].match,ids=[m.home,m.away].map(function(n){return m.sport+'|'+n.trim().toLowerCase();});if(ids.some(function(id){return participants.has(id);}))continue;
   var next=new Set(participants);ids.forEach(function(id){next.add(id);});
   for(var l of pool[i].legs){var total=odds*l.o;if(total>max+1e-9)continue;legs.push(l);visit(i+1,legs,total,p*l.p,next);legs.pop();}
  }
 }
 visit(0,[],1,1,new Set());return out;
}
return {find:find,valid:valid,key:key,probabilities:probabilities,markets:markets,candidates:candidates};
});
