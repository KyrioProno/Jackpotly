/* =========================================================================
   JEU 16 — TEXAS HOLD'EM (tête-à-tête contre un bot)
   Une main de poker complète : blinds, relances, tapis, quatre tours
   d'enchères (préflop, flop, turn, river) et abattage des cartes.

   Économie : la mise de la manche est le tapis de départ des deux joueurs.
   Le vainqueur empoche le pot moins une <b>commission de table de 2 %</b>
   (plafonnée à 500 jetons) — c'est la seule marge du jeu, comme le rake d'un
   vrai casino, et elle ramène le retour moyen autour de 98 %.
   Les jetons non engagés sont toujours rendus : se passer au préflop ne coûte
   que la blinde déjà postée.

   Le bot joue une équité calculée par Monte-Carlo (250 tirages) face à une
   main au hasard, comparée aux cotes du pot : passer, suivre ou relancer.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const C = J.Cards;

  const RAKE = 0.02;                 // commission de table
  const RAKE_CAP = 500;              // plafond de commission par main
  const MC_SAMPLES = 250;            // tirages Monte-Carlo pour l'équité

  /* ------------------------------------------------------------------ ÉTAT */
  function state(g) {
    g.phase = 'idle';                // idle | preflop | flop | turn | river | showdown | done
    g.myHole = [];
    g.botHole = [];
    g.board = [];
    g.deck = [];
    g.pot = 0;
    g.myComm = 0; g.botComm = 0;     // engagé dans le pot (total main)
    g.myBet = 0; g.botBet = 0;       // engagé sur le tour courant
    g.actedMe = false; g.actedBot = false;
    g.toAct = 'me';
    g.lastRaise = 0;
    g.raiseTo = 0;
    g.raiseStep = 0;
    g.msg = '';
    g.detail = '';
    g.logLines = [];
    g.showdown = null;
    g.handNo = (g.handNo || 0);
    g.stats = g.stats || { rounds: 0, wagered: 0, net: 0, best: 0 };
  }

  const stack = (g) => g.ticket ? g.ticket.bet : g.bet;
  const left = (who, g) => stack(g) - (who === 'me' ? g.myComm : g.botComm);
  const pot = (g) => g.myComm + g.botComm;
  const toCall = (g) => Math.max(0, g.botBet - g.myBet);
  const botToCall = (g) => Math.max(0, g.myBet - g.botBet);

  function log(g, txt) {
    g.logLines.unshift(txt);
    if (g.logLines.length > 4) g.logLines.pop();
  }

  /* ------------------------------------------------------------ DÉMARRAGE */
  function start(g) {
    const s = stack(g);
    g.deck = C.shuffle(C.deck());
    g.myHole = [g.deck.pop(), g.deck.pop()];
    g.botHole = [g.deck.pop(), g.deck.pop()];
    g.board = [];
    g.pot = 0; g.myComm = 0; g.botComm = 0;
    g.myBet = 0; g.botBet = 0;
    g.actedMe = false; g.actedBot = false;
    g.lastRaise = 0;
    g.showdown = null;
    g.logLines = [];
    g.msg = '';
    g.detail = '';
    g.handNo++;

    // blinds : 5 % et 10 % du tapis, le joueur est petite blinde une main sur deux
    const bb = Math.max(2, Math.round(s / 10));
    const sb = Math.max(1, Math.round(bb / 2));
    const meSB = g.handNo % 2 === 1;
    g.raiseStep = bb;
    commit(g, meSB ? 'me' : 'bot', sb, 'petite blinde');
    commit(g, meSB ? 'bot' : 'me', bb, 'grosse blinde');
    g.myBet = meSB ? sb : bb;
    g.botBet = meSB ? bb : sb;
    g.actedMe = meSB ? false : true;      // la grosse blinde n'a pas encore parlé
    g.actedBot = meSB ? true : false;
    g.toAct = meSB ? 'me' : 'bot';
    g.lastRaise = bb;
    g.raiseTo = Math.min(stack(g), g.lastRaise * 2);
    g.phase = 'preflop';
    log(g, 'Blinds ' + sb + ' / ' + bb + ' — ' + (meSB ? 'tu es petite blinde' : 'tu es grosse blinde'));
    paint(g);

    if (g.auto.on) J.Games.schedule(g, () => autoPlay(g), 420);
    else if (!meSB) botTurn(g);
  }

  function commit(g, who, amount, why) {
    const max = left(who, g);
    const amt = Math.max(0, Math.min(amount, max));
    if (who === 'me') { g.myComm += amt; g.myBet += amt; }
    else { g.botComm += amt; g.botBet += amt; }
    if (why && amt > 0) log(g, (who === 'me' ? 'Toi' : 'Bot') + ' : ' + why + ' ' + amt + ' J');
    return amt;
  }

  /* ------------------------------------------------------------- DÉCISIONS */
  function streetDone(g) {
    return g.myBet === g.botBet && g.actedMe && g.actedBot;
  }

  function nextStreet(g) {
    g.myBet = 0; g.botBet = 0;
    g.actedMe = false; g.actedBot = false;
    g.toAct = 'bot';                       // le bot parle en premier après le flop
    if (g.phase === 'preflop') { g.board.push(g.deck.pop(), g.deck.pop(), g.deck.pop()); g.phase = 'flop'; }
    else if (g.phase === 'flop') { g.board.push(g.deck.pop()); g.phase = 'turn'; }
    else if (g.phase === 'turn') { g.board.push(g.deck.pop()); g.phase = 'river'; }
    else { showdown(g); return; }
    g.msg = g.phase === 'flop' ? 'Flop' : g.phase === 'turn' ? 'Turn' : 'River';
    J.Sfx.reveal(true);
    paint(g);
    J.Games.schedule(g, () => (g.auto.on ? autoPlay(g) : botTurn(g)), 620);
  }

  function fold(g, who) {
    if (who === 'me') { log(g, 'Tu te passes'); g.msg = 'Tu passes'; J.Sfx.lose(); }
    else { log(g, 'Le bot se passe'); g.msg = 'Le bot se passe — tu remportes le pot'; J.Sfx.win(2); }
    g.showdown = { foldedBy: who };
    endHand(g);
  }

  function meAct(g, kind, amount) {
    if (g.phase === 'idle' || g.phase === 'done' || g.toAct !== 'me') return;
    const need = toCall(g);
    if (kind === 'fold') { g.actedMe = true; fold(g, 'me'); return; }
    if (kind === 'call') {
      const paid = commit(g, 'me', need, need ? 'suit' : 'check');
      g.actedMe = true;
      if (!need) log(g, 'Tu checkes');
      if (paid < need) log(g, 'Tapis !');
      J.Sfx.chip();
    } else if (kind === 'raise') {
      let target = Math.max(g.myBet + need + g.raiseStep, amount || g.raiseTo);
      target = Math.min(target, g.myBet + left('me', g));            // plafonné au tapis
      const paid = commit(g, 'me', target - g.myBet, 'relance à ' + target);
      g.lastRaise = Math.max(g.raiseStep, target - g.botBet);
      g.actedMe = true; g.actedBot = false;
      J.Sfx.bet();
      if (paid <= 0) { g.actedMe = true; }
    }
    g.toAct = 'bot';
    paint(g);
    if (streetDone(g)) J.Games.schedule(g, () => nextStreet(g), 500);
    else J.Games.schedule(g, () => (g.auto.on ? autoPlay(g) : botTurn(g)), 520);
  }

  /* ---------------------------------------------------------- BOT / AUTO */
  /** Équité Monte-Carlo d'une main face à une main au hasard. */
  function equityOf(hole, board) {
    let win = 0, tie = 0;
    const full = [];
    for (let c = 0; c < 52; c++) if (hole.indexOf(c) < 0 && board.indexOf(c) < 0) full.push(c);
    const missing = 5 - board.length;          // cartes de tapis à venir
    const toDraw = missing + 2;                // + les 2 cartes du bot
    for (let s = 0; s < MC_SAMPLES; s++) {
      // tirage sans remise : on échange avec la fin d'une COPIE du paquet
      const deck = full.slice();
      let n = deck.length;
      const picks = [];
      for (let k = 0; k < toDraw; k++) {
        const idx = J.Fair.int(0, n - 1);
        const t = deck[idx];
        deck[idx] = deck[n - 1];
        picks.push(t);
        n--;
      }
      const extra = picks.slice(0, missing);          // tapis complété
      const oppHole = picks.slice(missing);           // main du bot
      const v1 = C.evalBest(hole.concat(board, extra)).score;
      const v2 = C.evalBest(oppHole.concat(board, extra)).score;
      if (v1 > v2) win++; else if (v1 === v2) tie++;
    }
    return (win + tie / 2) / MC_SAMPLES;
  }

  function botDecide(g) {
    const eq = equityOf(g.botHole, g.board);
    const need = botToCall(g);
    const p = pot(g);
    const rnd = J.Fair.float();
    if (need <= 0) {
      if (eq > 0.78 && rnd < 0.75) return { kind: 'raise', amount: g.botBet + Math.max(g.raiseStep, Math.round(p * 0.7)) };
      if (eq > 0.6 && rnd < 0.4) return { kind: 'raise', amount: g.botBet + Math.max(g.raiseStep, Math.round(p * 0.5)) };
      return { kind: 'call' };                       // check
    }
    const odds = need / (p + need);
    if (eq > 0.74 && rnd < 0.6) return { kind: 'raise', amount: g.myBet + Math.max(g.raiseStep, Math.round(need * 2.5)) };
    if (eq > odds + 0.12) return { kind: 'call' };
    if (eq > odds + 0.02 && rnd < 0.35) return { kind: 'call' };
    if (rnd < 0.06) return { kind: 'call' };         // bluff attrapé
    return { kind: 'fold' };
  }

  function botTurn(g) {
    if (g.phase === 'idle' || g.phase === 'done' || g.toAct !== 'bot') return;
    const d = botDecide(g);
    const need = botToCall(g);
    if (d.kind === 'fold') { g.actedBot = true; fold(g, 'bot'); return; }
    if (d.kind === 'raise') {
      const paid = commit(g, 'bot', d.amount - g.botBet, 'relance à ' + (g.botBet + (d.amount - g.botBet)));
      g.lastRaise = Math.max(g.raiseStep, (g.botBet) - g.myBet);
      g.actedBot = true; g.actedMe = false;
      if (paid > 0) J.Sfx.chip();
    } else {
      commit(g, 'bot', need, need ? 'suit' : 'check');
      g.actedBot = true;
    }
    g.toAct = 'me';
    paint(g);
    if (streetDone(g)) J.Games.schedule(g, () => nextStreet(g), 620);
    else if (g.auto.on) J.Games.schedule(g, () => autoPlay(g), 420);
  }

  /** Auto-bet : le joueur est joué par la même logique que le bot. */
  function autoPlay(g) {
    if (!g.auto.on || g.toAct !== 'me' || g.phase === 'idle' || g.phase === 'done') return;
    const eq = equityOf(g.myHole, g.board);
    const need = toCall(g);
    const p = pot(g);
    const rnd = J.Fair.float();
    if (need <= 0) {
      if (eq > 0.8 && rnd < 0.7) meAct(g, 'raise', g.myBet + Math.max(g.raiseStep, Math.round(p * 0.7)));
      else meAct(g, 'call');
      return;
    }
    const odds = need / (p + need);
    if (eq > 0.76 && rnd < 0.55) meAct(g, 'raise', g.botBet + Math.max(g.raiseStep, Math.round(need * 2.5)));
    else if (eq > odds + 0.1) meAct(g, 'call');
    else if (eq > odds && rnd < 0.3) meAct(g, 'call');
    else meAct(g, 'fold');
  }

  /* ----------------------------------------------------------- ABATTAGE */
  function showdown(g) {
    g.phase = 'showdown';
    const me = C.evalBest(g.myHole.concat(g.board));
    const bot = C.evalBest(g.botHole.concat(g.board));
    g.showdown = { me, bot, winner: me.score > bot.score ? 'me' : bot.score > me.score ? 'bot' : 'tie' };
    log(g, 'Abattage : ' + C.handName(me.score) + ' contre ' + C.handName(bot.score));
    g.msg = g.showdown.winner === 'me' ? 'Tu gagnes au showdown !'
      : g.showdown.winner === 'bot' ? 'Le bot gagne au showdown' : 'Égalité — pot partagé';
    J.Sfx.reveal(true);
    paint(g);
    J.Games.schedule(g, () => endHand(g), 1100);
  }

  function endHand(g) {
    const s = stack(g);
    const p = pot(g);
    const myLeft = s - g.myComm;
    const sd = g.showdown || {};
    let win = 0;
    if (sd.foldedBy === 'bot') win = 1;
    else if (sd.foldedBy === 'me') win = 0;
    else if (sd.winner === 'me') win = 1;
    else if (sd.winner === 'tie') win = 0.5;

    let payout = myLeft + (win > 0 ? p * win : 0);
    let rake = 0;
    if (win > 0) {
      rake = Math.min(RAKE_CAP, Math.round(p * win * RAKE));
      payout -= rake;
    }
    payout = Math.max(0, Math.round(payout));
    const mult = s > 0 ? payout / s : 0;
    g.phase = 'done';
    g.detail = 'Pot ' + U.fmt(p) + ' J · ta mise ' + U.fmt(g.myComm) + ' J' +
      (rake ? ' · commission ' + U.fmt(rake) + ' J (2 %)' : '') +
      (g.showdown && g.showdown.me ? ' · ' + C.handName(g.showdown.me.score) : '') +
      (g.showdown && g.showdown.bot ? ' vs ' + C.handName(g.showdown.bot.score) : '');
    paint(g);
    J.Games.finish(g, mult, { detail: g.detail });
  }

  /* ------------------------------------------------------------------ RENDU */
  function paint(g) {
    if (!g.boardEl) return;
    const sd = g.showdown || {};
    g.botEl.innerHTML = g.botHole.map((c, i) =>
      C.html(g.phase === 'showdown' || g.phase === 'done' ? c : null, i >= 2 ? 'deal' : '')).join('');
    g.meEl.innerHTML = g.myHole.map((c) => C.html(c)).join('');
    g.boardEl.innerHTML = [0, 1, 2, 3, 4].map((i) =>
      g.board[i] != null ? C.html(g.board[i], 'deal') : '<span class="pcard back dim"></span>').join('');

    g.potEl.innerHTML = '<b class="mono">' + U.fmt(pot(g)) + ' J</b> au pot' +
      (g.phase === 'preflop' || g.phase === 'idle' ? '' : ' · ' + (g.phase === 'showdown' ? 'abattage' : g.phase));
    g.stacksEl.innerHTML =
      '<span class="pk-stack"><i>Toi</i> <b class="mono">' + U.fmt(left('me', g)) + '</b></span>' +
      '<span class="pk-stack"><i>Bot</i> <b class="mono">' + U.fmt(left('bot', g)) + '</b></span>' +
      '<span class="pk-stack"><i>Blinde</i> <b class="mono">' + U.fmt(g.raiseStep) + '</b></span>';

    const need = toCall(g);
    g.stateEl.innerHTML = '<b>' + (g.msg || (g.toAct === 'me' ? 'À toi de parler' : 'Le bot réfléchit…')) + '</b>' +
      (g.phase !== 'idle' && g.phase !== 'done'
        ? '<span class="sub"> · ' + (need > 0 ? 'à suivre : ' + U.fmt(need) + ' J' : 'tu peux checker') +
          ' · tapis ' + U.fmt(left('me', g)) + ' J</span>'
        : '') +
      (g.detail && g.phase === 'done' ? '<div class="sub mt-s">' + g.detail + '</div>' : '');

    g.logEl.innerHTML = g.logLines.map((l, i) => '<div class="pk-log-line' + (i ? ' old' : '') + '">' + l + '</div>').join('');

    if (g.raiseRow) {
      const p = Math.max(1, pot(g));
      g.raiseRow.querySelectorAll('[data-raise]').forEach((b) => {
        const k = b.dataset.raise;
        const v = k === 'half' ? Math.round(p * 0.5) : k === 'pot' ? p : k === 'all' ? stack(g) : parseInt(k, 10);
        b.disabled = g.toAct !== 'me' || g.phase === 'done' || g.phase === 'idle';
        void v;
      });
    }
    J.Games.renderActions(g);
  }

  /* ------------------------------------------------------------------- JEU */
  J.Games.register({
    id: 'poker',
    name: 'Texas Hold\'em',
    icon: 'poker',
    color: '#34d399',
    rtp: 98,
    category: 'classics',
    tagline: 'Tête-à-tête contre un bot',
    volatility: 'Volatilité élevée',
    hot: true,
    rules:
      'Texas Hold\'em <b>en tête-à-tête</b> contre un bot. Ta mise de manche est ton <b>tapis de départ</b> ' +
      '(le bot a le même). Blinds de 5 % et 10 %, quatre tours d\'enchères : préflop, flop, turn, river.<br>' +
      '<b>Actions</b> : Se passer, Checker/Suivre, Relancer (½ pot, pot, ×2, tapis). ' +
      'Le bot joue une équité calculée par Monte-Carlo comparée aux cotes du pot.<br><br>' +
      'À l\'abattage, la meilleure main de 5 cartes parmi 7 gagne. Le vainqueur paie une ' +
      '<b>commission de table de 2 %</b> du pot (plafond 500 J) : c\'est la seule marge du jeu, ' +
      'ce qui ramène le retour moyen autour de <b>98 %</b> — un bon joueur la surpasse largement. ' +
      'Les jetons non engagés te sont toujours rendus : se passer au préflop ne coûte que la blinde.',
    playLabel: 'Nouvelle main ♠',

    state, start,
    stop(g) { g.phase = 'idle'; },

    stage(g) {
      return '' +
        '<div class="pk-stage table-felt">' +
          '<div class="pk-seat">' +
            '<div class="row between"><span class="tbl-label">Bot</span><span class="sub" id="pkStacks"></span></div>' +
            '<div class="cards-row pk-cards" id="pkBot"></div>' +
          '</div>' +
          '<div class="pk-mid">' +
            '<div class="pk-pot" id="pkPot"></div>' +
            '<div class="cards-row pk-board" id="pkBoard"></div>' +
          '</div>' +
          '<div class="pk-seat me">' +
            '<div class="tbl-label">Ta main</div>' +
            '<div class="cards-row pk-cards" id="pkMe"></div>' +
          '</div>' +
          '<div class="pk-state" id="pkState"></div>' +
          '<div class="pk-log" id="pkLog"></div>' +
        '</div>';
    },

    controls(g) {
      return '' +
        '<div class="row between"><span class="bet-label">Relancer à</span>' +
          '<span class="sub">pot ' + U.fmtK(pot(g)) + ' J · tapis ' + U.fmtK(left('me', g)) + ' J</span></div>' +
        '<div class="chips mt-s" id="pkRaise">' +
          '<button class="chip" data-raise="half">½ pot</button>' +
          '<button class="chip" data-raise="pot">Pot</button>' +
          '<button class="chip" data-raise="2">×2 relance</button>' +
          '<button class="chip" data-raise="all">Tapis</button>' +
        '</div>' +
        '<div class="sub mt-s">Commission de table 2 % du pot (500 J max). ' +
        'Le bot évalue son équité sur ' + MC_SAMPLES + ' tirages Monte-Carlo.</div>';
    },

    actions(g) {
      if (g.phase === 'idle' || g.phase === 'done') {
        return [{ label: 'Nouvelle main · ' + U.fmtK(g.bet) + ' J ♠', cls: 'primary wide-lg grow', act: 'play' }];
      }
      if (g.toAct !== 'me' || g.phase === 'showdown') {
        return [
          { label: g.phase === 'showdown' ? 'Abattage…' : 'Le bot réfléchit…', cls: 'primary wide-lg grow', disabled: true },
          { label: 'Se passer', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => meAct(gg, 'fold') }
        ];
      }
      const need = toCall(g);
      return [
        { label: 'Se passer', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => meAct(gg, 'fold') },
        { label: need > 0 ? 'Suivre ' + U.fmtK(need) : 'Checker', cls: 'ghost', alsoWhenBusy: true, onClick: (gg) => meAct(gg, 'call') },
        { label: 'Relancer', cls: 'primary', alsoWhenBusy: true, disabled: left('me', g) <= need, onClick: (gg) => meAct(gg, 'raise', gg.raiseTo) },
        { label: 'Tapis', cls: 'ghost', alsoWhenBusy: true, disabled: left('me', g) <= need, onClick: (gg) => meAct(gg, 'raise', stack(gg)) }
      ];
    },

    payoutHint(g) {
      return 'Commission 2 % · RTP ≈ 98 %';
    },

    mount(g) {
      g.botEl = g.viewEl.querySelector('#pkBot');
      g.meEl = g.viewEl.querySelector('#pkMe');
      g.boardEl = g.viewEl.querySelector('#pkBoard');
      g.potEl = g.viewEl.querySelector('#pkPot');
      g.stacksEl = g.viewEl.querySelector('#pkStacks');
      g.stateEl = g.viewEl.querySelector('#pkState');
      g.logEl = g.viewEl.querySelector('#pkLog');
      g.raiseRow = g.panelEl.querySelector('#pkRaise');

      g.raiseRow.querySelectorAll('[data-raise]').forEach((b) => {
        b.onclick = () => {
          if (g.toAct !== 'me' || g.phase === 'idle' || g.phase === 'done') return;
          const p = Math.max(1, pot(g));
          const base = g.botBet;
          const k = b.dataset.raise;
          const target = k === 'half' ? base + Math.round(p * 0.5)
            : k === 'pot' ? base + p
              : k === '2' ? base + Math.max(g.raiseStep, (base - g.myBet) * 2)
                : stack(g);
          g.raiseTo = Math.min(stack(g), Math.max(base + g.raiseStep, target));
          J.Sfx.click(); J.haptic.tap();
          J.toast('Relance réglée à ' + U.fmt(g.raiseTo) + ' J', '');
          paint(g);
        };
      });
      paint(g);
    }
  });

  /* Exposé pour les tests : équité Monte-Carlo et détermination du vainqueur. */
  J.__poker = { equityOf, RAKE, RAKE_CAP, MC_SAMPLES };
})();
