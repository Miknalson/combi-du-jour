/* Filtre « actu de dernière minute » : écarte des tickets les matchs jugés douteux par l'IA
   (blessé clé, équipe B, report possible…). Ce n'est PAS un modèle de prédiction :
   l'algorithme et les cotes ne changent pas, on retire seulement des matchs des données d'entrée.
   Fonctions pures (aucun appel réseau) : utilisées par scripts/news_filter.cjs, scripts/safe_but.cjs et les tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NewsFilter=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var RULES={version:'news-filter-v1',maxMatchesPerCall:8,maxRounds:3,maxSearchesPerCall:5,keepDays:30};
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function sportOf(m){return m.sport||'football';}
function key(m){return [sportOf(m),paris(m.kickoff),norm(m.home),norm(m.away)].join('|');}
// Même rencontre : même sport, même jour (Paris) et au moins une équipe identique (les noms varient parfois d'une source à l'autre).
function same(a,b){if(sportOf(a)!==sportOf(b)||paris(a.kickoff)!==paris(b.kickoff))return false;
 var x=[norm(a.home),norm(a.away)],y=[norm(b.home),norm(b.away)];return x[0]===y[0]||x[1]===y[1];}
function excluded(dayStore){return Object.keys(dayStore&&dayStore.checks||{}).map(function(k){return dayStore.checks[k];}).filter(function(c){return c&&c.verdict==='douteux';});}
function isExcluded(m,list){return (list||[]).some(function(c){return same(m,c);});}
// Copie du document (data/sports/*.json ou data/days/*.json) sans les matchs écartés.
function apply(doc,list,sport){if(!doc||!Array.isArray(doc.matches)||!(list||[]).length)return doc;
 var out=Object.assign({},doc),gone=[];
 out.matches=doc.matches.filter(function(m){var mm=Object.assign({sport:sport||doc.sport||'football'},m);if(isExcluded(mm,list)){gone.push(m);return false;}return true;});
 if(gone.length)out.newsExcluded=gone.map(function(m){var c=list.find(function(c){return same(Object.assign({sport:sport||doc.sport||'football'},m),c);});return {id:m.id,home:m.home,away:m.away,kickoff:m.kickoff,reason:c&&c.reason||''};});
 return out;}
// Rencontres distinctes des sélections, pas encore vérifiées et pas encore commencées.
function toCheck(legs,dayStore,now){var seen={},out=[];(legs||[]).forEach(function(l){var k=key(l);
 if(seen[k]||dayStore&&dayStore.checks&&dayStore.checks[k]||!(Date.parse(l.kickoff)>now))return;seen[k]=1;
 out.push({key:k,sport:sportOf(l),league:l.league||'',home:l.home,away:l.away,kickoff:l.kickoff,pick:l.label||l.code||''});});
 return out.slice(0,RULES.maxMatchesPerCall);}
var SPORT_FR={football:'football',basket:'basket',tennis:'tennis',volley:'volley',hockey:'hockey',rugby_xv:'rugby à XV',rugby_xiii:'rugby à XIII',football_us:'football américain'};
var SYSTEM='Tu vérifies l’actualité de dernière minute avant des paris sportifs fictifs. Tu ne prédis pas le résultat et tu ne juges pas la cote : '+
 'tu cherches seulement une information récente et concrète qui rend le pari proposé nettement plus risqué que ce que la cote laisse penser.\n'+
 'Exemples qui rendent un match « douteux » : joueur clé (meilleur buteur, gardien titulaire, star) blessé, suspendu ou incertain ; forte rotation ou équipe B annoncée '+
 '(qualification déjà acquise, gros match juste après) ; joueur de tennis diminué ou forfait possible ; match menacé de report (météo, sécurité, grève) ; crise grave dans le club '+
 '(entraîneur limogé la veille, joueurs en grève).\n'+
 'Ne marque PAS « douteux » pour : une absence déjà ancienne ou d’un remplaçant, une simple méforme, une rumeur sans source, ou parce que tu penses que le favori peut perdre. '+
 'Dans le doute sans information concrète, réponds « ok ».\n'+
 'Utilise la recherche web (sources récentes, de préférence moins de 48 h). Réponds en français.\n'+
 'Termine OBLIGATOIREMENT par un seul objet JSON, sans texte après, de la forme : '+
 '{"matches":[{"id":"m1","verdict":"ok","raison":"phrase courte (140 caractères max)","sources":["https://…"]}]} '+
 'avec verdict = "ok" ou "douteux" et une entrée par match.';
function prompt(list,now){return 'Nous sommes le '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'}).format(new Date(now))+' (heure de Paris).\n'+
 'Matchs à vérifier :\n'+list.map(function(m,i){return 'm'+(i+1)+' · '+(SPORT_FR[m.sport]||m.sport)+(m.league?' ('+m.league+')':'')+' · '+
  new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(m.kickoff))+' · '+m.home+' – '+m.away+' · pari envisagé : '+m.pick;}).join('\n');}
// Dernier objet JSON {"matches":[…]} du texte de réponse.
function parse(text,list){var s=String(text||''),i=s.lastIndexOf('{"matches"');if(i<0)i=s.indexOf('{');var j=s.lastIndexOf('}');if(i<0||j<i)return null;
 var data;try{data=JSON.parse(s.slice(i,j+1));}catch(e){return null;}if(!data||!Array.isArray(data.matches))return null;
 var out={};data.matches.forEach(function(r){var n=Number(String(r&&r.id||'').replace(/\D/g,''))-1,m=list[n];if(!m)return;
  var v=String(r.verdict||'').toLowerCase()==='douteux'?'douteux':'ok';
  out[m.key]={verdict:v,reason:String(r.raison||r.reason||'').slice(0,200),sources:(Array.isArray(r.sources)?r.sources:[]).filter(function(u){return /^https?:\/\//.test(u);}).slice(0,3)};});
 return out;}
return {rules:RULES,paris:paris,key:key,same:same,excluded:excluded,isExcluded:isExcluded,apply:apply,toCheck:toCheck,system:SYSTEM,prompt:prompt,parse:parse};
});
