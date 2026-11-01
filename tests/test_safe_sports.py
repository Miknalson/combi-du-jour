import copy
import datetime as dt
import sys
import unittest
import json
import tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import update_sports as s
class SafeSportsTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime.now(dt.timezone.utc)
  self.e={'id':'f','home_team':'Home','away_team':'Away','commence_time':(self.now+dt.timedelta(hours=3)).isoformat(),'bookmakers':[{'key':'winamax_fr','last_update':self.now.isoformat(),'markets':[{'key':'h2h','outcomes':[{'name':'Home','price':1.6},{'name':'Draw','price':4},{'name':'Away','price':5}]},{'key':'alternate_totals','outcomes':[{'name':'Over','point':4.5,'price':5},{'name':'Under','point':4.5,'price':1.14}]}]}]}
 def test_football_preserves_three_actual_prices_and_goal_totals(self):
  m=s.extract(self.e,'football','Ligue 1',self.now)
  self.assertEqual((m['o1'],m['oX'],m['o2']),(1.6,4,5))
  h=next(g for g in m['markets'] if g['family']=='h2h');self.assertEqual({o['side'] for o in h['outcomes']},{'1','X','2'})
  t=next(g for g in m['markets'] if g['family']=='totals');self.assertEqual(t['unit'],'goals');self.assertEqual({o['odds'] for o in t['outcomes']},{5,1.14});self.assertTrue(all('buts' in o['label'] for o in t['outcomes']))
 def test_football_rejects_missing_draw_foreign_prices_and_old_quotes(self):
  for kind in ['missing','foreign','old','future','started']:
   e=copy.deepcopy(self.e)
   if kind=='missing':e['bookmakers'][0]['markets'][0]['outcomes'].pop(1)
   if kind=='foreign':e['bookmakers'][0]['key']='winamax_de'
   if kind=='old':e['bookmakers'][0]['last_update']=(self.now-dt.timedelta(hours=2)).isoformat()
   if kind=='future':e['bookmakers'][0]['last_update']=(self.now+dt.timedelta(hours=2)).isoformat()
   if kind=='started':e['commence_time']=self.now.isoformat()
   self.assertIsNone(s.extract(e,'football','L1',self.now),kind)
 def test_tennis_and_basket_keep_rejecting_three_way_markets(self):
  for sport in ['basket','tennis']:self.assertIsNone(s.extract(self.e,sport,'League',self.now))
 def test_archived_football_keeps_actual_quote_time_and_skips_old_or_queried_leagues(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'days').mkdir()
   m={'id':'old-api-id','league':'L1','home':'Home','away':'Away','kickoff':(self.now+dt.timedelta(hours=3)).isoformat(),
      'mine':{'bookKey':'winamax_fr','asOf':(self.now-dt.timedelta(hours=3)).isoformat(),'o1':1.6,'oX':4,'o2':5}}
   file=root/'days'/'2026-11-01.json';file.write_text(json.dumps({'matches':[m]}))
   with patch.object(s,'ROOT',root/'sports'):
    got=s.archived_football(self.now,7);self.assertEqual(len(got),1);self.assertEqual(got[0]['asOf'],m['mine']['asOf'])
    self.assertEqual(s.archived_football(self.now,7,{'soccer_france_ligue_one'}),[])
    m['mine']['asOf']=(self.now-dt.timedelta(hours=25)).isoformat();file.write_text(json.dumps({'matches':[m]}));self.assertEqual(s.archived_football(self.now,7),[])
 def test_enrichment_alternates_sports_and_requests_listed_sets_and_standard_handicaps(self):
  def make(sport, i):
   return {'sport':sport,'sportKey':sport,'eventId':str(i),'kickoff':(self.now+dt.timedelta(hours=i+1)).isoformat(),
           'markets':[{'id':'h2h','family':'h2h','key':'h2h'}]}
  matches={'tennis':[make('tennis',i) for i in range(12)],'basket':[make('basket',i) for i in range(4)],'football':[]}
  prices=[];lookups=[]
  def get(path,**params):
   sport=path.split('/')[2]
   self.assertEqual(params['bookmakers'],'winamax_fr')
   if path.endswith('/markets'):
    lookups.append(sport);return {'bookmakers':[{'key':'winamax_fr','markets':[{'key':'h2h'},{'key':'player_sets_won' if sport=='tennis' else 'spreads'}]}]}
   prices.append((sport,params['markets']))
   return {'home_team':'A','away_team':'B','bookmakers':[]}
  with patch.object(s.api,'get',side_effect=get):remaining=s.enrich_markets(matches,2,self.now)
  self.assertEqual(lookups[:2],['tennis','basket']);self.assertEqual(prices,[('tennis','player_sets_won'),('basket','spreads')]);self.assertEqual(remaining,0)
  self.assertGreater(lookups.count('basket'),0);self.assertEqual(len(lookups),8)
  self.assertTrue(all(m['markets'][0]['family']=='h2h' for ms in matches.values() for m in ms))
if __name__=='__main__':unittest.main()
