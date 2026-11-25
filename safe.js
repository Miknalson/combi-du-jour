(function(){
'use strict';
var titles=Object.fromEntries(SportCatalog.shown.map(function(s){return [s,SportCatalog.sports[s].label];}));titles.mixed='Mix foot / basket / tennis';
var docs=[],slate=null,selected=null,version=0;
var day=document.getElementById('safeDay'),cards=document.getElementById('safeCards'),status=document.getElementById('safeStatus'),notice=document.getElementById('safeNotice');
function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function price(o){return o.toFixed(2).replace('.',',');}function pct(p){return (100*p).toFixed(1).replace('.',',')+' %';}
function stamp(x){return new Date(x).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function pool(){return SafeMulti.documents(docs);}
function legsHtml(t){return '<ol>'+t.legs.map(function(l){return '<li><strong>'+esc(l.label)+'</strong> · '+price(l.o)+'<br>'+esc(l.home)+' – '+esc(l.away)+'<small>'+esc(titles[l.sport])+' · '+esc(l.league||'')+' · '+esc(stamp(l.kickoff))+'</small><small>Winamax France · relevé le '+esc(stamp(l.asOf))+' · '+pct(l.p)+' indicatifs</small></li>';}).join('')+'</ol>';}
function remember(result){
 try{var history=JSON.parse(localStorage.getItem('cdj.safeDaily')||'{}');if(!history||typeof history!=='object'||Array.isArray(history))return;
  var d=history[result.day]||{};Object.keys(result.slots).forEach(function(k){var t=result.slots[k];if(t&&!d[k])d[k]={createdAt:result.generatedAt,method:'safe-multisport-exploration-v2',explorationOnly:true,ticket:t};});history[result.day]=d;
  Object.keys(history).sort().slice(0,-90).forEach(function(k){delete history[k];});localStorage.setItem('cdj.safeDaily',JSON.stringify(history));
 }catch(e){} // Une panne de stockage ne doit pas masquer les cotes.
}
function emptyReason(k){
 if(k==='mixed'){var missing=SafeMulti.MIXED.filter(function(s){return !slate.candidateCounts[s];});return missing.length?'Il manque des sélections Winamax admissibles en '+missing.map(function(s){return titles[s];}).join(', ')+'. Aucun combiné des trois sports ne peut être calculé.':'Aucun trio avec exactement un match de chaque sport ne respecte à la fois la cote 1,50–2,00 et le seuil de 60 % minimum pour le ticket entier.';}
 var doc=docs.find(function(d){return d&&d.sport===k;});
 if(!doc)return 'Le relevé de ce sport est inaccessible. Réessaie après l’actualisation.';
 if(doc.status==='unconfigured')return 'La connexion aux cotes Winamax n’est pas configurée.';
 if(doc.status==='quota')return 'Le quota de consultation est atteint. Aucun prix de remplacement n’est utilisé.';
 if(doc.status==='unsupported')return 'Ce sport n’est pas transmis par le fournisseur actuel : aucun prix ni Safe ne sont inventés.';
 if(doc.status==='inactive')return 'Les compétitions connues de ce sport sont actuellement hors saison.';
 if(doc.status==='no_winamax')return 'Aucune cote Winamax trouvée sur les rencontres examinées. Les prix d’autres bookmakers ne sont pas utilisés.';
 if(doc.status!=='ok')return 'La source Winamax est momentanément indisponible.';
 return slate.candidateCounts[k]?'Des sélections atteignent 60 %, mais leur combinaison ne respecte pas les deux critères : '+(k==='football'?'50 % minimum pour le ticket entier et cote 1,70–2,00':'60 % minimum pour le ticket entier et cote 1,50–2,00')+'. Les probabilités se multiplient ; elles ne s’additionnent pas.':'Aucune sélection Winamax admissible à 60 % minimum pour ce jour. Victoires, buts, sets, handicaps et totaux sont comparés lorsqu’ils sont disponibles.';
}
function render(){
 slate=SafeMulti.build(pool(),{day:day.value,now:Date.now(),gender:document.getElementById('safeGender').value});remember(slate);
 var count=Object.values(slate.slots).filter(Boolean).length;
 status.textContent=count+' ticket(s) admissible(s) · '+SafeMulti.SPORTS.filter(SportCatalog.isShown).map(function(s){var d=docs.find(function(x){return x&&x.sport===s;});return titles[s]+(d&&d.partial?' : couverture partielle':'');}).join(' · ');
 cards.innerHTML=Object.keys(titles).map(function(k){var t=slate.slots[k];if(!t)return '<article class="safe-card empty"><span class="eyebrow">'+esc(titles[k])+'</span><h2>Aucun ticket admissible</h2><p>'+esc(emptyReason(k))+'</p></article>';
 var oldest=Math.min.apply(null,t.legs.map(function(l){return Date.parse(l.asOf);})),age=Date.now()-oldest;
 return '<article class="safe-card" data-slot="'+k+'"><span class="eyebrow">'+esc(titles[k])+' · '+t.legs.length+' sélection(s)</span><h2>'+(k==='mixed'?'Un match par sport':'Le ticket le plus probable disponible')+'</h2><div class="safe-figures"><div><small>Cote Winamax relevée</small><strong>'+price(t.odds)+'</strong></div><div><small>Probabilité indicative</small><strong>'+pct(t.p)+'</strong></div></div>'+(t.legs.length>1?'<p class="status">Probabilités multipliées · matchs supposés indépendants.</p>':'')+(k==='mixed'?'<p class="status">Calculé séparément : ce ticket n’additionne pas les trois tickets ci-dessus.</p>':'')+legsHtml(t)+(age>3600000?'<p class="safe-warning">Relevé de plus d’une heure : la cote actuelle doit être vérifiée chez Winamax.</p>':'')+'<button class="btn" type="button" data-select="'+k+'">Choisir et vérifier ce ticket</button></article>';
 }).join('');
 var diag=SafeMulti.SPORTS.filter(SportCatalog.isShown).map(function(s){var d=docs.find(function(d){return d&&d.sport===s;}),r=SafeMulti.diagnostics(d,s,{day:day.value,now:Date.now(),gender:document.getElementById('safeGender').value});return '<tr><td>'+esc(titles[s])+'</td><td>'+r.events+'</td><td>'+r.femaleEvents+'</td><td>'+r.markets+'</td><td>'+r.eligible+'</td><td>'+esc(r.status)+(r.partial?' · partiel':'')+'</td></tr>';}).join('');
 document.getElementById('safeDiagnostics').innerHTML='<h2>Pourquoi un Safe manque-t-il ?</h2><p>Par sport et pour le jour choisi : rencontres avec cotes utilisables, marchés complets, puis sélections atteignant 60 %. Il faut encore que le ticket entier atteigne 60 % et une cote entre 1,50 et 2,00 (foot : 50 % et 1,70 à 2,00). Les handicaps et totaux principaux sont souvent proches de 50 % et ne franchissent donc pas ce seuil.</p><div class="tbl-wrap"><table><thead><tr><th>Sport</th><th>Rencontres cotées</th><th>Féminines</th><th>Marchés</th><th>Sélections ≥60 %</th><th>Source</th></tr></thead><tbody>'+diag+'</tbody></table></div><p class="status">La source peut ne pas couvrir un sport, un championnat ou certains marchés pourtant disponibles dans Winamax. Les probabilités proviennent des prix hors marge, pas de statistiques indépendantes sur les blessures, compositions ou la forme récente.</p>';
 var list=slate.shortlist||[];
 document.getElementById('safeShortlist').innerHTML='<h2>Sélections à 60 % minimum</h2><p class="status">Ces sélections isolées ne sont pas un ticket validé à 1,50–2,00. Le pourcentage du combiné diminue à chaque sélection ajoutée.</p>'+SafeMulti.SPORTS.filter(SportCatalog.isShown).map(function(s){var used=new Set(),items=list.filter(function(l){if(l.sport!==s||used.has(l.matchId))return false;used.add(l.matchId);return true;}).slice(0,3);return '<div class="safe-card"><h3>'+esc(titles[s])+'</h3>'+(items.length?legsHtml({legs:items}):'<p>Aucune sélection disponible à 60 % minimum.</p>')+'</div>';}).join('');
}
async function load(){var n=++version;status.textContent='Lecture des derniers relevés…';var next=await Promise.all(SafeMulti.SPORTS.map(async function(s){try{var r=await fetch('data/sports/'+s+'.json',{cache:'no-store'});if(!r.ok)return null;var d=await r.json();return d.sport===s&&d.bookKey==='winamax_fr'?d:null;}catch(e){return null;}}));if(n!==version)return;docs=next;var football=docs.find(function(d){return d&&d.sport==='football';});UefaCalendar.render('uefaFixtures',football);
 var today=SafeMulti.paris(Date.now()),prior=day.value,dates=Array.from(new Set([today].concat(pool().concat(football&&football.fixtures||[]).filter(function(m){return Date.parse(m.kickoff)>Date.now();}).map(function(m){return SafeMulti.paris(m.kickoff);})))) .sort();
 day.innerHTML=dates.map(function(d){return '<option value="'+esc(d)+'">'+esc(d===today?'Aujourd’hui · '+d:d)+'</option>';}).join('');day.value=dates.includes(prior)?prior:today;render();
}
function close(){selected=null;document.getElementById('safeTicket').hidden=true;}
cards.addEventListener('click',function(e){var b=e.target.closest('[data-select]');if(!b)return;render();var t=slate.slots[b.dataset.select];if(!t){notice.textContent='Ce ticket n’est plus disponible. Les horaires ou les prix ont changé.';return;}selected={kind:b.dataset.select,ticket:t,day:day.value};var el=document.getElementById('safeTicket');el.hidden=false;document.getElementById('safeTicketTitle').textContent='Mon ticket · '+titles[selected.kind];document.getElementById('safeTicketLegs').innerHTML=legsHtml(t);document.getElementById('safeOdds').value=price(t.odds);document.getElementById('safeStake').value='';document.getElementById('safeConfirmed').checked=false;notice.textContent='';el.scrollIntoView({behavior:'smooth',block:'start'});});
document.getElementById('safeTicketForm').addEventListener('submit',async function(e){
 e.preventDefault();if(!selected)return;var snapshot=selected,odds=Number(document.getElementById('safeOdds').value.replace(',','.')),stake=Number(document.getElementById('safeStake').value);
 var minOdds=(SafeMulti.LIMITS[selected.kind]||SafeMulti.LIMITS.default).minOdds;if(!Number.isFinite(odds)||odds<minOdds-1e-9||odds>2){notice.textContent='La cote Winamax confirmée doit être comprise entre '+price(minOdds)+' et 2,00. En dessous, c’est le rôle du Très sûr.';return;}
 if(!Number.isFinite(stake)||stake<=0||!document.getElementById('safeConfirmed').checked){notice.textContent='Indique ta mise et vérifie les sélections et la cote chez Winamax.';return;}
 await load();if(selected!==snapshot)return;
 var current=SafeMulti.candidates(pool(),{now:Date.now(),day:snapshot.day}),legs=[];
 for(var l of snapshot.ticket.legs){var found=current.find(function(x){return x.id===l.id;});if(!found||found.o!==l.o||Math.abs(found.p-l.p)>1e-9){notice.textContent='Une rencontre a commencé ou un prix a changé. Choisis à nouveau un ticket parmi les relevés actualisés.';close();return;}legs.push({...found});}
 try{var bets=JSON.parse(localStorage.getItem('cdj.bets')||'[]');if(!Array.isArray(bets))throw Error('storage');
  if(bets.some(function(b){return b.source==='safe'&&b.safeDay===snapshot.day&&b.safeKind===snapshot.kind;})){notice.textContent='Un ticket de cette catégorie est déjà enregistré pour ce jour. Consulte ton tableau de bord.';return;}
  bets.push({id:'safe-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),createdAt:new Date().toISOString(),source:'safe',safeKind:snapshot.kind,safeDay:snapshot.day,legs:legs,odds:odds,quotedOdds:snapshot.ticket.odds,stake:stake,estProb:snapshot.ticket.p,probabilityMethod:'winamax-power-devig'+(legs.length>1?'-independent':''),manual:null});localStorage.setItem('cdj.bets',JSON.stringify(bets));close();notice.innerHTML='Ticket enregistré. <a href="tableau.html">Voir les résultats dans mon tableau de bord</a>.';
 }catch(error){notice.textContent='Impossible d’enregistrer sur cet appareil. Aucun ancien ticket n’a été supprimé.';}
});
document.getElementById('safeGender').addEventListener('change',function(){close();render();});
day.addEventListener('change',function(){close();render();});document.getElementById('safeRefresh').addEventListener('click',function(){close();load();});document.getElementById('safeCancel').addEventListener('click',close);
load();setInterval(function(){if(slate)render();},60000);
})();
