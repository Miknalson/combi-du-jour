import datetime as dt
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import update_sports as s

class UefaTests(unittest.TestCase):
 def test_discovery_includes_clubs_nations_qualifiers_and_future_uefa_keys(self):
  for key in ['soccer_uefa_nations_league','soccer_uefa_champs_league','soccer_uefa_europa_league','soccer_uefa_europa_conference_league','soccer_fifa_world_cup_qualifiers_europe','soccer_uefa_under21_championship']:
   self.assertTrue(s.is_uefa(key),key)
  self.assertFalse(s.is_uefa('basketball_nba'))
  self.assertFalse(s.is_uefa('soccer_epl'))
 def test_collects_14_day_calendar_and_prioritises_uefa_over_domestic(self):
  now=dt.datetime.now(dt.timezone.utc);priced=[]
  keys=['soccer_epl','soccer_uefa_nations_league','soccer_uefa_under21_championship']
  def event(key):
   return {'id':key,'home_team':'Home '+key,'away_team':'Away '+key,'commence_time':(now+dt.timedelta(days=10 if 'under21' in key else 1)).isoformat(),
     'bookmakers':[{'key':'winamax_fr','last_update':now.isoformat(),'markets':[{'key':'h2h','outcomes':[{'name':'Home '+key,'price':1.6},{'name':'Draw','price':4},{'name':'Away '+key,'price':5}]}]}]}
  def get(path,**params):
   if path=='/sports':return [{'key':key,'title':key,'active':True} for key in keys]
   key=path.split('/')[2]
   if path.endswith('/events'):return [event(key)]
   if path.endswith('/markets'):return {'bookmakers':[]}
   priced.append(key);self.assertEqual(params['bookmakers'],'winamax_fr');self.assertEqual(params['markets'],'h2h');return [event(key)]
  with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)/'sports'),patch.dict(os.environ,{'ODDS_API_KEY':'test'}),patch.object(sys,'argv',['update_sports.py']),patch.object(s.api,'get',side_effect=get),patch.object(s.api,'credits_budget',return_value=(2,100)):
   s.main();d=json.loads((Path(root)/'sports'/'football.json').read_text())
   self.assertEqual(priced,['soccer_uefa_nations_league','soccer_uefa_under21_championship'])
   self.assertEqual(len(d['fixtures']),2);self.assertEqual(d['horizonDays'],14)
   self.assertTrue((Path(root)/'index.json').exists())
   docs=[json.loads(p.read_text()) for p in (Path(root)/'days').glob('*.json')]
   self.assertTrue(any(m['league']=='UNL' for d in docs for m in d['matches']))
 def test_bridge_preserves_existing_id_consensus_and_real_quote_time(self):
  now=dt.datetime(2026,11,14,22,tzinfo=dt.timezone.utc)
  m={'id':'football-new','sport':'football','league':'UEFA Nations League','leagueCode':'UNL','home':'France','away':'Italie',
     'kickoff':'2026-11-14T23:30:00Z','asOf':now.isoformat(),'bookKey':'winamax_fr','o1':1.6,'oX':4.,'o2':5.,'markets':[]}
  with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)/'sports'):
   folder=Path(root)/'days';folder.mkdir();file=folder/'2026-11-15.json'
   old={'id':'old-ticket-id','league':'UNL','home':'France','away':'Italie','kickoff':m['kickoff'],'o1':1.7,'oX':3.9,'o2':4.9,'books':7}
   file.write_text(json.dumps({'date':'2026-11-15','matches':[old]}))
   s.publish_football_days([m],now);s.publish_football_days([m],now)
   got=json.loads(file.read_text())['matches'];self.assertEqual(len(got),1);self.assertEqual(got[0]['id'],'old-ticket-id');self.assertEqual(got[0]['books'],7);self.assertEqual(got[0]['o1'],1.7);self.assertEqual(got[0]['mine']['asOf'],m['asOf'])
   m['asOf']=(now-dt.timedelta(hours=25)).isoformat();s.publish_football_days([m],now)
   self.assertNotEqual(json.loads(file.read_text())['matches'][0]['mine']['asOf'],m['asOf'])
if __name__=='__main__':unittest.main()
