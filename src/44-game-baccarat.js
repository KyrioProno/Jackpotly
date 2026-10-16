/* =========================================================================
   JEU 13 — BACCARAT (Punto Banco)
   Sabot de 8 jeux. Tu mises sur la main du <b>Joueur</b>, celle de la
   <b>Banque</b>, l'<b>Égalité</b>, ou une <b>Paire</b>. Les deux mains sont
   distribuées selon les règles officielles du Punto Banco (tableau de la
   3ᵉ carte) : aucune décision à prendre, tout est automatique.

   Paiements et RTP (sabot de 8 jeux, probabilités exactes du jeu) :
     Banque   → 1,95 × mise (0,95:1)  … RTP 98,94 %
     Joueur   → 2 × mise (1:1)        … RTP 98,76 %
     Égalité  → 9 × mise (8:1)        … RTP 85,64 %
     Paire    → 12 × mise (11:1)      … RTP 89,64 %
   Le meilleur choix est donc la Banque (la commission de 5 % paie sa
   fréquence de gain supérieure).
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const C = J.Cards;

  const DECKS = 8;
  const RESHUFFLE_AT = 26;

  const SPOTS = {
    banque: { label: 'Banque', mult: 1.95, cls: 'bank', hint: '0,95:1 · RTP 98,94 %' },
    joueur: { label: 'Joueur', mult: 2, cls: 'player', hint: '1:1 · RTP 98,76 %' },
    egalite: { label: 'Égalité', mult: 9, cls: 'tie', hint: '8:1 · RTP 85,64 %' },
    paireJ: { label: 'Paire Joueur', mult: 12, cls: 'pair', hint: '11:1 · RTP 89,64 %' },
    paireB: { label: 'Paire Banque', mult: 12, cls: 'pair', hint: '11:1 · RTP 89,64 %' }
  };
  const KEYS = ['joueur', 'banque', 'egalite', 'paireJ', 'paireB'];

  /** Valeur baccarat d'une carte : A = 1, 10/V/D/R = 0, le reste en face. */
  function cardValue(c) {
    const r = C.rank(c);
    if (r === 12) return 1;
    if (r >= 9) return 0;                 // 10, V, D, R
    return r + 2;
  }
  const total = (cards) => cards.reduce((a, c) => a + cardValue(c), 0) % 10;
  // La paire se lit toujours sur les DEUX PREMIÈRES cartes de la main (même si
  // une troisième carte a été tirée : sinon la mise ne payait presque jamais).
  const isPair = (cards) => cards.length >= 2 && C.rank(cards[0]) === C.rank(cards[1]);

  function state(g) {
    g.shoe = [];
    g.player = [];
    g.banker = [];
    g.spots = {};                          // mise par case (en jetons)
    g.chip = 100;
    g.busyDeal = false;
    g.phase = 'idle';                      // idle | deal | done
    g.outcome = null;                      // 'joueur' | 'banque' | 'egalite'
    g.reveal = [];                         // séquence de révélation
    g.msg = '';
    g.recent = [];                         // tableau d'affichage
    g.lastSpots = null;
    g.detail = '';
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  function newShoe() {
    const s = [];
    for (let d = 0; d < DECKS; d++) s.push.apply(s, C.deck());
    return C.shuffle(s);
  }

  /** Déroule une donne complète selon les règles officielles (sans animation). */
  function playOut(shoe) {
    const draw = () => shoe.pop();
    const p = [draw(), draw()];
    const b = [draw(), draw()];
    let pThird = null, bThird = null;
    const pt = total(p), bt = total(b);

    if (pt < 8 && bt < 8) {                       // pas de naturel
      if (pt <= 5) { pThird = draw(); p.push(pThird); }
      const pTotal = total(p);
      const drawBanker = (() => {
        if (pThird === null) return bt <= 5;                    // le joueur a passé
        const v = cardValue(pThird);
        if (bt <= 2) return true;
        if (bt === 3) return v !== 8;
        if (bt === 4) return v >= 2 && v <= 7;
        if (bt === 5) return v >= 4 && v <= 7;
        if (bt === 6) return v === 6 || v === 7;
        return false;                                            // bt === 7
      })();
      if (drawBanker) { bThird = draw(); b.push(bThird); }
      void pTotal;
    }
    const finalP = total(p), finalB = total(b);
    return {
      player: p, banker: b, pThird, bThird,
      pTotal: finalP, bTotal: finalB,
      outcome: finalP > finalB ? 'joueur' : finalB > finalP ? 'banque' : 'egalite'
    };
  }

  /* ---------------------------------------------------------------- RENDU */
  function totals(g) {
    let w = 0, spots = 0;
    for (const k in g.spots) { w += g.spots[k]; spots++; }
    return { w, spots, stake: w * g.chip };
  }

  /**
   * Tire la donne complète à l'avance (le sabot est distribué dans l'ordre) :
   * `r` porte les mains définitives, tandis que g.player / g.banker ne
   * contiennent que les cartes déjà révélées pour l'animation.
   */
  function dealFull(g) {
    if (g.shoe.length < RESHUFFLE_AT) g.shoe = newShoe();
    const r = playOut(g.shoe);
    g.pFull = r.player; g.bFull = r.banker;
    g.player = []; g.banker = [];
    g.outcome = r.outcome;
    return r;
  }

  function paint(g) {
    if (!g.pEl) return;
    const pt = total(g.player), bt = total(g.banker);
    const waiting = g.phase !== 'done';
    g.pEl.innerHTML = g.player.map((c, i) => C.html(c, i >= 2 ? 'deal' : '')).join('');
    g.bEl.innerHTML = g.banker.map((c, i) => C.html(c, i >= 2 ? 'deal' : '')).join('');
    g.pScore.textContent = g.player.length ? (waiting && g.phase === 'deal' ? '…' : pt) : '—';
    g.bScore.textContent = g.banker.length ? (waiting && g.phase === 'deal' ? '…' : bt) : '—';

    // tableau d'affichage
    g.marqueeEl.innerHTML = g.recent.slice(0, 16).map((o) =>
      '<span class="bac-h ' + o + '">' + (o === 'joueur' ? 'J' : o === 'banque' ? 'B' : 'T') + '</span>').join('');

    // zones de mise
    KEYS.forEach((k) => {
      const el = g.zoneEl.querySelector('[data-zone="' + k + '"]');
      if (!el) return;
      const w = g.spots[k] || 0;
      el.classList.toggle('is-on', w > 0);
      let badge = el.querySelector('.bac-w');
      if (w > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'bac-w'; el.appendChild(badge); }
        badge.textContent = w + ' × ' + U.fmtK(g.chip);
      } else if (badge) badge.remove();
    });

    // mises posées, avec retrait d'un jeton
    g.listEl.innerHTML = Object.keys(g.spots).map((k) =>
      '<button class="rui-bet" data-off="' + k + '"><b>' + SPOTS[k].label + '</b>' +
      '<span class="mono">' + U.fmt(g.spots[k] * g.chip) + ' J · ' + SPOTS[k].mult.toString().replace('.', ',') + 'x</span><i>✕</i></button>').join('');
    g.listEl.querySelectorAll('[data-off]').forEach((b) => { b.onclick = () => unplace(g, b.dataset.off); });

    const t = totals(g);
    const win = KEYS.filter((k) => g.spots[k] && wins(k, g));
    g.infoEl.innerHTML = g.phase === 'done' && g.outcome
      ? '<b class="' + (win.length ? 'up' : 'muted') + '">' + (g.msg || '') + '</b>' +
        '<span class="sub"> · Joueur ' + pt + ' · Banque ' + bt + '</span>' +
        (g.detail ? '<div class="sub mt-s">' + g.detail + '</div>' : '')
      : '<b>' + (g.spots && t.spots ? t.spots + ' mise(s) · ' + U.fmt(t.stake) + ' J sur le tapis' : 'Place ta mise') + '</b>' +
        '<span class="sub"> · ' + (waiting ? 'Distribution automatique' : '') + '</span>';

    syncStake(g);
    J.Games.renderActions(g);
  }

  /** La mise de la manche = total du tapis (ce que le moteur débitera). */
  function syncStake(g) {
    const t = totals(g);
    if (t.stake > 0) J.Games.setBet(g, t.stake, true);
    J.Games.updateHints(g);
  }

  const wins = (k, g) => {
    if (!g.outcome) return false;
    if (k === 'joueur') return g.outcome === 'joueur';
    if (k === 'banque') return g.outcome === 'banque';
    if (k === 'egalite') return g.outcome === 'egalite';
    if (k === 'paireJ') return isPair(g.player);
    if (k === 'paireB') return isPair(g.banker);
    return false;
  };

  /* ------------------------------------------------------------- MOUVEMENTS */
  function place(g, k, silent) {
    const t = totals(g);
    if (t.stake + g.chip > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
    if (t.stake + g.chip > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return; }
    g.spots[k] = (g.spots[k] || 0) + 1;
    if (!silent) { J.Sfx.chip(); J.haptic.tap(); }
    paint(g);
  }
  function unplace(g, k) {
    if (!g.spots[k]) return;
    g.spots[k]--;
    if (!g.spots[k]) delete g.spots[k];
    J.Sfx.click();
    paint(g);
  }
  function clearSpots(g) {
    if (!Object.keys(g.spots).length) return;
    g.lastSpots = Object.assign({}, g.spots);
    g.spots = {};
    J.Sfx.click();
    paint(g);
  }
  function rebet(g) {
    if (!g.lastSpots) { J.toast('Aucune mise à relancer', 'ko'); return; }
    const w = Object.keys(g.lastSpots).reduce((a, k) => a + g.lastSpots[k], 0);
    if (w * g.chip > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return; }
    if (w * g.chip > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
    g.spots = Object.assign({}, g.lastSpots);
    J.Sfx.chip();
    paint(g);
  }

  /* ---------------------------------------------------------------- DONNE */
  function start(g) {
    const t = totals(g);
    if (!t.spots) { J.Games.abort(g, 'Place ta mise'); return; }
    if (t.stake !== g.bet) J.Games.setBet(g, t.stake, true);
    g.phase = 'deal';
    g.outcome = null;
    g.msg = '';
    g.detail = '';
    g.player = [];
    g.banker = [];
    paint(g);

    const r = dealFull(g);
    // séquence de révélation : J, B, J, B puis les 3ᵉ cartes éventuelles
    const seq = [
      () => { g.player.push(r.player[0]); },
      () => { g.banker.push(r.banker[0]); },
      () => { g.player.push(r.player[1]); },
      () => { g.banker.push(r.banker[1]); }
    ];
    if (r.pThird != null) seq.push(() => { g.player[2] = r.pThird; g.msg = 'Le Joueur tire une 3ᵉ carte'; });
    if (r.bThird != null) seq.push(() => { g.banker[2] = r.bThird; g.msg = 'La Banque tire une 3ᵉ carte'; });

    seq.forEach((fn, i) => J.Games.schedule(g, () => {
      fn();
      J.Sfx.tick(i);
      // l'affichage interroge les tableaux complets : on montre carte par carte
      paint(g);
    }, 200 + i * 300));

    J.Games.schedule(g, () => settle(g, r), 200 + seq.length * 300 + 260);
  }

  function settle(g, r) {
    const t = totals(g);
    const stake = g.ticket ? g.ticket.bet : t.stake;
    let mult = 0;
    const winning = [];
    KEYS.forEach((k) => {
      if (!g.spots[k]) return;
      if (wins(k, g)) {
        mult += (g.spots[k] / t.w) * SPOTS[k].mult;
        winning.push(SPOTS[k].label + ' ' + SPOTS[k].mult.toFixed(2).replace('.', ',') + 'x');
      }
    });
    g.phase = 'done';
    g.recent.unshift(g.outcome);
    if (g.recent.length > 40) g.recent.pop();
    g.detail = 'Joueur ' + r.pTotal + ' (' + r.player.map(C.label).join(' ') + ')' +
      ' · Banque ' + r.bTotal + ' (' + r.banker.map(C.label).join(' ') + ')' +
      (r.pThird != null ? ' · 3ᵉ carte Joueur' : '') + (r.bThird != null ? ' · 3ᵉ carte Banque' : '') +
      (winning.length ? ' · gagné : ' + winning.join(', ') : '');
    g.msg = g.outcome === 'egalite' ? 'Égalité' : (g.outcome === 'joueur' ? 'Le Joueur gagne' : 'La Banque gagne');
    paint(g);
    if (mult > 2) { J.Sfx.bigwin(); J.haptic.big(); }
    else if (mult > 0) { J.Sfx.win(mult); J.haptic.win(mult); }
    else { J.Sfx.lose(); J.haptic.lose(); }
    J.Games.finish(g, mult, { detail: g.detail });
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'baccarat',
    name: 'Baccarat',
    icon: 'baccarat',
    color: '#8b5cf6',
    rtp: 98.94,
    category: 'classics',
    tagline: 'Joueur, banquier ou égalité',
    volatility: 'Volatilité faible',
    hot: true,
    rules:
      'Baccarat <b>Punto Banco</b>, sabot de 8 jeux. Deux mains sont servies : le <b>Joueur</b> et la ' +
      '<b>Banque</b>. La main la plus proche de <b>9</b> gagne (A = 1, 10/V/D/R = 0, on garde le chiffre des unités). ' +
      '<b>Aucune décision</b> : le tableau officiel de la 3ᵉ carte décide de tout.<br><br>' +
      '<b>Paiements</b> : Banque <b>0,95:1</b> (RTP 98,94 %) · Joueur <b>1:1</b> (RTP 98,76 %) · ' +
      'Égalité <b>8:1</b> (RTP 85,64 %) · Paire <b>11:1</b> (RTP 89,64 %).<br>' +
      'Tu peux cumuler plusieurs mises sur le même coup (par exemple Banque + Paire). ' +
      'Une main qui fait 8 ou 9 d\'entrée est un <b>naturel</b> : plus de tirage.',
    playLabel: 'Distribuer 🎴',

    state, start,
    stop(g) { g.phase = 'idle'; },

    stage(g) {
      return '' +
        '<div class="bac-stage table-felt">' +
          '<div class="bac-hands">' +
            '<div class="bac-side">' +
              '<div class="row between"><span class="tbl-label">Banque</span>' +
                '<span class="bac-score bank" id="bacBScore">—</span></div>' +
              '<div class="cards-row bac-cards" id="bacB"></div>' +
            '</div>' +
            '<div class="bac-side">' +
              '<div class="row between"><span class="tbl-label">Joueur</span>' +
                '<span class="bac-score player" id="bacPScore">—</span></div>' +
              '<div class="cards-row bac-cards" id="bacP"></div>' +
            '</div>' +
          '</div>' +
          '<div class="bac-info" id="bacInfo"></div>' +
          '<div class="bac-marquee history-strip" id="bacMarquee"></div>' +
          '<div class="bac-zones" id="bacZones">' +
            '<button class="bac-zone bank" data-zone="banque"><b>BANQUE</b><span>0,95:1</span></button>' +
            '<button class="bac-zone tie" data-zone="egalite"><b>ÉGALITÉ</b><span>8:1</span></button>' +
            '<button class="bac-zone player" data-zone="joueur"><b>JOUEUR</b><span>1:1</span></button>' +
            '<button class="bac-zone pair" data-zone="paireJ"><b>PAIRE JOUEUR</b><span>11:1</span></button>' +
            '<button class="bac-zone pair" data-zone="paireB"><b>PAIRE BANQUE</b><span>11:1</span></button>' +
          '</div>' +
        '</div>';
    },

    controls(g) {
      return '' +
        '<div class="row between"><span class="bet-label">Jeton</span>' +
          '<button class="link" id="bacClear">Effacer les mises</button></div>' +
        '<div class="chips mt-s" id="bacChips">' +
          [10, 50, 100, 500, 1000, 5000].map((v) =>
            '<button class="chip' + (v === 100 ? ' is-on' : '') + '" data-chip-val="' + v + '">' + U.fmtK(v) + '</button>').join('') +
        '</div>' +
        '<div class="rui-betlist" id="bacList"></div>' +
        '<div class="btn-row two mt-s">' +
          '<button class="btn ghost" id="bacRebet">↻ Relancer la même mise</button>' +
          '<button class="btn ghost" id="bacDouble">x2 toutes les mises</button>' +
        '</div>' +
        '<div class="sub mt-s">Banque 98,94 % · Joueur 98,76 % · Paire 89,64 % · Égalité 85,64 %. ' +
        'Le tableau d\'affichage garde les 16 derniers coups (J / B / T).</div>';
    },

    actions(g) {
      const t = totals(g);
      return [{
        label: g.phase === 'deal' ? 'Distribution…'
          : (t.spots ? 'Distribuer · ' + U.fmtK(t.stake) + ' J 🎴' : 'Place une mise d\'abord'),
        cls: 'primary wide-lg grow', act: 'play', disabled: g.phase === 'deal' || !t.spots
      }];
    },

    payoutHint(g) {
      const t = totals(g);
      return t.spots ? t.spots + ' mise(s) · ' + U.fmt(t.stake) + ' J' : 'RTP jusqu\'à 98,94 %';
    },

    mount(g) {
      g.pEl = g.viewEl.querySelector('#bacP');
      g.bEl = g.viewEl.querySelector('#bacB');
      g.pScore = g.viewEl.querySelector('#bacPScore');
      g.bScore = g.viewEl.querySelector('#bacBScore');
      g.infoEl = g.viewEl.querySelector('#bacInfo');
      g.marqueeEl = g.viewEl.querySelector('#bacMarquee');
      g.zoneEl = g.viewEl.querySelector('#bacZones');
      g.listEl = g.panelEl.querySelector('#bacList');

      g.zoneEl.querySelectorAll('[data-zone]').forEach((b) => {
        b.onclick = () => { if (g.phase !== 'deal') place(g, b.dataset.zone); };
      });
      g.panelEl.querySelector('#bacChips').querySelectorAll('[data-chip-val]').forEach((b) => {
        b.onclick = () => { g.chip = parseInt(b.dataset.chipVal, 10); J.Sfx.click(); paintChips(g); paint(g); };
      });
      g.panelEl.querySelector('#bacClear').onclick = () => clearSpots(g);
      g.panelEl.querySelector('#bacRebet').onclick = () => rebet(g);
      g.panelEl.querySelector('#bacDouble').onclick = () => {
        const keys = Object.keys(g.spots);
        if (!keys.length) { J.toast('Aucune mise à doubler', 'ko'); return; }
        const w = keys.reduce((a, k) => a + g.spots[k], 0) * 2;
        if (w * g.chip > J.CONST.MAX_BET) { J.toast('Plafond de table atteint', 'ko'); return; }
        if (w * g.chip > J.Wallet.balance) { J.toast('Solde insuffisant', 'ko'); return; }
        keys.forEach((k) => { g.spots[k] *= 2; });
        J.Sfx.chip();
        paint(g);
      };
      paintChips(g);
      paint(g);
    }
  });

  /* Exposé pour les tests : donne complète, valeurs de cartes, mises et sabots. */
  J.__baccarat = { playOut, newShoe, cardValue, spotTotal: total, SPOTS, isPair, DECKS };

  /** Met en évidence la valeur de jeton choisie. */
  function paintChips(g) {
    g.panelEl.querySelectorAll('#bacChips [data-chip-val]').forEach((b) => {
      b.classList.toggle('is-on', parseInt(b.dataset.chipVal, 10) === g.chip);
    });
  }
})();
