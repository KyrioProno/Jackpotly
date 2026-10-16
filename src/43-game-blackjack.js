/* =========================================================================
   JEU 12 — BLACKJACK
   Sabot de 6 jeux (312 cartes). Le croupier tire jusqu'à 17 et s'arrête
   (S17). Actions : Tirer, Rester, Doubler, Séparer (jusqu'à 4 mains) et
   Assurance quand la carte visible du croupier est un As.

   Paiements : blackjack naturel 3:2 · gain 1:1 · égalité remboursée ·
   assurance 2:1. Avec la stratégie de base, l'espérance du joueur atteint
   ≈ 99,5 % : chaque décision (tirer/rester/doubler/séparer) est donc la
   seule chose qui sépare le joueur du meilleur retour possible.
   Le mode Auto-bet joue la main selon la stratégie de base.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const C = J.Cards;

  const DECKS = 6;
  const RESHUFFLE_AT = 60;              // on rebat le sabot sous 60 cartes

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    g.shoe = [];
    g.dealer = [];
    g.hands = [];
    g.active = 0;
    g.phase = 'idle';                   // idle | player | insurance | dealer | done
    g.hidden = true;                    // carte cachée du croupier
    g.insurance = 0;
    g.msg = '';
    g.detail = '';
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  /* Mélange : 6 jeux battus par le provably fair. */
  function newShoe() {
    const s = [];
    for (let d = 0; d < DECKS; d++) s.push.apply(s, C.deck());
    return C.shuffle(s);
  }
  function draw(g) {
    if (!g.shoe.length) g.shoe = newShoe();
    return g.shoe.pop();
  }

  const hand = (cards, stake) => ({
    cards, stake, done: false, doubled: false, split: false,
    fromAces: false, result: '', payout: 0, natural: false
  });

  /* --------------------------------------------------------------- DÉROULÉ */
  function start(g) {
    if (g.shoe.length < RESHUFFLE_AT) g.shoe = newShoe();
    g.dealer = [];
    g.hands = [hand([], g.ticket.bet)];
    g.active = 0;
    g.insurance = 0;
    g.hidden = true;
    g.phase = 'player';
    g.msg = 'Distribution…';
    g.detail = '';

    const seq = [
      () => { g.hands[0].cards.push(draw(g)); },
      () => { g.dealer.push(draw(g)); },
      () => { g.hands[0].cards.push(draw(g)); },
      () => { g.dealer.push(draw(g)); }
    ];
    seq.forEach((fn, i) => J.Games.schedule(g, () => {
      fn(); J.Sfx.tick(i); paint(g);
      if (i === seq.length - 1) afterDeal(g);
    }, 90 + i * 230));
  }

  function afterDeal(g) {
    const p = g.hands[0];
    p.natural = isNatural(p.cards);
    const up = g.dealer[0];
    // Assurance proposée uniquement si le croupier montre un As et qu'aucun
    // blackjack naturel n'est déjà en jeu côté joueur.
    // En Auto-bet, la stratégie de base refuse toujours l'assurance
    if (!g.auto.on && !p.natural && C.rank(up) === 12 && J.Wallet.balance >= Math.ceil(g.bet / 2)) {
      g.phase = 'insurance';
      g.msg = 'Assurance ? Le croupier montre un As.';
    } else {
      g.phase = 'player';
      g.msg = p.natural ? 'Blackjack naturel !' : 'À toi de jouer';
    }
    paint(g);
    J.Games.renderActions(g);
    if (p.natural) { J.Games.schedule(g, () => dealerPlay(g), 700); return; }
    if (g.auto.on) J.Games.schedule(g, () => autoStep(g), 340);
  }

  const isNatural = (cards) => cards.length === 2 && C.blackjackValue(cards).total === 21;

  function handOf(g) { return g.hands[g.active]; }

  /* ------------------------------------------------------------- DÉCISIONS */
  function hit(g, auto) {
    const h = handOf(g);
    if (!h || h.done) return;
    h.cards.push(draw(g));
    J.Sfx.tick(h.cards.length);
    const v = C.blackjackValue(h.cards).total;
    paint(g);
    if (v > 21) {
      h.done = true; h.result = 'bust'; g.msg = 'Au-dessus de 21 — perdu';
      J.Sfx.bust(); J.haptic.lose();
      J.Games.schedule(g, () => nextHand(g), 520);
    } else if (v === 21) {
      h.done = true; g.msg = '21 !';
      J.Games.schedule(g, () => nextHand(g), 420);
    } else if (auto) {
      J.Games.schedule(g, () => autoStep(g), 260);
    } else {
      J.Games.renderActions(g);
    }
  }

  function stand(g) {
    const h = handOf(g);
    if (!h || h.done) return;
    h.done = true;
    h.result = 'stand';
    J.Sfx.tap();
    paint(g);
    J.Games.schedule(g, () => nextHand(g), 220);
  }

  function canDouble(g) {
    const h = handOf(g);
    return !!h && !h.done && h.cards.length === 2 && J.Wallet.balance >= h.stake && g.hands.length <= 4;
  }

  function doDouble(g) {
    const h = handOf(g);
    if (!canDouble(g)) return false;
    if (!J.Wallet.extendStake(g.ticket, h.stake)) { J.toast('Solde insuffisant pour doubler', 'ko'); return false; }
    h.stake *= 2;
    h.doubled = true;
    h.cards.push(draw(g));
    const v = C.blackjackValue(h.cards).total;
    h.done = true;
    h.result = v > 21 ? 'bust' : 'double';
    if (v > 21) { J.Sfx.bust(); J.haptic.lose(); } else J.Sfx.cashout();
    paint(g);
    J.Games.schedule(g, () => nextHand(g), 520);
    return true;
  }

  function canSplit(g) {
    const h = handOf(g);
    if (!h || h.done || h.cards.length !== 2) return false;
    if (g.hands.length >= 4) return false;
    const a = h.cards[0], b = h.cards[1];
    const same = C.rank(a) === C.rank(b) || (C.blackjackValue([a]).total === 10 && C.blackjackValue([b]).total === 10);
    if (!same) return false;
    return J.Wallet.balance >= h.stake;
  }

  function doSplit(g) {
    const h = handOf(g);
    if (!canSplit(g)) return false;
    if (!J.Wallet.extendStake(g.ticket, h.stake)) { J.toast('Solde insuffisant pour séparer', 'ko'); return false; }
    const aces = C.rank(h.cards[0]) === 12;
    const h2 = hand([h.cards.pop()], h.stake);
    h.split = true; h2.split = true;
    h.fromAces = aces; h2.fromAces = aces;
    g.hands.splice(g.active + 1, 0, h2);
    // une carte pour chaque nouvelle main
    h.cards.push(draw(g));
    h2.cards.push(draw(g));
    if (aces) { h.done = true; h2.done = true; h.result = 'stand'; h2.result = 'stand'; }
    J.Sfx.reveal(true);
    g.msg = 'Main séparée — ' + g.hands.length + ' mains';
    paint(g);
    if (aces) J.Games.schedule(g, () => nextHand(g), 420);
    else if (g.auto.on) J.Games.schedule(g, () => autoStep(g), 320);
    return true;
  }

  function takeInsurance(g) {
    const h = g.hands[0];
    const amount = Math.min(Math.ceil(g.bet / 2), Math.floor(J.Wallet.balance));
    if (amount < 1) { declineInsurance(g); return; }
    if (!J.Wallet.extendStake(g.ticket, amount)) { J.toast('Solde insuffisant', 'ko'); return; }
    g.insurance = amount;
    J.Sfx.chip();
    J.toast('Assurance prise : ' + U.fmt(amount) + ' J', 'ok');
    g.phase = 'player';
    g.msg = 'Assurance prise — à toi de jouer';
    paint(g);
    J.Games.renderActions(g);
    if (g.auto.on) J.Games.schedule(g, () => autoStep(g), 320);
  }

  function declineInsurance(g) {
    g.phase = 'player';
    g.msg = 'Sans assurance — à toi de jouer';
    J.Sfx.tap();
    paint(g);
    J.Games.renderActions(g);
    if (g.auto.on) J.Games.schedule(g, () => autoStep(g), 300);
  }

  /* --------------------------------------------------------- ENCHAÎNEMENT */
  function nextHand(g) {
    for (let i = 0; i < g.hands.length; i++) {
      if (!g.hands[i].done) { g.active = i; paint(g); J.Games.renderActions(g); if (g.auto.on) J.Games.schedule(g, () => autoStep(g), 320); return; }
    }
    dealerPlay(g);
  }

  function dealerPlay(g) {
    g.phase = 'dealer';
    g.hidden = false;
    const alive = g.hands.some((h) => C.blackjackValue(h.cards).total <= 21);
    const playerBJ = g.hands.some((h) => h.natural);
    g.msg = 'Le croupier joue…';
    paint(g);
    J.Sfx.reveal(true);

    const step = () => {
      const total = C.blackjackValue(g.dealer).total;
      // Le croupier ne tire pas si aucune main du joueur ne peut gagner
      const needPlay = alive && !(playerBJ && g.dealer.length === 2);
      if (needPlay && total < 17) {
        g.dealer.push(draw(g));
        J.Sfx.tick(g.dealer.length);
        paint(g);
        J.Games.schedule(g, step, 420);
        return;
      }
      J.Games.schedule(g, () => settle(g), 380);
    };
    J.Games.schedule(g, step, 420);
  }

  /* --------------------------------------------------------- RÈGLEMENT */
  function settle(g) {
    const dv = C.blackjackValue(g.dealer).total;
    const dealerBJ = g.dealer.length === 2 && dv === 21;
    const dealerBust = dv > 21;
    let returned = 0, stake = 0;

    g.hands.forEach((h) => {
      stake += h.stake;
      const pv = C.blackjackValue(h.cards).total;
      if (pv > 21) { h.payout = 0; h.result = 'bust'; }
      else if (h.natural && !dealerBJ) { h.payout = h.stake * 2.5; h.result = 'blackjack'; }
      else if (dealerBJ && !h.natural) { h.payout = 0; h.result = 'perdu'; }
      else if (dealerBJ && h.natural) { h.payout = h.stake; h.result = 'égalité'; }
      else if (dealerBust) { h.payout = h.stake * 2; h.result = 'gagné'; }
      else if (pv > dv) { h.payout = h.stake * 2; h.result = 'gagné'; }
      else if (pv === dv) { h.payout = h.stake; h.result = 'égalité'; }
      else { h.payout = 0; h.result = 'perdu'; }
      returned += h.payout;
    });

    // Assurance : payée 2:1 si le croupier a un blackjack naturel
    if (g.insurance > 0) {
      stake += g.insurance;
      returned += dealerBJ ? g.insurance * 3 : 0;
      g.msg = dealerBJ ? 'Blackjack du croupier — assurance payée 2:1' : 'Assurance perdue';
    }

    const net = returned - stake;
    const mult = stake > 0 ? returned / stake : 0;
    g.phase = 'done';
    g.hidden = false;
    g.detail = g.hands.map((h, i) => (i + 1) + ':' + C.blackjackValue(h.cards).total + ' ' + h.result).join(' · ') +
      ' · croupier ' + dv;
    if (!g.insurance) g.msg = (net > 0 ? 'Gagné ' : net < 0 ? 'Perdu ' : 'Égalité · ') + (net !== 0 ? U.fmtSigned(net) + ' J' : '');
    paint(g);
    if (net > 0) { J.Sfx.win(mult); J.haptic.win(mult); }
    else if (net < 0) { J.Sfx.lose(); J.haptic.lose(); }
    else J.Sfx.tap();
    J.Games.finish(g, mult, { detail: g.detail });
  }

  /* ------------------------------------------------- STRATÉGIE DE BASE (auto) */
  /**
   * Stratégie de base complète, sous forme PURE (cartes, carte visible du
   * croupier, droits de séparation et de doublement) : 'split' | 'double' |
   * 'hit' | 'stand'. C'est aussi la fonction utilisée par l'Auto-bet.
   */
  function decide(cards, up, canSplit, canDouble) {
    const v = C.blackjackValue(cards);
    const pairRank = cards.length === 2 && C.rank(cards[0]) === C.rank(cards[1]) ? C.rank(cards[0]) : -1;
    const v10 = (c) => C.blackjackValue([c]).total;

    // Paires (hauteur : 0 = 2 … 5 = 7, 6 = 8, 7 = 9, 8-11 = 10/V/D/R, 12 = As)
    if (canSplit) {
      if (pairRank === 12 || pairRank === 6) return 'split';                       // A,A et 8,8 : toujours
      if ((pairRank === 0 || pairRank === 1 || pairRank === 5) && up <= 7) return 'split';   // 2,2 · 3,3 · 7,7
      if (pairRank === 2 && (up === 5 || up === 6)) return 'split';                // 4,4 contre 5-6
      if (pairRank === 4 && up <= 6) return 'split';                               // 6,6 contre 2-6
      if (pairRank === 7 && up !== 7 && up !== 10 && up !== 11) return 'split';     // 9,9 sauf 7/10/As
      if (v10(cards[0]) === 10 && v10(cards[1]) === 10) return 'stand';            // 10,10 : on garde
    }
    // Main souple : un As compte 11, `other` = total sans cet As
    if (v.soft) {
      const other = v.total - 11;
      if (other >= 9) return 'stand';                                              // A,9 et mieux
      if (other === 8) return up >= 3 && up <= 6 && canDouble ? 'double' : 'stand';
      if (other === 7) return up <= 6 && canDouble ? 'double' : (up <= 8 ? 'stand' : 'hit');
      if (other >= 4) return up >= 4 && up <= 6 && canDouble ? 'double' : 'hit';
      return 'hit';
    }
    // main dure
    if (v.total >= 17) return 'stand';
    if (v.total >= 13) return up <= 6 ? 'stand' : 'hit';
    if (v.total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
    if (v.total === 11) return canDouble ? 'double' : 'hit';
    if (v.total === 10) return up <= 9 && canDouble ? 'double' : 'hit';
    if (v.total === 9) return up >= 3 && up <= 6 && canDouble ? 'double' : 'hit';
    return 'hit';
  }

  /** Applique la stratégie au jeu en cours (Auto-bet). */
  function basicStrategy(g) {
    return decide(handOf(g).cards, C.blackjackValue([g.dealer[0]]).total, canSplit(g), canDouble(g));
  }

  // Exposé pour les tests (stratégie de base vérifiable sans interface)
  J.__blackjack = { decide, DECKS, RESHUFFLE_AT };

  function autoStep(g) {
    if (!g.auto.on || g.phase !== 'player') return;
    const h = handOf(g);
    if (!h || h.done) { nextHand(g); return; }
    const v = C.blackjackValue(h.cards).total;
    switch (basicStrategy(g)) {
      case 'split': doSplit(g); break;
      case 'double': if (!doDouble(g)) stand(g); break;
      case 'stand': stand(g); break;
      default: if (v >= 21) stand(g); else hit(g, true);
    }
  }

  /* ------------------------------------------------------------------ RENDU */
  function cardsHTML(cards, hideLast) {
    return cards.map((c, i) => C.html(hideLast && i === cards.length - 1 ? null : c, i >= 2 ? 'deal' : '')).join('');
  }

  function paint(g) {
    if (!g.dealerEl) return;
    const dv = C.blackjackValue(g.dealer).total;
    const shown = g.hidden ? C.blackjackValue(g.dealer.slice(0, 1)).total : dv;

    g.dealerEl.innerHTML = cardsHTML(g.dealer, g.hidden);
    g.dealerScore.className = 'hand-badge' + (!g.hidden && dv > 21 ? ' bust' : !g.hidden ? '' : '');
    g.dealerScore.textContent = g.dealer.length
      ? (g.hidden ? shown + ' + ?' : dv + (dv > 21 ? ' · sauté' : dv === 21 && g.dealer.length === 2 ? ' · BLACKJACK' : ''))
      : '—';

    g.playerEl.innerHTML = g.hands.map((h, i) => {
      const v = C.blackjackValue(h.cards).total;
      const active = i === g.active && g.phase === 'player';
      return '<div class="bj-hand' + (active ? ' is-active' : '') + '">' +
        '<div class="cards-row">' + cardsHTML(h.cards) + '</div>' +
        '<div class="row between" style="gap:8px">' +
          '<span class="hand-badge' + (v > 21 ? ' bust' : (h.natural ? ' bj' : (h.payout > h.stake ? ' win' : ''))) + '">' +
            v + (h.natural ? ' · BJ' : '') + (h.doubled ? ' · x2' : '') + '</span>' +
          (h.result ? '<span class="sub">' + h.result + (h.payout ? ' +' + U.fmt(h.payout - h.stake) : '') + '</span>'
            : '<span class="sub">' + U.fmt(h.stake) + ' J</span>') +
        '</div>' +
        '<div class="tbl-label">' + (g.hands.length > 1 ? 'Main ' + (i + 1) : 'Ta main') + '</div>' +
      '</div>';
    }).join('');

    const v = g.hands[g.active] ? C.blackjackValue(g.hands[g.active].cards).total : 0;
    g.statusEl.innerHTML = '<b>' + (g.msg || 'Prêt') + '</b>' +
      (g.phase === 'player' ? '<span class="sub"> · total ' + v + '</span>' : '') +
      (g.insurance ? '<span class="sub"> · assurance ' + U.fmt(g.insurance) + ' J</span>' : '');
    g.shoeEl.textContent = 'Sabot ' + DECKS + ' jeux · ' + g.shoe.length + ' cartes';
    J.Games.renderActions(g);
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'blackjack',
    name: 'Blackjack',
    icon: 'blackjack',
    color: '#00b862',
    rtp: 99.5,
    category: 'classics',
    tagline: 'Battez le croupier',
    volatility: 'Volatilité faible',
    hot: true,
    rules:
      'Sabot de <b>6 jeux</b> rebattu automatiquement. But : approcher 21 sans dépasser, en battant le croupier. ' +
      'Le croupier tire jusqu\'à 17 et s\'arrête (S17).<br><br>' +
      '<b>Paiements</b> : blackjack naturel <b>3:2</b> · gain <b>1:1</b> · égalité remboursée · ' +
      'assurance <b>2:1</b> (proposée quand le croupier montre un As).<br>' +
      '<b>Actions</b> : Tirer, Rester, Doubler (une carte payée double), Séparer une paire jusqu\'à ' +
      '<b>4 mains</b> (les As séparés ne reçoivent qu\'une carte).<br><br>' +
      'Avec la stratégie de base, l\'espérance atteint <b>≈ 99,5 %</b>. ' +
      'En mode <b>Auto-bet</b>, le jeu applique cette stratégie de base à chaque main.',
    playLabel: 'Distribuer 🎴',

    state, start,
    stop(g) { g.phase = 'idle'; },

    stage(g) {
      return '' +
        '<div class="bj-stage table-felt">' +
          '<div class="bj-block">' +
            '<div class="row between"><span class="tbl-label">Croupier</span>' +
              '<span class="sub" id="bjShoe"></span></div>' +
            '<div class="cards-row bj-cards" id="bjDealer"></div>' +
            '<div class="row" style="justify-content:center"><span class="hand-badge" id="bjDealerScore">—</span></div>' +
          '</div>' +
          '<div class="bj-status" id="bjStatus"><b>Prêt</b></div>' +
          '<div class="bj-block bj-block-player">' +
            '<div class="bj-hands" id="bjPlayer"></div>' +
          '</div>' +
        '</div>';
    },

    controls(g) {
      return '<div class="sub" id="bjHint"></div>';
    },

    actions(g) {
      if (g.phase === 'insurance') {
        return [
          { label: 'Assurance ' + U.fmtK(Math.ceil(g.bet / 2)), cls: 'primary', alsoWhenBusy: true, onClick: (gg) => takeInsurance(gg) },
          { label: 'Non merci', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => declineInsurance(gg) }
        ];
      }
      if (g.phase !== 'player') {
        // Au montage (idle) comme après une main (done), le bouton principal doit
        // être cliquable : sinon la toute première main ne peut jamais démarrer.
        const ready = g.phase === 'done' || g.phase === 'idle';
        return [{
          label: ready ? 'Nouvelle main 🎴' : 'Le croupier joue…',
          cls: 'primary wide-lg grow', act: 'play', disabled: !ready
        }];
      }
      return [
        { label: 'Tirer', cls: 'primary', alsoWhenBusy: true, onClick: (gg) => hit(gg) },
        { label: 'Rester', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => stand(gg) },
        { label: g.hands[g.active] && g.hands[g.active].doubled ? 'Doublé' : 'Doubler', cls: 'ghost', alsoWhenBusy: true, disabled: !canDouble(g), onClick: (gg) => doDouble(gg) },
        { label: 'Séparer', cls: 'ghost', alsoWhenBusy: true, disabled: !canSplit(g), onClick: (gg) => doSplit(g) }
      ];
    },

    payoutHint(g) {
      if (g.phase === 'player' || g.phase === 'insurance') {
        const h = g.hands[g.active];
        return h ? U.fmt(h.stake) + ' J en jeu' + (g.hands.length > 1 ? ' · ' + g.hands.length + ' mains' : '') : '';
      }
      return 'RTP 99,5 % · BJ 3:2';
    },

    mount(g) {
      g.dealerEl = g.viewEl.querySelector('#bjDealer');
      g.dealerScore = g.viewEl.querySelector('#bjDealerScore');
      g.playerEl = g.viewEl.querySelector('#bjPlayer');
      g.statusEl = g.viewEl.querySelector('#bjStatus');
      g.shoeEl = g.viewEl.querySelector('#bjShoe');
      g.panelEl.querySelector('#bjHint').innerHTML =
        'Blackjack naturel 3:2 · gain 1:1 · assurance 2:1 · séparation jusqu\'à 4 mains. ' +
        'L\'Auto-bet joue la <b>stratégie de base</b> (RTP ≈ 99,5 %).';
      paint(g);
    }
  });
})();
