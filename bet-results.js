/* Settlement of saved personal tickets. Does not change prospective selection rules. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BetResults=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function paris(t){return new Date(t).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
function name(s){return String(s||'').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function dates(legs){return Array.from(new Set((legs||[]).map(function(l){return Number.isFinite(Date.parse(l.kickoff))?paris(l.kickoff):/^\d{4}-\d{2}-\d{2}$/.test(l.date||'')?l.date:null;}).filter(Boolean)));}
function findMatch(leg,matches){
 var time=Date.parse(leg.kickoff);if(!Number.isFinite(time))return null;
 var pool=(matches||[]).filter(function(m){return Date.parse(m.kickoff)===time&&(!m.sport||m.sport==='football');});
 var exact=pool.filter(function(m){return m.id===leg.matchId;}),named=pool.filter(function(m){return leg.home&&leg.away&&name(m.home)===name(leg.home)&&name(m.away)===name(leg.away);});
 var candidates=Array.from(new Set(exact.concat(named))),scored=candidates.filter(function(m){return /^\d+\s*-\s*\d+$/.test(String(m.score||''));});
 if(new Set(scored.map(function(m){return m.score.replace(/\s/g,'');})).size>1)return null;
 return scored[0]||exact[0]||named[0]||null;
}
function compare(value){return Math.abs(value)<1e-9?null:value>0;}
function lineValid(value){return Number.isFinite(value)&&Math.abs(value*2-Math.round(value*2))<1e-9;}
function settleCode(code,h,a,leg){
 if(typeof code!=='string')return null;leg=leg||{};
 if(code.includes('&')){var parts=code.split('&').map(function(c){return settleCode(c,h,a,leg);});return parts.includes(false)?false:parts.every(function(x){return x===true;})?true:null;}
 if(code==='1')return h>a;if(code==='2')return a>h;if(code==='X')return h===a;if(code==='1X')return h>=a;if(code==='X2')return a>=h;if(code==='12')return h!==a;
 var exact=/^CS(\d+)-(\d+)$/.exec(code);if(exact)return h===Number(exact[1])&&a===Number(exact[2]);
 var total=/^([OU])(\d+(?:\.\d+)?)$/.exec(code);if(total){var line=Number(total[2]);return lineValid(line)?compare(total[1]==='O'?h+a-line:line-h-a):null;}
 var handicap=/^H([12])([+-]?\d+(?:\.\d+)?)$/.exec(code);if(handicap){var line=Number(handicap[2]);return lineValid(line)?compare(handicap[1]==='1'?h+line-a:a+line-h):null;}
 var p=code.split('|');if(p.length<4)return null;
 var family=leg.marketFamily||({totals:'totals',alternate_totals:'totals',spreads:'spreads',alternate_spreads:'spreads',team_totals:'team_totals',alternate_team_totals:'team_totals'})[p[0]],line=Number.isFinite(leg.marketLine)?leg.marketLine:Number(p[p.length-2]),side=p[p.length-1],participant=leg.marketParticipant||p.slice(1,-2).join('|');
 if(!lineValid(line))return null;
 if(family==='spreads'&&['1','2'].includes(side))return compare(side==='1'?h+line-a:a-line-h);
 var value=family==='totals'?h+a:family==='team_totals'?name(participant)===name(leg.home)?h:name(participant)===name(leg.away)?a:null:null;
 if(value!==null&&['over','under'].includes(side))return compare(side==='over'?value-line:line-value);
 return null;
}
function finalScore(match,now){
 if(!/^\d+\s*-\s*\d+$/.test(String(match.score||''))||!Number.isFinite(Date.parse(match.kickoff))||Date.parse(match.kickoff)>=now)return false;
 if(match.completed===false||match.scoreStatus==='live'||match.scoreScope&&match.scoreScope!=='regulation')return false;
 return match.completed===true||match.scoreStatus==='final'||paris(match.kickoff)<paris(now);
}
function legResult(leg,matches,now){
 now=now===undefined?Date.now():now;
 if(leg.sport&&leg.sport!=='football')return {ok:null,reason:'manual_sport'};
 if(!Number.isFinite(Date.parse(leg.kickoff))||Date.parse(leg.kickoff)>=now)return {ok:null,reason:'not_finished'};
 var match=findMatch(leg,matches);if(!match)return {ok:null,reason:'missing_match'};
 if(!/^\d+\s*-\s*\d+$/.test(String(match.score||'')))return {ok:null,reason:'missing_score'};
 if(match.completed===false||match.scoreStatus==='live'||match.scoreScope&&match.scoreScope!=='regulation')return {ok:null,reason:'not_final'};
 if(match.completed!==true&&match.scoreStatus!=='final'&&paris(match.kickoff)>=paris(now))return {ok:null,reason:'not_final'};
 var scores=match.score.split('-').map(Number),ok=settleCode(leg.code,scores[0],scores[1],leg);
 return {ok:ok,score:match.score,reason:ok===null?'manual_market':null};
}
function betState(bet,matches,now){
 if(['won','lost','void'].includes(bet.manual))return bet.manual;
 if(!Array.isArray(bet.legs)||!bet.legs.length)return 'wait';
 var results=bet.legs.map(function(l){return legResult(l,matches,now);});
 return results.some(function(r){return r.ok===false;})?'lost':results.every(function(r){return r.ok===true;})?'won':'wait';
}
var reasons={manual_sport:'Règlement à renseigner après vérification chez Winamax.',not_finished:'Résultat final attendu.',missing_match:'Rencontre non retrouvée dans les résultats publiés.',missing_score:'Score final pas encore publié.',not_final:'Score final du temps réglementaire non confirmé.',manual_market:'Marché ou remboursement à vérifier chez Winamax.'};
return {dates:dates,finalScore:finalScore,findMatch:findMatch,settleCode:settleCode,legResult:legResult,betState:betState,reasons:reasons};
});
