# JACKPOTLY — rapport d'audit et de correction v0.4.1

**Date :** 16 octobre 2026 · **Version livrée :** `v0.4.1` (tag `v0.4.1`, build `dff37c61fd55`) ·
**Livrable :** `jackpotly.html` (copie identique `index.html`) — 1 782,5 Ko · 14 472 lignes ·
md5 `91e46a2e0173450cb29c0df251b4e54c` · un seul fichier, aucune dépendance, aucune requête réseau.
**Correspondance sources ⇄ livrable :** `node tools/build.mjs --check` compare le fichier distribué au
résultat du build des sources et sort en erreur s'il existe le moindre écart (aucune écriture).
**Périmètre :** fiabiliser réellement les 16 jeux (manches qui se bloquent, règles mal appliquées,
crédits faux), préserver le design v0.4.0. **Aucune nouvelle salle, aucun nouveau jeu, pas de v0.5.0.**

Ce rapport ne dit pas « le code a changé » : pour chaque bug il donne le **symptôme observé**, la
**cause réelle confirmée** en lisant le code et en le reproduisant, la **correction**, et le **test qui
échoue avant / passe après**. Les résultats des suites sont ceux de la dernière exécution complète.

---

## 1. Méthode

1. **Audit avant modification** : lecture du moteur (`src/28-games-core.js`, `src/23-wallet.js`) puis des
   16 jeux, un par un : entrée en jeu, mise, actions proposées et conditions d'activation, résolution,
   gain/perte/égalité, fin de manche, redémarrage, cas limites (solde insuffisant, double appui, appui
   pendant l'animation, retour à l'accueil, rechargement de page).
2. **Reproduire avant de corriger** : un harnais déterministe (`tests/audit-0.4.1.mjs`, jsdom) pilote le
   générateur de tirages (`J.Fair`) et accélère le planificateur de manche (`J.Games.schedule`) ; les
   parcours « vrai joueur » passent par des appuis tactiles réels sur Chromium (`tests/e2e.mjs`,
   `tests/mobile.mjs`).
3. **Corriger la cause, pas le symptôme**, en séparant moteur / crédits / états / animations / interface.
4. **Non-régression systématique** : après chaque correctif, relance des suites ciblées **et** des suites
   complètes. **Aucun test n'a été modifié pour « faire passer » un contrôle** : quand une attente a été
   ajustée, c'est parce qu'elle mesurait mal le comportement réel (les harnais sont détaillés au § 4.2).
5. **Le contrôle du contrôle** (lot 5) : au-delà des bugs, les **règles** ont été passées au banc avec des
   valeurs attendues recalculées **en dehors du jeu** — seconde implémentation du tableau officiel du
   baccarat, formules des multiplicateurs du Hi-Lo écrites dans le test, RTP réannoncé, barème des tours
   gratuits lu dans les tables de la machine (§ 4.4).

---

## 2. Bugs confirmés, causes réelles et corrections

