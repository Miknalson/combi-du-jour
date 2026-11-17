import contextlib
import datetime as dt
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import check_quotes as health
import collect_quotes as runner

class HealthTests(unittest.TestCase):
 def test_provider_quota_is_distinguished_from_invalid_key_without_leaking_url(self):
  for code,status in [('OUT_OF_USAGE_CREDITS','quota'),('INVALID_API_KEY','unauthorized')]:
   error=HTTPError('https://api.example/odds?apiKey=private-token',401,'secret text',{},io.BytesIO(json.dumps({'error_code':code,'message':'private-token'}).encode()))
   with tempfile.TemporaryDirectory() as root,patch.object(health,'ROOT',Path(root)),patch.object(health.api,'get',side_effect=error),patch.dict(os.environ,{'ODDS_API_KEY':'private-token','GITHUB_OUTPUT':str(Path(root)/'outputs')}),contextlib.redirect_stdout(io.StringIO()) as out:
    got=health.main();self.assertEqual(got['status'],status);self.assertEqual(got['providerCode'],code);self.assertNotIn('private-token',json.dumps(got)+out.getvalue());self.assertIn('ready=false',(Path(root)/'outputs').read_text())
 def test_missing_key_and_success_are_reported(self):
  with tempfile.TemporaryDirectory() as root,patch.object(health,'ROOT',Path(root)),patch.dict(os.environ,{'ODDS_API_KEY':'','GITHUB_OUTPUT':''}),patch.object(health.api,'get') as get:
   self.assertEqual(health.main()['status'],'unconfigured');get.assert_not_called()
  with tempfile.TemporaryDirectory() as root,patch.object(health,'ROOT',Path(root)),patch.dict(os.environ,{'ODDS_API_KEY':'test','GITHUB_OUTPUT':''}),patch.object(health.api,'get',return_value=[{'key':'basketball_nba'}]),patch.object(health.api,'credits_left','53'):
   self.assertEqual(health.main()['creditsRemaining'],53)
 def test_transient_errors_retry_but_refused_key_does_not(self):
  limited=HTTPError('https://example',429,'rate limited',{'Retry-After':'2'},None)
  from unittest.mock import Mock
  get=Mock(side_effect=[limited,{'matches':[]}])
  with patch.object(runner.time,'sleep') as sleep:
   self.assertEqual(runner.retry_get(get,'/sports'),{'matches':[]});sleep.assert_called_once_with(2)
  get=Mock(side_effect=HTTPError('https://example',401,'refused',{},None))
  with patch.object(runner.time,'sleep') as sleep,self.assertRaises(HTTPError):runner.retry_get(get,'/sports')
  self.assertEqual(get.call_count,1);sleep.assert_not_called()
 def test_failed_collection_keeps_calendar_without_restamping_or_reusing_old_prices(self):
  now=dt.datetime.now(dt.timezone.utc)
  with tempfile.TemporaryDirectory() as root:
   folder=Path(root)/'sports';folder.mkdir();file=folder/'football.json';old={'sport':'football','bookKey':'winamax_fr','status':'ok','matches':[{'home':'A','away':'B','kickoff':(now+dt.timedelta(hours=2)).isoformat(),'o1':1.6,'oX':4,'o2':5,'asOf':(now-dt.timedelta(days=2)).isoformat()}]};file.write_text(json.dumps(old))
   def fail():
    file.write_text(json.dumps({'sport':'football','bookKey':'winamax_fr','status':'unavailable','matches':[],'updatedAt':now.isoformat()}))
    try:raise HTTPError('https://api.example?apiKey=private-token',503,'private-token',{},io.BytesIO(b'{}'))
    except HTTPError:raise SystemExit(1)
   original_get=runner.collector.api.get
   with patch.object(runner.collector,'ROOT',folder),patch.object(runner.collector,'main',side_effect=fail),contextlib.redirect_stdout(io.StringIO()) as out:
    self.assertEqual(runner.run(),1)
   self.assertIs(runner.collector.api.get,original_get)
   saved=json.loads(file.read_text());self.assertEqual(saved['matches'],[]);self.assertEqual(saved['fixtures'],[{'home':'A','away':'B','kickoff':old['matches'][0]['kickoff']}]);self.assertEqual(saved['calendarStatus'],'cached');self.assertNotIn('private-token',out.getvalue());self.assertEqual(json.loads((Path(root)/'collection-health.json').read_text())['httpStatus'],503)
if __name__=='__main__':unittest.main()
