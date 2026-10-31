(function(){
'use strict';
var sport=new URLSearchParams(location.search).get('sport')==='tennis'?'tennis':'basket';
var title=sport==='basket'?'Basket':'Tennis';
document.title=title+' · Combiné du Jour';document.getElementById('sportTitle').textContent=title;
document.querySelector('[data-sport="'+sport+'"]').setAttribute('aria-current','page');
var doc=null,other=null,revision=0,combinations=[],selected=null;
var day=document.getElementById('sportDay'),league=document.getElementById('sportLeague'),area=document.getElementById('sportMatches'),status=document.getElementById('sportStatus');
var scope=document.getElementById('comboScope'),comboDay=document.getElementById('comboDay'),comboArea=document.getElementById('sportCombos');
scope.options[0].textContent=title+' uniquement';
function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function paris(x){return new Date(x).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
function price(x){return x.toFixed(2).replace('.',',');}
function date(x){return new Date(x).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function valid(m){return m.sport===sport&&SportCombos.valid(m,Date.now());}
function data(d){return d&&d.status==='ok'&&d.bookKey==='winamax_fr'&&Array.isArray(d.matches)?d.matches.filter(function(m){return m.sport===d.sport&&SportCombos.valid(m,Date.now());}):[];}
function pool(){return data(doc).concat(scope.value==='mixed'?data(other):[]);}
function options(select,values){var current=select.value;select.length=1;values.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;select.appendChild(o);});if(values.includes(current))select.value=current;}
function renderCombos(){
 var matches=pool();
 options(comboDay,Array.from(new Set(matches.map(function(m){return paris(m.kickoff);}))).sort());
 if(!comboDay.dataset.initial&&comboDay.options.length>1){comboDay.selectedIndex=1;comboDay.dataset.initial='1';}
 if(comboDay.value)matches=matches.filter(function(m){return paris(m.kickoff)===comboDay.value;});
 var min=Number(document.getElementById('comboMin').value),max=Number(document.getElementById('comboMax').value);
 if(!(min>1)||!(max>=min)||max>100){combinations=[];comboArea.innerHTML='<p class="empty">Choisis une fourchette valide : cote mini supérieure à 1, cote maxi entre la mini et 100.</p>';return;}
 combinations=SportCombos.find(matches,{min:min,max:max,count:Number(document.getElementById('comboCount').value),mixed:scope.value==='mixed'});
 if(!combinations.length){comboArea.innerHTML='<p class="empty">Aucun combiné disponible avec ces réglages et les cotes Winamax actuelles. Aucun match ni aucune cote ne sont inventés.</p>';return;}
 comboArea.innerHTML='<p class="status">Jusqu’à 6 simulations parmi les 20 prochaines rencontres filtrées, classées par proximité de la cote cible. Cotes relevées, à vérifier chez Winamax.</p><div class="combo-grid">'+combinations.map(function(c,i){return '<article class="combo-card"><div class="eyebrow">'+(scope.value==='mixed'?'Basket + Tennis':title)+' · '+c.legs.length+' matchs</div><div class="combo-total">'+price(c.odds)+'</div><ul>'+c.legs.map(function(l){return '<li><strong>'+esc(l.label)+'</strong> · '+price(l.o)+'<br>'+esc(l.match.home)+' – '+esc(l.match.away)+'<br><span class="status">'+esc(l.match.sport==='basket'?'Basket':'Tennis')+' · '+esc(date(l.match.kickoff))+(Date.now()-Date.parse(l.match.asOf)>3600000?' · ancienne cote':'')+'</span></li>';}).join('')+'</ul><button class="btn" type="button" data-combo="'+i+'">Choisir ce combiné</button></article>';}).join('')+'</div>';
}
function render(){
 renderCombos();
 if(!doc||!Array.isArray(doc.matches)){area.innerHTML='<p class="empty">Les cotes sont momentanément indisponibles.</p>';return;}
 var messages={unconfigured:'La connexion aux cotes Winamax n’est pas encore activée.',unavailable:'La source de cotes est momentanément indisponible.',quota:'La limite de consultation des cotes est atteinte.'};
 if(messages[doc.status]){status.textContent=doc.status==='unconfigured'?'Connexion à activer':'Relevé indisponible';area.innerHTML='<p class="empty">'+messages[doc.status]+'</p>';return;}
 var all=doc.matches.filter(valid),matches=all.filter(function(m){return (!day.value||paris(m.kickoff)===day.value)&&(!league.value||m.league===league.value);});
 status.textContent=all.length+' rencontre(s) · Winamax France'+(doc.partial?' · couverture partielle':'');
 area.innerHTML=matches.length?'<div class="sport-grid">'+matches.map(function(m){return '<article class="sport-match"><div class="sport-meta"><span>'+esc(m.league)+'</span><time datetime="'+esc(m.kickoff)+'">'+esc(date(m.kickoff))+'</time></div><h3>'+esc(m.home)+' <span>–</span> '+esc(m.away)+'</h3><div class="sport-prices"><div><span>'+esc(m.home)+'</span><strong>'+price(m.o1)+'</strong></div><div><span>'+esc(m.away)+'</span><strong>'+price(m.o2)+'</strong></div></div><p class="status">'+(Date.now()-Date.parse(m.asOf)>3600000?'Ancienne cote · à vérifier · ':'')+'Winamax France · relevée le '+esc(date(m.asOf))+'</p></article>';}).join('')+'</div>':'<p class="empty">Aucune cote Winamax de moins de 24 h pour ces rencontres et ces filtres. Les matchs commencés et les anciennes cotes sont masqués.</p>';
}
async function load(which){try{var r=await fetch('data/sports/'+which+'.json',{cache:'no-store'});if(!r.ok)return null;var d=await r.json();return d.sport===which&&d.bookKey==='winamax_fr'?d:null;}catch(e){return null;}}
async function refresh(){var version=++revision;var values=await Promise.all([load(sport),scope.value==='mixed'?load(sport==='basket'?'tennis':'basket'):Promise.resolve(other)]);if(version!==revision)return;doc=values[0];other=values[1];if(!doc)status.textContent='Source indisponible';var matches=data(doc);options(day,Array.from(new Set(matches.map(function(m){return paris(m.kickoff);}))).sort());options(league,Array.from(new Set(matches.map(function(m){return m.league;}))).sort());render();}
function notice(text){document.getElementById('sportNotice').textContent=text;}
comboArea.addEventListener('click',function(e){var button=e.target.closest('[data-combo]');if(!button)return;var c=combinations[Number(button.dataset.combo)];if(!c)return;selected=c;document.getElementById('sportTicket').hidden=false;document.getElementById('sportTicketLegs').innerHTML=c.legs.map(function(l){return '<div class="combo-leg"><strong>'+esc(l.label)+' · '+price(l.o)+'</strong><small>'+esc(l.match.home)+' – '+esc(l.match.away)+' · '+esc(date(l.match.kickoff))+'</small></div>';}).join('');document.getElementById('sportTicketOdds').value=price(c.odds);document.getElementById('sportTicketConfirmed').checked=false;notice('');document.getElementById('sportTicket').scrollIntoView({behavior:'smooth',block:'start'});});
document.getElementById('sportTicketClear').addEventListener('click',function(){selected=null;document.getElementById('sportTicket').hidden=true;});
document.getElementById('sportTicketForm').addEventListener('submit',function(e){
 e.preventDefault();if(!selected)return;
 var odds=Number(document.getElementById('sportTicketOdds').value.replace(',','.')),stake=Number(document.getElementById('sportTicketStake').value);
 if(!Number.isFinite(odds)||odds<=1||!Number.isFinite(stake)||stake<=0||!document.getElementById('sportTicketConfirmed').checked){notice('Vérifie la cote, la mise et la confirmation Winamax.');return;}
 var available=data(doc).concat(data(other)),legs=[];
 for(var l of selected.legs){var m=available.find(function(m){return SportCombos.key(m)===SportCombos.key(l.match);});if(!m||m['o'+l.code]!==l.o){notice('Une rencontre a commencé ou les cotes ont changé. Choisis à nouveau un combiné après actualisation.');return;}legs.push({matchId:m.id,sport:m.sport,date:paris(m.kickoff),league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,code:l.code,label:l.label,o:l.o,p:null,est:false,bookKey:m.bookKey,asOf:m.asOf});}
 try{var bets=JSON.parse(localStorage.getItem('cdj.bets')||'[]');if(!Array.isArray(bets))throw Error('storage');bets.push({id:'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),createdAt:new Date().toISOString(),source:'sports',legs:legs,odds:odds,stake:stake,estProb:null,manual:null});localStorage.setItem('cdj.bets',JSON.stringify(bets));}catch(e){notice('Impossible d’enregistrer sur cet appareil. Ton ticket reste affiché.');return;}
 selected=null;document.getElementById('sportTicket').hidden=true;document.getElementById('sportTicketForm').reset();document.getElementById('sportNotice').innerHTML='Ticket enregistré sur cet appareil. <a href="tableau.html">Voir le tableau de bord</a>.';
});
document.getElementById('comboSettings').addEventListener('submit',function(e){e.preventDefault();});
['comboCount','comboMin','comboMax','comboDay'].forEach(function(id){document.getElementById(id).addEventListener('input',renderCombos);});
scope.addEventListener('change',refresh);day.addEventListener('change',render);league.addEventListener('change',render);refresh();setInterval(render,30000);setInterval(refresh,300000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
})();
