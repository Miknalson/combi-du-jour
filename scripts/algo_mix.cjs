// Ticket « Algo » mélangé fictif (victoires + buts + les deux marquent) : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
const fs=require('node:fs'),path=require('node:path'),A=require('../algo-mix-engine'),Safe=require('../safe-multi-engine'),News=require('../news-filter');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/algo-mix-tests.json'),now=Number(process.env.ALGO_MIX_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
let journal=read(file,{schemaVersion:1,manifest:{rules:A.rules,startedAt:new Date(now).toISOString()},records:[]});
const today=Safe.paris(now),news=read(path.join(root,'data/news-checks.json'),{days:{}});
// Matchs écartés par le filtre actu : retirés des données d'entrée seulement, comme pour les autres tickets.
const doc=News.apply(read(path.join(root,'data/sports/football-goals.json'),null),News.excluded((news.days||{})[today]),'football');
const fresh=doc&&doc.status==='ok'&&now-Date.parse(doc.updatedAt)>=0&&now-Date.parse(doc.updatedAt)<=3600000;
let built=null;
if(fresh){built=A.build(doc,now);journal=A.append(journal,built,now);}
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>A.settle(r,scores,today));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built&&built.ticket;
console.log(!fresh?'Algo (buts) : pas de cotes Winamax buts de moins d’une heure, rien de nouveau.':t?'Algo (buts) : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'Algo (buts) : aucun ticket dans la fourchette ('+(built?built.candidates:0)+' candidates).');
