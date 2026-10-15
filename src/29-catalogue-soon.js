/* =========================================================================
   JACKPOTLY — CATALOGUE (feuille de route)
   Déclaration des jeux non encore développés : ils apparaissent dans le
   catalogue avec leur RTP prévu, leur règle et leur vague de livraison,
   ce qui garde une seule source de vérité pour tout le lobby.

   Vague 1 (livrée)  : Crash, Dice, Mines, Plinko
   Vague 2 (livrée)  : Limbo, Coin Flip, Hi-Lo, Keno, Tower, Wheel
   Vague 3 (ici)     : Roulette, Blackjack, Baccarat, Machines à sous,
                       Video Poker, Texas Hold'em
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

  /* -------------------------------------------------- VAGUE 3 : CLASSIQUES */
  soon('roulette', 'Roulette', 'roulette', '#c9273a', 97.3, 'Européenne, un seul zéro',
    'Roulette européenne (un seul zéro) : plein, cheval, carré, ligne, colonne, douzaine, rouge/noir, pair/impair, manque/passe. ' +
    'Voisinage du cylindre et mises annoncées incluses. Historique chaud/froid et relance de la dernière mise.',
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
    'Table de gains complète (paire de valets → quinte flush royale), avec stratégie automatique optionnelle.',
    3, 'classics', 'Volatilité moyenne');

  soon('poker', 'Texas Hold\'em', 'poker', '#34d399', 98, 'Contre des bots',
    'Poker Texas Hold\'em en tête-à-tête ou à 4 joueurs contre des bots (logique Monte-Carlo simple). ' +
    'Blinds, relances, tapis et une seule mise à la fois — mode loisir sans argent réel ni échange entre joueurs.',
    3, 'classics', 'Volatilité élevée');
})();
