/* =========================================================================
   JEU 3 — MINES
   Grille 5×5, 1 à 24 mines. Chaque case sûre révélée augmente le
   multiplicateur ; on peut encaisser à tout moment. Une mine = mise perdue.

   Mathématiques (probabilité exacte, sans remise) :
     mult(k) = 0,99 × Π(i=0→k-1) (25-i) / (25-mines-i)
   RTP = 99 % pour tout nombre de mines et tout nombre de cases révélées.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const SIZE = 5, TILES = SIZE * SIZE;
  const HOUSE = 0.99;

  /** Multiplicateur après k cases sûres, avec m mines. */
  function multFor(k, m) {
    let p = HOUSE;
    for (let i = 0; i < k; i++) p *= (TILES - i) / (TILES - m - i);
    return k === 0 ? 1 : p;
  }

  J.Games.register({
    id: 'mines',
    name: 'Mines',
    icon: 'mines',
    color: '#ff4d5e',
    rtp: 99,
    category: 'originals',
    tagline: 'Trouve les diamants',
    volatility: 'Volatilité progressive',
    hot: true,
    rules:
      'Une grille de <b>25 cases</b> contient le nombre de mines que tu choisis (1 à 24). Révèle des cases : ' +
      'chaque diamant augmente le multiplicateur, et tu peux <b>encaisser à tout moment</b>. ' +
      'Tomber sur une mine fait perdre la mise.<br><br>' +
      'Moins il y a de mines, plus la progression est douce ; avec 24 mines, un seul diamant vaut déjà 24,75x. ' +
      'Le mode Auto-bet révèle automatiquement un nombre de cases fixé, puis encaisse.',
    playLabel: 'Nouvelle partie 💎',

    /** État initial (avant rendu du panneau). */
    state(g) {
      g.mineCount = g.mineCount || 3;
      g.autoPicks = g.autoPicks || 3;
      g.picked = [];
      g.active = false;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      const m = g.mineCount || 3;
      return '<div class="row between"><span class="bet-label">Nombre de mines</span>' +
          '<span class="mono up" id="mnCountLbl">' + m + '</span></div>' +
        '<input type="range" id="mnRange" min="1" max="24" step="1" value="' + m + '" class="thin mt-s">' +
        '<div class="money-quick mt-s">' +
          [1, 3, 5, 10, 24].map((v) => '<button data-mines="' + v + '"' + (v === m ? ' style="border-color:rgba(0,227,122,.5);color:var(--green)"' : '') + '>' + v + '</button>').join('') +
        '</div>' +
        '<div class="row mt-s"><div class="field grow"><span class="suffix">CASES AUTO</span>' +
          '<input id="mnAutoPicks" type="number" min="1" max="24" value="' + (g.autoPicks || 3) + '"></div>' +
          '<span class="sub">cases révélées par partie en mode auto</span></div>';
    },

    payoutHint(g) {
      if (!g.active) return 'Multiplicateur de départ : ' + U.fmtMult(multFor(1, g.mineCount));
      const cur = multFor(g.picked.length, g.mineCount);
      const nxt = multFor(g.picked.length + 1, g.mineCount);
      return 'Actuel : <b class="up">' + U.fmtMult(cur) + '</b> · prochaine case ' + U.fmtMult(nxt);
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="grow" style="display:flex;flex-direction:column">' +
        '<div class="mines-grid grow" id="mnGrid" style="grid-template-columns:repeat(' + SIZE + ',1fr)"></div>' +
        '<div class="row between" style="padding:0 12px 10px;font-size:11px">' +
          '<span class="sub">Diamants : <b class="mono up" id="mnGems">0</b></span>' +
          '<span class="sub">Multiplicateur : <b class="mono gold" id="mnMult">1,00x</b></span>' +
          '<span class="sub">Gain : <b class="mono" id="mnGain">0</b> J</span>' +
        '</div>' +
      '</div>';
    },

    mount(g) {
      g.gridEl = document.getElementById('mnGrid');
      g.gemsEl = document.getElementById('mnGems');
      g.multEl = document.getElementById('mnMult');
      g.gainEl = document.getElementById('mnGain');

      const range = g.panelEl.querySelector('#mnRange');
      range.oninput = () => setMines(g, parseInt(range.value, 10));
      g.panelEl.querySelectorAll('[data-mines]').forEach((b) => {
        b.onclick = () => { J.Sfx.click(); setMines(g, parseInt(b.dataset.mines, 10)); };
      });
      const ap = g.panelEl.querySelector('#mnAutoPicks');
      if (ap) ap.onchange = () => { g.autoPicks = U.clamp(parseInt(ap.value, 10) || 1, 1, 24); ap.value = g.autoPicks; };

      buildGrid(g);
      updateStats(g);
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.active) {
        const cur = multFor(g.picked.length, g.mineCount);
        const gain = Math.round(g.bet * cur);
        return [
          { label: g.picked.length === 0 ? 'Révèle une case…' : '💰 Encaisser · +' + U.fmt(gain),
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true, disabled: g.picked.length === 0 },
          { label: '⏹', cls: 'ghost', onClick: (gg) => J.Games.stopAuto(gg, 'Arrêt demandé'), alsoWhenBusy: true }
        ];
      }
      return [{ label: g.auto.on ? 'Série en cours…' : 'Nouvelle partie 💎', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* --------------------------------------------------------- TOUR DE JEU */
    start(g) {
      // Placement des mines : tirages fair sans remise
      const pool = [];
      for (let i = 0; i < TILES; i++) pool.push(i);
      g.mines = [];
      for (let i = 0; i < g.mineCount; i++) {
        const idx = J.Fair.int(0, pool.length - 1);
        g.mines.push(pool.splice(idx, 1)[0]);
      }
      g.picked = [];
      g.active = true;
      buildGrid(g);
      updateStats(g);
      J.Games.renderActions(g);
      J.Games.updateHints(g);
      J.Sfx.bet();

      // Mode auto : révéler automatiquement N cases, PUIS encaisser
      if (g.auto.on) {
        const speed = Math.max(60, g.auto.speed * 0.6);
        const picks = Math.min(g.autoPicks, TILES - g.mineCount);   // jamais plus que de cases sûres
        for (let i = 0; i < picks; i++) {
          J.Games.schedule(g, () => {
            if (!g.active) return;
            const hidden = [];
            g.gridEl.querySelectorAll('[data-tile]').forEach((t) => {
              if (!t.classList.contains('picked') && !t.classList.contains('bomb')) hidden.push(parseInt(t.dataset.tile, 10));
            });
            if (!hidden.length) return;
            pick(g, hidden[J.Fair.int(0, hidden.length - 1)], true);
          }, i * speed);
        }
        // Encaissement automatique une fois les cases révélées (sinon la série resterait bloquée).
        // Note : `cashout` est une méthode de la définition du jeu, pas une fonction du module.
        J.Games.schedule(g, () => { if (g.active) g.def.cashout(g); }, picks * speed + 90);
      }
    },

    /* ------------------------------------------------------- ENCAISSEMENT */
    cashout(g) {
      if (!g.active || g.picked.length === 0) return;
      const mult = multFor(g.picked.length, g.mineCount);
      g.active = false;
      const payout = Math.round(g.ticket.bet * mult);
      revealMines(g);
      J.FX.celebrate({ mult: mult, payout: payout, el: g.gainEl });
      if (mult >= 5) J.Live.playerWin('mines', mult, payout);
      J.Games.finish(g, mult, { detail: g.picked.length + ' diamants', celebrated: true });
    }
  });

  /* ------------------------------------------------------------- RENDU GRILLE */
  function buildGrid(g) {
    let html = '';
    for (let i = 0; i < TILES; i++) html += '<button class="mine-tile" data-tile="' + i + '"></button>';
    g.gridEl.innerHTML = html;
    g.gridEl.querySelectorAll('[data-tile]').forEach((t) => {
      t.onclick = () => { if (g.active) pick(g, parseInt(t.dataset.tile, 10)); else J.Sfx.click(); };
    });
  }

  /** Révèle une case : diamant (suite) ou mine (fin de partie). */
  function pick(g, idx, silent) {
    if (!g.active) return;
    const tile = g.gridEl.querySelector('[data-tile="' + idx + '"]');
    if (!tile || tile.classList.contains('picked') || tile.classList.contains('bomb')) return;
    const isMine = g.mines.indexOf(idx) > -1;

    if (isMine) {
      tile.textContent = '💣';
      tile.classList.add('bomb', 'dead');
      g.active = false;
      revealMines(g);
      J.Sfx.reveal(false); J.haptic.lose(); J.shake(g.gridEl); J.redFlash();
      updateStats(g);
      J.toast('💣 Mine ! Mise perdue.', 'ko');
      J.Games.finish(g, 0, { detail: 'mine après ' + g.picked.length + ' diamant(s)' });
      return;
    }

    tile.textContent = '💎';
    tile.classList.add('picked');
    g.picked.push(idx);
    if (!silent) { J.Sfx.reveal(true); J.haptic.tap(); }
    else J.Sfx.coin();
    updateStats(g);
    J.Games.updateHints(g);
    // Mise à jour du montant encaissable sans reconstruire le bouton
    const cash = g.panelEl.querySelector('[data-act="cashout"]');
    if (cash) {
      const cur2 = multFor(g.picked.length, g.mineCount);
      cash.innerHTML = '💰 Encaisser · +' + U.fmt(Math.round(g.ticket.bet * cur2));
      // Le bouton est né désactivé (aucune case révélée) : il doit devenir
      // actif dès la première gemme, sinon le gain est affiché mais encaissable… jamais.
      if (g.picked.length > 0) { cash.disabled = false; cash.removeAttribute('aria-disabled'); }
    }
  }

  /** À la fin de la partie, on montre toutes les mines (transparence). */
  function revealMines(g) {
    g.mines.forEach((i) => {
      const t = g.gridEl.querySelector('[data-tile="' + i + '"]');
      if (t && !t.classList.contains('bomb')) { t.textContent = '💣'; t.classList.add('revealed'); }
    });
  }

  function updateStats(g) {
    if (!g.gemsEl) return;
    const mult = multFor(g.picked.length, g.mineCount);
    const gain = g.ticket ? Math.round(g.ticket.bet * mult) : Math.round(g.bet * mult);
    g.gemsEl.textContent = g.picked.length;
    g.multEl.textContent = U.fmtMult(mult);
    g.gainEl.textContent = U.fmt(gain);
  }

  /** Change le nombre de mines (uniquement hors partie). */
  function setMines(g, n) {
    // Les probabilités se calculent avec le nombre de mines de la partie en cours :
    // on interdit donc toute modification tant que la grille est active.
    if (g.active) {
      const r = g.panelEl.querySelector('#mnRange');
      if (r) r.value = g.mineCount;
      const l = g.panelEl.querySelector('#mnCountLbl');
      if (l) l.textContent = g.mineCount;
      J.toast('Termine la partie en cours pour changer les mines', 'ko');
      return;
    }
    n = U.clamp(n, 1, 24);
    g.mineCount = n;
    const range = g.panelEl.querySelector('#mnRange');
    const lbl = g.panelEl.querySelector('#mnCountLbl');
    if (range) range.value = n;
    if (lbl) lbl.textContent = n;
    g.panelEl.querySelectorAll('[data-mines]').forEach((b) => {
      const on = parseInt(b.dataset.mines, 10) === n;
      b.style.borderColor = on ? 'rgba(0,227,122,.5)' : '';
      b.style.color = on ? 'var(--green)' : '';
    });
    updateStats(g);
    J.Games.updateHints(g);
  }
})();
