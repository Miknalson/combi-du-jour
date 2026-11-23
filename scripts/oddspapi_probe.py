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
ids = {'10208','10300','10320','10600','10604','10608','10612','10616','10620','10733','10730','10738','10596','10592','101905','101928','101930','101936','102206','102208','102210','102220','102222','102224','102462','102116','102053','102095','1010','1012','1014','106','108','10588'}
mk = get('markets', sportId=10)
if isinstance(mk, list):
    save('soccer-markets-2', [{'marketId': m['marketId'], 'marketType': m.get('marketType'), 'name': m.get('marketName'), 'period': m.get('period'), 'handicap': m.get('handicap'),
          'playerProp': m.get('playerProp'), 'outcomes': [[o.get('outcomeId'), o.get('outcomeName')] for o in m.get('outcomes', [])]} for m in mk if str(m['marketId']) in ids or m.get('marketType') == 'totals'][:400])
else:
    save('soccer-markets-2', mk)
