"""Run directly with Python + Playwright; all fixture prices stay inside this test."""
from pathlib import Path
import datetime as dt
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
NOW='2026-11-01T12:00:00Z'
def fixture(sport):
 outcomes=[dict(code='1',side='1',label='Victoire Home '+sport,odds=1.6),dict(code='2',side='2',label='Victoire Away '+sport,odds=2.5)]
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
 page.wait_for_selector('#safeShortlist .safe-card')
 assert page.locator('[data-select]').count()==0
 assert page.locator('#safeCards .empty').count()==4
 assert '70 %' in page.locator('.safe-intro').inner_text()
 assert '66,7 %' in page.locator('.safe-intro').inner_text()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('#safeShortlist li').count()==3
 assert '61,3 %' not in page.locator('#safeCards').inner_text()
 assert page.evaluate("JSON.parse(localStorage.getItem('cdj.safeDaily'))['2026-11-01']") == {}
 # Existing losing tickets are preserved, even if their old estimate was below the new threshold.
 page.evaluate("localStorage.setItem('cdj.bets',JSON.stringify([{id:'old-safe',source:'safe',safeKind:'basket',legs:[{sport:'basket',home:'A',away:'B',kickoff:'2026-10-31T20:00Z',date:'2026-10-31',label:'Old choice'}],odds:1.52,estProb:.613,stake:1,createdAt:'2026-10-31T12:00Z',manual:'lost'}]))")
 page.screenshot(path='/workspace/combi/safe-70-mobile.png',full_page=True)
 data['tennis']['status']='quota';page.get_by_role('button',name='Actualiser les relevés',exact=False).click()
 page.wait_for_function("document.querySelectorAll('#safeShortlist li').length===2")
 assert page.locator('[data-select]').count()==0
 page.goto('https://combi.test/tableau.html')
 page.wait_for_selector('.badge.lost')
 assert page.evaluate("JSON.parse(localStorage.getItem('cdj.bets'))[0].manual")=='lost'
 page.set_viewport_size({'width':1280,'height':900});page.goto('https://combi.test/safe.html');page.wait_for_selector('#safeShortlist .safe-card')
 assert page.locator('[data-select]').count()==0
 assert not errors,errors
 print('PASS: no 61 percent safe; >70 percent shortlist separated from full ticket; incompatible 1.5–2 target explained; no forced ticket; original losses retained; missing sport; mobile layout; no JS errors')
 b.close()
