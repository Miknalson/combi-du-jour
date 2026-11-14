#!/usr/bin/env python3
"""Football/basket/tennis prices from Winamax France only. No estimated fallback."""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
from urllib.error import HTTPError
import update_odds as api

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'sports'
BOOK = 'winamax_fr'
SPORTS = ('football', 'basket', 'tennis')
FOOTBALL_KEYS = {x[0] for x in api.LEAGUES}


def is_uefa(key, title=''):
    return key.startswith('soccer_') and ('_uefa_' in key or 'uefa' in title.casefold() or key.endswith('_qualifiers_europe'))


def football_code(key):
    return next((code for sport,code,*_ in api.LEAGUES if sport==key), 'UEFA_'+key.removeprefix('soccer_').removeprefix('uefa_').upper())


def publish_football_days(matches, now):
    """Feed the football page with the same real FR prices as Safe; preserve scores and IDs."""
    directory=ROOT.parent/'days'
    directory.mkdir(parents=True,exist_ok=True)
    changed=False
    for m in matches:
        if m.get('bookKey')!=BOOK:continue
        kickoff=dt.datetime.fromisoformat(m['kickoff'].replace('Z','+00:00'))
        stamp=dt.datetime.fromisoformat(m['asOf'].replace('Z','+00:00'))
        if kickoff<=now or not 0<=(now-stamp).total_seconds()<=86400:continue
        date=kickoff.astimezone(api.PARIS).strftime('%Y-%m-%d')
        path=directory/(date+'.json')
        doc=json.loads(path.read_text()) if path.exists() else {'date':date,'matches':[]}
        identity=lambda v:(api.slug(v['home']),api.slug(v['away']),dt.datetime.fromisoformat(v['kickoff'].replace('Z','+00:00')))
        target=next((old for old in doc['matches'] if identity(old)==identity(m)),None)
        if target is None:
            target={'id':m['id'],'league':m.get('leagueCode') or (football_code(m['sportKey']) if m.get('sportKey') else m['league']),
                    'home':m['home'],'away':m['away'],'kickoff':m['kickoff'],'quoteBasis':'winamax-only',
                    'o1':m['o1'],'oX':m['oX'],'o2':m['o2'],'books':1}
            doc['matches'].append(target)
        target['leagueTitle']=m['league']
        target['mine']={'book':'Winamax France','bookKey':BOOK,'asOf':m['asOf'],
                        'o1':m['o1'],'oX':m['oX'],'o2':m['o2'],'ou':{}}
        for group in m.get('markets',[]):
            if group['family']=='totals':
                prices={o['side']:o['odds'] for o in group['outcomes']}
                if 'over' in prices and 'under' in prices:
                    target['mine']['ou'][str(group['line'])]={'o':prices['over'],'u':prices['under']}
        doc['matches'].sort(key=lambda v:v['kickoff'])
        doc.update(updatedAt=now.isoformat(),source='Winamax France et archives des marchés')
        path.write_text(json.dumps(doc,ensure_ascii=False,indent=1)+'\n');changed=True
    if changed:
        dates=sorted(p.stem for p in directory.glob('????-??-??.json'))
        (ROOT.parent/'index.json').write_text(json.dumps({'updatedAt':now.isoformat(),'dates':dates},indent=1)+'\n')


