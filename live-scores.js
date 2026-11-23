/* Scores en direct du football, lus dans le navigateur sur les tableaux publics d'ESPN (gratuits, sans clé ni crédit).
   - Pendant le match : m.live = {score:'1-0', clock:"67'"} (affichage seulement, jamais utilisé pour régler un ticket).
   - Fin du temps réglementaire confirmée (FT, 2 périodes) : m.score + completed:true, comme le relevé de scripts/update_scores.py.
   Prolongations et tirs au but ne donnent pas de score final : le règlement attend le relevé publié. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LiveScores=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Mêmes codes que scripts/update_scores.py (Pologne, Serbie et Ukraine ne sont pas couvertes par ESPN : réponse 400).
var LEAGUES={PL:'eng.1',CHA:'eng.2',LIGA:'esp.1',LIGA2:'esp.2',SA:'ita.1',BL:'ger.1',BL2:'ger.2',L1:'fra.1',L2:'fra.2',POR:'por.1',POR2:'por.2',ERE:'ned.1',BEL:'bel.1',UCL:'uefa.champions',UEL:'uefa.europa',UECL:'uefa.europa.conf',UNL:'uefa.nations',EURO:'uefa.euro',EUROQ:'uefa.euroq',UWCL:'uefa.wchampions',TUR:'tur.1',DEN:'den.1',SWE:'swe.1',ROU:'rou.1',RUS:'rus.1',IRL:'irl.1'};
var WINDOW_BEFORE=5*60000,WINDOW_AFTER=4*3600000;
function paris(t){return new Date(t).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
function norm(s){return String(s||'').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/œ/g,'oe').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\b(fc|cf|afc|sc|ac|women|w)\b/g,'').replace(/[^a-z0-9]+/g,'');}
function sameTeam(a,names){a=norm(a);if(!a)return false;return names.some(function(n){n=norm(n);return n&&(n===a||n.length>=4&&a.length>=4&&(n.indexOf(a)>=0||a.indexOf(n)>=0));});}
function isFinal(m){return /^\d+\s*-\s*\d+$/.test(String(m&&m.score||''))&&m.scoreStatus!=='live';}
// Match à suivre : ligue couverte, coup d'envoi passé (ou dans 5 min) depuis moins de 4 h, pas encore de score final.
function wanted(m,now){if(!m||m.sport&&m.sport!=='football'||!LEAGUES[m.league]||isFinal(m))return false;var k=Date.parse(m.kickoff);return Number.isFinite(k)&&k<=now+WINDOW_BEFORE&&k>=now-WINDOW_AFTER;}
function readEvent(ev){
 if(!ev||typeof ev!=='object')return null;
 var c=(ev.competitions||[])[0];if(!c||!Array.isArray(c.competitors))return null;
 var st=c.status||ev.status||{},type=st.type||{},sides={};
 c.competitors.forEach(function(x){if(x&&x.homeAway)sides[x.homeAway]=x;});
 if(!sides.home||!sides.away)return null;
 function sc(x){var v=x.score;if(v&&typeof v==='object')v=v.value;return /^\d+$/.test(String(v))?Number(v):null;}
 function names(x){var t=x.team||{};return [t.displayName,t.shortDisplayName,t.name,t.location].filter(Boolean);}
 var h=sc(sides.home),a=sc(sides.away);
 return {kickoff:c.date||ev.date,home:names(sides.home),away:names(sides.away),state:type.state||'',
  final:type.completed===true&&['STATUS_FULL_TIME','STATUS_FINAL'].indexOf(type.name)>=0&&st.period===2&&h!==null&&a!==null,
  score:h!==null&&a!==null?h+'-'+a:null,clock:type.shortDetail||st.displayClock||''};
}
// Même rencontre : coup d'envoi à 15 min près et les deux équipes reconnues, ou coup d'envoi identique et une équipe reconnue.
function findEvent(m,events){
 var k=Date.parse(m.kickoff),found=events.filter(function(e){var d=Math.abs(Date.parse(e.kickoff)-k);if(!(d<=15*60000))return false;var h=sameTeam(m.home,e.home),a=sameTeam(m.away,e.away);return h&&a||d===0&&(h||a);});
 return found.length===1?found[0]:null;
}
function apply(m,e,now){
 if(e.final){var changed=m.score!==e.score||m.completed!==true;
  Object.assign(m,{score:e.score,scoreStatus:'final',scoreScope:'regulation',completed:true,scoreSource:'ESPN (direct)',scoreUpdatedAt:new Date(now).toISOString()});delete m.live;return changed;}
 if(e.state==='in'&&e.score){var prev=m.live&&m.live.score+'|'+m.live.clock;m.live={score:e.score,clock:e.clock,at:new Date(now).toISOString()};return prev!==e.score+'|'+e.clock;}
 if(e.state==='post'&&e.score){var was=m.live&&m.live.ended;m.live={score:e.score,clock:e.clock||'Terminé',ended:true,at:new Date(now).toISOString()};return !was;}
 return false;
}
function url(code,day){return 'https://site.api.espn.com/apis/site/v2/sports/soccer/'+code+'/scoreboard?dates='+day.replace(/-/g,'')+'&limit=100';}
function getJson(u,fetcher){
 var f=fetcher||(typeof fetch==='function'?fetch:null);if(!f)return Promise.resolve(null);
 var ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl&&setTimeout(function(){ctl.abort();},10000);
 return f(u,ctl?{signal:ctl.signal}:{}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}).finally(function(){if(timer)clearTimeout(timer);});
}
// Une requête par ligue et par jour, seulement pour les matchs en cours ou juste terminés.
function refresh(matches,opts){
 opts=opts||{};var now=opts.now||Date.now(),groups={};
 (matches||[]).forEach(function(m){if(!wanted(m,now))return;var key=m.league+'|'+paris(m.kickoff);(groups[key]=groups[key]||[]).push(m);});
 var keys=Object.keys(groups).slice(0,opts.maxRequests||10);
 return Promise.all(keys.map(function(key){var p=key.split('|');return getJson(url(LEAGUES[p[0]],p[1]),opts.fetch).then(function(doc){
  var events=(doc&&Array.isArray(doc.events)?doc.events:[]).map(readEvent).filter(Boolean),changed=0;
  groups[key].forEach(function(m){var e=findEvent(m,events);if(e&&apply(m,e,now))changed++;});return {ok:!!doc,changed:changed};});}))
 .then(function(res){return {requests:keys.length,failed:res.filter(function(r){return !r.ok;}).length,changed:res.reduce(function(s,r){return s+r.changed;},0),
  live:(matches||[]).filter(function(m){return m.live&&!m.live.ended&&!isFinal(m);}).length,watching:(matches||[]).filter(function(m){return wanted(m,now);}).length};});
}
// Actualise toutes les minutes tant qu'un match est en cours, toutes les 5 min sinon ; pause quand l'appli est en arrière-plan.
function watch(getMatches,onChange,opts){
 opts=opts||{};var timer=null,busy=false,stopped=false;
 function schedule(ms){clearTimeout(timer);if(!stopped)timer=setTimeout(tick,ms);}
 function tick(){
  if(busy)return;if(typeof document!=='undefined'&&document.hidden){schedule(60000);return;}
  var list=getMatches()||[];if(!list.some(function(m){return wanted(m,Date.now());})){schedule(5*60000);return;}
  busy=true;refresh(list,opts).then(function(r){if(r.changed&&onChange)onChange(r);schedule(r.live||r.watching?60000:5*60000);}).catch(function(){schedule(5*60000);}).finally(function(){busy=false;});
 }
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule(0);});
 tick();
 return {stop:function(){stopped=true;clearTimeout(timer);},now:function(){schedule(0);}};
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function badge(m){if(!m||!m.live||isFinal(m))return '';return '<span class="live-badge'+(m.live.ended?' ended':'')+'" title="Score en direct (ESPN)">'+(m.live.ended?'':'<i></i>')+esc(m.live.score.replace('-',' - '))+(m.live.clock?' <small>'+esc(m.live.clock)+'</small>':'')+'</span>';}
return {LEAGUES:LEAGUES,norm:norm,wanted:wanted,readEvent:readEvent,findEvent:findEvent,apply:apply,refresh:refresh,watch:watch,badge:badge,isFinal:isFinal};
});
