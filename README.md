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

Les onglets Basket/Tennis proposent des combinés du sport courant ou mixtes (2 à 4
rencontres), avec une fourchette de cote, un seuil de probabilité et des familles de
marchés : vainqueur, total +/−, handicap, au moins un set au tennis, total équipe au
basket. Les familles sans paire de cotes complète ne donnent aucune sélection.

### Correction de cohérence et probabilités

Les anciens combinés exploraient les deux vainqueurs pour approcher une cote cible,
ce qui pouvait inverser Zverev en changeant seulement le nombre de matchs. Désormais :

- le favori du marché vainqueur est fixé **avant** le choix du nombre de matchs et de
  la cote cible ; l’adversaire n’est pas ajouté pour remplir la fourchette ;
- les handicaps automatiques gardent le côté du favori ; les totaux gardent une
  direction stable par famille/participant ; gagner un set n’équivaut pas à gagner
  le match, donc les paris « au moins un set » peuvent concerner les deux joueurs ;
- les probabilités binaires sont déduites des deux cotes Winamax par la méthode
  puissance : trouver k tel que `(1/oA)^k + (1/oB)^k = 1` ;
- ces **probabilités de marché hors marge** ne sont pas des prédictions indépendantes
  fondées sur les résultats des joueurs et leur calibration n’est pas démontrée ;
- chaque combiné multiplie les probabilités en supposant les rencontres indépendantes,
  prend une seule sélection par match et évite de répéter le même joueur/équipe ;
- classement par probabilité indicative décroissante, puis proximité de la cote cible.
  Recherche bornée aux 12 prochains matchs filtrés et aux meilleures options par famille,
  au maximum 6 options par match et 6 combinés affichés. Aucune combinaison n’est forcée.

Les lignes entières pouvant entraîner un remboursement ne sont pas estimées comme
des issues binaires sans nul. Les marchés collectés sont des lignes en demi-point,
demi-jeu ou, pour gagner au moins un set, la ligne 0,5 set.

### Provenance des marchés

Le collecteur utilise exclusivement **Winamax France (`winamax_fr`)**. Les cotes
vainqueur, handicaps et totaux viennent des marchés h2h/spreads/totals ; au tennis,
les handicaps/totaux standards sont exprimés en jeux, au basket en points. Les marchés
supplémentaires ne sont demandés que s’ils sont annoncés dans la liste des marchés
Winamax de l’événement (notamment player_sets_won, team_totals et lignes alternatives).
Une paire incomplète, d’un autre bookmaker, non horodatée ou incohérente est rejetée.
Un échec du relevé optionnel n’efface pas les cotes standards.

**La couverture de The Odds API ne comprend pas forcément tous les paris de l’app
Winamax.** Chaque rencontre indique les familles réellement collectées. Pour un
marché manquant, une saisie locale permet de recopier **les deux côtés du même marché**
chez Winamax. Elle est marquée « Saisie personnelle Winamax · non vérifiée par l’API »,
utilise la même méthode de probabilité et peut être retirée. Aucune cote n’est
inventée à partir d’un autre marché, notamment pour « gagner au moins un set ».
Les saisies personnelles sont conservées dans `cdj.sportsMarkets` sur cet appareil.

Le workflow `.github/workflows/cotes-sports.yml` tourne à 06:05 UTC chaque matin,
sur modification du collecteur/workflow ou manuellement. Il utilise le secret
**ODDS_API_** (ODDS_API ou ODDS_API_KEY en secours). Aucun secret n’est envoyé au navigateur.
Les compétitions actives et les sept prochains jours sont découverts automatiquement.
Maximum 18 crédits par passe, plafonnés par la part quotidienne du quota mensuel
restant, partagés entre les deux sports ; jusqu’à deux crédits sont réservés aux
marchés supplémentaires, dont la disponibilité est examinée sur huit événements au
plus. La couverture partielle est signalée. Ce quota est partagé avec le football.

### Ticket et suivi

Les matchs commencés et relevés de plus de 24 h sont masqués ; après une heure, la
cote est signalée comme ancienne. Une fois les cotes vérifiées chez Winamax et la
mise saisie, le ticket est enregistré localement dans `cdj.bets`, avec la provenance,
le marché, les prix, les probabilités indicatives et leur méthode. Les anciens tickets
sont conservés, sans leur attribuer rétroactivement une probabilité.

