const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),A=require('../alerts-engine.cjs');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  try {
    page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-11-15T10:00:00Z')});
    const day='2026-11-15',id='paper-v2|'+day+'|algo|football';
    const leg=(home,away,matchId)=>({matchId,sport:'football',home,away,label:'Victoire '+home,code:'1',o:1.8,p:.54,kickoff:day+'T18:00:00Z',asOf:day+'T09:45:00Z',quoteSource:'api',bookKey:'winamax_fr',est:false});
    const record={id,day,mode:'paper',method:'algo',sport:'football',status:'pending',odds:3.24,probability:.2916,simulatedStake:50,createdAt:day+'T09:50:00Z',legs:[leg('Equipe A','Equipe B','a'),leg('Equipe C','Equipe D','c')]};
    const journal={records:[{...record,id:'yesterday',day:'2026-11-14'},record]};
    let missing=false,noPick=false,changed=false;
    const personalHistory={'2026-11-14':{createdAt:'2026-11-14T10:00Z',legs:[],odds:3,prob:.3}};
    await page.addInitScript(history=>{if(!localStorage.getItem('cdj.settings'))localStorage.setItem('cdj.settings',JSON.stringify({strategy:'combo',strategyV:1,oMin:3,oMax:5,minLegs:2,maxLegs:5}));if(!localStorage.getItem('cdj.proposals'))localStorage.setItem('cdj.proposals',JSON.stringify(history));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedTicket=text;}}});},personalHistory);
    await page.route('https://combi.test/**',route=>{
      const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
      if(file==='data/paper-tests-v2.json')return missing?route.fulfill({status:404,body:''}):route.fulfill({json:noPick?{records:[{...record,status:'no_pick',legs:[],odds:null,simulatedStake:0}]}:journal});
      if(file==='data/index.json')return route.fulfill({json:{dates:[day,'2026-11-16']}});
      if(file.startsWith('data/days/'))return route.fulfill({json:{date:path.basename(file,'.json'),matches:record.legs.map(l=>({id:l.matchId,home:l.home,away:l.away,league:'UCL',kickoff:path.basename(file,'.json')+'T18:00:00Z',o1:changed?5:1.8,oX:4,o2:changed?1.8:5,books:10,mine:{book:'Winamax France',bookKey:'winamax_fr',asOf:day+'T09:55:00Z',o1:changed?5:1.8,oX:4,o2:changed?1.8:5}}))}});
      if(file==='data/sports/football.json')return route.fulfill({json:{sport:'football',status:'ok',bookKey:'winamax_fr',matches:[],fixtures:[]}});
      const local=path.join(process.cwd(),file);return fs.existsSync(local)&&fs.statSync(local).isFile()?route.fulfill({path:local}):route.fulfill({status:404,body:''});
    });
    await page.goto('https://combi.test/');await page.evaluate(()=>document.querySelectorAll('details.module-disclosure').forEach(d=>d.open=true));
    const card=page.locator('#ticketArea [data-reference-id]');await card.waitFor({timeout:4000});
    assert.equal(await page.locator('[data-strategy="reference"]').getAttribute('aria-pressed'),'true');
    assert.equal(await card.getAttribute('data-reference-id'),id);
    assert.match(await card.textContent(),/Victoire Equipe A/);
    await card.getByRole('button',{name:'Copier les sélections'}).click();const original=await page.evaluate(()=>window.copiedTicket);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cdj.proposals'))),personalHistory);
    assert.equal(await page.evaluate(()=>localStorage.getItem('cdj.bets')),null);
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Algo overflow '+width);}
    await page.getByRole('button',{name:'Simulation personnelle',exact:true}).click();
    await page.locator('#oMin').fill('4');await page.locator('#oMin').dispatchEvent('change');
    assert.match(await page.locator('#simulationSettings').textContent(),/ne changent ni le ticket Algo/);
    await page.getByRole('button',{name:'Algo du jour · alerte'}).click();
    await card.getByRole('button',{name:'Copier les sélections'}).click();assert.equal(await page.evaluate(()=>window.copiedTicket),original);
    const alertUrl=new URL(A.payload(record,'unused').click);await page.goto('https://combi.test/'+alertUrl.pathname.split('/').pop()+alertUrl.search);
    const notified=page.locator('#alertTicket [data-reference-id]');await notified.waitFor();assert.equal(await notified.getAttribute('data-reference-id'),id);
    await notified.getByRole('button',{name:'Copier les sélections'}).click();assert.equal(await page.evaluate(()=>window.copiedTicket),original);
    await page.getByRole('link',{name:'Retrouver ce ticket dans Algo'}).click();await card.waitFor({timeout:4000});assert.equal(await card.getAttribute('data-reference-id'),id);
    changed=true;await page.reload();await page.evaluate(()=>document.querySelectorAll('details.module-disclosure').forEach(d=>d.open=true));await card.waitFor({timeout:4000});await card.getByRole('button',{name:'Copier les sélections'}).click();assert.equal(await page.evaluate(()=>window.copiedTicket),original,'Changing current quotes must not replace the reference');
    await page.locator('#days [data-date="2026-11-16"]').click();await page.getByRole('heading',{name:'Aucun Algo enregistré pour ce jour'}).waitFor();assert.equal(await page.locator('#ticketArea [data-reference-id]').count(),0);
    await page.goto('https://combi.test/?ticket=unknown');await page.getByText('Cette référence est introuvable',{exact:false}).waitFor();assert.equal(await page.locator('#ticketArea [data-reference-id]').count(),0);
    noPick=true;await page.goto('https://combi.test/');await page.evaluate(()=>document.querySelectorAll('details.module-disclosure').forEach(d=>d.open=true));await page.getByText('Aucun ticket admissible au moment de l’enregistrement.',{exact:false}).waitFor();assert.equal(await page.locator('#ticketArea [data-reference-copy]').count(),0);
    missing=true;await page.reload();await page.evaluate(()=>document.querySelectorAll('details.module-disclosure').forEach(d=>d.open=true));await page.getByRole('heading',{name:'Ticket de référence indisponible'}).waitFor();assert.equal(await page.locator('#ticketArea #playAlgo').count(),0);
    missing=false;noPick=false;await page.clock.setFixedTime(new Date('2026-11-15T20:00:00Z'));await page.goto('https://combi.test/?ticket='+encodeURIComponent(id));await card.waitFor({timeout:4000});assert.match(await card.textContent(),/ce n’est plus une proposition à jouer/);await card.getByRole('button',{name:'Copier les sélections'}).click();assert.equal(await page.evaluate(()=>window.copiedTicket),original);
    assert.deepEqual(errors,[]);console.log('OK : même Algo dans application, alerte et copie ; simulation séparée ; références figées, absence, panne, après début et quatre tailles vérifiés.');
  } catch(error) {console.error('Page errors:',errors,'Ticket:',await page.locator('#ticketArea').textContent().catch(()=>''));throw error;} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
