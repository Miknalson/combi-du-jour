"""Basket et tennis : cotes Winamax France via OddsPapi (2e fournisseur gratuit, clé ODDSPAPI_KEY).

The Odds API garde ses crédits pour le football. Ce script :
- tourne au plus une fois par jour (heure de Paris) et s'arrête à 230 requêtes par mois (offre gratuite ~250) ;
- ne garde que Winamax FR (`winamax.fr`), cotes actives, matchs pas encore commencés ;
- marchés : vainqueur (h2h) et plus/moins en demi-points/jeux (totals). Les handicaps sont ignorés tant
  que leur sens (équipe 1 ou 2) n'est pas vérifié ;
- écrit data/sports/basket.json et data/sports/tennis.json au même format que scripts/update_sports.py,
  seulement s'il a trouvé au moins un match (sinon le fichier existant n'est pas touché).
La clé n'est jamais écrite ni affichée.
"""
import datetime as dt, json, os, pathlib, re, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
LEDGER = DATA / 'oddspapi-budget.json'
BASE = 'https://api.oddspapi.io/v4/'
BOOK_SLUG, BOOK = 'winamax.fr', 'winamax_fr'
SPORTS = {'basket': (11, 'points'), 'tennis': (12, 'jeux')}
MONTHLY_CAP, CHUNK = 230, 10
FEMALE = re.compile(r'women|woman|female|wta|wnba|billie jean|lfb|feminin|féminin|frauen|ladies|\(w\)', re.I)


def paris_day(t):
    # Europe/Paris ≈ UTC+1 en hiver, UTC+2 en été ; un jour « Paris » suffit pour le plafond quotidien.
    off = 2 if 3 < t.month < 11 else 1
    return (t + dt.timedelta(hours=off)).date().isoformat()


class Api:
    def __init__(self, key, ledger):
        self.key, self.ledger = key, ledger

    def get(self, path, **params):
        if self.ledger['used'] >= MONTHLY_CAP:
            raise RuntimeError('plafond mensuel OddsPapi atteint')
        params['apiKey'] = self.key
        url = BASE + path + '?' + urllib.parse.urlencode(params)
        for attempt in range(3):
            time.sleep(1.6)  # limite du fournisseur : ~1 requête par seconde et par point d'accès
            self.ledger['used'] += 1
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    return json.loads(r.read().decode())
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:
                    time.sleep(3)
                    continue
                raise RuntimeError(f'{path} : HTTP {e.code}') from None
        raise RuntimeError(f'{path} : trop de refus')


def markets(api, sport_id, now):
    """Définitions des marchés (cache hebdomadaire dans data/oddspapi/)."""
    cache = DATA / 'oddspapi' / f'markets-{sport_id}.json'
    try:
        doc = json.loads(cache.read_text())
        if (now - dt.datetime.fromisoformat(doc['updatedAt'])).days < 7:
            return doc['markets']
    except (OSError, ValueError, KeyError):
        pass
    raw = api.get('markets', sportId=sport_id)
    keep = [{'marketId': m['marketId'], 'marketType': m.get('marketType'), 'period': m.get('period'),
             'handicap': m.get('handicap'), 'playerProp': m.get('playerProp'),
             'outcomes': [{'outcomeId': o['outcomeId'], 'outcomeName': o['outcomeName']} for o in m.get('outcomes', [])]}
            for m in raw if not m.get('playerProp') and m.get('period') == 'result'
            and m.get('marketType') in ('moneyline', 'totals', 'totals-games')]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({'updatedAt': now.isoformat(), 'markets': keep}, ensure_ascii=False) + '\n')
    return keep


def iso(s):
    t = dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    return t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), t


