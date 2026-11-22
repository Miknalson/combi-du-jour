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
  algo:{name:'Algo',range:'cote 3 à 5',tone:'k-algo'}
};
var ORDER=['tres_sur','safe','algo'];
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

function card(r,res,today){
  var k=KINDS[r.method]||{name:r.method,range:'',tone:''},st=STATUS[res.status]||STATUS.pending;
  var sport=r.method==='safe'&&r.sport!=='football'?' · '+(SPORTS[r.sport]||r.sport):'';
  var legs=r.legs.map(function(l){
    var d=parisDay(new Date(Date.parse(l.kickoff)));
    return '<li><span class="tt-time"><b>'+esc(hour(l.kickoff))+'</b>'+(d!==today?'<small>'+esc(shortDay(l.kickoff))+'</small>':'')+'</span>'+
      '<span class="tt-match"><span class="tt-teams">'+esc(l.home)+' – '+esc(l.away)+'</span><span class="tt-pick">'+esc(l.label)+'</span></span>'+
      '<span class="tt-odd mono">'+num(l.o)+'</span></li>';
  }).join('');
  var asOf=r.legs.map(function(l){return Date.parse(l.asOf);}).filter(Number.isFinite).sort()[0];
  return '<article class="tt-card '+k.tone+'">'+
    '<header class="tt-head"><div><span class="tt-kind">'+esc(k.name+sport)+'</span><span class="tt-range">'+esc(k.range)+'</span></div><span class="tt-status '+st[1]+'">'+st[0]+'</span></header>'+
    '<div class="tt-figs"><div><span class="tt-lab">Cote Winamax</span><span class="tt-big mono">'+num(r.odds)+'</span></div>'+
    '<div><span class="tt-lab">Chance estimée</span><span class="tt-mid mono">'+Math.round(100*r.probability)+' %</span></div>'+
    '<div><span class="tt-lab">Mise fictive</span><span class="tt-mid mono">'+esc(r.simulatedStake)+' €</span></div></div>'+
    '<ul class="tt-legs">'+legs+'</ul>'+
    (asOf?'<p class="tt-foot">Cotes Winamax relevées à '+esc(hour(new Date(asOf).toISOString()))+'. Vérifie-les dans l’appli avant de jouer.</p>':'')+
    '</article>';
}

function renderToday(records,m){
  var today=parisDay(new Date());
  var real=records.filter(function(r){return r.status!=='no_pick'&&r.legs&&r.legs.length;});
  var days=real.map(function(r){return r.day;}).sort();
  var day=days.indexOf(today)>=0?today:(days.filter(function(d){return d<=today;}).pop()||days.pop());
  var list=real.filter(function(r){return r.day===day;}).sort(function(a,b){return ORDER.indexOf(a.method)-ORDER.indexOf(b.method)||(a.sport==='football'?-1:1);});
  var missing=ORDER.filter(function(k){return !list.some(function(r){return r.method===k;});});
  var head='<div class="tt-title"><h2>Tickets du jour</h2><span class="tt-date">'+esc(day?longDay(day):'')+(day&&day!==today?' · pas encore de ticket aujourd’hui':'')+'</span></div>';
  if(!list.length){box.innerHTML=head+'<p class="tt-empty">Pas encore de ticket figé. Les tickets apparaissent après la collecte du matin.</p>';return;}
  box.innerHTML=head+'<div class="tt-grid">'+list.map(function(r){return card(r,outcome(r,m),day);}).join('')+'</div>'+
    (missing.length?'<p class="tt-empty">Pas de ticket '+missing.map(function(k){return '« '+KINDS[k].name+' »';}).join(' ni ')+' pour ce jour : aucun pari ne remplissait les conditions.</p>':'')+
    '<a class="btn tt-winamax" href="'+WINAMAX+'" target="_blank" rel="noopener">Ouvrir Winamax</a>';
}

