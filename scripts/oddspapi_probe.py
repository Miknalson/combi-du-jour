"""Sonde OddsPapi (une seule fois) : enregistre des extraits de réponses pour écrire le collecteur basket/tennis.
La clé vient du secret ODDSPAPI_KEY et n'est jamais écrite ni affichée. ~8 requêtes."""
import json, time, os, pathlib, datetime as dt, urllib.request, urllib.parse, urllib.error

KEY = os.environ.get('ODDSPAPI_KEY', '').strip()
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'oddspapi-probe'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://api.oddspapi.io/v4/'

def get(path, **params):
    time.sleep(1.6)
    params['apiKey'] = KEY
    url = BASE + path + '?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=40) as r:
            return r.status, dict(r.headers), json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()[:2000]
    except Exception as e:  # noqa
        return None, {}, str(e)[:500]

def save(name, res, limit=60000):
    status, headers, body = res
    headers = {k: v for k, v in headers.items() if 'limit' in k.lower() or 'remaining' in k.lower() or 'used' in k.lower()}
    text = json.dumps({'status': status, 'headers': headers, 'body': body}, ensure_ascii=False, indent=1)
    (OUT / (name + '.json')).write_text(text[:limit] + ('\n…TRONQUÉ' if len(text) > limit else ''))
    print(name, status, len(text))
    return body

if not KEY:
    print('ODDSPAPI_KEY absent'); raise SystemExit(0)
today = dt.date.today()
bm = get('bookmakers')
if isinstance(bm[2], list):
    save('bookmakers-winamax', (bm[0], bm[1], [b for b in bm[2] if 'winamax' in json.dumps(b).lower()]))
for k, sid in (('basketball', 11), ('tennis', 12)):
    fx = save('fixtures-' + k, get('fixtures', sportId=sid, **{'from': today.isoformat(), 'to': (today + dt.timedelta(days=2)).isoformat()}, hasOdds='true', bookmakers='winamax.fr'), 30000)
    pre = [f for f in fx if f.get('statusId') == 0] if isinstance(fx, list) else []
    # un match de grande ligue si possible
    pre.sort(key=lambda f: 0 if f.get('tournamentName') in ('Liga ACB', 'LNB Elite', 'BBL', 'Serie A', 'Euroleague') else 1)
    for f in pre[:2]:
        save('odds-' + k + '-' + f['fixtureId'], get('odds', fixtureId=f['fixtureId'], bookmakers='winamax.fr'))
    if pre:
        save('odds-by-tournaments-' + k, get('odds-by-tournaments', bookmaker='winamax.fr', tournamentIds=pre[0]['tournamentId']), 40000)
    if k == 'tennis':
        save('markets-tennis', get('markets', sportId=sid), 20000)
