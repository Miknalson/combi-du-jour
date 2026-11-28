/* Ticket « Simulation » : la simulation personnelle de l'appli proposée chaque jour comme un ticket du jour (demandé par Nano le 28/11/2026).
   Réglages proches des siens : victoires et plus/moins 2,5 buts (cotes Winamax relevées) + handicaps ±1,5 et ±2,5 (cotes ESTIMÉES ≈,
   Winamax ne les donne pas à notre source), cote totale 2 à 3, 2 à 5 matchs, au moins 50 % par sélection, un pari par match.
   Probabilité des handicaps : grille de Poisson ajustée sur le 1N2 et le 2,5 buts Winamax (même calcul que l'écran Analyse).
   Cote estimée = marge 5 % puis −3 % de prudence. Rétro-test 25/10–27/11 de la simulation : 13 gagnés sur 27, ≈ équilibre.
   Mise fictive 50 €, aucune mise réelle. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./safe-multi-engine'),require('./paper-engine'));else root.Simu=factory(root.SafeMulti,root.PaperTests);})(typeof globalThis!=='undefined'?globalThis:this,function(Safe,Paper){
'use strict';
var RULES={version:'simu-v1',sport:'football',mode:'paper',realMoneyEnabled:false,stake:50,currency:'EUR',
 minOdds:2.00,maxOdds:3.00,minLegs:2,maxLegs:5,minLegProbability:.50,minLegOdds:1.10,handicaps:[-2.5,-1.5,1.5,2.5],estMargin:.05,estHaircut:1.03,quoteMaxAgeMinutes:60,
 quotes:'victoires et 2,5 buts : cotes Winamax France relevées par API ; handicaps : cotes estimées (≈) à vérifier chez Winamax'};
function clone(v){return JSON.parse(JSON.stringify(v));}
function k(s){return String(s||'').trim().toLowerCase();}
function recent(t,now){var age=now-Date.parse(t);return Number.isFinite(age)&&age>=0&&age<=RULES.quoteMaxAgeMinutes*60000;}
function fmt(L){return (L>0?'+':'')+String(L).replace('.',',');}
// Grille de scores de Poisson ajustée sur les probabilités 1N2 (et le 2,5 buts s'il est coté).
function pois(l){var out=[],f=Math.exp(-l);for(var i=0;i<=10;i++){out.push(f);f*=l/(i+1);}return out;}
function grid(lh,la){var a=pois(lh),b=pois(la),g=[];for(var i=0;i<=10;i++){g.push([]);for(var j=0;j<=10;j++)g[i].push(a[i]*b[j]);}return g;}
function fit(p,over25){
 function err(lh,la){var g=grid(lh,la),h=0,a=0,o=0;for(var i=0;i<=10;i++)for(var j=0;j<=10;j++){if(i>j)h+=g[i][j];else if(i<j)a+=g[i][j];if(i+j>2.5)o+=g[i][j];}
  var e=(h-p[0])*(h-p[0])+(a-p[2])*(a-p[2]);if(over25!=null)e+=(o-over25)*(o-over25);return e;}
 var best=[1.4,1.1],be=Infinity,lh,la,e;
 for(lh=0.2;lh<=4.01;lh+=0.1)for(la=0.2;la<=4.01;la+=0.1){e=err(lh,la);if(e<be){be=e;best=[lh,la];}}
 var c=best.slice();
 for(lh=c[0]-0.1;lh<=c[0]+0.101;lh+=0.01)for(la=c[1]-0.1;la<=c[1]+0.101;la+=0.01){if(lh<=0.05||la<=0.05)continue;e=err(lh,la);if(e<be){be=e;best=[lh,la];}}
 return grid(best[0],best[1]);}
// Règle de règlement des codes de ce ticket (H1+1.5 = handicap domicile +1,5 ; H2-1.5 = handicap extérieur −1,5).
function settleCode(code,h,a){code=String(code||'');
 if(code==='1')return h>a;if(code==='2')return a>h;
 if(/^[OU]\d+(\.\d+)?$/.test(code))return code[0]==='O'?h+a>Number(code.slice(1)):h+a<Number(code.slice(1));
 var m=/^H([12])([+-]\d+(\.\d+)?)$/.exec(code);if(m){var L=Number(m[2]);return m[1]==='1'?h+L>a:a+L>h;}
 return null;}
function estOdds(p){var m=RULES.estMargin;return 1/Math.min(p*(1+m),Math.pow(p,1/(1+m)));}
// Fusionne les deux relevés Winamax (football.json pour le 1N2, football-goals.json pour le 2,5 buts) par match.
function merge(docs,now,day){var by={};(docs||[]).forEach(function(doc){if(!doc||doc.status!=='ok'||doc.bookKey&&doc.bookKey!=='winamax_fr')return;(doc.matches||[]).forEach(function(m){
 if(!m||m.sport!=='football'||!Safe.valid(m,now,day)||!recent(m.asOf,now))return;var key=k(m.home)+'|'+k(m.away)+'|'+Date.parse(m.kickoff);
 var x=by[key]||(by[key]={m:m,h2h:null,tot:null});
 (m.markets||[]).forEach(function(g){if(!Safe.marketValid(g,m,now)||!recent(g.asOf,now))return;
  if(g.family==='h2h'&&!x.h2h&&g.outcomes.length===3)x.h2h=g;if(g.family==='totals'&&g.line===2.5&&!x.tot&&g.outcomes.length===2)x.tot=g;});});});
 return Object.keys(by).sort().map(function(key){return by[key];}).filter(function(x){return x.h2h;});}
function candidates(docs,now,day){var groups=[];merge(docs,now,day).forEach(function(x){var m=x.m,out=[];
 var ord=['1','X','2'].map(function(c){return x.h2h.outcomes.find(function(o){return o.code===c;});});if(ord.some(function(o){return !o||!(o.odds>1);}))return;
 var p=Safe.probabilities(ord.map(function(o){return o.odds;}));if(!p)return;
 var over=null,tp=null;if(x.tot){var ov=x.tot.outcomes.find(function(o){return o.code==='O2.5';}),un=x.tot.outcomes.find(function(o){return o.code==='U2.5';});if(ov&&un){tp=Safe.probabilities([ov.odds,un.odds]);if(tp)over=tp[0];}}
 var base={matchId:m.id,sport:'football',gender:m.gender||'unspecified',league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,date:Safe.paris(m.kickoff),bookKey:'winamax_fr'};
 function add(code,label,prob,o,est,g,fam,line){if(!(prob+1e-12>=RULES.minLegProbability)||!(o>=RULES.minLegOdds-1e-9))return;
  out.push(Object.assign({},base,{id:'football|'+m.id+'|'+m.kickoff+'|'+code,code:code,label:label,o:Math.round(o*100)/100,p:prob,est:est,asOf:g.asOf,marketFamily:fam,marketLine:line,
   quoteSource:est?'estimate':'api',probabilityMethod:est?'poisson-grid-from-winamax':'winamax-power-devig'}));}
 add('1',ord[0].label,p[0],ord[0].odds,false,x.h2h,'h2h',null);add('2',ord[2].label,p[2],ord[2].odds,false,x.h2h,'h2h',null);
 if(tp){x.tot.outcomes.forEach(function(o){add(o.code,o.label,o.code==='O2.5'?tp[0]:tp[1],o.odds,false,x.tot,'totals',2.5);});}
 var g=fit(p,over);
 RULES.handicaps.forEach(function(L){['1','2'].forEach(function(side){var s=0,code='H'+side+(L>0?'+':'')+L;
  for(var i=0;i<=10;i++)for(var j=0;j<=10;j++)if(settleCode(code,i,j))s+=g[i][j];
  add(code,'Handicap '+(side==='1'?m.home:m.away)+' '+fmt(L),s,estOdds(s)/RULES.estHaircut,true,x.h2h,'handicap',L);});});
 // Dans un match, un pari battu à la fois en cote et en chance par un autre ne peut jamais être choisi.
 out.sort(function(a,b){return b.o-a.o||b.p-a.p;});var top=-1;out=out.filter(function(c){if(c.p>top+1e-12){top=c.p;return true;}return false;});
 if(out.length)groups.push(out);});
 return groups;}
function teamsClash(a,b){return a.matchId===b.matchId||[k(a.home),k(a.away)].some(function(n){return n===k(b.home)||n===k(b.away);});}
// Recherche exacte (sac à dos sur le log des cotes au millième) : combinaison la plus probable dans la fourchette, un pari par match.
function choose(groups){var LO=Math.round(Math.log(RULES.minOdds)*1000),HI=Math.round(Math.log(RULES.maxOdds)*1000),W=HI+1,K=RULES.maxLegs;
 var dp=[],back=[];for(var n=0;n<=K;n++)dp.push(new Float64Array(W).fill(-Infinity));dp[0][0]=0;
 groups.forEach(function(cs){var layer=[];for(var n=0;n<=K;n++)layer.push(new Int16Array(W).fill(-1));back.push(layer);
  cs.forEach(function(c){c.bin=Math.round(Math.log(c.o)*1000);c.lp=Math.log(c.p);});
  for(var n2=K-1;n2>=0;n2--){var row=dp[n2],next=dp[n2+1],ch=layer[n2+1];for(var b=W-1;b>=0;b--){if(row[b]===-Infinity)continue;
   for(var ci=0;ci<cs.length;ci++){var nb=b+cs[ci].bin;if(nb>HI)continue;var v=row[b]+cs[ci].lp;if(v>next[nb]+1e-12){next[nb]=v;ch[nb]=ci;}}}}});
 var best=null;for(var n3=RULES.minLegs;n3<=K;n3++)for(var b2=LO;b2<=HI;b2++)if(dp[n3][b2]>-Infinity&&(!best||dp[n3][b2]>best.v+1e-12))best={v:dp[n3][b2],n:n3,b:b2};
 if(!best)return null;var legs=[],n4=best.n,b4=best.b;
 for(var gi=groups.length-1;gi>=0&&n4>0;gi--){var ci2=back[gi][n4][b4];if(ci2<0)continue;var c=groups[gi][ci2];legs.push(c);n4--;b4-=c.bin;}
 if(n4!==0||b4!==0)return null;
 legs=legs.map(function(l){var o=clone(l);delete o.bin;delete o.lp;return o;}).sort(function(a,b){return Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.id.localeCompare(b.id);});
 for(var i=0;i<legs.length;i++)for(var j=i+1;j<legs.length;j++)if(teamsClash(legs[i],legs[j]))return null;
 var odds=legs.reduce(function(x,l){return x*l.o;},1),p=legs.reduce(function(x,l){return x*l.p;},1);
 if(odds<RULES.minOdds-1e-9||odds>RULES.maxOdds+1e-9)return null;
 return {legs:legs,odds:Math.round(odds*1e4)/1e4,p:p,estimated:legs.some(function(l){return l.est;})};}
function build(docs,now){var day=Safe.paris(now),groups=candidates(docs,now,day);
 return {day:day,ticket:choose(groups),candidates:groups.reduce(function(s,g){return s+g.length;},0),source:(docs||[]).map(function(d){return d?{status:d.status,updatedAt:d.updatedAt,partial:!!d.partial,matches:(d.matches||[]).length}:null;}).filter(Boolean)};}
function append(journal,built,now){var out=clone(journal||{records:[]});out.records=out.records||[];var id=RULES.version+'|'+built.day+'|football';
 if(out.records.some(function(r){return r.id===id;}))return out;var t=built.ticket;
 if(t&&!t.legs.every(function(l){return Date.parse(l.kickoff)>now&&l.o>1&&l.bookKey==='winamax_fr'&&recent(l.asOf,now);}))return out;
 out.records.push({id:id,day:built.day,method:'simu',sport:'football',version:RULES.version,createdAt:new Date(now).toISOString(),mode:'paper',unitStake:t?1:0,simulatedStake:t?RULES.stake:0,currency:'EUR',status:t?'pending':'no_pick',odds:t?t.odds:null,probability:t?t.p:null,legs:t?clone(t.legs):[],oddsNote:t&&t.estimated?'handicaps à cote estimée (≈), à vérifier chez Winamax':undefined,executionVerified:false,sourceSnapshots:clone(built.source||[])});return out;}
function same(m,l){return Date.parse(m.kickoff)===Date.parse(l.kickoff)&&(m.id===l.matchId||k(m.home)===k(l.home)&&k(m.away)===k(l.away));}
function settle(record,matches,today){if((record.status!=='pending'&&record.resultSource!=='application-football-score')||record.day>today)return record;
 var done=true,lost=false;record.legs.forEach(function(l){var m=(matches||[]).find(function(x){return same(x,l);});if(!Paper.finalFor(m,record.day,today)){done=false;return;}
  var s=m.score.split('-').map(Number),ok=settleCode(l.code,s[0],s[1]);if(ok===null)done=false;else if(!ok)lost=true;});
 if(!done&&!lost)return record;var status=lost?'lost':'won';if(status===record.status&&record.resultSource==='application-football-score')return record;
 return Object.assign({},record,{status:status,resultSource:'application-football-score'});}
return {rules:clone(RULES),candidates:candidates,choose:choose,build:build,append:append,settle:settle,settleCode:settleCode};
});
