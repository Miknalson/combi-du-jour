import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('scores_updater',Path(__file__).resolve().parents[1]/'scripts/update_scores.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class ScoresTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,11,20,12,tzinfo=dt.timezone.utc)
  self.match={'id':'saved-id','league':'UWCL','home':'Arsenal W','away':'OL Lyonnes W','kickoff':'2026-11-19T20:00Z'}
  self.event={'date':self.match['kickoff'],'status':{'period':2,'type':{'completed':True,'name':'STATUS_FULL_TIME'}},'competitions':[{'competitors':[{'homeAway':'home','score':'2','team':{'displayName':'Arsenal Women'}},{'homeAway':'away','score':'1','team':{'displayName':'OL Lyonnes Women'}}]}]}
 def test_only_completed_regulation_time_and_exact_fixture(self):
  self.assertEqual(s.matching_final(self.match,[self.event])['score'],'2-1')
  import copy
  for change in ['live','extra','pens','wrong_time','wrong_opponent','invalid_score','duplicate']:
   e=copy.deepcopy(self.event)
   if change=='live':e['status']['type']['completed']=False
   if change=='extra':e['status']['period']=4
   if change=='pens':e['status']['type']['name']='STATUS_FINAL_PEN'
   if change=='wrong_time':e['date']='2026-11-18T20:00Z'
   if change=='wrong_opponent':e['competitions'][0]['competitors'][1]['team']['displayName']='Paris'
   if change=='invalid_score':e['competitions'][0]['competitors'][1]['score']='-1'
   self.assertIsNone(s.matching_final(self.match,[e,e] if change=='duplicate' else [e]),change)
 def test_preserves_identity_prices_and_history_while_adding_verified_score(self):
  with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)),patch.object(s,'fetch',return_value={'events':[self.event]}) as get:
   folder=Path(root)/'days';folder.mkdir();file=folder/'2026-11-19.json';m=dict(self.match,o1=1.8,mine={'bookKey':'winamax_fr','asOf':'2026-11-19T10:00Z','o1':1.8});file.write_text(json.dumps({'date':'2026-11-19','matches':[m]}))
   report=s.update(self.now);got=json.loads(file.read_text())['matches'][0]
   self.assertEqual(report['updatedMatches'],1);self.assertEqual(got['score'],'2-1');self.assertEqual(got['scoreScope'],'regulation');self.assertEqual(got['id'],m['id']);self.assertEqual(got['mine'],m['mine']);self.assertEqual(got['o1'],m['o1']);get.assert_called_once_with('uefa.wchampions','2026-11-19')
 def test_network_error_does_not_erase_existing_results_or_publish_secrets(self):
  with tempfile.TemporaryDirectory() as root,patch.object(s,'ROOT',Path(root)),patch.object(s,'fetch',side_effect=RuntimeError('private-token-in-error')):
   folder=Path(root)/'days';folder.mkdir();file=folder/'2026-11-19.json';value=json.dumps({'date':'2026-11-19','matches':[self.match,dict(self.match,id='known',score='1-0')]});file.write_text(value)
   report=s.update(self.now);self.assertEqual(report['status'],'unavailable');self.assertEqual(file.read_text(),value);self.assertNotIn('private-token',json.dumps(report))
if __name__=='__main__':unittest.main()
