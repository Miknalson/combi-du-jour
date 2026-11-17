#!/usr/bin/env python3
"""Run the frozen collector, retry transient reads, retain calendar metadata on failure."""
import datetime as dt
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
import update_sports as collector
import check_quotes as health


def retry_get(get, path, **params):
    for attempt in range(3):
        try:
            return get(path, **params)
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            try:
                delay = float(exc.headers.get('Retry-After', 2 ** attempt))
            except (AttributeError, TypeError, ValueError):
                delay = 2 ** attempt
            if delay > 10:
                raise
            time.sleep(max(0, delay))
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def run():
    root = collector.ROOT
    originals = {}
    for sport in collector.SPORTS:
        try:
            originals[sport] = json.loads((root / (sport + '.json')).read_text())
        except (OSError, ValueError):
            pass
    previous = collector.api.get
    request_costs = {}
    metadata_cache = {}
    daily_budget = [None]
    deferred = [0]
    def fetch(path, **params):
        # Market inventory reads must not consume the tiny allowance reserved for prices.
        # The frozen collector already treats unavailable inventory as unknown and checks
        # the actual bookmaker prices instead. Never invent a bookmaker/market response.
        key = (path, tuple(sorted(params.items())))
        if path.endswith('/markets'):
            if key in metadata_cache:
                return metadata_cache[key]
            if daily_budget[0] is not None and daily_budget[0] <= 3:
                deferred[0] += 1
                raise HTTPError('inventory-deferred', 429, 'Inventory deferred within quote budget', {'Retry-After':'11'}, None)
        before = collector.api.credits_left
        result = retry_get(previous, path, **params)
        after = collector.api.credits_left
        kind = 'market_inventory' if path.endswith('/markets') else 'prices' if path.endswith('/odds') else 'calendar' if path.endswith('/events') else 'catalog'
        cost = max(0, int(float(before))-int(float(after))) if before is not None and after is not None else 0
        request_costs[kind] = request_costs.get(kind, 0) + cost
        if path == '/sports':
            daily_budget[0] = collector.api.credits_budget(dt.datetime.now(dt.timezone.utc))[0]
        if path.endswith('/markets'):
            metadata_cache[key] = result
        return result
    collector.api.get = fetch
    error = None
    exit_code = 0
    try:
        collector.main()
    except SystemExit as exc:
        exit_code = int(exc.code or 0)
        if exit_code:
            error = exc.__context__ or exc
    except Exception as exc:
        exit_code, error = 1, exc
    finally:
        collector.api.get = previous
    now = dt.datetime.now(dt.timezone.utc)
    rows = []
    for sport in collector.SPORTS:
        path = root / (sport + '.json')
        try:
            doc = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not doc.get('matches'):
            old = originals.get(sport, {})
            # Retain only event metadata, never relabel an old quote as fresh.
            fixtures = []
            for event in old.get('fixtures', []) + old.get('matches', []):
                try:
                    if dt.datetime.fromisoformat(event['kickoff'].replace('Z', '+00:00')) <= now:
                        continue
                    fixtures.append({k: event[k] for k in ['id','sportKey','league','leagueCode','home','away','kickoff','gender'] if k in event})
                except (KeyError, ValueError, TypeError):
                    continue
            if fixtures:
                doc['fixtures'] = list({(m['home'],m['away'],m['kickoff']):m for m in fixtures + doc.get('fixtures',[])}.values())
                if not doc.get('calendarStatus'):doc['calendarStatus'] = 'cached'
                path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
        rows.append({'sport':sport,'status':doc['status'],'matches':len(doc.get('matches',[])),'updatedAt':doc.get('updatedAt'),'partial':bool(doc.get('partial'))})
    result = {'updatedAt':now.isoformat(),'stage':'collection','sports':rows,'requestCredits':request_costs,'deferredMarketInventories':deferred[0],'creditsRemaining':int(float(collector.api.credits_left)) if collector.api.credits_left is not None else None}
    if error:
        result.update(health.error_info(error))
        result['errorType'] = type(error).__name__
        result['message'] = health.MESSAGES[result['status']]
    else:
        result['status'] = 'partial' if any(r['status'] in ['quota','unavailable'] or r['partial'] for r in rows) else 'ok'
        result['message'] = 'Collecte partielle : certains sports ou compétitions n’ont pas de cotes disponibles dans le budget de requêtes.' if result['status']=='partial' else 'Collecte des cotes terminée.'
    (root.parent/'collection-health.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(result['message'])
    if result.get('providerCode'):
        print('Code fournisseur :',result['providerCode'])
    if result.get('errorType'):
        print('Type d’erreur :',result['errorType'])
    return exit_code

if __name__ == '__main__':
    raise SystemExit(run())
