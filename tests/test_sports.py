import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import update_sports as s

class SportsTests(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime.now(dt.timezone.utc)
        self.event={'id':'x','home_team':'A','away_team':'B','commence_time':(self.now+dt.timedelta(days=1)).isoformat(),
                    'bookmakers':[{'key':'winamax_fr','last_update':self.now.isoformat(),
                                   'markets':[{'key':'h2h','outcomes':[{'name':'A','price':1.8},{'name':'B','price':2.1}]}]}]}
    def test_only_winamax_france_actual_two_way_prices(self):
        for sport in ['basket','tennis']:
            r=s.extract(self.event,sport,'Competition',self.now)
            self.assertEqual(r['bookKey'],'winamax_fr');self.assertEqual(r['o1'],1.8)
        for key in ['pinnacle','winamax_de','other']:
            self.event['bookmakers'][0]['key']=key
            self.assertIsNone(s.extract(self.event,'basket','NBA',self.now))
    def test_stale_started_draw_or_invalid_price_rejected(self):
        import copy
        for kind in ['old','future','started','draw','nan']:
            e=copy.deepcopy(self.event)
            if kind=='old':e['bookmakers'][0]['last_update']=(self.now-dt.timedelta(hours=2)).isoformat()
            if kind=='future':e['bookmakers'][0]['last_update']=(self.now+dt.timedelta(hours=1)).isoformat()
            if kind=='started':e['commence_time']=(self.now-dt.timedelta(minutes=1)).isoformat()
            if kind=='draw':e['bookmakers'][0]['markets'][0]['outcomes'].append({'name':'Draw','price':3})
            if kind=='nan':e['bookmakers'][0]['markets'][0]['outcomes'][0]['price']=float('nan')
            self.assertIsNone(s.extract(e,'tennis','ATP',self.now),kind)
    def test_paired_totals_handicaps_and_sets_have_actual_prices(self):
        import copy
        e=copy.deepcopy(self.event)
        e['bookmakers'][0]['markets'] += [
            {'key':'totals','outcomes':[{'name':'Over','point':22.5,'price':1.9},{'name':'Under','point':22.5,'price':1.8}]},
            {'key':'spreads','outcomes':[{'name':'A','point':-3.5,'price':1.9},{'name':'B','point':3.5,'price':1.8}]},
            {'key':'player_sets_won','outcomes':[{'name':'Over','description':'B','point':.5,'price':1.3},{'name':'Under','description':'B','point':.5,'price':3.2}]}]
        groups=s.market_groups(e,'tennis',self.now)
        self.assertEqual({g['family'] for g in groups},{'h2h','totals','spreads','sets'})
        self.assertEqual(next(g for g in groups if g['family']=='sets')['outcomes'][0]['odds'],1.3)
        self.assertTrue(all(g['bookKey']=='winamax_fr' for g in groups))
        e['bookmakers'][0]['markets'][-1]['outcomes'].pop()
        self.assertNotIn('sets',{g['family'] for g in s.market_groups(e,'tennis',self.now)})
    def test_integer_lines_are_not_given_false_push_free_probabilities(self):
        self.event['bookmakers'][0]['markets'].append({'key':'totals','outcomes':[{'name':'Over','point':220,'price':1.9},{'name':'Under','point':220,'price':1.9}]})
        self.assertNotIn('totals',{g['family'] for g in s.market_groups(self.event,'basket',self.now)})
    def test_missing_key_creates_honest_empty_data(self):
        with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)),patch.dict(os.environ,{'ODDS_API_KEY':''}),patch.object(sys,'argv',['update_sports.py']),patch.object(s.api,'get') as get:
            s.main();get.assert_not_called()
            for sport in ['basket','tennis']:
                d=json.loads((Path(root)/f'{sport}.json').read_text());self.assertEqual(d['status'],'unconfigured');self.assertEqual(d['matches'],[])
    def test_quota_shared_between_sports_and_only_one_book_requested(self):
        def get(path,**params):
            if path=='/sports':return [{'key':'basketball_nba','title':'NBA'},{'key':'tennis_atp_x','title':'ATP'}]
            if path.endswith('/events'):return [self.event]
            self.assertEqual(params['bookmakers'],'winamax_fr');self.assertEqual(params['markets'],'h2h')
            return [self.event]
        with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)),patch.dict(os.environ,{'ODDS_API_KEY':'test'}),patch.object(sys,'argv',['update_sports.py']),patch.object(s.api,'get',side_effect=get),patch.object(s.api,'credits_budget',return_value=(2,100)):
            s.main()
            for sport in ['basket','tennis']:
                d=json.loads((Path(root)/f'{sport}.json').read_text());self.assertEqual(len(d['matches']),1)

if __name__=='__main__':unittest.main()
