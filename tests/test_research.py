import importlib.util
import unittest
from pathlib import Path
import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]

def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

research=load('research_model')
updater=load('update_odds')

class ResearchTests(unittest.TestCase):
    def test_goal_model_does_not_see_same_day_or_future_results(self):
        df=pd.DataFrame([
            dict(Date=pd.Timestamp('2020-01-01'),leagueCode='PL',HomeTeam='A',AwayTeam='B',FTHG=1,FTAG=0),
            dict(Date=pd.Timestamp('2020-01-01'),leagueCode='PL',HomeTeam='C',AwayTeam='D',FTHG=0,FTAG=0),
            dict(Date=pd.Timestamp('2020-01-02'),leagueCode='PL',HomeTeam='A',AwayTeam='B',FTHG=2,FTAG=1)])
        initial=research.rolling_goals(df)
        altered=df.copy();altered.loc[1,'FTHG']=10;altered.loc[2,'FTAG']=10
        changed=research.rolling_goals(altered)
        np.testing.assert_array_equal(initial[:2],changed[:2])
        later=df.copy();later.loc[2,'FTAG']=20
        np.testing.assert_array_equal(initial,research.rolling_goals(later))

    def test_score_grid_is_a_probability_distribution(self):
        p=research.dixon_coles(np.array([[1.5,1.2],[4.5,.2],[.2,4.5]]),-.12)
        np.testing.assert_allclose(p.sum(axis=1),1)
        self.assertTrue(np.all((p>=0)&(p<=1)))

    def test_consensus_excludes_our_book_and_exchanges(self):
        def book(key,title,prices):
            return {'key':key,'title':title,'last_update':'2026-10-30T10:00:00Z','markets':[
                {'key':'h2h','outcomes':[{'name':name,'price':price} for name,price in zip(['Home','Draw','Away'],prices)]}]}
        event={'home_team':'Home','away_team':'Away','commence_time':'2026-10-30T17:00:00Z','bookmakers':[
            book('pinnacle','Pinnacle',[2,3.5,4]),book('other','Other',[2.2,3.4,3.8]),
            book('winamax_fr','Winamax',[10,10,10]),book('betfair_ex_eu','Exchange',[20,20,20])]}
        match,_=updater.summarise(event,'PL')
        self.assertEqual(match['o1'],2.1)
        self.assertEqual(match['books'],2)
        self.assertEqual(match['mine']['o1'],10)
        self.assertEqual(match['mine']['bookKey'],'winamax_fr')
        self.assertEqual(match['mine']['asOf'],'2026-10-30T10:00:00Z')
        self.assertEqual(match['referenceAt'],'2026-10-30T10:00:00Z')

    def test_empty_betting_rule_has_no_fictional_roi(self):
        result=research.summarise([])
        self.assertEqual(result['tickets'],0);self.assertIsNone(result['roi'])
        self.assertFalse(result['profitableEvidence'])

if __name__=='__main__':unittest.main()
