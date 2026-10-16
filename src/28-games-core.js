/* =========================================================================
   JACKPOTLY — MOTEUR DE JEUX
   · Registre des jeux (catalogue unifié, y compris ceux des vagues suivantes)
   · Coque commune : en-tête, scène, panneau de mise
   · Mise rapide (Min / ½ / x2 / Max / personnalisée)
   · Mode Auto-bet (parties, stop au gain / à la perte / au multiplicateur)
   Contrat d'un module de jeu :
     { id, name, icon, color, rtp, tagline, rules, volatility, category,
       stage(g), controls(g), actions(g), mount(g), start(g), stop(g) }
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  J.GAMES = [];

  const Games = (J.Games = {});
  let current = null;          // instance de jeu montée

  /* ====================================================== REGISTRE / CATALOGUE */
  /**
   * Déclare un jeu. Les jeux « à venir » sont déclarés avec status:'soon'
   * pour apparaître dans le catalogue sans être jouables.
   */
  Games.register = function (def) {
    if (J.GAMES.some((g) => g.id === def.id)) return;
    def.status = def.status || 'live';
    J.GAMES.push(def);
    return def;
  };

  /** Ouvre un jeu (ou annonce sa sortie si encore verrouillé).
   *  `opts` est transmis au jeu : les machines à sous y reçoivent la machine
   *  choisie dans la galerie du lobby ({ machine: 'dragon' }). */
  Games.open = function (id, opts) {
    const def = J.GAMES.find((g) => g.id === id);
    if (!def) return;
    if (def.status !== 'live') {
      J.Sfx.error();
      J.UI.modal({
        title: def.name + ' — bientôt',
        sub: 'Prévu dans une prochaine vague de développement',
        body: '<div class="note">Ce jeu fait partie de la feuille de route de JACKPOTLY : ' +
          'il rejoindra les 16 jeux déjà jouables (10 Originals et 6 classiques) dans une prochaine mise à jour.</div>' +
          '<div class="kv mt"><span class="k">RTP prévu</span><span class="v up">' + def.rtp + ' %</span></div>' +
          '<div class="kv"><span class="k">Catégorie</span><span class="v">' + (def.category === 'classics' ? 'Classique' : 'Original') + '</span></div>' +
          (def.hint ? '<div class="note mt-l">' + def.hint + '</div>' : ''),
        actions: [
          { label: 'Voir les 16 jeux jouables', cls: 'primary', onClick: () => { J.UI.go('originals'); } },
          { label: 'Fermer', cls: 'ghost' }
        ]
      });
      return;
    }
    Games.mount(def, opts);
  };

  Games.byId = (id) => J.GAMES.find((g) => g.id === id);

  /* ============================================================== INSTANCE */
  /** Construit et monte un jeu dans l'écran dédié. */
  Games.mount = function (def, opts) {
    Games.close(true);
    const host = document.getElementById('gameShell');
    const g = {
      def,
      opts: opts || {},                 // options de lancement (machine choisie, etc.)
      bet: loadBet(def.id),
      busy: false,
      rounds: 0,
      history: [],
      stats: { rounds: 0, wagered: 0, net: 0, best: 0 },
      ticket: null,
      auto: { on: false, left: 0, total: 0, stopWin: 0, stopLoss: 0, stopMult: 0, speed: 520, lossInc: 0, base: 0 },
      _timers: []
    };
    current = g;

    /* La coque d'un jeu : en-tête (retour, titre, règles), scène, panneau.
       En mode « plein cadre » (machine à sous), l'en-tête est masqué : la
       façade de la machine occupe tout l'écran et garde son propre bouton de
       sortie. Le titre reste accessible aux lecteurs d'écran via aria-label. */
    const duo = def.id === 'slots';
    /* `duo` = mode « meuble » (machine à sous, plein cadre) ; `g-<id>` permet à
       la feuille de style d'habiller chaque table (tapis, rail, feutre). */
    host.className = (duo ? 'duo ' : '') + 'g-' + def.id;
    host.innerHTML =
      '<div class="game-head"' + (duo ? ' aria-hidden="true"' : '') + '>' +
        '<button class="icon-btn" data-g="back" aria-label="Retour">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' +
        '</button>' +
        '<div class="grow"><div class="h2">' + def.name + '</div>' +
          '<div class="sub">RTP ' + def.rtp + ' %' + (def.volatility ? ' · ' + def.volatility : '') + '</div></div>' +
        '<button class="icon-btn" data-g="info" aria-label="Règles">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="game-stage" id="gStage"></div>' +
      '<div class="game-panel" id="gPanel"></div>';

    g.stageEl = host.querySelector('#gStage');
    g.panelEl = host.querySelector('#gPanel');
    g.headEl = host.querySelector('.game-head');

    host.querySelector('[data-g="back"]').onclick = () => { J.Sfx.click(); Games.close(); };
    host.querySelector('[data-g="info"]').onclick = () => { J.Sfx.click(); J.UI.gameInfo(def); };

    // 1) état initial du jeu (avant tout rendu : controls() et payoutHint() le lisent)
    if (def.state) def.state(g);
    // 2) structure : scène puis panneau de mise
    renderStage(g);
    renderPanel(g);
    // 3) liaisons DOM propres au jeu
    if (def.mount) def.mount(g);
    J.UI.go('game');
    /* Marqueur global : pendant une partie, les bandeaux d'ambiance du hall
       (flux « gros gains ») s'effacent pour laisser la table lisible. */
    document.body.classList.add('in-game');
    /* Banque sonore : le jeu prend la main sur le timbre, puis joue sa
       signature — deux ou trois notes qui identifient la table. */
    J.Sfx.setGame(def.id);
    J.Sfx.motif();
    J.Bus.emit('game:open', g);
    return g;
  };

  /** Ferme le jeu courant : stoppe les boucles, libère les timers. */
  Games.close = function (silent) {
    J.Sfx.setGame(null);          // retour au timbre neutre hors partie
    if (!current) return;
    const g = current;
    try { if (g.def.stop) g.def.stop(g); } catch (e) { /* noop */ }
    g._timers.forEach(clearTimeout);
    g.auto.on = false;
    if (g.ticket && g.ticket._open) J.Wallet.refund(g.ticket);
    saveBet(g.def.id, g.bet);
    current = null;
    document.body.classList.remove('in-game');
    if (!silent) { J.UI.go('originals'); J.Screen.renderAll(); }
  };

  Games.instance = () => current;

  /* ============================================================== SCÈNE */
  /** Zone d'affichage propre à chaque jeu (canvas, grille, courbe…). */
  function renderStage(g) {
    g.stageEl.innerHTML =
      '<div class="history-strip" id="gHist"></div>' +
      '<div class="grow" id="gView" style="position:relative;display:flex;flex-direction:column;min-height:0"></div>';
    g.viewEl = g.stageEl.querySelector('#gView');
    g.histEl = g.stageEl.querySelector('#gHist');
    g.viewEl.innerHTML = g.def.stage ? g.def.stage(g) : '';
    renderHistory(g);
  }

  Games.renderStage = renderStage;

  /** Historique local des multiplicateurs de la session en cours. */
  function renderHistory(g) {
    if (!g.histEl) return;
    g.histEl.innerHTML = g.history.slice(0, 22).map((m) =>
      '<span class="h-chip' + (m < 1 ? ' low' : '') + '">' + U.fmtMult(m) + '</span>').join('');
  }
  Games.pushHistory = function (g, mult) {
    g.history.unshift(mult);
    if (g.history.length > 40) g.history.pop();
    renderHistory(g);
  };

  /* ======================================================= PANNEAU DE MISE */
  function renderPanel(g) {
    const def = g.def;
    const history = (J.Store.state.stats.perGame[def.id] || {});
    // Le panneau se reconstruit (changement de risque au Keno, de cible à la roue…) :
    // on restitue la position de défilement pour ne pas remonter sous le doigt.
    const prevScroll = g.panelEl.querySelector('#gScroll');
    const keepScroll = prevScroll ? prevScroll.scrollTop : 0;
    // Le panneau est construit avec de VRAIS nœuds : les réglages d'un jeu sont
    // posés dans leur propre conteneur, donc un `<div>` oublié dans un jeu ne
    // peut plus engloutir le bouton principal ni casser la mise en page.
    g.panelEl.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.id = 'gScroll';
    const controls = document.createElement('div');
    controls.id = 'gControls';
    controls.innerHTML = def.controls ? def.controls(g) : '';   // les balises non fermées restent ici
    scroll.appendChild(controls);
    const rest = document.createElement('div');
    rest.innerHTML =
      '<div class="row between" style="margin:9px 0 5px">' +
        '<span class="bet-label">Mise (jetons)</span>' +
        '<span class="sub" id="gPayout"></span>' +
      '</div>' +
      '<div class="stepper">' +
        '<button data-bet="min" title="Mise minimale">Min</button>' +
        '<div class="field grow"><span class="prefix">J</span>' +
          '<input id="gBet" type="number" inputmode="decimal" min="' + J.CONST.MIN_BET + '" step="10" value="' + g.bet + '">' +
          '<span class="suffix">10 – 100k</span></div>' +
        '<button data-bet="minus" title="Diminuer">−</button>' +
        '<button data-bet="plus" title="Augmenter">+</button>' +
      '</div>' +
      '<div class="money-quick mt-s">' +
        '<button data-bet="min2">Min</button>' +
        '<button data-bet="half">½</button>' +
        '<button data-bet="double">x2</button>' +
        '<button data-bet="max">Max</button>' +
        '<button data-bet="custom">Perso</button>' +
      '</div>' +
      '<div class="row between mt-s" style="font-size:10.5px;color:var(--muted)">' +
        '<span>Session : <b class="mono" id="gStatRounds">0</b> parties · net ' +
          '<b class="mono" id="gStatNet">0</b> J</span>' +
        '<button class="link" id="gAdvanced">' + (def.auto === false ? '' : 'Auto-bet ▾') + '</button>' +
      '</div>' +
      '<div class="bet-panel-advanced' + (g._advOpen ? ' is-on' : '') + '" id="gAdvancedPanel"></div>';
    while (rest.firstChild) scroll.appendChild(rest.firstChild);
    const actions = document.createElement('div');
    actions.id = 'gActions';
    actions.className = 'btn-row mt' + ({ 2: ' two', 3: ' three', 4: ' four' }[(def.actions ? def.actions(g).length : 1)] || '');
    g.panelEl.appendChild(scroll);
    g.panelEl.appendChild(actions);          // toujours enfant direct du panneau
    if (keepScroll) scroll.scrollTop = keepScroll;

    // Actions spécifiques au jeu (ex. « Cash out »)
    renderActions(g);

    // Mise : saisie + boutons rapides
    const input = g.panelEl.querySelector('#gBet');
    input.onchange = () => setBet(g, input.value, true);
    input.onblur = () => { if (!(g.bet > 0)) setBet(g, J.CONST.MIN_BET, true); };
    g.panelEl.querySelectorAll('[data-bet]').forEach((b) => {
      b.onclick = () => {
        J.Sfx.click(); J.haptic.tap();
        const k = b.dataset.bet;
        const bal = J.Wallet.balance;
        if (k === 'min2') setBet(g, J.CONST.MIN_BET, true);
        else if (k === 'minus') setBet(g, g.bet - stepFor(g.bet), true);
        else if (k === 'plus') setBet(g, g.bet + stepFor(g.bet), true);
        else if (k === 'half') setBet(g, Math.floor(g.bet / 2), true);
        else if (k === 'double') setBet(g, g.bet * 2, true);
        else if (k === 'max') setBet(g, Math.min(bal, J.CONST.MAX_BET), true);
        else if (k === 'custom') openCustomBet(g);
      };
    });

    // Panneau auto-bet
    const adv = g.panelEl.querySelector('#gAdvanced');
    if (adv) adv.onclick = () => {
      const p = g.panelEl.querySelector('#gAdvancedPanel');
      g._advOpen = !g._advOpen;
      p.classList.toggle('is-on', g._advOpen);
      if (g._advOpen && !p.dataset.built) buildAutoPanel(g);
    };

    updatePayoutHint(g);
    updateSessionLine(g);
  }

  Games.renderPanel = renderPanel;

  function renderActions(g) {
    /* Le conteneur est mémorisé : un jeu qui présente ses commandes sur son
       propre meuble (machine à sous) peut le déplacer une fois, et le moteur
       continue de le remplir au même endroit. Si le panneau a été reconstruit
       entre-temps, l'ancien conteneur n'est plus dans la page : on reprend
       celui du panneau courant. */
    let box = g.actionsEl;
    if (!box || (box.isConnected === false)) box = g.panelEl.querySelector('#gActions');
    if (!box) return;
    g.actionsEl = box;
    const acts = (g.def.actions ? g.def.actions(g) : null) ||
      [{ label: g.def.playLabel || 'Jouer', cls: 'primary wide-lg grow', act: 'play' }];
    box.innerHTML = acts.map((a, i) =>
      '<button class="btn ' + (a.cls || 'ghost') + '" data-act="' + (a.act || 'custom') + '" data-i="' + i + '"' +
      (a.disabled ? ' disabled' : '') + '>' + a.label + '</button>').join('');
    box.querySelectorAll('[data-act]').forEach((b) => {
      const a = acts[parseInt(b.dataset.i, 10)];
      b.onclick = () => {
        if (g.busy && !a.alsoWhenBusy) return;
        J.Sfx.click(); J.haptic.tap();
        if (a.onClick) a.onClick(g);
        else if (a.act === 'play') play(g, a);
        else if (a.act === 'cashout' && g.def.cashout) g.def.cashout(g);
      };
    });
  }
  Games.renderActions = renderActions;

  /** Indice de gain affiché à côté du libellé « Mise ». */
  function updatePayoutHint(g) {
    const el = g.panelEl && g.panelEl.querySelector('#gPayout');
    if (!el) return;
    if (g.def.payoutHint) { el.innerHTML = g.def.payoutHint(g); return; }
    el.textContent = '';
  }
  Games.updateHints = function (g) { updatePayoutHint(g); updateSessionLine(g); };

  function updateSessionLine(g) {
    const r = g.panelEl.querySelector('#gStatRounds');
    const n = g.panelEl.querySelector('#gStatNet');
    if (r) r.textContent = g.stats.rounds;
    if (n) {
      n.textContent = (g.stats.net >= 0 ? '+' : '') + U.fmtK(g.stats.net);
      n.className = 'mono ' + (g.stats.net >= 0 ? 'up' : 'down');
    }
  }

  /* ------------------------------------------------------------ MISE RAPIDE */
  const STEP = (v) => (v < 100 ? 10 : v < 1000 ? 50 : v < 10000 ? 250 : v < 100000 ? 1000 : 10000);

  function stepFor(v) { return STEP(v); }

  /** Applique une mise (bornée 10 … min(solde plafonné, 100k)). */
  function setBet(g, v, fromUser) {
    let b = Math.floor(Number(v) || 0);
    b = U.clamp(b, J.CONST.MIN_BET, J.CONST.MAX_BET);
    g.bet = b;
    const input = g.panelEl.querySelector('#gBet');
    if (input && fromUser) input.value = b;
    saveBet(g.def.id, b);
    updatePayoutHint(g);
    if (g.busy && g.def.onBetChange) g.def.onBetChange(g);
    return b;
  }
  Games.setBet = setBet;
  Games.getBet = () => (current ? current.bet : J.CONST.MIN_BET);

  Games.betMin = () => J.CONST.MIN_BET;
  Games.betMax = () => Math.min(J.Wallet.balance, J.CONST.MAX_BET);

  /** Saisie d'une mise personnalisée (pas de prompt() natif). */
  function openCustomBet(g) {
    const bal = J.Wallet.balance;
    J.UI.modal({
      title: 'Mise personnalisée',
      sub: 'Solde : ' + U.fmt(bal) + ' jetons',
      body: '<div class="field"><span class="prefix">J</span><input id="cbVal" type="number" inputmode="decimal" value="' + g.bet + '" min="10" step="10"></div>' +
        '<div class="money-quick mt"><button data-cb="100">100</button><button data-cb="500">500</button>' +
        '<button data-cb="1000">1 k</button><button data-cb="5000">5 k</button><button data-cb="max">Max</button></div>',
      actions: [
        { label: 'Annuler', cls: 'ghost' },
        { label: 'Valider', cls: 'primary', onClick: () => {
          const v = parseInt(document.getElementById('cbVal').value, 10);
          setBet(g, v, true);
        } }
      ]
    });
    const box = document.getElementById('modalBox');
    box.querySelectorAll('[data-cb]').forEach((b) => {
      b.onclick = () => {
        const v = b.dataset.cb === 'max' ? bal : parseInt(b.dataset.cb, 10);
        const inp = box.querySelector('#cbVal');
        if (inp) inp.value = U.clamp(v, J.CONST.MIN_BET, J.CONST.MAX_BET);
      };
    });
  }

  /* Mémorise la dernière mise par jeu (confort de jeu) */
  function saveBet(id, v) { try { localStorage.setItem('jackpotly.bet.' + id, String(v)); } catch (e) {} }
  function loadBet(id) {
    try {
      const v = parseInt(localStorage.getItem('jackpotly.bet.' + id), 10);
      if (v >= J.CONST.MIN_BET) return U.clamp(v, J.CONST.MIN_BET, J.CONST.MAX_BET);
    } catch (e) { /* noop */ }
    return 100;
  }

  /* ============================================================== AUTO-BET */
  function buildAutoPanel(g) {
    const p = g.panelEl.querySelector('#gAdvancedPanel');
    p.dataset.built = '1';
    const a = g.auto;
    p.innerHTML =
      '<div class="card pad" style="margin-top:6px">' +
        '<div class="row between"><span class="h2">Auto-bet</span>' +
          '<label class="switch"><input type="checkbox" id="autoOn"' + (a.on ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
        '<div class="sub mt-s">Joue automatiquement le nombre de parties demandé, avec arrêts de sécurité.</div>' +
        '<div class="row mt"><div class="field grow"><span class="suffix">PARTIES</span><input id="autoCount" type="number" min="1" max="500" value="' + (a.total || 25) + '"></div>' +
        '<div class="field grow"><span class="suffix">VITESSE</span><select id="autoSpeed" style="background:none;border:0;flex:1;font-weight:700">' +
          '<option value="900"' + (a.speed === 900 ? ' selected' : '') + '>Lente</option>' +
          '<option value="520"' + (a.speed === 520 ? ' selected' : '') + '>Normal</option>' +
          '<option value="200"' + (a.speed === 200 ? ' selected' : '') + '>Rapide</option>' +
          '<option value="60"' + (a.speed === 60 ? ' selected' : '') + '>Turbo</option>' +
        '</select></div></div>' +
        '<div class="row mt-s"><div class="field grow"><span class="suffix">STOP GAIN</span><input id="autoWin" type="number" min="0" step="100" value="' + (a.stopWin || 0) + '"></div>' +
        '<div class="field grow"><span class="suffix">STOP PERTE</span><input id="autoLoss" type="number" min="0" step="100" value="' + (a.stopLoss || 0) + '"></div></div>' +
        '<div class="row mt-s"><div class="field grow"><span class="suffix">STOP SI MULT ≥</span><input id="autoMult" type="number" min="0" step="0.5" value="' + (a.stopMult || 0) + '"></div>' +
        '<div class="field grow"><span class="suffix">+% APRÈS PERTE</span><input id="autoInc" type="number" min="0" max="200" step="5" value="' + (a.lossInc || 0) + '"></div></div>' +
        '<div class="btn-row two mt"><button class="btn ghost" id="autoStop">Arrêter</button>' +
        '<button class="btn primary" id="autoStart">Démarrer l\'auto</button></div>' +
        '<div id="autoStatus" class="note mt-s">0 partie lancée</div>' +
      '</div>';

    p.querySelector('#autoStart').onclick = () => startAuto(g);
    p.querySelector('#autoStop').onclick = () => stopAuto(g, 'Arrêt manuel');
    p.querySelector('#autoOn').onchange = (e) => { if (!e.target.checked) stopAuto(g, 'Auto désactivé'); };
  }

  function readAutoInputs(g) {
    const p = g.panelEl.querySelector('#gAdvancedPanel');
    if (!p) return;
    const a = g.auto;
    a.total = U.clamp(parseInt((p.querySelector('#autoCount') || {}).value, 10) || 25, 1, 500);
    a.speed = parseInt((p.querySelector('#autoSpeed') || {}).value, 10) || 520;
    a.stopWin = Math.max(0, parseFloat((p.querySelector('#autoWin') || {}).value) || 0);
    a.stopLoss = Math.max(0, parseFloat((p.querySelector('#autoLoss') || {}).value) || 0);
    a.stopMult = Math.max(0, parseFloat((p.querySelector('#autoMult') || {}).value) || 0);
    a.lossInc = U.clamp(parseFloat((p.querySelector('#autoInc') || {}).value) || 0, 0, 200);
  }

  function startAuto(g) {
    readAutoInputs(g);
    const a = g.auto;
    if (a.on) { stopAuto(g, 'Arrêt'); return; }
    if (g.def.auto === false) { J.toast('Auto-bet indisponible sur ce jeu', 'ko'); return; }
    if (!J.Wallet.canBet(g.bet)) { J.toast('Solde insuffisant pour la mise', 'ko'); return; }
    a.on = true;
    a.left = a.total;
    a.base = g.bet;
    a.startBalance = J.Wallet.balance + 0;      // référence pour stop gain / perte
    a.launched = 0;
    J.toast('Auto-bet : ' + a.total + ' parties', 'ok');
    setAutoStatus(g, 'Démarrage…');
    play(g, { auto: true });
  }

  function stopAuto(g, why) {
    const a = g.auto;
    if (!a.on) return;
    a.on = false;
    a.left = 0;
    clearTimeout(g._autoTimer);          // annule la partie suivante déjà programmée
    g._autoTimer = null;
    const sw = g.panelEl.querySelector('#autoOn');
    if (sw) sw.checked = false;
    setAutoStatus(g, 'Arrêté · ' + why);
    J.toast('Auto-bet : ' + why, 'ko');
    if (!g.busy) renderActions(g);
  }
  Games.stopAuto = stopAuto;

  function setAutoStatus(g, txt) {
    const el = g.panelEl.querySelector('#autoStatus');
    if (el) el.textContent = txt;
  }
  Games.setAutoStatus = setAutoStatus;

  /** Vérifie les conditions d'arrêt après chaque partie (retourne true si arrêt). */
  function checkAutoStops(g) {
    const a = g.auto;
    if (!a.on) return false;
    const bal = J.Wallet.balance;
    const delta = bal - a.startBalance;
    if (a.stopWin > 0 && delta >= a.stopWin) { stopAuto(g, 'objectif de gain atteint (+' + U.fmtK(delta) + ' J)'); return true; }
    if (a.stopLoss > 0 && delta <= -a.stopLoss) { stopAuto(g, 'limite de perte atteinte (' + U.fmtK(delta) + ' J)'); return true; }
    if (a.stopMult > 0 && (g.lastMult || 0) >= a.stopMult) { stopAuto(g, 'multiplicateur ' + U.fmtMult(g.lastMult) + ' atteint'); return true; }
    if (a.left <= 0) { stopAuto(g, 'série terminée (' + a.total + ' parties)'); return true; }
    if (!J.Wallet.canBet(g.bet)) { stopAuto(g, 'solde insuffisant'); return true; }
    return false;
  }

  /* ============================================================ TOUR DE JEU */
  /**
   * Lance une partie : débite la mise et démarre la logique du jeu.
   * Le jeu doit terminer par g.finish(mult) (ou g.abort() en cas d'erreur).
   */
  function play(g, opts) {
    if (g.busy) return;
    if (!J.Wallet.canBet(g.bet)) {
      if (J.Wallet.balance < J.CONST.MIN_BET) {
        stopAuto(g, 'solde épuisé');
        J.Rewards.openRecharge();
      } else J.toast('Mise supérieure au solde', 'ko');
      return;
    }
    // Garde-fou auto-bet : stop si les conditions sont déjà remplies
    if (g.auto.on && checkAutoStops(g)) return;
    g.busy = true;
    g.lastMult = null;
    g.ticket = J.Wallet.stake(g.bet, g.def.id, opts && opts.meta);
    if (!g.ticket) { g.busy = false; return; }
    J.Sfx.spinup();               // départ de manche, dans le timbre du jeu
    g.def.start(g);
  }
  Games.play = play;

  /** Termine la partie : crédite le gain, met à jour stats et auto-bet. */
  Games.finish = function (g, mult, extra) {
    if (!g || !g.ticket) { if (g) g.busy = false; return; }
    const rec = J.Wallet.settle(g.ticket, mult, extra || {});
    g.ticket = null;
    g.busy = false;
    g.lastMult = mult;
    g.rounds++;
    g.stats.rounds++;
    if (rec) {
      g.stats.wagered += rec.bet;
      g.stats.net += rec.profit;
      g.stats.best = Math.max(g.stats.best, mult);
    }
    Games.pushHistory(g, mult);
    updateSessionLine(g);
    renderActions(g);

    // Le solde a pu fondre pendant la manche : on remet la mise en phase pour
    // la suivante (sinon le bouton principal refuserait de rejouer). L'auto-bet
    // gère la sienne tout seul plus bas.
    if (!g.auto.on && g.bet > J.Wallet.balance) {
      setBet(g, Math.max(J.CONST.MIN_BET, Math.min(J.CONST.MAX_BET, Math.floor(J.Wallet.balance))), true);
    }

    // Auto-bet : partie suivante
    if (g.auto.on) {
      g.auto.left--;
      setAutoStatus(g, (g.auto.total - g.auto.left) + ' / ' + g.auto.total + ' parties · net ' +
        (g.stats.net >= 0 ? '+' : '') + U.fmtK(g.stats.net) + ' J');
      if (!checkAutoStops(g)) {
        const a = g.auto;
        if (a.lossInc > 0 && mult < 1) setBet(g, Math.ceil(g.bet * (1 + a.lossInc / 100)), true);
        else if (a.lossInc > 0 && mult >= 1) setBet(g, a.base, true);
        // La partie suivante est mémorisée pour pouvoir être annulée par stopAuto()
        clearTimeout(g._autoTimer);
        g._autoTimer = schedule(g, () => { if (g.auto.on) play(g, { auto: true }); }, a.speed);
      }
    }
    /* Célébration du gain : un seul chemin pour les 16 jeux (particules, bandeau,
       jingle, haptique), déclenché ici pour que tout nouveau jeu en bénéficie
       sans code. Un jeu qui a déjà fêté sa manche au bon endroit sur son plateau
       passe { celebrated: true } dans ses options pour éviter un doublon. */
    if (rec && !(extra && extra.celebrated)) {
      J.FX.celebrate({
        mult: mult, payout: rec.payout, bet: rec.bet,
        el: g.gainEl || g.multEl || g.multLbl || g.stageEl || g.panelEl
      });
    }

    /* Dernier mot au rendu : certains jeux peignent encore leur plateau après
       l'appel de finish() — le bouton principal doit toujours refléter l'état
       FINAL de la manche (et non un « en cours » qui ne reviendrait pas). */
    renderActions(g);

    J.Bus.emit('game:round', { game: g.def.id, mult, rec });
  };

  /** Annule la partie en cours (le jeu n'a pas pu se dérouler). */
  Games.abort = function (g, msg) {
    if (!g) return;
    if (g.ticket) J.Wallet.refund(g.ticket);
    g.ticket = null;
    g.busy = false;
    if (msg) J.toast(msg, 'ko');
    if (g.auto.on) stopAuto(g, 'partie annulée');
    renderActions(g);
  };

  /** Planifie un appel (mémorisé pour pouvoir tout annuler à la fermeture). */
  function schedule(g, fn, ms) {
    const id = setTimeout(() => { fn(); }, ms);
    g._timers.push(id);
    return id;
  }
  Games.schedule = schedule;

  /* ================================================== HELPERS MATHÉMATIQUES */
  /**
   * Multiplicateur « juste » pour une probabilité de gain p, avec marge maison.
   * Ex. Dice 50 % de chances, marge 1 % -> 1,98x.
   */
  Games.multFromChance = function (p, houseEdge) {
    const he = houseEdge == null ? 0.01 : houseEdge;
    return (1 - he) / Math.max(1e-9, p);
  };

  /** Probabilité correspondant à un multiplicateur cible (jeux type Limbo). */
  Games.chanceFromMult = function (mult, houseEdge) {
    const he = houseEdge == null ? 0.01 : houseEdge;
    return U.clamp((1 - he) / Math.max(1.0001, mult), 1e-6, 1);
  };

  /** Petit utilitaire : applique un délai sans bloquer (promesse). */
  Games.wait = (ms) => new Promise((r) => setTimeout(r, ms));
})();
