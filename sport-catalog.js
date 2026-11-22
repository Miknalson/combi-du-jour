(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SportCatalog=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var sports={football:{label:'Football',unit:'goals',draw:true},basket:{label:'Basket',unit:'points'},tennis:{label:'Tennis',unit:'games'},rugby_xv:{label:'Rugby à XV',unit:'points',draw:true},rugby_xiii:{label:'Rugby à XIII',unit:'points',draw:true},football_us:{label:'Football américain',unit:'points'},hockey:{label:'Hockey sur glace',unit:'goals'},volley:{label:'Volley',unit:'unknown'}};
function female(key,title){return /women|feminin|féminin|wnba|wncaab|ncaaw|wta|wsl|pwhl|nwsl|wleague|damallsvenskan|frauen/i.test(key+' '+title);}
function classify(key){if(key.startsWith('soccer_'))return 'football';if(key.startsWith('basketball_'))return 'basket';if(key.startsWith('tennis_'))return 'tennis';if(/^(rugbyunion|rugby_union)_/.test(key))return 'rugby_xv';if(/^(rugbyleague|rugby_league)_/.test(key))return 'rugby_xiii';if(key.startsWith('americanfootball_'))return 'football_us';if(/^(icehockey|ice_hockey)_/.test(key))return 'hockey';if(key.startsWith('volleyball_'))return 'volley';return null;}
// Sports masqués dans l'interface à la demande de Nano (22/11/2026). Les collecteurs et moteurs restent inchangés.
var hidden=['rugby_xv','rugby_xiii','football_us','hockey'],shown=Object.keys(sports).filter(function(k){return hidden.indexOf(k)<0;});
function isShown(k){return shown.indexOf(k)>=0;}
return {sports:sports,keys:Object.keys(sports),shown:shown,isShown:isShown,female:female,classify:classify};
});
if(typeof document!=='undefined'&&typeof SportCatalog!=='undefined'){
 document.querySelectorAll('.sport-tabs').forEach(function(nav){var page=location.pathname.split('/').pop(),selected=new URLSearchParams(location.search).get('sport')||'basket';nav.innerHTML=SportCatalog.shown.map(function(key){var a=document.createElement('a');a.href=key==='football'?'./':'sports.html?sport='+key;a.textContent=SportCatalog.sports[key].label;a.dataset.sport=key;if(key==='football'&&(!page||page==='index.html')||page==='sports.html'&&key===selected)a.setAttribute('aria-current','page');return a.outerHTML;}).join('')+'<a href="safe.html"'+(page==='safe.html'?' aria-current="page"':'')+'>Safe du jour</a>';});
}
