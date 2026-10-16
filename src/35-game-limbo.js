/* =========================================================================
   JEU 5 — LIMBO
   Tu choisis un multiplicateur cible, le jeu tire un résultat.
   Tirage : risultato = 0,99 / (1 − u)  →  P(résultat ≥ cible) = 0,99 / cible
   donc RTP = cible × P(gagner) = 99 %, quel que soit le multiplicateur visé.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const TARGETS = [1.2, 1.5, 2, 3, 5, 10, 25, 100, 1000];

  /** Résultat tiré à partir d'un aléa uniforme (arrondi 2 décimales, jamais < 1). */
  const rollFrom = (u) => Math.max(1.00, Math.floor(99 / (1 - u)) / 100);

  /** Probabilité de gagner pour une cible donnée. */
  const winChance = (target) => U.clamp(0.99 / target, 0, 1);

  J.Games.register({
    id: 'limbo',
    name: 'Limbo',
    icon: 'limbo',
    color: '#8b5cf6',
    rtp: 99,
    category: 'originals',
    tagline: 'Vise un multiplicateur',
    volatility: 'Volatilité au choix',
    rules:
      'Choisis un <b>multiplicateur cible</b> puis lance le tirage. Le résultat est un nombre tiré entre 1,00x et l\'infini, ' +
      'selon la formule <b>0,99 / (1 − u)</b> où u est un aléa uniforme vérifiable (Fair Play).<br><br>' +
      'Tu gagnes si le résultat est <b>supérieur ou égal</b> à ta cible, et tu es payé à hauteur de la cible. ' +
      'Viser 2x gagne dans 49,5 % des cas ; viser 100x gagne dans 0,99 % des cas. Le RTP reste de 99 % dans tous les cas : ' +
      'seuls la fréquence et le montant des gains changent.',
    playLabel: 'Lancer le tirage 🎯',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.target = g.target || 2;
      g.mult = 1;
      g.phase = 'idle';
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="row between"><span class="bet-label">Multiplicateur cible</span>' +
          '<span class="mono up" id="lbChance">' + U.fmtPct(winChance(g.target) * 100) + ' de chances</span></div>' +
        '<div class="field mt-s"><span class="suffix">CIBLE</span>' +
          '<input id="lbTarget" type="number" min="1.01" step="0.1" value="' + g.target.toFixed(2) + '">' +
          '<span class="suffix">x</span></div>' +
        '<div class="chips mt-s" id="lbChips">' +
          TARGETS.map((t) => '<button class="chip' + (t === g.target ? ' is-on' : '') + '" data-target="' + t + '">' + t + 'x</button>').join('') +
        '</div>';
    },

    payoutHint(g) {
      const c = winChance(g.target);
      return 'Gain : <b class="up">+' + U.fmt(Math.round(g.bet * g.target) - g.bet) + ' J</b> · ' +
        'probabilité ' + U.fmtPct(c * 100, 2);
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="limbo-stage">' +
        '<div class="limbo-num" id="lbNum">1,00x</div>' +
        '<div class="limbo-target">Cible : <b id="lbTargetLbl">2,00x</b></div>' +
        '<div class="sub center" id="lbMsg">Règle ton multiplicateur puis lance le tirage</div>' +
      '</div>';
    },

    mount(g) {
      g.numEl = document.getElementById('lbNum');
      g.msgEl = document.getElementById('lbMsg');

      const input = g.panelEl.querySelector('#lbTarget');
      input.onchange = () => { setTarget(g, parseFloat(input.value) || 2); };
      g.panelEl.querySelectorAll('#lbChips [data-target]').forEach((b) => {
        b.onclick = () => { J.Sfx.click(); setTarget(g, parseFloat(b.dataset.target)); };
      });
      syncLabels(g);
    },

    /* --------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.phase === 'roll') return [{ label: 'Tirage en cours…', cls: 'ghost wide-lg grow', act: 'none', disabled: true }];
      return [{ label: g.auto.on ? 'Série en cours…' : 'Lancer le tirage 🎯', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      const target = g.target;
      // Tirage provably fair AVANT l'animation
      const result = rollFrom(J.Fair.float());
      const win = result >= target;
      g.phase = 'roll';
      g.mult = result;
      J.Games.renderActions(g);
      J.Sfx.bet();

      const dur = g.auto.on ? Math.max(80, Math.min(380, g.auto.speed * 0.5)) : 560;
      const t0 = performance.now();
      g.numEl.className = 'limbo-num pop';
      g.msgEl.textContent = 'Tirage…';

      const frame = (t) => {
        if (!g.ticket) return;
        const p = Math.min(1, (t - t0) / dur);
        if (p < 1) {
          g.numEl.textContent = U.fmtMult(rollFrom(Math.random() * 0.999));
          requestAnimationFrame(frame);
        } else {
          finish(g, result, target, win);
        }
      };
      requestAnimationFrame(frame);
    }
  });

  /* ----------------------------------------------------------- AFFICHAGE */
  function syncLabels(g) {
    const el = g.panelEl.querySelector('#lbChance');
    if (el) el.textContent = U.fmtPct(winChance(g.target) * 100) + ' de chances';
    const lbl = document.getElementById('lbTargetLbl');
    if (lbl) lbl.textContent = U.fmtMult(g.target);
    g.panelEl.querySelectorAll('#lbChips [data-target]').forEach((b) => {
      b.classList.toggle('is-on', parseFloat(b.dataset.target) === g.target);
    });
    J.Games.updateHints(g);
  }

  /** Change la cible (autorisé uniquement hors tirage en cours). */
  function setTarget(g, t) {
    if (g.phase === 'roll' && g.ticket) { J.toast('Attends la fin du tirage', 'ko'); return; }
    g.target = U.clamp(Number(t) || 2, 1.01, 1000000);
    const input = g.panelEl.querySelector('#lbTarget');
    if (input) input.value = g.target.toFixed(2);
    syncLabels(g);
  }

  /** Résout la manche. */
  function finish(g, result, target, win) {
    g.phase = 'idle';
    g.numEl.className = 'limbo-num ' + (win ? 'win pop' : 'lose');
    setTimeout(() => g.numEl.classList.remove('pop'), 140);
    g.numEl.textContent = U.fmtMult(result);
    J.Games.renderActions(g);

    if (win) {
      const payout = Math.round(g.ticket.bet * target);
      g.msgEl.innerHTML = '🎉 <b class="up">Gagné</b> — ' + U.fmtMult(result) + ' ≥ cible ' + U.fmtMult(target);
      J.FX.celebrate({ mult: target, payout: payout, el: g.numEl });
      if (target >= 10) J.Live.playerWin('limbo', target, payout);
    } else {
      J.Sfx.lose(); J.haptic.lose();
      g.msgEl.innerHTML = '❌ <b class="down">Perdu</b> — ' + U.fmtMult(result) + ' < cible ' + U.fmtMult(target);
      J.shake(g.stageEl);
    }
    J.Games.finish(g, win ? target : 0, { detail: U.fmtMult(result) + ' vs cible ' + U.fmtMult(target), celebrated: true });
  }
})();
