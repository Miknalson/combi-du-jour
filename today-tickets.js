/* Tickets du jour + bilan, en haut de l'écran Analyse.
   Lecture seule : affiche les tickets fictifs déjà figés par les tâches automatiques
   (data/tres-sur-tests.json et data/paper-tests-v2.json). Ne recalcule rien. */
(function(){
'use strict';
var box=document.getElementById('todayTickets'),bilan=document.getElementById('todayBilan');
if(!box)return;
// Lien d'alerte (?ticket=…) ou ancre (#…) : ouvrir la section repliée qui contient la cible.
function reveal(el){while(el&&(el=el.parentElement)){if(el.tagName==='DETAILS')el.open=true;}}
function revealHash(){var id=decodeURIComponent(location.hash.slice(1));if(id)reveal(document.getElementById(id));}
if(new URLSearchParams(location.search).has('ticket'))reveal(document.getElementById('ticketArea'));
revealHash();window.addEventListener('hashchange',revealHash);
var WINAMAX='https://www.winamax.fr/paris-sportifs';
var SPORTS={football:'Foot',basket:'Basket',tennis:'Tennis',rugby_xv:'Rugby XV',rugby_xiii:'Rugby XIII',football_us:'Foot US',mixed:'Mix',hockey:'Hockey',volley:'Volley'};
var KINDS={
  tres_sur:{name:'Très sûr',range:'cote 1,10 à 1,25',tone:'k-sur'},
  safe:{name:'Safe',range:'cote 1,50 à 2,00',tone:'k-safe'},
  safe_but:{name:'Safe but',range:'buts · cote 1,50 à 2,00',tone:'k-but'},
  algo:{name:'Algo',range:'cote 3 à 5',tone:'k-algo'}
};
var ORDER=['tres_sur','safe','safe_but','algo'];
var STATUS={won:['Gagné','st-won'],lost:['Perdu','st-lost'],pending:['En attente','st-wait'],void:['Annulé','st-void']};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function num(x,d){return Number(x).toFixed(d==null?2:d).replace('.',',');}
function parisDay(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);}
function hour(iso){var t=Date.parse(iso);return Number.isFinite(t)?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(t).replace(':','h'):'—';}
function shortDay(iso){var t=Date.parse(iso);return Number.isFinite(t)?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short'}).format(t):'';}
function longDay(day){return new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(day+'T12:00:00Z'));}
function manual(){try{return JSON.parse(localStorage.getItem('cdj.paperResults')||'{}')||{};}catch(e){return {};}}
function outcome(r,m){
  if(window.PaperTests&&PaperTests.outcome){try{return PaperTests.outcome(r,m);}catch(e){}}
  return {status:r.status,odds:r.odds};
}
function load(file){return fetch(file,{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}

// Scores réels : lus dans data/days/<jour>.json (mêmes fichiers que le réglage des tickets).
var SCORES={};
function findMatch(l){var list=SCORES[l.date||String(l.kickoff).slice(0,10)]||[];var all=Object.keys(SCORES).reduce(function(a,k){return a.concat(SCORES[k]);},[]);
 function key(s){return String(s||'').trim().toLowerCase();}
 return (list.length?list:all).concat(all).find(function(m){return Date.parse(m.kickoff)===Date.parse(l.kickoff)&&(m.id===l.matchId||key(m.home)===key(l.home)&&key(m.away)===key(l.away));})||null;}
function legScore(l){var m=findMatch(l);if(!m||!/^\d+\s*-\s*\d+$/.test(String(m.score||'')))return null;
 var s=m.score.split('-').map(Number),h=s[0],a=s[1],ok=null,code=String(l.code||'');
 if(code==='1')ok=h>a;else if(code==='2')ok=a>h;else if(code==='X')ok=h===a;else if(code==='1X')ok=h>=a;else if(code==='X2')ok=a>=h;else if(code==='12')ok=h!==a;
 else if(/^[OU]\d+(\.\d+)?$/.test(code))ok=code[0]==='O'?h+a>Number(code.slice(1)):h+a<Number(code.slice(1));
 else if(l.marketFamily==='totals'&&Number.isFinite(Number(l.marketLine))){var side=code.split('|').pop();ok=side==='over'?h+a>l.marketLine:side==='under'?h+a<l.marketLine:null;}
 return {text:h+'-'+a,ok:ok,final:m.scoreStatus!=='live'};}
function scoreBadge(l){var s=legScore(l);if(!s)return '';return '<span class="tt-score '+(s.ok===true?'sc-ok':s.ok===false?'sc-ko':'')+'">'+esc(s.text)+(s.ok===true?' ✓':s.ok===false?' ✗':'')+'</span>';}
function card(r,res,today){
  var k=KINDS[r.method]||{name:r.method,range:'',tone:''},st=STATUS[res.status]||STATUS.pending;
  var sport=r.method==='safe'&&r.sport!=='football'?' · '+(SPORTS[r.sport]||r.sport):'';
  var legs=r.legs.map(function(l){
    var d=parisDay(new Date(Date.parse(l.kickoff)));
    return '<li><span class="tt-time"><b>'+esc(hour(l.kickoff))+'</b>'+(d!==today?'<small>'+esc(shortDay(l.kickoff))+'</small>':'')+'</span>'+
      '<span class="tt-match"><span class="tt-teams">'+esc(l.home)+' – '+esc(l.away)+'</span><span class="tt-pick">'+esc(l.label)+' '+scoreBadge(l)+'</span></span>'+
      '<span class="tt-odd mono">'+(l.est?'≈':'')+num(l.o)+'</span></li>';
  }).join('');
  var asOf=r.legs.map(function(l){return Date.parse(l.asOf);}).filter(Number.isFinite).sort()[0];
  return '<article class="tt-card '+k.tone+'">'+
    '<header class="tt-head"><div><span class="tt-kind">'+esc(k.name+sport)+'</span><span class="tt-range">'+esc(k.range)+'</span></div><span class="tt-status '+st[1]+'">'+st[0]+'</span></header>'+
    '<div class="tt-figs"><div><span class="tt-lab">'+(r.method==='safe_but'?'Cote estimée':'Cote Winamax')+'</span><span class="tt-big mono">'+num(r.odds)+'</span></div>'+
    '<div><span class="tt-lab">Chance estimée</span><span class="tt-mid mono">'+Math.round(100*r.probability)+' %</span></div>'+
    '<div><span class="tt-lab">Mise fictive</span><span class="tt-mid mono">'+esc(r.simulatedStake)+' €</span></div></div>'+
    '<ul class="tt-legs">'+legs+'</ul>'+
    (r.method==='safe_but'?'<p class="tt-foot">Cote moyenne du marché moins 5 % : notre source ne donne pas les cotes de buts Winamax. Vérifie la cote dans l’appli Winamax.</p>':asOf?'<p class="tt-foot">Cotes Winamax relevées à '+esc(hour(new Date(asOf).toISOString()))+'. Vérifie-les dans l’appli avant de jouer.</p>':'')+
    '</article>';
}

function renderToday(records,m){
  var today=parisDay(new Date());
  var real=records.filter(function(r){return r.status!=='no_pick'&&r.legs&&r.legs.length;});
  var days=real.map(function(r){return r.day;}).sort();
  var day=days.indexOf(today)>=0?today:(days.filter(function(d){return d<=today;}).pop()||days.pop());
  var list=real.filter(function(r){return r.day===day;}).sort(function(a,b){return ORDER.indexOf(a.method)-ORDER.indexOf(b.method)||(a.sport==='football'?-1:1);});
  var missing=ORDER.filter(function(k){return records.some(function(r){return r.method===k;})&&!list.some(function(r){return r.method===k;});});
  var head='<div class="tt-title"><h2>Tickets du jour</h2><span class="tt-date">'+esc(day?longDay(day):'')+(day&&day!==today?' · pas encore de ticket aujourd’hui':'')+'</span></div>';
  if(!list.length){box.innerHTML=head+'<p class="tt-empty">Pas encore de ticket figé. Les tickets apparaissent après la collecte du matin.</p>';return;}
  box.innerHTML=head+'<div class="tt-grid">'+list.map(function(r){return card(r,outcome(r,m),day);}).join('')+'</div>'+
    (missing.length?'<p class="tt-empty">Pas de ticket '+missing.map(function(k){return '« '+KINDS[k].name+' »';}).join(' ni ')+' pour ce jour : aucun pari ne remplissait les conditions.</p>':'')+
    '<a class="btn tt-winamax" href="'+WINAMAX+'" target="_blank" rel="noopener">Ouvrir Winamax</a>';
}

function renderBilan(records,m){
  if(!bilan)return;
  function money(x,d){return (x>0?'+':x<0?'−':'')+num(Math.abs(x),d)+' €';}
  function rate(r){var n=r.won+r.lost;return n?Math.round(100*r.won/n)+' %':'—';}
  function roi(r){return r.staked?(r.net>=0?'+':'−')+num(Math.abs(100*r.net/r.staked),1)+' %':'—';}
  function tone(x){return x>0?'bl-won':x<0?'bl-lost':'';}
  var rows=ORDER.filter(function(k){return records.some(function(r){return r.method===k;});}).map(function(k){
    var r={k:k,won:0,lost:0,wait:0,net:0,staked:0};
    records.filter(function(x){return x.method===k&&x.status!=='no_pick';}).forEach(function(x){
      var o=outcome(x,m),stake=Number(x.simulatedStake)||0;
      if(o.status==='won'){r.won++;r.staked+=stake;r.net+=stake*((Number(o.odds)||x.odds)-1);}
      else if(o.status==='lost'){r.lost++;r.staked+=stake;r.net-=stake;}
      else if(o.status==='pending')r.wait++;
    });
    return r;
  });
  var tot=rows.reduce(function(a,r){['won','lost','wait','net','staked'].forEach(function(f){a[f]+=r[f];});return a;},{won:0,lost:0,wait:0,net:0,staked:0});
  var full=!!document.getElementById('ticketsHistory');
  var settled=records.filter(function(r){return r.status!=='no_pick'&&r.legs&&r.legs.length;}).map(function(r){return {r:r,o:outcome(r,m)};})
    .filter(function(x){return x.o.status==='won'||x.o.status==='lost';})
    .sort(function(a,b){return b.r.day.localeCompare(a.r.day)||ORDER.indexOf(a.r.method)-ORDER.indexOf(b.r.method);}).slice(0,8);
  bilan.innerHTML='<div class="tt-title"><h2>Bilan</h2><span class="tt-date">Mises fictives placées automatiquement</span></div>'+
    '<div class="bl-kpis"><div><span class="mono bl-won">'+tot.won+'</span><small>gagnés</small></div><div><span class="mono bl-lost">'+tot.lost+'</span><small>perdus</small></div><div><span class="mono">'+rate(tot)+'</span><small>réussite</small></div><div><span class="mono '+tone(tot.net)+'">'+money(tot.net,0)+'</span><small>net fictif</small></div></div>'+
    '<div class="bl-types">'+rows.map(function(r){return '<article class="bl-type '+KINDS[r.k].tone+'"><strong>'+esc(KINDS[r.k].name)+'</strong>'+
      '<dl><div><dt>Gagnés / perdus</dt><dd class="mono">'+r.won+' / '+r.lost+(r.wait?' <small>· '+r.wait+' en cours</small>':'')+'</dd></div>'+
      '<div><dt>Réussite</dt><dd class="mono">'+rate(r)+'</dd></div>'+
      '<div><dt>Total misé</dt><dd class="mono">'+num(r.staked,0)+' €</dd></div>'+
      '<div><dt>Net fictif</dt><dd class="mono '+tone(r.net)+'">'+money(r.net)+'</dd></div>'+
      '<div><dt>Rentabilité</dt><dd class="mono '+tone(r.net)+'">'+roi(r)+'</dd></div></dl></article>';}).join('')+'</div>'+
    '<p class="tt-empty">Chaque ticket est joué tout seul avec de l’argent fictif (Très sûr 100 €, Safe 100 €, Safe but 100 €, Algo 50 €), puis réglé avec le score final. Rentabilité = gain net ÷ total misé. Aucun pari réel.</p>'+
    (!full&&settled.length?'<h3 class="bl-sub">Derniers résultats</h3><ul class="bl-last">'+settled.map(function(x){var st=STATUS[x.o.status];return '<li><span class="mono">'+esc(x.r.day.slice(8)+'/'+x.r.day.slice(5,7))+'</span><span>'+esc(KINDS[x.r.method].name)+' · cote '+num(x.r.odds)+'</span><span class="tt-status '+st[1]+'">'+st[0]+'</span></li>';}).join('')+'</ul>':'')+
    (full?'':'<a class="bl-more" href="tickets.html">Tout l’historique sur la page Tickets →</a>');
  if(full)renderHistory(records,m,money);
}

function renderHistory(records,m,money){
  var el=document.getElementById('ticketsHistory');
  var list=records.filter(function(r){return r.status!=='no_pick'&&r.legs&&r.legs.length;})
    .sort(function(a,b){return b.day.localeCompare(a.day)||ORDER.indexOf(a.method)-ORDER.indexOf(b.method);});
  var filter=el.dataset.filter||'all';
  el.innerHTML='<div class="tt-title"><h2>Historique</h2><span class="tt-date">'+list.length+' tickets</span></div>'+
    '<div class="hist-filter" role="group" aria-label="Filtrer">'+[['all','Tous']].concat(ORDER.filter(function(k){return records.some(function(r){return r.method===k;});}).map(function(k){return [k,KINDS[k].name];})).map(function(f){return '<button type="button" data-hist="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+esc(f[1])+'</button>';}).join('')+'</div>'+
    '<ul class="hist-list">'+list.filter(function(r){return filter==='all'||r.method===filter;}).map(function(r){
      var o=outcome(r,m),st=STATUS[o.status]||STATUS.pending,stake=Number(r.simulatedStake)||0;
      var gain=o.status==='won'?stake*((Number(o.odds)||r.odds)-1):o.status==='lost'?-stake:null;
      return '<li class="'+KINDS[r.method].tone+'"><div class="hist-top"><span class="mono">'+esc(r.day.slice(8)+'/'+r.day.slice(5,7))+'</span><strong>'+esc(KINDS[r.method].name)+'</strong><span class="mono">cote '+num(r.odds)+' · '+stake+' €</span><span class="tt-status '+st[1]+'">'+st[0]+(gain!==null?' '+money(gain):'')+'</span></div>'+
        '<ul class="hist-legs">'+r.legs.map(function(l){return '<li>'+esc(hour(l.kickoff)+' '+l.home+' – '+l.away+' : '+l.label+' ('+(l.est?'≈':'')+num(l.o)+')')+' '+scoreBadge(l)+'</li>';}).join('')+'</ul></li>';
    }).join('')+'</ul>';
  el.onclick=function(e){var b=e.target.closest('[data-hist]');if(!b)return;el.dataset.filter=b.dataset.hist;renderHistory(records,m,money);};
}

Promise.all([load('data/tres-sur-tests.json'),load('data/paper-tests-v2.json'),load('data/safe-but-tests.json')]).then(function(v){
  var records=[].concat(v[0]&&v[0].records||[],v[1]&&v[1].records||[],v[2]&&v[2].records||[]).filter(function(r){return KINDS[r.method]&&(!window.SportCatalog||!SportCatalog.isShown||r.sport==='mixed'||SportCatalog.isShown(r.sport));});
  var m=manual();
  if(!records.length){box.innerHTML='<div class="tt-title"><h2>Tickets du jour</h2></div><p class="tt-empty">Tickets indisponibles pour le moment. Réessaie après actualisation.</p>';if(bilan)bilan.hidden=true;return;}
  var days={};records.forEach(function(r){if(r.status!=='no_pick')(r.legs||[]).forEach(function(l){days[l.date||String(l.kickoff).slice(0,10)]=1;days[r.day]=1;});});
  Promise.all(Object.keys(days).map(function(d){return load('data/days/'+d+'.json').then(function(doc){SCORES[d]=doc&&doc.matches||[];});})).then(function(){renderToday(records,m);renderBilan(records,m);});
});
})();