def build_match(sport, unit, fx, odds, defs, now, stamp):
    try:
        kickoff, t = iso(fx['startTime'])
    except (KeyError, ValueError):
        return None
    if t <= now or fx.get('statusId') != 0:
        return None
    home, away = fx.get('participant1Name'), fx.get('participant2Name')
    book = (odds.get('bookmakerOdds') or {}).get(BOOK_SLUG) or {}
    if not home or not away or home == away or not book.get('bookmakerIsActive', True) or book.get('suspended'):
        return None
    groups = []
    for mid, mk in (book.get('markets') or {}).items():
        d = defs.get(int(mid)) if str(mid).isdigit() else None
        if not d or mk.get('marketActive') is False:
            continue
        prices = {}
        for oid, out in (mk.get('outcomes') or {}).items():
            p = ((out.get('players') or {}).get('0') or {})
            name = d['names'].get(int(oid)) if str(oid).isdigit() else None
            try:
                price = float(p.get('price'))
            except (TypeError, ValueError):
                continue
            if name and p.get('active') and price > 1:
                prices[name] = price
        if d['marketType'] == 'moneyline':
            if set(prices) != {'1', '2'}:
                continue
            groups.append({'id': 'h2h||None', 'family': 'h2h', 'key': 'h2h', 'unit': 'match', 'line': None, 'participant': '',
                           'bookKey': BOOK, 'asOf': stamp, 'outcomes': [
                               {'code': '1', 'side': '1', 'label': 'Victoire ' + home, 'odds': prices['1'], 'participant': ''},
                               {'code': '2', 'side': '2', 'label': 'Victoire ' + away, 'odds': prices['2'], 'participant': ''}]})
        else:
            line = float(d.get('handicap') or 0)
            if set(prices) != {'Over', 'Under'} or abs(line % 1 - .5) > 1e-8:
                continue
            gid = f'totals||{line}'
            groups.append({'id': gid, 'family': 'totals', 'key': 'totals', 'unit': unit, 'line': line, 'participant': '',
                           'bookKey': BOOK, 'asOf': stamp, 'outcomes': [
                               {'code': gid + '|over', 'side': 'over', 'label': f'Plus de {str(line).replace(".", ",")} {unit}', 'odds': prices['Over'], 'participant': ''},
                               {'code': gid + '|under', 'side': 'under', 'label': f'Moins de {str(line).replace(".", ",")} {unit}', 'odds': prices['Under'], 'participant': ''}]})
    h2h = next((g for g in groups if g['family'] == 'h2h'), None)
    if not h2h:
        return None
    league = fx.get('tournamentName') or ''
    if fx.get('categoryName') and fx['categoryName'] not in league:
        league = f"{fx['categoryName']} · {league}"
    return {'id': f"{sport}-oddspapi-{fx['fixtureId']}", 'sport': sport, 'league': league, 'kickoff': kickoff,
            'home': home, 'away': away, 'bookKey': BOOK, 'book': 'Winamax France', 'asOf': stamp, 'market': 'h2h',
            'o1': h2h['outcomes'][0]['odds'], 'o2': h2h['outcomes'][1]['odds'], 'markets': groups,
            'sportKey': 'oddspapi_' + str(fx.get('tournamentId')), 'eventId': fx['fixtureId'],
            'gender': 'women' if FEMALE.search(league) else 'unspecified',
            'availableMarkets': sorted({g['family'] for g in groups}), 'uncollectedMarkets': []}


def collect(api, sport, now):
    sport_id, unit = SPORTS[sport]
    defs = {m['marketId']: {**m, 'names': {o['outcomeId']: o['outcomeName'] for o in m['outcomes']}} for m in markets(api, sport_id, now)}
    day = now.date()
    fixtures = api.get('fixtures', sportId=sport_id, hasOdds='true', bookmakers=BOOK_SLUG,
                       **{'from': day.isoformat(), 'to': (day + dt.timedelta(days=1)).isoformat()})
    fixtures = [f for f in fixtures if isinstance(f, dict) and f.get('statusId') == 0]
    by_id = {f['fixtureId']: f for f in fixtures}
    tournaments = sorted({f['tournamentId'] for f in fixtures if f.get('tournamentId')})
    out = []
    for i in range(0, len(tournaments), CHUNK):
        ids = ','.join(str(x) for x in tournaments[i:i + CHUNK])
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        for odds in api.get('odds-by-tournaments', bookmaker=BOOK_SLUG, tournamentIds=ids):
            fx = by_id.get(odds.get('fixtureId'))
            m = fx and build_match(sport, unit, fx, odds, defs, now, stamp)
            if m:
                out.append(m)
    return out, len(fixtures)


def main():
    key = os.environ.get('ODDSPAPI_KEY', '').strip()
    now = dt.datetime.now(dt.timezone.utc)
    if not key:
        print('OddsPapi : clé absente, rien à faire.'); return
    try:
        ledger = json.loads(LEDGER.read_text())
    except (OSError, ValueError):
        ledger = {}
    month, today = now.strftime('%Y-%m'), paris_day(now)
    if ledger.get('month') != month:
        ledger = {'month': month, 'used': 0}
    if ledger.get('lastDay') == today and not os.environ.get('ODDSPAPI_FORCE'):
        print('OddsPapi : relevé du jour déjà fait (' + today + ').'); return
    api = Api(key, ledger)
    summary = {}
    for sport in SPORTS:
        try:
            matches, seen = collect(api, sport, now)
        except Exception as e:  # noqa: BLE001 - un sport en échec ne bloque pas l'autre
            summary[sport] = 'échec : ' + str(e)[:120]
            continue
        summary[sport] = f'{len(matches)} matchs avec cotes Winamax ({seen} programmés)'
        if matches:
            doc = {'sport': sport, 'bookKey': BOOK, 'updatedAt': now.isoformat(), 'status': 'ok',
                   'matches': sorted(matches, key=lambda m: m['kickoff']), 'source': 'OddsPapi (Winamax FR)',
                   'partial': False, 'femaleMatches': sum(m['gender'] == 'women' for m in matches)}
            (DATA / 'sports' / f'{sport}.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    ledger.update({'lastDay': today, 'updatedAt': now.isoformat(), 'summary': summary})
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
    print('OddsPapi :', summary, '· requêtes ce mois-ci :', ledger['used'])


if __name__ == '__main__':
    main()
