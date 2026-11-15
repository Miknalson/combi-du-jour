// No network, no credentials, no orders. Input: public quote/score snapshots only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),P=require('../paper-engine'),Safe=require('../safe-engine');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/paper-tests-v1.json'),statusFile=path.join(root,'data/paper-status-v1.json'),now=Date.now();
function hash(name){return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');}
function save(name,value){fs.writeFileSync(name,JSON.stringify(value,null,2)+'\n');}
const hashes={'paper-engine.js':hash('paper-engine.js'),'safe-engine.js':hash('safe-engine.js'),'scripts/paper_tests.cjs':hash('scripts/paper_tests.cjs')};
const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schemaVersion:1,manifest:{rules:P.rules,sourceHashes:hashes,startedAt:new Date(now).toISOString()},records:[]};
if(JSON.stringify(old.manifest.rules)!==JSON.stringify(P.rules)||JSON.stringify(old.manifest.sourceHashes)!==JSON.stringify(hashes)){
 save(statusFile,{status:'suspended',updatedAt:new Date(now).toISOString(),message:'Le moteur ou ses règles ont changé. Le journal v1 est conservé et ne reçoit aucun nouveau ticket. Créer explicitement une autre cohorte avant de reprendre.'});console.error('Protocole suspendu : version différente. Aucun journal réécrit.');process.exit(1);
}
const docs=Safe.SPORTS.map(s=>{try{return JSON.parse(fs.readFileSync(path.join(root,'data/sports',s+'.json'),'utf8'));}catch(e){return null;}});
const available=docs.filter(d=>d&&Safe.SPORTS.includes(d.sport)&&d.status==='ok'&&d.bookKey==='winamax_fr'&&now-Date.parse(d.updatedAt)>=0&&now-Date.parse(d.updatedAt)<=3600000&&(!d.partial||(d.matches||[]).some(m=>Safe.paris(m.kickoff)===Safe.paris(now)&&now-Date.parse(m.asOf)>=0&&now-Date.parse(m.asOf)<=3600000))).map(d=>d.sport);
const input=docs.map(d=>d&&available.includes(d.sport)?d:null),built=P.build(input,now);
let journal=P.append(old,built,now,available),scores=[];for(const day of new Set(journal.records.map(r=>r.day))){try{const d=JSON.parse(fs.readFileSync(path.join(root,'data/days',day+'.json'),'utf8'));scores.push(...d.matches);}catch(e){}}
journal.records=journal.records.map(r=>P.settle(r,scores,Safe.paris(now)));save(file,journal);
save(statusFile,{status:available.length===3?'running':'waiting_for_fresh_quotes',updatedAt:new Date(now).toISOString(),availableSports:available,message:'Protocole fictif. Les résultats manquants restent en attente. Aucun passage automatique en réel.'});
console.log('Nouveau protocole distinct des anciens tests ; mise fixe 1 unité ;',journal.records.length,'observations figées ; sources fraîches :',available.join(', ')||'aucune');
