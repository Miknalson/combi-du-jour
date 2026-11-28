const test=require('node:test'),assert=require('node:assert/strict'),N=require('../news-filter'),B=require('../safe-but-engine');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const now=Date.parse('2026-11-22T07:00:00Z');
function m(id,home,away,extra){return Object.assign({id,league:'SA',home,away,kickoff:'2026-11-22T15:00:00Z'},extra||{});}
const doubt={sport:'football',home:'Juventus',away:'Venezia',kickoff:'2026-11-22T11:30:00Z',verdict:'douteux',reason:'Vlahović blessé'};

test('Même match reconnu malgré accents, casse et heure différente le même jour',()=>{
 assert.ok(N.same({home:'Juventus',away:'Venezia',kickoff:'2026-11-22T15:00:00Z'},doubt));
 assert.ok(N.same({home:'JUVENTUS FC',away:'Venézia',kickoff:'2026-11-22T11:30:00Z'},Object.assign({},doubt,{home:'juventus fc'})));
 assert.ok(!N.same({home:'Juventus',away:'Venezia',kickoff:'2026-11-23T15:00:00Z'},doubt),'autre jour');
 assert.ok(!N.same({sport:'basket',home:'Juventus',away:'Venezia',kickoff:doubt.kickoff},doubt),'autre sport');});

test('Retire seulement les matchs douteux, sans toucher au document d’origine',()=>{
 const doc={sport:'football',matches:[m('a','Juventus','Venezia'),m('b','Bologna','Udinese')]};
 const out=N.apply(doc,[doubt],'football');
 assert.deepEqual(out.matches.map(x=>x.id),['b']);assert.equal(doc.matches.length,2);
 assert.equal(out.newsExcluded[0].reason,'Vlahović blessé');
 assert.equal(N.apply(doc,[],'football'),doc,'rien à écarter : document inchangé');});

test('Un match écarté disparaît du combiné BTTS et deux autres matchs restent nécessaires',()=>{
 const at='2026-11-22T06:50:00Z';
 const match=(id,home,away)=>m(id,home,away,{sport:'football',bookKey:'winamax_fr',asOf:at,markets:[{id:'btts',family:'btts',bookKey:'winamax_fr',asOf:at,outcomes:[{side:'yes',code:'BTTS_Y',odds:1.3},{side:'no',code:'BTTS_N',odds:3.2}]}]});
 const doc={status:'ok',bookKey:'winamax_fr',updatedAt:at,matches:[match('a','Juventus','Venezia'),match('b','Bologna','Udinese'),match('c','Roma','Lazio')]};
 assert.ok(B.build(doc,now).ticket.legs.some(l=>l.matchId==='a'));
 const filtered=N.apply(doc,[doubt],'football'),t=B.build(filtered,now).ticket;
 assert.deepEqual(t.legs.map(l=>l.matchId).sort(),['b','c']);
 assert.equal(B.build({...filtered,matches:filtered.matches.slice(0,1)},now).ticket,null);
});

test('Vérifie chaque rencontre une seule fois, jamais un match commencé',()=>{
 const legs=[m('a','Juventus','Venezia',{label:'Victoire Juventus'}),m('a','Juventus','Venezia',{label:'Plus de 1,5 buts'}),m('c','Roma','Lazio',{kickoff:'2026-11-22T06:00:00Z'})];
 const list=N.toCheck(legs,{checks:{}},now);assert.equal(list.length,1);assert.equal(list[0].pick,'Victoire Juventus');
 assert.equal(N.toCheck(legs,{checks:{[list[0].key]:{verdict:'ok'}}},now).length,0,'déjà vérifié');});

test('Lit le JSON final de la réponse et ignore le texte autour',()=>{
 const list=[{key:'k1'},{key:'k2'}];
 const v=N.parse('Recherche faite.\n{"matches":[{"id":"m1","verdict":"douteux","raison":"Gardien suspendu","sources":["https://a.fr","javascript:x"]},{"id":"m2","verdict":"OK","raison":"RAS"}]}',list);
 assert.equal(v.k1.verdict,'douteux');assert.deepEqual(v.k1.sources,['https://a.fr']);assert.equal(v.k2.verdict,'ok');
 assert.equal(N.parse('pas de json',list),null);});

