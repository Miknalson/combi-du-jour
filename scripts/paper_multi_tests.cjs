// Automatic simulated exposure only: never sends orders, credentials or personal bets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),P=require('../paper-multi-engine'),Safe=require('../safe-multi-engine'),Base=require('../paper-engine');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/paper-tests-v2.json'),statusFile=path.join(root,'data/paper-status-v2.json'),now=Date.now();
const names=['sport-catalog.js','safe-engine.js','paper-engine.js','safe-multi-engine.js','paper-multi-engine.js','scripts/paper_multi_tests.cjs','scripts/update_sports.py'];
function hash(name){return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');}function save(name,data){fs.writeFileSync(name,JSON.stringify(data,null,2)+'\n');}
const hashes=Object.fromEntries(names.map(n=>[n,hash(n)]));
const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schemaVersion:2,manifest:{rules:P.rules,sourceHashes:hashes,startedAt:new Date(now).toISOString()},records:[]};
// Modifications reconnues sans effet sur les tickets (affichage seulement) : le journal continue avec les nouvelles empreintes.
const AMENDMENTS=[{id:'2026-11-23-affichage-sports',files:['sport-catalog.js','scripts/paper_multi_tests.cjs'],reason:'Rugby, football américain et hockey masqués dans l’interface ; règlement des tickets en attente même si le journal est suspendu. Règles et collecte inchangées.'},{id:'2026-11-23-reglement-direct',files:['paper-engine.js','scripts/paper_multi_tests.cjs'],reason:'Tickets réglés dès les scores finaux du jour (un pari perdu suffit pour perdre le ticket). Choix des tickets, cotes et mises inchangés.'}];
function changed(){return names.filter(n=>(old.manifest.sourceHashes||{})[n]!==hashes[n]);}
if(JSON.stringify(old.manifest.rules)===JSON.stringify(P.rules)&&changed().length){const done=old.manifest.amendments||[],a=AMENDMENTS.find(a=>!done.some(d=>d.id===a.id)&&changed().every(n=>a.files.includes(n)));
 if(a){old.manifest.amendments=done.concat([{id:a.id,appliedAt:new Date(now).toISOString(),files:changed(),reason:a.reason}]);old.manifest.sourceHashes=hashes;}}
// Changement de règles voulu (pas une dérive) : Safe foot 1,50–2,00 → 1,70–2,00 le 25/11/2026 pour ne plus doubler le Très sûr.
// Les tickets déjà enregistrés sont gardés (champ version = safe-multi-v2) ; l'ancien manifeste est archivé dans previous.
const MIGRATIONS=[{id:'2026-11-25-safe-foot-1-70',from:'paper-multisport-v2',to:'paper-multisport-v3',reason:'Safe foot relevé à 1,70–2,00 (ticket 50 % mini, sélections 60 % mini) car le Très sûr passe à 1,50–1,70. Algo et Safe des autres sports inchangés.'}];
{const m=MIGRATIONS.find(m=>old.manifest.rules&&old.manifest.rules.version===m.from&&P.rules.version===m.to);
 if(m){const prev=old.manifest;old.manifest={rules:P.rules,sourceHashes:hashes,startedAt:new Date(now).toISOString(),migration:{id:m.id,appliedAt:new Date(now).toISOString(),reason:m.reason},previous:(prev.previous||[]).concat([{rules:prev.rules,sourceHashes:prev.sourceHashes,startedAt:prev.startedAt,amendments:prev.amendments||[],migration:prev.migration||null,endedAt:new Date(now).toISOString()}])};}}
function scoresFor(j){const out=[];for(const day of new Set(j.records.map(r=>r.day))){try{out.push(...JSON.parse(fs.readFileSync(path.join(root,'data/days',day+'.json'),'utf8')).matches);}catch(e){}}return out;}
if(JSON.stringify(old.manifest.rules)!==JSON.stringify(P.rules)||JSON.stringify(old.manifest.sourceHashes)!==JSON.stringify(hashes)){
 // Pas de nouveau ticket, mais les tickets déjà enregistrés sont quand même réglés avec les scores.
 const sc=scoresFor(old);old.records=old.records.map(r=>P.settle(r,sc,Safe.paris(now)));save(file,old);
 save(statusFile,{status:'suspended',updatedAt:new Date(now).toISOString(),message:'Version ou collecte modifiée. Journal v2 conservé et tickets en attente réglés ; aucune nouvelle mise fictive enregistrée.'});process.exit(1);}
const docs=Safe.SPORTS.map(s=>{try{return JSON.parse(fs.readFileSync(path.join(root,'data/sports',s+'.json'),'utf8'));}catch(e){return null;}});
const available=docs.filter(d=>d&&d.status==='ok'&&Safe.SPORTS.includes(d.sport)&&now-Date.parse(d.updatedAt)>=0&&now-Date.parse(d.updatedAt)<=3600000&&(!d.partial||(d.matches||[]).some(m=>Safe.paris(m.kickoff)===Safe.paris(now)&&now-Date.parse(m.asOf)>=0&&now-Date.parse(m.asOf)<=3600000))).map(d=>d.sport);
let journal=P.append(old,P.build(docs.map(d=>d&&available.includes(d.sport)?d:null),now),now,available),scores=[];
for(const day of new Set(journal.records.map(r=>r.day))){try{scores.push(...JSON.parse(fs.readFileSync(path.join(root,'data/days',day+'.json'),'utf8')).matches);}catch(e){}}
journal.records=journal.records.map(r=>P.settle(r,scores,Safe.paris(now)));save(file,journal);
save(statusFile,{status:available.length?'running':'waiting_for_fresh_quotes',updatedAt:new Date(now).toISOString(),availableSports:available,sourceStatus:docs.filter(Boolean).map(d=>({sport:d.sport,status:d.status,partial:!!d.partial,matches:(d.matches||[]).length,femaleMatches:d.femaleMatches||0})),message:'100 € fictifs par Safe, 50 € fictifs par Algo. Un seul premier ticket par catégorie et par jour. Aucun ordre réel ni reprise des mises anciennes.'});
// Close old V1 outcomes only. Never append a ticket to the frozen old cohort.
const v1=path.join(root,'data/paper-tests-v1.json');if(fs.existsSync(v1)){const j=JSON.parse(fs.readFileSync(v1));let archiveScores=[];for(const day of new Set(j.records.map(r=>r.day))){try{archiveScores.push(...JSON.parse(fs.readFileSync(path.join(root,'data/days',day+'.json'),'utf8')).matches);}catch(e){}}j.records=j.records.map(r=>Base.settle(r,archiveScores,Safe.paris(now)));save(v1,j);save(path.join(root,'data/paper-status-v1.json'),{status:'archived',updatedAt:new Date(now).toISOString(),message:'Cohorte v1 conservée. Les nouvelles propositions et mises fictives sont enregistrées dans la version multisport v2.'});}
console.log('Protocole fictif v2 :',journal.records.length,'observations. Exposition Safe 100 €, Algo 50 €. Sources disponibles :',available.join(', ')||'aucune');
