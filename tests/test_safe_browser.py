"""Run directly with Python + Playwright; all fixture prices stay inside this test."""
from pathlib import Path
import datetime as dt
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
NOW='2026-11-01T12:00:00Z'
def fixture(sport):
 outcomes=[dict(code='1',side='1',label='Victoire Home '+sport,odds=1.52),dict(code='2',side='2',label='Victoire Away '+sport,odds=2.5)]
 if sport=='football':outcomes.append(dict(code='X',side='X',label='Match nul',odds=12))
 markets=[dict(id='h2h',family='h2h',asOf=NOW,bookKey='winamax_fr',outcomes=outcomes),dict(id='total',family='totals',line=3.5,asOf=NOW,bookKey='winamax_fr',outcomes=[dict(code='U3.5',side='under',label='Moins de 3,5',odds=1.15),dict(code='O3.5',side='over',label='Plus de 3,5',odds=6)])]
 return dict(sport=sport,bookKey='winamax_fr',status='ok',updatedAt=NOW,matches=[dict(id=sport+'1',sport=sport,home='Home '+sport,away='Away '+sport,league='Test only',bookKey='winamax_fr',asOf=NOW,kickoff='2026-11-01T20:00:00Z',markets=markets)])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844})
 page.clock.install(time=dt.datetime(2026,11,1,12,tzinfo=dt.timezone.utc))
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 data={s:fixture(s) for s in ['football','basket','tennis']}
 def route(r):
  from urllib.parse import urlparse
  path=urlparse(r.request.url).path.lstrip('/')
  if path.startswith('data/sports/'):
   sport=Path(path).stem;r.fulfill(status=200,content_type='application/json',body=json.dumps(data[sport]));return
  if path.startswith('data/days/'):
   r.fulfill(status=200,content_type='application/json',body='{"matches":[]}');return
  f=ROOT/path
  if not f.is_file():r.fulfill(status=404,body='');return
  mime='text/html' if f.suffix=='.html' else 'text/css' if f.suffix=='.css' else 'application/json' if f.suffix=='.json' else 'application/javascript'
  r.fulfill(status=200,content_type=mime,body=f.read_text())
 page.route('https://combi.test/**',route)
 page.goto('https://combi.test/safe.html')
 page.wait_for_selector('[data-slot="mixed"]')
 assert page.locator('[data-slot]').count()==4
 assert '60 %' in page.locator('.safe-intro').inner_text()
 assert '70 %' not in page.locator('.safe-intro').inner_text()
 assert 'aucun ticket ne peut actuellement' not in page.locator('.safe-intro').inner_text()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate("localStorage.setItem('cdj.bets',JSON.stringify([{id:'old',source:'perso',legs:[],odds:2,stake:1,createdAt:'2026-10-31T12:00Z',manual:'lost'}]))")
 page.locator('[data-slot="basket"] [data-select]').click()
 page.locator('#safeOdds').fill('1,30');page.locator('#safeStake').fill('1');page.locator('#safeConfirmed').check()
 page.get_by_role('button',name='Enregistrer dans mon suivi').click()
 assert '1,50 et 2,00' in page.locator('#safeNotice').inner_text()
 page.locator('#safeOdds').fill('1,52');page.get_by_role('button',name='Enregistrer dans mon suivi').click()
 page.wait_for_function("JSON.parse(localStorage.getItem('cdj.bets')).length===2")
 assert page.evaluate("JSON.parse(localStorage.getItem('cdj.bets'))[0].manual")=='lost'
 assert page.evaluate("JSON.parse(localStorage.getItem('cdj.bets'))[1].estProb>=.6")
 data['tennis']['status']='quota';page.get_by_role('button',name='Actualiser les relevés',exact=False).click()
 page.wait_for_function("!document.querySelector('[data-slot=mixed]')")
 assert page.locator('[data-slot="basket"]').count()==1
 page.goto('https://combi.test/tableau.html');page.wait_for_selector('.badge.lost')
 assert 'SAFE DU JOUR' in page.locator('body').inner_text()
 assert not errors,errors
 print('PASS: 60 percent UI; four eligible tickets restored; low confirmed odds refused; old losses retained; no mixed ticket without tennis; mobile layout; dashboard; no JS errors')
 b.close()