def market_groups(event, sport, now):
    """Only paired, timestamped Winamax quotes; no prices inferred from another market."""
    home, away = event['home_team'], event['away_team']
    groups = []
    for book in event.get('bookmakers', []):
        if book.get('key') != BOOK:
            continue
        for mk in book.get('markets', []):
            kind = mk.get('key')
            family = {'h2h':'h2h', 'spreads':'spreads', 'alternate_spreads':'spreads',
                      'totals':'totals', 'alternate_totals':'totals',
                      'player_sets_won':'sets', 'team_totals':'team_totals',
                      'alternate_team_totals':'team_totals'}.get(kind)
            if not family or (family == 'sets' and sport != 'tennis'):
                continue
            stamp = mk.get('last_update') or book.get('last_update')
            try:
                age = (now - dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))).total_seconds()
                if not 0 <= age <= 3600:
                    continue
            except (TypeError, ValueError, AttributeError):
                continue
            buckets = {}
            for out in mk.get('outcomes', []):
                try:
                    price = float(out['price'])
                    if not math.isfinite(price) or price <= 1:
                        continue
                    participant = out.get('description', '')
                    if family == 'h2h':
                        if out['name'] not in ((home, away, 'Draw') if sport == 'football' else (home, away)):continue
                        line, participant = None, ''
                        side = '1' if out['name'] == home else '2' if out['name'] == away else 'X'
                        label = 'Match nul' if side == 'X' else 'Victoire ' + out['name']
                    elif family == 'spreads':
                        point = float(out['point'])
                        if out['name'] not in (home, away) or not math.isfinite(point) or abs(point % 1 - .5) > 1e-8:continue
                        side = '1' if out['name'] == home else '2'
                        line, participant = point if side == '1' else -point, ''
                        label = f"{out['name']} {point:+g} {'jeux' if sport == 'tennis' else 'buts' if sport == 'football' else 'points'}"
                    else:
                        line = float(out['point'])
                        if not math.isfinite(line) or abs(line % 1 - .5) > 1e-8 or out['name'] not in ('Over','Under'):continue
                        if family in ('sets','team_totals') and participant not in (home,away):continue
                        if family == 'sets' and line != .5:continue
                        side = 'over' if out['name'] == 'Over' else 'under'
                        if family == 'sets':
                            label = participant + (' gagne au moins un set' if side == 'over' else ' ne gagne aucun set')
                        else:
                            unit = 'jeux' if sport == 'tennis' else 'buts' if sport == 'football' else 'points'
                            label = (participant + ' · ' if participant else '') + f"{'Plus' if side == 'over' else 'Moins'} de {line:g} {unit}"
                    group_id = f'{kind}|{participant}|{line}'
                    pair = buckets.setdefault(group_id, {'id':group_id, 'family':family, 'key':kind,
                            'unit':'sets' if family == 'sets' else 'match' if family == 'h2h' else 'games' if sport == 'tennis' else 'goals' if sport == 'football' else 'points',
                            'line':line, 'participant':participant, 'bookKey':BOOK, 'asOf':stamp, 'outcomes':[]})
                    pair['outcomes'].append({'code':group_id+'|'+side if family!='h2h' else side,
                                            'side':side,'label':label,'odds':price,'participant':participant})
                except (KeyError, ValueError, TypeError, OverflowError):
                    continue
            expected = {'1','X','2'} if family == 'h2h' and sport == 'football' else {'1','2'} if family in ('h2h','spreads') else {'over','under'}
            for pair in buckets.values():
                if len(pair['outcomes']) == len(expected) and {o['side'] for o in pair['outcomes']} == expected:
                    pair['outcomes'].sort(key=lambda o:o['side'])
                    groups.append(pair)
    return groups


def extract(event, sport, league, now):
    try:
        kickoff = dt.datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00'))
        if kickoff <= now:
            return None
        home, away = event['home_team'], event['away_team']
        for book in event.get('bookmakers', []):
            if book.get('key') != BOOK:
                continue
            for market in book.get('markets', []):
                if market.get('key') != 'h2h':
                    continue
                outcomes = market.get('outcomes', [])
                expected = {home, away, 'Draw'} if sport == 'football' else {home, away}
                if len(outcomes) != len(expected) or {x['name'] for x in outcomes} != expected:
                    continue
                prices = {x['name']: float(x['price']) for x in outcomes}
                if not all(math.isfinite(x) and x > 1 for x in prices.values()):
                    continue
                stamp = market.get('last_update') or book.get('last_update')
                updated = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                if not 0 <= (now - updated).total_seconds() <= 3600:
                    continue
                return {'id': sport + '-' + event['id'], 'sport': sport, 'league': league,
                        'kickoff': event['commence_time'], 'home': home, 'away': away,
                        'bookKey': BOOK, 'book': 'Winamax France', 'asOf': stamp,
                        'market': 'h2h', 'o1': prices[home], 'o2': prices[away],
                        **({'oX': prices['Draw']} if sport == 'football' else {}),
                        'markets': market_groups(event,sport,now)}
    except (KeyError, ValueError, TypeError, OverflowError):
        return None
    return None


