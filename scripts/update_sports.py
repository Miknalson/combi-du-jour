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
                        'market': 'h2h', 'o1': prices[home], 'o2': prices[away]}
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
    p.add_argument('--max-credits', type=int, default=6)
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
        while budget > 0 and any(queues.values()):
            for sport in ['basket', 'tennis']:
                if not queues[sport] or budget <= 0:
                    continue
                _, key, title = queues[sport].pop(0)
                events = api.get(f'/sports/{key}/odds', bookmakers=BOOK, markets='h2h',
                                 oddsFormat='decimal', commenceTimeTo=(now + dt.timedelta(days=args.days)).strftime('%Y-%m-%dT%H:%M:%SZ'))
                budget -= 1
                queried[sport] += 1
                for event in events:
                    m = extract(event, sport, title, now)
                    if m:
                        matches[sport].append(m)
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
