"""Collecteur OddsPapi : buts Winamax du football, appariés au relevé The Odds API (sans réseau)."""
import datetime as dt, importlib.util, json, pathlib, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('collect_oddspapi', ROOT / 'scripts' / 'collect_oddspapi.py')
C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)

NOW = dt.datetime(2026, 11, 23, 7, 0, tzinfo=dt.timezone.utc)
MARKETS = [
    {'marketId': 101, 'marketType': '1x2', 'period': 'fulltime', 'handicap': 0, 'playerProp': False,
     'outcomes': [{'outcomeId': 101, 'outcomeName': '1'}, {'outcomeId': 102, 'outcomeName': 'X'}, {'outcomeId': 103, 'outcomeName': '2'}]},
    {'marketId': 104, 'marketType': 'bothteamsscore', 'period': 'fulltime', 'handicap': 0, 'playerProp': False,
     'outcomes': [{'outcomeId': 104, 'outcomeName': 'Yes'}, {'outcomeId': 105, 'outcomeName': 'No'}]},
    {'marketId': 1010, 'marketType': 'totals', 'period': 'fulltime', 'handicap': 2.5, 'playerProp': False,
     'outcomes': [{'outcomeId': 1010, 'outcomeName': 'Over'}, {'outcomeId': 1011, 'outcomeName': 'Under'}]},
    {'marketId': 1012, 'marketType': 'totals', 'period': 'fulltime', 'handicap': 3.5, 'playerProp': False,
     'outcomes': [{'outcomeId': 1012, 'outcomeName': 'Over'}, {'outcomeId': 1013, 'outcomeName': 'Under'}]},
    {'marketId': 10208, 'marketType': '1x2', 'period': 'p1', 'handicap': 0, 'playerProp': False, 'outcomes': []},
]


def price(p, active=True):
    return {'players': {'0': {'active': active, 'price': p}}}


ODDS = [{'fixtureId': 'idA', 'bookmakerOdds': {'winamax.fr': {'bookmakerIsActive': True, 'suspended': False, 'markets': {
    '101': {'marketActive': False, 'outcomes': {'101': price(1.5), '102': price(4.2), '103': price(6.0)}},
    '104': {'marketActive': False, 'outcomes': {'104': price(1.8), '105': price(1.95)}},
    '1010': {'marketActive': False, 'outcomes': {'1010': price(1.7), '1011': price(2.1)}},
    '1012': {'marketActive': False, 'outcomes': {'1012': price(2.9), '1013': price(1.35)}},
    '10208': {'outcomes': {}}}}}},
    {'fixtureId': 'idB', 'bookmakerOdds': {'winamax.fr': {'markets': {'104': {'outcomes': {'104': price(1.6), '105': price(2.2, active=False)}}}}}}]
FIXTURES = [
    {'fixtureId': 'idA', 'tournamentId': 17, 'statusId': 0, 'startTime': '2026-11-23T20:00:00.000Z', 'participant1Name': 'Manchester City', 'participant2Name': 'Leeds United'},
    {'fixtureId': 'idB', 'tournamentId': 17, 'statusId': 0, 'startTime': '2026-11-23T17:30:00.000Z', 'participant1Name': 'Everton FC', 'participant2Name': 'Wolverhampton Wanderers'},
    {'fixtureId': 'idC', 'tournamentId': 23, 'statusId': 0, 'startTime': '2026-11-23T19:45:00.000Z', 'participant1Name': 'Lazio', 'participant2Name': 'Roma'},
]
REF = {'status': 'ok', 'updatedAt': '2026-11-23T06:40:00+00:00', 'matches': [
    {'id': 'football-a', 'sport': 'football', 'league': 'EPL', 'kickoff': '2026-11-23T20:00:00Z', 'home': 'Manchester City', 'away': 'Leeds United'},
    {'id': 'football-b', 'sport': 'football', 'league': 'EPL', 'kickoff': '2026-11-23T17:30:00Z', 'home': 'Everton', 'away': 'Wolverhampton Wanderers'},
    {'id': 'football-c', 'sport': 'football', 'league': 'SA', 'kickoff': '2026-11-23T19:45:00Z', 'home': 'Napoli', 'away': 'Roma'},
    {'id': 'football-d', 'sport': 'football', 'league': 'EPL', 'kickoff': '2026-11-24T20:00:00Z', 'home': 'Arsenal', 'away': 'Chelsea'}]}


class FakeApi:
    def __init__(self):
        self.calls = []

    def get(self, path, **params):
        self.calls.append((path, params))
        return {'markets': MARKETS, 'fixtures': FIXTURES, 'odds-by-tournaments': ODDS}[path]


