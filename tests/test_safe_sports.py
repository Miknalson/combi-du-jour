import copy
import datetime as dt
import sys
import unittest
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
if __name__=='__main__':unittest.main()
