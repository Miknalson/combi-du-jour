"""Sonde OddsPapi football (une seule fois, ~3 requêtes) : tournois, marchés et un extrait de cotes Winamax.
La clé vient du secret ODDSPAPI_KEY et n'est jamais écrite ni affichée."""
import json, time, os, pathlib, datetime as dt, urllib.request, urllib.parse, urllib.error, collections

KEY = os.environ.get('ODDSPAPI_KEY', '').strip()
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'oddspapi-probe'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://api.oddspapi.io/v4/'

def get(path, **params):
    time.sleep(1.6)
    params['apiKey'] = KEY
    url = BASE + path + '?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:1000].replace(KEY, '***')}

def save(name, body, limit=80000):
    text = json.dumps(body, ensure_ascii=False, indent=1)
    (OUT / (name + '.json')).write_text(text[:limit] + ('\n…TRONQUÉ' if len(text) > limit else ''))
    print(name, len(text))

if not KEY:
    print('ODDSPAPI_KEY absent'); raise SystemExit(0)
today = dt.date.today()
fx = get('fixtures', sportId=10, hasOdds='true', bookmakers='winamax.fr', **{'from': today.isoformat(), 'to': (today + dt.timedelta(days=3)).isoformat()})
if isinstance(fx, list):
    t = collections.Counter((f.get('tournamentId'), f.get('categoryName'), f.get('tournamentName')) for f in fx)
    save('soccer-tournaments', [{'id': k[0], 'category': k[1], 'name': k[2], 'fixtures': n} for k, n in t.most_common()])
    save('soccer-fixture-sample', fx[:3])
else:
    save('soccer-tournaments', fx); fx = []
mk = get('markets', sportId=10)
if isinstance(mk, list):
    save('soccer-markets', [{'marketId': m['marketId'], 'marketType': m.get('marketType'), 'name': m.get('marketName'), 'period': m.get('period'), 'handicap': m.get('handicap'),
                             'outcomes': [o.get('outcomeName') for o in m.get('outcomes', [])]} for m in mk if not m.get('playerProp') and m.get('period') in ('result', 'fulltime', None)])
else:
    save('soccer-markets', mk)
big = {'Premier League': 'England', 'LaLiga': 'Spain', 'Serie A': 'Italy', 'Bundesliga': 'Germany', 'Ligue 1': 'France', 'UEFA Champions League': None}
ids = []
for f in fx:
    n, c = f.get('tournamentName'), f.get('categoryName')
    if n in big and (big[n] is None or big[n] == c) and f['tournamentId'] not in ids and f.get('statusId') == 0:
        ids.append(f['tournamentId'])
print('tournois retenus', ids)
if ids:
    od = get('odds-by-tournaments', bookmaker='winamax.fr', tournamentIds=','.join(str(i) for i in ids[:5]))
    if isinstance(od, list):
        save('soccer-odds-summary', {'count': len(od), 'first': od[:1]}, 120000)
        mids = collections.Counter(mid for o in od for mid in ((o.get('bookmakerOdds') or {}).get('winamax.fr') or {}).get('markets', {}))
        save('soccer-odds-marketids', mids.most_common())
    else:
        save('soccer-odds-summary', od)