test('Script : sans clé rien n’est écarté ; avec un verdict douteux le match sort des cotes du jour',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'news-'));fs.mkdirSync(path.join(root,'data/sports'),{recursive:true});fs.mkdirSync(path.join(root,'data/days'));
 const at='2026-11-22T06:55:00Z',g=(home,away,odds)=>({id:'h2h||None',family:'h2h',key:'h2h',unit:'match',line:null,participant:'',bookKey:'winamax_fr',asOf:at,outcomes:[{code:'1',side:'1',label:'Victoire '+home,odds:odds[0],participant:''},{code:'2',side:'2',label:'Victoire '+away,odds:odds[2],participant:''},{code:'X',side:'X',label:'Match nul',odds:odds[1],participant:''}]});
 const match=(id,home,away)=>({id,eventId:id,sport:'football',sportKey:'soccer_italy_serie_a',leagueCode:'SA',league:'SA',home,away,kickoff:'2026-11-22T15:00:00Z',asOf:at,bookKey:'winamax_fr',book:'Winamax France',market:'h2h',gender:'unspecified',o1:1.52,oX:4.2,o2:6,markets:[g(home,away,[1.52,4.2,6])]});
 fs.writeFileSync(path.join(root,'data/sports/football.json'),JSON.stringify({sport:'football',bookKey:'winamax_fr',status:'ok',updatedAt:at,matches:[match('a','Juventus','Venezia'),match('b','Bologna','Udinese')]}));
 const run=env=>execFileSync('node',[path.join(__dirname,'../scripts/news_filter.cjs')],{env:Object.assign({},process.env,{NEWS_ROOT:root,NEWS_NOW:String(now)},env),encoding:'utf8'});
 assert.match(run({OPENAI_API_KEY:''}),/pas de clé/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/sports/football.json'))).matches.length,2);
 run({OPENAI_API_KEY:'test',NEWS_FAKE_TEXT:'{"matches":[{"id":"m1","verdict":"douteux","raison":"Équipe B annoncée"},{"id":"m2","verdict":"ok","raison":"RAS"}]}'});
 const left=JSON.parse(fs.readFileSync(path.join(root,'data/sports/football.json')));
 // Tickets sans match commun (ticket-spread.js) : les deux matchs sont proposés dès le 1er appel ; le faux verdict écarte le 1er (Juventus), Bologna est ok.
 assert.deepEqual(left.newsExcluded.map(x=>x.home),['Juventus']);assert.equal(left.matches.length,1);assert.equal(left.newsExcluded[0].reason,'Équipe B annoncée');
 const store=JSON.parse(fs.readFileSync(path.join(root,'data/news-checks.json'))),day=store.days['2026-11-22'];
 assert.equal(N.excluded(day).length,1);assert.equal(day.calls.length,1);assert.equal(day.calls[0].matches,2);
 assert.match(run({OPENAI_API_KEY:'test',NEWS_FAKE_TEXT:'invalide'}),/^(?!.*vérifié)/s,'rien de nouveau à vérifier : pas d’appel');});

test('« Non vérifié » n’est jamais un ok : revérifié une fois, puis écarté par prudence (cas Lille – Bayern du 25/11)',()=>{
 const list=[{key:'k1'},{key:'k2'},{key:'k3'}];
 const v=N.parse('{"matches":[{"id":"m1","verdict":"ok","raison":"Non vérifié (limite de recherche atteinte) : aucune info concrète trouvée."},{"id":"m2","verdict":"non_verifie","raison":"Rien trouvé"},{"id":"m3","verdict":"douteux","absents":["Musiala (blessé)","Kimmich (suspendu)","Neuer (incertain)"],"raison":"3 titulaires absents"}]}',list);
 assert.equal(v.k1.verdict,'non_verifie');assert.equal(v.k2.verdict,'non_verifie');assert.equal(v.k3.absents.length,3);
 const legs=[m('a','Juventus','Venezia',{label:'Victoire Juventus'})],k=N.key(Object.assign({sport:'football'},legs[0]));
 const once={checks:{[k]:Object.assign({},doubt,{verdict:'non_verifie',tries:1})}},twice={checks:{[k]:Object.assign({},doubt,{verdict:'non_verifie',tries:2})}};
 assert.equal(N.toCheck(legs,once,now).length,1,'revérifié');assert.equal(N.excluded(once).length,0,'pas encore écarté');
 assert.equal(N.toCheck(legs,twice,now).length,0);assert.equal(N.excluded(twice).length,1,'écarté après 2 essais');
 assert.equal(N.searches(4),14);assert.equal(N.searches(10),20);});

test('Script : un match resté non vérifié après 2 essais sort des cotes du jour',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'news-'));fs.mkdirSync(path.join(root,'data/sports'),{recursive:true});fs.mkdirSync(path.join(root,'data/days'));
 const at='2026-11-22T06:55:00Z',g=(home,away,odds)=>({id:'h2h||None',family:'h2h',key:'h2h',unit:'match',line:null,participant:'',bookKey:'winamax_fr',asOf:at,outcomes:[{code:'1',side:'1',label:'Victoire '+home,odds:odds[0],participant:''},{code:'2',side:'2',label:'Victoire '+away,odds:odds[2],participant:''},{code:'X',side:'X',label:'Match nul',odds:odds[1],participant:''}]});
 const match=(id,home,away)=>({id,eventId:id,sport:'football',sportKey:'soccer_italy_serie_a',leagueCode:'SA',league:'SA',home,away,kickoff:'2026-11-22T15:00:00Z',asOf:at,bookKey:'winamax_fr',book:'Winamax France',market:'h2h',gender:'unspecified',o1:1.52,oX:4.2,o2:6,markets:[g(home,away,[1.52,4.2,6])]});
 fs.writeFileSync(path.join(root,'data/sports/football.json'),JSON.stringify({sport:'football',bookKey:'winamax_fr',status:'ok',updatedAt:at,matches:[match('a','Juventus','Venezia'),match('b','Bologna','Udinese')]}));
 const out=execFileSync('node',[path.join(__dirname,'../scripts/news_filter.cjs')],{env:Object.assign({},process.env,{NEWS_ROOT:root,NEWS_NOW:String(now),OPENAI_API_KEY:'test',NEWS_FAKE_TEXT:'{"matches":[{"id":"m1","verdict":"non_verifie","raison":"Aucune source sur les absents"}]}'}),encoding:'utf8'});
 assert.match(out,/non vérifié/);
 const day=JSON.parse(fs.readFileSync(path.join(root,'data/news-checks.json'))).days['2026-11-22'],juve=Object.values(day.checks).find(c=>c.home==='Juventus');
 assert.equal(juve.verdict,'non_verifie');assert.equal(juve.tries,2);
 assert.ok(JSON.parse(fs.readFileSync(path.join(root,'data/sports/football.json'))).newsExcluded.some(x=>x.home==='Juventus'));});

