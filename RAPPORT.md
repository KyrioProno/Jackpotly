# JACKPOTLY — rapport de validation v0.3.2

**Date :** 16 octobre 2026 · **Livrable :** `jackpotly.html` — 502,1 Ko · 11 025 lignes · un seul fichier,
aucune dépendance, aucune requête réseau.

Ce rapport clôt la **phase de validation** puis la **finition visuelle et sonore** (v0.3.2).
Il répond à trois questions : les 16 jeux sont-ils réellement jouables sur un téléphone ?
les taux de retour annoncés sont-ils ceux du moteur ? les jetons fictifs peuvent-ils être
créés ou perdus par erreur ?

---

## 1. Résultat des suites de tests

| Suite | Portée | Résultat |
|---|---|---|
| `npm test` → `tests/verify.mjs` | maths, crypto, portefeuille, VIP, quêtes, persistance, interface | **243 ✓ / 0 ✗** |
| `npm test` → `tests/smoke.mjs` | parcours complet (écrans, modales, 16 jeux, boutique, roue, recharge) | **14 / 14 étapes, 0 problème** |
| `npm test` → `tests/credits.mjs` | intégrité des crédits et RTP annoncés | **18 ✓ / 0 ✗** |
| `npm run mobile` → `tests/mobile.mjs` | 6 formats de téléphone dans **Chromium réel**, doigt simulé | **49 ✓ / 0 ✗** |
| `sfx.diag.mjs` (recette de finition, non versionnée) | banque sonore : timbre propre aux 16 jeux, signature à l'ouverture, retour au neutre | **33 ✓ / 0 ✗** |

Total : **324 contrôles automatiques, 0 échec**. Les quatre suites sont reproductibles
(`npm run test:all`) et documentées au § 8 du `README.md`.

---

## 2. Ce que la validation a corrigé (défauts réels, invisibles en DOM simulé)

Le passage à un **vrai navigateur mobile** et l'audit des crédits ont mis au jour sept défauts
qu'aucun test en DOM simulé ne pouvait voir :

1. **Roulette figée (bloquant).** `J.Sfx.wheelTick()` était appelé sans argument : la fréquence
   valait `NaN` et `AudioParam.setValueAtTime` levait une exception **dans la boucle
   `requestAnimationFrame`** → la roulette ne s'arrêtait jamais. Corrigé par des gardes
   `Number.isFinite` sur toute la couche audio et par un appel correct (`wheelTick(1 - e)`).
2. **Bouton principal hors écran dans 3 jeux** (Coin Flip, Hi-Lo, Roue) : un `<div>` non fermé dans
   les contrôles faisait passer la barre d'action dans le conteneur défilant, sous la navigation.
   Corrigé dans les 3 jeux **et** structurellement : les contrôles de chaque jeu sont désormais
   isolés dans leur propre nœud, la barre d'action est toujours l'enfant direct du panneau.
3. **Bouton « Encaisser » inerte à Mines (bloquant).** Le montant encaissable était rafraîchi sans
   réactiver le bouton, né désactivé : après la première gemme, le joueur voyait « 💰 Encaisser ·
   +110 » et ne pouvait rien encaisser. Trouvé par l'audit des crédits, corrigé, testé.
4. **Modale de bienvenue** : ses boutons tombaient hors zone après défilement → en-tête et barre
   d'action fixes, corps défilant.
5. **Grille de roulette à 0 px de haut** : une règle `min-height` posée avant la définition
   d'origine était écrasée → taille en `clamp()` dans la règle réelle, cases de 118 px.
6. **Plates-formes de jeu écrasées** (Mines/Keno/Tower) : hauteurs minimales par grille pour que
   les cases restent tapables sur un écran de 320 px de haut utile.
7. **Libellés tronqués et cibles tactiles trop petites** : rangée du profil en 2 × 2 sous 400 px,
   libellé « Éditer », zones tactiles élargies de 10 px (`::after`), en-tête revisité.

Aucun de ces points n'était visible dans les 243 contrôles historiques : c'est la valeur ajoutée
des deux nouvelles suites.

---

## 2 bis. Finition v0.3.2 : ce qui a été ajouté et vérifié

