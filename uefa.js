(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.UefaCalendar=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function paris(x){return new Date(x).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
function isUefa(m){return /_uefa_|qualifiers_europe/.test(m.sportKey||'')||['UNL','UCL','UEL','UECL','EUROQ','EURO','WCQE','UWCL'].includes(m.leagueCode||m.league)||/uefa/i.test(m.league||'');}
function priced(m,now){var age=now-Date.parse(m.asOf);return m.sport==='football'&&m.bookKey==='winamax_fr'&&Date.parse(m.kickoff)>now&&age>=0&&age<=86400000&&[m.o1,m.oX,m.o2].every(function(o){return Number.isFinite(o)&&o>1;});}
function realQuote(m,now){var b=m.mine||{};return priced(Object.assign({},b,{sport:'football',kickoff:m.kickoff}),now);}
function mergeDays(days,doc,now){
 if(!doc||doc.status!=='ok'||doc.bookKey!=='winamax_fr')return days;
 (doc.matches||[]).filter(function(m){return priced(m,now);}).forEach(function(m){var day=paris(m.kickoff),d=days[day]||(days[day]={date:day,matches:[]});var target=d.matches.find(function(old){return old.home.toLowerCase()===m.home.toLowerCase()&&old.away.toLowerCase()===m.away.toLowerCase()&&Date.parse(old.kickoff)===Date.parse(m.kickoff);});
  if(!target){target={id:m.id,league:m.leagueCode||m.sportKey||m.league,home:m.home,away:m.away,kickoff:m.kickoff,o1:m.o1,oX:m.oX,o2:m.o2,books:1,quoteBasis:'winamax-only'};d.matches.push(target);}
  target.leagueTitle=m.league;target.mine={book:'Winamax France',bookKey:'winamax_fr',asOf:m.asOf,o1:m.o1,oX:m.oX,o2:m.o2,ou:{}};
  (m.markets||[]).filter(function(g){return g.family==='totals';}).forEach(function(g){var o=g.outcomes.find(function(o){return o.side==='over';}),u=g.outcomes.find(function(o){return o.side==='under';});if(o&&u)target.mine.ou[String(g.line)]={o:o.odds,u:u.odds};});
  d.matches.sort(function(a,b){return Date.parse(a.kickoff)-Date.parse(b.kickoff);});d.updatedAt=doc.updatedAt;d.source='Winamax France et archives des marchés';
 });return days;
}
function fixtures(doc,now){if(!doc||doc.bookKey!=='winamax_fr')return [];var seen=new Set();return (doc.fixtures||[]).concat((doc.matches||[]).filter(isUefa)).filter(function(m){if(!isUefa(m)||Date.parse(m.kickoff)<=now||!Number.isFinite(Date.parse(m.kickoff)))return false;var id=m.home+'|'+m.away+'|'+Date.parse(m.kickoff);if(seen.has(id))return false;seen.add(id);return true;}).sort(function(a,b){return Date.parse(a.kickoff)-Date.parse(b.kickoff);});}
function render(id,doc,now){
 now=now===undefined?Date.now():now;var el=document.getElementById(id);if(!el)return;
 function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 var list=fixtures(doc,now),dates=Array.from(new Set(list.map(function(m){return paris(m.kickoff);}))),selected=el.dataset.day;
 if(!dates.includes(selected)&&selected!=='all')selected=dates.includes(paris(now))?paris(now):dates[0];
 var labels={UNL:'Ligue des nations UEFA',UCL:'Ligue des champions UEFA',UEL:'Ligue Europa UEFA',UECL:'Conference League UEFA',EUROQ:'Qualifications Euro UEFA',WCQE:'Qualifications européennes Coupe du monde',UWCL:'Ligue des champions féminine UEFA'};
 var prices=(doc&&doc.matches||[]).filter(function(m){return priced(m,now);});
 var message=!doc?'Calendrier UEFA momentanément indisponible.':doc.status==='unconfigured'?'La connexion aux cotes n’est pas activée.':doc.status==='unavailable'?'La source de calendrier est momentanément indisponible.':doc.calendarStatus==='partial'?'Calendrier incomplet : certaines compétitions n’ont pas pu être consultées.':'Aucun match UEFA annoncé par la source sur les '+(doc.horizonDays||14)+' prochains jours.';
 el.innerHTML='<div class="head"><h2>UEFA · prochains matchs</h2><span class="status">Clubs et sélections · '+(doc&&doc.horizonDays||14)+' jours</span></div>'+(list.length?'<label class="uefa-filter">Date <select aria-label="Date des matchs UEFA"><option value="all">Toutes les dates</option>'+dates.map(function(d){return '<option value="'+esc(d)+'"'+(d===selected?' selected':'')+'>'+esc(d)+'</option>';}).join('')+'</select></label><div class="uefa-grid">'+list.filter(function(m){return selected==='all'||paris(m.kickoff)===selected;}).map(function(m){var q=prices.find(function(p){return p.id===m.id||p.home===m.home&&p.away===m.away&&Date.parse(p.kickoff)===Date.parse(m.kickoff);});return '<article class="uefa-match"><span class="eyebrow">'+esc(labels[m.leagueCode]||m.league)+'</span><h3>'+esc(m.home)+' – '+esc(m.away)+'</h3><p>'+esc(new Date(m.kickoff).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</p>'+(q?'<p class="uefa-prices">Winamax · 1 '+q.o1.toFixed(2)+' · N '+q.oX.toFixed(2)+' · 2 '+q.o2.toFixed(2)+'</p><p class="status">Relevé du '+esc(new Date(q.asOf).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</p>':'<p class="status">Rencontre programmée · cotes Winamax non encore relevées. Elle n’entre pas dans un combiné sans prix réel.</p>')+'</article>';}).join('')+'</div>':'<p class="empty">'+message+'</p>')+'<p class="status">Un calendrier de rencontres ne garantit pas un ticket admissible. Les seuils et les cotes réelles restent nécessaires pour les simulations et le Safe du jour.</p>';
 if(list.length){var select=el.querySelector('select');if(selected==='all')select.value='all';select.addEventListener('change',function(){el.dataset.day=select.value;render(id,doc,Date.now());});}
}
return {isUefa:isUefa,priced:priced,realQuote:realQuote,mergeDays:mergeDays,fixtures:fixtures,render:render};
});
