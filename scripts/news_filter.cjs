// Avant de figer les tickets du jour : l'IA (Claude + recherche web) lit l'actu de dernière minute
// des seuls matchs que les tickets s'apprêtent à prendre, et écarte ceux qui sont douteux.
// L'algorithme ne change pas : les matchs écartés sont retirés des données d'entrée, puis le ticket est recalculé.
// Sans clé ANTHROPIC_API_KEY ou en cas d'erreur, rien n'est écarté et les tickets sont faits comme avant.
const fs=require('node:fs'),path=require('node:path');
const N=require('../news-filter'),T=require('../tres-sur-engine'),P=require('../paper-multi-engine'),B=require('../safe-but-engine'),Safe=require('../safe-multi-engine'),AM=require('../algo-mix-engine');
const root=process.env.NEWS_ROOT||path.resolve(__dirname,'..'),now=Number(process.env.NEWS_NOW)||Date.now(),today=N.paris(now);
const MODEL=process.env.NEWS_MODEL||'claude-opus-5-5';
const storeFile=path.join(root,'data/news-checks.json');
function read(f,fallback){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return fallback;}}
function save(f,d){fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');}

async function ask(list){
  if(process.env.NEWS_FAKE_TEXT)return {verdicts:N.parse(process.env.NEWS_FAKE_TEXT,list),usage:{input:0,output:0,searches:0}}; // tests uniquement
  const Anthropic=require('@anthropic-ai/sdk');const client=new (Anthropic.default||Anthropic)();
  const messages=[{role:'user',content:N.prompt(list,now)}];let text='',usage={input:0,output:0,searches:0};
  for(let turn=0;turn<4;turn++){
    const r=await client.beta.messages.create({model:MODEL,max_tokens:16000,betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
      output_config:{effort:'medium'},system:N.system,
      tools:[{type:'web_search_20260209',name:'web_search',max_uses:N.searches(list.length),user_location:{type:'approximate',country:'FR',timezone:'Europe/Paris'}}],
      messages});
    usage.input+=r.usage.input_tokens||0;usage.output+=r.usage.output_tokens||0;usage.searches+=(r.usage.server_tool_use&&r.usage.server_tool_use.web_search_requests)||0;
    if(r.stop_reason==='refusal')throw new Error('refus du modèle');
    text=r.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    if(r.stop_reason!=='pause_turn')break;
    messages.push({role:'assistant',content:r.content});
  }
  return {verdicts:N.parse(text,list),usage};
}

// Sélections que chaque ticket encore à figer aujourd'hui prendrait avec les données filtrées.
function pendingLegs(sports,dayDoc,list,journals){
  const legs=[],f=s=>N.apply(sports[s],list,s);
  if(!journals.tres.records.some(r=>r.id===T.rules.version+'|'+today+'|football')){const t=T.build(f('football'),now).ticket;if(t)legs.push(...t.legs);}
  const built=P.build(Safe.SPORTS.map(f),now);
  built.slots.forEach(slot=>{const id=P.rules.version+'|'+built.day+'|'+slot.method+'|'+slot.sport;if(slot.ticket&&!journals.v2.records.some(r=>r.id===id))legs.push(...slot.ticket.legs);});
  if(!journals.but.records.some(r=>r.id===B.rules.version+'|'+today+'|football')){const t=B.build(N.apply(dayDoc,list,'football'),now).ticket;if(t)legs.push(...t.legs);}
  if(journals.mix&&!journals.mix.records.some(r=>r.id===AM.rules.version+'|'+today+'|football')){const t=AM.build(N.apply(journals.goals,list,'football'),now).ticket;if(t)legs.push(...t.legs);}
  return legs;
}

(async()=>{
  const store=read(storeFile,{schemaVersion:1,rules:N.rules,days:{}});store.days=store.days||{};
  const day=store.days[today]=store.days[today]||{checks:{},calls:[]};
  const sports=Object.fromEntries(Safe.SPORTS.map(s=>[s,read(path.join(root,'data/sports',s+'.json'),null)]));
  const dayDoc=read(path.join(root,'data/days',today+'.json'),null);
  const journals={tres:read(path.join(root,'data/tres-sur-tests.json'),{records:[]}),v2:read(path.join(root,'data/paper-tests-v2.json'),{records:[]}),but:read(path.join(root,'data/safe-but-tests.json'),{records:[]}),mix:read(path.join(root,'data/algo-mix-tests.json'),{records:[]}),goals:read(path.join(root,'data/sports/football-goals.json'),null)};
  const key=process.env.ANTHROPIC_API_KEY;
  for(let round=0;round<N.rules.maxRounds;round++){
    const list=N.toCheck(pendingLegs(sports,dayDoc,N.excluded(day),journals),day,now);
    if(!list.length){day.status='ok';break;}
    if(!key){day.status='no_key';console.log('Filtre actu : pas de clé ANTHROPIC_API_KEY, aucun match écarté ('+list.length+' à vérifier).');break;}
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
  // Écrire les données filtrées pour Très sûr, Safe et Algo (Safe but filtre data/days lui-même).
  const list=N.excluded(day);
  Safe.SPORTS.forEach(s=>{const doc=sports[s];if(!doc)return;const out=N.apply(doc,list,s);if(out!==doc&&out.newsExcluded)save(path.join(root,'data/sports',s+'.json'),out);});
  Object.keys(store.days).sort().slice(0,-N.rules.keepDays).forEach(d=>delete store.days[d]);
  save(storeFile,store);
  list.forEach(c=>console.log('  écarté : '+c.home+' – '+c.away+' · '+c.reason));
})();
