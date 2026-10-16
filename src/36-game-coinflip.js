/* =========================================================================
   JEU 6 — COIN FLIP
   Pile ou face en série. Chaque victoire consécutive multiplie le gain :
     mult(n) = 0,99 × 2ⁿ   (n = victoires d'affilée)
   Comme P(n victoires d'affilée) = 1/2ⁿ, on a pour tout point d'arrêt :
     P × mult = 0,99  →  RTP 99 % que tu encaisses après 1, 3 ou 8 lancers.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const MAX_STREAK = 12;                       // 0,99 × 2¹² = 4 055x
  const multOf = (n) => 0.99 * Math.pow(2, n);

  J.Games.register({
    id: 'coinflip',
    name: 'Coin Flip',
    icon: 'coin',
    color: '#22d3ee',
    rtp: 99,
    category: 'originals',
    tagline: 'Pile ou face en série',
    volatility: 'Volatilité progressive',
    rules:
      'Choisis <b>Pile</b> ou <b>Face</b>, puis lance la pièce. À chaque victoire consécutive, le multiplicateur progresse : ' +
      '1 victoire = 1,98x · 2 = 3,96x · 3 = 7,92x · 5 = 31,68x · 8 = 253,44x.<br><br>' +
      'Tu peux <b>encaisser après chaque lancer réussi</b> : ton gain est mise × multiplicateur courant. Une seule perte ' +
      'remet la série à zéro et fait perdre la mise. Chaque face a exactement 50 % de chances (tirage vérifiable).',
    playLabel: 'Lancer la pièce 🪙',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.side = g.side || 'head';               // 'head' (pile) ou 'tail' (face)
      g.streak = 0;                            // victoires d'affilée
      g.phase = 'idle';                        // idle | flipped
      g.lastFlip = null;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="seg green" id="cfSide">' +
          '<button data-side="head"' + (g.side === 'head' ? ' class="is-on"' : '') + '>🪙 Pile (0,5)</button>' +
          '<button data-side="tail"' + (g.side === 'tail' ? ' class="is-on"' : '') + '>🪙 Face (0,5)</button>' +
        '</div>' +
        '<div class="row between mt-s"><span class="sub">Série en cours</span>' +
          '<span class="mono up" id="cfStreakLbl">0 victoire · ' + U.fmtMult(0.99) + ' avant gain</span></div>' +
        '<div class="sub mt-s">En mode Auto-bet, la série s\'arrête au multiplicateur indiqué par « STOP SI MULT ≥ ».</div>';
    },

    payoutHint(g) {
      const cur = g.streak > 0 ? multOf(g.streak) : 0;
      const next = multOf(g.streak + 1);
      return g.streak > 0
        ? 'Encaissement : <b class="up">' + U.fmtMult(cur) + '</b> · prochain lancer ' + U.fmtMult(next)
        : 'Première victoire : <b class="up">' + U.fmtMult(multOf(1)) + '</b>';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="coinflip-stage">' +
        '<div class="coin3d"><div class="inner" id="cfCoin">' +
          '<div class="face f-head">P</div><div class="face f-tail">F</div>' +
        '</div></div>' +
        '<div class="coinflip-streak" id="cfDots"></div>' +
        '<div class="coinflip-res" id="cfRes">Prêt</div>' +
        '<div class="sub center" id="cfMsg">Choisis ta face puis lance la pièce</div>' +
      '</div>';
    },

    mount(g) {
      g.coinEl = document.getElementById('cfCoin');
      g.resEl = document.getElementById('cfRes');
      g.msgEl = document.getElementById('cfMsg');
      g.dotsEl = document.getElementById('cfDots');
      g.angle = 0;

      g.panelEl.querySelectorAll('#cfSide [data-side]').forEach((b) => {
        b.onclick = () => {
          if (g.phase === 'flipped' && g.ticket) { J.toast('Termine la série en cours', 'ko'); return; }
          J.Sfx.click();
          g.side = b.dataset.side;
          g.panelEl.querySelectorAll('#cfSide [data-side]').forEach((x) => x.classList.toggle('is-on', x === b));
        };
      });
      renderDots(g);
      syncStreakLabel(g);
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.phase === 'flipped' && g.ticket) {
        const cur = multOf(g.streak);
        const bet = g.ticket.bet;
        return [
          { label: '💰 Encaisser ' + U.fmtMult(cur) + ' · +' + U.fmt(Math.round(bet * cur) - bet),
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true },
          { label: '↻ Relancer', cls: 'ghost', alsoWhenBusy: true,
            onClick: (gg) => { if (!gg.auto.on) flip(gg); } }
        ];
      }
      return [{ label: g.auto.on ? 'Série en cours…' : 'Lancer la pièce 🪙', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      g.streak = 0;
      renderDots(g);
      flip(g);
    },

    cashout(g) { return cashout(g); }
  });

  /* -------------------------------------------------------------- LANCER */
  /** Lance la pièce : le résultat est tiré via Fair Play avant l'animation. */
  function flip(g) {
    if (!g.ticket) return;
    const head = J.Fair.float() < 0.5;                     // 50/50 vérifiable
    const won = (g.side === 'head') === head;
    g.phase = 'flipped';
    g.lastFlip = head ? 'head' : 'tail';
    J.Sfx.bet();

    // Animation : la pièce tourne puis se pose sur la face tirée
    g.angle += 720 + (head ? 0 : 180);
    if (g.coinEl) g.coinEl.style.transform = 'rotateX(' + g.angle + 'deg)';
    g.resEl.textContent = '…';
    g.msgEl.textContent = 'La pièce tourne…';

    const animMs = g.auto.on ? Math.max(120, g.auto.speed * 0.75) : 1050;
    J.Games.schedule(g, () => resolve(g, won), animMs);
  }

  /** Résultat du lancer : victoire (série continue) ou perte (fin de manche). */
  function resolve(g, won) {
    if (!g || !g.ticket) return;
    const face = g.lastFlip === 'head' ? 'Pile' : 'Face';
    g.resEl.textContent = '🪙 ' + face;

    if (!won) {
      g.phase = 'idle';
      g.streak = 0;
      renderDots(g);
      syncStreakLabel(g);
      g.msgEl.innerHTML = '❌ <b class="down">' + face + '</b> — la série s\'arrête là';
      J.Sfx.lose(); J.haptic.lose(); J.shake(g.stageEl);
      J.Games.finish(g, 0, { detail: face + ' (perdu)' });
      return;
    }

    g.streak++;
    renderDots(g);
    syncStreakLabel(g);
    J.Sfx.reveal(true); J.haptic.tap();
    g.msgEl.innerHTML = '✅ <b class="up">' + face + '</b> — ' + g.streak + ' victoire(s) d\'affilée';

    // En mode Auto-bet : on encaisse au multiplicateur cible du panneau auto
    const target = g.auto.on ? (g.auto.stopMult || 0) : 0;
    const cur = multOf(g.streak);
    if (target > 0 && cur >= target) { cashout(g); return; }
    if (g.streak >= MAX_STREAK) { cashout(g); return; }
    J.Games.renderActions(g);
    J.Games.updateHints(g);

    // Sans auto-bet, le joueur décide : encaisser ou relancer (boutons mis à jour)
    if (g.auto.on) {
      J.Games.schedule(g, () => { if (g.ticket && g.auto.on) flip(g); }, g.auto.speed);
    }
  }

  /** Encaisse le multiplicateur courant. */
  function cashout(g) {
    if (!g || !g.ticket || g.streak <= 0) return;
    const mult = multOf(g.streak);
    const payout = Math.round(g.ticket.bet * mult);
    g.phase = 'idle';
    g.msgEl.innerHTML = '💰 <b class="up">Encaissé</b> à ' + U.fmtMult(mult) + ' après ' + g.streak + ' lancer(s)';
    J.Sfx.cashout(); J.haptic.win(mult);
    J.floatText('+' + U.fmt(payout), { el: g.resEl, color: 'var(--green)', size: 24 });
    if (mult >= 3.96) J.FX.confetti({ count: mult >= 30 ? 100 : 45, x: window.innerWidth / 2, y: g.stageEl.getBoundingClientRect().top + 80 });
    if (mult >= 7.92) J.Live.playerWin('coinflip', mult, payout);
    const streakEnd = g.streak;
    g.streak = 0;
    renderDots(g);
    syncStreakLabel(g);
    J.Games.finish(g, mult, { detail: streakEnd + ' victoires' });
  }

  /* ----------------------------------------------------------- AFFICHAGE */
  function renderDots(g) {
    if (!g.dotsEl) return;
    const shown = Math.max(6, g.streak);
    g.dotsEl.innerHTML = '';
    for (let i = 0; i < Math.min(shown, 12); i++) {
      const d = document.createElement('span');
      d.className = 'streak-dot' + (i < g.streak ? ' on' : '');
      g.dotsEl.appendChild(d);
    }
  }

  function syncStreakLabel(g) {
    const el = g.panelEl.querySelector('#cfStreakLbl');
    if (!el) return;
    const cur = g.streak > 0 ? U.fmtMult(multOf(g.streak)) : '—';
    el.textContent = g.streak + ' victoire' + (g.streak > 1 ? 's' : '') + ' · encaissement ' + cur;
    J.Games.updateHints(g);
  }
})();
