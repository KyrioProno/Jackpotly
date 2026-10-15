/* =========================================================================
   JEU 9 — TOWER
   8 étages. À chaque étage, tu choisis une ouverture parmi T ; certaines
   cachent un piège. Un étage franchi augmente le multiplicateur :

     p = (T − pièges) / T      (probabilité de passer un étage)
     mult(f) = 0,99 / p^f      (f = étages franchis)

   Comme P(f étages franchis) = p^f, on a mult × P = 0,99 : RTP 99 % quel que
   soit l'étage où tu encaisses (même démonstration que Mines).
   5 difficultés, de « Facile » (4 ouvertures, 1 piège) à « Maître » (4
   ouvertures, 3 pièges → 3,96x dès le premier étage).
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const FLOORS = 8;
  const HOUSE = 0.99;

  /** Difficultés : ouvertures par étage et nombre de pièges. */
  const LEVELS = [
    { id: 'easy',   label: 'Facile',  tiles: 4, traps: 1, color: '#00e37a' },
    { id: 'medium', label: 'Moyen',   tiles: 3, traps: 1, color: '#22d3ee' },
    { id: 'hard',   label: 'Difficile', tiles: 2, traps: 1, color: '#ffc531' },
    { id: 'expert', label: 'Expert',  tiles: 3, traps: 2, color: '#ff8a5b' },
    { id: 'master', label: 'Maître',  tiles: 4, traps: 3, color: '#ff4d5e' }
  ];

  const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];

  /** Probabilité de franchir un étage. */
  const stepProb = (lvl) => (lvl.tiles - lvl.traps) / lvl.tiles;

  /** Multiplicateur après f étages franchis. */
  function multFor(f, lvl) {
    if (f <= 0) return 1;
    return HOUSE / Math.pow(stepProb(lvl), f);
  }

  J.Games.register({
    id: 'tower',
    name: 'Tower',
    icon: 'tower',
    color: '#ff4fa3',
    rtp: 99,
    category: 'originals',
    tagline: 'Monte les étages',
    volatility: 'Volatilité progressive',
    rules:
      'La tour compte <b>8 étages</b>. À chaque étage, choisis une ouverture : certaines cachent un piège. ' +
      'Un étage franchi augmente le multiplicateur, et tu peux <b>encaisser à tout moment</b>. ' +
      'Un piège met fin à la partie et fait perdre la mise.<br><br>' +
      '<b>Facile</b> : 4 ouvertures, 1 piège (1,32x par étage). <b>Maître</b> : 4 ouvertures, 3 pièges — ' +
      'le premier étage vaut déjà 3,96x, mais 3 ouvertures sur 4 sont piégées. Le RTP reste de 99 % ' +
      'quel que soit l\'étage où tu encaisses.',
    playLabel: 'Nouvelle ascension 🏗️',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.level = g.level || 'medium';
      g.floor = 0;                 // étages franchis
      g.active = false;
      g.traps = [];                // positions des pièges par étage
      g.autoFloors = g.autoFloors || 3;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      const lvl = levelById(g.level);
      return '<div class="row between"><span class="bet-label">Difficulté</span>' +
          '<span class="mono" id="twLvlLbl" style="color:' + lvl.color + '">' + lvl.label + '</span></div>' +
        '<div class="chips mt-s" id="twLevels">' +
          LEVELS.map((l) => '<button class="chip' + (l.id === g.level ? ' is-on' : '') + '" data-level="' + l.id + '">' + l.label + '</button>').join('') +
        '</div>' +
        '<div class="row between mt-s"><span class="sub">Prochain étage : <b class="up" id="twNext">' +
          U.fmtMult(multFor(g.floor + 1, lvl)) + '</b></span>' +
          '<span class="sub">Étages auto : <b id="twAutoLbl">' + g.autoFloors + '</b></span></div>' +
        '<input type="range" id="twAuto" min="1" max="8" step="1" value="' + g.autoFloors + '" class="thin">' +
        '<div class="sub">En mode Auto-bet, le jeu monte le nombre d\'étages indiqué puis encaisse.</div>';
    },

    payoutHint(g) {
      if (!g.active) return 'Départ : ' + U.fmtMult(multFor(1, levelById(g.level))) + ' au premier étage';
      return 'Actuel : <b class="up">' + U.fmtMult(multFor(g.floor, levelById(g.level))) + '</b> · ' +
        'prochain étage ' + U.fmtMult(multFor(g.floor + 1, levelById(g.level)));
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="tower-wrap">' +
        '<div class="tower-sided row between"><span class="sub">Étage <b class="mono" id="twFloorLbl">0</b> / ' + FLOORS + '</span>' +
        '<span class="sub">Multiplicateur <b class="mono gold" id="twMultLbl">1,00x</b></span></div>' +
        '<div class="tower-floors" id="twFloors"></div>' +
        '<div class="tower-side"><span class="sub" id="twMsg">Choisis une difficulté puis démarre l\'ascension</span></div>' +
      '</div>';
    },

    mount(g) {
      g.floorsEl = document.getElementById('twFloors');
      g.floorLbl = document.getElementById('twFloorLbl');
      g.multLbl = document.getElementById('twMultLbl');
      g.msgEl = document.getElementById('twMsg');

      bindControls(g);
      buildFloors(g);
      updateStats(g);
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.active) {
        const lvl = levelById(g.level);
        const cur = multFor(g.floor, lvl);
        const bet = g.ticket ? g.ticket.bet : g.bet;
        return [
          { label: g.floor === 0 ? 'Choisis une ouverture…' : '💰 Encaisser ' + U.fmtMult(cur) + ' · +' + U.fmt(Math.round(bet * cur) - bet),
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true, disabled: g.floor === 0 },
          { label: '⏹', cls: 'ghost', onClick: (gg) => J.Games.stopAuto(gg, 'Arrêt demandé'), alsoWhenBusy: true }
        ];
      }
      return [{ label: g.auto.on ? 'Ascension en cours…' : 'Nouvelle ascension 🏗️', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      const lvl = levelById(g.level);
      g.floor = 0;
      g.active = true;
      // Pièges de chaque étage : tirage fair sans remise dans les ouvertures
      g.traps = [];
      for (let f = 0; f < FLOORS; f++) {
        const pool = [];
        for (let i = 0; i < lvl.tiles; i++) pool.push(i);
        const traps = [];
        for (let i = 0; i < lvl.traps; i++) traps.push(pool.splice(J.Fair.int(0, pool.length - 1), 1)[0]);
        g.traps.push(traps);
      }
      buildFloors(g);
      updateStats(g);
      J.Games.renderActions(g);
      J.Games.updateHints(g);
      J.Sfx.bet();
      g.msgEl.textContent = 'Étage 1 — choisis une ouverture';

      if (g.auto.on) autoClimb(g);
    },

    cashout(g) { return cashout(g); }
  });

  /* --------------------------------------------------------- CONSTRUCTION */
  /** Dessine la tour : un bloc par étage, celui du bas est le premier. */
  function buildFloors(g) {
    const lvl = levelById(g.level);
    let html = '';
    for (let f = 0; f < FLOORS; f++) {
      let tiles = '';
      for (let t = 0; t < lvl.tiles; t++) tiles += '<button class="tower-tile" data-floor="' + f + '" data-tile="' + t + '"></button>';
      html += '<div class="tower-floor" data-f="' + f + '" style="grid-template-columns:repeat(' + lvl.tiles + ',1fr)">' + tiles + '</div>';
    }
    g.floorsEl.innerHTML = html;                 // colonne inversée via CSS (bas = étage 1)
    g.floorsEl.querySelectorAll('.tower-floor').forEach((el) => {
      const f = parseInt(el.dataset.f, 10);
      el.classList.toggle('current', g.active && f === g.floor);
      el.classList.toggle('locked', g.active && f > g.floor);
      el.classList.toggle('done', g.active && f < g.floor);
    });
    g.floorsEl.querySelectorAll('[data-tile]').forEach((t) => {
      t.onclick = () => {
        if (!g.active) { J.Sfx.click(); return; }
        pickFloor(g, parseInt(t.dataset.floor, 10), parseInt(t.dataset.tile, 10));
      };
    });
  }

  function bindControls(g) {
    g.panelEl.querySelectorAll('#twLevels [data-level]').forEach((b) => {
      b.onclick = () => setLevel(g, b.dataset.level);
    });
    const range = g.panelEl.querySelector('#twAuto');
    if (range) range.oninput = () => {
      g.autoFloors = U.clamp(parseInt(range.value, 10) || 1, 1, FLOORS);
      const lbl = g.panelEl.querySelector('#twAutoLbl');
      if (lbl) lbl.textContent = g.autoFloors;
    };
  }

  /** Change la difficulté (hors ascension uniquement). */
  function setLevel(g, id) {
    if (g.active) { J.toast('Termine l\'ascension en cours', 'ko'); return; }
    J.Sfx.click();
    g.level = id;
    const lvl = levelById(id);
    g.panelEl.querySelectorAll('#twLevels [data-level]').forEach((x) => x.classList.toggle('is-on', x.dataset.level === id));
    const lbl = g.panelEl.querySelector('#twLvlLbl');
    if (lbl) { lbl.textContent = lvl.label; lbl.style.color = lvl.color; }
    const next = g.panelEl.querySelector('#twNext');
    if (next) next.textContent = U.fmtMult(multFor(1, lvl));
    buildFloors(g);
    updateStats(g);
    J.Games.updateHints(g);
  }

  /* ------------------------------------------------------------- ASCENSION */
  /** Franchit (ou non) l'étage f en ouvrant la case t. */
  function pickFloor(g, f, t) {
    if (!g.active || f !== g.floor) return;                  // on ne joue que l'étage courant
    const lvl = levelById(g.level);
    const isTrap = g.traps[f].indexOf(t) > -1;
    const tile = g.floorsEl.querySelector('[data-floor="' + f + '"][data-tile="' + t + '"]');

    if (isTrap) {
      g.active = false;
      if (tile) { tile.textContent = '💀'; tile.classList.add('trap'); }
      revealFloor(g, f, true);
      J.Sfx.reveal(false); J.haptic.lose(); J.shake(g.floorsEl); J.redFlash();
      g.msgEl.innerHTML = '💀 Piège à l\'étage ' + (f + 1) + ' — mise perdue';
      J.toast('💀 Piège ! Mise perdue.', 'ko');
      J.Games.finish(g, 0, { detail: 'tombé à l\'étage ' + (f + 1) });
      return;
    }

    if (tile) { tile.textContent = '✅'; tile.classList.add('safe'); }
    g.floor++;
    J.Sfx.reveal(true); J.haptic.tap();
    buildFloors(g);
    updateStats(g);
    J.Games.renderActions(g);
    J.Games.updateHints(g);

    if (g.floor >= FLOORS) {                              // sommet atteint
      g.msgEl.innerHTML = '🏆 Sommet atteint ! Encaissement automatique';
      cashout(g);
      return;
    }
    g.msgEl.textContent = 'Étage ' + (g.floor + 1) + ' — continue ou encaisse';
    if (g.auto.on) autoClimb(g);
  }

  /** Mode auto : monte le nombre d'étages visé en choisissant au hasard, puis encaisse. */
  function autoClimb(g) {
    if (!g.auto.on || !g.active) return;
    if (g.floor >= g.autoFloors) { cashout(g); return; }
    const lvl = levelById(g.level);
    const pick = J.Fair.int(0, lvl.tiles - 1);
    J.Games.schedule(g, () => {
      if (g.active) pickFloor(g, g.floor, pick);
    }, Math.max(70, (g.auto.speed || 400) * 0.5));
  }

  /** Révèle tous les pièges d'un étage (transparence après la fin). */
  function revealFloor(g, f, markClicked) {
    const lvl = levelById(g.level);
    g.traps[f].forEach((t) => {
      const el = g.floorsEl.querySelector('[data-floor="' + f + '"][data-tile="' + t + '"]');
      if (el && !el.textContent) { el.textContent = '💀'; el.classList.add('trap'); }
    });
    for (let t = 0; t < lvl.tiles; t++) {
      if (g.traps[f].indexOf(t) === -1) {
        const el = g.floorsEl.querySelector('[data-floor="' + f + '"][data-tile="' + t + '"]');
        if (el && !el.textContent) el.textContent = '✅';
      }
    }
  }

  /* ---------------------------------------------------------- ENCAISSEMENT */
  function cashout(g) {
    if (!g || !g.ticket || g.floor <= 0) return;
    const mult = multFor(g.floor, levelById(g.level));
    const payout = Math.round(g.ticket.bet * mult);
    g.active = false;
    revealTail(g);
    J.Sfx.cashout(); J.haptic.win(mult);
    J.floatText('+' + U.fmt(payout), { el: g.multLbl, color: 'var(--green)', size: 22 });
    if (mult >= 4) J.FX.confetti({ count: mult >= 20 ? 110 : 50, x: window.innerWidth / 2, y: g.stageEl.getBoundingClientRect().top + 70 });
    if (mult >= 8) J.Live.playerWin('tower', mult, payout);
    g.msgEl.innerHTML = '💰 <b class="up">Encaissé</b> à l\'étage ' + g.floor + ' · ' + U.fmtMult(mult);
    J.Games.finish(g, mult, { detail: g.floor + ' étage(s) franchi(s)' });
  }

  /** Après encaissement : on montre les pièges des étages non joués. */
  function revealTail(g) {
    for (let f = g.floor; f < FLOORS; f++) {
      const el = g.floorsEl.querySelector('[data-floor="' + f + '"]');
      if (el) el.classList.add('done');
    }
  }

  function updateStats(g) {
    if (!g.floorLbl) return;
    const lvl = levelById(g.level);
    g.floorLbl.textContent = g.floor;
    g.multLbl.textContent = U.fmtMult(multFor(g.floor, lvl));
  }
})();
