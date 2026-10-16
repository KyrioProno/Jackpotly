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

  /* --------------------------------------------------------- COMPTEUR DE GAIN
     Un seul compteur par manche : la génération invalide l'animation précédente
     dès qu'un nouveau tirage commence, donc l'affichage ne peut jamais sauter
     d'un gain à l'autre. */
  let winGen = 0;
  function countUp(g, target) {
    const els = [g.winEl, g.winDuoEl].filter(Boolean);
    if (!els.length) return;
    const gen = ++winGen;
    const show = (v) => els.forEach((el) => { el.textContent = U.fmt(v); });
    if (!J.Store.state.settings.motion || target <= 0 || g.spinning) { show(target); return; }
    const from = g._winShown || 0;
    g._winShown = target;
    if (from === target) { show(target); return; }
    const t0 = performance.now(), dur = Math.min(900, 260 + target / Math.max(1, g.bet) * 45);
    const step = (now) => {
      if (gen !== winGen) return;
      const p = Math.min(1, (now - t0) / dur);
      show(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
      else show(target);
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    /* La machine se choisit dans la galerie du lobby (une façade = un univers) :
       on retrouve le thème par son identifiant. Le catalogue générique ouvre la
       dernière machine utilisée. */
    const chosen = (g.opts && g.opts.machine) || J.Store.state.settings.lastMachine || 'egypte';
    /* Deux identifiants distincts, et c'est voulu :
       · `machineId` = la façade choisie dans la galerie du lobby (art, nom, son) ;
       · `themeId`   = l'univers de calcul (bandes de rouleaux, table de gains). */
    const m = (J.Lobby && J.Lobby.machine) ? J.Lobby.machine(chosen) : null;
    g.machineId = (m && m.id) || chosen;
    const thId = (m && m.theme) || g.machineId;
    const byId = D.THEMES.findIndex((t) => t.id === thId);
    g.themeId = byId >= 0 ? thId : D.THEMES[0].id;
    g.themeIdx = byId >= 0 ? byId : 0;
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
  /* Un symbole = un SVG de l'univers de la machine (src/40b-slots-art.js) :
     plus aucun emoji sur le plateau, rendu identique sur tous les appareils.
     `data-k` est conservé (tests, tableau des gains). */
  let cellSeq = 0;                        // identifiants de dégradés tous distincts
  function cellHTML(k, g, extra) {
    const cls = k === 'S' ? ' scatter' : k === 'W' ? ' wild' : (k === 'A' || k === 'P' ? ' high' : '');
    const svg = J.SlotArt ? J.SlotArt.svg(g.themeId, k, 'r' + (cellSeq++)) : '';
    return '<div class="sl-cell sym' + cls + (extra || '') + '" data-k="' + k + '" title="' +
      U.esc(J.SlotArt ? J.SlotArt.label(g.themeId, k) : k) + '">' + (svg || '<span class="sl-e">' + k + '</span>') + '</div>';
  }

  function renderGrid(g, grid, spinFlags) {
    if (!g.reelEls) return;
    for (let i = 0; i < 5; i++) {
      const strip = g.reelEls[i];
      if (!strip) continue;
      const reel = strip.parentElement;
      reel.classList.toggle('is-spinning', !!(spinFlags && spinFlags[i]));
      strip.innerHTML = (grid ? grid[i] : ['F', 'F', 'F']).map((k) => cellHTML(k, g)).join('');
    }
  }

  function paint(g) {
    if (!g.reelEls) return;
    const t = theme(g);
    renderGrid(g, g.display || g.grid, g.spinFlags);

    // mise en avant des cases gagnantes
    if (!g.spinning && g.highlight.length) {
      g.highlight.forEach(([i, row]) => {
        const el = g.reelEls[i] && g.reelEls[i].children[row];
        if (el) el.classList.add('win');
      });
    }
    if (!g.spinning && g.scatterCells) {
      g.scatterCells.forEach(([i, row]) => {
        const el = g.reelEls[i] && g.reelEls[i].children[row];
        if (el) el.classList.add('scatter-win');
      });
    }

    // bandeau de tours gratuits
    if (g.freeEl) g.freeEl.classList.toggle('is-on', !!g.free);
    if (g.free && g.freeEl) {
      g.freeEl.innerHTML = '<b>TOURS GRATUITS</b> ' + (g.free.done + 1) + ' / ' + g.free.total +
        ' · multiplicateur <b class="gold">x' + g.free.mult + '</b>' +
        '<span class="sub"> · déjà gagné ' + U.fmt(g.free.won) + ' J</span>';
    }

    // tableau des gains du thème
    g.payEl.innerHTML = PAY_ORDER.map((k) =>
      '<div class="sl-pay-row"><span class="sl-pay-sym">' + J.SlotArt.svg(g.themeId, k, 'pk' + k) + '</span>' +
      '<span class="sl-pay-k">' + U.esc(J.SlotArt.label(g.themeId, k)) + '</span>' +
      '<span class="mono">' + t.pays[k][3] + ' · ' + t.pays[k][4] + ' · ' + t.pays[k][5] + '</span></div>').join('') +
      '<div class="sl-pay-row scatter"><span class="sl-pay-sym">' + J.SlotArt.svg(g.themeId, 'S', 'pS') + '</span>' +
      '<span class="sl-pay-k">' + U.esc(J.SlotArt.label(g.themeId, 'S')) + '</span>' +
      '<span class="mono">' + t.scatterPays[3] + ' · ' + t.scatterPays[4] + ' · ' + t.scatterPays[5] + ' × mise totale</span></div>' +
      '<div class="note">Gains par ligne, en multiples de la mise de ligne (' + U.fmt(Math.round(g.bet / g.lines)) + ' J). ' +
      '<b>3 scatters</b> = ' + t.freeSpins + ' tours gratuits. RTP exact 96,50 %.</div>';

    /* Lignes jouées : la pastille active suit l'état du moteur. */
    if (g.linesRow) g.linesRow.querySelectorAll('[data-lines]').forEach((b) => {
      b.classList.toggle('is-on', parseInt(b.dataset.lines, 10) === g.lines);
    });

    /* Afficheur de la machine : gain du tour, lignes jouées, mise. */
    /* Compteur de gain ANIMÉ : il grimpe de 0 au gain réel (jamais au-delà :
       c'est le résultat du moteur qui est affiché, l'animation ne fait que le
       dérouler). Sans animations, la valeur s'affiche d'un coup. */
    const target = g.lastWin || 0;
    const big = target >= g.bet * 5;
    [g.winEl, g.winDuoEl].forEach((el) => { if (el) el.classList.toggle('big', big); });
    countUp(g, target);
    if (g.linesRoEl) g.linesRoEl.textContent = g.lines;
    if (g.betRoEl) g.betRoEl.textContent = U.fmtK(g.bet) + ' J';
    if (g.betDuoEl) g.betDuoEl.textContent = U.fmtK(g.bet);
    /* Message de manche : il s'affiche au-dessus de la fenêtre des rouleaux
       (bandeau du gabarit), jamais à la place du tableau des gains. */
    if (g.msgEl) g.msgEl.innerHTML = g.msg ? '<b>' + g.msg + '</b>' : '';
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
    g._winShown = 0;
    countUp(g, 0);
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
      if (el) el.innerHTML = blurTriple(g).map((k) => cellHTML(k, g)).join('');
      g._blur[i] = setTimeout(step, 55);
    };
    step();
    J.Games.schedule(g, () => {
      g.spinFlags[i] = false;
      clearTimeout(g._blur[i]);
      g.display[i] = g.grid[i];
      J.Sfx.tick(i);
      J.haptic.tap();
      if (g.reelEls[i]) {
        g.reelEls[i].parentElement.classList.remove('is-spinning');
        g.reelEls[i].innerHTML = g.grid[i].map((k) => cellHTML(k, g)).join('');
      }
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
      // Les rouleaux ont déjà leur propre animation : la célébration part de la
      // grille et reste sobre sous 5×, spectaculaire au-delà.
      J.FX.celebrate({ mult: mult, payout: base, el: g.stageEl || g.viewEl });
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
    J.Games.finish(g, mult, { detail: g.detail, celebrated: true });
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'slots',
    name: 'Machines à sous',
    icon: 'slots',
    color: '#ffc531',
    rtp: 96.5,
    category: 'classics',
    tagline: '6 machines illustrées, 5 rouleaux, 20 lignes',
    /* Chaque façade a sa voix : rouleaux, mises et révélations timbrés par
       l'univers (le jingle de gain reste celui de la maison). */
    sfxId: (g) => 'slot-' + (g.machineId || 'egypte'),
    volatility: 'Volatilité élevée',
    hot: true,
    rules:
      'Six machines à sous illustrées de <b>5 rouleaux × 3 lignes</b> avec 5 à 20 lignes de paiement au choix. ' +
      'Chaque machine a son univers, ses symboles, sa musique et ses effets.<br><br>' +
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
      /* Une machine, c'est un MEUBLE : l'illustration de l'univers remplit la
         scène, la fenêtre des rouleaux se pose sur son ouverture centrale
         (cadrage en % du visuel, voir .cab .cab-window) et les commandes sont
         vissées sur son bandeau bas, comme sur un vrai cabinet. Les compteurs
         sont sur une réglette en haut, lisibles sans quitter les rouleaux. */
      const m = (J.Lobby && J.Lobby.machine) ? J.Lobby.machine(g.machineId) : null;
      const t = theme(g);
      const art = m ? J.Art.get(m.art) : null;
      return '' +
        '<div class="sl-stage" style="--sl-accent:' + (m ? m.accent : t.colors.accent) +
            ';--sl-accent2:' + (m ? m.accent2 : '#ff2e63') + '">' +
          '<div class="sl-topbar">' +
            '<button class="icon-btn" id="slBack" aria-label="Retour à la galerie">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' +
            '</button>' +
            '<div class="sl-title"><b>' + U.esc(m ? m.name : t.name) + '</b>' +
              '<i>' + U.esc(m ? m.tagline : t.tagline) + '</i></div>' +
            '<button class="icon-btn" id="slInfo" aria-label="Règles et table des gains">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="sl-hud">' +
            '<span><i>Gain</i> <b class="ro-win" id="slWin">0</b></span>' +
            '<span><i>Mise</i> <b class="ro-v" id="slBetRo">—</b></span>' +
            '<span><i>Lignes</i> <b class="ro-v" id="slLinesRo">20</b></span>' +
            '<span><i>RTP</i> <b class="ro-v">96,5 %</b></span>' +
          '</div>' +
          '<div class="cab-wrap">' +
            '<div class="cab' + (art ? '' : ' no-art') + '"' + (art ? ' style="background-image:url(\'' + art + '\')"' : '') + '>' +
              '<div class="marquee"><b>' + U.esc(m ? m.name : t.name) + '</b><i>' + U.esc(m ? m.univers : t.name) + '</i></div>' +
              '<div class="cab-window">' +
                '<div class="reels" id="slReels">' +
                  [0, 1, 2, 3, 4].map((i2) => '<div class="reel" data-reel="' + i2 + '">' +
                    '<div class="strip"></div><span class="reel-glass"></span></div>').join('') +
                '</div>' +
              '</div>' +
              '<div class="cab-readout">' +
                '<span><i class="ro-k">Gain</i> <b class="ro-win" id="slWinDuo">0</b></span>' +
                '<span><i class="ro-k">Mise</i> <b class="ro-v" id="slBetDuo">—</b></span>' +
              '</div>' +
            '</div>' +
            '<div class="sl-freebar" id="slFree"></div>' +
            '<div class="sl-msg" id="slMsg"></div>' +
          '</div>' +
          '<div class="spin-deck">' +
            '<div class="spin-row">' +
              '<button class="sb-btn" data-betfact="0.5" aria-label="Diviser la mise par deux">½</button>' +
              '<button class="sb-btn" data-betfact="2" aria-label="Doubler la mise">×2</button>' +
              '<button class="sb-btn" data-betfact="max" aria-label="Mise maximale">MAX</button>' +
            '</div>' +
            '<div class="act-slot" id="slSlot"></div>' +
          '</div>' +
        '</div>';
    },

    controls(g) {
      /* La machine se choisit dans la galerie illustrée du lobby ; ici, les
         options de la manche et la table des gains de l'univers en cours. */
      return '' +
        '<div class="row between"><span class="bet-label">Lignes jouées</span>' +
          '<span class="sub" id="slLinesInfo"></span></div>' +
        '<div class="chips mt-s" id="slLines">' +
          LINE_CHOICES.map((n) => '<button class="chip' + (n === 20 ? ' is-on' : '') + '" data-lines="' + n + '">' + n + ' lignes</button>').join('') +
        '</div>' +
        '<details class="sl-paybox mt"><summary>Table des gains — ' + U.esc(theme(g).name) + '</summary>' +
          '<div class="sl-pays" id="slPays"></div>' +
        '</details>' +
        '<button class="btn ghost block mt" data-lobby="1" id="slChange">' + J.icon.slots + ' Changer de machine</button>';
    },

    actions(g) {
      /* Le bouton principal est LE bouton SPIN du meuble (la mise est rappelée
         juste au-dessus, dans la réglette) : un seul bouton, un seul chemin de
         code — donc aucun risque de double paiement. */
      return [{
        label: g.spinning ? (g.free ? '★' : '…') : 'SPIN',
        cls: 'primary btn-spin', act: 'play', disabled: g.spinning || !!g.busy
      }];
    },

    payoutHint(g) {
      return g.lines + ' lignes · mise de ligne ' + U.fmt(Math.round(g.bet / g.lines)) + ' J · RTP 96,50 %';
    },

    mount(g) {
      g.reelEls = [0, 1, 2, 3, 4].map((i) => g.viewEl.querySelector('.reel[data-reel="' + i + '"] .strip'));
      g.freeEl = g.viewEl.querySelector('#slFree');
      g.msgEl = g.viewEl.querySelector('#slMsg');
      g.payEl = g.viewEl.querySelector('#slPays') || g.panelEl.querySelector('#slPays');
      g.winEl = g.viewEl.querySelector('#slWin');
      g.winDuoEl = g.viewEl.querySelector('#slWinDuo');
      g.betDuoEl = g.viewEl.querySelector('#slBetDuo');
      g.linesRoEl = g.viewEl.querySelector('#slLinesRo');
      g.betRoEl = g.viewEl.querySelector('#slBetRo');
      /* Le bouton principal du moteur vient prendre place sur le meuble. */
      const slot = g.viewEl.querySelector('#slSlot');
      const acts = g.actionsEl || g.panelEl.querySelector('#gActions');
      if (slot && acts) { g.actionsEl = acts; slot.appendChild(acts); }
      g.linesRow = g.panelEl.querySelector('#slLines');
      g.linesInfo = g.panelEl.querySelector('#slLinesInfo');
      g._blur = [null, null, null, null, null];
      g.spinFlags = [false, false, false, false, false];

      /* ½, ×2, MAX : réglage de la mise, puis re-rendu des afficheurs. */
      g.viewEl.querySelectorAll('[data-betfact]').forEach((b) => {
        b.onclick = () => {
          if (g.spinning) return;
          const f = b.dataset.betfact;
          J.Sfx.chip(); J.haptic.tap();
          if (f === 'max') J.Games.setBet(g, J.Games.betMax(), true);
          else if (f === '0.5') J.Games.setBet(g, Math.max(J.Games.betMin(), Math.floor(g.bet / 2)), true);
          else J.Games.setBet(g, Math.min(J.Games.betMax(), g.bet * 2), true);
          paint(g);
        };
      });
      /* Retour à la galerie des machines (lobby), sans perdre la machine. */
      const outLobby = () => { J.Sfx.click(); J.Games.close(); J.UI.go('home'); if (J.Lobby) J.Lobby.go('machines'); };
      g.viewEl.querySelectorAll('[data-lobby]').forEach((b) => { b.onclick = outLobby; });
      g.panelEl.querySelectorAll('[data-lobby]').forEach((b) => { b.onclick = outLobby; });
      const back = g.viewEl.querySelector('#slBack');
      if (back) back.onclick = outLobby;
      const info = g.viewEl.querySelector('#slInfo');
      if (info) info.onclick = () => { J.Sfx.click(); J.UI.gameInfo(g.def); };

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
