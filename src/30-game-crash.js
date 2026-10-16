/* =========================================================================
   JEU 1 — CRASH
   Le multiplicateur grimpe en direct : encaisse avant l'explosion.
   Point de crash : crashPoint = 0,99 / (1 - u)  (u = aléa uniforme fair).
   RTP ≈ 99 % (marge maison 1 %), comme sur les Originals classiques.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /**
   * Courbe de montée : m(t) = e^(a·t + b·t²), t en millisecondes.
   * Calibrée pour une sensation proche des jeux Crash réels :
   *   2x ≈ 4 s · 5x ≈ 9 s · 10x ≈ 13 s · 100x ≈ 25 s
   */
  const GROWTH_A = 0.00017;
  const GROWTH_B = 4.4e-10;
  const multAt = (ms) => Math.exp(GROWTH_A * Math.max(0, ms) + GROWTH_B * Math.max(0, ms) * Math.max(0, ms));

  /** Point de crash à partir d'un aléa uniforme [0,1[ (marge maison 1 %). */
  const crashPointFrom = (u) => Math.max(1.00, Math.floor(100 * 0.99 / (1 - u)) / 100);

  /* --------------------------------------------------------------- RENDU */
  /** Dessine la courbe de vol : axes, aire dégradée, tête lumineuse. */
  function draw(g, points, mult, crashed) {
    const ctx = g.ctx;
    if (!ctx) return;
    const W = g.w, H = g.h;
    const padL = 8, padB = 16;
    const cw = Math.max(10, W - padL * 2);
    const ch = Math.max(10, H - padB - 6);

    ctx.clearRect(0, 0, W, H);

    // Échelle logarithmique : lisible de 1,1x à 1000x
    const maxM = Math.max(2, Math.max.apply(null, points) * 1.35);
    const logMax = Math.log(maxM);
    const yOf = (m) => H - padB - (Math.log(Math.max(1, m)) / logMax) * ch;
    const xOf = (i, n) => padL + (i / Math.max(1, n - 1)) * cw * 0.94;

    // Grille horizontale (repères de multiplicateur)
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.font = '600 9px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    [1.5, 2, 5, 10, 50, 100, 500].forEach((m) => {
      if (m > maxM) return;
      const y = yOf(m);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padL, y); ctx.stroke();
      ctx.fillText(U.fmtMult(m), W - padL - 34, y - 3);
    });

    const n = points.length;
    if (n < 2) return;

    // Aire sous la courbe
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    if (crashed) { grad.addColorStop(0, 'rgba(255,77,94,.42)'); grad.addColorStop(1, 'rgba(255,77,94,0)'); }
    else { grad.addColorStop(0, 'rgba(0,227,122,.38)'); grad.addColorStop(1, 'rgba(0,227,122,0)'); }
    ctx.beginPath();
    ctx.moveTo(xOf(0, n), H - padB);
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(i, n), yOf(points[i]));
    ctx.lineTo(xOf(n - 1, n), H - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Courbe
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(i, n), y = yOf(points[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = crashed ? '#ff4d5e' : '#00e37a';
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.shadowColor = crashed ? 'rgba(255,77,94,.8)' : 'rgba(0,227,122,.8)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tête (position courante)
    const hx = xOf(n - 1, n), hy = yOf(points[n - 1]);
    ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? '#ff4d5e' : '#8dffc4'; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? 'rgba(255,77,94,.22)' : 'rgba(0,227,122,.22)'; ctx.fill();
  }

  J.Games.register({
    id: 'crash',
    name: 'Crash',
    icon: 'crash',
    color: '#00e37a',
    rtp: 99,
    category: 'originals',
    tagline: 'Encaisse avant l\'explosion',
    volatility: 'Volatilité moyenne',
    hot: true,
    rules:
      'La fusée décolle et le multiplicateur grimpe en direct. Tu peux <b>encaisser à tout moment</b> : ' +
      'gain = mise × multiplicateur affiché au moment du clic. Si la fusée explose avant que tu encaisses, tu perds la mise.<br><br>' +
      '<b>Astuce :</b> viser 10x plutôt que 2x multiplie par ~5 la probabilité d\'explosion avant ton cash out. ' +
      'En mode Auto-bet, l\'encaissement se fait automatiquement au multiplicateur cible indiqué ci-dessus.',
    playLabel: 'Miser et décoller 🚀',

    /** État initial (avant rendu du panneau). */
    state(g) {
      g.autoCash = g.autoCash || 2;
      g.mult = 1;
      g.phase = 'idle';
      g.points = [1, 1];
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="field"><span class="suffix">CASH OUT AUTO</span>' +
        '<input id="crAuto" type="number" min="1.01" step="0.1" value="' + (g.autoCash || 2).toFixed(2) + '">' +
        '<span class="suffix">x</span></div>' +
        '<div class="sub mt-s">Cible utilisée par le mode Auto-bet et rappelée sous la courbe.</div>';
    },

    payoutHint(g) {
      return g.phase === 'fly'
        ? 'Encaissement actuel : <b class="up">' + U.fmtMult(g.mult || 1) + '</b> · cible ' + U.fmtMult(g.autoCash || 2)
        : 'Gain = mise × multiplicateur au moment du cash out';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<canvas id="crCv" style="flex:1 1 auto;width:100%;display:block"></canvas>' +
        '<div class="crash-mult" id="crMult" style="color:var(--txt)">1,00x</div>' +
        '<div style="position:absolute;left:10px;bottom:6px;font-size:10px;color:var(--muted)" id="crSub">Prêt à décoller</div>';
    },

    mount(g) {
      g.cv = document.getElementById('crCv');
      g.multEl = document.getElementById('crMult');
      g.subEl = document.getElementById('crSub');
      g.autoCash = 2;
      g.mult = 1;

      const inp = g.panelEl.querySelector('#crAuto');
      if (inp) inp.onchange = () => { g.autoCash = Math.max(1.01, parseFloat(inp.value) || 2); inp.value = g.autoCash.toFixed(2); };

      const resize = () => {
        const box = g.stageEl;
        g.w = box.clientWidth;
        g.h = Math.max(120, box.clientHeight - 34);
        g.ctx = J.util.fitCanvas(g.cv, g.w, g.h);
        draw(g, g.points && g.points.length > 1 ? g.points : [1, 1], g.mult, g.phase === 'crash');
      };
      g.points = [1, 1];
      g._onResize = resize;
      window.addEventListener('resize', resize);
      requestAnimationFrame(resize);
    },

    stop(g) {
      if (g._onResize) window.removeEventListener('resize', g._onResize);
      if (g._raf) cancelAnimationFrame(g._raf);
      g._raf = null;
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.phase === 'fly') {
        return [
          { label: 'Encaisser ' + U.fmtMult(g.mult || 1) + ' · +' + U.fmt(Math.max(0, Math.round((g.ticket ? g.ticket.bet : g.bet) * (g.mult || 1)) - (g.ticket ? g.ticket.bet : g.bet))),
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true },
          { label: '⏹', cls: 'ghost', onClick: (gg) => J.Games.stopAuto(gg, 'Arrêt demandé'), alsoWhenBusy: true }
        ];
      }
      return [{ label: g.auto.on ? 'Série en cours…' : 'Miser et décoller 🚀', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* --------------------------------------------------------- TOUR DE JEU */
    start(g) {
      // Tirage provably fair du point de crash — effectué AVANT l'animation
      const crash = crashPointFrom(J.Fair.float());
      g._crash = crash;
      g.phase = 'fly';
      g.mult = 1;
      g.points = [1, 1];
      g.t0 = performance.now();
      g.lastTick = 0;
      if (g.subEl) g.subEl.textContent = 'Décollage…';
      if (g.multEl) { g.multEl.className = 'crash-mult'; g.multEl.style.color = 'var(--txt)'; g.multEl.textContent = '1,00x'; }
      J.Games.renderActions(g);
      J.Games.updateHints(g);
      J.Sfx.bet();

      const target = Math.max(1.01, g.autoCash || 2);

      const frame = () => {
        if (!g || !g.ticket) { g._raf = null; return; }     // partie déjà terminée
        const el = performance.now() - g.t0;
        const m = Math.max(1, multAt(el - 250));            // 250 ms de mise à feu

        // Encaissement automatique en mode Auto-bet
        if (g.auto.on && m >= target) { cashout(g); return; }

        if (m >= g._crash) {                                 // 💥 explosion
          g.mult = g._crash;
          if (g.multEl) { g.multEl.textContent = U.fmtMult(g._crash); g.multEl.className = 'crash-mult crashed'; }
          if (g.subEl) g.subEl.textContent = '💥 Explosion à ' + U.fmtMult(g._crash);
          draw(g, g.points, g._crash, true);
          J.Sfx.bust(); J.haptic.lose(); J.shake(g.stageEl); J.redFlash();
          g.phase = 'crash';
          J.toast('💥 Crash à ' + U.fmtMult(g._crash) + ' — mise perdue', 'ko');
          J.Games.finish(g, 0, { detail: 'crash ' + U.fmtMult(g._crash) });
          g._raf = null;
          return;
        }

        g.mult = m;
        const last = g.points[g.points.length - 1];
        if (m > last) g.points.push(m);
        if (g.points.length > 3000) g.points.shift();

        if (g.multEl) g.multEl.textContent = U.fmtMult(m);
        if (m - g.lastTick > Math.max(0.1, m * 0.1) && m < 40) { g.lastTick = m; J.Sfx.tick(m); }
        draw(g, g.points, m, false);
        // Mise à jour du montant du bouton « Encaisser » (~5 fois/s suffit)
        if (Math.random() < 0.18) updateCashoutBtn(g);
        g._raf = requestAnimationFrame(frame);
      };
      g._raf = requestAnimationFrame(frame);
    },

    /* ------------------------------------------------------- ENCAISSEMENT */
    cashout(g) { return cashout(g); }
  });

  /** Encaisse au multiplicateur courant ; terminer proprement la partie. */
  function cashout(g) {
    if (!g || !g.ticket || g.phase !== 'fly') return;
    const m = Math.max(1.00, g.mult);
    g.phase = 'cashed';
    if (g._raf) { cancelAnimationFrame(g._raf); g._raf = null; }
    const payout = Math.round(g.ticket.bet * m);
    if (g.multEl) { g.multEl.textContent = U.fmtMult(m); g.multEl.className = 'crash-mult cashed'; }
    if (g.subEl) g.subEl.textContent = '✅ Encaissé à ' + U.fmtMult(m) + ' · +' + U.fmt(payout - g.ticket.bet) + ' jetons';
    J.FX.celebrate({ mult: m, payout: payout, el: g.multEl });
    if (m >= 5) J.Live.playerWin('crash', m, payout);
    J.Games.finish(g, m, { detail: 'cash out ' + U.fmtMult(m), celebrated: true });
  }

  /** Rafraîchit le libellé du bouton d'encaissement sans reconstruire le DOM. */
  function updateCashoutBtn(g) {
    const btn = g.panelEl.querySelector('[data-act="cashout"]');
    if (!btn || !g.ticket) return;
    const bet = g.ticket.bet;
    btn.innerHTML = 'Encaisser ' + U.fmtMult(g.mult) + ' · +' + U.fmt(Math.max(0, Math.round(bet * g.mult) - bet));
  }
})();
