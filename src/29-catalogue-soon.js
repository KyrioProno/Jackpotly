/* =========================================================================
   JACKPOTLY — CATALOGUE (feuille de route)
   Déclaration des jeux non encore développés : ils apparaissent dans le
   catalogue avec leur RTP prévu, leur règle et leur vague de livraison,
   ce qui garde une seule source de vérité pour tout le lobby.
   Vague 2 = autres Originals · Vague 3 = jeux classiques.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;

  /** Déclaration compacte d'un jeu à venir. */
  function soon(id, name, icon, color, rtp, tagline, hint, wave, category, volatility) {
    J.Games.register({
      id: id, name: name, icon: icon, color: color, rtp: rtp, tagline: tagline,
      hint: hint, wave: wave, category: category, volatility: volatility,
      status: 'soon',
      rules: 'Ce jeu arrive bientôt dans JACKPOTLY.'
    });
  }

  /* -------------------------------------------------- VAGUE 2 : ORIGINALS */
  soon('limbo', 'Limbo', 'limbo', '#8b5cf6', 99, 'Vise un multiplicateur',
    'Tirage uniforme : résultat = 0,99 / (1 − u). Tu choisis un multiplicateur cible, le jeu tire et compare. ' +
    'Simple, rapide, parfait pour l\'auto-bet.',
    2, 'originals', 'Volatilité au choix');

  soon('coinflip', 'Coin Flip', 'coin', '#22d3ee', 99, 'Pile ou face en série',
    'Pile ou face à 50/50 (1,98x) avec compteur de série : chaque victoire consécutive augmente le gain du multiplicateur choisi.',
    2, 'originals', 'Volatilité faible');

  soon('hilo', 'Hi-Lo', 'hilo', '#00e37a', 99, 'Plus haut ou plus bas',
    'Devine si la carte suivante est plus haute ou plus basse que la carte courante. Plus la probabilité est faible, plus le gain est élevé. ' +
    'Tu peux enchaîner plusieurs prédictions ou encaisser à tout moment.',
    2, 'originals', 'Volatilité progressive');

  soon('keno', 'Keno', 'keno', '#f97316', 97.5, 'Tire tes numéros',
    'Choisis 1 à 10 numéros sur 40 (ou « pick aléatoire »), le tirage révèle 10 boules. Ton gain dépend du nombre de correspondances, ' +
    'avec un tableau de gains par taille de sélection et niveau de risque.',
    2, 'originals', 'Volatilité au choix');

  soon('tower', 'Tower', 'tower', '#ff4fa3', 98.5, 'Monte les étages',
    'Une tour de 8 à 9 étages : à chaque étage, choisis une case parmi 3 (ou 4). Une seule est sûre. ' +
    'Chaque étage augmente le multiplicateur, avec encaissement à tout moment.',
    2, 'originals', 'Volatilité progressive');

  soon('wheel', 'Wheel', 'wheel', '#ffc531', 97, 'La roue des multiplicateurs',
    'Roue de 10 à 60 segments selon le risque, avec un multiplicateur cible choisi par le joueur (« target multiplier »). ' +
    'Animation fluide, RTP constant.',
    2, 'originals', 'Volatilité au choix');

  /* -------------------------------------------------- VAGUE 3 : CLASSIQUES */
  soon('roulette', 'Roulette', 'roulette', '#c9273a', 97.3, 'Européenne, un seul zéro',
    'Roulette européenne (un seul zéro) : plein, cheval, carré, ligne, colonne, douzaine, rouge/noir, pair/impair, manque/passe. ' +
    'Voisinage du cylindre et mises annoncées incluses.',
    3, 'classics', 'Volatilité moyenne');

  soon('blackjack', 'Blackjack', 'blackjack', '#00b862', 99.5, 'Battez le croupier',
    'Blackjack 6 jeux, croupier qui tire jusqu\'à 17. Actions : tirer, rester, doubler, séparer (jusqu\'à 4 mains), ' +
    'assurance, et abandon quand il est autorisé. Paiement 3:2, blackjack naturel.',
    3, 'classics', 'Volatilité faible');

  soon('baccarat', 'Baccarat', 'baccarat', '#8b5cf6', 98.94, 'Joueur, banquier ou égalité',
    'Baccarat Punto Banco (8 jeux) : mise sur Joueur (1:1), Banque (0,95:1, commission) ou Égalité (8:1), ' +
    'avec paire parfaite en option et tirage automatique selon les règles officielles.',
    3, 'classics', 'Volatilité faible');

  soon('slots', 'Machines à sous', 'slots', '#ffc531', 96.5, '3 thèmes, 5 rouleaux',
    'Trois machines à sous (Égypte dorée, Fruits Neon, Aventure Jackpotly) : 5 rouleaux, 20 lignes réglables, ' +
    'symboles wild et scatter, tours gratuits avec multiplicateur progressif et jackpot local.',
    3, 'classics', 'Volatilité élevée');

  soon('videopoker', 'Video Poker', 'videopoker', '#3b82f6', 99.5, 'Jacks or Better',
    'Video Poker Jacks or Better en 9/6 : tu conserves les cartes de ton choix puis le tirage complète la main. ' +
    'Table de gains complète (paire de valets → quinte flush royale).',
    3, 'classics', 'Volatilité moyenne');

  soon('poker', 'Texas Hold\'em', 'poker', '#34d399', 98, 'Contre des bots',
    'Poker Texas Hold\'em en tête-à-tête ou à 4 joueurs contre des bots (logique Monte-Carlo simple). ' +
    'Blinds, relances, tapis et une seule mise à la fois — mode loisir sans argent réel ni échange entre joueurs.',
    3, 'classics', 'Volatilité élevée');
})();