class FootballGoals(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); C.DATA = pathlib.Path(self.tmp.name)
        (C.DATA / 'sports').mkdir()
        (C.DATA / 'sports' / 'football.json').write_text(json.dumps(REF))

    def tearDown(self):
        self.tmp.cleanup()

    def test_pairs_and_markets(self):
        api = FakeApi(); goals, todo, paired = C.collect_football(api, NOW)
        self.assertEqual((todo, paired), (3, 2))  # Napoli – Roma n'a pas d'équivalent ; Arsenal joue demain
        self.assertEqual([c[0] for c in api.calls], ['markets', 'fixtures', 'odds-by-tournaments'])
        self.assertEqual(api.calls[2][1]['tournamentIds'], '17')
        a = next(m for m in goals if m['id'] == 'football-a')
        self.assertEqual((a['home'], a['away'], a['kickoff']), ('Manchester City', 'Leeds United', '2026-11-23T20:00:00Z'))
        fam = {g['family']: g for g in a['markets']}
        self.assertEqual(sorted(fam), ['btts', 'h2h', 'totals'])  # la ligne 3,5 et la mi-temps sont ignorées
        self.assertEqual([o['code'] for o in fam['totals']['outcomes']], ['O2.5', 'U2.5'])
        self.assertEqual(fam['totals']['line'], 2.5)
        self.assertEqual([(o['code'], o['odds']) for o in fam['btts']['outcomes']], [('BTTS_Y', 1.8), ('BTTS_N', 1.95)])
        self.assertEqual(sorted(o['side'] for o in fam['h2h']['outcomes']), ['1', '2', 'X'])
        # Everton : une cote inactive -> marché incomplet -> match ignoré
        self.assertFalse(any(m['id'] == 'football-b' for m in goals))

    def test_stale_reference_spends_nothing(self):
        (C.DATA / 'sports' / 'football.json').write_text(json.dumps({**REF, 'updatedAt': '2026-11-23T04:00:00+00:00'}))
        api = FakeApi()
        self.assertIsNone(C.collect_football(api, NOW))
        self.assertEqual(api.calls, [])

    def test_day_file_fallback_when_odds_api_is_stale(self):
        # The Odds API bloqué (relevé de la veille) : les matchs du jour viennent de data/days/ et le 1N2 Winamax
        # d'OddsPapi alimente football.json (Très sûr, Safe) et la fiche du jour (appli), sans crédit The Odds API.
        (C.DATA / 'sports' / 'football.json').write_text(json.dumps({**REF, 'updatedAt': '2026-11-22T04:00:00+00:00'}))
        (C.DATA / 'days').mkdir()
        day = {'date': '2026-11-23', 'matches': [
            {'id': 'football-a', 'league': 'EPL', 'kickoff': '2026-11-23T20:00Z', 'home': 'Manchester City', 'away': 'Leeds United', 'o1': 1.5, 'oX': 4, 'o2': 6},
            {'id': 'football-z', 'league': 'EPL', 'kickoff': '2026-11-23T06:00Z', 'home': 'Old', 'away': 'Match'}]}
        (C.DATA / 'days' / '2026-11-23.json').write_text(json.dumps(day, indent=1))
        api = FakeApi(); goals, todo, paired = C.collect_football(api, NOW)
        self.assertEqual((todo, paired), (1, 1))
        self.assertEqual(C.publish_winners(goals, NOW), 1)
        doc = json.loads((C.DATA / 'sports' / 'football.json').read_text())
        self.assertEqual((doc['status'], doc['updatedAt'], len(doc['matches'])), ('ok', NOW.isoformat(), 1))
        m = doc['matches'][0]
        self.assertEqual((m['id'], m['o1'], m['oX'], m['o2'], m['bookKey']), ('football-a', 1.5, 4.2, 6.0, 'winamax_fr'))
        self.assertEqual(sorted(g['family'] for g in m['markets']), ['h2h', 'totals'])
        mine = json.loads((C.DATA / 'days' / '2026-11-23.json').read_text())['matches'][0]['mine']
        self.assertEqual((mine['o1'], mine['oX'], mine['o2'], mine['ou']['2.5']['o']), (1.5, 4.2, 6.0, 1.7))

    def test_night_run_and_empty_result_do_not_block_the_day(self):
        # 26/11 : le relevé de 00:32 (Paris) n'a rien trouvé et a marqué la journée comme faite -> aucun ticket.
        import os
        from unittest import mock
        calls = []
        def fake(api, now):
            calls.append(now); return [], 5, 0
        C.LEDGER = C.DATA / 'oddspapi-budget.json'
        C.LEDGER.write_text(json.dumps({'month': '2026-11', 'used': 0, 'lastDay': '2026-11-26'}))
        with mock.patch.dict(os.environ, {'ODDSPAPI_KEY': 'k'}), mock.patch.object(C, 'collect_football', fake), \
                mock.patch.object(C.dt, 'datetime', wraps=dt.datetime) as clock:
            clock.now.return_value = dt.datetime(2026, 11, 25, 23, 32, tzinfo=dt.timezone.utc)  # 00:32 à Paris
            C.main()
            self.assertEqual(calls, [])
            clock.now.return_value = dt.datetime(2026, 11, 26, 7, 50, tzinfo=dt.timezone.utc)  # 08:50 à Paris
            C.main()
            self.assertEqual(len(calls), 1)
        self.assertNotIn('lastFootballDay', json.loads(C.LEDGER.read_text()))

    def test_team_names(self):
        self.assertTrue(C.same_team('Atalanta BC', 'Atalanta'))
        self.assertTrue(C.same_team('Inter Milan', 'Inter'))
        self.assertFalse(C.same_team('Manchester City', 'Manchester United'))
        self.assertTrue(C.same_team('Paris Saint Germain', 'Paris Saint-Germain'))
        self.assertFalse(C.same_team('Napoli', 'Lazio'))


if __name__ == '__main__':
    unittest.main()
