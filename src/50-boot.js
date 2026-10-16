/* =========================================================================
   JACKPOTLY — DÉMARRAGE
   Ordre d'initialisation, écran d'accueil animé, verrouillage audio au
   premier geste, sauvegarde périodique, écran de bienvenue (1re ouverture).
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /* --------------------------------------------------------- INITIALISATION */
  function boot() {
    // 1) Données persistées
    const st = J.Store.load();

    // 2) Graines Fair Play (créées au premier lancement)
    J.Fair.init();

    // 3) Réglages appliqués au document
    document.body.classList.toggle('no-motion', !st.settings.motion);

    // 4) Quêtes du jour + suivi des événements
    J.Quests.ensure();
    J.Quests.track();

    // 5) Flux « gros gains » (faux, ambiance live)
    if (st.settings.liveFeed) J.Live.init();

    // 6) Interface
    J.UI.mountIcons();          // icônes SVG déclarées par le squelette HTML
    /* Une manche interrompue par un rechargement de page : la mise débitée
       mais jamais réglée est rendue au joueur (et annoncée, pour qu'il
       comprenne pourquoi son solde remonte au démarrage). */
    const pending = J.Wallet.recoverPending();
    J.Wallet.renderBalance();
    J.Screen.renderAll();
    if (pending) {
      setTimeout(() => J.toast('Manche interrompue : mise de ' + U.fmt(pending.bet) + ' J rendue', 'ok'), 2600);
    }

    // 7) Écran d'accueil animé puis disparition
    const splash = document.getElementById('splash');
    const minSplash = new Promise((r) => setTimeout(r, 1900));
    minSplash.then(() => {
      splash.classList.add('is-off');
      setTimeout(() => { splash.style.display = 'none'; }, 620);
      if (st.daily.lastClaim === 0 && !st.settings._welcomed) firstRunWelcome();
    });

    // 8) Sauvegarde de sécurité
    setInterval(() => J.Store.flush(), 20000);
    window.addEventListener('pagehide', () => J.Store.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { J.Store.flush(); J.Live.stop(); }
      else if (J.Store.state.settings.liveFeed) J.Live.start();
    });

    /* 9) Le son ne peut démarrer qu'après une interaction (règles navigateurs).
       On en profite pour lancer la musique d'ambiance déjà demandée par
       l'écran : elle ne démarre donc jamais toute seule, et jamais deux fois. */
    const unlock = () => {
      J.Sfx.unlock();
      if (J.Music) J.Music.onUnlock();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && J.Music) J.Music.onUnlock(); });

    // 10) Solde épuisé : message + offre de recharge (une fois par épuisement)
    let warnedEmpty = false;
    J.Bus.on('wallet:settled', () => {
      if (J.Wallet.balance >= J.CONST.MIN_BET) { warnedEmpty = false; return; }
      if (warnedEmpty) return;
      warnedEmpty = true;
      J.toast('💸 Solde épuisé — <b>Recharge gratuite</b> disponible', 'ko');
      J.Screen.renderHome();
      setTimeout(() => {
        if (J.Wallet.balance < J.CONST.MIN_BET && !J.UI.isModalOpen() && !J.UI.isSheetOpen()) J.Rewards.openRecharge();
      }, 1100);
    });
    J.Bus.on('wallet:credit', () => { J.Screen.renderShop(); });

    // 11) Surveillance du temps de jeu cumulé (stats)
    setInterval(() => {
      const s = J.Store.state.session;
      if (!document.hidden) s.playMs = (s.playMs || 0) + 2000;
    }, 2000);

    console.log('%cJACKPOTLY v' + J.VERSION + ' — casino social de divertissement (jetons virtuels, 18+)',
      'color:#00e37a;font-weight:bold');
  }

  /* ------------------------------------------------- ÉCRAN DE BIENVENUE */
  /** Affiché une seule fois : cadre le jeu et les récompenses gratuites. */
  function firstRunWelcome() {
    J.Store.patch({ settings: { _welcomed: true } });
    J.UI.modal({
      title: 'Bienvenue sur JACKPOTLY',
      sub: '10 000 jetons virtuels pour commencer',
      closable: false,
      body:
        '<div class="note">Tu joues avec des <b>jetons virtuels sans aucune valeur monétaire</b> : ' +
        'pas de retrait, pas de conversion en argent ou en cadeau, pas d\'échange entre joueurs. ' +
        'L\'argent réel ne sert qu\'à acheter des packs de jetons (paiement simulé dans cette version). <b>18+</b>.</div>' +
        '<div class="kv mt"><span class="k">' + J.icon.gift + ' Bonus quotidien</span><span class="v up"> +500 à +5 000 J</span></div>' +
        '<div class="kv"><span class="k">' + J.icon.fortune + ' Roue de la chance</span><span class="v up">1 tour gratuit / jour</span></div>' +
        '<div class="kv"><span class="k">' + J.icon.refill + ' Solde à zéro</span><span class="v up">recharge gratuite</span></div>' +
        '<div class="note mt">Chaque jeu explique ses règles en un tap (bouton <b>?</b> en haut à droite). ' +
        'Rappel de pause automatique toutes les 30 minutes.</div>',
      actions: [
        { label: J.icon.gift + ' Prendre mon bonus', cls: 'gold', onClick: () => J.Rewards.openDaily() },
        { label: 'Explorer les jeux', cls: 'primary' }
      ]
    });
  }

  /* --------------------------------------------------------------- GO ! */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