Aucun pari n’est transmis au bookmaker. Les changements de cote/probabilité ou le
début du match bloquent l’enregistrement d’une ancienne sélection. Les résultats
Basket/Tennis restent à renseigner manuellement après règlement Winamax ; les règles
football ne leur sont pas appliquées. Les abandons, annulations et remboursements ne
sont pas calculés automatiquement. Aucune rentabilité future n’est démontrée.

### Vérification

```sh
npm test
python -m unittest discover -s tests -p 'test_sports.py'
# Avec un serveur local sur le port 8001 :
node tests/sports-browser.cjs
node tests/sports-combos-browser.cjs
node tests/sports-markets-browser.cjs
```


## Safe du jour

`safe.html` affiche au plus un ticket football, basket, tennis et un combiné avec
exactement un match de chaque sport. Cote totale entre 1,50 et 2,00 ; probabilité
indicative d’au moins 60 % par sélection et pour le ticket entier. Les simples, doubles et triples d’un sport sont
comparés, sans rencontre ni participant répété. Les quatre tickets sont calculés
séparément. Un emplacement reste vide si les conditions ne sont pas remplies.

Le moteur `safe-engine.js` utilise uniquement les marchés complets et les prix
Winamax France horodatés depuis moins de 24 h. Les relevés de plus d’une heure
sont signalés. Les prix moyens, estimés, allemands et saisis personnellement sont
exclus. Le football accepte les trois issues 1/N/2 et les marchés binaires de buts
ou handicaps en demi-but. Les cotes et probabilités ne sont jamais corrigées par
un facteur forfaitaire « 1,50 devient 1,20 ». La cote réellement confirmée doit
encore être dans l’intervalle cible pour enregistrer un ticket.

Les probabilités de marché ne sont ni des fréquences validées ni une preuve
de rentabilité. Les combinés supposent les rencontres indépendantes. Le moteur
ne dispose pas de données blessures/compositions. Aucun pari n’est forcé chaque
jour, aucun bénéfice n’est garanti et aucune mise n’est automatisée.

Les tickets choisis vont dans `cdj.bets` avec `source: safe` et apparaissent dans
une catégorie dédiée du tableau de bord. Un ticket par sport/catégorie et par
jour peut être enregistré. Les prix sont rechargés avant la sauvegarde ; les
matchs commencés ou les prix modifiés imposent un nouveau choix. Les premiers
tickets affichés sont aussi archivés avant match dans `cdj.safeDaily` (90 jours),
séparément des mises et sans leur attribuer des victoires fictives.

Le collecteur `update_sports.py` couvre désormais aussi le football avec le même
quota partagé, sans augmenter le plafond de 18 crédits par passe. Le workflow
`Cotes Winamax et Safe du jour` relève les prix et publie les nouveaux fichiers
via GitHub Pages. Les données initiales football reprennent uniquement les prix
Winamax France déjà archivés, avec leurs horodatages d’origine.

Validation : `node tests/safe.test.cjs`,
`python -m unittest discover -s tests -p 'test_safe_sports.py'`.
Le test navigateur `tests/test_safe_browser.py` utilise des prix fictifs isolés
pour vérifier le parcours ; ces données ne sont jamais publiées comme cotes.

En cas de couverture partielle du football, les anciennes réponses API présentes
dans `data/days` peuvent compléter les compétitions non interrogées : uniquement
`mine.bookKey == winamax_fr`, trois cotes 1/N/2 valides, match à venir et âge
maximum 24 h. Le timestamp d’origine reste inchangé. Aucun prix moyen, total
sans horodatage propre, ni prix d’une compétition déjà réinterrogée n’est repris.

Le seuil Safe est de 60 % minimum par sélection et pour le ticket entier.
La cote cible reste 1,50–2,00 et le classement privilégie la probabilité la plus
élevée. Les sélections isolées sont affichées séparément, sans prétendre que
leur cumul conserve le même pourcentage. Aucun ticket n’est forcé et les
anciens résultats ne sont pas réécrits.

Safe exclut désormais tous les marchés h2h (victoire simple), y compris dans
les sélections isolées. Seuls sets, totaux et handicaps réellement cotés sont
éligibles. Le collecteur direct Winamax n’est pas encore activé : un emplacement
peut rester vide si le flux existant ne fournit aucun de ces marchés.