def enrich_markets(matches, remaining, now, max_events=8):
    """Check tennis AND basket before checking the next event of either sport."""
    queues = {sport: sorted(matches.get(sport, []), key=lambda m:m['kickoff']) for sport in SPORTS}
    checked = 0
    while checked < max_events and any(queues.values()):
        for sport in ('tennis', 'basket', 'football'):
            if not queues[sport] or checked >= max_events:
                continue
            m = queues[sport].pop(0)
            checked += 1
            m['availableMarkets'] = []
            try:
                listing = api.get(f"/sports/{m['sportKey']}/events/{m['eventId']}/markets", bookmakers=BOOK)
                keys = {x['key'] for b in listing.get('bookmakers',[]) if b.get('key')==BOOK for x in b.get('markets',[])}
                m['availableMarkets'] = sorted(keys)
                priorities = (['player_sets_won','spreads','totals','alternate_spreads','alternate_totals'] if sport == 'tennis'
                              else ['spreads','totals','team_totals','alternate_spreads','alternate_totals','alternate_team_totals'])
                existing_keys = {g.get('key',g['family']) for g in m['markets']}
                wanted = [key for key in priorities if key in keys and key not in existing_keys]
                m['uncollectedMarkets'] = wanted[:]
                # One optional price call per event in this pass leaves room for the other sports.
                wanted = wanted[:min(1,remaining)]
                if wanted:
                    remaining -= len(wanted)
                    event = api.get(f"/sports/{m['sportKey']}/events/{m['eventId']}/odds", bookmakers=BOOK,
                                    markets=','.join(wanted),oddsFormat='decimal')
                    additions = market_groups(event,sport,now)
                    existing = {g['id'] for g in m['markets']}
                    m['markets'].extend(g for g in additions if g['id'] not in existing)
                    collected = {g.get('key',g['family']) for g in m['markets']}
                    m['uncollectedMarkets'] = [key for key in m['uncollectedMarkets'] if key not in collected]
            except Exception:
                m['marketLookupUnavailable'] = True
    return remaining


def archived_football(now, days, excluded_keys=()):
    """Reuse only real FR quotes in unqueried leagues, never alter their timestamps."""
    records = []
    codes = {code: key for key, code, *_ in api.LEAGUES}
    directory = ROOT.parent / 'days'
    for path in sorted(directory.glob('????-??-??.json')):
        try:
            doc = json.loads(path.read_text())
            for m in doc.get('matches', []):
                b = m.get('mine', {})
                if b.get('bookKey') != BOOK or codes.get(m.get('league')) in excluded_keys:
                    continue
                kickoff = dt.datetime.fromisoformat(m['kickoff'].replace('Z', '+00:00'))
                stamp = dt.datetime.fromisoformat(b['asOf'].replace('Z', '+00:00'))
                if not now < kickoff <= now + dt.timedelta(days=days) or not 0 <= (now-stamp).total_seconds() <= 86400:
                    continue
                prices = [float(b['o'+k]) for k in ('1','X','2')]
                if not all(math.isfinite(p) and p > 1 for p in prices):
                    continue
                outcomes = [{'code': k, 'side': k, 'odds': price,
                             'label': 'Match nul' if k == 'X' else 'Victoire '+m['home' if k == '1' else 'away']}
                            for k, price in zip(('1','X','2'), prices)]
                records.append({'id': m['id'], 'sport':'football', 'league':m['league'],
                                'kickoff':m['kickoff'], 'home':m['home'], 'away':m['away'],
                                'bookKey':BOOK, 'book':'Winamax France', 'asOf':b['asOf'],
                                'market':'h2h', 'o1':prices[0], 'oX':prices[1], 'o2':prices[2],
                                'markets':[{'id':'h2h|archive', 'family':'h2h', 'unit':'match',
                                            'bookKey':BOOK, 'asOf':b['asOf'], 'quoteSource':'api-archive',
                                            'outcomes':outcomes}]})
        except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
            continue
    return records


