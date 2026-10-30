# Étude du modèle de paris

Le précédent algorithme optimise la probabilité d’un combiné soumis à une cote totale
entre 3 et 5. Il ne vérifie pas qu’un avantage sur le bookmaker existe. Retirer la marge
des cotes puis rejouer ces mêmes cotes ne crée pas, à lui seul, un avantage rentable.

## Données et périodes

Historique de `nm2890/football-data`, révision figée
`279978313f9c16a210fa80e8986fa22f0f866fba` : Premier League, Ligue 1,
Bundesliga, Serie A et LaLiga. Les CSV restent dans un cache externe au dépôt ; le rapport
contient leurs URL et empreintes SHA-256. Aucun résultat ni cote personnelle n’est envoyé
à un service externe.

Après exclusion des données manquantes, doublons, prix invalides et marchés moyens sous
la parité ou de marge supérieure à 25 %, 27 668 matchs restent utilisables :

- Apprentissage : 18 162 matchs, août 2009 à juin 2019.
- Validation : 5 375 matchs, août 2019 à mai 2022.
- Test final : 4 131 matchs, août 2022 à novembre 2024.

Les cotes sont les moyennes d’ouverture documentées par la source. Les cotes de clôture
et les maxima ne servent jamais d’entrées. Ces moyennes ne sont pas des prix exécutables
chez Winamax ; leurs heures exactes de publication ne sont pas connues. Les rendements
ci-dessous sont donc des simulations historiques, pas des performances réelles.

## Modèles comparés

1. Consensus 1N2 : méthode puissance pour enlever la marge, somme des probabilités = 1.
2. Calibration température et biais domicile/nul : ajustée sur l’apprentissage uniquement.
   Elle détériore la validation, donc ses paramètres ne sont pas appliqués en production.
3. Modèle de buts indépendant, Poisson avec correction Dixon–Coles des petits scores.
   Forces domicile/extérieur estimées sur les résultats passés, demi-vie de 180 jours et
   régularisation de 10 matchs. La moyenne du championnat a une demi-vie de 365 jours.
   Tous les pronostics d’une journée sont faits avant d’ajouter ses scores à l’historique.
4. Mélanges marché/buts à poids préfixés de 0, 10, 20 et 30 %. La validation choisit 10 %.
   Ce mélange détériore toutefois le score logarithmique sur le test final : 0,9722 contre
   0,9711 pour le marché seul. Il n’est pas activé pour conseiller des mises. Les forces
   d’équipes de 2024 ne sont pas réutilisées comme des forces actuelles de 2026.

Aucun paramètre n’est réajusté sur la période finale et aucune règle n’est sélectionnée
sur son ROI de test. L’étude n’est pas une preuve de validité en 2026 ou hors des ligues
étudiées.

## Règles fixées avant le test final

- Favori simple : un par jour, probabilité ≥ 55 %, cote de 1,20 à 3,00 ; référence de comparaison.
- Simple de valeur : mêmes limites, probabilité réduite de 3 points par prudence et
  `probabilité_prudente × cote − 1 ≥ 5 %`. Au maximum un pari par jour.
- Double de valeur : deux matchs différents, probabilité individuelle ≥ 65 %, mêmes critères
  de prix, cote totale de 1,50 à 3,00, probabilité jointe ≥ 50 %. L’indépendance reste une hypothèse.

La réduction de 3 points est une hypothèse de prudence, pas une borne de confiance
statistique. Les seuils ne garantissent pas de gains. Aucun montant de mise réel n’est proposé.

Le favori simple gagne 262/355 tickets (73,8 %), avec +4,28 unités nettes et un ROI de
+1,21 %. L’intervalle bootstrap à 95 %, rééchantillonné par semaines, va d’environ
−4,51 % à +6,96 % : ce résultat ne démontre pas un rendement positif. Les deux règles de
valeur ne retiennent aucun ticket aux cotes moyennes d’ouverture. Cela ne mesure pas
les éventuels écarts de prix disponibles ponctuellement chez Winamax.

Le modèle de buts seul a également été évalué avec les mêmes filtres de valeur : 27 tickets,
8 gagnés et −39,67 % de ROI simulé. Il ne justifie pas son activation. L’étude est exploratoire,
non préenregistrée ; aucun de ces résultats ne constitue une preuve confirmatoire.

## Comportement de l’application

Le mode prudent est le défaut. Il indique « Pas de pari conseillé » et ne remplace pas une
absence d’avantage par un combiné forcé. Le rapport est consultable dans l’application et
`data/model-report.json`. La simulation historique des favoris est séparée des paris personnels.

Une future activation de recommandations exige une validation sur des prix exécutables
et horodatés du bookmaker concerné, un échantillon suffisant et un intervalle de ROI
strictement positif. Un simple booléen d’activation ne suffit pas. Le rapport actuel garde
`productionEnabled: false`. Les données anciennes ou non horodatées ne sont pas inventées
ou requalifiées comme récentes.

Le collecteur exclut Winamax et les exchanges du consensus de référence pour éviter que
la cote à évaluer serve elle-même de référence. Il conserve l’identifiant du bookmaker et
les heures des cotes. Les recommandations éventuelles se limitent aux vrais prix 1N2,
aux cinq ligues étudiées, à des matchs non commencés et à des cotes de moins de 60 minutes.

Les anciennes simulations et les tickets manuels restent accessibles. Les recalculs après
coup et les anciens enregistrements sans heure ne sont plus comptés comme des propositions
vérifiées avant match. Aucun historique personnel n’est effacé.

## Reproduire

```sh
python3 -m venv /tmp/combi-research-venv
/tmp/combi-research-venv/bin/pip install -r scripts/requirements-research.txt
/tmp/combi-research-venv/bin/python scripts/research_model.py --cache /tmp/combi-history
/tmp/combi-research-venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node tests/model.test.cjs
```

Le script télécharge uniquement les cinq CSV de la révision fixée. L’étude est déterministe
(seed bootstrap figée). Aucun secret Odds API n’est requis pour la recherche ; le collecteur
quotidien conserve son mécanisme d’authentification existant.

Vérification du navigateur (Chromium installé séparément, site servi localement) :

```sh
npm ci
CHROMIUM_PATH=/usr/bin/chromium APP_URL=http://127.0.0.1:8001/ npm run test:browser
```

Le test vérifie le mode prudent, la simulation, la saisie d’un ticket de test local, le tableau
de bord, l’échec du chargement du rapport et l’absence de débordement à quatre largeurs.
Il ne place aucun pari réel. Les captures sont écrites dans le dossier temporaire système.
