#!/usr/bin/env python3
"""Cheap provider health check. Never prints URLs, credentials or raw error messages."""
import datetime as dt
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
import update_odds as api

ROOT = Path(__file__).resolve().parents[1] / 'data'
MESSAGES = {
    'unconfigured': 'Clé de cotes absente dans GitHub Actions.',
    'quota': 'Le quota du fournisseur de cotes est épuisé. Aucun nouveau ticket ni alerte ne peut être créé sans prix frais.',
    'unauthorized': 'La clé de cotes est refusée par le fournisseur. Vérifier le secret GitHub ODDS_API_.',
    'rate_limited': 'Le fournisseur limite temporairement les requêtes. Une nouvelle collecte pourra réessayer.',
    'unavailable': 'Le fournisseur de cotes est momentanément inaccessible.',
    'ok': 'Connexion au fournisseur de cotes disponible.',
}
def error_info(exc):
    code = None
    if isinstance(exc, HTTPError):
        try:
            payload = json.loads(exc.read(8192))
            candidate = payload.get('error_code', '')
            if candidate in {'OUT_OF_USAGE_CREDITS', 'INVALID_API_KEY', 'MISSING_API_KEY', 'INVALID_KEY', 'RATE_LIMIT_EXCEEDED'}:
                code = candidate
        except Exception:
            pass
        status = 'quota' if code == 'OUT_OF_USAGE_CREDITS' else 'unauthorized' if exc.code in (401, 403) else 'rate_limited' if exc.code == 429 else 'unavailable'
        return {'status': status, 'httpStatus': exc.code, 'providerCode': code}
    return {'status': 'unavailable', 'errorType': 'network' if isinstance(exc, (URLError, TimeoutError)) else 'response'}

def main():
    now = dt.datetime.now(dt.timezone.utc)
    result = {'updatedAt': now.isoformat(), 'stage': 'provider'}
    if not os.environ.get('ODDS_API_KEY'):
        result['status'] = 'unconfigured'
    else:
        try:
            sports = api.get('/sports', all='true')
            if not isinstance(sports, list):
                raise ValueError('Unexpected provider response')
            result.update(status='ok', competitions=len(sports), creditsRemaining=int(float(api.credits_left)) if api.credits_left is not None else None)
            if result['creditsRemaining'] == 0:
                result['status'] = 'quota'
        except Exception as exc:
            result.update(error_info(exc))
    result['message'] = MESSAGES[result['status']]
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'collection-health.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a') as f:
            f.write('ready=' + ('true' if result['status'] == 'ok' else 'false') + '\n')
    print(result['message'])
    if result.get('providerCode'):
        print('Code fournisseur :', result['providerCode'])
    return result

if __name__ == '__main__':
    main()
