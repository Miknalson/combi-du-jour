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

test('Un match écarté disparaît du ticket Safe but, l’algorithme choisit parmi les autres',()=>{
 const mine={bookKey:'winamax_fr',o1:1.9,oX:3.3,o2:3.5,ou:{}},at='2026-11-22T06:50:00Z';
 const doc={updatedAt:at,source:'test',matches:[m('a','Juventus','Venezia',{ou:{'2.5':{o:1.58,u:2.45}},mine}),m('b','Bologna','Udinese',{ou:{'2.5':{o:1.59,u:2.42}},mine})]};
 assert.equal(B.build(doc,now).ticket.legs[0].matchId,'a');
 assert.equal(B.build(N.apply(doc,[doubt],'football'),now).ticket.legs[0].matchId,'b');});

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
 const match=(id,home,away)=>({id,eventId:id,sport:'football',sportKey:'soccer_italy_serie_a',leagueCode:'SA',league:'SA',home,away,kickoff:'2026-11-22T15:00:00Z',asOf:at,bookKey:'winamax_fr',book:'Winamax France',market:'h2h',gender:'unspecified',o1:1.12,oX:9,o2:21,markets:[g(home,away,[1.12,9,21])]});
 fs.writeFileSync(path.join(root,'data/sports/football.json'),JSON.stringify({sport:'football',bookKey:'winamax_fr',status:'ok',updatedAt:at,matches:[match('a','Juventus','Venezia'),match('b','Bologna','Udinese')]}));
 const run=env=>execFileSync('node',[path.join(__dirname,'../scripts/news_filter.cjs')],{env:Object.assign({},process.env,{NEWS_ROOT:root,NEWS_NOW:String(now)},env),encoding:'utf8'});
 assert.match(run({ANTHROPIC_API_KEY:''}),/pas de clé/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/sports/football.json'))).matches.length,2);
 run({ANTHROPIC_API_KEY:'test',NEWS_FAKE_TEXT:'{"matches":[{"id":"m1","verdict":"douteux","raison":"Équipe B annoncée"},{"id":"m2","verdict":"ok","raison":"RAS"}]}'});
 const left=JSON.parse(fs.readFileSync(path.join(root,'data/sports/football.json')));
 // Le faux verdict écarte toujours le 1er match proposé : Juventus, puis le ticket est recalculé avec Bologna, écarté à son tour.
 assert.deepEqual(left.newsExcluded.map(x=>x.home),['Juventus','Bologna']);assert.equal(left.matches.length,0);assert.equal(left.newsExcluded[0].reason,'Équipe B annoncée');
 const store=JSON.parse(fs.readFileSync(path.join(root,'data/news-checks.json'))),day=store.days['2026-11-22'];
 assert.equal(N.excluded(day).length,2);assert.equal(day.calls.length,2);
 assert.match(run({ANTHROPIC_API_KEY:'test',NEWS_FAKE_TEXT:'invalide'}),/^(?!.*vérifié)/s,'rien de nouveau à vérifier : pas d’appel');});