function renderBilan(records,m){
  if(!bilan)return;
  var rows=ORDER.map(function(k){
    var won=0,lost=0,wait=0,net=0;
    records.filter(function(r){return r.method===k&&r.status!=='no_pick';}).forEach(function(r){
      var o=outcome(r,m),stake=Number(r.simulatedStake)||0;
      if(o.status==='won'){won++;net+=stake*((Number(o.odds)||r.odds)-1);}
      else if(o.status==='lost'){lost++;net-=stake;}
      else if(o.status==='pending')wait++;
    });
    return {k:k,won:won,lost:lost,wait:wait,net:net};
  });
  var tot=rows.reduce(function(a,r){a.won+=r.won;a.lost+=r.lost;a.wait+=r.wait;a.net+=r.net;return a;},{won:0,lost:0,wait:0,net:0});
  function rate(r){var n=r.won+r.lost;return n?Math.round(100*r.won/n)+' %':'—';}
  function money(x,d){return (x>0?'+':x<0?'−':'')+num(Math.abs(x),d)+'\u00a0€';}
  var settled=records.filter(function(r){return r.status!=='no_pick'&&r.legs&&r.legs.length;}).map(function(r){return {r:r,o:outcome(r,m)};})
    .filter(function(x){return x.o.status==='won'||x.o.status==='lost';})
    .sort(function(a,b){return b.r.day.localeCompare(a.r.day)||ORDER.indexOf(a.r.method)-ORDER.indexOf(b.r.method);}).slice(0,8);
  bilan.innerHTML='<div class="tt-title"><h2>Bilan</h2><span class="tt-date">Tickets fictifs terminés</span></div>'+
    '<div class="bl-kpis"><div><span class="mono bl-won">'+tot.won+'</span><small>gagnés</small></div><div><span class="mono bl-lost">'+tot.lost+'</span><small>perdus</small></div><div><span class="mono">'+rate(tot)+'</span><small>réussite</small></div><div><span class="mono '+(tot.net>=0?'bl-won':'bl-lost')+'">'+money(tot.net,0)+'</span><small>net fictif</small></div></div>'+
    '<table class="bl-table"><thead><tr><th>Ticket</th><th>Gagnés / perdus</th><th>Réussite</th><th>Net fictif</th></tr></thead><tbody>'+
    rows.map(function(r){return '<tr><td>'+esc(KINDS[r.k].name)+(r.wait?' <small>('+r.wait+' en attente)</small>':'')+'</td><td class="mono">'+r.won+' / '+r.lost+'</td><td class="mono">'+rate(r)+'</td><td class="mono '+(r.net>=0?'bl-won':'bl-lost')+'">'+money(r.net)+'</td></tr>';}).join('')+
    '</tbody></table>'+
    (settled.length?'<h3 class="bl-sub">Derniers résultats</h3><ul class="bl-last">'+settled.map(function(x){var st=STATUS[x.o.status];return '<li><span class="mono">'+esc(x.r.day.slice(8)+'/'+x.r.day.slice(5,7))+'</span><span>'+esc(KINDS[x.r.method].name)+' · cote '+num(x.r.odds)+'</span><span class="tt-status '+st[1]+'">'+st[0]+'</span></li>';}).join('')+'</ul>':'')+
    '<a class="bl-more" href="tableau.html#paperProtocolV2">Tout le détail dans le Tableau de bord →</a>';
}

Promise.all([load('data/tres-sur-tests.json'),load('data/paper-tests-v2.json')]).then(function(v){
  var records=[].concat(v[0]&&v[0].records||[],v[1]&&v[1].records||[]).filter(function(r){return KINDS[r.method]&&(!window.SportCatalog||!SportCatalog.isShown||r.sport==='mixed'||SportCatalog.isShown(r.sport));});
  var m=manual();
  if(!records.length){box.innerHTML='<div class="tt-title"><h2>Tickets du jour</h2></div><p class="tt-empty">Tickets indisponibles pour le moment. Réessaie après actualisation.</p>';if(bilan)bilan.hidden=true;return;}
  renderToday(records,m);renderBilan(records,m);
});
})();
