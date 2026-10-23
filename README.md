# Combiné du Jour

Chaque jour, l'appli choisit de 2 à 5 matchs européens (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Eredivisie, Liga Portugal, coupes d'Europe) dont la cote totale tombe entre 3 et 5, en gardant la combinaison la plus probable.

- `index.html` : l'appli (page statique, servie par GitHub Pages).
- `data/index.json` : liste des jours disponibles et date de mise à jour.
- `data/days/AAAA-MM-JJ.json` : matchs du jour (date de Paris), heures de coup d'envoi en UTC, cotes 1N2 moyennes (source : oddsportal.com) et score final une fois le match joué.

Les données sont mises à jour chaque matin par une tâche programmée de Claude.

## Méthode

Les probabilités sont tirées des cotes 1N2 avec la méthode « puissance », qui retire la marge du bookmaker. Les paris sur les buts (plus/moins 0,5 à 4,5) viennent d'une loi de Poisson ajustée sur ces mêmes cotes. Les cotes de double chance et de buts sont estimées (≈). Les matchs sont supposés indépendants.

Une cote de 3 à 5 correspond à environ 20 à 33 % de chances de gain : la plupart des jours, le combiné sera perdant. Joue uniquement ce que tu acceptes de perdre.
