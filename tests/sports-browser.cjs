const {chromium}=require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
for(const width of [320,390,768,1280]){const p=await b.newPage({viewport:{width,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const sport of ['basket','tennis']){
const now=Date.now();const m={id:'a',sport,league:'Compétition de test',kickoff:new Date(now+86400000).toISOString(),home:'Equipe <test>',away:'Adversaire',market:'h2h',bookKey:'winamax_fr',asOf:new Date(now-300000).toISOString(),o1:1.8,o2:2.1};
await p.route('**/data/sports/*.json',r=>r.fulfill({json:{sport,bookKey:'winamax_fr',status:'ok',matches:[m,{...m,id:'old',asOf:new Date(now-25*3600000).toISOString()},{...m,id:'other',bookKey:'pinnacle'},{...m,id:'started',kickoff:new Date(now-1).toISOString()}]}}));
await p.goto('http://127.0.0.1:8001/sports.html?sport='+sport);await p.waitForSelector('.sport-match');if(await p.locator('.sport-match').count()!==1)throw Error('Source/time filter failed');if(await p.locator('.sport-match h3').textContent()!=='Equipe <test> – Adversaire')throw Error('Escaping failed');await p.locator('#sportLeague').selectOption('Compétition de test');if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width);if(width===390)await p.screenshot({path:'/tmp/combi-'+sport+'.png',fullPage:true});
await p.unroute('**/data/sports/*.json');await p.route('**/data/sports/*.json',r=>r.fulfill({json:{sport,bookKey:'winamax_fr',status:'ok',matches:[{...m,asOf:new Date(now-2*3600000).toISOString()}]}}));await p.reload();await p.waitForSelector('.sport-match');if(!await p.locator('.sport-match').textContent().then(t=>t.includes('Ancienne cote')))throw Error('Old odds unlabelled');
await p.unroute('**/data/sports/*.json');await p.route('**/data/sports/*.json',r=>r.fulfill({status:404,body:'missing'}));await p.reload();await p.waitForFunction(()=>document.querySelector('#sportStatus').textContent==='Source indisponible');if(await p.locator('.sport-match').count())throw Error('Fake fallback');await p.unroute('**/data/sports/*.json');
}
if(errors.length)throw Error(errors.join('\n'));await p.close();console.log('Sports OK',width);}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
