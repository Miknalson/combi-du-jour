// Ticket « Safe but » fictif : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
const fs=require('node:fs'),path=require('node:path'),B=require('../safe-but-engine'),News=require('../news-filter');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/safe-but-tests.json'),now=Number(process.env.SAFE_BUT_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
function paris(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
let journal=read(file,{schemaVersion:1,manifest:{rules:B.rules,startedAt:new Date(now).toISOString()},records:[]});
const today=paris(now),news=read(path.join(root,'data/news-checks.json'),{days:{}});
// Matchs écartés par le filtre actu (scripts/news_filter.cjs) : retirés des données d'entrée seulement.
const doc=News.apply(read(path.join(root,'data/days',today+'.json'),null),News.excluded((news.days||{})[today]),'football');
const built=B.build(doc,now);journal=B.append(journal,built,now);
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>B.settle(r,scores,today));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built.ticket;
console.log(!built.fresh?'Safe but : cotes du jour trop anciennes ou absentes, rien de nouveau.':t?'Safe but : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'Safe but : aucun ticket dans la fourchette ('+built.candidates+' candidats).');
