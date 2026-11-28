/* Simulation personnelle : le calcul de l'écran Analyse, partagé avec la page Tickets (28/11/2026).
   Nano veut que le ticket « Simulation » soit exactement la simulation que l'appli lui propose avec ses réglages :
   les deux pages appellent donc ce même code, avec les mêmes réglages et le même enregistrement (cdj.proposals). */
(function(root){
'use strict';
var store={get:function(k,d){try{var v=localStorage.getItem('cdj.'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}},set:function(k,v){try{localStorage.setItem('cdj.'+k,JSON.stringify(v));}catch(e){}}};
var DEFAULTS={strategy:'reference',oMin:3,oMax:5,maxLegs:5,minLegs:2,minLeg:1.10,minProb:0.5,realGoals:true,mWin:true,mDc:true,mDraw:false,mGoals:true,mAh:true,mCs:true,mSame:true,algoEst:false,myBook:true,skipStarted:true,offLeagues:[]};
// Réglages de l'appareil, avec les mêmes migrations que l'écran Analyse.
function loadSettings(){var s=Object.assign({},DEFAULTS,store.get('settings',{}));
 if(s.probV!==2){s.minProb=0.5;s.probV=2;store.set('settings',s);}
 if(s.strategyV!==2){s.strategy='reference';s.strategyV=2;store.set('settings',s);}
 if(s.quoteV!==1){s.algoEst=false;s.realGoals=true;s.myBook=true;s.quoteV=1;store.set('settings',s);}
 return s;}
function make(settings,excluded){
var MIN_BOOKS=5;
function devig(o1,oX,o2){
  var inv=[1/o1,1/oX,1/o2], lo=0.5, hi=3;
  for(var it=0;it<60;it++){
    var k=(lo+hi)/2, s=inv[0]**k+inv[1]**k+inv[2]**k;
    if(s>1) lo=k; else hi=k;
  }
  var k2=(lo+hi)/2, p=inv.map(function(x){return x**k2;}), t=p[0]+p[1]+p[2];
  return { p:p.map(function(x){return x/t;}), margin:inv[0]+inv[1]+inv[2]-1 };
}

function scoreOf(m){
  if(!m.score) return null;
  var s = String(m.score).split('-').map(Number);
  if(s.length!==2 || !isFinite(s[0]) || !isFinite(s[1])) return null;
  return s;
}

// Goals model: fit home/away Poisson means so the score grid reproduces the de-vigged 1N2 probabilities.
function pois(l){ var out=[], f=Math.exp(-l); for(var k=0;k<=10;k++){ out.push(f); f*=l/(k+1); } return out; }
function grid(lh,la){
  var a=pois(lh), b=pois(la), g=[];
  for(var i=0;i<=10;i++){ g.push([]); for(var j=0;j<=10;j++) g[i].push(a[i]*b[j]); }
  return g;
}
function hda(g){ var h=0,d=0,a=0; for(var i=0;i<=10;i++) for(var j=0;j<=10;j++){ if(i>j) h+=g[i][j]; else if(i===j) d+=g[i][j]; else a+=g[i][j]; } return [h,d,a]; }
var lamCache={};
function goalsModel(m, p, ou){
  // Fit to the de-vigged 1N2 and, when the data has them, to the real over/under lines too,
  // so the score grid (used for handicaps, exact scores and same-match combos) agrees with both markets.
  var targets = [];
  Object.keys(ou||{}).forEach(function(k){ var r=ou[k], L=parseFloat(k); if(r && r.o>1 && r.u>1 && L>0 && L<6) targets.push([L,(1/r.o)/((1/r.o)+(1/r.u))]); });
  var key=m.id+'|'+m.o1+'|'+m.oX+'|'+m.o2+'|'+JSON.stringify(targets);
  if(lamCache[key]) return lamCache[key];
  function err(lh,la){
    var g=grid(lh,la), r=hda(g), e=(r[0]-p[0])*(r[0]-p[0])+(r[2]-p[2])*(r[2]-p[2]);
    targets.forEach(function(t){ var s=0; for(var i=0;i<=10;i++) for(var j=0;j<=10;j++) if(i+j>t[0]) s+=g[i][j]; e+=(s-t[1])*(s-t[1]); });
    return e;
  }
  var best=[1.4,1.1], be=Infinity, lh, la, e;
  for(lh=0.2;lh<=4.01;lh+=0.1) for(la=0.2;la<=4.01;la+=0.1){ e=err(lh,la); if(e<be){ be=e; best=[lh,la]; } }
  var c=best.slice();
  for(lh=c[0]-0.1;lh<=c[0]+0.101;lh+=0.01) for(la=c[1]-0.1;la<=c[1]+0.101;la+=0.01){ if(lh<=0.05||la<=0.05) continue; e=err(lh,la); if(e<be){ be=e; best=[lh,la]; } }
  var g=grid(best[0],best[1]), tot=[];
  for(var t=0;t<=20;t++) tot.push(0);
  for(var i=0;i<=10;i++) for(var j=0;j<=10;j++) tot[i+j]+=g[i][j];
  var over={};
  [0.5,1.5,2.5,3.5,4.5].forEach(function(L){ var s=0; for(var t=Math.ceil(L);t<=20;t++) s+=tot[t]; over[L]=s; });
  return lamCache[key]={lh:best[0], la:best[1], over:over, grid:g};
}
function line(L){ return String(L).replace('.',','); }

// Probabilities from the bookmaker average, checked against a sharp book (Pinnacle or an exchange)
// when the data has one: each bet keeps the lower of the two, so a pick needs both to agree it is likely.
function candidates(m){
  var w=settings.myBook&&m.mine;
  var quotedTotals=settings.myBook?Object.fromEntries(FootballMarkets.totals(m,Date.now(),{includeManual:true}).map(function(q){return [String(q.line),{o:q.over,u:q.under,asOf:q.asOf,quoteSource:q.source}];})):(m.ou||{});
  var out = rawCandidates(m, m.o1, m.oX, m.o2, quotedTotals);
  var s = m.sharp;
  if(s && s.o1>1 && s.oX>1 && s.o2>1){
    var sp = {};
    rawCandidates(m, s.o1, s.oX, s.o2, s.ou || {}, quotedTotals).forEach(function(c){ sp[c.code]=c.p; });
    out.forEach(function(c){ if(sp[c.code]!==undefined){ c.pAvg=c.p; c.pSharp=sp[c.code]; c.p=Math.min(c.p, sp[c.code]); } });
  }
  // Odds actually on offer at the user's own bookmaker (Winamax) replace the market average, so the ticket's
  // total is what can really be bet. Double chance is derived from its 1N2 prices (≈).
  w = settings.myBook && m.mine;
  if(w && w.o1>1 && w.oX>1 && w.o2>1 && UefaCalendar.realQuote(m,Date.now())){
    var mo = {'1':w.o1, 'X':w.oX, '2':w.o2, '1X':1/(1/w.o1+1/w.oX), 'X2':1/(1/w.oX+1/w.o2)};
    out.forEach(function(c){
      if(mo[c.code]){ c.o=mo[c.code]; c.mine=true; c.est=c.code.length===2; return; }
      if(/^[OU][0-9.]+$/.test(c.code)){
        var r=(w.ou||{})[c.code.slice(1)], v=r && r[c.code[0]==='O'?'o':'u'];
        if(v){ c.o=v; c.est=false; c.mine=true; }
      }
    });
  }
  if(settings.myBook)out.forEach(function(c){if(/^[OU][0-9.]+$/.test(c.code)){var q=quotedTotals[c.code.slice(1)];if(q&&q.o>1&&q.u>1){c.o=q[c.code[0]==='O'?'o':'u'];c.mine=true;c.est=false;c.quoteSource=q.quoteSource||'api';c.asOf=q.asOf||(w&&w.asOf);}}});
  return out;
}
// One settlement rule for every bet code: 1 X 2 1X X2, O2.5 / U2.5, handicaps H1-1.5 / H2+1.5,
// exact scores CS2-1, and same-match combos joined with "&" (all parts must win).
function settleCode(code, h, a){
  if(code.indexOf('&')>-1) return code.split('&').every(function(c){ return settleCode(c,h,a); });
  if(code==='1') return h>a;
  if(code==='2') return h<a;
  if(code==='X') return h===a;
  if(code==='1X') return h>=a;
  if(code==='X2') return h<=a;
  if(code.slice(0,2)==='CS'){ var s=code.slice(2).split('-').map(Number); return h===s[0] && a===s[1]; }
  if(code[0]==='H'){ var L=parseFloat(code.slice(2)); return code[1]==='1' ? h+L>a : a+L>h; }
  if(code[0]==='O') return h+a>parseFloat(code.slice(1));
  if(code[0]==='U') return h+a<parseFloat(code.slice(1));
  return null;
}
function gridProb(g, code){ var s=0; for(var i=0;i<=10;i++) for(var j=0;j<=10;j++) if(settleCode(code,i,j)) s+=g[i][j]; return s; }
// Estimated price with bookmaker margin m: multiplicative for long shots, power-shaped near certainty so odds stay above 1.
function estOdds(p, m){ return 1/Math.min(p*(1+m), Math.pow(p, 1/(1+m))); }
function signed(L){ return (L>0?'+':'')+line(L); }

function rawCandidates(m, o1, oX, o2, realOu, fallbackOu){
  var dv = devig(o1,oX,o2), p=dv.p, out=[];
  var implied = [1/m.o1, 1/m.oX, 1/m.o2];
  var avgOu = m.ou || {}, real = realOu || {};
  var gm = goalsModel({id:m.id, o1:o1, oX:oX, o2:o2}, p, Object.keys(real).length ? real : (fallbackOu||{}));
  function add(code,label,prob,o,est,fam){ if(!(o >= 1.02)) return; out.push({match:m, code:code, label:label, p:prob, o:o, est:est, fam:fam, grid:['Handicap','Score exact','Combiné sur le match'].indexOf(fam)>-1, win:function(h,a){ return settleCode(code,h,a); }}); }
  var results = [], goals = [];
  if(settings.mWin){
    add('1','Victoire '+m.home,p[0],m.o1,false,'Résultat');
    add('2','Victoire '+m.away,p[2],m.o2,false,'Résultat');
  }
  if(settings.mDraw) add('X','Match nul',p[1],m.oX,false,'Résultat');
  if(settings.mDc){
    add('1X',m.home+' ou nul',p[0]+p[1],1/(implied[0]+implied[1]),true,'Résultat');
    add('X2','Nul ou '+m.away,p[1]+p[2],1/(implied[1]+implied[2]),true,'Résultat');
  }
  results = out.slice();
  if(settings.mGoals){
    Array.from(new Set([0.5,1.5,2.5,3.5,4.5].concat(Object.keys(real).map(Number)))).filter(function(L){return Number.isFinite(L)&&L>0&&L<=10&&Math.abs(L%1-.5)<1e-9;}).sort(function(a,b){return a-b;}).forEach(function(L){
      var r=real[String(L)] || (fallbackOu||{})[String(L)], po=gm.over[L];
      // The Poisson estimate is the shakiest number in the app: by default only lines with a real price are bet.
      if(settings.realGoals && !(r && r.o > 1 && r.u > 1)) return;
      // A real two-way price beats the Poisson estimate: take its margin-free probability instead.
      if(r && r.o > 1 && r.u > 1){var paired=SafeDay.probabilities([r.o,r.u]);if(!paired)return;po=paired[0];}
      // Without a real price, assume a 5 % two-way bookmaker margin.
      var ra = real[String(L)] || avgOu[String(L)];
      var oo = ra && ra.o ? ra.o : estOdds(po,0.05), ou = ra && ra.u ? ra.u : estOdds(1-po,0.05);
      add('O'+L,'Plus de '+line(L)+' buts',po,oo,!(ra&&ra.o),'Buts');
      add('U'+L,'Moins de '+line(L)+' buts',1-po,ou,!(ra&&ra.u),'Buts');
    });
    goals = out.slice(results.length);
  }
  // The markets below have no price in the data: probabilities come from the fitted score grid,
  // odds are estimates with a typical bookmaker margin (≈).
  if(settings.mAh){
    [-2.5,-1.5,1.5,2.5].forEach(function(L){
      var k=(L>0?'+':'')+L, ph=gridProb(gm.grid,'H1'+k), pa=gridProb(gm.grid,'H2'+k);
      add('H1'+k,'Handicap '+m.home+' '+signed(L),ph,estOdds(ph,0.05),true,'Handicap');
      add('H2'+k,'Handicap '+m.away+' '+signed(L),pa,estOdds(pa,0.05),true,'Handicap');
    });
  }
  if(settings.mCs){
    for(var i=0;i<=4;i++) for(var j=0;j<=4;j++){
      var pc=gm.grid[i][j];
      if(pc>=0.03) add('CS'+i+'-'+j,'Score exact '+i+'-'+j,pc,estOdds(pc,0.2),true,'Score exact');
    }
  }
  // Same-match combos: the two bets are correlated (a favourite's win and many goals go together),
  // so the joint chance is read off the score grid instead of multiplying the two.
  if(settings.mSame){
    results.forEach(function(r){ goals.forEach(function(gl){
      var pj = Math.min(gridProb(gm.grid, r.code+'&'+gl.code), r.p, gl.p);
      if(pj < 0.05 || pj > Math.min(r.p, gl.p)-0.01) return;  // impossible, or the goals part adds nothing
      add(r.code+'&'+gl.code, r.label+' + '+gl.label.toLowerCase(), pj, estOdds(pj,0.08), true, 'Combiné sur le match');
    }); });
  }
  return out;
}

function eligible(m){
  if(excluded[m.id]) return false;
  if(settings.offLeagues.indexOf(m.league)>-1) return false;
  if(!(m.o1>1 && m.oX>1 && m.o2>1)) return false;
  return true;
}

// Exact search: for each day, a knapsack over matches (one bet per match at most) on log-odds,
// discretised to 1/1000, maximising the summed log-probability. Alternatives drop one match of the best ticket.
function bestCombos(matches, n, liveFilter){
  var now = Date.now(), groups = [];
  if(!(settings.oMin>1&&settings.oMax>=settings.oMin&&settings.oMax<=100&&settings.minLegs>=1&&settings.maxLegs>=settings.minLegs))return [];
  // Once the data carries Winamax prices, only bets that can be placed there are considered.
  var onlyMine = settings.myBook;
  matches.forEach(function(m){
    if(!eligible(m)) return;
    if(onlyMine && !m.mine && !FootballMarkets.totals(m,now,{includeManual:true}).length) return;
    if(liveFilter && settings.skipStarted && new Date(m.kickoff).getTime() <= now) return;
    // Markets quoted by only a handful of bookmakers are thin and their odds less reliable.
    if(m.books !== undefined && m.books < MIN_BOOKS && !(m.quoteBasis==='winamax-only'&&UefaCalendar.realQuote(m,now))&&!FootballMarkets.totals(m,now,{includeManual:true}).length) return;
    // Grid-only markets have no bookmaker price in the data and our estimates proved too generous
    // (a ≈1,55 ticket was about 1,20 at the bookmaker), so the algo leaves them out unless asked.
    var cs = candidates(m).filter(function(c){ return c.o >= settings.minLeg && c.p >= Math.max(0.2, settings.minProb) && (settings.algoEst || !c.grid) && (!onlyMine || c.mine || c.grid); });
    // Prices for grid-only markets are our own estimates, and the search would happily exploit any error in them:
    // count them 3 % lower so they are only picked when clearly better than a priced bet.
    cs.forEach(function(c){ c.bin = Math.round(Math.log(c.grid ? c.o/1.03 : c.o)*1000); c.lp = Math.log(c.p); });
    // Within one match only one bet is picked, so a bet beaten on both odds and chance by another can never be best.
    cs.sort(function(a,b){ return b.bin-a.bin || b.lp-a.lp; });
    var top = -Infinity;
    cs = cs.filter(function(c){ if(c.lp > top){ top = c.lp; return true; } return false; });
    if(cs.length) groups.push(cs);
  });
  var LO = Math.round(Math.log(settings.oMin)*1000), HI = Math.round(Math.log(settings.oMax)*1000);
  var maxL = Math.min(10, settings.maxLegs), minL = Math.max(1, settings.minLegs);
  function solve(skipId){
    var W = HI+1, dp = [], choice = [];
    for(var k=0;k<=maxL;k++){ dp.push(new Float64Array(W).fill(-Infinity)); }
    dp[0][0] = 0;
    groups.forEach(function(cs, gi){
      var layer = [];
      for(var k=0;k<=maxL;k++) layer.push(new Int16Array(W).fill(-1));
      choice.push(layer);
      if(cs[0].match.id === skipId) return;
      for(var k2=maxL-1;k2>=0;k2--){
        var row = dp[k2], next = dp[k2+1], ch = layer[k2+1];
        for(var b=W-1;b>=0;b--){
          if(row[b] === -Infinity) continue;
          for(var ci=0;ci<cs.length;ci++){
            var nb = b + cs[ci].bin; if(nb > HI) continue;
            var v = row[b] + cs[ci].lp;
            if(v > next[nb]){ next[nb] = v; ch[nb] = ci; }
          }
        }
      }
    });
    var best = null;
    for(var k3=minL;k3<=maxL;k3++) for(var b2=LO;b2<=HI;b2++) if(dp[k3][b2] > -Infinity && (!best || dp[k3][b2] > best.v)) best = {v:dp[k3][b2], k:k3, b:b2};
    if(!best) return null;
    // walk back: the last layer that set (k,b) is the one that chose it
    var legs = [], k4 = best.k, b4 = best.b;
    for(var gi2=groups.length-1; gi2>=0 && k4>0; gi2--){
      var ci2 = choice[gi2][k4][b4];
      if(ci2 < 0) continue;
      var c = groups[gi2][ci2];
      legs.push(c); k4--; b4 -= c.bin;
    }
    if(k4 !== 0 || b4 !== 0) return null;
    var o = legs.reduce(function(a,c){ return a*c.o; },1), p = legs.reduce(function(a,c){ return a*c.p; },1);
    legs.sort(function(a,c){ return a.match.kickoff<c.match.kickoff?-1:1; });
    return {legs:legs, odds:o, prob:p};
  }
  var first = solve(null);
  if(!first) return [];
  var out = [first];
  if(n > 1){
    var alts = [], seen = {};
    seen[first.legs.map(function(l){return l.match.id;}).sort().join('|')] = true;
    first.legs.forEach(function(l){
      var a = solve(l.match.id); if(!a) return;
      var key = a.legs.map(function(x){return x.match.id;}).sort().join('|');
      if(!seen[key]){ seen[key]=true; alts.push(a); }
    });
    alts.sort(function(a,b){ return b.prob-a.prob; });
    out = out.concat(alts.slice(0,n-1));
  }
  return out;
}
return {devig:devig,scoreOf:scoreOf,pois:pois,grid:grid,hda:hda,goalsModel:goalsModel,line:line,candidates:candidates,settleCode:settleCode,gridProb:gridProb,estOdds:estOdds,signed:signed,rawCandidates:rawCandidates,eligible:eligible,bestCombos:bestCombos};
}
// Le ticket proposé pour un jour est enregistré sur l'appareil et figé dès qu'un de ses matchs a commencé.
function saveProposal(date,c,settings){var proposals=store.get('proposals',{}),now=Date.now(),old=proposals[date];
 if(old&&old.legs.some(function(l){return new Date(l.kickoff).getTime()<=now;}))return proposals;
 if(c.legs.some(function(l){return new Date(l.match.kickoff).getTime()<=now;}))return proposals;
 proposals[date]={createdAt:new Date(now).toISOString(),modelId:'legacy-market-combo-exploration-v1',explorationOnly:true,rules:Object.assign({},settings),odds:c.odds,prob:c.prob,legs:c.legs.map(function(l){return {matchId:l.match.id,kickoff:l.match.kickoff,home:l.match.home,away:l.match.away,league:l.match.league,code:l.code,label:l.label,o:l.o,p:l.p,est:!!l.est,quoteSource:l.quoteSource,asOf:l.asOf};})};
 var keys=Object.keys(proposals).sort();while(keys.length>60)delete proposals[keys.shift()];
 store.set('proposals',proposals);return proposals;}
root.SimuPerso={make:make,loadSettings:loadSettings,saveProposal:saveProposal,proposals:function(){return store.get('proposals',{});},excluded:function(){return store.get('excluded',{});}};
})(typeof globalThis!=='undefined'?globalThis:this);
