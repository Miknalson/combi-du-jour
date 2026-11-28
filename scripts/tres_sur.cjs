// Ticket « Très sûr » fictif : enregistré une fois par jour avant match, puis réglé avec les scores de l'appli.
const fs=require('node:fs'),path=require('node:path'),Spread=require('../ticket-spread'),T=require('../tres-sur-engine'),Safe=require('../safe-multi-engine');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/tres-sur-tests.json'),now=Number(process.env.TRES_SUR_NOW)||Date.now();
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
let journal=read(file,{schemaVersion:1,manifest:{rules:T.rules,startedAt:new Date(now).toISOString()},records:[]});
// Matchs déjà pris par un autre ticket du jour : retirés (ticket-spread.js). Le Très sûr passe en premier.
const doc=Spread.apply(read(path.join(root,'data/sports/football.json'),null),Spread.usedToday(root,Safe.paris(now)));
const fresh=doc&&doc.status==='ok'&&now-Date.parse(doc.updatedAt)>=0&&now-Date.parse(doc.updatedAt)<=3600000;
let built=null;
if(fresh){built=T.build(doc,now);journal=T.append(journal,built,now);}
const scores=[];for(const day of new Set(journal.records.map(r=>r.day))){scores.push(...(read(path.join(root,'data/days',day+'.json'),{matches:[]}).matches||[]));}
journal.records=journal.records.map(r=>T.settle(r,scores,Safe.paris(now)));
fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
const t=built&&built.ticket;
console.log(!fresh?'Très sûr : pas de cotes Winamax football de moins d’une heure, rien de nouveau.':t?'Très sûr : '+t.legs.map(l=>l.home+' – '+l.away+' : '+l.label+' ('+l.o+')').join(' + ')+' · cote '+t.odds.toFixed(2)+' · '+Math.round(100*t.p)+' %':'Très sûr : aucune sélection dans la fourchette ('+(built?built.candidates:0)+' candidates).');