La phase de finition visuelle et sonore s'est appuyée sur les mêmes suites, rejouées après chaque
lot. Quatre volets, tous validés en navigateur réel :

1. **Célébrations de gain** — un seul chemin pour les 16 jeux (`J.FX.celebrate`), appelé par le
   moteur : au-delà de ×2 confettis et texte, au-delà de ×5 bandeau « BIG WIN », jetons, secousse et
   flash vert, au-delà de ×20 « JACKPOT » (150 confettis, 70 jetons, 34 étincelles, flash doré).
   Chaque palier a été capturé et relu (`tests/screens/cel-*.png`) ; deux défauts réels corrigés :
   sous-titre du bandeau qui doublait le « × » et montant flottant qui recouvrait le compteur de solde.
2. **Transitions d'écran** — glissement directionnel déduit de l'ordre des onglets, cascade des blocs,
   pop de l'onglet actif, entrée animée de la scène et du panneau de jeu.
3. **Icônes SVG internes** — 18 icônes d'interface (`gift, fortune, cart, medal, target, shield, lock,
   key, receipt, gamepad, money, chart, rotate, check, settings, refill, bolt, hourglass` + `info`)
   remplacent les emojis dans les titres, cartes d'accueil, menus, boutons et pastilles. Les emojis
   restent dans les messages, les gains et les animations. Motif : le rendu d'un emoji dépend de la
   police du téléphone (et le sandbox de test n'en a aucune — les captures montraient des carrés).
4. **Banque sonore par jeu** — chaque table a un timbre (forme d'onde), un registre (décalage en
   demi-tons) et une signature de 2 à 4 notes jouée à l'ouverture ; mise, tick, révélation,
   encaissement et perte passent par ce timbre, les jingles de gain restent communs. Vérifié sans
   oreille : un espion d'`AudioContext` relève les formes d'onde réellement créées.

Les quatre suites ont été rejouées après la finition (chiffres du tableau ci-dessus) et une recette
sonore a été ajoutée pour prouver que le timbre change bien par jeu et revient au neutre à la sortie.

---

## 3. Les 16 jeux : jouabilité réelle

Mesures faites sur iPhone SE (320 × 568), Galaxy S8 (360 × 740), iPhone 13 (390 × 844),
iPhone 14 Pro Max, iPhone SE en paysage et iPad mini :

- **16 / 16 jeux** montent, tiennent dans l'écran et gardent leur bouton principal visible ;
- **aucune erreur JavaScript** en montant ou en jouant une manche ;
- **une manche complète au doigt** sur les 6 classiques (rotation de la roulette, main de blackjack
  jouée jusqu'à `done`, distribution de baccarat, arrêt des rouleaux, tirage du Video Poker,
  Hold'em joué jusqu'à l'abattage) ;
- le **solde affiché suit le solde du moteur** après chaque action, compteur animé compris ;
- **aucun débordement horizontal**, en portrait comme en paysage ;
- cibles tactiles : toutes ≥ 30 px, la quasi-totalité ≥ 42 px (zone élargie incluse).

## 4. Comptabilité des jetons fictifs

Sur **84 manches réelles** (6 par jeu, mise de 100 J), l'audit vérifie à chaque manche :

```
Δ solde   = − mise réellement débitée + gain crédité
gain      = arrondi(mise × multiplicateur annoncé)
cumulés   : stats.misé = Σ mises, stats.rendu = Σ gains
```

Résultat : **0 écart**, jamais de solde négatif, jamais de mise supérieure au solde. Les jeux de
table conservent leurs mises d'une manche à l'autre (comme au casino) et le test le prend en compte
en lisant la mise réellement débitée au lieu de la mise théorique.

**Aucun jeton ne peut être créé hors des sources prévues**, et chacune est plafonnée :

| Source | Plafond / garde-fou | Vérifié |
|---|---|---|
| Recharge gratuite (solde 0) | 2 500 J, **3 / jour**, délai obligatoire de 25 s | ✓ |
| Bonus quotidien | 1 versement par jour (cycle de 7 jours croissant) | ✓ |
| Roue quotidienne | 1 tour par jour, gain **strictement** dans les 10 secteurs affichés (0–25 000 J) | ✓ |
| Paliers VIP | prime unique par palier (5 paliers : Bronze → Diamant) | ✓ |
| Boutique | 5 packs, achat bloqué au-delà de la **limite mensuelle** choisie par le joueur | ✓ |
| Jetons du quotidien | jamais convertibles, jamais retirables, jamais échangeables | ✓ |

## 5. Taux de retour : annoncé = moteur

| Jeu | RTP annoncé | Méthode de vérification |
|---|---|---|
| Crash · Dice · Mines · Plinko · Limbo · Coin Flip · Hi-Lo · Tower | 99 % | formules fermées contrôlées par simulation (100 000+ parties) |
| Keno | 97,5 % (97,41–97,82 % selon la sélection) | espérance exacte sur les tables de gains, affichée en jeu |
| Roue (Wheel) | 97 % | moyenne **exacte** des 60 segments, pour les 8 cibles (écart < 0,6 pt) |
| Roulette européenne | 97,3 % | 36/37 = **97,297 %** sur les 14 types de mises |
| Blackjack | 99,5 % | 200 000 mains à la stratégie de base |
| Baccarat | 98,9 % | Banque 45,86 % · Joueur 44,62 % · Égalité 9,52 % (200 000 donnes) |
| Machines à sous (3 thèmes) | 96,5 % | RTP exact recalculé sur les bandes (**96,4997 %**) |
| Video Poker 9/6 | 99,5 % | jeu optimal = **99,54 %** |
| Texas Hold'em | 98 % | commission de table 2 % (plafond 500 J) + équité Monte-Carlo |

Tous les jeux respectent la fourchette demandée et chaque jeu dispose d'une **explication des règles
en un tap**, du panneau des gains et du RTP exact affiché.

## 6. Conformité « casino social »

- Bandeau permanent dans la boutique : **« Jetons virtuels sans valeur monétaire. Divertissement
  uniquement. 18+. »**
- Aucun retrait, aucune conversion en argent ou en cadeaux, aucun échange entre joueurs ; les
  adversaires du Hold'em sont des bots locaux, le classement est fictif.
- **Aucun pari sportif** (catalogue vérifié : uniquement Originals + classiques de table).
- **Rappel de pause toutes les 30 minutes** et écran « Jeu responsable » avec numéro d'aide.
- Limite de dépenses mensuelle choisie par le joueur, jamais relevable à la hausse le mois courant.
- Paiement **simulé**, isolé derrière un adaptateur (`J.Shop.provider`) prêt pour Apple/Google IAP.
- Fair Play : graine visible, empreinte SHA-256, rotation de graine vérifiable.

---

## 7. Ce qu'il reste à améliorer (aucun blocage)

1. **Finition visuelle et sonore — faite en 0.3.2** (célébrations, transitions, icônes SVG internes,
   banque sonore par jeu : voir §2 bis). Ce qui resterait : une musique d'ambiance **par thème** de
   salon (une seule nappe aujourd'hui) et des échantillons audio enregistrés plutôt que synthétisés.
2. **Historique** — 250 dernières manches conservées, sans filtres ni export ; les statistiques par
   jeu sont déjà en place.
3. **Hold'em** — un seul adversaire bot, pas de tournoi ni de table à plusieurs.
4. **Auto-bet** — présent sur les jeux concernés, sans mémorisation de profils d'auto-bet nommés.
5. **Accessibilité** — contrastes et tailles de police vérifiés au pixel, mais pas encore de
   navigation clavier complète ni de rôles ARIA exhaustifs.
6. **Bordures de la vague 3** — le paiement réel (Apple/Google) reste à brancher ; la boutique
   appelle aujourd'hui un fournisseur simulé.

## 8. Où jouer tout de suite (sans jeton d'accès)

- https://cdn.jsdelivr.net/gh/KyrioProno/Jackpotly@v0.3.2/jackpotly.html
- https://raw.githack.com/KyrioProno/Jackpotly/v0.3.2/jackpotly.html
- Téléchargement : https://github.com/KyrioProno/Jackpotly/blob/v0.3.2/jackpotly.html
  (« Download raw file ») puis ouverture dans le navigateur — aucune connexion requise ensuite.
- Release : https://github.com/KyrioProno/Jackpotly/releases/tag/v0.3.2
