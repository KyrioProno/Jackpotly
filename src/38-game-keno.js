/* =========================================================================
   JEU 8 — KENO
   40 numéros, tu en choisis 1 à 10, le tirage en révèle 10.
   Probabilités exactes (loi hypergéométrique) :
     P(h correspondances | k choisis) = C(k,h)·C(40−k,10−h) / C(40,10)

   Les tables de gains ci-dessous sont CONÇUES pour un RTP de 97,5 %
   (générées et vérifiées par `node tools/design-tables.mjs`) : chaque
   configuration affiche son RTP réel dans l'interface. Trois niveaux de
   risque : Classique (paie souvent), Moyen, Élevé (paie rarement, très gros).
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const NUMBERS = 40;
  const DRAWN = 10;
  const RISK_LABEL = { classic: 'Classique', medium: 'Moyen', high: 'Élevé' };

  /** Tables de gains : PAYTABLES[risque][numéros choisis][correspondances] */
  const PAYTABLES = {
    classic: {
      1: [0, 3.9],                                                          // 97,50 %
      2: [0, 1.93, 4.05],                                                   // 97,60 %
      3: [0, 0, 6.01, 12.6],                                                // 97,42 %
      4: [0, 0, 3.18, 6.67, 14],                                            // 97,60 %
      5: [0, 0, 0, 9.64, 20.2, 42.5],                                       // 97,44 %
      6: [0, 0, 0, 5.24, 11, 23.1, 48.5],                                   // 97,50 %
      7: [0, 0, 0, 0, 16.4, 34.3, 72.1, 151],                               // 97,70 %
      8: [0, 0, 0, 0, 8.99, 18.9, 39.6, 83.3, 175],                         // 97,52 %
      9: [0, 0, 0, 0, 0, 29.8, 62.6, 132, 276, 580],                        // 97,44 %
      10: [0, 0, 0, 0, 0, 16.4, 34.5, 72.4, 152, 319, 671]                  // 97,43 %
    },
    medium: {
      1: [0, 3.9],                                                          // 97,50 %
      2: [0, 1.79, 5],                                                      // 97,69 %
      3: [0, 0, 5.71, 16],                                                  // 97,45 %
      4: [0, 0, 2.85, 7.97, 22.3],                                          // 97,56 %
      5: [0, 0, 0, 8.93, 25, 70],                                           // 97,46 %
      6: [0, 0, 0, 0, 32.8, 91.8, 257],                                     // 97,55 %
      7: [0, 0, 0, 0, 15, 42, 118, 329],                                    // 97,49 %
      8: [0, 0, 0, 0, 0, 57.3, 160, 449, 1260],                             // 97,41 %
      9: [0, 0, 0, 0, 0, 27.4, 76.7, 215, 601, 1680],                       // 97,53 %
      10: [0, 0, 0, 0, 0, 0, 114, 318, 890, 2490, 6980]                     // 97,82 %
    },
    high: {
      1: [0, 3.9],                                                          // 97,50 %
      2: [0, 1.65, 5.93],                                                   // 97,67 %
      3: [0, 0, 5.41, 19.5],                                                // 97,61 %
      4: [0, 0, 0, 20.5, 73.6],                                             // 97,66 %
      5: [0, 0, 0, 0, 89, 320],                                             // 97,47 %
      6: [0, 0, 0, 0, 30.9, 111, 400],                                      // 97,59 %
      7: [0, 0, 0, 0, 0, 136, 489, 1760],                                   // 97,62 %
      8: [0, 0, 0, 0, 0, 0, 715, 2570, 9260],                               // 97,50 %
      9: [0, 0, 0, 0, 0, 0, 252, 907, 3260, 11750],                         // 97,54 %
      10: [0, 0, 0, 0, 0, 0, 0, 1470, 5300, 19070, 68660]                   // 97,41 %
    }
  };

  /** RTP réel d'une configuration (affiché en jeu, vérifié par les tests). */
  function rtpOf(k, risk) {
    const table = PAYTABLES[risk][k];
    const C = (n, x) => { let r = 1; for (let i = 0; i < x; i++) r = r * (n - i) / (i + 1); return r; };
    const total = C(NUMBERS, DRAWN);
    let ev = 0;
    for (let h = 0; h <= k; h++) ev += (C(k, h) * C(NUMBERS - k, DRAWN - h) / total) * table[h];
    return ev * 100;
  }

  J.Games.register({
    id: 'keno',
    name: 'Keno',
    icon: 'keno',
    color: '#f97316',
    rtp: 97.5,
    category: 'originals',
    tagline: 'Choisis tes numéros',
    volatility: 'Volatilité au choix',
    rules:
      'Choisis <b>1 à 10 numéros</b> parmi 40 (ou laisse le jeu en tirer au hasard), puis le tirage révèle 10 boules. ' +
      'Ton gain dépend du nombre de correspondances et du niveau de risque.<br><br>' +
      '<b>Classique</b> paie fréquemment de petits gains, <b>Élevé</b> ne paie que sur les grosses correspondances ' +
      '(jusqu\'à 68 660x pour 10 sur 10) avec une probabilité infime. Le RTP est de 97,5 % en moyenne : ' +
      'chaque configuration affiche son taux exact dans le panneau des gains.',
    playLabel: 'Lancer le tirage 🎱',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.selected = g.selected || [];
      g.risk = g.risk || 'classic';
      g.k = g.selected.length || 5;
      g.drawn = [];
      g.hits = 0;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      const k = g.selected.length || g.k;
      const table = PAYTABLES[g.risk][k];
      const chips = table.map((m, h) => {
        if (m === 0) return '';
        const best = m === Math.max.apply(null, table);
        return '<div class="' + (best ? 'best' : '') + '">' + U.fmtMult(m) + '<span>' + h + '/' + k + '</span></div>';
      }).join('');

      return '<div class="seg" id="knRisk">' +
          Object.keys(RISK_LABEL).map((r) => '<button data-risk="' + r + '"' + (g.risk === r ? ' class="is-on"' : '') + '>' + RISK_LABEL[r] + '</button>').join('') +
        '</div>' +
        '<div class="row between mt"><span class="bet-label">Numéros choisis</span>' +
          '<span class="mono up" id="knCountLbl">' + g.selected.length + ' / 10 · RTP ' + rtpOf(k, g.risk).toFixed(2) + ' %</span></div>' +
        '<div class="keno-pay" id="knPay">' + chips + '</div>' +
        '<div class="btn-row two">' +
          '<button class="btn xs ghost" id="knRandom">🎲 Sélection aléatoire</button>' +
          '<button class="btn xs ghost" id="knClear">Effacer</button>' +
        '</div>';
    },

    payoutHint(g) {
      const k = g.selected.length;
      if (!k) return 'Choisis au moins 1 numéro sur la grille';
      const table = PAYTABLES[g.risk][k];
      return 'Gain max : <b class="up">' + U.fmtMult(Math.max.apply(null, table)) + '</b> (' + k + '/' + k + ')';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="keno-wrap">' +
        '<div class="keno-balls" id="knBalls"></div>' +
        '<div class="keno-grid" id="knGrid"></div>' +
        '<div class="sub center" id="knMsg">Touche les numéros que tu veux jouer</div>' +
      '</div>';
    },

    mount(g) {
      g.gridEl = document.getElementById('knGrid');
      g.ballsEl = document.getElementById('knBalls');
      g.msgEl = document.getElementById('knMsg');

      let html = '';
      for (let n = 1; n <= NUMBERS; n++) html += '<button class="keno-cell" data-num="' + n + '">' + n + '</button>';
      g.gridEl.innerHTML = html;
      g.gridEl.querySelectorAll('[data-num]').forEach((c) => {
        c.onclick = () => toggleNumber(g, parseInt(c.dataset.num, 10));
      });

      g.panelEl.querySelectorAll('#knRisk [data-risk]').forEach((b) => {
        b.onclick = () => {
          if (g.busy) { J.toast('Attends la fin du tirage', 'ko'); return; }
          J.Sfx.click();
          g.risk = b.dataset.risk;
          g.panelEl.querySelectorAll('#knRisk [data-risk]').forEach((x) => x.classList.toggle('is-on', x === b));
          J.Games.renderPanel(g);
          if (g.def.mount) mountHandlers(g);
        };
      });
      const btnR = g.panelEl.querySelector('#knRandom');
      const btnC = g.panelEl.querySelector('#knClear');
      if (btnR) btnR.onclick = () => { J.Sfx.click(); randomPick(g); };
      if (btnC) btnC.onclick = () => { J.Sfx.click(); g.selected = []; paintGrid(g); J.Games.renderPanel(g); if (g.def.mount) mountHandlers(g); };

      paintGrid(g);
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      const none = g.selected.length === 0;
      return [{
        label: none ? '🎲 Lancer avec 5 numéros au hasard'
                    : (g.auto.on ? 'Tirages en cours…' : 'Lancer le tirage 🎱'),
        cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on
      }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      // Aucun numéro choisi : le jeu en tire 5 au hasard (l'action reste possible)
      if (g.selected.length === 0) {
        const pool = [];
        for (let i = 1; i <= NUMBERS; i++) pool.push(i);
        for (let i = 0; i < 5; i++) g.selected.push(pool.splice(J.Fair.int(0, pool.length - 1), 1)[0]);
        g.selected.sort((a, b) => a - b);
        paintGrid(g);
        J.toast('🎲 5 numéros tirés au hasard pour toi', 'ok');
      }
      const k = g.selected.length;
      const table = PAYTABLES[g.risk][k];

      // Tirage de 10 numéros distincts sur 40 (Fair Play, sans remise)
      const pool = [];
      for (let i = 1; i <= NUMBERS; i++) pool.push(i);
      const drawn = [];
      for (let i = 0; i < DRAWN; i++) drawn.push(pool.splice(J.Fair.int(0, pool.length - 1), 1)[0]);
      g.drawn = drawn;
      g.hits = drawn.filter((n) => g.selected.indexOf(n) > -1).length;
      g.multiplier = table[g.hits];

      // Remise à zéro de l'affichage puis révélation boule par boule
      paintGrid(g);
      g.ballsEl.innerHTML = '';
      g.msgEl.textContent = 'Tirage en cours…';
      J.Sfx.bet();

      const step = g.auto.on ? Math.max(45, g.auto.speed * 0.22) : 210;
      drawn.forEach((n, i) => {
        J.Games.schedule(g, () => {
          if (!g.ticket) return;
          const ball = document.createElement('span');
          ball.className = 'keno-ball' + (g.selected.indexOf(n) > -1 ? ' hit' : '');
          ball.textContent = n;
          g.ballsEl.appendChild(ball);
          const cell = g.gridEl.querySelector('[data-num="' + n + '"]');
          if (cell) cell.classList.add(g.selected.indexOf(n) > -1 ? 'hit-sel' : 'hit');
          J.Sfx.coin();
        }, i * step);
      });
      J.Games.schedule(g, () => land(g), drawn.length * step + 120);
    }
  });

  /* ------------------------------------------------------- SÉLECTION */
  function toggleNumber(g, n) {
    if (g.busy) return;
    const i = g.selected.indexOf(n);
    if (i > -1) g.selected.splice(i, 1);
    else {
      if (g.selected.length >= 10) { J.toast('10 numéros maximum', 'ko'); return; }
      g.selected.push(n);
    }
    J.Sfx.tap();
    paintGrid(g);
    J.Games.renderPanel(g);
    mountHandlers(g);
  }

  function randomPick(g) {
    const k = g.selected.length || g.k || 5;
    const pool = [];
    for (let i = 1; i <= NUMBERS; i++) pool.push(i);
    g.selected = [];
    for (let i = 0; i < k; i++) g.selected.push(pool.splice(J.Fair.int(0, pool.length - 1), 1)[0]);
    g.selected.sort((a, b) => a - b);
    paintGrid(g);
    J.Games.renderPanel(g);
    mountHandlers(g);
    J.toast('🎲 ' + k + ' numéros tirés au hasard', 'ok');
  }

  /** Recolle les gestionnaires après un re-rendu du panneau (risque, sélection…). */
  function mountHandlers(g) {
    g.panelEl.querySelectorAll('#knRisk [data-risk]').forEach((b) => {
      b.onclick = () => {
        if (g.busy) { J.toast('Attends la fin du tirage', 'ko'); return; }
        J.Sfx.click();
        g.risk = b.dataset.risk;
        J.Games.renderPanel(g);
        mountHandlers(g);
      };
    });
    const btnR = g.panelEl.querySelector('#knRandom');
    const btnC = g.panelEl.querySelector('#knClear');
    if (btnR) btnR.onclick = () => { J.Sfx.click(); randomPick(g); };
    if (btnC) btnC.onclick = () => { J.Sfx.click(); g.selected = []; paintGrid(g); J.Games.renderPanel(g); mountHandlers(g); };
  }

  function paintGrid(g) {
    if (!g.gridEl) return;
    g.gridEl.querySelectorAll('[data-num]').forEach((c) => {
      const n = parseInt(c.dataset.num, 10);
      c.classList.remove('hit', 'hit-sel', 'dim');
      c.classList.toggle('sel', g.selected.indexOf(n) > -1);
      if (g.drawn.length && g.drawn.indexOf(n) > -1) c.classList.add(g.selected.indexOf(n) > -1 ? 'hit-sel' : 'hit');
    });
  }

  /* ------------------------------------------------------------ RÉSOLUTION */
  function land(g) {
    if (!g || !g.ticket) return;
    const mult = g.multiplier;
    const hits = g.hits;
    const k = g.selected.length;
    const payout = Math.round(g.ticket.bet * mult);
    paintGrid(g);

    if (mult > 0) {
      g.msgEl.innerHTML = '🎉 <b class="up">' + hits + ' / ' + k + '</b> correspondances — gain ' + U.fmtMult(mult);
      J.Sfx.win(mult); J.haptic.win(mult);
      J.floatText('+' + U.fmt(payout), { el: g.ballsEl, color: 'var(--green)', size: 22 });
      J.FX.confetti({ count: mult >= 20 ? 110 : mult >= 5 ? 50 : 18, x: window.innerWidth / 2, y: g.stageEl.getBoundingClientRect().top + 60 });
      if (mult >= 50) J.Live.playerWin('keno', mult, payout);
    } else {
      g.msgEl.innerHTML = '❌ <b class="down">' + hits + ' / ' + k + '</b> correspondances — aucun gain';
      J.Sfx.lose(); J.haptic.lose();
    }
    J.Games.finish(g, mult || 0, { detail: hits + '/' + k + ' numéros' });
    // Nouvelle grille pour le tirage suivant
    g.drawn = [];
    J.Games.schedule(g, () => { paintGrid(g); }, 500);
  }
})();