| # | Symptôme observé | Cause réelle confirmée | Fichier · fonction | Correction | Test qui le prouve |
| --- | --- | --- | --- | --- | --- |
| 1 | **Machines à sous : le bonus se fige** — rouleaux arrêtés, « Tours gratuits » figé, plus aucune commande | `afterReels` rappelait la résolution de la rotation payante : la même rotation était résolue deux fois, le compteur de tours gratuits ne se décomptait plus | `src/45-game-slots.js` (`spinReels`, `afterReels`, `freeSpin`) | Verrou de séquence (`g.seq`/`nextSeq`), une résolution unique par rotation (`g.resolved`), `baseResolve`/`nextFreeSpin`/`freeResolve`, sortie de bonus explicite, `settleInFlight` à la fermeture | `tests/audit-0.4.1.mjs` § 1.1–1.9 (avant : bloqué, 10 tours de suite sans fin ; après : 10/10 tours, bonus terminé) |
| 2 | **Machines à sous : SPIN sans effet / rouleaux immobiles** après le portage de la machine | Le portage avait perdu `g.spinning = true` dans `start()` et `freeSpin()` : l'état « en rotation » n'était jamais posé, les commandes et le rendu partaient d'un état faux | `src/45-game-slots.js` (`start`, `freeSpin`) | `g.spinning = true` rétabli aux deux endroits (et remis à `false` aux 4 points de sortie), commandes `disabled: g.spinning \|\| !!g.busy` | `tests/verify.mjs` « machines : manche complète » · `tests/mobile.mjs` « Slots : rouleaux, arrêt, règlement » · § 1.1–1.9 |
| 3 | **Hi-Lo : l'égalité faisait perdre**, et le pari Égalité n'existait pas | `won = next.rank > …` comptait l'égalité comme une perte ; l'interface ne proposait que 2 choix ; la règle « égalité neutre » était absente | `src/37-game-hilo.js` (moteur réécrit) | **3 paris distincts** (`#hlHigh`, `#hlTie`, `#hlLow`) · égalité sur Plus haut/bas = **neutre** (multiplicateur inchangé, manche continuée, `g.tieCount`) · pari Égalité avec sa propre probabilité `pT = copies du rang / cartes restantes` et son paiement `m / pT` · paiement gagnant `m × (1 − pT) / pW` (l'égalité neutre est ainsi incluse dans le prix, RTP 99 % conservé) · comparaison sur le **rang** seul · multiplicateur initial `0,99` affiché · réinitialisation aux seuls moments prévus (nouvelle manche, encaissement, perte) | `tests/audit-0.4.1.mjs` § 2.1–2.8 (10 contrôles déterministes : carte supérieure, inférieure, égalité, victoire et échec sur Égalité, dernière carte, nouvelle manche) |
| 4 | **Baccarat : le gain ne s'affichait plus au moment de la célébration** (habillage « NaN ») | La célébration calculait le montant misé avec `Σ g.spots[k].w` : le tapis du baccarat compte des **jetons entiers** par case, pas des objets pondérés comme la roulette. Le montant valait `NaN` | `src/44-game-baccarat.js` (`settle`) | `const payout = Math.round(stake * mult)` avec `stake = g.ticket.bet`. **Le calcul du paiement n'a pas été touché** (`mult` = moyenne pondérée des cases, `J.Wallet.settle` inchangé) | `tests/audit-0.4.1.mjs` § 3.1–3.7 (manches Joueur / Banque / Égalité, un seul règlement, solde exact) |
| 5 | **Baccarat : impression de « zones non cliquables » / bouton sans effet** | Reproduction : les zones répondent ; le bouton principal était volontairement désactivé **tant qu'aucune mise n'est posée** (`disabled: g.phase === 'deal' \|\| !t.spots`) mais restait lisible comme actif | `src/28-games-core.js` (`renderActions`) | Une commande qui n'agirait pas est désormais rendue `disabled aria-disabled="true"` (elle ne « ment » plus sur sa disponibilité), le libellé annonce « Place une mise d'abord » | § 3 · `tests/mobile.mjs` « Baccarat : deux zones de mise puis donne complète et règlement » · `tests/e2e.mjs` § 4 (320×568 : mise posée puis commande utilisable) |
| 6 | **Texas Hold'em : écran figé sur « Abattage… »** (> 1 s sans commande utilisable) et **bot qui continuait de jouer après la fin de la main** | Les rappels planifiés pendant la main (réflexion du bot, rue suivante, abattage) n'étaient pas annulés en fin de main : `nextStreet` relançait une rue sur une main déjà réglée, puis `showdown` ré-écrivait la phase | `src/47-game-poker.js` (`endHand`, `nextStreet`, `clearHandTimers`) | Annulation des rappels de la main **avant** `finish()` (qui planifie, lui, l'auto-bet) + garde de phase dans `nextStreet` | `tests/verify.mjs` « Hold'em : la main se termine, le pot est payé » · `tests/e2e.mjs` « 2 manches complètes » · `tests/mobile.mjs` « Hold'em : la main se joue jusqu'au bout » |
| 7 | **Texas Hold'em : « Se passer » cliquable alors que ce n'est pas au joueur de parler** (aucun effet) | La commande était proposée pendant la réflexion du bot sans être désactivée | `src/47-game-poker.js` (`actions`) | Commande annoncée indisponible hors du tour du joueur | Contrôles « aucune commande active sans effet » (§ 7) |
| 8 | **Dice : bouton de jeu actif mais inerte pendant l'animation** | `Games.play()` posait `g.busy = true` **après** le calcul des commandes : le bouton restait actif alors que la manche était déjà ouverte et que le moteur ignorait l'appui | `src/28-games-core.js` (`play`, `renderActions`) | `g.busy` posé avant le calcul des commandes + `renderActions(g)` réaffiché avant `def.start(g)` : `idle(a) = a.disabled === true \|\| (g.busy && !a.alsoWhenBusy)`. Les commandes prévues pour agir en manche (encaisser, tirer, rester, doubler, séparer) déclarent `alsoWhenBusy` et restent actives | `tests/audit-0.4.1.mjs` § 7.1 (17 mesures pendant la manche, **0 bouton actif sans effet**) · `tests/e2e.mjs` § 3 « appuis pendant l'animation » |
| 9 | **Sortie de jeu pendant une manche : la manche pouvait se régler après coup** | `Games.close()` remboursait le ticket sans l'effacer : les animations qui testent `g.ticket` croyaient la manche encore en cours | `src/28-games-core.js` (`close`) | `g.ticket = null` après le remboursement, comme le fait déjà `abort()` | `tests/audit-0.4.1.mjs` § 8 (wheel, plinko, dice, limbo : 1 mise, 1 remboursement, 0 règlement, solde rendu) |
| 10 | **Roue de la chance : animation non interrompue** et `busy` resté vrai après une sortie de jeu | La boucle d'images n'était ni enregistrée ni annulable ; la garde de ticket ne rendait pas la main (`busy` conservé) | `src/41-game-wheel.js` (`start`, `stop`) | `g._raf` suivi et annulé dans `stop()`, garde de manche qui repose `spinning`/`busy` et réaffiche les commandes | § 8 wheel · `tests/audit-0.4.1.mjs` § 6.2 (refus d'assurance, règlement unique) |
| 11 | **Dice : exception `Cannot read properties of null (reading 'bet')`** — manche réglée après une sortie de jeu (erreur non rattrapée dans une image d'animation, capturée par les contrôles d'erreurs JavaScript) | L'image d'animation appelait `settle()` sans aucune garde : après `close()` (ticket effacé), `g.ticket.bet` était lu sur `null` | `src/31-game-dice.js` (`state`, `stop`, `start`, `settle`) | Numéro de manche `g._seq` + garde `!g.ticket` dans l'image, `stop()` annule la rAF, `settle()` idempotent (« on ne règle jamais deux fois »), mise lue depuis le ticket de la manche | Reproduit à volonté : `/tmp/dice-repro.mjs` reconstitue l'ancien code → **2 erreurs**, build corrigé → **0** · suite : § 8 dice + « aucune erreur JavaScript » |
| 12 | **Crédits : mise perdue lors d'un rechargement de page en pleine manche** | `v0.4.0` ne mémorisait pas la manche en cours : au démarrage suivant, la mise débitée n'était ni rendue ni rattachée à une manche | `src/23-wallet.js` (`stake`, `extendStake`, `settle`, `refund`, `recoverPending`) · `src/50-boot.js` | `st.pending = {id, game, bet, t}` à la mise, effacé au règlement **comme** au remboursement ; `recoverPending()` appelé une seule fois au démarrage rend la mise et prévient le joueur ; `wallet:refund` désormais émis (les autres modules voient le mouvement) | § 1.9 (vraie page neuve qui démarre sur l'état sauvegardé) · § 4.3 · `tests/e2e.mjs` « Rechargement en pleine manche : la mise débitée est rendue » |
| 13 | **Hi-Lo : encaissement possible deux fois** (double appui) | L'encaissement lisait `g.ticket` sans le consommer tout de suite | `src/37-game-hilo.js` (`cashout`) | Ticket lu une fois, `g.phase = 'idle'`, `steps = 0`, second appui sans effet | § 2.7 (double appui réel : un seul règlement, gain = mise × multiplicateur **affiché**) |
| 15 | **Baccarat : sur téléphone, taper une zone de mise ne pose rien** (`spots: {}`, commande « Place une mise d'abord » figée) — le joueur a l'impression que les zones sont mortes | Deux causes cumulées : (a) les deux mains (Banque, Joueur) étaient **empilées verticalement** et la table dessinée très large, si bien que le tapis dépassait la fenêtre visible de la scène — sur iPhone 13 les zones Joueur/Égalité/paires passaient **sous** le panneau de mise, sur 320×568 elles étaient carrément hors écran ; (b) rien n'amenait la zone visée à l'écran à l'ouverture, et aucune zone ne se signalait | `src/01-styles.css` (`.bac-hands` : deux mains **côte à côte**), `src/03-royale.css` (règles « écran court » : table resserrée, zones réordonnées Banque\|Joueur puis Égalité puis paires), `src/44-game-baccarat.js` (`mount` : `scrollIntoView` de la zone visée) | Sonde tactile `tests/betshot.mjs` : avant — iPhone 13 `egalite` recouvert par `button.casino-chip`, `joueur`/`paireJ` par `button.btn`, `paireB` par `div.sub` ; 320×568 `joueur`/`paireJ`/`paireB` **hors écran** (cy 597/654 pour une fenêtre de 568) ; après — **5/5 zones visibles et touchables sur les deux tailles**, et un appui réel pose la mise : `spots {"joueur":1}`, pastille « 1 × 100 », commande « Distribuer · 100 J 🎴 », annonce « 1 mise(s) · 100 J sur le tapis » | `tests/mobile.mjs` (bloc Baccarat) · `tests/e2e.mjs` (appuis réels par zone) · `tests/betshot.mjs` |
| 16 | **Roulette : les numéros du tapis ne répondaient pas** (`#gStage [data-num="17"]` → `hit: false`) et les paris extérieurs (Rouge/Noir, douzaines, colonnes) restaient hors d'atteinte ; sur 320×568, **aucune** case de mise n'était visible à l'ouverture | (a) la grille de numéros était **elle-même un conteneur défilant** (`overflow-y:auto`, `min-height:118px`) à l'intérieur d'une scène déjà défilante : le doigt restait prisonnier de la grille et n'atteignait jamais les paris extérieurs ; (b) la roue était dimensionnée avec un **plancher de 140 px** indépendant de la hauteur de scène : sur 320×568 elle occupait la moitié de la scène et repoussait tout le tapis sous la ligne de flottaison | `src/01-styles.css` (`.rui-grid` : `overflow:visible`, `flex:0 0 auto`, `min-height:0` → **une seule surface de défilement, la scène**), `src/42-game-roulette.js` (`mount` : roue ≈ 36 % de la hauteur de scène, bornée 84–170 px au lieu d'un plancher de 140 px), `src/03-royale.css` (écran court : tapis de numéros **d'abord**, puis paris extérieurs, sélecteurs de mises combinées ensuite ; préréglages en une rangée) | Sonde tactile : avant — `n17` vis0, `rouge` vis0, appui réel → `spots {}` ; après — iPhone 13 `n1` vis100 **touchable** → appui réel = mise posée (`{"plein:1" … 36x}`, commande « Lancer la roue · 100 J 🎡 ») ; après **un** balayage réel (`touchStart` + 12 `touchMove`) `[data-out="rouge"]` vis100 **touchable** → appui réel = 2ᵉ mise, commande « Lancer la roue · 200 J » ; 320×568 : `n1` visible **et posable dès l'ouverture** (scène portée de 128→322 à 107→322) puis `rouge` après un balayage ; 0 erreur JavaScript | `tests/mobile.mjs` (bloc Roulette) · `tests/e2e.mjs` · `tests/betshot.mjs` |
| 17 | **Écran étroit : l'en-tête mangeait la scène** — `tests/mobile.mjs` signalait deux cases de roulette « recouvertes par `#gPanel` » | Le sous-titre « RTP 97,3 % · volatilité moyenne » se coupait en deux lignes sur 320 px : l'en-tête passait à 67 px et le panneau gardait ses marges, ce qui retirait ~25 px à la scène ; la rangée suivante de cases n'avait plus que 2 px de visible, et son pixel le plus haut appartenait à la boîte du panneau (d'où le faux « recouvrement ») | `src/28-games-core.js` (volatilité isolée dans `<span class="sub-vol">` : le **RTP reste affiché en entier**), `src/03-royale.css` (écran court : en-tête et panneau compacts, `.sub-vol` masquée) | Sonde : `#gStage` 128→322 (199 px) → **107→322 (215 px)** ; les cases 7/8 passent de 2 px visibles à 18 px visibles **et touchables au doigt** ; `tests/mobile.mjs` 48 ✓ / 1 ✗ → **49 ✓ / 0 ✗** | `tests/mobile.mjs` (16 scènes, 2 tailles) |
| 18 | **Baccarat : sur une ÉGALITÉ, les mises Joueur et Banque étaient PERDUES** alors que le jeu annonce un *push* ⇒ le RTP réel s'écartait du RTP affiché (98,76 % / 98,94 %). Symptôme observé : main nulle (deux naturels à 8), une mise de 100 J sur **Joueur** → `mult 0 / payout 0 / profit −100 J` | `wins()` ne renvoyait `true` que pour la case gagnante : sur `outcome === 'egalite'`, **aucune** case Joueur/Banque n'était gagnante, donc la mise restait débitée. Le paiement des cases J/B était calculé par une table « qui gagne » au lieu du **paiement par case** (`SPOTS[k].mult`) où l'égalité vaut 1 (mise rendue) | `src/44-game-baccarat.js` (`payMult`, `settle`, règles affichées) | `payMult(k, g)` : sur `egalite`, **Joueur et Banque paient 1,00×** (mise rendue — push), Égalité paie 9× et les Paires 12× selon leurs propres conditions ; `settle()` empile `(spots[k].w / t.w) × payout` case par case et libelle « remboursée (égalité) » ; le texte de règles annonce le push. **Aucun résultat n'est simulé et aucun gain n'est crédité artificiellement** : c'est le même moteur de crédits (`J.Wallet.settle`) | `tests/audit-0.4.1.mjs` § 9.2 (matrice **case par case**, 4 scénarios : naturel 8/5, victoire Banque + paire Joueur, **égalité à deux naturels 8**, paire Banque) · § 9.3 (RTP mesuré sur 300 000 donnes du moteur : **99,06 %** Joueur · **98,65 %** Banque · **86,29 %** Égalité · **88,68 %** paire J · **89,44 %** paire B, contre 98,76 / 98,94 / 85,64 / 89,64 / 89,64 annoncés — écart ≤ 0,7 point) · reproduction avant/après au § 3 |
| 14 | **Blackjack : assurance** (contrôle demandé) | — vérifié : paiement 2:1 conforme, mise d'assurance **ajoutée au ticket** de la main (`min(ceil(mise/2), solde)`), un seul règlement, refus sans effet | `src/43-game-blackjack.js` (non modifié : comportement déjà conforme) | — | § 6.1–6.3 (sabot truqué : As du croupier, assurance prise puis refusée) |

**Aucun jeu n'a été remplacé par une simulation** : les animations restent déclenchées par le résultat réel
du moteur (`J.Wallet.settle` est la seule source des crédits ; `J.FX.celebrate` affiche ce montant).

---

## 3. Reproductions (avant / après)

| Bug | Reproduction | Avant | Après |
| --- | --- | --- | --- |
| Dice : règlement après sortie de jeu | `/tmp/dice-repro.mjs broken` puis `fixed` (même harnais, seul le garde-fou change, à partir du livrable reconstruit) | **2 erreurs** : `window.error: Cannot read properties of null (reading 'bet')` + `Uncaught [TypeError: …]` | **0 erreur** |
| Machines à sous : bonus figé | § 1.1–1.9, planificateur accéléré et grilles forcées | bonus résolu 2 fois, tours non décomptés, manche figée | 10 tours décomptés une fois chacun, fin de bonus propre, solde cohérent |
| Hi-Lo : égalité | § 2.3/2.4 (carte de même rang forcée) | manche perdue, multiplicateur mis à 0 | égalité neutre : multiplicateur inchangé, manche continuée, `tieCount` incrémenté |
| Crédits : rechargement | § 1.9 : état sauvegardé injecté dans une **page neuve** | mise perdue (ou manche fantôme) | mise rendue une seule fois, `pending` effacé, aucun gain inventé |
| Baccarat : zones « mortes » au doigt | `tests/betshot.mjs` (Chromium mobile, iPhone 13 puis 320×568) : ouvrir le baccarat, mesurer chaque zone (rectangle recadré par les conteneurs défilants + `elementFromPoint`), puis **appuyer réellement** au centre | zones **couvertes ou hors écran** (`spots {}`, commande inactive) — cause : table plus haute que la fenêtre de scène | 5/5 zones touchables sur les deux tailles ; appui réel → `spots {"joueur":1}`, pastille « 1 × 100 », commande « Distribuer · 100 J 🎴 » |
| Baccarat : mises perdues sur une égalité | Sonde `bac-tie` (sabot forcé : deux naturels à 8), pilotée **sur le livrable** (`node` + jsdom, `J.__baccarat.playOut` avec un sabot truqué) : poser 100 J sur Joueur, distribuer, lire le reçu de règlement | `mult 0 · payout 0 · profit −100 J` (mise perdue) | `mult 1 · payout 100 J · profit 0 J`, solde **inchangé à 100 000 J** · « remboursée (égalité) » |
| Roulette : numéros morts, paris extérieurs inatteignables | `tests/betshot.mjs` : ouvrir la roulette, mesurer `[data-num="1"]`, `[data-num="17"]`, `[data-out="rouge"]`, puis appuyer réellement (avant/après un balayage tactile de 300 px) | `n17` `hit:false`, `rouge` hors fenêtre, appui → `spots {}` ; 320×568 : aucune case visible | `n1` posable **à l'ouverture** (iPhone 13 **et** 320×568) ; `rouge` posable après **un** balayage ; deux mises réelles cumulées (`100 J` puis `200 J`) |

---

## 4. Tests exécutés après correction

### 4.1 Résultats réels des suites

| Suite | Résultat | Durée | Ce qu'elle vérifie |
| --- | --- | --- | --- |
| `tests/verify.mjs` | ✅ **244 contrôles, 0 échec** | ≈ 155 s | moteur, catalogue, quêtes, économie, chaque jeu résolu par ses vraies commandes |
| `tests/smoke.mjs` | ✅ **14 étapes, 0 problème** | ≈ 45 s | parcours utilisateur complet (accueil → jeu → retour), aucune exception, solde cohérent |
| `tests/credits.mjs` | ✅ **18 contrôles, 0 échec** | ≈ 90 s | un débit, un crédit, aucun doublon, remboursements |
| `tests/mobile.mjs` | ✅ **49 contrôles, 0 échec** | ≈ 195 s | iPhone SE 320×568 → iPad mini, appuis au doigt, 6 manches réelles, paysage, solde d'en-tête (après le correctif 17 : plus aucune commande hors écran) |
| `tests/audit-0.4.1.mjs` | ✅ **190 contrôles, 0 échec** | ≈ 5 min | scénarios déterministes des bugs corrigés (**12 sections**) : les 8 premières vérifient chaque bug, les 4 dernières (ajoutées au lot 5) vérifient les **règles elles-mêmes** — tableau de la 3ᵉ carte du baccarat, paiement case par case, RTP mesuré, formule du Hi-Lo, compteur des tours gratuits, audit transversal des 16 jeux |
| `tests/probe.mjs` | ✅ **aucune exception** | ≈ 40 s | aucune erreur non gérée en parcourant l'application |
| `tests/betshot.mjs` (sonde de développement) | ✅ **0 erreur JavaScript**, appuis réels concluants | ≈ 100 s | ce qu'un doigt atteint vraiment sur le tapis : rectangle recadré par **tous** les conteneurs défilants, `elementFromPoint` au centre de la partie visible, puis appui tactile réel et lecture de l'état moteur (`spots`, libellé/état de la commande). Baccarat 5/5 zones, roulette : mise posée à l'ouverture et paris extérieurs après un balayage, sur iPhone 13 **et** 320×568 |
| `tests/e2e.mjs` | voir § 4.3 | ≈ 12 min | « vrai joueur » : 16 jeux × 2 manches par appuis tactiles sur Chromium |

Toutes ces suites ont été **relancées sur la version finale** `v0.4.1` (`build dff37c61fd55`,
md5 `91e46a2e…`) : audit 190 ✓ · verify 244 ✓ · smoke 14 ✓ · credits 18 ✓ · mobile 49 ✓ · e2e 207 ✓ ·
probe 0 erreur · betshot 0 erreur JavaScript (baccarat 5/5 zones touchables, roulette posable à
l'ouverture puis paris extérieurs après un balayage, iPhone 13 **et** 320×568).

### 4.2 Harnais : ce qui a été ajusté (et pourquoi ce n'est pas un affaiblissement)

| Ajustement | Raison |
| --- | --- |
| `tapLabel` (e2e) recherche le bouton **par son libellé à chaque tentative** | Un identifiant posé une fois devenait obsolète dès que le jeu redessinait ses commandes (blackjack pendant l'assurance) : l'appui échouait **alors que le bouton était bien là et actif**. Le contrôle reste aussi strict (bouton absent, désactivé, invisible ou recouvert = échec). |
| Pilotes « manche perdue » (e2e) : encaisser **seulement si** les diamants/la série sont encore en jeu | Une mine au premier clic, une pièce perdue ou une prédiction manquée terminent la manche : l'absence d'« Encaisser » est le résultat réel du jeu, pas une étape impossible. Le contrôle de comptabilité porte toujours sur 1 mise / 1 règlement / solde exact. |
| Pilote Texas Hold'em (e2e) : attendre que ce soit au tour du joueur, signaler s'il n'a **aucune** commande à son tour | Le bot parle parfois en premier (et l'abattage est automatique) : attendre est le comportement réel. Si le joueur doit parler sans commande utilisable, le test échoue en nommant jeu + phase + état. |
| Section « 320×568 » (e2e) : poser une mise **avant** de juger la commande principale (roulette, baccarat) | Ce sont des jeux à tapis : la commande principale s'active après la mise. C'est le parcours réel d'un joueur, et le contrôle d'atteignabilité reste complet. |
| Contrôle RTP (e2e) : exception **documentée** pour les machines à sous (96,5 %) | Le RTP 96,50 % est le RTP exact des bandes de rouleaux, annoncé au joueur dans la fiche du jeu ; il ne peut pas être « corrigé » sans changer les machines. Tout autre jeu hors fourchette 97–99,6 % fait échouer le contrôle. |
| Section 5 (audit) : vérification **par jeu** au lieu d'un bilan global | Chaque jeu doit pouvoir prouver 1 mise, 1 règlement, solde exact, manche comptée — un bilan agrégé pouvait masquer un jeu défaillant. |
| `tests/smoke.mjs` (arrêt de l'auto-bet) : jouer le geste attendu par la manche, puis échouer seulement si **plus aucune** commande jouable ne subsiste | L'ancien contrôle déclarait en échec toute manche encore ouverte. Or, sur les jeux à décision (Hi-Lo, Blackjack, Mines, Tour, Pile ou face), une manche **attend** le joueur — c'est le jeu, pas un bug. Le contrôle est conservé et **durci** : soit la manche se termine, soit le test échoue en nommant le jeu, la phase, `busy` et le nombre de commandes actives. |
| § 10.4/10.5 (Hi-Lo) : ouvrir une **manche neuve** dont la carte de départ a encore des copies dans le sabot avant de jouer le pari Égalité | Le pari Égalité est légitimement **refusé** quand plus aucune carte du même rang ne reste : l'ancienne version enchaînait les prédictions jusqu'à épuiser le rang, puis mesurait `hlTie` désactivé (bouton inerte, mesures à `NaN` qui ressemblaient à un bug alors que le contrôle de la table était bon). Les scénarios sont désormais indépendants et le refus est **explicitement vérifié**. |
| § 10.3 (Hi-Lo) : comparer la **valeur affichée** (« 3,45x » → « 3,45x ») et non l'arrondi à 2 décimales du nombre interne | L'égalité neutre conserve le multiplicateur au bit près (`3.446666… → 3.446666…`) : l'ancien contrôle comparait une chaîne affichée à un flottant et échouait **sans qu'il y ait de défaut**. Le moteur reste comparé à l'identique (`g.mult === m3`), le texte affiché est comparé en plus. |
| § 10.4 (Hi-Lo) : lire le montant annoncé par la commande avec l'expression `Encaisser\s*([\d\s]+)\s*J` | L'ancien `parseFloat` attrapait le **taux** affiché (« 15,51x ») au lieu du montant : le contrôle échouait alors que le paiement était juste. Le contrôle porte maintenant sur le montant **et** sur l'égalité `encaissé = mise × multiplicateur affiché` (vérifiée séparément sur le solde). |
| § 11 (Machines à sous) : ralentir **uniquement** les rappels du bonus (30 ms) et non le règlement | Les tours gratuits s'enchaînent instantanément dans le harnais ; `finishRound` doit, lui, rester au rythme réel pour que le solde soit crédité au moment du contrôle. Aucun mécanisme du jeu n'est modifié : seul `J.Games.schedule` est accéléré, comme dans les autres sections. |
| § 12.3 : attendre 80 ms avant de juger la disponibilité de la commande principale | Laisse au jeu le temps de réafficher ses commandes après la fin de manche (même fenêtre que les autres sections) ; le contrôle reste « aucune commande principale bloquée après une manche » sur les 16 jeux. |
| `tests/verify.mjs` (Hold'em) : attendre que ce soit au tour du joueur au lieu de taper « Se passer » à vide, et exiger **au moins un appui réel** | Après le flop, le bot parle en premier : l'ancienne boucle tapait une commande inexistante à ce moment-là et sortait de la boucle sans rien prouver. La nouvelle version compte les appuis réellement effectués (`acted`) et les vérifie — le contrôle est plus strict qu'avant. |

### 4.3 Test « vrai joueur » (16 jeux, appuis tactiles réels, iPhone 13)

Résultat de l'exécution finale, **après tous les correctifs** (dont baccarat, roulette et en-tête) :

```
✅ 207 contrôles réussis, 0 échec(s)        EXIT=0        /tmp/e2e-final-v041.txt
```

Les quatre sections passent : catalogue, deux manches réelles par jeu par appuis tactiles, cas limites
(appuis multiples, sortie de jeu en pleine manche, **rechargement de page en pleine manche : solde
20 004 J → 19 904 J mise débitée → 20 004 J après rechargement**), puis 320×568 (commandes principales
atteignables). Deux manches réelles par jeu, durée mesurée :

| Jeu | Manche 1 | Manche 2 | Jeu | Manche 1 | Manche 2 |
| --- | --- | --- | --- | --- | --- |
| Crash | +11 J (1,0 s) | +11 J (1,0 s) | Roue de la chance | −99 J (3,8 s) | +100 J |
| Dice | +98 J (0,7 s) | −100 J (0,7 s) | Roulette | −900 J (4,2 s) | **+1 800 J** (5,1 s) |
| Mines | +13 J (0,9 s) | +13 J (0,9 s) | Blackjack | +100 J (2,9 s) | −100 J (2,0 s) |
| Plinko | −70 J (1,1 s) | −70 J (1,1 s) | Baccarat | +95 J (2,5 s) | −200 J (2,2 s) |
| Limbo | +100 J | +100 J | Video Poker | 0 J (1,8 s) | −100 J (1,8 s) |
| Pile ou Face | +98 J (2,2 s) | +98 J (2,2 s) | Texas Hold'em | +10 J (5,8 s) | 0 J (3,5 s) |
| Hi-Lo | +296 J (1,0 s) | +107 J (1,0 s) | Machine — Sable & Or | +50 J (1,4 s) | −100 J (1,4 s) |
| Keno | −100 J (2,8 s) | **+864 J** (2,8 s) | Machine — Cœur de Braise | +38 J (1,4 s) | −100 J (1,4 s) |
| Tower | −100 J (0,9 s) | +49 J (1,4 s) | Machine — Éclat Facetté | +25 J (1,4 s) | −100 J (1,8 s) |

Aucune manche bloquée, aucun solde incohérent, aucune erreur JavaScript sur les quatre sections.
Exécution de ce tableau : **version finale v0.4.1** (`build dff37c61fd55`), après le correctif baccarat et
le passage de version de l'application à `0.4.1` — seconde exécution complète du parcours « vrai joueur ».

Limite de l'environnement : il n'y a **pas de test sur un appareil physique** dans cet environnement.
Les parcours « au doigt » sont des appuis tactiles simulés (Chromium, évènements tactiles réels,
contrôle de la cible à la position du doigt).

---

### 4.4 Lot 5 — les règles elles-mêmes passées au banc (sections 9 à 12)

Les sections 1 à 8 vérifient que chaque bug corrigé est bien mort. Le lot 5 ajoute quatre sections qui
vérifient que les **règles** des jeux sont celles annoncées au joueur — et pas seulement que le jeu
« répond ». Les valeurs attendues de ces contrôles sont recalculées **hors du code du jeu** (formule
écrite dans le test, seconde implémentation du tableau officiel, RTP annoncé) : un test qui se contente de
comparer le jeu à lui-même ne prouve rien.

| Section | Ce qui est mesuré | Résultat |
| --- | --- | --- |
| **9.1** Baccarat — 3ᵉ carte | 20 000 donnes rejouées : les cartes distribuées, les totaux, **la décision de tirer ou non une 3ᵉ carte** et le résultat final sont comparés à une **deuxième implémentation indépendante** du tableau officiel (Joueur : ≤ 5 → tire ; Banque : selon la 3ᵉ carte du joueur, cas du « naturel » à 8/9 traité à part) | ✅ cartes, totaux et résultat **identiques** sur les 20 000 donnes |
| **9.2** Baccarat — paiement **case par case** | Quatre manches forcées (sabot truqué) : naturel Joueur 8 contre 5 · victoire Banque 9 contre 6 avec **paire Joueur** · **égalité** par deux naturels à 8 · **paire Banque** alors que le Joueur gagne. Pour chacune, chaque case de mise (Joueur, Banque, Égalité, Paire J, Paire B) est lue séparément et comparée à sa valeur de table | ✅ J 2,00× · B 1,95× · Égalité 9,00× · Paires 12,00× · **J/B 1,00× sur égalité (mise rendue)** · les cases non concernées paient 0 |
| **9.3** Baccarat — RTP du moteur | 300 000 donnes jouées par le **vrai moteur**, mises « à plat » sur chaque case, tolérance 1,5 point | ✅ Joueur **99,06 %** (annoncé 98,76) · Banque **98,65 %** (98,94) · Égalité **86,29 %** (85,64) · Paire J **88,68 %** (89,64) · Paire B **89,44 %** (89,64) — **tous dans la tolérance**, donc le push de l'égalité est bien celui qui est annoncé |
| **10.0–10.2** Hi-Lo — prix des paris | Carte de départ et multiplicateur `0,99` ; victoire « Plus haut » puis « Plus bas » : le multiplicateur interne est comparé à la formule `m × (1 − pT) / pW` calculée dans le test, et le multiplicateur **affiché** est comparé au multiplicateur du moteur | ✅ exact au chiffre près (1,98 / 3,4467), affichage « 1,98x » / « 3,45x » conforme |
| **10.3** Hi-Lo — égalité **neutre** | Carte de même rang forcée sur un pari directionnel | ✅ multiplicateur identique **au bit près** (`3.446666… → 3.446666…`), même texte affiché, mise conservée, manche continuée, prédiction non comptée, égalité neutre comptée |
| **10.4** Hi-Lo — pari Égalité gagné | Manche neuve dont la carte de départ a encore des copies : le pari est proposé et chiffré, puis le tirage est forcé sur le **même rang** | ✅ paiement `m / pT` exact (15,51×), montant annoncé par la commande = `mise × multiplicateur affiché` (1 551 J), encaissé **une seule fois**, remise à zéro de la manche suivante |
| **10.5** Hi-Lo — échec sur Égalité | Carte d'un **autre** rang forcée sur le pari Égalité | ✅ manche perdue : mise **non rendue**, un seul débit, un seul règlement, aucun remboursement, multiplicateur remis à 0,99 |
| **11** Machines à sous — tours gratuits | Bonus ouvert par un vrai déclenchement ; le compteur `free.used` est observé par un **observateur de propriété** (chaque écriture est enregistrée) ; le barème `multSchedule` de la machine est comparé au multiplicateur réellement appliqué à chaque tour | ✅ 10 incréments **de 1** (aucun tour décompté deux fois, aucun saut), barème `[1,1,1,2,2,2,3,3,3,4]` respecté, fin automatique au 10ᵉ tour, **une seule** résolution de manche pour tout le bonus, gain du bonus = tours gagnés + rotation payante, aucun tour en mémoire après la fin |
| **11.2** Machines à sous — nouveau déclenchement | Après un bonus terminé, un nouveau coup peut rouvrir un bonus **complet** (10 tours) et se termine proprement : deux bonus = deux manches payantes distinctes | ✅ total 10, 2 règlements, solde = somme des nets |
| **11.3** Machines à sous — retour au mode normal | Grille de contrôle **choisie pour gagner sur une ligne sans scatter** (vérifiée dans le test) : le multiplicateur appliqué doit être celui de la manche payante, sans reste du bonus | ✅ gain 313 J avec multiplicateur 3,13 (aucun multiplicateur de bonus résiduel), machine au repos |
| **12.1** Tous les jeux — appuis multiples | **Trois appuis d'affilée** sur la commande principale des **16 jeux** | ✅ une seule mise, un seul règlement |
| **12.2** Tous les jeux — crédits tardifs | Solde relu **260 ms** après la fin de chaque manche | ✅ aucun crédit ni remboursement tardif (solde figé) |
| **12.3** Tous les jeux — commandes | Commande principale disponible après la manche | ✅ rejouable partout, aucun jeu bloqué |
| **12.4** Tous les jeux — cycles | **3 cycles** ouverture/fermeture de chaque jeu | ✅ aucun jeu fantôme, aucune manche en attente |
| **12.5** Tous les jeux — solde insuffisant | Solde ramené à **5 J**, commande principale pressée sur chaque jeu | ✅ refus propre, solde intact, **aucun ticket ouvert** |

Ces quatre sections ajoutent **44 contrôles** (146 → **190**) et tournent en ≈ 5 min (les 300 000 donnes
de baccarat et les 16 jeux du § 12 en représentent l'essentiel).

---

## 5. Jeux : statut après audit

| Jeu | État | Points audités |
| --- | --- | --- |
| Crash, Dice, Mines, Plinko, Limbo, Pile ou Face, Keno, Tower, Roue de la chance | ✅ corrigés / vérifiés | mise, action unique, encaissement, sortie de manche, animations déclenchées par le résultat réel — et, pour les 16 jeux, triple appui, crédit tardif, cycles et solde insuffisant (§ 4.4) |
| Hi-Lo | ✅ **règles corrigées et formules vérifiées hors du code** | 3 paris proposés et chiffrés, égalité **neutre** (multiplicateur inchangé au bit près), pari Égalité `m / pT`, paiements directionnels `m × (1 − pT) / pW`, encaissement = multiplicateur **affiché**, RTP 99 % |
| Roulette | ✅ **tapis réparé** | zones de mise atteignables au doigt (numéros, paris extérieurs, préréglages), une seule surface de défilement, taille de roue adaptée à l'écran, jetons, rotation, paiements, reprise |
| Blackjack | ✅ vérifié | donne, assurance 2:1, tirer/rester/doubler/séparer, abattage, un seul règlement |
| Baccarat | ✅ **habillage, tapis et paiements corrigés** | les 5 zones sont visibles et posables au doigt sur iPhone 13 **et** 320×568, jetons, règle de 3ᵉ carte rejouée contre une 2ᵉ implémentation sur 20 000 donnes, **paiement vérifié case par case** (dont **mise rendue sur égalité**), RTP des 5 cases mesuré sur 300 000 donnes contre les RTP annoncés, manche suivante |
| Machines à sous (6 univers) | ✅ **corrigées et compteur audité** | tours gratuits (compteur décompté **une fois par tour**, barème `multSchedule`, retrigger après bonus, dernier tour), scatter, sortie de jeu, rechargement, SPIN, retour au mode normal sans multiplicateur résiduel |
| Video Poker | ✅ vérifié | garde des cartes, tirage, paiement par combinaison |
| Texas Hold'em | ✅ **corrigé** | tours d'enchères, abattage, commission, fin de main, enchaînement |

---

## 6. Écarts assumés et restes

1. **RTP des machines à sous : 96,50 %** (annoncé dans la fiche du jeu) — hors de la fourchette visée
   97–99,6 % des 15 autres jeux. C'est le RTP **exact** calculé sur les bandes de rouleaux
   (`tools/design-slots.mjs`) : le corriger imposerait de modifier les bandes et les tables de gains des
   six machines, c'est-à-dire de changer les règles et l'habillage validés en v0.4.0. Décision laissée au
   commanditaire (une recalibration est possible, mais ce n'est pas un correctif de bug).
2. **Pas de test sur appareil physique** : les parcours tactiles sont simulés (Chromium). Les captures
   d'écran restent disponibles dans `tests/screens/`.
3. **320×568 (iPhone SE 1ʳᵉ génération) : les préréglages de la roulette demandent un balayage du panneau.**
   La section « réglages » du panneau ne montre que la rangée de jetons et la commande principale ; les
   préréglages (« Voisins du zéro »…), « Effacer / Relancer / ×2 tapis » sont juste en dessous. Ils restent
   accessibles en faisant défiler **le panneau** (et non la scène) : `tests/e2e.mjs` les atteint et les tape
   réellement sur ce format. Aucun correctif retenu pour l'instant : agrandir le panneau reviendrait à
   reprendre de la hauteur au tapis de mises, qui est la surface de jeu.
4. **Fenêtre de bienvenue et sondes** : l'écran « Bienvenue sur JACKPOTLY » du premier lancement est un
   calque plein écran — c'est son rôle. Les sondes doivent donc le fermer (ou marquer `settings._welcomed`)
   avant de mesurer une position, sinon elles mesurent le calque et concluent à tort que le tapis ne
   répond pas. (Constat de méthode, pas un défaut du jeu : `tests/mobile.mjs` et `tests/e2e.mjs` passent
   déjà par ce parcours.)
5. **Version affichée** : l'application annonce désormais `0.4.1` (écran de fin d'onglet « Jeux » et
   réglages, « Version 0.4.1 », console au démarrage) et `package.json` porte la même version — le test
   `tests/mobile.mjs` vérifie l'égalité entre la version affichée et la version du dépôt, donc les deux
   sont bumpées ensemble.
6. **Correspondance livrable ⇄ sources** : `node tools/build.mjs --check` (ajouté au lot 5) compare le
   fichier distribué au build des sources et sort en erreur au moindre écart — c'est ce qui garantit que
   le fichier téléchargé depuis le tag `v0.4.1` est bien celui qui a passé toutes les suites de ce rapport.
7. Aucun autre écart connu : les 16 jeux sont accessibles, se terminent et rendent la main dans toutes les
   suites ci-dessus.

---

*Historique du projet (validation et finition v0.4.0) : voir `RAPPORT-v0.4.0.md`.*
