(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SportCombos=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function valid(m,now){var age=now-Date.parse(m.asOf);return typeof m.id==='string'&&m.id.length>0&&['basket','tennis'].includes(m.sport)&&m.bookKey==='winamax_fr'&&m.market==='h2h'&&Date.parse(m.kickoff)>now&&age>=0&&age<=86400000&&Number.isFinite(m.o1)&&Number.isFinite(m.o2)&&m.o1>1&&m.o2>1;}
function key(m){return m.sport+'|'+m.id+'|'+m.kickoff;}
function find(matches,options){
 var min=Number(options.min),max=Number(options.max),count=Number(options.count),now=options.now===undefined?Date.now():options.now;
 if(!Number.isFinite(min)||!Number.isFinite(max)||min<=1||max<min||max>100||![2,3,4].includes(count))return [];
 var seen=new Set(),pool=matches.filter(function(m){var k=m.sport+'|'+m.id;if(!valid(m,now)||seen.has(k))return false;seen.add(k);return true;}).sort(function(a,b){return Date.parse(a.kickoff)-Date.parse(b.kickoff)||key(a).localeCompare(key(b));}).slice(0,20);
 var out=[],target=(min+max)/2;
 function visit(start,legs,odds){
  if(legs.length===count){if(odds+1e-9<min||odds-1e-9>max)return;if(options.mixed&&!legs.some(function(l){return l.match.sport==='basket';}))return;if(options.mixed&&!legs.some(function(l){return l.match.sport==='tennis';}))return;
   out.push({legs:legs.slice(),odds:odds});out.sort(function(a,b){return Math.abs(a.odds-target)-Math.abs(b.odds-target);});if(out.length>6)out.pop();return;}
  for(var i=start;i<=pool.length-(count-legs.length);i++)for(var side of ['1','2']){var price=pool[i]['o'+side],total=odds*price;if(total>max+1e-9)continue;legs.push({match:pool[i],code:side,label:side==='1'?pool[i].home:pool[i].away,o:price});visit(i+1,legs,total);legs.pop();}
 }
 visit(0,[],1);
 out.sort(function(a,b){return Math.abs(a.odds-target)-Math.abs(b.odds-target)||JSON.stringify(a.legs.map(function(l){return key(l.match)+l.code;})).localeCompare(JSON.stringify(b.legs.map(function(l){return key(l.match)+l.code;})));});
 return out.slice(0,6);
}
return {find:find,valid:valid,key:key};
});
