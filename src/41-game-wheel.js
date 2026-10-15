/* =========================================================================
   JEU 10 — WHEEL
   Roue colorée à segments. Tu choisis un <b>multiplicateur cible</b> ; le jeu
   tire un segment. Si son multiplicateur atteint la cible, tu es payé à
   hauteur de la cible, sinon tu perds.

   Construction mathématique (RTP 97 %, méthode des multiplicateurs de
   segments) : pour une cible T et un nombre de segments S,
     P(gagner) = 0,97 / T
     segments gagnants  = round(P(gagner) × S)
     multiplicateurs triés : bas → bas … puis deux grands paliers
     (T et T × 12), ajustés pour que la somme des probabilités soit exacte.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const SEGMENTS = 60;                          // segments de la roue (dans la fourchette 10-60 annoncée)
  const HOUSE = 0.97;                           // RTP 97 %
  const TARGETS = [1.2, 1.5, 2, 3, 5, 10, 25, 50];

  /**
   * Construit la table de la roue pour une cible T.
   *
   * Principe : la roue paie la <b>valeur du segment</b> touché. Le RTP est donc
   * la moyenne des valeurs des segments, et il doit valoir 0,97 pour toutes
   * les cibles. On choisit :
   *   · W segments « gagnants » (W = ⌊0,97 × S / T⌋) qui paient T ;
   *   · les S − W autres segments paient une petite consolation L, calculée
   *     pour que la moyenne vaille exactement 0,97 :
   *         L = (0,97 × S − W × T) / (S − W)
   * Vérification : [W×T + (S−W)×L] / S = 0,97 ✓
   * On a toujours 0 ≤ L < 1 (donc un segment non gagnant reste une perte).
   */
  function buildTable(target) {
    const S = SEGMENTS;
    let W = Math.floor((HOUSE * S) / target);
    W = U.clamp(W, 1, S - 1);
    let L = (HOUSE * S - W * target) / (S - W);
    if (L >= 1) {                                  // sécurité (cibles très basses)
      while (L >= 1 && W > 1) { W--; L = (HOUSE * S - W * target) / (S - W); }
    }
    L = U.clamp(L, 0, 0.99);

    // Répartition : les segments gagnants sont répartis uniformément autour de la roue
    const gap = S / W;
    const table = [];
    let next = 0;
    for (let i = 0; i < S; i++) {
      const isWin = i >= next - 1e-9;
      if (isWin) next += gap;
      table.push(isWin ? { m: target, win: true } : { m: Math.round(L * 1000) / 1000, win: false });
    }
    // Moyenne réelle (après arrondi de L) et RTP correspondant
    const mean = table.reduce((a, x) => a + x.m, 0) / S;
    return {
      table, wins: W, prob: W / S, rtp: mean * 100, mean,
      lossMult: Math.round(L * 1000) / 1000, top: target
    };
  }

  /** Couleur d'un segment : gagnant selon la cible, sinon bleu nuit. */
  function segColor(seg, target, index) {
    if (!seg.win) return '#1a253d';
    // Variation de teinte entre or et vert pour rythmer la roue
    return index % 3 === 0 ? '#00b862' : index % 3 === 1 ? '#ffc531' : '#00e37a';
  }

  J.Games.register({
    id: 'wheel',
    name: 'Wheel',
    icon: 'wheel',
    color: '#ffc531',
    rtp: 97,
    category: 'originals',
    tagline: 'La roue des multiplicateurs',
    volatility: 'Volatilité au choix',
    rules:
      'La roue compte <b>60 segments</b>. Tu choisis un <b>multiplicateur cible</b> : la roue paie la valeur du ' +
      'segment touché. Les segments gagnants paient ta cible, les autres paient une petite consolation.<br><br>' +
      'La répartition est calculée pour que la moyenne des valeurs vaille <b>0,97</b>, donc le <b>RTP est de 97 %</b> ' +
      'quelle que soit la cible — seuls la fréquence et le montant des gains changent. Viser 1,2x gagne sur ~48 des ' +
      '60 segments ; viser 50x n\'a qu\'un segment gagnant sur 60 (1,67 % de chances).',
    playLabel: 'Lancer la roue 🎡',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.target = g.target || 2;
      g.table = buildTable(g.target);
      g.angle = -Math.PI / 2;
      g.spinning = false;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      const t = g.table;
      const gain = Math.round(g.bet * t.top) - g.bet;
      const consol = Math.round(g.bet * t.lossMult);
      return '<div class="row between"><span class="bet-label">Multiplicateur cible</span>' +
          '<span class="mono up" id="wgProbLbl">' + U.fmtPct(t.prob * 100, 1) + ' · ' + t.wins + ' / ' + SEGMENTS + ' segments</span></div>' +
        '<div class="chips mt-s" id="wgTargets">' +
          TARGETS.map((x) => '<button class="chip' + (x === g.target ? ' is-on' : '') + '" data-t="' + x + '">' + U.fmtMult(x) + '</button>').join('') +
        '</div>' +
        '<div class="row between mt-s"><span class="sub">Gain si un segment gagnant est touché</span>' +
          '<span class="mono gold">+' + U.fmt(gain) + ' J (' + U.fmtMult(t.top) + ')</span></div>' +
        '<div class="row between mt-s"><span class="sub">Sinon (segment non gagnant)</span>' +
          '<span class="mono" style="color:var(--txt-2)">' + U.fmt(consol) + ' J (' + U.fmtMult(t.lossMult) + ')</span></div>' +
        '<div class="sub mt-s">' + t.wins + ' segments paient <b class="gold">' + U.fmtMult(t.top) + '</b> · ' +
          (SEGMENTS - t.wins) + ' paient <b>' + U.fmtMult(t.lossMult) + '</b> · RTP réel ' + t.rtp.toFixed(2) + ' %';
    },

    payoutHint(g) {
      const t = g.table;
      return 'Cible ' + U.fmtMult(g.target) + ' · <b class="up">' + U.fmtPct(t.prob * 100, 1) + '</b> de chances · ' +
        'RTP ' + t.rtp.toFixed(1).replace('.', ',') + ' %';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="wheel-game-wrap">' +
        '<canvas id="wgCv"></canvas>' +
        '<div class="wheel-target" id="wgLegend"></div>' +
        '<div class="sub center" id="wgMsg">Choisis une cible puis lance la roue</div>' +
      '</div>';
    },

    mount(g) {
      g.cv = document.getElementById('wgCv');
      g.msgEl = document.getElementById('wgMsg');
      const size = Math.min(g.stageEl.clientWidth - 24, Math.max(200, g.stageEl.clientHeight - 90), 300);
      g.size = Math.max(180, size);
      requestAnimationFrame(() => { draw(g, g.angle); renderLegend(g); });

      g.panelEl.querySelectorAll('#wgTargets [data-t]').forEach((b) => {
        b.onclick = () => {
          if (g.spinning) { J.toast('La roue tourne déjà', 'ko'); return; }
          J.Sfx.click();
          g.target = parseFloat(b.dataset.t);
          g.table = buildTable(g.target);
          J.Games.renderPanel(g);
          bindTargets(g);
          draw(g, g.angle);
        };
      });
    },

    stop(g) { g.spinning = false; },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      return [{ label: g.spinning ? 'La roue tourne…' : (g.auto.on ? 'Série en cours…' : 'Lancer la roue 🎡'),
        cls: 'primary wide-lg grow', act: 'play', disabled: g.spinning || g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      const seg = J.Fair.int(0, SEGMENTS - 1);                  // segment tiré (fair)
      const won = g.table.table[seg].win;
      g.spinning = true;
      J.Games.renderActions(g);
      J.Sfx.bet();
      g.msgEl.textContent = 'La roue tourne…';

      // Animation : la roue tourne puis s'arrête sur le segment tiré
      const step = (Math.PI * 2) / SEGMENTS;
      const from = g.angle;
      const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const targetAngle = norm(-Math.PI / 2 - (seg * step + step / 2));
      const delta = norm(targetAngle - from) + Math.PI * 2 * (g.auto.on ? 3 : 5);
      const dur = g.auto.on ? Math.max(220, g.auto.speed * 0.9) : 3600;
      const t0 = performance.now();
      let lastTick = 0;

      const frame = (t) => {
        if (!g.ticket) { g.spinning = false; return; }
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3.2);
        g.angle = from + delta * e;
        draw(g, g.angle);
        const speed = delta * 3.2 * Math.pow(Math.max(0.001, 1 - p), 2.2) / (dur / 1000);
        if (t - lastTick > 55 && speed > 1.5) { lastTick = t; J.Sfx.wheelTick(U.clamp(speed / 40, 0, 1)); }
        if (p < 1) requestAnimationFrame(frame);
        else finish(g, seg, won);
      };
      requestAnimationFrame(frame);
    }
  });

  /** Légende : ce que paient les segments de la roue pour la cible courante. */
  function renderLegend(g) {
    const el = document.getElementById('wgLegend');
    if (!el) return;
    const t = g.table;
    el.innerHTML =
      '<button class="is-on" style="border-color:rgba(0,227,122,.5);color:var(--green)">' +
        '<span style="font-size:13px;font-weight:800">' + t.wins + ' segments</span><small>paient ' + U.fmtMult(t.top) + '</small></button>' +
      '<button disabled><span style="font-size:13px;font-weight:800">' + (SEGMENTS - t.wins) + ' segments</span>' +
        '<small>paient ' + U.fmtMult(t.lossMult) + '</small></button>' +
      '<button disabled><span style="font-size:13px;font-weight:800">RTP ' + t.rtp.toFixed(1).replace('.', ',') + ' %</span>' +
        '<small>moyenne des 60 segments</small></button>';
  }

  /* ---------------------------------------------------------------- RENDU */
  function draw(g, angle) {
    const cv = g.cv;
    if (!cv) return;
    const S = g.size;
    const ctx = J.util.fitCanvas(cv, S, S);
    const cx = S / 2, cy = S / 2, R = S / 2 - 4;
    const table = g.table.table;
    ctx.clearRect(0, 0, S, S);
    const step = (Math.PI * 2) / SEGMENTS;

    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = angle + i * step, a1 = a0 + step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = segColor(table[i], g.target, i);
      ctx.fill();
      if (table[i].win) {                        // séparateur net sur les segments gagnants
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Jante + moyeu
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,197,49,.7)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1220'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e9eefb';
    ctx.font = '800 ' + Math.round(S * 0.062) + 'px ' + '-apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(U.fmtMult(g.target), cx, cy - S * 0.02);
    ctx.font = '700 ' + Math.round(S * 0.042) + 'px ' + '-apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#8fa2bd';
    ctx.fillText(g.table.wins + '/' + SEGMENTS, cx, cy + S * 0.05);
    // Aiguille fixe en haut
    ctx.beginPath();
    ctx.moveTo(cx, cy - R + 2);
    ctx.lineTo(cx - S * 0.035, cy - R - S * 0.055);
    ctx.lineTo(cx + S * 0.035, cy - R - S * 0.055);
    ctx.closePath();
    ctx.fillStyle = '#ffc531';
    ctx.fill();
    // Repère de la dernière position
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath(); ctx.arc(0, -R + 8, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
    ctx.restore();
  }

  function bindTargets(g) {
    g.panelEl.querySelectorAll('#wgTargets [data-t]').forEach((b) => {
      b.onclick = () => {
        if (g.spinning) { J.toast('La roue tourne déjà', 'ko'); return; }
        J.Sfx.click();
        g.target = parseFloat(b.dataset.t);
        g.table = buildTable(g.target);
        J.Games.renderPanel(g);
        bindTargets(g);
        draw(g, g.angle);
        renderLegend(g);
      };
    });
  }

  /* ------------------------------------------------------------ RÉSOLUTION */
  function finish(g, seg, won) {
    g.spinning = false;
    const segMult = g.table.table[seg].m;
    const bet = g.ticket.bet;
    const payout = Math.round(bet * segMult);
    if (won) {
      J.Sfx.win(g.target); J.haptic.win(g.target);
      g.msgEl.innerHTML = '🎉 Segment gagnant <b class="gold">' + U.fmtMult(segMult) + '</b> — +' + U.fmt(payout) + ' jetons';
      J.floatText('+' + U.fmt(payout), { el: g.cv, color: 'var(--green)', size: 22 });
      J.FX.confetti({ count: g.target >= 10 ? 120 : 40, x: window.innerWidth / 2, y: g.stageEl.getBoundingClientRect().top + 90 });
      if (g.target >= 10) J.Live.playerWin('wheel', g.target, payout);
    } else {
      g.msgEl.innerHTML = 'Segment à <b>' + U.fmtMult(segMult) + '</b> — cible ' + U.fmtMult(g.target) +
        (payout > 0 ? ' · consolation +' + U.fmt(payout) : '');
      J.Sfx.lose(); J.haptic.lose();
    }
    J.Games.finish(g, segMult, { detail: 'segment ' + U.fmtMult(segMult) + ' · cible ' + U.fmtMult(g.target) });
  }

  /* Exposé pour les tests (vérification du RTP par cible) */
  J.__wheelTable = buildTable;
})();
