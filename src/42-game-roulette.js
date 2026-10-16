/* =========================================================================
   JEU 11 — ROULETTE EUROPÉENNE
   Un seul zéro (37 cases). Toutes les mises classiques sont disponibles :
   Plein, Cheval, Carré, Sixain, Colonne, Douzaine, Rouge/Noir, Pair/Impair,
   Manque/Passe — plus les quatre mises annoncées françaises (Voisins du zéro,
   Orphelins, Tiers du cylindre, Jeu zéro).

   Mathématiques : chaque mise couvre `n` numéros et rapporte `36 / n` fois la
   mise (capital compris). L'espérance est donc identique partout :
        (36 / n) × n/37 = 36/37 = 97,297 %
   Le zéro appartient à la maison : il ne paie aucune chance simple, comme au
   casino. Une combinaison de plusieurs mises garde exactement ce même RTP.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /* Ordre physique des cases sur le cylindre européen (sens horaire depuis 0). */
  const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];
  const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const isRed = (n) => RED.indexOf(n) >= 0;

  /* -------------------------------------------------------- TYPES DE MISE */
  /** mult = montant total récupéré (mise comprise) pour 1 jeton placé. */
  const BETS = {
    plein:    { label: 'Plein',    mult: 36, need: 'num', hint: '1 numéro' },
    cheval:   { label: 'Cheval',   mult: 18, need: 'dir', hint: '2 numéros' },
    carre:    { label: 'Carré',    mult: 9,  need: 'dir', hint: '4 numéros' },
    sixain:   { label: 'Sixain',   mult: 6,  need: 'num', hint: '6 numéros' },
    colonne:  { label: 'Colonne',  mult: 3,  need: 'arg', hint: '12 numéros' },
    douzaine: { label: 'Douzaine', mult: 3,  need: 'arg', hint: '12 numéros' },
    rouge:    { label: 'Rouge',    mult: 2,  hint: '18 numéros' },
    noir:     { label: 'Noir',     mult: 2,  hint: '18 numéros' },
    pair:     { label: 'Pair',     mult: 2,  hint: '18 numéros' },
    impair:   { label: 'Impair',   mult: 2,  hint: '18 numéros' },
    manque:   { label: 'Manque',   mult: 2,  hint: '1 à 18' },
    passe:    { label: 'Passe',    mult: 2,  hint: '19 à 36' },
    trio:     { label: 'Trio',     mult: 12, hint: '0 + 2 numéros' },
    premiers: { label: 'Premiers 4', mult: 9, hint: '0-1-2-3' }
  };

  const COLUMN = [                       // « colonne » : les 12 numéros d'une finale
    { i: 0, nums: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34] },
    { i: 1, nums: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35] },
    { i: 2, nums: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36] }
  ];
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

  /* Une mise : { type, nums, mult, w (jetons posés), label } */
  function makeSpot(type, nums, w, label) {
    const def = BETS[type];
    return { type, nums, mult: def.mult, w: w || 1, label: label || keyOf(type, nums) };
  }
  function keyOf(type, nums) { return type + ':' + nums.join('-'); }
  function numLabel(nums) { return nums.join(' + '); }

  /* ------------------------------------------------- Mises annoncées (cylindre) */
  const PRESETS = [
    {
      id: 'voisins', name: 'Voisins du zéro', chips: 9,
      desc: '17 numéros autour du zéro : 0·2·3 · 4/7 · 12/15 · 18/21 · 19/22 · 25·26·28·29 · 32/35',
      spots: () => [
        makeSpot('trio', [0, 2, 3], 2, '0+2+3 ×2'),
        makeSpot('carre', [25, 26, 28, 29], 2, '25+26+28+29 ×2'),
        makeSpot('cheval', [4, 7], 1), makeSpot('cheval', [12, 15], 1),
        makeSpot('cheval', [18, 21], 1), makeSpot('cheval', [19, 22], 1),
        makeSpot('cheval', [32, 35], 1)
      ]
    },
    {
      id: 'orphelins', name: 'Orphelins', chips: 5,
      desc: '8 numéros isolés : 1 · 6/9 · 14/17 · 20 · 31/34',
      spots: () => [
        makeSpot('plein', [1], 1), makeSpot('cheval', [6, 9], 1),
        makeSpot('cheval', [14, 17], 1), makeSpot('plein', [20], 1),
        makeSpot('cheval', [31, 34], 1)
      ]
    },
    {
      id: 'tiers', name: 'Tiers du cylindre', chips: 6,
      desc: '12 numéros opposés au zéro, en 6 chevaux : 5/8 · 10/11 · 13/16 · 23/24 · 27/30 · 33/36',
      spots: () => [
        makeSpot('cheval', [5, 8], 1), makeSpot('cheval', [10, 11], 1),
        makeSpot('cheval', [13, 16], 1), makeSpot('cheval', [23, 24], 1),
        makeSpot('cheval', [27, 30], 1), makeSpot('cheval', [33, 36], 1)
      ]
    },
    {
      id: 'jeuzero', name: 'Jeu zéro', chips: 4,
      desc: '7 numéros proches du zéro : 26 · 0/3 · 12/15 · 32/35',
      spots: () => [
        makeSpot('plein', [26], 1), makeSpot('cheval', [0, 3], 1),
        makeSpot('cheval', [12, 15], 1), makeSpot('cheval', [32, 35], 1)
      ]
    }
  ];

  /* --------------------------------------------------------- Géométrie grille */
  /* Grille 6 × 6 en ordre de lecture : la ligne r contient 6r+1 … 6r+6, ce qui
     correspond exactement aux sixains du tapis réel. */
  const cell = (n) => ({ r: Math.floor((n - 1) / 6), c: (n - 1) % 6 });

  /** Voisins directs d'un numéro (cheval) et blocs 2×2 (carré) dans la grille. */
  function neighbours(n) {
    const { r, c } = cell(n);
    const out = [];
    if (c < 5) out.push({ k: 'droite', tag: '→', nums: [n, n + 1] });
    if (c > 0) out.push({ k: 'gauche', tag: '←', nums: [n - 1, n] });
    if (r < 5) out.push({ k: 'bas', tag: '↓', nums: [n, n + 6] });
    if (r > 0) out.push({ k: 'haut', tag: '↑', nums: [n - 6, n] });
    return out;
  }
  function squares(n) {
    const { r, c } = cell(n);
    const out = [];
    if (r < 5 && c < 5) out.push({ k: 'bas-droite', tag: '↘', nums: [n, n + 1, n + 6, n + 7] });
    if (r < 5 && c > 0) out.push({ k: 'bas-gauche', tag: '↙', nums: [n - 1, n, n + 5, n + 6] });
    if (r > 0 && c < 5) out.push({ k: 'haut-droite', tag: '↗', nums: [n - 6, n - 5, n, n + 1] });
    if (r > 0 && c > 0) out.push({ k: 'haut-gauche', tag: '↖', nums: [n - 7, n - 6, n - 1, n] });
    return out;
  }
  /** Sixain contenant n (la ligne de la grille = 6 numéros consécutifs). */
  function sixainOf(n) { const { r } = cell(n); return range(r * 6 + 1, r * 6 + 6); }

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    g.spots = {};              // clé → mise posée
    g.chip = 100;              // valeur d'un jeton
    g.sel = 'plein';           // type de mise « intérieure » sélectionné
    g.anchor = null;           // numéro d'ancrage (cheval / carré)
    g.last = null;             // dernier numéro sorti
    g.angle = -Math.PI / 2;    // rotation de la roue
    g.spinning = false;
    g.result = null;           // { num, mult, gain, detail }
    g.recent = [];             // derniers numéros
    g.lastSpots = null;        // mémorisé pour « Relancer »
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  /* ------------------------------------------------------- CALCUL DE LA MISE */
  function totals(g) {
    let w = 0, spots = 0, best = 0;
    for (const k in g.spots) {
      const s = g.spots[k];
      w += s.w; spots++;
      best = Math.max(best, s.mult);
    }
    return { w, spots, stake: w * g.chip, best };
  }

  /** Met à jour la mise de la manche (ce que le moteur débitera). */
  function syncStake(g) {
    const t = totals(g);
    if (t.stake > 0) J.Games.setBet(g, t.stake, true);
    J.Games.updateHints(g);
  }

  /** Place (ou retire) un jeton sur une mise. */
  function place(g, type, nums, w, silent) {
    if (g.busy) return false;                       // mises figées pendant la rotation
    const key = keyOf(type, nums);
    const t = totals(g);
    const cost = (w || 1) * g.chip;
    if (t.stake + cost > J.CONST.MAX_BET) { J.toast('Plafond de table atteint (' + U.fmtK(J.CONST.MAX_BET) + ' J)', 'ko'); return false; }
    if (t.stake + cost > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return false; }
    const cur = g.spots[key];
    if (cur) cur.w += (w || 1);
    else g.spots[key] = makeSpot(type, nums, w || 1);
    if (!silent) { J.Sfx.coin(); J.haptic.tap(); }
    paint(g);
    return true;
  }

  /** Retire une mise entière (ou un jeton si elle en porte plusieurs). */
  function unplace(g, key) {
    if (g.busy) return;
    const s = g.spots[key];
    if (!s) return;
    if (s.w > 1) s.w--; else delete g.spots[key];
    J.Sfx.click(); J.haptic.tap();
    paint(g);
  }

  function placePreset(g, preset) {
    if (g.busy) return;
    const spots = preset.spots();
    const t = totals(g);
    const cost = spots.reduce((a, s) => a + s.w, 0) * g.chip;
    if (t.stake + cost > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
    if (t.stake + cost > J.Wallet.balance) { J.toast('Solde insuffisant pour cette annonce', 'ko'); return; }
    spots.forEach((s) => {
      const key = keyOf(s.type, s.nums);
      const cur = g.spots[key];
      if (cur) cur.w += s.w; else g.spots[key] = makeSpot(s.type, s.nums, s.w, s.label);
    });
    J.Sfx.chip();
    J.toast(preset.name + ' : ' + preset.chips + ' jetons posés', 'ok');
    paint(g);
  }

  function clearSpots(g, silent) {
    if (g.busy || !Object.keys(g.spots).length) return;
    g.lastSpots = JSON.parse(JSON.stringify(g.spots));
    g.spots = {};
    if (!silent) { J.Sfx.click(); J.toast('Mises retirées', ''); }
    paint(g);
  }

  function rebet(g) {
    if (g.busy) return;
    if (!g.lastSpots) { J.toast('Aucune mise à relancer', 'ko'); return; }
    const cost = Object.keys(g.lastSpots).reduce((a, k) => a + g.lastSpots[k].w, 0) * g.chip;
    if (cost > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return; }
    if (cost > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
    g.spots = JSON.parse(JSON.stringify(g.lastSpots));
    J.Sfx.chip && J.Sfx.chip();
    J.toast('Mises relancées', 'ok');
    paint(g);
  }

  /* ------------------------------------------------------------ RÉSOLUTION */
  /**
   * Règlement pur (aucune dépendance à l'état) : part de chaque mise posée ×
   * son rapport. Le RTP d'une mise seule vaut donc exactement 36/37.
   */
  function payoutMult(spots, w, num) {
    let mult = 0;
    const won = [];
    for (const k in spots) {
      const s = spots[k];
      if (s.nums.indexOf(num) >= 0) {
        mult += (s.w / w) * s.mult;
        won.push({ label: s.label, mult: s.mult, share: s.w / w });
      }
    }
    return { mult, won };
  }

  function evaluate(g, num) {
    const t = totals(g);
    return payoutMult(g.spots, t.w, num);
  }

  /* -------------------------------------------------------------- ANIMATION */
  function drawWheel(g, angle, ballA, ballR) {
    const cv = g.cv;
    if (!cv) return;
    const S = g.size;
    const ctx = J.util.fitCanvas(cv, S, S);
    const cx = S / 2, cy = S / 2, R = S / 2 - 3;
    const step = (Math.PI * 2) / 37;
    ctx.clearRect(0, 0, S, S);

    // jante extérieure dorée
    const rim = ctx.createLinearGradient(0, 0, 0, S);
    rim.addColorStop(0, '#f3d38b'); rim.addColorStop(.5, '#a9782a'); rim.addColorStop(1, '#f3d38b');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, Math.PI * 2); ctx.fillStyle = '#0d1526'; ctx.fill();

    // cases
    const rP = R - 6;
    for (let i = 0; i < 37; i++) {
      const n = WHEEL_ORDER[i];
      const a0 = -Math.PI / 2 + angle + i * step;
      const a1 = a0 + step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rP, a0, a1);
      ctx.closePath();
      ctx.fillStyle = n === 0 ? '#0e8a4a' : (isRed(n) ? '#c9273a' : '#1b2436');
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1; ctx.stroke();

      // numéro (lu depuis le centre)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = n === 0 ? '#eafff3' : '#f3f6ff';
      ctx.font = '700 ' + Math.max(7, S * 0.038).toFixed(0) + 'px -apple-system, Arial, sans-serif';
      ctx.fillText(String(n), rP - 3, 0);
      ctx.restore();
    }
    // moyeu
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.30, 0, Math.PI * 2);
    const hub = ctx.createRadialGradient(cx, cy - R * .12, 2, cx, cy, R * .34);
    hub.addColorStop(0, '#233251'); hub.addColorStop(1, '#0b1220');
    ctx.fillStyle = hub; ctx.fill();
    ctx.strokeStyle = 'rgba(255,197,49,.45)'; ctx.lineWidth = 1.5; ctx.stroke();

    // bille
    if (ballA != null) {
      const br = R * ballR;
      const bx = cx + Math.cos(ballA) * br, by = cy + Math.sin(ballA) * br;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(2.5, S * 0.016), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function spin(g) {
    const num = J.Fair.int(0, 36);
    const idx = WHEEL_ORDER.indexOf(num);
    const step = (Math.PI * 2) / 37;
    const from = g.angle;
    // rotation finale : le centre de la case tirée doit finir sous le pointeur (en haut).
    // La case i est centrée à (-π/2 + angle + (i+0,5)×pas) : on veut donc angle = -(i+0,5)×pas.
    const want = -(idx + 0.5) * step;
    let target = want;
    const laps = 5;
    while (target < from + laps * Math.PI * 2) target += Math.PI * 2;
    const dur = 3600;
    const t0 = performance.now();
    g.spinning = true;
    let lastTick = 0;

    function frame(now) {
      if (!g.spinning) return;
      const p = U.clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3.2);                       // décélération
      g.angle = from + (target - from) * e;
      // la bille tourne à contre-sens puis se pose dans la case
      const ballA = -Math.PI / 2 + (1 - e) * -22 + g.angle;
      const ballR = 0.32 + (1 - e) * 0.62;
      drawWheel(g, g.angle, ballA, ballR);
      if (!lastTick || now - lastTick > 90 - 60 * e) {          // tic-tac de la bille
        J.Sfx.wheelTick(1 - e); lastTick = now;
      }
      if (p < 1) g._raf = requestAnimationFrame(frame);
      else { g.spinning = false; g.angle = target; drawWheel(g, g.angle, null); }
    }
    g._raf = requestAnimationFrame(frame);

    J.Games.schedule(g, () => settle(g, num), dur + 60);
  }

  function startSpin(g) {
    J.Sfx.bet();
    J.Games.renderActions(g);
    spin(g);
  }

  function settle(g, num) {
    const t = totals(g);
    const stake = g.ticket ? g.ticket.bet : t.stake;      // montant réellement débité
    const r = evaluate(g, num);
    g.last = num;
    g.result = { num, mult: r.mult, gain: Math.round(stake * r.mult), won: r.won };
    g.recent.unshift(num);
    if (g.recent.length > 14) g.recent.pop();
    paintReadout(g);
    paintRecent(g);
    // La roulette est un jeu de tapis : le gain se fête à hauteur du
    // multiplicateur net rapporté à la mise totale de la manche.
    J.FX.celebrate({ mult: r.mult, payout: Math.round(stake * r.mult), el: g.readEl || g.gridEl });
    if (r.mult === 0) { J.Sfx.lose(); J.haptic.lose(); }
    J.Games.finish(g, r.mult, { detail: 'Numéro ' + num + ' · ' + t.spots + ' mise(s)', celebrated: true });

    // Tapis insuffisant après une perte : on réduit la valeur du jeton pour que
    // les mises restées en place restent jouables (le joueur peut aussi « Effacer »).
    const units = Object.keys(g.spots).reduce((a, k) => a + g.spots[k].w, 0);
    if (units && totals(g).stake > J.Wallet.balance) {
      g.chip = Math.max(1, Math.floor(J.Wallet.balance / units));
      J.toast('Jeton ajusté à ' + U.fmt(g.chip) + ' J', '');
    }
    paint(g);
  }

  /* ------------------------------------------------------------------ RENDU */
  function paint(g) {
    if (!g.gridEl) return;
    const t = totals(g);

    // grille
    g.gridEl.querySelectorAll('[data-num]').forEach((el) => {
      const n = parseInt(el.dataset.num, 10);
      el.classList.toggle('is-anchor', g.anchor === n);
      el.classList.toggle('is-last', g.last === n);
    });
    // pastilles de jetons : le nombre de jetons posés s'affiche sur la case
    g.gridEl.querySelectorAll('[data-num]').forEach((el) => { delete el.dataset.w; });
    for (const k in g.spots) {
      const sp = g.spots[k];
      if (sp.nums.length === 1) {
        const host = g.gridEl.querySelector('[data-num="' + sp.nums[0] + '"]');
        if (host) host.dataset.w = String(sp.w);
      }
    }
    // liste des mises posées
    const keys = Object.keys(g.spots);
    g.betList.innerHTML = keys.length
      ? keys.map((k) => {
        const s = g.spots[k];
        return '<button class="rui-bet" data-bet-key="' + k + '">' +
          '<b>' + s.label + '</b><span class="mono">' + (s.w * g.chip) + ' J · ' + s.mult + 'x</span>' +
          '<i>✕</i></button>';
      }).join('')
      : '<div class="note center">Touche un numéro ou une mise extérieure pour poser un jeton.</div>';
    g.betList.querySelectorAll('[data-bet-key]').forEach((b) => {
      b.onclick = () => unplace(g, b.dataset.betKey);
    });

    // total
    g.totalLine.innerHTML = t.spots
      ? '<b>' + t.spots + '</b> mise(s) · <b class="mono">' + U.fmt(t.stake) + ' J</b> sur le tapis' +
        ' · meilleur gain <b class="mono up">' + U.fmt(Math.round(t.stake * t.best)) + ' J</b>'
      : '<span class="muted">Aucune mise — mise de la manche : 0 J</span>';

    // sélecteur de type intérieur
    g.typeRow.querySelectorAll('[data-type]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.type === g.sel);
    });
    // valeurs de jeton
    g.chipRow.querySelectorAll('[data-chip-val]').forEach((b) => {
      b.classList.toggle('is-on', parseInt(b.dataset.chipVal, 10) === g.chip);
    });
    // directions proposées (cheval / carré)
    renderDirs(g);

    // La mise de la manche suit le tapis, et le bouton principal reflète l'état
    syncStake(g);
    J.Games.renderActions(g);
    paintRecent(g);
  }

  function renderDirs(g) {
    const box = g.dirBox;
    const def = BETS[g.sel];
    if (def.need !== 'dir' || g.anchor == null) {
      box.innerHTML = def.need === 'dir'
        ? '<div class="note">Touche le numéro de ton choix, puis la direction à jouer.</div>'
        : '<div class="note">Touche un numéro de la grille pour poser <b>' + def.label + '</b>.</div>';
      return;
    }
    const n = g.anchor;
    const cands = g.sel === 'cheval' ? neighbours(n) : squares(n);
    box.innerHTML = '<div class="rui-dirs">' + cands.map((c, i) =>
      '<button class="chip" data-dir="' + i + '"><b>' + c.tag + '</b> ' + numLabel(c.nums) + '</button>').join('') + '</div>';
    box.querySelectorAll('[data-dir]').forEach((b) => {
      b.onclick = () => {
        const c = cands[parseInt(b.dataset.dir, 10)];
        place(g, g.sel, c.nums);
      };
    });
  }

  function paintReadout(g) {
    if (!g.readEl) return;
    const r = g.result;
    if (!g.last && r == null) {
      g.readEl.innerHTML = '<div class="rui-num">—</div><div class="sub">Prêt pour le premier lancer</div>';
      return;
    }
    const n = g.last;
    g.readEl.innerHTML =
      '<div class="rui-num' + (n === 0 ? ' zero' : (isRed(n) ? ' red' : ' black')) + '">' + n + '</div>' +
      '<div class="sub">' + (n === 0 ? 'Zéro vert' : (isRed(n) ? 'Rouge' : 'Noir') + ' · ' + (n % 2 ? 'impair' : 'pair') +
        ' · ' + (n <= 18 ? 'manque' : 'passe')) + '</div>' +
      (r && r.mult > 0
        ? '<div class="rui-win">+' + U.fmt(r.gain) + ' J <span class="mono">' + U.fmtMult(r.mult) + '</span></div>'
        : '<div class="rui-lose">' + (r && r.won.length ? 'gain partiel' : 'perdu') + '</div>');
  }

  function paintRecent(g) {
    if (!g.recentEl) return;
    g.recentEl.innerHTML = g.recent.map((n) =>
      '<span class="rui-hist ' + (n === 0 ? 'zero' : (isRed(n) ? 'red' : 'black')) + '">' + n + '</span>').join('');
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'roulette',
    name: 'Roulette',
    icon: 'roulette',
    color: '#c9273a',
    rtp: 97.3,
    category: 'classics',
    tagline: 'Européenne, un seul zéro',
    volatility: 'Volatilité moyenne',
    hot: true,
    rules:
      'Roulette <b>européenne</b> : 37 cases, un seul zéro. Chaque mise rapporte ' +
      '<b>36 ÷ nombre de numéros couverts</b>, capital compris — l\'espérance est donc identique partout : ' +
      '<b>36/37 = 97,297 %</b>. Le zéro ne paie aucune chance simple.<br><br>' +
      '<b>Mises intérieures</b> : Plein (1 numéro, 36x), Cheval (2, 18x), Carré (4, 9x), Sixain (6, 6x). ' +
      'Choisis le type, touche un numéro, puis la direction proposée.<br>' +
      '<b>Mises extérieures</b> : Colonne, Douzaine (3x), Rouge/Noir, Pair/Impair, Manque/Passe (2x).<br>' +
      '<b>Mises annoncées</b> : Voisins du zéro (9 jetons), Orphelins (5), Tiers du cylindre (6), Jeu zéro (4) — ' +
      'les groupes du cylindre réel.<br><br>' +
      'Tu peux cumuler autant de mises que tu veux dans la limite du plafond de table. ' +
      'La valeur du jeton se choisit dans le panneau du bas ; la mise de la manche est la somme du tapis.',
    playLabel: 'Lancer la roue 🎡',

    state,

    stage(g) {
      return '' +
        '<div class="rui-stage">' +
          '<div class="rui-top">' +
            '<canvas class="rui-canvas" id="ruWheel"></canvas>' +
            '<div class="rui-read" id="ruRead"></div>' +
          '</div>' +
          '<div class="history-strip rui-hist" id="ruRecent"></div>' +
          '<div class="rui-types" id="ruTypes">' +
            ['plein', 'cheval', 'carre', 'sixain'].map((t) =>
              '<button class="chip' + (t === 'plein' ? ' is-on' : '') + '" data-type="' + t + '">' +
              BETS[t].label + ' <b>' + BETS[t].mult + 'x</b></button>').join('') +
          '</div>' +
          '<div class="rui-dirbox" id="ruDirs"></div>' +
          '<div class="rui-grid" id="ruGrid">' +
            '<button class="rui-zero" data-num="0">0</button>' +
            range(1, 36).map((n) => '<button class="rui-cell ' + (isRed(n) ? 'red' : 'black') + '" data-num="' + n + '">' + n + '</button>').join('') +
          '</div>' +
          '<div class="rui-out" id="ruOut">' +
            '<button class="rui-o wide2" data-out="manque">1 – 18</button>' +
            '<button class="rui-o" data-out="pair">Pair</button>' +
            '<button class="rui-o red" data-out="rouge">Rouge</button>' +
            '<button class="rui-o black" data-out="noir">Noir</button>' +
            '<button class="rui-o" data-out="impair">Impair</button>' +
            '<button class="rui-o wide2" data-out="passe">19 – 36</button>' +
            ['douzaine:1', 'douzaine:2', 'douzaine:3'].map((d) => {
              const i = parseInt(d.split(':')[1], 10);
              return '<button class="rui-o wide2" data-out="douzaine:' + i + '">D' + i + ' (' + ((i - 1) * 12 + 1) + '–' + (i * 12) + ')</button>';
            }).join('') +
            ['colonne:0', 'colonne:1', 'colonne:2'].map((c) => {
              const i = parseInt(c.split(':')[1], 10);
              return '<button class="rui-o wide2" data-out="colonne:' + i + '">Colonne ' + (i + 1) + ' <b>3x</b></button>';
            }).join('') +
          '</div>' +
          '<div class="rui-betlist" id="ruBets"></div>' +
        '</div>';
    },

    controls(g) {
      return '' +
        '<div class="rui-ctl">' +
          '<div class="row between"><span class="bet-label">Jeton</span>' +
            '<span class="sub" id="ruTotal"></span></div>' +
          '<div class="chips mt-s" id="ruChips">' +
            [10, 50, 100, 500, 1000, 5000].map((v) =>
              '<button class="casino-chip' + (v === 100 ? ' is-on' : '') + '" data-chip-val="' + v + '">' + U.fmtK(v) + '</button>').join('') +
          '</div>' +
          '<div class="rui-presets mt-s" id="ruPresets">' +
            PRESETS.map((p) => '<button class="rui-preset" data-preset="' + p.id + '">' +
              '<b>' + p.name + '</b><span>' + p.chips + ' jetons</span></button>').join('') +
          '</div>' +
          '<div class="btn-row three mt-s">' +
            '<button class="btn ghost" id="ruRebet">↻ Relancer</button>' +
            '<button class="btn ghost" id="ruDouble">x2 tapis</button>' +
            '<button class="btn ghost" id="ruClear">Effacer</button>' +
          '</div>' +
          '<div class="sub mt-s" id="ruHint"></div>' +
        '</div>';
    },

    actions(g) {
      const t = totals(g);
      return [{
        label: g.spinning ? 'La bille tourne…'
          : (t.stake > 0 ? 'Lancer la roue · ' + U.fmtK(t.stake) + ' J 🎡' : 'Poser une mise d\'abord'),
        cls: 'primary wide-lg grow', act: 'play', disabled: g.spinning || t.stake <= 0
      }];
    },

    payoutHint(g) {
      const t = totals(g);
      return t.spots ? t.spots + ' mise(s) · ' + U.fmt(t.stake) + ' J' : 'RTP 97,30 %';
    },

    mount(g) {
      g.cv = g.viewEl.querySelector('#ruWheel');
      g.readEl = g.viewEl.querySelector('#ruRead');
      g.recentEl = g.viewEl.querySelector('#ruRecent');
      g.gridEl = g.viewEl.querySelector('#ruGrid');
      g.betList = g.viewEl.querySelector('#ruBets');
      g.typeRow = g.viewEl.querySelector('#ruTypes');
      g.dirBox = g.viewEl.querySelector('#ruDirs');
      g.outBox = g.viewEl.querySelector('#ruOut');
      g.totalLine = g.panelEl.querySelector('#ruTotal');
      g.chipRow = g.panelEl.querySelector('#ruChips');

      // La roue occupe environ 40 % de la hauteur de scène, bornée pour rester lisible

      const box = g.stageEl.getBoundingClientRect();
      g.size = Math.round(Math.min(box.width - 40, Math.max(120, box.height * 0.42)));
      g.size = Math.max(140, Math.min(g.size, 230));
      drawWheel(g, g.angle, null);
      paintReadout(g);
      paintRecent(g);

      // Types de mises intérieures
      g.typeRow.querySelectorAll('[data-type]').forEach((b) => {
        b.onclick = () => {
          J.Sfx.click(); J.haptic.tap();
          g.sel = b.dataset.type; g.anchor = null;
          paint(g);
        };
      });

      // Grille : un tap pose le jeton selon le type sélectionné
      g.gridEl.querySelectorAll('[data-num]').forEach((el) => {
        el.onclick = () => {
          const n = parseInt(el.dataset.num, 10);
          const def = BETS[g.sel];
          if (def.need === 'dir') {
            g.anchor = n; g.lastAnchor = n;
            J.Sfx.click(); J.haptic.tap();
            paint(g);
            return;
          }
          if (def.need === 'num' && g.sel === 'sixain') { place(g, 'sixain', sixainOf(n)); return; }
          place(g, 'plein', [n]);
        };
      });

      // Mises extérieures
      g.outBox.querySelectorAll('[data-out]').forEach((b) => {
        b.onclick = () => {
          const spec = b.dataset.out;
          if (spec.indexOf(':') > 0) {
            const [type, i] = spec.split(':');
            const idx = parseInt(i, 10);
            if (type === 'douzaine') place(g, 'douzaine', range(idx * 12 + 1, idx * 12 + 12));
            else place(g, 'colonne', COLUMN[idx].nums);
            return;
          }
          if (spec === 'rouge') place(g, 'rouge', RED);
          else if (spec === 'noir') place(g, 'noir', range(1, 36).filter((n) => !isRed(n)));
          else if (spec === 'pair') place(g, 'pair', range(1, 36).filter((n) => n % 2 === 0));
          else if (spec === 'impair') place(g, 'impair', range(1, 36).filter((n) => n % 2 === 1));
          else if (spec === 'manque') place(g, 'manque', range(1, 18));
          else if (spec === 'passe') place(g, 'passe', range(19, 36));
        };
      });

      // Jeton
      g.chipRow.querySelectorAll('[data-chip-val]').forEach((b) => {
        b.onclick = () => {
          g.chip = parseInt(b.dataset.chipVal, 10);
          J.Sfx.click(); J.haptic.tap();
          paint(g);
        };
      });
      // Mises annoncées
      g.panelEl.querySelector('#ruPresets').querySelectorAll('[data-preset]').forEach((b) => {
        b.onclick = () => placePreset(g, PRESETS.find((p) => p.id === b.dataset.preset));
      });
      // Relancer / doubler / effacer
      g.panelEl.querySelector('#ruRebet').onclick = () => rebet(g);
      g.panelEl.querySelector('#ruClear').onclick = () => clearSpots(g);
      g.panelEl.querySelector('#ruDouble').onclick = () => {
        const keys = Object.keys(g.spots);
        if (!keys.length) { J.toast('Aucune mise à doubler', 'ko'); return; }
        const nw = keys.reduce((a, k) => a + g.spots[k].w, 0);
        if (nw * g.chip > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
        if (nw * g.chip > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return; }
        keys.forEach((k) => { g.spots[k].w *= 2; });
        J.Sfx.coin(); J.toast('Tapis doublé', 'ok');
        paint(g);
      };

      // Info-bulle des règles des annonces
      g.panelEl.querySelector('#ruHint').innerHTML =
        '<b>Voisins</b> ' + PRESETS[0].chips + ' j · <b>Orphelins</b> ' + PRESETS[1].chips +
        ' j · <b>Tiers</b> ' + PRESETS[2].chips + ' j · <b>Jeu zéro</b> ' + PRESETS[3].chips + ' j — ' +
        'groupes du cylindre réel. Chaque mise rapporte 36 ÷ numéros couverts : RTP 97,30 % partout.';

      paint(g);
    },

    start(g) {
      const t = totals(g);
      if (t.stake <= 0) { J.Games.abort(g, 'Pose au moins une mise'); return; }
      if (t.stake !== g.bet) J.Games.setBet(g, t.stake, true);
      g.result = null;
      paintReadout(g);
      J.Games.setAutoStatus(g, 'Lancer ' + U.fmtK(t.stake) + ' J · ' + t.spots + ' mise(s)');
      startSpin(g);
    },

    stop(g) {
      g.spinning = false;
      if (g._raf) cancelAnimationFrame(g._raf);
      g._raf = null;
    }
  });

  /* Exposé pour les tests : types de mises, groupes du cylindre et règlement pur. */
  J.__roulette = { BETS, PRESETS, WHEEL_ORDER, RED, COLUMN, payoutMult, sixainOf, neighbours, squares, makeSpot, keyOf };
})();
