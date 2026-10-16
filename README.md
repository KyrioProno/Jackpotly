# JACKPOTLY — casino social de divertissement

Simulateur de casino social **mobile-first** (portrait), inspiré de l'ambiance Stake.
Livré en **un seul fichier HTML autonome** : `jackpotly.html` (aucune dépendance, aucune requête réseau).

> ⚠️ **Jetons virtuels sans aucune valeur monétaire.** Aucun retrait, aucune conversion en argent
> ou en cadeaux, aucun échange entre joueurs. Aucun pari sportif. L'argent réel n'intervient que
> pour l'achat de packs de jetons (paiement **simulé** dans cette version). **18+.**

---

## 1. Livrable

| Fichier | Rôle |
|---|---|
| **`jackpotly.html`** | **Le jeu complet** — HTML + CSS + JS en ligne, à ouvrir directement dans un navigateur mobile. |
| `index.html` | Copie identique générée par le build, servie par l'aperçu / GitHub Pages. |
| `src/` | Sources séparées (design system, modules JS, un fichier par jeu). |
| `tools/build.mjs` | Assemble les sources en `jackpotly.html` + contrôles d'intégrité. |
| `tools/serve.mjs` | Serveur de développement sans dépendance (`PORT=4173 npm run serve`). |
| `tests/` | Suites de vérification (mathématiques, crypto, parcours interface). |

```bash
npm run build     # reconstruit jackpotly.html (+ index.html)
npm test          # build + 243 contrôles + 14 étapes de parcours
npm run serve     # http://localhost:4173
```

`node_modules/` n'est nécessaire que pour les tests (`npm install --no-save jsdom`).
Le jeu lui-même ne dépend de **rien**.

### Tester le jeu sans jeton d'accès

L'aperçu live d'Arena passe par le proxy du sandbox, qui **exige un jeton** : l'URL nue
(`https://<port>-<sandbox>.e2b.app`) affiche une demande de token si on l'ouvre directement.
Le jeu n'ayant besoin d'aucun serveur, voici trois voies qui n'utilisent aucun jeton :

**1. Rendu direct dans le navigateur (un tap, aucune installation)** — fichiers figés sur le tag `v0.3.0` :

- https://cdn.jsdelivr.net/gh/KyrioProno/Jackpotly@v0.3.0/jackpotly.html
- https://cdn.statically.io/gh/KyrioProno/Jackpotly/v0.3.0/jackpotly.html
- https://raw.githack.com/KyrioProno/Jackpotly/v0.3.0/jackpotly.html
- https://htmlpreview.github.io/?https://github.com/KyrioProno/Jackpotly/blob/v0.3.0/jackpotly.html

**2. Téléchargement puis lecture hors ligne (le plus fiable sur mobile)**

- Fichier : https://github.com/KyrioProno/Jackpotly/blob/v0.3.0/jackpotly.html → « Download raw file »
- Archive complète : https://github.com/KyrioProno/Jackpotly/releases/tag/v0.3.0
- Ensuite : ouvrir `jackpotly.html` dans le navigateur, ou « Ajouter à l'écran d'accueil »
  pour l'avoir en plein écran. Aucune connexion n'est nécessaire pour jouer.