def write(sport, status, matches, now, **meta):
    ROOT.mkdir(parents=True, exist_ok=True)
    doc = {'sport': sport, 'bookKey': BOOK, 'updatedAt': now.isoformat(),
           'status': status, 'matches': sorted(matches, key=lambda m: m['kickoff']), **meta}
    (ROOT / f'{sport}.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--max-credits', type=int, default=18)
    p.add_argument('--days', type=int, default=7)
    p.add_argument('--football-days', type=int, default=14)
    args = p.parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    if not os.environ.get('ODDS_API_KEY'):
        for sport in SPORTS:
            write(sport, 'unconfigured', [], now)
        print('Connexion aux cotes non configurée : aucun prix inventé.')
        return
    try:
        available = api.get('/sports')
        budget = min(max(0, args.max_credits), api.credits_budget(now)[0])
        queues = {sport: [] for sport in SPORTS}
        fixtures=[]
        discovery_errors=[]
        for item in available:
            key = item['key']
            sport = 'basket' if key.startswith('basketball_') else 'tennis' if key.startswith('tennis_') else 'football' if key in FOOTBALL_KEYS or is_uefa(key,item.get('title','')) else None
            if not sport or item.get('has_outrights') or item.get('active') is False:
                continue
            try:
                events = api.get(f'/sports/{key}/events')
            except Exception:
                discovery_errors.append(key)
                continue
            horizon_days=args.football_days if sport=='football' else args.days
            future = [dt.datetime.fromisoformat(e['commence_time'].replace('Z', '+00:00')) for e in events]
            future = [d for d in future if now < d <= now + dt.timedelta(days=horizon_days)]
            if sport=='football' and is_uefa(key,item.get('title','')):
                fixtures.extend({'id':'football-'+e['id'],'sportKey':key,'leagueCode':football_code(key),
                                 'league':item.get('title',key),'home':e['home_team'],'away':e['away_team'],
                                 'kickoff':e['commence_time']} for e in events
                                if dt.datetime.fromisoformat(e['commence_time'].replace('Z','+00:00')) in future)
            if future:
                queues[sport].append((min(future), key, item.get('title', key)))
        for sport,queue in queues.items():
            queue.sort(key=lambda row:(0 if sport=='football' and is_uefa(row[1],row[2]) else 1,row[0],row[1]))
        matches = {sport: [] for sport in SPORTS}
        queried = {sport: 0 for sport in SPORTS}
        offered = {k: len(v) for k, v in queues.items()}
        queried_keys = set()
        enrichment_budget = min(2, max(0, budget - 2))
        budget -= enrichment_budget
        while budget > 0 and any(queues.values()):
            for sport in SPORTS:
                if not queues[sport] or budget <= 0:
                    continue
                _, key, title = queues[sport].pop(0)
                core_markets = 'h2h' if sport=='football' and is_uefa(key,title) else 'h2h,spreads,totals' if budget >= 3 else 'h2h'
                params = dict(bookmakers=BOOK, markets=core_markets, oddsFormat='decimal',
                              commenceTimeTo=(now + dt.timedelta(days=args.football_days if sport=='football' else args.days)).strftime('%Y-%m-%dT%H:%M:%SZ'))
                try:
                    events = api.get(f'/sports/{key}/odds', **params)
                except HTTPError as exc:
                    if exc.code not in (400, 403, 422) or core_markets == 'h2h':
                        raise
                    core_markets = params['markets'] = 'h2h'
                    events = api.get(f'/sports/{key}/odds', **params)
                budget -= len(core_markets.split(','))
                queried[sport] += 1
                queried_keys.add(key)
                for event in events:
                    m = extract(event, sport, title, now)
                    if m:
                        if sport=='football':m['leagueCode']=football_code(key)
                        m['sportKey'] = key
                        m['eventId'] = event['id']
                        matches[sport].append(m)
        # Discover the actual market names, alternating sports rather than exhausting tennis first.
        enrich_markets(matches, budget + enrichment_budget, now)
        if queried['football'] and queues['football']:
            previous = archived_football(now, args.football_days, queried_keys)
            # Match identity uses the real kickoff instant, not its string formatting.
            identity = lambda m: (m['home'].casefold(), m['away'].casefold(), dt.datetime.fromisoformat(m['kickoff'].replace('Z','+00:00')))
            current = {identity(m) for m in matches['football']}
            matches['football'].extend(m for m in previous if identity(m) not in current)
        publish_football_days(matches['football'],now)
        for sport in SPORTS:
            unique = {m['id']: m for m in matches[sport]}
            calendar={'fixtures':sorted(fixtures,key=lambda f:f['kickoff']),'calendarStatus':'partial' if discovery_errors else 'ok','horizonDays':args.football_days} if sport=='football' else {}
            write(sport, 'ok' if queried[sport] or not offered[sport] else 'quota', list(unique.values()), now,
                  leaguesQueried=queried[sport], leaguesAvailable=offered[sport], partial=bool(queues[sport]),**calendar)
            print(f'{sport}: {len(unique)} rencontres Winamax, {queried[sport]} compétitions interrogées')
    except Exception:
        # Never log request URLs: they carry the API key. Never keep old prices as fresh.
        for sport in SPORTS:
            write(sport, 'unavailable', [], now)
        print('Source de cotes indisponible ; aucune ancienne cote présentée comme actuelle.')
        raise SystemExit(1)


if __name__ == '__main__':
    main()

