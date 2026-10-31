#!/usr/bin/env python3
"""Basket/tennis moneyline prices from Winamax France only. No estimated fallback."""
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
                        if out['name'] not in (home, away):continue
                        line, participant = None, ''
                        side = '1' if out['name'] == home else '2'
                        label = 'Victoire ' + out['name']
                    elif family == 'spreads':
                        point = float(out['point'])
                        if out['name'] not in (home, away) or not math.isfinite(point) or abs(point % 1 - .5) > 1e-8:continue
                        side = '1' if out['name'] == home else '2'
                        line, participant = point if side == '1' else -point, ''
                        label = f"{out['name']} {point:+g} {'jeux' if sport == 'tennis' else 'points'}"
                    else:
                        line = float(out['point'])
                        if not math.isfinite(line) or abs(line % 1 - .5) > 1e-8 or out['name'] not in ('Over','Under'):continue
                        if family in ('sets','team_totals') and participant not in (home,away):continue
                        if family == 'sets' and line != .5:continue
                        side = 'over' if out['name'] == 'Over' else 'under'
                        if family == 'sets':
                            label = participant + (' gagne au moins un set' if side == 'over' else ' ne gagne aucun set')
                        else:
                            unit = 'jeux' if sport == 'tennis' else 'points'
                            label = (participant + ' · ' if participant else '') + f"{'Plus' if side == 'over' else 'Moins'} de {line:g} {unit}"
                    group_id = f'{kind}|{participant}|{line}'
                    pair = buckets.setdefault(group_id, {'id':group_id, 'family':family, 'key':kind,
                            'unit':'sets' if family == 'sets' else 'match' if family == 'h2h' else 'games' if sport == 'tennis' else 'points',
                            'line':line, 'participant':participant, 'bookKey':BOOK, 'asOf':stamp, 'outcomes':[]})
                    pair['outcomes'].append({'code':group_id+'|'+side if family!='h2h' else side,
                                            'side':side,'label':label,'odds':price,'participant':participant})
                except (KeyError, ValueError, TypeError, OverflowError):
                    continue
            expected = {'1','2'} if family in ('h2h','spreads') else {'over','under'}
            for pair in buckets.values():
                if len(pair['outcomes']) == 2 and {o['side'] for o in pair['outcomes']} == expected:
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
                if len(outcomes) != 2 or {x['name'] for x in outcomes} != {home, away}:
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
                        'markets': market_groups(event,sport,now)}
    except (KeyError, ValueError, TypeError, OverflowError):
        return None
    return None


def write(sport, status, matches, now, **meta):
    ROOT.mkdir(parents=True, exist_ok=True)
    doc = {'sport': sport, 'bookKey': BOOK, 'updatedAt': now.isoformat(),
           'status': status, 'matches': sorted(matches, key=lambda m: m['kickoff']), **meta}
    (ROOT / f'{sport}.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--max-credits', type=int, default=18)
    p.add_argument('--days', type=int, default=7)
    args = p.parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    if not os.environ.get('ODDS_API_KEY'):
        for sport in ['basket', 'tennis']:
            write(sport, 'unconfigured', [], now)
        print('Connexion aux cotes non configurée : aucun prix inventé.')
        return
    try:
        available = api.get('/sports')
        budget = min(max(0, args.max_credits), api.credits_budget(now)[0])
        queues = {'basket': [], 'tennis': []}
        for item in available:
            key = item['key']
            sport = 'basket' if key.startswith('basketball_') else 'tennis' if key.startswith('tennis_') else None
            if not sport or item.get('has_outrights') or item.get('active') is False:
                continue
            events = api.get(f'/sports/{key}/events')
            future = [dt.datetime.fromisoformat(e['commence_time'].replace('Z', '+00:00')) for e in events]
            future = [d for d in future if now < d <= now + dt.timedelta(days=args.days)]
            if future:
                queues[sport].append((min(future), key, item.get('title', key)))
        for queue in queues.values():
            queue.sort()
        matches = {'basket': [], 'tennis': []}
        queried = {'basket': 0, 'tennis': 0}
        offered = {k: len(v) for k, v in queues.items()}
        enrichment_budget = min(2, max(0, budget - 2))
        budget -= enrichment_budget
        while budget > 0 and any(queues.values()):
            for sport in ['basket', 'tennis']:
                if not queues[sport] or budget <= 0:
                    continue
                _, key, title = queues[sport].pop(0)
                core_markets = 'h2h,spreads,totals' if budget >= 3 else 'h2h'
                params = dict(bookmakers=BOOK, markets=core_markets, oddsFormat='decimal',
                              commenceTimeTo=(now + dt.timedelta(days=args.days)).strftime('%Y-%m-%dT%H:%M:%SZ'))
                try:
                    events = api.get(f'/sports/{key}/odds', **params)
                except HTTPError as exc:
                    if exc.code not in (400, 403, 422) or core_markets == 'h2h':
                        raise
                    core_markets = params['markets'] = 'h2h'
                    events = api.get(f'/sports/{key}/odds', **params)
                budget -= len(core_markets.split(','))
                queried[sport] += 1
                for event in events:
                    m = extract(event, sport, title, now)
                    if m:
                        m['sportKey'] = key
                        m['eventId'] = event['id']
                        matches[sport].append(m)
        # Discover additional markets instead of requesting guessed market names.
        remaining = budget + enrichment_budget
        for m in sorted(matches['tennis'] + matches['basket'], key=lambda m:(m['sport']!='tennis',m['kickoff']))[:8]:
            m['availableMarkets'] = []
            try:
                listing = api.get(f"/sports/{m['sportKey']}/events/{m['eventId']}/markets", bookmakers=BOOK)
                keys = {x['key'] for b in listing.get('bookmakers',[]) if b.get('key')==BOOK for x in b.get('markets',[])}
                m['availableMarkets'] = sorted(keys)
                wanted = [k for k in ['player_sets_won','team_totals','alternate_spreads','alternate_totals'] if k in keys]
                wanted = wanted[:remaining]
                if wanted:
                    event = api.get(f"/sports/{m['sportKey']}/events/{m['eventId']}/odds", bookmakers=BOOK,markets=','.join(wanted),oddsFormat='decimal')
                    remaining -= len(wanted)
                    additions = market_groups(event,m['sport'],now)
                    existing = {g['id'] for g in m['markets']}
                    m['markets'].extend(g for g in additions if g['id'] not in existing)
            except Exception:
                # Optional market lookup must never erase the standard prices.
                m['marketLookupUnavailable'] = True
        for sport in ['basket', 'tennis']:
            unique = {m['id']: m for m in matches[sport]}
            write(sport, 'ok' if queried[sport] or not offered[sport] else 'quota', list(unique.values()), now,
                  leaguesQueried=queried[sport], leaguesAvailable=offered[sport], partial=bool(queues[sport]))
            print(f'{sport}: {len(unique)} rencontres Winamax, {queried[sport]} compétitions interrogées')
    except Exception:
        # Never log request URLs: they carry the API key. Never keep old prices as fresh.
        for sport in ['basket', 'tennis']:
            write(sport, 'unavailable', [], now)
        print('Source de cotes indisponible ; aucune ancienne cote présentée comme actuelle.')
        raise SystemExit(1)


if __name__ == '__main__':
    main()
