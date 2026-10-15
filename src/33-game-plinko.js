/* =========================================================================
   JEU 4 — PLINKO
   Balle lâchée en haut, rebonds sur les picots, caisse finale.
   3 niveaux de risque × 8 à 16 lignes. Tables de gains standard
   (RTP ≈ 99 %) : chaque direction gauche/droite est tirée via Fair Play.

   Géométrie : la rangée de picots i (0-indexée) en compte i+3 ; les
   intervalles entre picots donnent rows+1 caisses (distribution binomiale).
   Position horizontale d'une balle ayant pris k « droites » après i+1
   décisions :  x = centre + (k − (i+1)/2) × pas.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /** Tables de multiplicateurs par nombre de lignes et niveau de risque. */
  const PAYOUTS = {
    8: {
      low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
    },
    9: {
      low: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
      medium: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
      high: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43]
    },
    10: {
      low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
      medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
      high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
    },
    11: {
      low: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
      medium: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
      high: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120]
    },
    12: {
      low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]
    },
    13: {
      low: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
      medium: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
      high: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260]
    },
    14: {
      low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
      medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
      high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420]
    },
    15: {
      low: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
      medium: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
      high: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620]
    },
    16: {
      low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
    }
  };

  const RISK_LABEL = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

  /** Couleur d'une caisse selon son rang de gain (centre vert → bords rouges). */
  function bucketColor(t) {
    if (t < 0.5) {
      const k = t / 0.5;
      return 'rgb(' + Math.round(255 * k) + ',' + Math.round(227 - 30 * k) + ',' + Math.round(122 - 40 * k) + ')';
    }
    const k = (t - 0.5) / 0.5;
    return 'rgb(255,' + Math.round(197 - 120 * k) + ',' + Math.round(82 - 35 * k) + ')';
  }

  /** Libellé compact d'un multiplicateur de caisse. */
  const bucketLabel = (m) => (m >= 1000 ? (m / 1000) + 'k' : m >= 10 ? String(m) : m.toFixed(1).replace('.', ',')) + 'x';

  /* ------------------------------------------------------------ GÉOMÉTRIE */
  let G = null;                                     // géométrie courante

  function layout(g) {
    const box = g.stageEl;
    const W = box.clientWidth;
    // Le canvas s'adapte à la hauteur disponible (jamais de débordement clippé)
    const H = Math.max(160, box.clientHeight - 32);
    const ctx = J.util.fitCanvas(g.cv, W, H);
    const rows = g.rows;
    const topPad = 14, bucketH = 21, botPad = 8;
    const rowH = (H - topPad - bucketH - botPad) / (rows + 1);
    const slotW = W / (rows + 1);
    G = { W, H, rows, topPad, bucketH, botPad, rowH, slotW, cx: W / 2, ctx };
    return G;
  }

  const pegY = (i) => G.topPad + (i + 1) * G.rowH;              // rangée de picots i (0-index)
  const bucketY = () => G.topPad + (G.rows + 1) * G.rowH;
  const gapX = (k, i) => G.cx + (k - (i + 1) / 2) * G.slotW;    // position après i+1 décisions
  const bucketX = (k) => G.cx + (k - G.rows / 2) * G.slotW;

  /* ---------------------------------------------------------------- RENDU */
  function drawBoard(g, st) {
    if (!G) return;
    const { W, H, rows, ctx } = G;
    ctx.clearRect(0, 0, W, H);

    // Picots : rangée i -> i+3 picots
    ctx.fillStyle = 'rgba(198,214,240,.5)';
    for (let i = 0; i < rows; i++) {
      const y = pegY(i);
      for (let j = 0; j <= i + 2; j++) {
        const x = G.cx + (j - (i + 2) / 2) * G.slotW;
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Caisses
    const table = PAYOUTS[rows][g.risk];
    const maxP = Math.max.apply(null, table), minP = Math.min.apply(null, table);
    const by = bucketY() - 2;
    for (let k = 0; k <= rows; k++) {
      const t = maxP === minP ? 0.5 : (table[k] - minP) / (maxP - minP);
      const c = bucketColor(t);
      const w = G.slotW - 3;
      const x = bucketX(k) - G.slotW / 2 + 1.5;
      const win = st && st.result === k;
      roundRect(ctx, x, by, w, G.bucketH, 6);
      ctx.fillStyle = win ? '#ffffff' : c;
      ctx.fill();
      if (win) { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = '#06121f';
      ctx.font = '700 ' + (G.slotW < 26 ? 8 : G.slotW < 34 ? 9.5 : 11) + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(x + w / 2, by + G.bucketH / 2 + 0.5);
      if (G.slotW < 30) ctx.rotate(-Math.PI / 2 * 0.92);          // caisses étroites : libellé vertical
      ctx.fillText(bucketLabel(table[k]), 0, 0);
      ctx.restore();
    }

    // Balle
    if (st && st.x != null) drawBall(ctx, st.x, st.y);
  }

  function drawBall(ctx, bx, by) {
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, 15);
    grad.addColorStop(0, 'rgba(255,197,49,.5)');
    grad.addColorStop(1, 'rgba(255,197,49,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, 6.5);
    bg.addColorStop(0, '#fff8de'); bg.addColorStop(1, '#dfa000');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, Math.PI * 2); ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Légende horizontale sous le canvas (lisible même sur petit écran). */
  function renderLegend(g) {
    const table = PAYOUTS[g.rows][g.risk];
    const maxP = Math.max.apply(null, table), minP = Math.min.apply(null, table);
    g.legendEl.innerHTML = table.map((m) => {
      const t = maxP === minP ? 0.5 : (m - minP) / (maxP - minP);
      return '<div style="background:' + bucketColor(t) + '">' + bucketLabel(m) + '</div>';
    }).join('');
  }

  /* ---------------------------------------------------- POSITION DE LA BALLE */
  /**
   * Position de la balle pour un étage s (0…rows) et une progression locale.
   * s = 0 : chute initiale ; s = rows : chute finale vers la caisse.
   */
  function ballPos(g, s, local) {
    const isStart = s === 0;
    const endIsBucket = s >= g.rows;
    const x0 = isStart ? G.cx : gapX(g.rights[s], s - 1);
    const y0 = isStart ? G.topPad * 0.35 : pegY(s - 1);
    const x1 = endIsBucket ? bucketX(g.rights[g.rows]) : gapX(g.rights[s + 1], s);
    const y1 = endIsBucket ? bucketY() + G.bucketH * 0.45 : pegY(s);
    const e = Math.pow(local, 1.5);                                     // accélération de la chute
    return { x: x0 + (x1 - x0) * e + Math.sin(local * Math.PI) * (x1 - x0) * 0.12, y: y0 + (y1 - y0) * e };
  }

  /* ============================================================== LE JEU */
  J.Games.register({
    id: 'plinko',
    name: 'Plinko',
    icon: 'plinko',
    color: '#ffc531',
    rtp: 99,
    category: 'originals',
    tagline: 'Rebonds et caisses',
    volatility: 'Volatilité réglable',
    hot: true,
    rules:
      'La balle tombe sur les picots : à chaque étage elle part à gauche ou à droite (50/50, tiré via Fair Play). ' +
      'Elle finit dans une caisse dont le multiplicateur dépend de sa position finale.<br><br>' +
      '<b>Risque faible</b> : beaucoup de petits gains. <b>Risque élevé</b> : les caisses centrales rapportent très peu ' +
      'mais les bords montent jusqu\'à 1 000x. Plus il y a de lignes, plus la balle a de chances de finir au centre.',
    playLabel: 'Lâcher la balle 🔴',

    /** État initial (avant rendu du panneau). */
    state(g) {
      g.rows = U.clamp(g.rows || 12, 8, 16);
      g.risk = g.risk || 'medium';
      g.rights = [];
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="seg" id="plRisk">' +
          ['low', 'medium', 'high'].map((r) => '<button data-risk="' + r + '"' + (g.risk === r ? ' class="is-on"' : '') + '>' + RISK_LABEL[r] + '</button>').join('') +
        '</div>' +
        '<div class="row between mt"><span class="bet-label">Lignes de picots</span><span class="mono up" id="plRowsLbl">' + g.rows + '</span></div>' +
        '<input type="range" id="plRows" min="8" max="16" step="1" value="' + g.rows + '" class="thin mt-s">';
    },

    payoutHint(g) {
      const t = PAYOUTS[g.rows][g.risk];
      const c = t[Math.floor(t.length / 2)];
      return 'Centre ' + U.fmtMult(c) + ' · bords jusqu\'à <b class="gold">' + U.fmtMult(Math.max.apply(null, t)) + '</b>';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<canvas id="plCv" style="flex:1 1 auto;width:100%;display:block"></canvas>' +
        '<div class="plinko-legend" id="plLegend"></div>';
    },

    mount(g) {
      g.cv = document.getElementById('plCv');
      g.legendEl = document.getElementById('plLegend');

      const riskSeg = g.panelEl.querySelector('#plRisk');
      riskSeg.querySelectorAll('[data-risk]').forEach((b) => {
        b.onclick = () => {
          if (g.busy) { J.toast('Attends la fin de la balle', 'ko'); return; }
          J.Sfx.click();
          g.risk = b.dataset.risk;
          riskSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
          refresh(g);
        };
      });
      const rowsRange = g.panelEl.querySelector('#plRows');
      rowsRange.oninput = () => {
        if (g.busy) { rowsRange.value = g.rows; J.toast('Attends la fin de la balle', 'ko'); return; }
        g.rows = U.clamp(parseInt(rowsRange.value, 10), 8, 16);
        const lbl = g.panelEl.querySelector('#plRowsLbl');
        if (lbl) lbl.textContent = g.rows;
        refresh(g);
      };

      g._onResize = () => { layout(g); drawBoard(g, null); renderLegend(g); };
      window.addEventListener('resize', g._onResize);
      requestAnimationFrame(() => { g._onResize(); });
    },

    stop(g) {
      if (g._onResize) window.removeEventListener('resize', g._onResize);
      if (g._raf) cancelAnimationFrame(g._raf);
      g._raf = null;
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      return [{ label: g.busy ? 'Balle en jeu…' : 'Lâcher la balle 🔴', cls: 'primary wide-lg grow', act: 'play', disabled: g.busy }];
    },

    /* --------------------------------------------------------- TOUR DE JEU */
    start(g) {
      const n = g.rows;
      // Une décision gauche/droite par étage — tirage provably fair
      g.rights = [0];
      let k = 0;
      for (let i = 0; i < n; i++) {
        if (J.Fair.float() >= 0.5) k++;
        g.rights.push(k);
      }
      g.landed = k;
      g.multiplier = PAYOUTS[n][g.risk][k];

      const rowTime = g.auto.on ? Math.max(34, g.auto.speed * 0.26) : 74;
      const dur = rowTime * (n + 1);
      const t0 = performance.now();
      let lastStage = -1;
      J.Sfx.bet();

      const frame = (t) => {
        if (!g.ticket) { g._raf = null; return; }
        const p = Math.min(1, (t - t0) / dur);
        const stageF = p * (n + 1);
        const s = Math.min(n, Math.floor(stageF));
        const local = stageF - s;
        if (s > lastStage) { lastStage = s; if (s > 0) J.Sfx.tick(Math.min(40, s * 3)); }
        const pos = ballPos(g, s, local);
        drawBoard(g, { x: pos.x, y: pos.y, result: null });
        if (p < 1) g._raf = requestAnimationFrame(frame);
        else { g._raf = null; land(g); }
      };
      g._raf = requestAnimationFrame(frame);
    }
  });

  /** Recalcule et redessine après un changement de réglage. */
  function refresh(g) {
    layout(g);
    drawBoard(g, null);
    renderLegend(g);
    J.Games.updateHints(g);
  }

  /* ------------------------------------------------------------- ARRIVÉE */
  function land(g) {
    const mult = g.multiplier;
    const payout = Math.round(g.ticket.bet * mult);
    drawBoard(g, { x: bucketX(g.landed), y: bucketY() + G.bucketH * 0.5, result: g.landed });
    if (mult >= 1) {
      J.Sfx.win(mult); J.haptic.win(mult);
      J.floatText('+' + U.fmt(payout - g.ticket.bet), { el: g.legendEl, color: 'var(--green)', size: 22 });
      const strong = mult >= 5;
      J.FX.confetti({ count: strong ? 80 : 20, x: window.innerWidth / 2 + (g.landed - g.rows / 2) * 10, y: g.stageEl.getBoundingClientRect().bottom - 26 });
      if (strong) J.Live.playerWin('plinko', mult, payout);
    } else {
      J.Sfx.lose(); J.haptic.lose();
    }
    J.Games.finish(g, mult, { detail: U.fmtMult(mult) + ' (caisse ' + (g.landed + 1) + '/' + (g.rows + 1) + ')' });
  }
})();