**3. URL permanente (GitHub Pages)** — nécessite l'activation par le propriétaire du dépôt
(le jeton de la session n'a pas la permission `pages:write`) :

> Settings → Pages → *Source* : « Deploy from a branch » → *Branche* : `arena/5d3a1cfc-jackpotly`,
> *Dossier* : `/ (root)` → Save

L'application est alors servie sur **https://kyrioprono.github.io/Jackpotly/**
(le fichier à la racine du dépôt est `index.html`, copie exacte de `jackpotly.html`).

---

## 2. Architecture

```
src/00-head.html        <head>, métas mobiles, PWA basique
src/01-styles.css       Design system (tokens → base → composants → animations)
src/10-body.html        Structure : splash, barre supérieure, 6 écrans, nav, calques
src/20-core.js          Namespace JACKPOTLY, utilitaires, bus d'événements, Store (localStorage)
src/21-fair.js          SHA-256 + HMAC-SHA256 en JS pur, générateur provably fair
src/22-audio-fx.js      Audio synthétisé (WebAudio), vibrations, confettis, toasts
src/23-wallet.js        Portefeuille : mise, résolution, stats, historique, VIP
src/24-ui.js            Navigation, modales, feuilles, menu, réglages, Fair Play, jeu responsable
src/24b-cards.js        Cartes & évaluateur de poker (fréquences exactes des 2 598 960 mains)
src/25-social.js        Quêtes du jour, classement de bots, faux flux de gros gains
src/26-rewards.js       Bonus quotidien, roue de la chance, recharge gratuite
src/27-screens.js       Rendu des écrans (lobby, catalogue, classement, boutique, profil)
src/28-games-core.js    Moteur de jeux : coque, panneau de mise, auto-bet, registre
src/29-catalogue-soon.js Helper `soon()` pour les futurs jeux (feuille de route vide)
src/30..33-game-*.js    Crash · Dice · Mines · Plinko                  (vague 1)
src/34-shop.js          Packs, limite de dépenses, adaptateur de paiement (IAP-ready)
src/35..41-game-*.js    Limbo · Coin Flip · Hi-Lo · Keno · Tower · Wheel  (vague 2)
src/40-slots-tables.js  Bandes calibrées des 3 thèmes de machines à sous
src/42..47-game-*.js    Roulette · Blackjack · Baccarat · Slots · Video Poker · Hold'em (vague 3)
src/50-boot.js          Démarrage, écran de bienvenue, sauvegarde périodique
tools/design-tables.mjs Générateur/vérificateur des tables de gains du Keno
tools/design-slots.mjs  RTP exact des bandes de machines à sous (mode --tune)
tools/probe.mjs         Sonde : clique tous les boutons d'un jeu et traque les exceptions
```

### Règles d'architecture

- **Une seule source de vérité du solde** : `J.Wallet`. Aucun jeu ne modifie le solde : il appelle
  `stake()` (débit immédiat) puis `settle(mult)` ou `refund()`. Toute la comptabilité (stats,
  historique, VIP, quêtes) découle de ces deux appels.
- **Contrat d'un jeu** (module autonome) :
  `{ id, name, icon, color, rtp, tagline, rules, volatility, category, hot,
     state(g), stage(g), controls(g), actions(g), payoutHint(g),
     mount(g), start(g), stop(g), cashout(g) }`
  → ajouter un jeu = créer un fichier `src/3x-game-xxx.js` et appeler `J.Games.register({…})`.
  Aucune modification du moteur n'est nécessaire.
- **Communication par bus** : `J.Bus.emit('wallet:settled', …)` alimente quêtes, flux live, stats
  et re-rendus d'écrans, sans couplage direct.
- **Auto-bet mutualisé** : nombre de parties, stop au gain, stop à la perte, stop au multiplicateur,
  vitesse (lente → turbo), augmentation de mise en % après une perte. Les jeux n'implémentent que
  `start(g)` et terminent par `J.Games.finish(g, multiplicateur)`.
- **Anti-double-clic** : chaque manche est protégée par `g.busy` ; un ticket ouvert est remboursé
  automatiquement si l'on quitte le jeu (`Games.close`). Les boutons qui doivent rester actifs
  PENDANT une manche (tirer au blackjack, suivre au Hold'em, tirer au Video Poker) portent
  `alsoWhenBusy: true` — sans quoi le moteur les neutralise, et le jeu devient injouable.
- **Mises multiples** (roulette, baccarat) : le tapis porte des jetons pondérés ; le gain est
  calculé en proportion du montant réellement débité (`mult = Σ gagnantes / Σ posées × rapport`),
  ce qui garde un RTP exact quel que soit le montant de la manche.
- **Persistance** : un objet d'état versionné dans `localStorage` (`jackpotly.state.v1`), écriture
  différée (220 ms), flush sur `pagehide`, sauvegarde de secours toutes les 20 s.

---

## 3. Fair Play (provably fair)

Chaque tirage dérive de :

```
aléa = HMAC_SHA256(serverSeed, clientSeed + ":" + nonce + ":" + curseur)
float = (octet0/256) + (octet1/65536) + (octet2/16777216) + (octet3/4294967296)
```

- Le **hash SHA-256 du serverSeed** est publié avant les mises (engagé) ; la graine reste secrète.
- La graine est **révélée** lors d'une rotation : tous les tirages passés deviennent vérifiables.
- La **clientSeed** est modifiable par le joueur ; le nonce change à chaque pari.
- L'écran *Fair Play* contient un **vérificateur** qui recalcule le HMAC d'un tirage donné.
- Implémentation SHA-256 / HMAC-SHA256 en JavaScript pur, validée par des vecteurs de test connus
  (RFC 4231 inclus) dans `tests/verify.mjs`.

---

## 4. Jeux jouables (16)

### Originals (10)

| Jeu | Principe | RTP | Volatilité |
|---|---|---|---|
| **Crash** | Multiplicateur croissant, encaissement libre avant l'explosion | 99 % | moyenne (au choix) |
| **Dice** | Over/Under, seuil réglable de 0,01 % à 98 % de chances | 99 % | au choix |
| **Mines** | Grille 5×5, 1 à 24 mines, gain progressif | 99 % | progressive |
| **Plinko** | 3 risques × 8 à 16 lignes, tables de gains standard | 99 % | au choix |
| **Limbo** | Multiplicateur cible, tirage `0,99/(1−u)` | 99 % | au choix |
| **Coin Flip** | Pile ou face en série, `0,99 × 2ⁿ`, encaissement à chaque lancer | 99 % | progressive |
| **Hi-Lo** | Plus haut / plus bas sur 52 cartes sans remise | 99 % | progressive |
| **Keno** | 1 à 10 numéros sur 40, 3 risques, tirage de 10 boules | 97,5 % | au choix |
| **Tower** | 8 étages, 5 difficultés, encaissement à chaque étage | 99 % | progressive |
| **Wheel** | 60 segments, 8 cibles, gains jusqu'à 50x | 97 % | au choix |

### Classiques (6)

| Jeu | Principe | RTP exact | Volatilité |
|---|---|---|---|
| **Roulette européenne** | Cylindre réel à 37 cases, 14 types de mises + 4 mises annoncées | **97,297 %** (36/37) | au choix |
| **Blackjack** | 6 jeux, S17, hit/stand/doubler/séparer (≤ 4 mains), assurance 2:1, naturel 3:2 | **99,5 %** | faible |
| **Baccarat** | Punto Banco officiel, 8 jeux, règles de la 3ᵉ carte ; Banque 0,95:1 · Joueur 1:1 · Égalité 9:1 · Paires 11:1 | **98,94 %** (Banque) | faible |
| **Machines à sous** | 3 thèmes, 5 rouleaux × 40 symboles, 20 lignes, scatters, 10 tours gratuits, multiplicateurs | **96,50 %** (exact) | au choix (1→20 lignes) |
| **Video Poker** | Jacks or Better **9/6 full pay**, garde optimale calculée (1,07 M de tirages) | **99,54 %** | faible |
| **Texas Hold'em** | Tête-à-tête contre un bot Monte-Carlo ; commission de table 2 % (plafond 500 J) | **≈ 98 %** | au choix (tapis) |

Mathématiques (vérifiées automatiquement) :

```
Dice      : mult = 99 / chance(%)                   → chance × mult = 99 %
Mines     : mult(k) = 0,99 × Π (25−i)/(25−mines−i)   → P(k cases sûres) × mult(k) = 99 %
Plinko    : Σ C(n,k)/2ⁿ × caisse(k) = 0,99           → 27 combinaisons (9 lignes × 3 risques)
Crash     : crash = 0,99/(1−u) ⇒ P(crash ≥ m) = 0,99/m → cash out fixe à m x : RTP = 99 %
Limbo     : résultat = 0,99/(1−u)                     → P(résultat ≥ T) × T = 99 %
Coin Flip : mult(n) = 0,99 × 2ⁿ                       → (1/2)ⁿ × mult(n) = 99 % pour n = 1…12
Hi-Lo     : mult = 0,99 / P(prédiction), P exacte par comptage des 52 cartes (sans remise)
Keno      : tables générées pour 97,5 % (30 configurations vérifiées, 68 660x max)
Tower     : mult(f) = 0,99 / pᶠ avec p = (ouvertures − pièges)/ouvertures → RTP 99 %
Wheel     : moyenne des 60 segments = 0,97 pour chacune des 8 cibles → RTP 97 %
Roulette  : toute mise payant mult sur n numéros → n/37 × mult = 36/37 = 97,297 %
Blackjack : stratégie de base mesurée sur 200 000 mains simulées ≈ 99,5 % (S17, 3:2)
Baccarat  : Banque 0,95 × 45,86 % + 9,52 % = 98,94 % · Joueur 44,62 % + 9,52 % = 98,76 %
Slots     : Σ lignes + scatters + tours gratuits calculé sur les bandes = 96,4997 %
VP 9/6    : espérances exactes sur 1,07 M de tirages par décision → 99,54 % en jeu optimal
Hold'em   : équité Monte-Carlo (250 tirages) vs cotes du pot, rake 2 % plafonné 500 J
```

Vitesse de montée de Crash calibrée : 2x ≈ 4 s · 5x ≈ 9 s · 10x ≈ 13 s · 100x ≈ 25 s.

## 5. Boutique et achats intégrés

- **5 packs** : 5 000 / 25 000 / 100 000 / 500 000 jetons + offre « premier achat » à prix réduit.
- **Tunnel d'achat complet** : confirmation, exécution du paiement, reçu (`transactionId`), crédit des
  jetons, journal des achats.
- **Adaptateur interchangeable** : `J.Shop.registerProvider(provider)` prend un objet
  `{ id, label, available(), buy(pack) → Promise<{ok, transactionId, receipt}> }`.
  Brancher l'App Store ou le Play Store = implémenter ces 3 méthodes, **sans toucher au reste**.
- **Limite de dépenses mensuelle** : baisse immédiate, hausse différée au mois suivant, option « Bloqué ».
- Paiement **simulé** dans cette version : aucun débit réel.

## 6. Feuille de route

**Vague 3 — livrée en 0.3.0.** Les 16 jeux demandés sont en ligne et jouables :
Roulette européenne (toutes les mises), Blackjack (hit/stand/double/split/assurance),
Baccarat, Machines à sous (3 thèmes), Video Poker Jacks or Better et Texas Hold'em contre un bot.
La feuille de route du catalogue est **vide** : plus aucun jeu n'est annoncé « bientôt »
(`src/29-catalogue-soon.js` ne contient plus que le helper `soon()` destiné aux ajouts futurs).

Améliorations qui resteraient à faire (aucune n'est nécessaire pour jouer) :

- **Sons** : les bruitages sont synthétisés en Web Audio ; des échantillons de meilleure qualité
  seraient plus « premium » (mais casseraient l'absence de dépendance externe).
- **Machines à sous** : les rouleaux utilisent des bandes virtuelles tirées après le clic ;
  une vraie animation de décélération par rouleau (comme la roulette) serait plus spectaculaire.
- **Hold'em** : le bot joue correctement (équité vs cotes du pot) mais sans mémoire des mains
  passées ni position ; un adversaire plus varié demanderait un modèle de range.
- **Blackjack** : S17 uniquement, pas de « surrender » ni de « double after split » réglables.
- **Roulette** : cylindre européen seul (pas de mise « à cheval sur trois » atypique).
- **Performance** : le fichier fait 469 Ko ; une minification sans perte le ramènerait à ~250 Ko.
- **Internationalisation** : tout est en français, aucune bascule multi-langue.

---

## 7. Conformité et jeu responsable

- Mention « jetons virtuels sans valeur monétaire, divertissement uniquement, 18+ » présente dans la
  boutique, les mentions légales, l'écran d'accueil et après chaque achat.
- **Limite de dépenses mensuelle** choisie par le joueur : baisse immédiate, hausse différée au mois
  suivant (garde-fou anti-impulsion), option « Bloqué ».
- Pas de retrait, pas de conversion, pas d'échange entre joueurs, pas de paris sportifs.
- **Rappel de pause toutes les 30 minutes** (désactivable), écran *Jeu responsable* avec temps de jeu,
  total misé, RTP constaté, et les lignes d'écoute françaises (Joueurs Info Service — 09 74 75 13 13).
- Recharge gratuite limitée à 3/jour avec délai d'attente obligatoire.
- Le mode auto-bet est borné (max 500 parties), avec arrêts automatiques gain/perte/multiplicateur.

---

## 8. Tests

```bash
npm test
```

- `tests/verify.mjs` — **243 contrôles** : démarrage, vecteurs cryptographiques, uniformité des tirages,
  RTP **simulés sur 100 000+ parties**, portefeuille, VIP, quêtes, récompenses, persistance,
  limite de dépenses, parcours d'interface complets.
  Les six jeux classiques y sont contrôlés **par les mathématiques** : les 2 598 960 mains de poker
  énumérées (fréquences exactes des 10 catégories), les 14 types de mises de la roulette à
  **36/37 = 97,297 %**, 200 000 donnes de baccarat (Banque 45,86 % · Joueur 44,62 % · Égalité 9,52 %),
  le RTP exact des 3 machines à sous calculé sur leurs bandes, les espérances exactes du Video Poker
  9/6 (jeu optimal = **99,54 %**), 200 000 mains de blackjack jouées à la stratégie de base, et
  l'équité Monte-Carlo du Hold'em. Une dernière section joue **une manche complète au doigt** sur
  chacun des 6 classiques (rotation, tirage, distribution, arrêt des rouleaux, abattage).
- `tests/smoke.mjs` — 14 étapes qui parcourent toute l'application (chaque écran, chaque modale,
  chaque réglage, les **16 jeux** avec toutes leurs commandes, l'auto-bet, la boutique, la roue,
  la recharge) en vérifiant qu'aucune exception ni message d'erreur n'apparaît et que l'état
  reste cohérent.
- `tests/probe.mjs` — sonde de développement : monte un jeu dans un DOM simulé et clique **tous**
  ses boutons un par un pour traquer les exceptions avant d'écrire les tests définitifs
  (`node tests/probe.mjs roulette 2`).
- `node tools/design-tables.mjs` — régénère les tables de gains du Keno avec un RTP cible donné.
- `node tools/design-slots.mjs` — recalcul analytique du RTP exact des 3 thèmes de machines à sous
  (bandes, scatters, tours gratuits) ; `--tune` ajuste les bandes vers la cible.
