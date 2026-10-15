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
npm test          # build + 113 contrôles + 13 étapes de parcours
npm run serve     # http://localhost:4173
```

`node_modules/` n'est nécessaire que pour les tests (`npm install --no-save jsdom`).
Le jeu lui-même ne dépend de **rien**.

### Tester le jeu sans jeton d'accès

L'aperçu live d'Arena passe par le proxy du sandbox, qui **exige un jeton** : l'URL nue
(`https://<port>-<sandbox>.e2b.app`) affiche une demande de token si on l'ouvre directement.
Le jeu n'ayant besoin d'aucun serveur, voici trois voies qui n'utilisent aucun jeton :

**1. Rendu direct dans le navigateur (un tap, aucune installation)** — fichiers figés sur le tag `v0.1.0` :

- https://cdn.jsdelivr.net/gh/KyrioProno/Jackpotly@v0.1.0/jackpotly.html
- https://cdn.statically.io/gh/KyrioProno/Jackpotly/v0.1.0/jackpotly.html
- https://raw.githack.com/KyrioProno/Jackpotly/v0.1.0/jackpotly.html
- https://htmlpreview.github.io/?https://github.com/KyrioProno/Jackpotly/blob/v0.1.0/jackpotly.html

**2. Téléchargement puis lecture hors ligne (le plus fiable sur mobile)**

- Fichier : https://github.com/KyrioProno/Jackpotly/blob/v0.1.0/jackpotly.html → « Download raw file »
- Archive complète : https://github.com/KyrioProno/Jackpotly/releases/tag/v0.1.0
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
src/25-social.js        Quêtes du jour, classement de bots, faux flux de gros gains
src/26-rewards.js       Bonus quotidien, roue de la chance, recharge gratuite
src/27-screens.js       Rendu des écrans (lobby, catalogue, classement, boutique, profil)
src/28-games-core.js    Moteur de jeux : coque, panneau de mise, auto-bet, registre
src/29-catalogue-soon.js Feuille de route (12 jeux déclarés avec RTP prévu)
src/30..33-game-*.js    Crash · Dice · Mines · Plinko
src/34-shop.js          Packs, limite de dépenses, adaptateur de paiement (IAP-ready)
src/40-boot.js          Démarrage, écran de bienvenue, sauvegarde périodique
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
  automatiquement si l'on quitte le jeu (`Games.close`).
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

## 4. Jeux — vague 1 (jouables)

| Jeu | Principe | RTP | Volatilité |
|---|---|---|---|
| **Crash** | Multiplicateur croissant, encaissement libre avant l'explosion | 99 % | moyenne (au choix) |
| **Dice** | Over/Under, seuil réglable de 0,01 % à 98 % de chances | 99 % | au choix |
| **Mines** | Grille 5×5, 1 à 24 mines, gain progressif | 99 % | progressive |
| **Plinko** | 3 risques × 8 à 16 lignes, tables de gains standard | 99 % | au choix |

Mathématiques (vérifiées automatiquement) :

```
Dice    : mult = 99 / chance(%)                     → chance × mult = 99 %
Mines   : mult(k) = 0,99 × Π (25−i)/(25−mines−i)     → P(k cases sûres) × mult(k) = 99 %
Plinko  : Σ C(n,k)/2ⁿ × caisse(k) = 0,99             → 27 combinaisons (9 lignes × 3 risques)
Crash   : crash = 0,99/(1−u) ⇒ P(crash ≥ m) = 0,99/m → cash out fixe à m x : RTP = 99 %
```

Vitesse de montée de Crash calibrée : 2x ≈ 4 s · 5x ≈ 9 s · 10x ≈ 13 s · 100x ≈ 25 s.

## 5. Feuille de route

**Vague 2 — autres Originals + boutique complète**
Limbo · Coin Flip · Hi-Lo · Keno · Tower · Wheel
+ branchement du paiement réel via l'adaptateur `J.Shop.registerProvider()` (StoreKit / Play Billing),
interface de packs finale, reçus et restauration d'achats.

**Vague 3 — classiques**
Roulette européenne (toutes les mises) · Blackjack (hit/stand/double/split/assurance) · Baccarat ·
3 machines à sous (5 rouleaux, lignes, tours gratuits, multiplicateurs) · Video Poker Jacks or Better ·
Texas Hold'em contre bots.

Les 12 jeux sont déjà déclarés dans le catalogue (`src/29-catalogue-soon.js`) avec leur RTP prévu,
leur règle et leur vague : il ne reste qu'à remplacer `status: 'soon'` par une implémentation.

---

## 6. Conformité et jeu responsable

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

## 7. Tests

```bash
npm test
```

- `tests/verify.mjs` — 113 contrôles : démarrage, vecteurs cryptographiques, uniformité des tirages,
  RTP **simulés sur 100 000+ parties**, portefeuille, VIP, quêtes, récompenses, persistance,
  limite de dépenses, parcours d'interface complets.
- `tests/smoke.mjs` — 13 étapes qui parcourent toute l'application (chaque écran, chaque modale,
  chaque réglage, les 4 jeux, l'auto-bet, la boutique, la roue, la recharge) en vérifiant
  qu'aucune exception ni message d'erreur n'apparaît et que l'état reste cohérent.
