#!/usr/bin/env python3
"""Fetch upcoming odds from The Odds API and merge them into data/days/*.json.

Needs ODDS_API_KEY in the environment and network access to api.the-odds-api.com.
Usage: python3 scripts/update_odds.py [--days 10] [--dry-run]

Credit use: the events listing is free; odds cost 2 credits per league (h2h + totals,
region eu), and a league is only priced when it has a match in the window.
"""
import argparse, datetime, json, os, re, ssl, sys, unicodedata, urllib.parse, urllib.request, zoneinfo

API = 'https://api.the-odds-api.com/v4'
PARIS = zoneinfo.ZoneInfo('Europe/Paris')
LEAGUES = {
    'soccer_epl': 'PL',
    'soccer_spain_la_liga': 'LIGA',
    'soccer_italy_serie_a': 'SA',
    'soccer_germany_bundesliga': 'BL',
    'soccer_france_ligue_one': 'L1',
    'soccer_netherlands_eredivisie': 'ERE',
    'soccer_portugal_primeira_liga': 'POR',
    'soccer_uefa_champs_league': 'UCL',
    'soccer_uefa_europa_league': 'UEL',
    'soccer_uefa_europa_conference_league': 'UECL',
}
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
    for bk in event.get('bookmakers', []):
        for mk in bk.get('markets', []):
            if mk['key'] == 'h2h':
                for oc in mk['outcomes']:
                    k = '1' if oc['name'] == home else '2' if oc['name'] == away else 'X'
                    h2h[k].append(oc['price'])
                    if oc['price'] > best.get(k, {}).get('odds', 0):
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
    return m, kick.astimezone(PARIS).strftime('%Y-%m-%d')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=10)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    if not os.environ.get('ODDS_API_KEY'):
        sys.exit('ODDS_API_KEY is not set')

    now = datetime.datetime.now(datetime.timezone.utc)
    horizon = now + datetime.timedelta(days=args.days)
    fresh = {}  # paris date -> list of matches
    for sport, league in LEAGUES.items():
        try:
            events = get(f'/sports/{sport}/events')
        except Exception as e:  # league out of season or unknown key
            print(f'{league}: events unavailable ({e})')
            continue
        soon = [e for e in events if now < datetime.datetime.fromisoformat(e['commence_time'].replace('Z', '+00:00')) < horizon]
        if not soon:
            print(f'{league}: no match in window')
            continue
        odds = get(f'/sports/{sport}/odds', regions='eu', markets='h2h,totals', oddsFormat='decimal',
                   commenceTimeTo=horizon.strftime('%Y-%m-%dT%H:%M:%SZ'))
        n = 0
        for ev in odds:
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
        # keep matches that already kicked off (their odds and scores are frozen); replace the rest
        kept = [m for m in doc['matches'] if datetime.datetime.fromisoformat(m['kickoff'].replace('Z', '+00:00')) <= now]
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
