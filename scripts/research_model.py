#!/usr/bin/env python3
"""Calibrage chronologique des probabilités 1N2 ; aucune optimisation sur le test."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

import numpy as np
import pandas as pd
from scipy.optimize import minimize

REVISION = '279978313f9c16a210fa80e8986fa22f0f866fba'
FILES = {'england': 'premier-league', 'france': 'ligue-1', 'germany': 'bundesliga',
         'italy': 'serie-a', 'spain': 'laliga'}
LEAGUES = {'england': 'PL', 'france': 'L1', 'germany': 'BL', 'italy': 'SA', 'spain': 'LIGA'}
# Choix fixés avant lecture de la période de test.
TRAIN_END = '2019-07-01'
VALID_END = '2022-07-01'
HISTORY_SHA256 = {'PL': '974c3832901d87bc852dfbff3f6a392959eddd97aa69e214f382c63431c50b46', 'L1': 'dfc4d57c4794ecbd7ead051897a3d886ba4978b56c6f2fa5656e17ef42ed367c', 'BL': '857b5e4cc3eace5f34b9beb709003e57993f509089da70f3793c2cb7edc64d0a', 'SA': '50f32bd7f7d3570e2f609f809736166d5519f49a827ce00145c3dba300e94df9', 'LIGA': '4b71934067f9e349e96a31df8ff312ff3d323ce95423560e3fdc655ae2df4008'}
MIN_SAMPLE = 300
HAIRCUT = .03
MIN_EDGE = .05


def power_probabilities(odds):
    inv = 1 / np.asarray(odds, dtype=float)
    lo, hi = np.full(len(inv), .05), np.full(len(inv), 8.)
    for _ in range(70):
        mid = (lo + hi) / 2
        higher = (inv ** mid[:, None]).sum(axis=1) > 1
        lo = np.where(higher, mid, lo)
        hi = np.where(higher, hi, mid)
    p = inv ** ((lo + hi) / 2)[:, None]
    return p / p.sum(axis=1)[:, None]


def calibrate(p, theta):
    temperature, home_bias, draw_bias = theta
    logits = np.log(np.clip(p, 1e-12, 1)) / temperature + [home_bias, draw_bias, 0]
    logits -= logits.max(axis=1)[:, None]
    q = np.exp(logits)
    return q / q.sum(axis=1)[:, None]


def logloss(p, y):
    return float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1)).mean())


def metrics(p, y):
    onehot = np.eye(3)[y]
    return {'matches': len(y), 'logLoss': logloss(p, y),
            'brier': float(((p - onehot) ** 2).sum(axis=1).mean()),
            'accuracy': float((p.argmax(axis=1) == y).mean())}


def load_history(cache):
    frames, provenance = [], []
    for country, filename in FILES.items():
        url = f'https://raw.githubusercontent.com/nm2890/football-data/{REVISION}/data/{country}/{filename}.csv'
        path = cache / f'{country}.csv'
        if not path.exists():
            with urllib.request.urlopen(url, timeout=60) as r:
                path.write_bytes(r.read())
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != HISTORY_SHA256[LEAGUES[country]]:
            raise ValueError(f'Historique non conforme à la révision figée : {path}')
        provenance.append({'league': LEAGUES[country], 'url': url,
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        data = pd.read_csv(path)
        data['leagueCode'] = LEAGUES[country]
        frames.append(data)
    df = pd.concat(frames, ignore_index=True)
    df['Date'] = pd.to_datetime(df.Date, errors='coerce')
    columns = ['home_open', 'draw_open', 'away_open', 'FTHG', 'FTAG']
    for column in columns:
        df[column] = pd.to_numeric(df[column], errors='coerce')
    raw_count = len(df)
    df = df.dropna(subset=['Date'] + columns)
    df = df[(df[columns[:3]] > 1).all(axis=1) & (df[columns[:3]] < 1000).all(axis=1)]
    df = df[(df.FTHG >= 0) & (df.FTAG >= 0) & (df.FTHG % 1 == 0) & (df.FTAG % 1 == 0)]
    # Un marché moyen sous la parité ou à marge extrême n’est pas un prix exploitable.
    margin = (1 / df[columns[:3]]).sum(axis=1)
    df = df[(margin >= 1) & (margin <= 1.25)]
    df = df.drop_duplicates(['leagueCode', 'Date', 'HomeTeam', 'AwayTeam']).sort_values('Date').reset_index(drop=True)
    df['outcome'] = np.where(df.FTHG > df.FTAG, 0, np.where(df.FTHG == df.FTAG, 1, 2))
    return df, provenance, raw_count


def rolling_goals(df):
    """Forces domicile/extérieur calculées uniquement avec les scores des jours précédents."""
    states, leagues = {}, {}
    lambdas = np.empty((len(df), 2))
    def decay(state, day, half_life):
        if state is None:
            return np.array([0., 0., 0., day], dtype=float)
        result = state.copy()
        result[:3] *= 2 ** (-(day - result[3]) / half_life)
        result[3] = day
        return result
    for date, group in df.groupby(df.Date.dt.normalize(), sort=True):
        day = date.toordinal()
        pending = []
        for row in group.itertuples():
            league = decay(leagues.get(row.leagueCode), day, 365)
            home_mean = (league[1] + 150) / (league[0] + 100)
            away_mean = (league[2] + 120) / (league[0] + 100)
            home = decay(states.get((row.leagueCode, row.HomeTeam, 'home')), day, 180)
            away = decay(states.get((row.leagueCode, row.AwayTeam, 'away')), day, 180)
            home_attack = (home[1] + 10 * home_mean) / (home[0] + 10) / home_mean
            away_defence = (away[2] + 10 * home_mean) / (away[0] + 10) / home_mean
            away_attack = (away[1] + 10 * away_mean) / (away[0] + 10) / away_mean
            home_defence = (home[2] + 10 * away_mean) / (home[0] + 10) / away_mean
            lambdas[row.Index] = np.clip([home_mean * home_attack * away_defence,
                                         away_mean * away_attack * home_defence], .2, 4.5)
            pending.append((row, home, away))
        # Mise à jour après toutes les prédictions du jour : aucun score du même jour ne fuit.
        for row, home, away in pending:
            home[:3] += [1, row.FTHG, row.FTAG]
            away[:3] += [1, row.FTAG, row.FTHG]
            states[(row.leagueCode, row.HomeTeam, 'home')] = home
            states[(row.leagueCode, row.AwayTeam, 'away')] = away
            league = decay(leagues.get(row.leagueCode), day, 365)
            league[:3] += [1, row.FTHG, row.FTAG]
            leagues[row.leagueCode] = league
    return lambdas


def dixon_coles(lambdas, rho):
    goals = np.arange(13)
    factorial = np.array([float(__import__('math').factorial(int(x))) for x in goals])
    home = np.exp(-lambdas[:, 0, None]) * lambdas[:, 0, None] ** goals / factorial
    away = np.exp(-lambdas[:, 1, None]) * lambdas[:, 1, None] ** goals / factorial
    grid = home[:, :, None] * away[:, None, :]
    grid[:, 0, 0] *= 1 - lambdas[:, 0] * lambdas[:, 1] * rho
    grid[:, 0, 1] *= 1 + lambdas[:, 0] * rho
    grid[:, 1, 0] *= 1 + lambdas[:, 1] * rho
    grid[:, 1, 1] *= 1 - rho
    win = np.tril(np.ones((13, 13)), -1).astype(bool)
    draw = np.eye(13).astype(bool)
    loss = np.triu(np.ones((13, 13)), 1).astype(bool)
    p = np.stack([grid[:, win].sum(axis=1), grid[:, draw].sum(axis=1), grid[:, loss].sum(axis=1)], axis=1)
    return p / p.sum(axis=1)[:, None]


def make_tickets(df, p, rule):
    odds = df[['home_open', 'draw_open', 'away_open']].to_numpy()
    guarded = np.maximum(0, p - HAIRCUT)
    tickets = []
    days = df.Date.dt.strftime('%Y-%m-%d')
    # Une seule décision par journée, prise sans lire le résultat.
    for day in sorted(set(days)):
        indices = np.flatnonzero(days.to_numpy() == day)
        options = []
        for i in indices:
            for outcome in range(3):
                price, probability = float(odds[i, outcome]), float(p[i, outcome])
                edge = float(guarded[i, outcome] * price - 1)
                if rule == 'favourite_single':
                    if outcome != int(p[i].argmax()) or probability < .55 or not 1.2 <= price <= 3:
                        continue
                    rank = probability
                else:
                    minimum = .65 if rule == 'value_double' else .55
                    if probability < minimum or not 1.2 <= price <= 3 or edge < MIN_EDGE:
                        continue
                    rank = edge
                options.append((rank, int(i), outcome, price, probability))
        options.sort(key=lambda x: (-x[0], x[1], x[2]))
        chosen = []
        for option in options:
            if all(old[1] != option[1] for old in chosen):
                chosen.append(option)
            if len(chosen) == (2 if rule == 'value_double' else 1):
                break
        required = 2 if rule == 'value_double' else 1
        if len(chosen) != required:
            continue
        price = float(np.prod([x[3] for x in chosen]))
        probability = float(np.prod([x[4] for x in chosen]))
        if required == 2 and (not 1.5 <= price <= 3 or probability < .5):
            continue
        won = all(int(df.iloc[x[1]].outcome) == x[2] for x in chosen)
        tickets.append({'date': day, 'odds': price, 'probability': probability,
                        'won': won, 'net': price - 1 if won else -1})
    return tickets


def roi_interval(tickets):
    if not tickets:
        return None
    # Bootstrap par semaine : garder ensemble les résultats proches dans le temps.
    frame = pd.DataFrame(tickets)
    frame['week'] = pd.to_datetime(frame.date).dt.to_period('W').astype(str)
    blocks = frame.groupby('week').net.agg(['sum', 'count']).to_numpy()
    rng = np.random.default_rng(20261030)
    sampled = rng.integers(0, len(blocks), (2000, len(blocks)))
    sums = blocks[sampled, 0].sum(axis=1)
    counts = blocks[sampled, 1].sum(axis=1)
    return [float(x) for x in np.quantile(sums / counts, [.025, .975])]


def summarise(tickets):
    n = len(tickets)
    interval = roi_interval(tickets)
    total = float(sum(x['net'] for x in tickets))
    return {'tickets': n, 'wins': sum(x['won'] for x in tickets), 'stakeUnits': n,
            'netUnits': total, 'roi': total / n if n else None, 'roi95': interval,
            'expectedWins': float(sum(x['probability'] for x in tickets)),
            'profitableEvidence': bool(n >= MIN_SAMPLE and interval and interval[0] > 0)}


def run(cache):
    df, provenance, raw_count = load_history(cache)
    odds = df[['home_open', 'draw_open', 'away_open']].to_numpy()
    base = power_probabilities(odds)
    y = df.outcome.to_numpy(dtype=int)
    train = (df.Date < TRAIN_END).to_numpy()
    valid = ((df.Date >= TRAIN_END) & (df.Date < VALID_END)).to_numpy()
    test = (df.Date >= VALID_END).to_numpy()
    if min(train.sum(), valid.sum(), test.sum()) < 500:
        raise ValueError('Historique insuffisant pour les trois périodes')
    objective = lambda theta: logloss(calibrate(base[train], theta), y[train]) + .001 * ((theta[0] - 1) ** 2 + theta[1] ** 2 + theta[2] ** 2)
    fit = minimize(objective, [1., 0., 0.], method='L-BFGS-B', bounds=[(.6, 1.6), (-.4, .4), (-.4, .4)])
    if not fit.success:
        raise RuntimeError(f'Échec du calibrage : {fit.message}')
    fitted = fit.x
    # Validation sélectionne le modèle sur la qualité probabiliste, jamais sur le ROI.
    accepted = logloss(calibrate(base[valid], fitted), y[valid]) < logloss(base[valid], y[valid]) - .0001
    theta = fitted if accepted else np.array([1., 0., 0.])
    probabilities = calibrate(base, theta)
    lambdas = rolling_goals(df)
    rho = min([-.12, -.08, -.04, 0.], key=lambda r: logloss(dixon_coles(lambdas[train], r), y[train]))
    goal_probabilities = dixon_coles(lambdas, rho)
    comparisons = []
    for alpha in [0., .1, .2, .3]:
        blended = (1 - alpha) * probabilities + alpha * goal_probabilities
        comparisons.append({'goalWeight': alpha, 'validation': metrics(blended[valid], y[valid]),
                            'test': metrics(blended[test], y[test])})
    selected = min(comparisons, key=lambda item: item['validation']['logLoss'])
    # L’application conserve une référence de marché ; pas de forces d’équipes de 2024 appliquées en 2026.
    test_df = df[test].reset_index(drop=True)
    q = probabilities[test]
    rules = {rule: summarise(make_tickets(test_df, q, rule))
             for rule in ['favourite_single', 'value_single', 'value_double']}
    curve = []
    favourite = make_tickets(test_df, q, 'favourite_single')
    cumulative = 0.
    for ticket in favourite:
        cumulative += ticket['net']
        curve.append({'date': ticket['date'], 'netUnits': round(cumulative, 4)})
    by_season = []
    for season in sorted(test_df.Season.unique()):
        mask = (test_df.Season == season).to_numpy()
        part = test_df[mask].reset_index(drop=True)
        by_season.append({'season': str(season), 'matches': int(mask.sum()),
                          'valueSingle': summarise(make_tickets(part, q[mask], 'value_single'))})
    def period(mask):
        part = df[mask]
        return {'from': part.Date.min().strftime('%Y-%m-%d'), 'to': part.Date.max().strftime('%Y-%m-%d'), 'matches': len(part)}
    report = {
        'schemaVersion': 1, 'modelId': 'consensus-calibrated-v1',
        'title': 'Consensus 1N2, marge retirée', 'dataRevision': REVISION,
        'dataset': {'rawMatches': raw_count, 'usableMatches': len(df), 'files': provenance,
                    'odds': 'moyennes d’ouverture, pas des cotes Winamax exécutables',
                    'excluded': raw_count - len(df)},
        'periods': {'train': period(train), 'validation': period(valid), 'test': period(test)},
        'parameters': {'temperature': float(theta[0]), 'homeBias': float(theta[1]), 'drawBias': float(theta[2])},
        'calibrationAccepted': bool(accepted),
        'goalExperiment': {'rho': rho, 'halfLifeDays': 180, 'priorMatches': 10,
                           'selectedGoalWeight': selected['goalWeight'], 'comparisons': comparisons,
                           'independentTest': metrics(goal_probabilities[test], y[test]),
                           'independentRuleResults': {rule: summarise(make_tickets(test_df, goal_probabilities[test], rule)) for rule in ['favourite_single','value_single','value_double']},
                           'productionApplied': False,
                           'selectedRuleResults': {rule: summarise(make_tickets(test_df, (1-selected['goalWeight'])*q+selected['goalWeight']*goal_probabilities[test], rule)) for rule in ['favourite_single','value_single','value_double']}},
        'metrics': {'validationBaseline': metrics(base[valid], y[valid]),
                    'validationCalibrated': metrics(calibrate(base[valid], fitted), y[valid]),
                    'testBaseline': metrics(base[test], y[test]), 'testModel': metrics(q, y[test])},
        'rule': {'probabilityHaircut': HAIRCUT, 'minimumEdge': MIN_EDGE, 'minimumProbability': .55,
                 'minOdds': 1.2, 'maxOdds': 3, 'maxBetsPerDay': 1, 'quoteMaxAgeMinutes': 60,
                 'requireBook': 'winamax_fr', 'requireActualOdds': True, 'minimumTestBets': MIN_SAMPLE},
        'rules': rules, 'bySeason': by_season, 'baselineCurve': curve,
        'productionEnabled': False,
        'status': 'observation',
        'reason': 'Rentabilité non validée sur des cotes Winamax horodatées. Aucune recommandation de mise automatique.',
        'limitations': [
            'Le jeu de test a été gardé à part pendant l’ajustement et la sélection du modèle.',
            'Les cotes historiques sont des moyennes d’ouverture, pas nécessairement disponibles chez un bookmaker donné.',
            'Les cotes de clôture, les cotes maximales et les résultats futurs ne sont jamais utilisés comme entrées.',
            'Le test historique ne prouve ni un profit futur ni la transportabilité à 2026 ou aux autres ligues.',
            'Le modèle estime la probabilité à partir des prix de marché ; il ne dispose pas d’informations privées sur les équipes.',
            'Les intervalles de ROI sont des bootstrap par semaines, pas une garantie de rendement.',
            'Étude exploratoire non préenregistrée : aucune preuve confirmatoire de rentabilité.',
            'L’historique des paris personnels reste local à ton appareil et ne fait pas partie de cette étude.'
        ]
    }
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path('/tmp/combi-history'))
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/model-report.json')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    report = run(args.cache)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['periods', 'parameters', 'calibrationAccepted', 'metrics', 'rules', 'status']}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
