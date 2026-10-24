#!/usr/bin/env python3
"""Fetch upcoming odds from The Odds API and merge them into data/days/*.json.

Needs ODDS_API_KEY in the environment and network access to api.the-odds-api.com.
Usage: python3 scripts/update_odds.py [--days 10] [--dry-run]

Credit use: the sports and events listings are free; odds cost 2 credits per core league
(h2h + totals) and 1 per extra league (h2h), region eu. The script spreads the remaining
monthly credits over the days left in the month, prices leagues with a match in the next
48 hours first, and prints "FALLBACK <oddsportal path>" for every league it did not price.
"""
import argparse, datetime, json, os, re, ssl, sys, unicodedata, urllib.parse, urllib.request, zoneinfo

API = 'https://api.the-odds-api.com/v4'
PARIS = zoneinfo.ZoneInfo('Europe/Paris')
# (API sport key, app code, priced with goals totals?, oddsportal path used as fallback)
# Core leagues come first: when credits run short they are priced before the extra ones.
LEAGUES = [
    ('soccer_epl', 'PL', True, 'england/premier-league'),
    ('soccer_spain_la_liga', 'LIGA', True, 'spain/laliga'),
    ('soccer_italy_serie_a', 'SA', True, 'italy/serie-a'),
    ('soccer_germany_bundesliga', 'BL', True, 'germany/bundesliga'),
    ('soccer_france_ligue_one', 'L1', True, 'france/ligue-1'),
    ('soccer_uefa_champs_league', 'UCL', True, 'europe/champions-league'),
    ('soccer_uefa_europa_league', 'UEL', True, 'europe/europa-league'),
    ('soccer_netherlands_eredivisie', 'ERE', True, 'netherlands/eredivisie'),
    ('soccer_portugal_primeira_liga', 'POR', True, 'portugal/liga-portugal'),
    ('soccer_uefa_europa_conference_league', 'UECL', False, 'europe/conference-league'),
    ('soccer_efl_champ', 'CHA', False, 'england/championship'),
    ('soccer_germany_bundesliga2', 'BL2', False, 'germany/2-bundesliga'),
    ('soccer_spain_segunda_division', 'LIGA2', False, 'spain/laliga2'),
    ('soccer_france_ligue_two', 'L2', False, 'france/ligue-2'),
    ('soccer_belgium_first_div', 'BEL', False, 'belgium/jupiler-pro-league'),
    ('soccer_turkey_super_league', 'TUR', False, 'turkey/super-lig'),
    ('soccer_denmark_superliga', 'DEN', False, 'denmark/superliga'),
    ('soccer_sweden_allsvenskan', 'SWE', False, 'sweden/allsvenskan'),
    ('soccer_poland_ekstraklasa', 'POL', False, 'poland/ekstraklasa'),
    ('soccer_league_of_ireland', 'IRL', False, 'ireland/premier-division'),
    ('soccer_russia_premier_league', 'RUS', False, 'russia/premier-league'),
    ('soccer_portugal_segunda_liga', 'POR2', False, 'portugal/liga-portugal-2'),
    ('soccer_romania_liga_1', 'ROU', False, 'romania/superliga'),
    ('soccer_serbia_super_liga', 'SRB', False, 'serbia/super-liga'),
    ('soccer_ukraine_premier_league', 'UKR', False, 'ukraine/premier-league'),
]
EXCHANGES = {'betfair_ex_eu', 'betfair_ex_uk', 'matchbook', 'smarkets', 'betfair'}
# Low-margin books whose prices track the true odds most closely, best first.
SHARP = ['pinnacle', 'betfair_ex_eu', 'matchbook']
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def ssl_context():
    for path in (os.environ.get('SSL_CERT_FILE'), '/root/.ccr/ca-bundle.crt'):
        if path and os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


CTX = ssl_context()
credits_left = None


def get(path, **params):
    global credits_left
    params['apiKey'] = os.environ['ODDS_API_KEY']
    url = f'{API}{path}?{urllib.parse.urlencode(params)}'
    with urllib.request.urlopen(url, context=CTX, timeout=30) as r:
        credits_left = r.headers.get('x-requests-remaining', credits_left)
        return json.load(r)


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def avg(xs):
    return round(sum(xs) / len(xs), 3) if xs else None


