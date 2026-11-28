// Ticket « Simulation » (simulation personnelle, handicaps, cote 2 à 3) : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
// Passe en dernier : il écarte les matchs déjà pris par les autres tickets du jour (ticket-spread.js).
const fs=require('node:fs'),path=require('node:path'),Spread=require('../ticket-spread'),J=require('../simu-engine'),Safe=require('../safe-multi-engine'),News=require('../news-filter');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/simu-tests.json'),now=Number(process.env.SIMU_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
let journal=read(file,{schemaVersion:1,manifest:{rules:J.rules,startedAt:new Date(now).toISOString()},records:[]});
const today=Safe.paris(now),news=read(path.join(root,'data/news-checks.json'),{days:{}}),ex=News.excluded((news.days||{})[today]),used=Spread.usedToday(root,today);
const fresh=d=>d&&d.status==='ok'&&now-Date.parse(d.updatedAt)>=0&&now-Date.parse(d.updatedAt)<=3600000;
// Matchs écartés par le filtre actu, puis matchs déjà pris par un ticket du jour : retirés des données d'entrée seulement.
const docs=['football.json','football-goals.json'].map(f=>read(path.join(root,'data/sports',f),null)).filter(fresh).map(d=>Spread.apply(News.apply(d,ex,'football'),used));
let built=null;
if(docs.length){built=J.build(docs,now);journal=J.append(journal,built,now);}
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>J.settle(r,scores,today));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built&&built.ticket;
console.log(!docs.length?'Simulation : pas de cotes Winamax football de moins d’une heure, rien de nouveau.':t?'Simulation : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'Simulation : aucun ticket dans la fourchette ('+(built?built.candidates:0)+' candidates).');
