/* Tickets du jour sans match en commun (demandé par Nano le 28/11/2026).
   Avant : chaque ticket choisissait seul « la combinaison la plus probable » dans les mêmes cotes Winamax,
   donc tous reprenaient les mêmes gros favoris. Un seul favori raté faisait perdre tous les tickets du jour
   (Bayern le 25/11 : 4 tickets ; Ferencváros le 26/11 : 3 ; Groningen le 27/11 : 3).
   Maintenant un match déjà pris par un ticket du jour est retiré des données des tickets suivants.
   Ordre de priorité = ordre des étapes du workflow : Réel (1,50–3, depuis le 28/11), Très sûr, Très sûr 1,20, Safe, Algo, Combiné 2 à 3, Algo buts, Safe but, Simulation (28/11).
   Les cotes, les probabilités et les règles de chaque ticket ne changent pas. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TicketSpread=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var JOURNALS=['reel-tests.json','tres-sur-tests.json','tres-sur-bas-tests.json','paper-tests-v2.json','combi23-tests.json','algo-mix-tests.json','safe-but-tests.json','simu-tests.json'];
function k(s){return String(s||'').trim().toLowerCase();}
function football(l){return l&&(!l.sport||l.sport==='football');}
// Sélections football des tickets (enregistrés ou calculés) d'un jour.
function legsOf(records,day){var out=[];(records||[]).forEach(function(r){if(r&&(!day||r.day===day)&&Array.isArray(r.legs))r.legs.forEach(function(l){if(football(l))out.push(l);});});return out;}
function ticketLegs(t){return t&&Array.isArray(t.legs)?t.legs.filter(football):[];}
function taken(m,legs){var ids={},teams={};legs.forEach(function(l){ids[l.matchId]=1;teams[k(l.home)]=1;teams[k(l.away)]=1;});
 return !!(ids[m.id]||teams[k(m.home)]||teams[k(m.away)]);}
// Retire d'un document football les matchs déjà pris (même id ou même équipe le même jour).
function apply(doc,legs){if(!doc||!Array.isArray(doc.matches)||!(legs||[]).length||doc.sport&&doc.sport!=='football')return doc;
 var removed=[],matches=doc.matches.filter(function(m){if(m&&(!m.sport||m.sport==='football')&&taken(m,legs)){removed.push(m.id);return false;}return true;});
 if(!removed.length)return doc;return Object.assign({},doc,{matches:matches,spreadExcluded:(doc.spreadExcluded||[]).concat(removed)});}
// Lecture des journaux (Node seulement) : toutes les sélections football déjà enregistrées pour ce jour.
function usedToday(rootDir,day){var fs=require('node:fs'),path=require('node:path'),out=[];
 JOURNALS.forEach(function(f){try{out=out.concat(legsOf(JSON.parse(fs.readFileSync(path.join(rootDir,'data',f),'utf8')).records,day));}catch(e){}});return out;}
return {journals:JOURNALS.slice(),legsOf:legsOf,ticketLegs:ticketLegs,apply:apply,usedToday:usedToday};
});