def summarise(event, league):
    """Average odds across bookmakers, plus the best price and who offers it."""
    home, away = event['home_team'], event['away_team']
    h2h = {'1': [], 'X': [], '2': []}
    best = {}
    totals = {}
    sharp = {}  # book key -> {'1':…, 'X':…, '2':…, 'ou': {line: {'o','u'}}}
    for bk in event.get('bookmakers', []):
        if bk['key'] in SHARP:
            sb = sharp.setdefault(bk['key'], {'title': bk['title'], 'ou': {}})
            for mk in bk.get('markets', []):
                for oc in mk['outcomes']:
                    if mk['key'] == 'h2h':
                        sb['1' if oc['name'] == home else '2' if oc['name'] == away else 'X'] = oc['price']
                    elif mk['key'] == 'totals':
                        sb['ou'].setdefault(str(oc.get('point')), {})['o' if oc['name'] == 'Over' else 'u'] = oc['price']
        for mk in bk.get('markets', []):
            if mk['key'] == 'h2h':
                for oc in mk['outcomes']:
                    k = '1' if oc['name'] == home else '2' if oc['name'] == away else 'X'
                    h2h[k].append(oc['price'])
                    # exchanges quote before commission, so they don't count as the best bookmaker price
                    if bk['key'] not in EXCHANGES and oc['price'] > best.get(k, {}).get('odds', 0):
                        best[k] = {'odds': oc['price'], 'book': bk['title']}
            elif mk['key'] == 'totals':
                for oc in mk['outcomes']:
                    line = str(oc.get('point'))
                    side = 'o' if oc['name'] == 'Over' else 'u'
                    totals.setdefault(line, {'o': [], 'u': []})[side].append(oc['price'])
    if not all(h2h.values()):
        return None
    kick = datetime.datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00'))
    m = {
        'id': f"{league.lower()}-{slug(home)}-{slug(away)}",
        'league': league,
        'kickoff': kick.strftime('%Y-%m-%dT%H:%MZ'),
        'home': home, 'away': away,
        'o1': avg(h2h['1']), 'oX': avg(h2h['X']), 'o2': avg(h2h['2']),
        'best': best,
        'books': len(event.get('bookmakers', [])),
    }
    ou = {line: {'o': avg(v['o']), 'u': avg(v['u'])} for line, v in totals.items() if v['o'] and v['u'] and len(v['o']) >= 2}
    if ou:
        m['ou'] = ou
    for key in SHARP:
        sb = sharp.get(key)
        if sb and all(k in sb for k in ('1', 'X', '2')):
            m['sharp'] = {'book': sb['title'], 'o1': sb['1'], 'oX': sb['X'], 'o2': sb['2'],
                          'ou': {l: v for l, v in sb['ou'].items() if 'o' in v and 'u' in v}}
            break
    return m, kick.astimezone(PARIS).strftime('%Y-%m-%d')


def credits_budget(now, reserve=4):
    """Spread what is left of the monthly quota evenly over the rest of the calendar month."""
    left = int(float(credits_left or 0))
    nxt = (now.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    days_left = max(1, (nxt.date() - now.date()).days)
    return max(0, (left - reserve) // days_left), left


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=10)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    if not os.environ.get('ODDS_API_KEY'):
        sys.exit('ODDS_API_KEY is not set')

    now = datetime.datetime.now(datetime.timezone.utc)
    horizon = now + datetime.timedelta(days=args.days)
    soon_limit = now + datetime.timedelta(hours=48)
    available = {sp['key'] for sp in get('/sports')}  # free call; also reads the credit header
    budget, left = credits_budget(now)
    print(f'credits left: {left}, budget today: {budget}')

    def start(e):
        return datetime.datetime.fromisoformat(e['commence_time'].replace('Z', '+00:00'))

    # Free pass: which leagues have matches in the window, and how soon.
    todo = []
    for i, (sport, league, totals, path) in enumerate(LEAGUES):
        if sport not in available:
            print(f'{league}: not offered by the API -> FALLBACK {path}')
            continue
        try:
            events = [e for e in get(f'/sports/{sport}/events') if now < start(e) < horizon]
        except Exception as e:
            print(f'{league}: events unavailable ({e}) -> FALLBACK {path}')
            continue
        if not events:
            print(f'{league}: no match in window')
            continue
        urgent = any(start(e) < soon_limit for e in events)
        todo.append((0 if urgent else 1, i, sport, league, totals, path))
    todo.sort()

    fresh = {}  # paris date -> list of matches
    priced = set()
    for _, _, sport, league, totals, path in todo:
        cost = 2 if totals else 1
        if cost > budget:
            print(f'{league}: skipped to save credits -> FALLBACK {path}')
            continue
        odds = get(f'/sports/{sport}/odds', regions='eu', markets='h2h,totals' if totals else 'h2h',
                   oddsFormat='decimal', commenceTimeTo=horizon.strftime('%Y-%m-%dT%H:%M:%SZ'))
        budget -= cost
        priced.add(league)
        n = 0
        for ev in odds:
            # in-play prices (e.g. 1.01 / 41 / 51) would distort the model, and started matches are frozen
            if start(ev) <= now:
                continue
            res = summarise(ev, league)
            if res:
                fresh.setdefault(res[1], []).append(res[0]); n += 1
        print(f'{league}: {n} matches priced')

    days_dir = os.path.join(ROOT, 'days')
    os.makedirs(days_dir, exist_ok=True)
    stamp = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    for date, matches in sorted(fresh.items()):
        path = os.path.join(days_dir, f'{date}.json')
        doc = json.load(open(path, encoding='utf8')) if os.path.exists(path) else {'date': date, 'matches': []}
        # Replace only the upcoming matches of leagues priced in this run; started matches
        # (frozen odds, scores) and leagues filled from the fallback stay as they are.
        kept = [m for m in doc['matches']
                if m['league'] not in priced or datetime.datetime.fromisoformat(m['kickoff'].replace('Z', '+00:00')) <= now]
        kept_ids = {m['id'] for m in kept}
        doc['matches'] = sorted(kept + [m for m in matches if m['id'] not in kept_ids], key=lambda m: m['kickoff'])
        doc.update(date=date, updatedAt=stamp, source='The Odds API (moyenne des bookmakers européens)')
        if not args.dry_run:
            with open(path, 'w', encoding='utf8') as f:
                json.dump(doc, f, ensure_ascii=False, indent=1)
        print(f'{date}: {len(doc["matches"])} matches')

    if not args.dry_run:
        dates = sorted(f[:-5] for f in os.listdir(days_dir) if f.endswith('.json'))
        with open(os.path.join(ROOT, 'index.json'), 'w') as f:
            json.dump({'updatedAt': stamp, 'dates': dates}, f, indent=1)
    print(f'credits left: {credits_left}')


if __name__ == '__main__':
    main()
