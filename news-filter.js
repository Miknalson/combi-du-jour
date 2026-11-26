/* Filtre « actu de dernière minute » : écarte des tickets les matchs jugés douteux par l'IA
   (blessé clé, équipe B, report possible…). Ce n'est PAS un modèle de prédiction :
   l'algorithme et les cotes ne changent pas, on retire seulement des matchs des données d'entrée.
   Fonctions pures (aucun appel réseau) : utilisées par scripts/news_filter.cjs, scripts/safe_but.cjs et les tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NewsFilter=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// v2 (26/11/2026) : le 25/11 la recherche (5 pour 4 matchs) s'est arrêtée trop tôt et les matchs « non vérifiés » ont été validés (Lille – Bayern).
// Désormais : 3 recherches par match, liste des absents exigée, « non vérifié » revérifié puis écarté par prudence.
var RULES={version:'news-filter-v2',maxMatchesPerCall:6,maxRounds:4,searchesPerMatch:3,maxSearchesPerCall:20,maxTries:2,keepDays:30};
function searches(n){return Math.min(RULES.maxSearchesPerCall,2+RULES.searchesPerMatch*Math.max(1,n||0));}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function sportOf(m){return m.sport||'football';}
function key(m){return [sportOf(m),paris(m.kickoff),norm(m.home),norm(m.away)].join('|');}
// Même rencontre : même sport, même jour (Paris) et au moins une équipe identique (les noms varient parfois d'une source à l'autre).
function same(a,b){if(sportOf(a)!==sportOf(b)||paris(a.kickoff)!==paris(b.kickoff))return false;
 var x=[norm(a.home),norm(a.away)],y=[norm(b.home),norm(b.away)];return x[0]===y[0]||x[1]===y[1];}
// Écartés : les matchs douteux, et ceux que l'IA n'a toujours pas pu vérifier après maxTries essais (prudence).
function final(c){return !!c&&(c.verdict==='douteux'||c.verdict==='non_verifie'&&(c.tries||1)>=RULES.maxTries);}
function excluded(dayStore){return Object.keys(dayStore&&dayStore.checks||{}).map(function(k){return dayStore.checks[k];}).filter(final);}
function isExcluded(m,list){return (list||[]).some(function(c){return same(m,c);});}
// Copie du document (data/sports/*.json ou data/days/*.json) sans les matchs écartés.
function apply(doc,list,sport){if(!doc||!Array.isArray(doc.matches)||!(list||[]).length)return doc;
 var out=Object.assign({},doc),gone=[];
 out.matches=doc.matches.filter(function(m){var mm=Object.assign({sport:sport||doc.sport||'football'},m);if(isExcluded(mm,list)){gone.push(m);return false;}return true;});
 if(gone.length)out.newsExcluded=gone.map(function(m){var c=list.find(function(c){return same(Object.assign({sport:sport||doc.sport||'football'},m),c);});return {id:m.id,home:m.home,away:m.away,kickoff:m.kickoff,reason:c&&c.reason||''};});
 return out;}
// Rencontres distinctes des sélections, pas encore vérifiées et pas encore commencées.
function toCheck(legs,dayStore,now){var seen={},out=[];(legs||[]).forEach(function(l){var k=key(l);
 var old=dayStore&&dayStore.checks&&dayStore.checks[k];
 if(seen[k]||old&&!(old.verdict==='non_verifie'&&!final(old))||!(Date.parse(l.kickoff)>now))return;seen[k]=1;
 out.push({key:k,sport:sportOf(l),league:l.league||'',home:l.home,away:l.away,kickoff:l.kickoff,pick:l.label||l.code||''});});
 return out.slice(0,RULES.maxMatchesPerCall);}
var SPORT_FR={football:'football',basket:'basket',tennis:'tennis',volley:'volley',hockey:'hockey',rugby_xv:'rugby à XV',rugby_xiii:'rugby à XIII',football_us:'football américain'};
var SYSTEM='Tu vérifies l’actualité de dernière minute avant des paris sportifs fictifs. Tu ne prédis pas le résultat et tu ne juges pas la cote : '+
 'tu cherches les informations récentes et concrètes qui rendent le pari proposé nettement plus risqué que ce que la cote laisse penser.\n'+
 'MÉTHODE OBLIGATOIRE pour chaque match : fais au moins une recherche dédiée à la liste des absents (blessés, suspendus, incertains, groupe convoqué) '+
 'de l’équipe sur laquelle porte le pari, par exemple « <équipe> absents blessés <adversaire> » ou « <équipe> injuries vs <adversaire> » ; '+
 'regarde aussi la composition probable et la rotation annoncée. Sources utiles : sites des clubs, L’Équipe, UEFA, Kicker, Marca, Gazzetta, BBC, ESPN, FotMob, Transfermarkt.\n'+
 'Marque « douteux » si l’équipe sur laquelle on parie : a au moins 3 titulaires habituels absents ou incertains (même si certaines absences sont anciennes : elles comptent dans le total), '+
 'ou perd un joueur clé (meilleur buteur, meneur, gardien titulaire, star) ; ou fait tourner son effectif / aligne une équipe B (qualification acquise, gros match juste après) ; '+
 'ou si le match est menacé de report (météo, sécurité, grève), ou en cas de crise grave (entraîneur limogé la veille, grève des joueurs). '+
 'Au tennis : joueur diminué, revenant de blessure ou forfait possible.\n'+
 'Ne marque PAS « douteux » pour : un seul remplaçant absent, une simple méforme, une rumeur sans source, ou parce que tu penses que le favori peut perdre.\n'+
 'Si tu n’as trouvé AUCUNE source sur les absents de l’équipe soutenue (recherche épuisée, rien de daté), réponds « non_verifie » : ne réponds jamais « ok » sans avoir vu ces informations.\n'+
 'Sources récentes (moins de 72 h de préférence). Réponds en français.\n'+
 'Termine OBLIGATOIREMENT par un seul objet JSON, sans texte après, de la forme : '+
 '{"matches":[{"id":"m1","verdict":"ok","absents":["Nom (blessé)","Nom (suspendu)"],"raison":"phrase courte (140 caractères max)","sources":["https://…"]}]} '+
 'avec verdict = "ok", "douteux" ou "non_verifie", absents = les absents ou incertains de l’équipe soutenue ([] si aucun), et une entrée par match.';
function prompt(list,now){return 'Nous sommes le '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'}).format(new Date(now))+' (heure de Paris).\n'+
 'Matchs à vérifier :\n'+list.map(function(m,i){return 'm'+(i+1)+' · '+(SPORT_FR[m.sport]||m.sport)+(m.league?' ('+m.league+')':'')+' · '+
  new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(m.kickoff))+' · '+m.home+' – '+m.away+' · pari envisagé : '+m.pick;}).join('\n');}
// Dernier objet JSON {"matches":[…]} du texte de réponse.
function parse(text,list){var s=String(text||''),i=s.lastIndexOf('{"matches"');if(i<0)i=s.indexOf('{');var j=s.lastIndexOf('}');if(i<0||j<i)return null;
 var data;try{data=JSON.parse(s.slice(i,j+1));}catch(e){return null;}if(!data||!Array.isArray(data.matches))return null;
 var out={};data.matches.forEach(function(r){var n=Number(String(r&&r.id||'').replace(/\D/g,''))-1,m=list[n];if(!m)return;
  var raw=norm(r.verdict),reason=String(r.raison||r.reason||'').slice(0,200);
  var v=raw==='douteux'?'douteux':/^(non verifie|inconnu|unverified)$/.test(raw)?'non_verifie':'ok';
  // Un « ok » qui avoue ne pas avoir vérifié (cas du 25/11) n'est pas un ok.
  if(v==='ok'&&/non v[ée]rifi|limite de recherche|pas pu v[ée]rifier/i.test(reason))v='non_verifie';
  out[m.key]={verdict:v,reason:reason,absents:(Array.isArray(r.absents)?r.absents:[]).map(function(x){return String(x).slice(0,60);}).slice(0,12),
   sources:(Array.isArray(r.sources)?r.sources:[]).filter(function(u){return /^https?:\/\//.test(u);}).slice(0,3)};});
 return out;}
return {rules:RULES,searches:searches,final:final,paris:paris,key:key,same:same,excluded:excluded,isExcluded:isExcluded,apply:apply,toCheck:toCheck,system:SYSTEM,prompt:prompt,parse:parse};
});
