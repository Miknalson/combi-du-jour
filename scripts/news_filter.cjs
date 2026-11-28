// Avant de figer les tickets du jour : l'IA (OpenAI + recherche web) lit l'actu de dernière minute
// des seuls matchs que les tickets s'apprêtent à prendre, et écarte ceux qui sont douteux.
// L'algorithme ne change pas : les matchs écartés sont retirés des données d'entrée, puis le ticket est recalculé.
// Sans clé OPENAI_API_KEY ou en cas d'erreur, rien n'est écarté et les tickets sont faits comme avant.
const fs=require('node:fs'),path=require('node:path');
const N=require('../news-filter'),T=require('../tres-sur-engine'),P=require('../paper-multi-engine'),B=require('../safe-but-engine'),Safe=require('../safe-multi-engine'),AM=require('../algo-mix-engine'),C=require('../combi23-engine'),J=require('../reel-engine'),TB=require('../tres-sur-bas-engine'),Spread=require('../ticket-spread');
const root=process.env.NEWS_ROOT||path.resolve(__dirname,'..'),now=Number(process.env.NEWS_NOW)||Date.now(),today=N.paris(now);
const storeFile=path.join(root,'data/news-checks.json');
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
let goals=null;
function save(f,d){fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');}

// Modèles essayés dans l'ordre : si OpenAI ne connaît pas l'un d'eux, on passe au suivant.
const MODELS=[...new Set([process.env.NEWS_MODEL,'gpt-5.5','gpt-5.1','gpt-5'].filter(Boolean))];
let MODEL=MODELS[0];

async function callOpenAI(body){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(7*60*1000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error('OpenAI '+r.status+' : '+((j.error&&j.error.message)||'erreur'));e.code=j.error&&j.error.code;e.status=r.status;throw e;}
  return j;
}

async function ask(list){
  if(process.env.NEWS_FAKE_TEXT)return {verdicts:N.parse(process.env.NEWS_FAKE_TEXT,list),usage:{input:0,output:0,searches:0}}; // tests uniquement
  const body={instructions:N.system,input:N.prompt(list,now),max_output_tokens:16000,reasoning:{effort:'medium'},
    max_tool_calls:N.searches(list.length),
    tools:[{type:'web_search',user_location:{type:'approximate',country:'FR',timezone:'Europe/Paris'}}]};
  let r,lastErr;
  for(const m of MODELS){
    try{r=await callOpenAI(Object.assign({model:m},body));MODEL=m;break;}
    catch(e){lastErr=e;if(e.code==='model_not_found'||e.status===404||/model/i.test(e.message)&&e.status===400)continue;throw e;}
  }
  if(!r)throw lastErr;
  const out=r.output||[],parts=out.filter(o=>o.type==='message').flatMap(o=>o.content||[]);
  if(parts.some(c=>c.type==='refusal')&&!parts.some(c=>c.type==='output_text'))throw new Error('refus du modèle');
  const text=parts.filter(c=>c.type==='output_text').map(c=>c.text).join('');
  const usage={input:(r.usage&&r.usage.input_tokens)||0,output:(r.usage&&r.usage.output_tokens)||0,searches:out.filter(o=>o.type==='web_search_call').length};
  return {verdicts:N.parse(text,list),usage};
}

// Sélections que chaque ticket encore à figer aujourd'hui prendrait avec les données filtrées.
// Même enchaînement que le workflow (ticket-spread.js) : chaque ticket écarte les matchs déjà pris par les précédents.
function pendingLegs(sports,dayDoc,list,journals){
  const legs=[],f=s=>N.apply(sports[s],list,s);
  let used=Spread.legsOf([].concat(...Object.values(journals).map(j=>j&&j.records||[])),today);
  const take=t=>{if(t){legs.push(...t.legs);used=used.concat(Spread.ticketLegs(t));}};
  const foot=d=>Spread.apply(d,used);
  if(!journals.jour.records.some(r=>r.day===today&&r.method==='reel'))take(J.build([foot(f('football')),foot(N.apply(goals,list,'football'))],now).ticket);
  if(!journals.tres.records.some(r=>r.id===T.rules.version+'|'+today+'|football'))take(T.build(foot(f('football')),now).ticket);
  if(!journals.bas.records.some(r=>r.day===today&&r.method==='tres_sur_bas'))take(TB.build(foot(f('football')),now).ticket);
  const built=P.build(Safe.SPORTS.map(f),now,used);
  built.slots.forEach(slot=>{const id=P.rules.version+'|'+built.day+'|'+slot.method+'|'+slot.sport;if(slot.ticket&&!journals.v2.records.some(r=>r.id===id))take(slot.ticket);});
  if(!journals.c23.records.some(r=>r.id===C.rules.version+'|'+today+'|football'))take(C.build(foot(f('football')),now).ticket);
  if(journals.mix&&!journals.mix.records.some(r=>r.id===AM.rules.version+'|'+today+'|football'))take(AM.build(foot(N.apply(goals,list,'football')),now).ticket);
  if(!journals.but.records.some(r=>r.id===B.rules.version+'|'+today+'|football'))take(B.build([foot(N.apply(goals,list,'football')),foot(f('football'))],now).ticket);
  return legs;
}

(async()=>{
  const store=read(storeFile,{schemaVersion:1,rules:N.rules,days:{}});store.days=store.days||{};
  const day=store.days[today]=store.days[today]||{checks:{},calls:[]};
  const sports=Object.fromEntries(Safe.SPORTS.map(s=>[s,read(path.join(root,'data/sports',s+'.json'),null)]));
  const dayDoc=read(path.join(root,'data/days',today+'.json'),null);
  const journals={tres:read(path.join(root,'data/tres-sur-tests.json'),{records:[]}),v2:read(path.join(root,'data/paper-tests-v2.json'),{records:[]}),but:read(path.join(root,'data/safe-but-tests.json'),{records:[]}),mix:read(path.join(root,'data/algo-mix-tests.json'),{records:[]}),c23:read(path.join(root,'data/combi23-tests.json'),{records:[]}),jour:read(path.join(root,'data/reel-tests.json'),{records:[]}),bas:read(path.join(root,'data/tres-sur-bas-tests.json'),{records:[]})};
  goals=read(path.join(root,'data/sports/football-goals.json'),null);
  const key=process.env.OPENAI_API_KEY;
  for(let round=0;round<N.rules.maxRounds;round++){
    const list=N.toCheck(pendingLegs(sports,dayDoc,N.excluded(day),journals),day,now);
    if(!list.length){day.status='ok';break;}
    if(!key){day.status='no_key';console.log('Filtre actu : pas de clé OPENAI_API_KEY, aucun match écarté ('+list.length+' à vérifier).');break;}
    let res;
    try{res=await ask(list);}catch(e){day.status='error';day.error=String(e&&e.message||e).slice(0,200);console.log('Filtre actu : erreur, aucun match écarté.',day.error);break;}
    day.calls.push(Object.assign({at:new Date(now).toISOString(),model:MODEL,matches:list.length},res.usage));
    if(!res.verdicts){day.status='error';day.error='réponse illisible';console.log('Filtre actu : réponse illisible, aucun match écarté.');break;}
    let bad=0;
    let unsure=0;
    list.forEach(m=>{const v=res.verdicts[m.key];if(!v)return;const old=day.checks[m.key],tries=(old&&old.verdict==='non_verifie'?old.tries||1:0)+1;
      day.checks[m.key]=Object.assign({sport:m.sport,league:m.league,home:m.home,away:m.away,kickoff:m.kickoff,pick:m.pick,checkedAt:new Date(now).toISOString(),tries},v);
      if(v.verdict==='douteux')bad++;else if(v.verdict==='non_verifie'){unsure++;if(N.final(day.checks[m.key]))bad++;}});
    console.log('Filtre actu : '+list.length+' match(s) vérifié(s), '+bad+' écarté(s), '+unsure+' non vérifié(s).');
    day.status='ok';if(!bad&&!unsure)break;
  }
  day.updatedAt=new Date(now).toISOString();
  // Écrire les données filtrées pour Très sûr, Safe et Algo (BTTS filtre les relevés football lui-même).
  const list=N.excluded(day);
  Safe.SPORTS.forEach(s=>{const doc=sports[s];if(!doc)return;const out=N.apply(doc,list,s);if(out!==doc&&out.newsExcluded)save(path.join(root,'data/sports',s+'.json'),out);});
  Object.keys(store.days).sort().slice(0,-N.rules.keepDays).forEach(d=>delete store.days[d]);
  save(storeFile,store);
  list.forEach(c=>console.log('  écarté : '+c.home+' – '+c.away+' · '+c.reason));
})();

