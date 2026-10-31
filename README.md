# Combiné du Jour

Interface iOS avec deux modes : **modèle prudent** (par défaut, sans pari conseillé tant
qu’aucune rentabilité n’est validée) et **simulation de combinés**. Les tickets personnels,
la bankroll et les exports restent enregistrés sur l’appareil.

Le modèle et les règles ont été étudiés sur 27 668 matchs, avec 4 131 matchs gardés à part
pour le test final. Aucune règle rentable n’a été démontrée. Les résultats, limites et
commandes de reproduction se trouvent dans [docs/MODELE.md](docs/MODELE.md).
Le rapport machine est dans [data/model-report.json](data/model-report.json).

En mode **simulation**, l'appli choisit des matchs européens (5 grands championnats, Eredivisie, Liga Portugal, coupes d'Europe, plus Championship, 2. Bundesliga, LaLiga2, Ligue 2, Liga Portugal 2, Belgique, Danemark, Irlande, Pologne, Roumanie, Russie, Serbie, Suède, Turquie et Ukraine) dont la cote totale tombe entre 3 et 5, en gardant la combinaison la plus probable. Un seuil de probabilité minimum par pari est réglable (50 % par défaut). Marchés : 1N2, double chance, buts, handicaps ±1,5/±2,5, score exact et paris combinés sur un même match (probabilité jointe tirée de la grille des scores, cotes estimées ≈).

- `index.html` : l'appli (page statique, servie par GitHub Pages).
- `data/index.json` : liste des jours disponibles et date de mise à jour.
- `data/days/AAAA-MM-JJ.json` : matchs du jour (date de Paris), heures de coup d'envoi en UTC, cotes 1N2 moyennes (source : oddsportal.com) et score final une fois le match joué.

Les données sont mises à jour chaque matin par une tâche programmée de Claude.

## Méthode

Les probabilités sont tirées des cotes 1N2 avec la méthode « puissance », qui retire la marge du bookmaker. Les paris sur les buts (plus/moins 0,5 à 4,5) viennent d'une loi de Poisson ajustée sur ces mêmes cotes. Les cotes de double chance et de buts sont estimées (≈). Les matchs sont supposés indépendants.

Une cote de 3 à 5 correspond à environ 20 à 33 % de chances de gain : la plupart des jours, le combiné sera perdant. Joue uniquement ce que tu acceptes de perdre.

## Basket et Tennis — Winamax France

Les onglets **Basket** et **Tennis** ouvrent `sports.html?sport=basket` et
`sports.html?sport=tennis`. Ils affichent les marchés vainqueur à deux issues fournis
par **Winamax France (`winamax_fr`) uniquement**, sans cote estimée ni remplacement
par un autre bookmaker. Le modèle football et ses probabilités ne sont pas utilisés.
Les rencontres commencées et les relevés de plus de 24 h sont masqués ; après une
heure, un relevé est explicitement signalé comme ancien. Les règles de prolongations,
d’abandon ou de forfait restent celles du marché chez Winamax.

Le workflow `.github/workflows/cotes-sports.yml` relève les cotes chaque matin à
06:05 UTC, lors d’une modification du collecteur ou sur lancement manuel. Il utilise
le secret GitHub **`ODDS_API_`** (ou `ODDS_API` / `ODDS_API_KEY` en secours), avec un accès The Odds API incluant Winamax France.
Aucune clé n’est publiée dans le navigateur. Sans ce secret, l’onglet explique que la
connexion n’est pas activée ; aucune cote n’est inventée. Les données sont dans
`data/sports/basket.json` et `data/sports/tennis.json`.

Le collecteur découvre les compétitions basket et les tournois ATP/WTA actifs
proposés par la source, consulte les événements dans les sept prochains jours,
puis répartit au maximum six crédits entre les deux sports (en alternance), dans
la limite de la part quotidienne du quota mensuel restant. La couverture peut être
partielle et est indiquée comme telle. Le quota est partagé avec le collecteur football.
Un rafraîchissement du navigateur n’appelle pas l’API payante.

```sh
python -m unittest discover -s tests -p 'test_sports.py'
python scripts/update_sports.py --max-credits 6
```
