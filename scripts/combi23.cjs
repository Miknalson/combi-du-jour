// Ticket « Combiné 2 à 3 » fictif : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
const fs=require('node:fs'),path=require('node:path'),C=require('../combi23-engine'),Safe=require('../safe-multi-engine'),News=require('../news-filter');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/combi23-tests.json'),now=Number(process.env.COMBI23_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
let journal=read(file,{schemaVersion:1,manifest:{rules:C.rules,startedAt:new Date(now).toISOString()},records:[]});
const today=Safe.paris(now),news=read(path.join(root,'data/news-checks.json'),{days:{}});
// Matchs écartés par le filtre actu : retirés des données d'entrée seulement, comme pour le Safe but.
const doc=News.apply(read(path.join(root,'data/sports/football.json'),null),News.excluded((news.days||{})[today]),'football');
const fresh=doc&&doc.status==='ok'&&now-Date.parse(doc.updatedAt)>=0&&now-Date.parse(doc.updatedAt)<=3600000;
let built=null;
if(fresh){built=C.build(doc,now);journal=C.append(journal,built,now);}
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>C.settle(r,scores,today));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built&&built.ticket;
console.log(!fresh?'Combiné 2 à 3 : pas de cotes Winamax football de moins d’une heure, rien de nouveau.':t?'Combiné 2 à 3 : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'Combiné 2 à 3 : aucun ticket dans la fourchette ('+(built?built.candidates:0)+' candidates).');
