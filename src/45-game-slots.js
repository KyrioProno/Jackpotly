/* =========================================================================
   JEU 14 — MACHINES À SOUS
   Trois machines de 5 rouleaux × 3 lignes, jusqu'à 20 lignes de paiement.
   Les bandes de rouleaux et les tables de gains viennent de
   `src/40-slots-tables.js`, où le RTP est calculé de façon EXACTE
   (voir `node tools/design-slots.mjs`) : 96,50 % pour les trois thèmes.

   · Lignes : gain dès 3 symboles identiques alignés depuis le rouleau 1,
     le joker 💎 remplaçant n'importe quel symbole (sauf le scatter).
   · Scatter : 3 scatters et plus n'importe où sur l'écran paient 1× / 5× / 25×
     la mise totale ET déclenchent 10 tours gratuits.
   · Tours gratuits : multiplicateurs progressifs 1·1·1·2·2·2·3·3·3·4
     (ils ne se redéclenchent pas : c'est ce qui rend l'espérance calculable
     exactement). Gain maximal plafonné à 5 000× la mise.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const D = J.SLOTS_DATA;
  const PAY_ORDER = ['W', 'A', 'P', 'C', 'K', 'J', 'T', 'F'];

  const LINE_CHOICES = [5, 10, 15, 20];
  const MAX_WIN_MULT = 5000;              // plafond de gain (multiples de la mise)

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    g.themeIdx = g.themeIdx || 0;
    g.lines = 20;
    g.grid = null;                        // [rouleau][ligne] → clé de symbole
    g.display = null;                     // ce qui est à l'écran
    g.spinning = false;
    g.free = null;                        // { total, done, mult, won }
    g.msg = '';
    g.detail = '';
    g.lastWin = 0;
    g.highlight = [];                     // cases gagnantes [[rouleau, ligne]]
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  const theme = (g) => D.THEMES[g.themeIdx];

  /* -------------------------------------------------------------- TIRAGE */
  /** Un arrêt aléatoire par rouleau ; les 3 symboles visibles sont consécutifs. */
  function makeGrid(g) {
    const t = theme(g);
    return t.reels.map((strip) => {
      const stop = J.Fair.int(0, strip.length - 1);
      return [0, 1, 2].map((k) => strip[(stop + k) % strip.length]);
    });
  }

  /** Symbole tiré au hasard hors provably fair : uniquement pour l'animation. */
  function blurTriple(g) {
    const t = theme(g);
    return [0, 1, 2].map(() => {
      const strip = t.reels[J.Fair.int(0, 4)];
      return strip[J.Fair.int(0, strip.length - 1)];
    });
  }

  /**
   * Évalue une grille : gains de ligne (en multiples de la MISE DE LIGNE),
   * scatters (en multiples de la MISE TOTALE) et nombre de tours gratuits.
   */
  function evaluate(g, grid) {
    const t = theme(g);
    const nbLines = g.lines;
    const wins = [];
    let lineWin = 0, bestWin = 0;

    for (let L = 0; L < nbLines; L++) {
      const rows = D.LINES[L];
      const syms = grid.map((col, i) => col[rows[i]]);
      let best = null;
      for (let s = 0; s < PAY_ORDER.length; s++) {
        const key = PAY_ORDER[s];
        let n = 0;
        for (let i = 0; i < 5; i++) {
          const v = syms[i];
          if (v === key || (v === 'W' && key !== 'W')) n++; else break;
        }
        if (n >= 3) {
          const amount = t.pays[key][n];
          if (!best || amount > best.amount) best = { key, count: n, amount };
        }
      }
      if (best) {
        const cells = [];
        for (let i = 0; i < best.count; i++) cells.push([i, rows[i]]);
        lineWin += best.amount;
        bestWin = Math.max(bestWin, best.amount);
        wins.push({ line: L + 1, key: best.key, count: best.count, amount: best.amount, cells });
      }
    }

    // scatters : comptés sur les 15 cases visibles
    let scatters = 0;
    const scCells = [];
    grid.forEach((col, i) => col.forEach((v, row) => {
      if (v === 'S') { scatters++; scCells.push([i, row]); }
    }));
    const scatterWin = scatters >= 3 ? t.scatterPays[Math.min(5, scatters)] : 0;
    return { wins, lineWin, bestWin, scatters, scatterWin, scCells, freeSpins: scatters >= 3 ? t.freeSpins : 0 };
  }

  /* ------------------------------------------------------------------ RENDU */
  function cellHTML(k, g, extra) {
    const s = theme(g).sym[k];
    const cls = k === 'S' ? ' scatter' : k === 'W' ? ' wild' : (k === 'A' || k === 'P' ? ' high' : '');
    return '<div class="sl-cell' + cls + (extra || '') + '" data-k="' + k + '">' +
      '<span class="sl-e">' + (s ? s.e : '?') + '</span></div>';
  }

  function renderGrid(g, grid, spinFlags) {
    if (!g.reelEls) return;
    for (let i = 0; i < 5; i++) {
      const el = g.reelEls[i];
      el.classList.toggle('is-spinning', !!(spinFlags && spinFlags[i]));
      el.innerHTML = (grid ? grid[i] : ['F', 'F', 'F']).map((k) => cellHTML(k, g)).join('');
    }
  }

  function paint(g) {
    if (!g.reelEls) return;
    const t = theme(g);
    renderGrid(g, g.display || g.grid, g.spinFlags);

    // mise en avant des cases gagnantes
    if (!g.spinning && g.highlight.length) {
      g.highlight.forEach(([i, row]) => {
        const el = g.reelEls[i].children[row];
        if (el) el.classList.add('win');
      });
    }
    if (!g.spinning && g.scatterCells) {
      g.scatterCells.forEach(([i, row]) => {
        const el = g.reelEls[i].children[row];
        if (el) el.classList.add('scatter-win');
      });
    }

    // bandeau de tours gratuits
    g.freeEl.classList.toggle('is-on', !!g.free);
    if (g.free) {
      g.freeEl.innerHTML = '<b>TOURS GRATUITS</b> ' + (g.free.done + 1) + ' / ' + g.free.total +
        ' · multiplicateur <b class="gold">x' + g.free.mult + '</b>' +
        '<span class="sub"> · déjà gagné ' + U.fmt(g.free.won) + ' J</span>';
    }

    // tableau des gains du thème
    g.payEl.innerHTML = PAY_ORDER.map((k) =>
      '<div class="sl-pay-row"><span class="sl-pay-sym">' + t.sym[k].e + '</span>' +
      '<span class="mono">' + t.pays[k][3] + ' · ' + t.pays[k][4] + ' · ' + t.pays[k][5] + '</span></div>').join('') +
      '<div class="sl-pay-row scatter"><span class="sl-pay-sym">' + t.sym.S.e + '</span>' +
      '<span class="mono">' + t.scatterPays[3] + ' · ' + t.scatterPays[4] + ' · ' + t.scatterPays[5] + ' × mise totale</span></div>' +
      '<div class="note">Gains par ligne, en multiples de la mise de ligne (' + U.fmt(Math.round(g.bet / g.lines)) + ' J). ' +
      '<b>3 scatters</b> = ' + t.freeSpins + ' tours gratuits. RTP exact 96,50 %.</div>';

    g.linesRow.querySelectorAll('[data-lines]').forEach((b) => {
      b.classList.toggle('is-on', parseInt(b.dataset.lines, 10) === g.lines);
    });
    g.themeRow.querySelectorAll('[data-theme]').forEach((b) => {
      b.classList.toggle('is-on', parseInt(b.dataset.theme, 10) === g.themeIdx);
    });

    g.bannerEl.innerHTML = g.msg ? '<b>' + g.msg + '</b>' : '<span class="sub">Choisis ta machine et lance les rouleaux</span>';
    J.Games.renderActions(g);
  }

  /* --------------------------------------------------------------- MANCHE */
  function start(g) {
    const stake = g.ticket.bet;
    g.free = null;
    g.highlight = [];
    g.scatterCells = null;
    g.lastWin = 0;
    g.msg = 'Rouleaux…';
    g.grid = makeGrid(g);
    g.display = g.grid.map(() => ['F', 'F', 'F']);
    g.spinFlags = [true, true, true, true, true];
    g.spinning = true;
    g.round = evaluate(g, g.grid);
    paint(g);
    J.Sfx.bet();

    // arrêt progressif des rouleaux
    for (let i = 0; i < 5; i++) blurReel(g, i, 520 + i * 170);
  }

  function blurReel(g, i, delay) {
    const step = () => {
      if (!g.spinFlags[i]) return;
      const el = g.reelEls[i];
      el.innerHTML = blurTriple(g).map((k) => cellHTML(k, g)).join('');
      g._blur[i] = setTimeout(step, 55);
    };
    step();
    J.Games.schedule(g, () => {
      g.spinFlags[i] = false;
      clearTimeout(g._blur[i]);
      g.display[i] = g.grid[i];
      J.Sfx.tick(i);
      J.haptic.tap();
      g.reelEls[i].classList.remove('is-spinning');
      g.reelEls[i].innerHTML = g.grid[i].map((k) => cellHTML(k, g)).join('');
      if (i === 4) afterReels(g, g.ticket.bet);   // la mise vient du ticket, pas de la portée de start()
    }, delay);
  }

  function afterReels(g, stake) {
    const r = g.round;
    const lineBet = stake / g.lines;
    const lineTokens = r.lineWin * lineBet;
    const scatterTokens = r.scatterWin * stake;
    const base = Math.round(lineTokens + scatterTokens);

    g.highlight = r.wins.reduce((a, w) => a.concat(w.cells), []);
    g.scatterCells = r.scatters >= 3 ? r.scCells : null;

    if (base > 0) {
      const mult = base / stake;
      g.msg = 'Gagné ' + U.fmt(base) + ' J' + (r.wins.length ? ' · ' + r.wins.length + ' ligne(s)' : '') +
        (r.scatters >= 3 ? ' · ' + r.scatters + ' scatters' : '');
      g.lastWin = base;
      J.Sfx.win(mult);
      if (mult >= 20) J.Sfx.bigwin();
      if (mult >= 20) J.FX.confetti ? J.FX.confetti() : null;
    } else {
      g.msg = 'Aucun gain sur ce tour';
      J.Sfx.lose();
    }
    paint(g);

    if (r.freeSpins) {
      g.free = { total: r.freeSpins, done: 0, mult: theme(g).multSchedule[0], won: 0, base, stake };
      g.msg = r.freeSpins + ' TOURS GRATUITS !';
      J.toast('🎉 ' + r.freeSpins + ' tours gratuits déclenchés !', 'ok');
      paint(g);
      J.Games.schedule(g, () => freeSpin(g), 1600);
      return;
    }
    finishRound(g, base);
  }

  /* --------------------------------------------------------- TOURS GRATUITS */
  function freeSpin(g) {
    const t = theme(g);
    const f = g.free;
    if (!f || f.done >= f.total) { finishRound(g, f ? f.base + f.won : g.lastWin); return; }
    f.mult = t.multSchedule[Math.min(f.done, t.multSchedule.length - 1)];
    g.highlight = [];
    g.scatterCells = null;
    g.grid = makeGrid(g);
    g.display = g.grid.map(() => ['F', 'F', 'F']);
    g.spinFlags = [true, true, true, true, true];
    g.spinning = true;
    g.msg = 'Tour gratuit ' + (f.done + 1) + ' / ' + f.total + ' · x' + f.mult;
    paint(g);

    for (let i = 0; i < 5; i++) blurReel(g, i, 420 + i * 140);
    J.Games.schedule(g, () => {
      const r = evaluate(g, g.grid);
      const lineBet = f.stake / g.lines;
      const win = Math.round(r.lineWin * lineBet * f.mult + r.scatterWin * f.stake);
      f.won += win;
      f.done++;
      g.highlight = r.wins.reduce((a, w) => a.concat(w.cells), []);
      g.scatterCells = r.scatters >= 3 ? r.scCells : null;
      g.spinning = false;
      g.msg = win > 0
        ? 'Tour gratuit ' + f.done + ' : +' + U.fmt(win) + ' J (x' + f.mult + ')'
        : 'Tour gratuit ' + f.done + ' : rien';
      if (win > 0) { J.Sfx.win(win / f.stake); if (win / f.stake >= 10) J.Sfx.bigwin(); }
      paint(g);
      J.Games.schedule(g, () => freeSpin(g), win > 0 ? 1100 : 700);
    }, 1200);
  }

  /* ------------------------------------------------------------- RÈGLEMENT */
  function finishRound(g, total) {
    const stake = g.ticket.bet;
    const capped = Math.min(total, Math.round(stake * MAX_WIN_MULT));
    const mult = stake > 0 ? capped / stake : 0;
    g.spinning = false;
    g.spinFlags = [false, false, false, false, false];
    g.free = null;
    g.detail = (g.round && g.round.wins.length ? g.round.wins.length + ' ligne(s)' : 'aucune ligne') +
      (g.round && g.round.scatters ? ' · ' + g.round.scatters + ' scatter(s)' : '') +
      (capped < total ? ' · plafond ' + MAX_WIN_MULT + 'x appliqué' : '');
    g.paintInfo = g.msg;
    paint(g);
    J.Games.finish(g, mult, { detail: g.detail });
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'slots',
    name: 'Machines à sous',
    icon: 'slots',
    color: '#ffc531',
    rtp: 96.5,
    category: 'classics',
    tagline: '3 thèmes, 5 rouleaux, 20 lignes',
    volatility: 'Volatilité élevée',
    hot: true,
    rules:
      'Trois machines à sous de <b>5 rouleaux × 3 lignes</b> avec 5 à 20 lignes de paiement au choix. ' +
      'Une ligne paie dès <b>3 symboles identiques</b> alignés à partir du rouleau de gauche ; ' +
      'le <b>joker</b> 💎 remplace n\'importe quel symbole.<br><br>' +
      '<b>Scatters</b> : 3 scatters ou plus n\'importe où rapportent 1× / 5× / 25× la mise totale et ' +
      'déclenchent <b>10 tours gratuits</b> avec multiplicateurs progressifs ' +
      '<b>1·1·1·2·2·2·3·3·3·4</b>.<br>' +
      'Le gain est plafonné à <b>5 000×</b> la mise.<br><br>' +
      'Les bandes de rouleaux et les tables de gains sont calibrées pour un <b>RTP exact de 96,50 %</b> ' +
      'sur les trois thèmes (calcul analytique, pas une estimation) — ' +
      'les 20 lignes sont affichées dans le tableau des gains du panneau.',
    playLabel: 'Tourner 🎰',

    state, start,
    stop(g) {
      g.spinning = false;
      g.spinFlags = [false, false, false, false, false];
      (g._blur || []).forEach(clearTimeout);
    },

    stage(g) {
      const t = D.THEMES[0];
      return '' +
        '<div class="sl-stage" style="--sl-from:' + t.colors.from + ';--sl-to:' + t.colors.to + '">' +
          '<div class="sl-freebar" id="slFree"></div>' +
          '<div class="sl-machine">' +
            '<div class="sl-banner" id="slBanner"></div>' +
            '<div class="sl-reels" id="slReels">' +
              [0, 1, 2, 3, 4].map((i) => '<div class="sl-reel" data-reel="' + i + '"></div>').join('') +
            '</div>' +
            '<div class="sl-pays" id="slPays"></div>' +
          '</div>' +
        '</div>';
    },

    controls(g) {
      return '' +
        '<div class="row between"><span class="bet-label">Machine</span>' +
          '<span class="sub" id="slLinesInfo"></span></div>' +
        '<div class="chips mt-s" id="slThemes">' +
          D.THEMES.map((t, i) => '<button class="chip' + (i === 0 ? ' is-on' : '') + '" data-theme="' + i + '">' +
            t.sym.A.e + ' ' + t.name + '</button>').join('') +
        '</div>' +
        '<div class="row between mt"><span class="bet-label">Lignes jouées</span></div>' +
        '<div class="chips mt-s" id="slLines">' +
          LINE_CHOICES.map((n) => '<button class="chip' + (n === 20 ? ' is-on' : '') + '" data-lines="' + n + '">' + n + ' lignes</button>').join('') +
        '</div>';
    },

    actions(g) {
      return [{
        label: g.spinning ? (g.free ? 'Tours gratuits…' : 'Rouleaux…') : 'Tourner · ' + U.fmtK(g.bet) + ' J 🎰',
        cls: 'primary wide-lg grow', act: 'play', disabled: g.spinning
      }];
    },

    payoutHint(g) {
      return g.lines + ' lignes · mise de ligne ' + U.fmt(Math.round(g.bet / g.lines)) + ' J · RTP 96,50 %';
    },

    mount(g) {
      g.reelEls = [0, 1, 2, 3, 4].map((i) => g.viewEl.querySelector('.sl-reel[data-reel="' + i + '"]'));
      g.freeEl = g.viewEl.querySelector('#slFree');
      g.bannerEl = g.viewEl.querySelector('#slBanner');
      g.payEl = g.viewEl.querySelector('#slPays');
      g.themeRow = g.panelEl.querySelector('#slThemes');
      g.linesRow = g.panelEl.querySelector('#slLines');
      g.linesInfo = g.panelEl.querySelector('#slLinesInfo');
      g._blur = [null, null, null, null, null];
      g.spinFlags = [false, false, false, false, false];

      g.themeRow.querySelectorAll('[data-theme]').forEach((b) => {
        b.onclick = () => {
          if (g.spinning) return;
          g.themeIdx = parseInt(b.dataset.theme, 10);
          const t = D.THEMES[g.themeIdx];
          g.viewEl.querySelector('.sl-stage').style.setProperty('--sl-from', t.colors.from);
          g.viewEl.querySelector('.sl-stage').style.setProperty('--sl-to', t.colors.to);
          g.highlight = [];
          g.grid = makeGrid(g);
          g.display = g.grid;
          J.Sfx.click();
          J.toast(t.name + ' — ' + t.tagline, '');
          paint(g);
        };
      });
      g.linesRow.querySelectorAll('[data-lines]').forEach((b) => {
        b.onclick = () => {
          if (g.spinning) return;
          g.lines = parseInt(b.dataset.lines, 10);
          J.Sfx.click(); J.haptic.tap();
          g.highlight = [];
          paint(g);
        };
      });

      g.linesInfo.textContent = 'RTP exact 96,50 %';
      g.grid = makeGrid(g);
      g.display = g.grid;
      paint(g);
    }
  });
})();
