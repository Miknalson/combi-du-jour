"""Sonde OddsPapi (une seule fois) : enregistre des extraits de réponses pour écrire le collecteur basket/tennis.
La clé vient du secret ODDSPAPI_KEY et n'est jamais écrite ni affichée. ~8 requêtes."""
import json, os, pathlib, datetime as dt, urllib.request, urllib.parse, urllib.error

KEY = os.environ.get('ODDSPAPI_KEY', '').strip()
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'oddspapi-probe'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://api.oddspapi.io/v4/'

def get(path, **params):
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
sports = save('sports', get('sports'))
save('bookmakers', get('bookmakers'), 20000)
ids = {}
if isinstance(sports, list):
    for s in sports:
        name = json.dumps(s).lower()
        for k in ('basketball', 'tennis'):
            if k in name and k not in ids:
                ids[k] = s.get('sportId') or s.get('id')
print('ids', ids)
for k, sid in ids.items():
    fx = save('fixtures-' + k, get('fixtures', sportId=sid, **{'from': today.isoformat(), 'to': (today + dt.timedelta(days=2)).isoformat()}, hasOdds='true', bookmakers='winamax.fr'))
    first = fx[0] if isinstance(fx, list) and fx else None
    if first:
        fid = first.get('fixtureId') or first.get('id')
        save('odds-' + k, get('odds', fixtureId=fid, bookmakers='winamax.fr'))
        tid = first.get('tournamentId')
        if tid:
            save('odds-by-tournaments-' + k, get('odds-by-tournaments', bookmaker='winamax.fr', tournamentIds=tid))
    save('markets-' + k, get('markets', sportId=sid), 30000)
