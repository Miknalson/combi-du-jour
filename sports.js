(function(){
'use strict';
var sport=new URLSearchParams(location.search).get('sport')==='tennis'?'tennis':'basket';
var title=sport==='basket'?'Basket':'Tennis';
document.title=title+' · Combiné du Jour';document.getElementById('sportTitle').textContent=title;
document.querySelector('[data-sport="'+sport+'"]').setAttribute('aria-current','page');
var doc=null,day=document.getElementById('sportDay'),league=document.getElementById('sportLeague'),area=document.getElementById('sportMatches'),status=document.getElementById('sportStatus');
function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function paris(x){return new Date(x).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
function valid(m){var age=Date.now()-Date.parse(m.asOf);return m.sport===sport&&m.bookKey==='winamax_fr'&&m.market==='h2h'&&Date.parse(m.kickoff)>Date.now()&&age>=0&&age<=86400000&&Number.isFinite(m.o1)&&Number.isFinite(m.o2)&&m.o1>1&&m.o2>1;}
function render(){
 if(!doc||!Array.isArray(doc.matches)){area.innerHTML='<p class="empty">Les cotes sont momentanément indisponibles.</p>';return;}
 var messages={unconfigured:'La connexion aux cotes Winamax n’est pas encore activée.',unavailable:'La source de cotes est momentanément indisponible.',quota:'La limite de consultation des cotes est atteinte.'};
 if(messages[doc.status]){status.textContent=doc.status==='unconfigured'?'Connexion à activer':'Relevé indisponible';area.innerHTML='<p class="empty">'+messages[doc.status]+'</p>';return;}
 var all=doc.matches.filter(valid),matches=all.filter(function(m){return (!day.value||paris(m.kickoff)===day.value)&&(!league.value||m.league===league.value);});
 status.textContent=all.length+' rencontre(s) · Winamax France'+(doc.partial?' · couverture partielle':'');
 area.innerHTML=matches.length?'<div class="sport-grid">'+matches.map(function(m){return '<article class="sport-match"><div class="sport-meta"><span>'+esc(m.league)+'</span><time datetime="'+esc(m.kickoff)+'">'+esc(new Date(m.kickoff).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</time></div><h3>'+esc(m.home)+' <span>–</span> '+esc(m.away)+'</h3><div class="sport-prices"><div><span>'+esc(m.home)+'</span><strong>'+m.o1.toFixed(2).replace('.',',')+'</strong></div><div><span>'+esc(m.away)+'</span><strong>'+m.o2.toFixed(2).replace('.',',')+'</strong></div></div><p class="status">'+(Date.now()-Date.parse(m.asOf)>3600000?'Ancienne cote · à vérifier · ':'')+'Winamax France · relevée le '+esc(new Date(m.asOf).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</p></article>';}).join('')+'</div>':'<p class="empty">Aucune cote Winamax de moins de 24 h pour ces rencontres et ces filtres. Les matchs commencés et les anciennes cotes sont masqués.</p>';
}
function options(select,values){var current=select.value;select.length=1;values.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;select.appendChild(o);});if(values.includes(current))select.value=current;}
async function refresh(){try{var response=await fetch('data/sports/'+sport+'.json',{cache:'no-store'});if(!response.ok)throw Error('data');doc=await response.json();if(doc.sport!==sport||doc.bookKey!=='winamax_fr')throw Error('source');var matches=(doc.matches||[]).filter(valid);options(day,Array.from(new Set(matches.map(function(m){return paris(m.kickoff);}))).sort());options(league,Array.from(new Set(matches.map(function(m){return m.league;}))).sort());render();}catch(e){doc=null;status.textContent='Source indisponible';render();}}
day.addEventListener('change',render);league.addEventListener('change',render);refresh();setInterval(render,30000);setInterval(refresh,300000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
})();
