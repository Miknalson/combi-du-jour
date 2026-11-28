// Ticket « BTTS Oui » fictif : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
const fs=require('node:fs'),path=require('node:path'),Spread=require('../ticket-spread'),B=require('../safe-but-engine'),News=require('../news-filter');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/safe-but-tests.json'),now=Number(process.env.SAFE_BUT_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
let journal=read(file,{schemaVersion:1,manifest:{rules:B.rules,startedAt:new Date(now).toISOString()},records:[]});
// Changement de règles : nouveaux tickets BTTS, anciens tickets conservés : on garde l'ancienne version dans l'historique du journal.
if(journal.manifest&&journal.manifest.rules&&journal.manifest.rules.version!==B.rules.version){journal.manifest.history=(journal.manifest.history||[]).concat([{rules:journal.manifest.rules,until:new Date(now).toISOString()}]);journal.manifest.rules=B.rules;}
const today=paris(now),news=read(path.join(root,'data/news-checks.json'),{days:{}});
// Matchs écartés par le filtre actu (scripts/news_filter.cjs) : retirés des données d'entrée seulement.
// Puis les matchs déjà pris par un ticket du jour : un favori raté ne fait plus tout perdre.
const used=Spread.usedToday(root,today),excluded=News.excluded((news.days||{})[today]);
const docs=['football-goals.json','football.json'].map(f=>Spread.apply(News.apply(read(path.join(root,'data/sports',f),null),excluded,'football'),used));
const built=B.build(docs,now);journal=B.append(journal,built,now);
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>B.settle(r,scores,today));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built.ticket;
console.log(!built.fresh?'BTTS Oui : cotes du jour trop anciennes ou absentes, rien de nouveau.':t?'BTTS Oui : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'BTTS Oui : aucun ticket dans la fourchette ('+built.candidates+' candidats).');

