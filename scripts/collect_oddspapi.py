"""Basket, tennis et buts du football : cotes Winamax France via OddsPapi (2e fournisseur gratuit, clé ODDSPAPI_KEY).

The Odds API garde ses crédits pour les victoires du football. Ce script :
- relève le basket et le tennis un jour sur deux, et les buts du football (plus/moins 2,5, les deux équipes marquent)
  une fois par jour, pour l'Algo (choix de Nano le 23/11/2026). Il s'arrête à 230 requêtes par mois (offre gratuite ~250) ;
- football : seulement les matchs du jour déjà présents dans data/sports/football.json (relevé The Odds API de moins
  d'une heure), repris avec leur identifiant et leurs noms d'équipe pour que les scores de l'appli règlent les tickets.
  Écrit data/sports/football-goals.json ;
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
MONTHLY_CAP, CHUNK = 230, 5
FOOT_ID, FOOT_ODDS_CALLS = 10, 2  # 2 appels de cotes au plus (10 championnats) : ~3 requêtes par jour pour le football
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
                detail = e.read().decode(errors='replace')[:200].replace(self.key, '***')
                raise RuntimeError(f'{path} : HTTP {e.code} {detail}') from None
        raise RuntimeError(f'{path} : trop de refus')


def markets(api, sport_id, now, period='result', types=('moneyline', 'totals', 'totals-games')):
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
            for m in raw if not m.get('playerProp') and m.get('period') == period
            and m.get('marketType') in types]
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
    # Une seule ligne de total par match (la ligne principale : cotes plus/moins les plus proches),
    # comme chez The Odds API ; des dizaines de lignes alternatives feraient exploser la recherche des combinés.
    totals = [g for g in groups if g['family'] == 'totals']
    if totals:
        main = min(totals, key=lambda g: abs(g['outcomes'][0]['odds'] - g['outcomes'][1]['odds']))
        groups = [g for g in groups if g['family'] != 'totals'] + [main]
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


def norm(name):
    s = re.sub(r'[^a-z0-9 ]', ' ', str(name).lower().replace('é', 'e').replace('è', 'e').replace('ü', 'u').replace('ö', 'o').replace('ã', 'a').replace('á', 'a').replace('í', 'i').replace('ó', 'o').replace('ñ', 'n').replace('ç', 'c'))
    drop = {'fc', 'cf', 'ac', 'sc', 'afc', 'ssc', 'as', 'bc', 'club', 'calcio', 'de', 'the', 'cd', 'ud', 'rc', 'sv', 'fk', 'sk', '1', 'vfb', 'vfl', 'tsg', 'us', 'ss', 'ogc', 'stade', 'olympique'}
    words = {w for w in s.split() if w not in drop and len(w) > 1}
    # Mots trop courants (« United », « City »…) : ignorés s'il reste un vrai nom, pour ne pas confondre Man City et Man United.
    common = {'united', 'city', 'town', 'athletic', 'atletico', 'sporting', 'real', 'county', 'wanderers', 'rovers', 'albion', 'manchester', 'fc'}
    return words - common, words


def same_team(a, b):
    (x, fx), (y, fy) = norm(a), norm(b)
    if not x or not y:  # nom fait seulement de mots courants (« Manchester City ») : il faut les mêmes mots
        return bool(fx) and fx == fy
    return bool(x & y) or any(u.startswith(v) or v.startswith(u) for u in x for v in y if min(len(u), len(v)) >= 4)


def pair(ref, fixtures):
    """Match du relevé The Odds API -> fixture OddsPapi (même heure à 10 min près, deux équipes reconnues)."""
    t = dt.datetime.fromisoformat(ref['kickoff'].replace('Z', '+00:00'))
    for f in fixtures:
        try:
            ft = dt.datetime.fromisoformat(str(f['startTime']).replace('Z', '+00:00'))
        except (KeyError, ValueError):
            continue
        if abs((ft - t).total_seconds()) <= 600 and same_team(ref['home'], f.get('participant1Name')) and same_team(ref['away'], f.get('participant2Name')):
            return f
    return None


def goals_match(ref, fx, odds, defs, now, stamp):
    if fx.get('statusId') != 0 or dt.datetime.fromisoformat(ref['kickoff'].replace('Z', '+00:00')) <= now:
        return None
    book = (odds.get('bookmakerOdds') or {}).get(BOOK_SLUG) or {}
    if not book.get('bookmakerIsActive', True) or book.get('suspended'):
        return None
    home, away = ref['home'], ref['away']
    groups = []
    # Chez OddsPapi, presque tous les marchés football Winamax sont « marketActive: false » alors que les cotes
    # sont actives et récentes : on se fie à l'état de chaque cote (active, prix > 1).
    for mid, mk in (book.get('markets') or {}).items():
        d = defs.get(int(mid)) if str(mid).isdigit() else None
        if not d:
            continue
        prices = {}
        for oid, out in (mk.get('outcomes') or {}).items():
            pl = ((out.get('players') or {}).get('0') or {})
            name = d['names'].get(int(oid)) if str(oid).isdigit() else None
            try:
                price = float(pl.get('price'))
            except (TypeError, ValueError):
                continue
            if name and pl.get('active') and price > 1:
                prices[name] = price
        if d['marketType'] == '1x2' and set(prices) == {'1', 'X', '2'}:
            groups.append({'id': 'h2h||None', 'family': 'h2h', 'key': 'h2h', 'unit': 'match', 'line': None, 'participant': '', 'bookKey': BOOK, 'asOf': stamp, 'outcomes': [
                {'code': '1', 'side': '1', 'label': 'Victoire ' + home, 'odds': prices['1'], 'participant': ''},
                {'code': '2', 'side': '2', 'label': 'Victoire ' + away, 'odds': prices['2'], 'participant': ''},
                {'code': 'X', 'side': 'X', 'label': 'Match nul', 'odds': prices['X'], 'participant': ''}]})
        elif d['marketType'] == 'totals' and abs(float(d.get('handicap') or 0) - 2.5) < 1e-9 and set(prices) == {'Over', 'Under'}:
            groups.append({'id': 'totals||2.5', 'family': 'totals', 'key': 'totals', 'unit': 'goals', 'line': 2.5, 'participant': '', 'bookKey': BOOK, 'asOf': stamp, 'outcomes': [
                {'code': 'O2.5', 'side': 'over', 'label': 'Plus de 2,5 buts', 'odds': prices['Over'], 'participant': ''},
                {'code': 'U2.5', 'side': 'under', 'label': 'Moins de 2,5 buts', 'odds': prices['Under'], 'participant': ''}]})
        elif d['marketType'] == 'bothteamsscore' and set(prices) == {'Yes', 'No'}:
            groups.append({'id': 'btts||None', 'family': 'btts', 'key': 'btts', 'unit': 'match', 'line': None, 'participant': '', 'bookKey': BOOK, 'asOf': stamp, 'outcomes': [
                {'code': 'BTTS_Y', 'side': 'yes', 'label': 'Les deux équipes marquent', 'odds': prices['Yes'], 'participant': ''},
                {'code': 'BTTS_N', 'side': 'no', 'label': 'Les deux équipes ne marquent pas toutes les deux', 'odds': prices['No'], 'participant': ''}]})
    if not groups:
        return None
    return {**{k: ref[k] for k in ('id', 'sport', 'league', 'kickoff', 'home', 'away') if k in ref}, 'leagueCode': ref.get('leagueCode'),
            'bookKey': BOOK, 'book': 'Winamax France', 'asOf': stamp, 'oddspapiFixtureId': fx['fixtureId'], 'gender': ref.get('gender', 'unspecified'),
            'markets': groups, 'availableMarkets': sorted({g['family'] for g in groups}), 'fromDayFile': bool(ref.get('fromDayFile'))}


def day_refs(today, now, known):
    """Matchs du jour de data/days/<jour>.json absents du relevé The Odds API frais (secours quand ce relevé est bloqué)."""
    try:
        doc = json.loads((DATA / 'days' / (today + '.json')).read_text())
    except (OSError, ValueError):
        return []
    out = []
    for m in doc.get('matches', []):
        try:
            t = dt.datetime.fromisoformat(str(m['kickoff']).replace('Z', '+00:00'))
        except (KeyError, ValueError):
            continue
        if not m.get('id') or not m.get('home') or not m.get('away') or t <= now or paris_day(t) != today:
            continue
        if any(k['id'] == m['id'] or (k['kickoff'] == m['kickoff'] and same_team(k['home'], m['home']) and same_team(k['away'], m['away'])) for k in known):
            continue
        out.append({'id': m['id'], 'sport': 'football', 'league': m.get('leagueTitle') or m.get('league'), 'leagueCode': m.get('league'),
                    'kickoff': m['kickoff'], 'home': m['home'], 'away': m['away'], 'gender': m.get('gender', 'unspecified'), 'fromDayFile': True})
    return out


def collect_football(api, now):
    """Cotes Winamax (1N2, buts, les deux marquent) des matchs du jour.

    Matchs de référence : le relevé football The Odds API s'il a moins d'une heure, complété par les matchs du jour
    de data/days/ (même identifiant, mêmes noms) : le football ne dépend plus des crédits The Odds API.
    None s'il n'y a aucun match du jour à relever (aucune requête dépensée)."""
    try:
        ref = json.loads((DATA / 'sports' / 'football.json').read_text())
        fresh = ref.get('status') == 'ok' and 0 <= (now - dt.datetime.fromisoformat(ref['updatedAt'].replace('Z', '+00:00'))).total_seconds() <= 3600
    except (OSError, ValueError, KeyError):
        ref, fresh = {}, False
    today = paris_day(now)
    todo = [m for m in ref.get('matches', []) if fresh and m.get('sport') == 'football' and m.get('kickoff')
            and paris_day(dt.datetime.fromisoformat(m['kickoff'].replace('Z', '+00:00'))) == today
            and dt.datetime.fromisoformat(m['kickoff'].replace('Z', '+00:00')) > now]
    todo += day_refs(today, now, todo)
    if not todo:
        return None
    defs = {m['marketId']: {**m, 'names': {o['outcomeId']: o['outcomeName'] for o in m['outcomes']}}
            for m in markets(api, FOOT_ID, now, period='fulltime', types=('1x2', 'totals', 'bothteamsscore'))}
    day = now.date()
    fixtures = api.get('fixtures', sportId=FOOT_ID, hasOdds='true', bookmakers=BOOK_SLUG,
                       **{'from': day.isoformat(), 'to': (day + dt.timedelta(days=1)).isoformat()})
    fixtures = [f for f in fixtures if isinstance(f, dict) and f.get('statusId') == 0]
    pairs = [(m, f) for m in todo for f in [pair(m, fixtures)] if f]
    # Les championnats qui ont le plus de matchs du jour d'abord, dans la limite du budget.
    count = {}
    for _, f in pairs:
        count[f['tournamentId']] = count.get(f['tournamentId'], 0) + 1
    tournaments = sorted(count, key=lambda t: (-count[t], t))[:CHUNK * FOOT_ODDS_CALLS]
    by_fixture = {f['fixtureId']: m for m, f in pairs}
    fx_by_id = {f['fixtureId']: f for _, f in pairs}
    out = []
    for i in range(0, len(tournaments), CHUNK):
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        for odds in api.get('odds-by-tournaments', bookmaker=BOOK_SLUG, tournamentIds=','.join(str(x) for x in tournaments[i:i + CHUNK])):
            fid = odds.get('fixtureId')
            m = fid in by_fixture and goals_match(by_fixture[fid], fx_by_id[fid], odds, defs, now, stamp)
            if m:
                out.append(m)
    return out, len(todo), len(pairs)


def publish_winners(goals, now):
    """Cotes Winamax 1N2 relevées par OddsPapi -> data/sports/football.json (Très sûr, Safe) et data/days/ (appli).

    Les matchs The Odds API de moins d'une heure sont gardés ; les autres sont remplacés par le relevé OddsPapi.
    Retourne le nombre de matchs ajoutés au relevé football."""
    rows = []
    for g in goals:
        h2h = next((x for x in g['markets'] if x['family'] == 'h2h'), None)
        if not h2h:
            continue
        odds = {o['side']: o['odds'] for o in h2h['outcomes']}
        rows.append({**{k: g[k] for k in ('id', 'league', 'leagueCode', 'kickoff', 'home', 'away', 'gender') if k in g},
                     'eventId': g['oddspapiFixtureId'], 'sport': 'football', 'sportKey': 'oddspapi_football', 'asOf': g['asOf'],
                     'bookKey': BOOK, 'book': 'Winamax France', 'market': 'h2h', 'quoteSource': 'oddspapi',
                     'markets': [x for x in g['markets'] if x['family'] in ('h2h', 'totals')],
                     'o1': odds['1'], 'oX': odds['X'], 'o2': odds['2']})
    if not rows:
        return 0
    path = DATA / 'sports' / 'football.json'
    try:
        doc = json.loads(path.read_text())
    except (OSError, ValueError):
        doc = {'sport': 'football', 'bookKey': BOOK, 'matches': [], 'fixtures': []}
    def recent(m):
        try:
            return 0 <= (now - dt.datetime.fromisoformat(str(m['asOf']).replace('Z', '+00:00'))).total_seconds() <= 3600
        except (KeyError, ValueError):
            return False
    ids = {r['id'] for r in rows}
    keep = [m for m in doc.get('matches', []) if recent(m) and m.get('id') not in ids]
    doc.update(status='ok', updatedAt=now.isoformat(), bookKey=BOOK, partial=True, matches=keep + rows,
               winnersSource='OddsPapi (Winamax FR)' if not keep else 'The Odds API + OddsPapi (Winamax FR)')
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    file = DATA / 'days' / (paris_day(now) + '.json')
    try:
        day = json.loads(file.read_text())
    except (OSError, ValueError):
        return len(rows)
    by_id = {r['id']: r for r in rows}
    changed = False
    for m in day.get('matches', []):
        r = by_id.get(m.get('id'))
        if not r:
            continue
        own = m.setdefault('mine', {'book': 'Winamax France', 'bookKey': BOOK, 'ou': {}})
        own.update(asOf=r['asOf'], o1=r['o1'], oX=r['oX'], o2=r['o2'], quoteSource='oddspapi')
        tot = next((x for x in r['markets'] if x['family'] == 'totals'), None)
        if tot:
            v = {o['side']: o['odds'] for o in tot['outcomes']}
            own.setdefault('ou', {})[str(tot['line'])] = {'o': v['over'], 'u': v['under'], 'asOf': tot['asOf'], 'quoteSource': 'oddspapi'}
        changed = True
    if changed:
        day['marketsUpdatedAt'] = now.isoformat()
        file.write_text(json.dumps(day, ensure_ascii=False, indent=1))  # format des fichiers du jour : sans saut de ligne final
    return len(rows)


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
    force = bool(os.environ.get('ODDSPAPI_FORCE'))
    api = Api(key, ledger)
    summary = {}
    # Football (buts) : une fois par jour, dès qu'un relevé The Odds API frais existe.
    if ledger.get('lastFootballDay') != today or force:
        try:
            res = collect_football(api, now)
        except Exception as e:  # noqa: BLE001
            res = None
            summary['football'] = 'échec : ' + str(e)[:120]
        if res:
            goals, todo, paired = res
            summary['football'] = f'{len(goals)} matchs avec buts Winamax ({paired} retrouvés sur {todo} du jour)'
            doc = {'sport': 'football', 'bookKey': BOOK, 'updatedAt': now.isoformat(), 'status': 'ok' if goals else 'empty',
                   'matches': sorted(goals, key=lambda m: m['kickoff']), 'source': 'OddsPapi (Winamax FR)', 'day': today}
            (DATA / 'sports' / 'football-goals.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
            added = publish_winners(goals, now)
            if added:
                summary['football'] += f' · {added} matchs 1N2 Winamax pour Très sûr et Safe'
            ledger['lastFootballDay'] = today
        elif 'football' not in summary:
            summary['football'] = 'en attente du relevé football du jour'
    # Basket et tennis : un jour sur deux.
    last = ledger.get('lastDay')
    due = force or not last or (dt.date.fromisoformat(today) - dt.date.fromisoformat(last)).days >= 2
    if not due:
        print('OddsPapi : basket et tennis relevés le ' + last + ', prochain relevé demain.')
    for sport in (SPORTS if due else ()):
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
    if due:
        ledger['lastDay'] = today
    ledger.update({'updatedAt': now.isoformat(), 'summary': summary})
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
    print('OddsPapi :', summary, '· requêtes ce mois-ci :', ledger['used'])


if __name__ == '__main__':
    main()
