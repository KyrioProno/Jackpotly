/* =========================================================================
   JEU 2 — DICE
   Curseur over / under : le joueur choisit sa probabilité de gain
   (0,01 % → 98 %) et le multiplicateur suit :  mult = 99 / chance (%).
   RTP constant de 99 % : c'est le jeu « à volatilité réglable » par excellence.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const HOUSE = 0.99;                         // RTP 99 %
  const multOf = (chancePct) => HOUSE * 100 / Math.max(0.01, chancePct);

  /** Bornes du seuil selon le mode (garantit un multiplicateur ≥ 1,01x). */
  function clampTarget(mode, t) {
    t = U.clamp(Number(t) || 50, 0.01, 99.99);
    return mode === 'under' ? U.clamp(t, 0.01, 98) : U.clamp(t, 1.99, 99.98);
  }

  /** Probabilité de gain (%) pour un seuil et un mode donnés. */
  const chanceOf = (mode, t) => (mode === 'under' ? t : 99.99 - t);

  J.Games.register({
    id: 'dice',
    name: 'Dice',
    icon: 'dice',
    color: '#3b82f6',
    rtp: 99,
    category: 'originals',
    tagline: 'Règle ta probabilité',
    volatility: 'Volatilité au choix',
    hot: true,
    rules:
      'Choisis <b>Over</b> (le tirage doit être au-dessus du seuil) ou <b>Under</b> (en dessous), puis règle le curseur. ' +
      'Le tirage va de <b>0,00 à 99,99</b> et est comparé à ton seuil.<br><br>' +
      'Le multiplicateur découle de la probabilité : <b>mult = 99 ÷ chance(%)</b>. ' +
      '50 % de chances → 1,98x · 10 % → 9,90x · 1 % → 99,00x. Le RTP reste de 99 % quel que soit ton réglage.',
    playLabel: 'Lancer le dé 🎲',

    /** État initial (avant rendu du panneau). */
    state(g) {
      g.mode = g.mode || 'under';
      g.target = clampTarget(g.mode, g.target == null ? 50 : g.target);
      g._raf = null;              // animation en cours (annulable à la sortie de jeu)
      g._seq = 0;                 // numéro de la manche : une seule résolution chacune
    },

    /* La sortie de jeu annule l'animation : le tirage ne doit pas se régler
       après coup sur une manche déjà remboursée. */
    stop(g) { if (g._raf) { cancelAnimationFrame(g._raf); g._raf = null; } },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="seg green" id="dcMode">' +
          '<button data-mode="under"' + (g.mode === 'under' ? ' class="is-on"' : '') + '>Under ↓</button>' +
          '<button data-mode="over"' + (g.mode === 'over' ? ' class="is-on"' : '') + '>Over ↑</button>' +
        '</div>' +
        '<div class="mt"><input type="range" id="dcRange" min="0.01" max="99.99" step="0.01" value="' + g.target.toFixed(2) + '" class="thin"></div>' +
        '<div class="row between">' +
          '<span class="sub">Chance de gagner : <b class="up" id="dcChance">' + U.fmtPct(chanceOf(g.mode, g.target), 2) + '</b></span>' +
          '<span class="sub">Multiplicateur : <b class="gold" id="dcMult">' + U.fmtMult(multOf(chanceOf(g.mode, g.target))) + '</b></span>' +
        '</div>';
    },

    payoutHint(g) {
      const ch = chanceOf(g.mode, g.target);
      const m = multOf(ch);
      return 'Gain si victoire : <b class="up">+' + U.fmt(Math.round(g.bet * m) - g.bet) + ' J</b> (' + U.fmtMult(m) + ')';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="dice-stage">' +
        '<div class="dice-num" id="dcNum">50,00</div>' +
        '<div style="width:100%;padding:0 6px">' +
          '<div class="dice-track">' +
            '<div class="dice-bar">' +
              '<div class="dice-zone" id="dcZone"></div>' +
              '<div class="dice-cursor" id="dcCursor" style="left:50%"></div>' +
            '</div>' +
            '<div class="dice-mark" id="dcMark"></div>' +
          '</div>' +
          '<div class="row between" style="font-size:9.5px;color:var(--muted)"><span>0,00</span><span>50,00</span><span>99,99</span></div>' +
        '</div>' +
        '<div class="sub center" id="dcMsg">Règle ton seuil puis lance le dé</div>' +
      '</div>';
    },

    mount(g) {
      g.numEl = document.getElementById('dcNum');
      g.zoneEl = document.getElementById('dcZone');
      g.markEl = document.getElementById('dcMark');
      g.cursorEl = document.getElementById('dcCursor');
      g.msgEl = document.getElementById('dcMsg');

      const seg = g.panelEl.querySelector('#dcMode');
      const range = g.panelEl.querySelector('#dcRange');

      seg.querySelectorAll('[data-mode]').forEach((b) => {
        b.onclick = () => {
          J.Sfx.click();
          g.mode = b.dataset.mode;
          g.target = clampTarget(g.mode, g.target);
          seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
          range.value = g.target;
          sync(g);
        };
      });
      range.oninput = () => { g.target = clampTarget(g.mode, parseFloat(range.value)); sync(g); };
      range.onchange = () => { g.target = clampTarget(g.mode, parseFloat(range.value)); range.value = g.target; sync(g); };

      sync(g);
    },

    /* --------------------------------------------------------- LOGIQUE */
    start(g) {
      const chance = chanceOf(g.mode, g.target);
      const mult = multOf(chance);
      const u = J.Fair.float();                                  // tirage fair
      const roll = Math.floor(u * 10000) / 100;                  // 0,00 → 99,99
      const win = g.mode === 'under' ? roll < g.target : roll > g.target;

      // Animation : le nombre défile puis se fixe sur le résultat
      const dur = g.auto.on ? Math.max(90, Math.min(420, g.auto.speed * 0.55)) : 520;
      const t0 = performance.now();
      g.numEl.className = 'dice-num';
      J.Sfx.bet();
      g.msgEl.textContent = 'Tirage en cours…';

      const seq = ++g._seq;
      const frame = (t) => {
        /* Manche clôturée ailleurs (sortie de jeu, remboursement, rechargement)
           ou remplacée par une plus récente : l'animation s'arrête au lieu de
           régler une manche qui n'existe plus (l'ancien code lisait alors
           g.ticket.bet sur un ticket nul → exception dans une image rAF). */
        if (g._seq !== seq || !g.ticket) { g._raf = null; return; }
        const p = Math.min(1, (t - t0) / dur);
        if (p < 1) {
          g.numEl.textContent = U.rnd(0, 99.99).toFixed(2).replace('.', ',');
          moveCursor(g, parseFloat(g.numEl.textContent.replace(',', '.')));
          g._raf = requestAnimationFrame(frame);
        } else {
          g._raf = null;
          settle(g, roll, mult, win);
        }
      };
      g._raf = requestAnimationFrame(frame);
    },

    /* ---------------------------------------------------- RÉSOLUTION */
    finish(g) { /* géré par settle() */ }
  });

  /** Résout la partie : affichage, sons, encaissement. */
  function settle(g, roll, mult, win) {
    if (!g.ticket) return;                     // manche déjà réglée : on ne règle jamais deux fois
    const stake = g.ticket.bet;
    g.numEl.textContent = roll.toFixed(2).replace('.', ',');
    g.numEl.className = 'dice-num ' + (win ? 'win' : 'lose');
    moveCursor(g, roll);
    onMark(g, roll);
    if (win) {
      g.msgEl.innerHTML = '🎉 <b class="up">Gagné</b> — ' + roll.toFixed(2).replace('.', ',') + ' ' +
        (g.mode === 'under' ? '<' : '>') + ' ' + g.target.toFixed(2).replace('.', ',');
      J.FX.celebrate({ mult: mult, payout: Math.round(stake * mult), el: g.numEl });
      if (mult >= 10) J.Live.playerWin('dice', mult, Math.round(stake * mult));
    } else {
      J.Sfx.lose(); J.haptic.lose();
      g.msgEl.innerHTML = '❌ <b class="down">Perdu</b> — ' + roll.toFixed(2).replace('.', ',') + ' ' +
        (g.mode === 'under' ? '≥' : '≤') + ' ' + g.target.toFixed(2).replace('.', ',');
      J.shake(g.stageEl);
    }
    J.Games.finish(g, win ? mult : 0, { detail: roll.toFixed(2) + (win ? ' gagné' : ' perdu'), celebrated: true });
  }

  /** Synchronise l'interface avec le seuil/mode courants. */
  function sync(g) {
    const chance = chanceOf(g.mode, g.target);
    const mult = multOf(chance);
    // Zone gagnante + repère du seuil
    if (g.mode === 'under') {
      g.zoneEl.style.left = '0%';
      g.zoneEl.style.width = g.target + '%';
      g.markEl.style.left = g.target + '%';
    } else {
      g.zoneEl.style.left = g.target + '%';
      g.zoneEl.style.width = (100 - g.target) + '%';
      g.markEl.style.left = g.target + '%';
    }
    g.markEl.style.background = '#fff';
    const el = g.panelEl.querySelector('#dcChance');
    const el2 = g.panelEl.querySelector('#dcMult');
    if (el) el.textContent = U.fmtPct(chance, 2);
    if (el2) el2.textContent = U.fmtMult(mult);
    const range = g.panelEl.querySelector('#dcRange');
    if (range && parseFloat(range.value) !== g.target) range.value = g.target;
    J.Games.updateHints(g);
  }

  function moveCursor(g, value) {
    g.cursorEl.style.left = U.clamp(value, 0, 100) + '%';
  }

  /** Fait clignoter le repère si le tirage est proche du seuil (suspense). */
  function onMark(g, roll) {
    const near = Math.abs(roll - g.target) < 2;
    g.markEl.style.background = near ? 'var(--gold)' : '#fff';
  }

  /* Mémorise mode et seuil pour la prochaine visite */
  const origMount = J.Games.byId;
  J.Bus.on('game:open', () => { /* hook disponible pour de futures stats */ });
})();
