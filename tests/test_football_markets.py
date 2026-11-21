import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import collect_football_markets as c
class MarketCollectionTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,11,21,10,tzinfo=dt.timezone.utc)
  self.event={'id':'native','home_team':'A','away_team':'B','commence_time':'2026-11-21T20:00:00Z','bookmakers':[{'key':'winamax_fr','last_update':'2026-11-21T09:55:00Z','markets':[{'key':'totals','outcomes':[{'name':'Over','point':2.5,'price':1.8},{'name':'Under','point':2.5,'price':2.1}]}]}]}
 def prepare(self,root):
  (root/'days').mkdir();(root/'sports').mkdir()
  m={'id':'saved-id','home':'A','away':'B','league':'PL','kickoff':self.event['commence_time'],'o1':1.8,'oX':4,'o2':5,'mine':{'bookKey':'winamax_fr','asOf':'2026-11-20T10:00:00Z','o1':1.8,'oX':4,'o2':5,'ou':{}},'score':None}
  (root/'days/2026-11-21.json').write_text(json.dumps({'date':'2026-11-21','matches':[m]}));(root/'sports/football.json').write_text(json.dumps({'sport':'football','status':'quota','bookKey':'winamax_fr','matches':[],'fixtures':[]}));return m
 def test_totals_without_winner_and_preservation_of_identity_scores_and_quote_times(self):
  with tempfile.TemporaryDirectory() as d,patch.object(c,'ROOT',Path(d)):
   root=Path(d);original=self.prepare(root);m=c.extract(self.event,'Premier League','soccer_epl',self.now);self.assertIsNotNone(m);self.assertNotIn('o1',m);c.publish([m],self.now)
   got=json.loads((root/'days/2026-11-21.json').read_text())['matches'][0];self.assertEqual(got['id'],original['id']);self.assertIsNone(got['score']);self.assertEqual(got['mine']['asOf'],original['mine']['asOf']);self.assertEqual(got['mine']['ou']['2.5']['asOf'],'2026-11-21T09:55:00Z');self.assertEqual(got['mine']['ou']['2.5']['o'],1.8)
 def test_two_market_request_with_monthly_budget_and_no_repeated_paid_request(self):
  calls=[]
  def get(path,**params):
   if path=='/sports':c.api.credits_left='22';return []
   calls.append(params);c.api.credits_left='20';return [self.event]
  with tempfile.TemporaryDirectory() as d,patch.object(c,'ROOT',Path(d)),patch.object(c.api,'get',side_effect=get),patch.dict(os.environ,{'ODDS_API_KEY':'private'}):
   self.prepare(Path(d));r=c.run(self.now);self.assertEqual(r['totalLines'],1);self.assertEqual(r['creditsUsed'],2);self.assertEqual(calls[0]['markets'],'h2h,totals');self.assertEqual(calls[0]['bookmakers'],'winamax_fr');c.run(self.now);self.assertEqual(len(calls),1)
 def test_one_credit_requests_totals_only_and_future_uefa_does_not_preempt_today(self):
  calls=[]
  def get(path,**params):
   if path=='/sports':c.api.credits_left='22';return []
   calls.append(params);c.api.credits_left='21';return [self.event]
  with tempfile.TemporaryDirectory() as d,patch.object(c,'ROOT',Path(d)),patch.object(c.api,'get',side_effect=get),patch.dict(os.environ,{'ODDS_API_KEY':'private'}):
   root=Path(d);self.prepare(root);(root/'collection-health.json').write_text(json.dumps({'updatedAt':self.now.isoformat(),'requestCredits':{'prices':1}}));(root/'days/2026-11-24.json').write_text(json.dumps({'date':'2026-11-24','matches':[{'home':'C','away':'D','league':'UCL','kickoff':'2026-11-24T20:00Z'}]}));r=c.run(self.now);self.assertEqual(r['totalLines'],1);self.assertEqual(calls[0]['markets'],'totals');self.assertEqual(r['league'],'soccer_epl')
 def test_rejects_foreign_incomplete_and_old_prices(self):
  import copy
  for kind in ['foreign','incomplete','old']:
   e=copy.deepcopy(self.event)
   if kind=='foreign':e['bookmakers'][0]['key']='other'
   if kind=='incomplete':e['bookmakers'][0]['markets'][0]['outcomes'].pop()
   if kind=='old':e['bookmakers'][0]['last_update']='2026-11-19T09:55:00Z'
   self.assertIsNone(c.extract(e,'Premier League','soccer_epl',self.now))
if __name__=='__main__':unittest.main()
