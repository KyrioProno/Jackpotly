/* =========================================================================
   JEU 15 — VIDEO POKER (Jacks or Better 9/6)
   Cinq cartes sont servies. Tu gardes celles que tu veux, les autres sont
   remplacées : une seule décision, mais la plus importante du jeu.

   Table de gains 9/6 « full pay » (multiples de la mise, paire de valets et
   mieux — d'où le nom Jacks or Better) :
     quinte flush royale 250 · quinte flush 50 · carré 25 · full 9 · couleur 6
     quinte 4 · brelan 3 · deux paires 2 · paire de V/D/R/A 1

   Avec le jeu optimal, cette table rapporte exactement 99,54 % — c'est la
   référence du Video Poker. Le bouton <b>Conseil</b> calcule l'espérance
   EXACTE des 32 gardes possibles (≈ 1,07 million de tirages évalués) et
   propose la meilleure ; l'Auto-bet utilise ce même calcul.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const C = J.Cards;

  /* Table de gains 9/6, indexée par catégorie d'évaluation. */
  const PAY = [0, 0, 2, 3, 4, 6, 9, 25, 50, 250];
  const CAT_NAMES = ['Rien', 'Paire de V+', 'Deux paires', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush', 'Royale'];
  /* Espérance exacte de « tout défausser » : espérance d'une main de 5 cartes
     au hasard, calculée sur les 2 598 960 mains possibles (voir tests). */
  const DISCARD_ALL = 0.336021;

  /** Gain (en multiples de la mise) d'un score d'évaluation. */
  function payOf(score) {
    if (score < 0) return 0;
    const cat = Math.floor(score / C.TOP);
    if (cat === 1) return ((score >> 16) & 15) >= 9 ? 1 : 0;    // paire de V, D, R ou A
    return PAY[cat];
  }

  const BUF = new Int8Array(5);
  const pay5 = () => payOf(C.eval5(BUF));

  /**
   * Espérance exacte d'une garde : `held` cartes conservées, on complète avec
   * `need` cartes parmi `rest` (énumération complète, sans échantillonnage).
   */
  function evHold(held, rest, need) {
    for (let i = 0; i < held.length; i++) BUF[i] = held[i];
    if (need === 0) return pay5();
    const L = rest.length, n = held.length;
    let s = 0;
    if (need === 1) {
      for (let a = 0; a < L; a++) { BUF[n] = rest[a]; s += pay5(); }
      return s / L;
    }
    if (need === 2) {
      for (let a = 0; a < L - 1; a++) { BUF[n] = rest[a];
        for (let b = a + 1; b < L; b++) { BUF[n + 1] = rest[b]; s += pay5(); } }
      return s / (L * (L - 1) / 2);
    }
    if (need === 3) {
      for (let a = 0; a < L - 2; a++) { BUF[n] = rest[a];
        for (let b = a + 1; b < L - 1; b++) { BUF[n + 1] = rest[b];
          for (let c = b + 1; c < L; c++) { BUF[n + 2] = rest[c]; s += pay5(); } } }
      return s / (L * (L - 1) * (L - 2) / 6);
    }
    for (let a = 0; a < L - 3; a++) { BUF[n] = rest[a];
      for (let b = a + 1; b < L - 2; b++) { BUF[n + 1] = rest[b];
        for (let c = b + 1; c < L - 1; c++) { BUF[n + 2] = rest[c];
          for (let d = c + 1; d < L; d++) { BUF[n + 3] = rest[d]; s += pay5(); } } } }
    return s / (L * (L - 1) * (L - 2) * (L - 3) / 24);
  }

  /** Cartes non distribuées (le reste du jeu de 52). */
  function restOf(hand) {
    const out = [];
    for (let c = 0; c < 52; c++) if (hand.indexOf(c) < 0) out.push(c);
    return out;
  }

  /**
   * Meilleure garde possible pour une main : énumère les 32 gardes.
   * Renvoie { holds: [index…], ev } avec ev = espérance en multiples de mise.
   */
  function optimalHold(hand) {
    const rest = restOf(hand);
    let best = { holds: [], ev: DISCARD_ALL };
    for (let mask = 1; mask < 32; mask++) {          // 1..31 : les 31 gardes non vides
      const keep = [], cards = [];
      for (let i = 0; i < 5; i++) if ((mask >> i) & 1) { keep.push(i); cards.push(hand[i]); }
      const ev = evHold(cards, rest, 5 - keep.length);
      if (ev > best.ev + 1e-12) best = { holds: keep.slice(), ev };
    }
    return best;
  }

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    g.deck = [];
    g.hand = [];
    g.held = [false, false, false, false, false];
    g.phase = 'idle';                    // idle | hold | drawn | done
    g.result = null;
    g.hint = null;                       // garde conseillée
    g.hintEv = 0;
    g.calc = false;
    g.msg = '';
    g.detail = '';
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  function deal(g) {
    g.deck = C.shuffle(C.deck());
    g.hand = [];
    for (let i = 0; i < 5; i++) g.hand.push(g.deck.pop());
  }

  /* ------------------------------------------------------------------ RENDU */
  function paint(g) {
    if (!g.handEl) return;
    g.handEl.innerHTML = g.hand.map((c, i) => {
      const hold = g.held[i];
      const hint = g.hint && g.hint.indexOf(i) >= 0;
      return '<button class="vp-card' + (hold ? ' is-hold' : '') + (hint && !hold ? ' is-hint' : '') + '" data-card="' + i + '">' +
        C.html(c, 'lg' + (hold ? ' sel' : '')) +
        '<span class="vp-hold">' + (hold ? 'GARDÉE' : (hint ? 'À GARDER' : '')) + '</span>' +
      '</button>';
    }).join('');

    g.handEl.querySelectorAll('[data-card]').forEach((b) => {
      b.onclick = () => {
        if (g.phase !== 'hold') return;
        const i = parseInt(b.dataset.card, 10);
        g.held[i] = !g.held[i];
        g.hint = null;
        J.Sfx.click(); J.haptic.tap();
        paint(g);
      };
    });

    const heldCount = g.held.filter(Boolean).length;
    g.statusEl.innerHTML = g.phase === 'hold'
      ? '<b>' + (heldCount ? heldCount + ' carte(s) gardée(s) — ' + (5 - heldCount) + ' à remplacer' : 'Touche les cartes à garder, puis tire') + '</b>'
      : g.phase === 'drawn' ? '<b>Main finale : ' + C.handName(C.eval5(g.hand)) + '</b>'
        : '<b>' + (g.msg || 'Prêt') + '</b>' + (g.detail ? '<span class="sub"> · ' + g.detail + '</span>' : '');

    // table de gains, la ligne gagnante est mise en avant
    const cat = g.phase === 'drawn' || g.phase === 'done' ? Math.floor(C.eval5(g.hand) / C.TOP) : -1;
    const pairRank = cat === 1 ? (C.eval5(g.hand) >> 16) & 15 : -1;
    g.payEl.innerHTML = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((c) => {
      const win = (c === cat && (c !== 1 || pairRank >= 9));
      return '<div class="vp-pay' + (win ? ' is-win' : '') + '"><span>' + CAT_NAMES[c] + '</span>' +
        '<b class="mono">' + PAY[c] + 'x</b></div>';
    }).join('');

    J.Games.renderActions(g);
  }

  /* ------------------------------------------------------- CALCUL / CONSEIL */
  function askAdvice(g, thenHold) {
    if (g.calc || g.phase !== 'hold') return;
    g.calc = true;
    g.statusEl.innerHTML = '<b>Calcul de la meilleure garde…</b><span class="sub"> (1,07 million de tirages)</span>';
    J.Games.renderActions(g);
    // Le calcul (~150 ms) est différé d'une image pour laisser l'écran se rafraîchir
    J.Games.schedule(g, () => {
      const best = optimalHold(g.hand);
      g.calc = false;
      g.hint = best.holds;
      g.hintEv = best.ev;
      if (thenHold) {
        g.held = [false, false, false, false, false];
        best.holds.forEach((i) => { g.held[i] = true; });
        paint(g);
        J.Games.schedule(g, () => drawCards(g), 260);
        return;
      }
      g.msg = 'Meilleure garde : ' + (best.holds.length ? best.holds.map((i) => C.label(g.hand[i])).join(' ') : 'tout remplacer') +
        ' · espérance ' + best.ev.toFixed(4).replace('.', ',') + '×';
      paint(g);
    }, 40);
  }

  /* ---------------------------------------------------------------- MANCHE */
  function start(g) {
    deal(g);
    g.held = [false, false, false, false, false];
    g.phase = 'hold';
    g.result = null;
    g.hint = null;
    g.msg = 'Choisis tes cartes';
    g.detail = '';
    paint(g);
    J.Sfx.reveal(true);
    if (g.auto.on) askAdvice(g, true);      // l'auto-bet joue la garde optimale
  }

  function drawCards(g) {
    if (g.phase !== 'hold') return;
    for (let i = 0; i < 5; i++) if (!g.held[i]) g.hand[i] = g.deck.pop();
    g.phase = 'drawn';
    g.hint = null;
    paint(g);
    J.Games.schedule(g, () => settle(g), 700);
  }

  function settle(g) {
    const score = C.eval5(g.hand);
    const mult = payOf(score);
    const cat = Math.floor(score / C.TOP);
    g.phase = 'done';
    g.result = { score, mult, cat };
    g.msg = mult > 0 ? C.handName(score) + ' — ' + mult + '×' : 'Perdu';
    g.detail = U.fmt(g.ticket.bet) + ' J misés';
    paint(g);
    if (mult >= 25) { J.Sfx.bigwin(); J.haptic.big(); }
    else if (mult > 0) { J.Sfx.win(mult); J.haptic.win(mult); }
    else { J.Sfx.lose(); J.haptic.lose(); }
    J.Games.finish(g, mult, { detail: C.handName(score) });
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'videopoker',
    name: 'Video Poker',
    icon: 'videopoker',
    color: '#3b82f6',
    rtp: 99.5,
    category: 'classics',
    tagline: 'Jacks or Better 9/6',
    volatility: 'Volatilité moyenne',
    hot: true,
    rules:
      'Video Poker <b>Jacks or Better 9/6</b>. Cinq cartes sont servies : touche celles que tu ' +
      '<b>gardes</b>, les autres sont remplacées une seule fois.<br><br>' +
      'Table de gains (multiples de la mise) : quinte flush royale <b>250</b> · quinte flush <b>50</b> · ' +
      'carré <b>25</b> · full <b>9</b> · couleur <b>6</b> · quinte <b>4</b> · brelan <b>3</b> · ' +
      'deux paires <b>2</b> · paire de <b>V/D/R/A</b> <b>1</b>. Une paire de 10 ou moins ne paie rien.<br><br>' +
      'Avec le <b>jeu optimal</b>, cette table rend exactement <b>99,54 %</b>. ' +
      'Le bouton <b>Conseil</b> calcule l\'espérance exacte des 32 gardes possibles ' +
      '(1 065 000 tirages évalués) et surligne la meilleure ; l\'Auto-bet joue cette garde optimale.',
    playLabel: 'Distribuer 🃏',

    state, start,
    stop(g) { g.phase = 'idle'; g.calc = false; },

    stage(g) {
      return '' +
        '<div class="vp-stage table-felt">' +
          '<div class="vp-status" id="vpStatus"><b>Prêt</b></div>' +
          '<div class="vp-hand" id="vpHand"></div>' +
        '</div>';
    },

    controls(g) {
      return '' +
        '<div class="row between"><span class="bet-label">Table de gains</span>' +
          '<button class="link" id="vpAdvice">💡 Conseil (calcul exact)</button></div>' +
        '<div class="vp-pays" id="vpPays"></div>' +
        '<div class="sub mt-s">La paire ne paie qu\'à partir des valets. ' +
        'RTP 99,54 % avec le jeu optimal.</div>';
    },

    actions(g) {
      if (g.phase === 'hold') {
        const n = g.held.filter(Boolean).length;
        return [
          { label: n === 5 ? 'Garder tout (aucun gain possible)' : 'Tirer · remplacer ' + (5 - n), cls: 'primary wide-lg grow', alsoWhenBusy: true, onClick: (gg) => drawCards(gg) },
          { label: '💡', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => askAdvice(gg) }
        ];
      }
      return [{
        label: g.phase === 'drawn' ? 'Résultat…' : 'Nouvelle main 🃏',
        cls: 'primary wide-lg grow', act: 'play', disabled: g.phase === 'drawn' || g.calc
      }];
    },

    payoutHint() { return '9/6 · RTP 99,54 % au jeu optimal'; },

    mount(g) {
      g.handEl = g.viewEl.querySelector('#vpHand');
      g.statusEl = g.viewEl.querySelector('#vpStatus');
      g.payEl = g.panelEl.querySelector('#vpPays');
      g.panelEl.querySelector('#vpAdvice').onclick = () => askAdvice(g);
      paint(g);
    }
  });

  /* Exposé pour les tests : gains, espérance exacte, meilleure garde. */
  J.__vp = { payOf, optimalHold, evHold, DISCARD_ALL, PAY };
})();
