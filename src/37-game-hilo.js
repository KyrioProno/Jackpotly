/* =========================================================================
   JEU 7 — HI-LO
   Trois choix sur la carte suivante : PLUS HAUT, PLUS BAS ou ÉGALITÉ (même
   rang). Les cartes sortent d'un jeu de 52 SANS remise : les probabilités
   affichées sont donc exactes et évoluent au fil de la série.

   Règle de l'égalité (v3) : sur « plus haut » ou « plus bas », une égalité est
   NEUTRE — elle ne perd pas la mise, ne fait pas gagner et ne change pas le
   multiplicateur ; la carte tirée devient la carte courante et le joueur
   rejoue. Le pari « égalité » est un choix à part entière, avec sa propre
   probabilité et son propre paiement.

   Multiplicateurs (garantie d'équité) : chaque pari est exactement neutre en
   espérance, l'avantage maison venant du seul facteur 0,99 de départ. Pour un
   pari directionnel de probabilité de gain pW et d'égalité pT :
        mult_suivant = mult × (1 − pT) / pW
   et pour le pari égalité (probabilité pT) : mult_suivant = mult / pT.
   D'où, quel que soit le point d'encaissement : EV = 0,99 × mise → RTP 99 %.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];   // A=1 … R=13
  const SUITS = [
    { s: '♠', red: false }, { s: '♥', red: true }, { s: '♦', red: true }, { s: '♣', red: false }
  ];
  /* Multiplicateur de départ : 0,99 (99 %) — l'avantage maison de la partie.
     Chaque pari qui suit est exactement neutre en espérance. */
  const START_MULT = 0.99;

  /** Jeu neuf : 4 cartes par hauteur. */
  function freshDeck() {
    const counts = new Array(14).fill(4);
    counts[0] = 0;
    return { counts, remaining: 52 };
  }

  /** Tire une carte au hasard (distribution uniforme sur les cartes restantes). */
  function drawCard(g) {
    const idx = Math.floor(J.Fair.float() * g.deck.remaining);      // position dans le jeu restant
    let seen = 0, rank = 1;
    for (let r = 1; r <= 13; r++) {
      if (seen + g.deck.counts[r] > idx) { rank = r; break; }
      seen += g.deck.counts[r];
    }
    g.deck.counts[rank]--;
    g.deck.remaining--;
    const suit = SUITS[Math.floor(J.Fair.float() * 4)];
    return { rank, suit: suit.s, red: suit.red };
  }

  /** Cartes restantes strictement au-dessus / en dessous / au même rang. */
  function counts(g, rank) {
    let higher = 0, lower = 0;
    for (let r = rank + 1; r <= 13; r++) higher += g.deck.counts[r];
    for (let r = 1; r < rank; r++) lower += g.deck.counts[r];
    return { higher, lower, same: Math.max(0, g.deck.counts[rank]) };
  }

  /**
   * Probabilités et multiplicateurs des TROIS choix, calculés exactement sur le
   * jeu restant. Chaque pari est neutre en espérance :
   *   plus haut / plus bas : mult × (1 − pT) / pW   (pT = probabilité d'égalité)
   *   égalité              : mult / pT
   * L'égalité neutre des paris directionnels est donc « payée » par le gain,
   * au lieu d'être une perte sèche.
   */
  function choiceMath(g) {
    const c = counts(g, g.card.rank);
    const rem = g.deck.remaining;
    const pW = rem > 0 ? c.higher / rem : 0;
    const pL = rem > 0 ? c.lower / rem : 0;
    const pT = rem > 0 ? c.same / rem : 0;
    const m = g.mult;
    return {
      rem, higher: c.higher, lower: c.lower, same: c.same,
      pHigh: pW, pLow: pL, pTie: pT,
      mHigh: pW > 0 ? m * (1 - pT) / pW : 0,
      mLow: pL > 0 ? m * (1 - pT) / pL : 0,
      mTie: pT > 0 && pT < 1 ? m / pT : (pT >= 1 ? m : 0)
    };
  }

  J.Games.register({
    id: 'hilo',
    name: 'Hi-Lo',
    icon: 'hilo',
    color: '#00e37a',
    rtp: 99,
    category: 'originals',
    tagline: 'Plus haut ou plus bas',
    volatility: 'Volatilité progressive',
    hot: true,
    rules:
      'Une carte est retournée. Trois choix sur la suivante : <b>Plus haut</b>, <b>Égalité</b> ' +
      '(même rang) ou <b>Plus bas</b>. Les 52 cartes sont distribuées <b>sans remise</b> : les ' +
      'probabilités affichées sous chaque bouton sont donc exactes et évoluent au fil de la série.<br><br>' +
      '<b>Égalité neutre</b> : si tu choisis « plus haut » ou « plus bas » et que la carte a le même ' +
      'rang, tu <b>ne perds pas</b> et le <b>multiplicateur ne change pas</b> — la carte tirée devient ' +
      'la carte courante et tu rejoues. Le paiement des deux choix directionnels intègre cette ' +
      'assurance (c\'est ce qui garde un RTP exact de 99 %).<br><br>' +
      '<b>Pari Égalité</b> : tu paries explicitement sur une carte de même rang. Sa probabilité est ' +
      'faible, son paiement élevé — la même équité que les deux autres choix.<br><br>' +
      'Tu peux <b>encaisser à tout moment</b> après une première prédiction. ' +
      'En mode Auto-bet, le jeu prend systématiquement l\'option la plus probable avant d\'encaisser.',
    playLabel: 'Distribuer 🃏',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      g.deck = freshDeck();
      g.card = null;
      g.mult = START_MULT;        // 0,99 : le seul avantage maison de la partie
      g.steps = 0;
      g.chain = [];
      g.phase = 'idle';           // idle | guess
      g.autoSteps = g.autoSteps || 1;
      g.lastOutcome = null;
      g.tieCount = 0;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="row between"><span class="bet-label">Prédictions auto</span>' +
          '<span class="mono up" id="hlStepsLbl">' + g.autoSteps + '</span></div>' +
        '<input type="range" id="hlSteps" min="1" max="9" step="1" value="' + g.autoSteps + '" class="thin mt-s">' +
        '<div class="sub mt-s">Nombre de prédictions tentées automatiquement par partie en mode Auto-bet ' +
        '(le jeu choisit toujours l\'option la plus probable).</div>';
    },

    payoutHint(g) {
      const bet = g.ticket ? g.ticket.bet : g.bet;
      if (g.steps > 0) {
        return 'Mise <b>' + U.fmt(bet) + ' J</b> · encaisser maintenant = <b class="up">' + U.fmt(Math.round(bet * g.mult)) +
          ' J</b> (' + U.fmtMult(g.mult) + ')' + (g.tieCount ? ' · ' + g.tieCount + ' égalité(s) neutre(s)' : '');
      }
      return 'Mise <b>' + U.fmt(bet) + ' J</b> · multiplicateur de départ <b>' + U.fmtMult(START_MULT) + '</b> — encaisse quand tu veux';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="hilo-stage">' +
        '<div class="hilo-card" id="hlCard"><div class="rank">—</div><div class="mid">🂠</div><div class="suit">—</div></div>' +
        '<div class="hilo-history" id="hlChain"></div>' +
        '<div class="hilo-choices" id="hlChoices">' +
          '<button class="hilo-choice up" id="hlHigh" disabled><span>▲ Plus haut</span><b id="hlHighMult">—</b><small id="hlHighP">—</small></button>' +
          '<button class="hilo-choice tie" id="hlTie" disabled><span>= Égalité</span><b id="hlTieMult">—</b><small id="hlTieP">—</small></button>' +
          '<button class="hilo-choice down" id="hlLow" disabled><span>▼ Plus bas</span><b id="hlLowMult">—</b><small id="hlLowP">—</small></button>' +
        '</div>' +
        '<div class="hilo-deck" id="hlDeck">52 cartes restantes</div>' +
        '<div class="sub center" id="hlMsg">Distribue une carte pour commencer</div>' +
      '</div>';
    },

    mount(g) {
      g.cardEl = document.getElementById('hlCard');
      g.chainEl = document.getElementById('hlChain');
      g.deckEl = document.getElementById('hlDeck');
      g.msgEl = document.getElementById('hlMsg');
      g.highBtn = document.getElementById('hlHigh');
      g.lowBtn = document.getElementById('hlLow');
      g.tieBtn = document.getElementById('hlTie');

      g.highBtn.onclick = () => guess(g, 'higher');
      g.lowBtn.onclick = () => guess(g, 'lower');
      g.tieBtn.onclick = () => guess(g, 'tie');

      const range = g.panelEl.querySelector('#hlSteps');
      range.oninput = () => {
        g.autoSteps = U.clamp(parseInt(range.value, 10) || 1, 1, 9);
        const lbl = g.panelEl.querySelector('#hlStepsLbl');
        if (lbl) lbl.textContent = g.autoSteps;
      };

      renderCard(g);
      renderChoices(g);
      renderDeck(g);
    },

    /* ---------------------------------------------------------- BOUTONS */
    actions(g) {
      if (g.phase === 'guess' && g.steps > 0) {
        const bet = g.ticket ? g.ticket.bet : g.bet;
        const total = Math.round(bet * g.mult);
        return [
          { label: '💰 Encaisser ' + U.fmt(total) + ' J (' + U.fmtMult(g.mult) + ' · +' + U.fmt(Math.max(0, total - bet)) + ')',
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true }
        ];
      }
      if (g.phase === 'guess') {
        return [{ label: 'Choisis plus haut, égalité ou plus bas', cls: 'ghost wide-lg grow', act: 'none', disabled: true }];
      }
      return [{ label: g.auto.on ? 'Série en cours…' : 'Distribuer 🃏', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      if (g.deck.remaining < 6) {                 // jeu presque épuisé : on rebat
        g.deck = freshDeck();
        J.toast('🃏 Jeu rebattu', 'ok');
      }
      g.mult = START_MULT;
      g.steps = 0;
      g.chain = [];
      g.tieCount = 0;
      g.card = drawCard(g);
      g.phase = 'guess';
      g.autoLeft = g.autoSteps;
      renderAll(g);
      J.Sfx.bet();
      g.msgEl.innerHTML = 'À toi de prédire : <b class="up">plus haut</b>, <b class="tie">égalité</b> ou <b class="down">plus bas</b> ?' +
        '<br><span class="sub">Une égalité sur plus haut / plus bas est neutre : tu rejoues sans rien perdre.</span>';

      // Mode auto : on enchaîne les prédictions les plus probables
      if (g.auto.on) autoGuess(g);
    },

    cashout(g) { return cashout(g); }
  });

  /* ------------------------------------------------------------- ÉCRANS */
  /** Tout ce qui dépend de la carte, du multiplicateur et des choix. */
  function renderAll(g) {
    renderCard(g); renderDeck(g); renderChain(g); renderChoices(g);
    J.Games.updateHints(g);
    J.Games.renderActions(g);
  }

  function renderCard(g) {
    const c = g.card;
    if (!c) return;
    g.cardEl.className = 'hilo-card' + (c.red ? ' red' : '');
    g.cardEl.innerHTML =
      '<div class="rank">' + RANKS[c.rank] + '</div>' +
      '<div class="mid">' + c.suit + '</div>' +
      '<div class="suit">' + c.suit + '</div>';
  }

  function renderDeck(g) {
    if (!g.deckEl) return;
    const bet = g.ticket ? g.ticket.bet : g.bet;
    const gain = Math.round(bet * g.mult) - bet;
    g.deckEl.innerHTML = g.deck.remaining + ' cartes restantes · <b>mise ' + U.fmt(bet) + ' J</b>' +
      ' · multiplicateur <b>' + U.fmtMult(g.mult) + '</b>' +
      (g.steps > 0 ? ' · encaisser = <b class="up">' + U.fmt(Math.round(bet * g.mult)) + ' J</b> (+' + U.fmt(Math.max(0, gain)) + ')' : '');
  }

  function renderChain(g) {
    if (!g.chainEl) return;
    g.chainEl.innerHTML = g.chain.map((c) =>
      '<span class="hilo-mini' + (c.red ? ' red' : '') + '">' + RANKS[c.rank] + c.suit + '</span>').join('');
  }

  /** Met à jour les trois choix avec probabilités et multiplicateurs exacts. */
  function renderChoices(g) {
    if (!g.card || !g.highBtn) return;
    const m = choiceMath(g);
    const live = g.phase === 'guess';

    g.highBtn.disabled = !(m.pHigh > 0) || !live;
    g.lowBtn.disabled = !(m.pLow > 0) || !live;
    g.tieBtn.disabled = !(m.pTie > 0) || m.pTie >= 1 || !live;

    const set = (btn, p, mult, idM, idP) => {
      const elM = document.getElementById(idM), elP = document.getElementById(idP);
      if (!elM || !elP) return;
      elM.textContent = p > 0 ? U.fmtMult(mult) : '—';
      elP.textContent = p > 0
        ? U.fmtPct(p * 100, 1) + ' · ' + Math.round(m.rem * p) + ' carte' + (Math.round(m.rem * p) > 1 ? 's' : '')
        : 'aucune carte';
    };
    set(g.highBtn, m.pHigh, m.mHigh, 'hlHighMult', 'hlHighP');
    set(g.lowBtn, m.pLow, m.mLow, 'hlLowMult', 'hlLowP');
    set(g.tieBtn, m.pTie, m.mTie, 'hlTieMult', 'hlTieP');

    /* Choix les plus probables mis en avant : le joueur voit d'un coup d'œil
       où se trouve la meilleure chance — l'information remplace la décoration. */
    const best = Math.max(m.pHigh, m.pLow, m.pTie);
    g.highBtn.classList.toggle('is-best', live && m.pHigh > 0 && m.pHigh === best);
    g.lowBtn.classList.toggle('is-best', live && m.pLow > 0 && m.pLow === best);
    g.tieBtn.classList.toggle('is-best', live && m.pTie > 0 && m.pTie === best);
  }

  /* -------------------------------------------------------------- JOUER */
  /**
   * Une prédiction : 'higher', 'lower' ou 'tie'.
   * · gagné  → le multiplicateur passe à sa valeur exacte et la série continue ;
   * · égalité sur un pari directionnel → NEUTRE : mise conservée, multiplicateur
   *   inchangé, la carte tirée devient la carte courante ;
   * · perdu  → la manche est réglée à 0.
   */
  function guess(g, dir, auto) {
    if (!g.ticket || g.phase !== 'guess') return;
    const m = choiceMath(g);
    const p = dir === 'higher' ? m.pHigh : dir === 'lower' ? m.pLow : m.pTie;
    if (!(p > 0) || (dir === 'tie' && p >= 1)) {
      if (!auto) J.toast(dir === 'tie' ? 'Aucune carte de même rang en jeu' : 'Aucune carte dans ce sens', 'ko');
      return;
    }
    const prev = g.card;
    const next = drawCard(g);
    g.chain.push(prev);
    g.card = next;
    const tie = next.rank === prev.rank;
    const won = dir === 'tie' ? tie : dir === 'higher' ? next.rank > prev.rank : next.rank < prev.rank;

    if (won) {
      /* Paiement exact du choix joué : l'égalité neutre des paris directionnels
         est intégrée ici (facteur 1 − pT), et le pari égalité paie 1 / pT. */
      g.mult = dir === 'tie' ? m.mTie : (dir === 'higher' ? m.mHigh : m.mLow);
      g.steps++;
      if (tie && dir !== 'tie') g.tieCount = (g.tieCount || 0) + 1;
      J.Sfx.reveal(true); J.haptic.tap();
      g.msgEl.innerHTML = '✅ <b class="up">Bien vu</b> — ' + U.fmtMult(g.mult) +
        ' · encaissement possible : ' + U.fmt(Math.round(g.ticket.bet * g.mult)) + ' J';
    } else if (tie) {
      /* Égalité sur un pari directionnel : neutre. Rien n'est perdu, rien n'est
         gagné, le multiplicateur ne bouge pas — la carte tirée devient la carte
         courante et le joueur rejoue. */
      g.tieCount = (g.tieCount || 0) + 1;
      J.Sfx.tap(); J.haptic.tap();
      g.msgEl.innerHTML = '⚪ <b class="tie">Égalité sur ' + (dir === 'higher' ? 'plus haut' : 'plus bas') +
        '</b> — mise conservée, multiplicateur inchangé (' + U.fmtMult(g.mult) + ')';
      if (auto && g.auto.on) { renderAll(g); J.Games.schedule(g, () => autoGuess(g), 320); return; }
    } else {
      /* Manche perdue : on remet TOUT l'état de série à zéro avant le rendu,
         sinon l'interface continuerait d'annoncer un encaissement possible
         (multiplicateur et nombre de prédictions périmés) sur une manche
         déjà réglée. Le texte, lui, garde la trace de ce qui a été tenté. */
      const steps = g.steps, ties = g.tieCount || 0;
      g.phase = 'idle';
      g.steps = 0;
      g.mult = START_MULT;
      g.tieCount = 0;
      renderAll(g);
      J.Sfx.lose(); J.haptic.lose(); J.shake(g.stageEl);
      g.msgEl.innerHTML = '❌ <b class="down">Perdu</b> — carte ' + (dir === 'higher' ? 'plus basse' : dir === 'lower' ? 'plus haute' : 'd’un autre rang') + ' (' + RANKS[next.rank] + ')' +
        (steps ? '<br><span class="sub">' + steps + ' prédiction(s) juste(s) avant la perte' + (ties ? ' · ' + ties + ' égalité(s) neutre(s)' : '') + '</span>' : '');
      J.Games.finish(g, 0, { detail: 'perdu après ' + steps + ' prédiction(s)' + (ties ? ' · ' + ties + ' égalité(s) neutre(s)' : '') });
      return;
    }

    /* Jeu épuisé : plus aucune carte à comparer. Si le joueur a déjà gagné
       quelque chose, on encaisse pour lui (jamais de manche bloquée, jamais de
       gain perdu) ; sinon on rebat et la série continue. */
    if (g.deck.remaining <= 0 && g.phase === 'guess') {
      if (g.steps > 0) {
        g.msgEl.innerHTML += '<br><span class="sub">Jeu épuisé : encaissement automatique.</span>';
        J.Games.schedule(g, () => cashout(g), 260);
        return;
      }
      g.deck = freshDeck();
      g.card = drawCard(g);
      J.toast('🃏 Jeu rebattu', 'ok');
    }

    renderAll(g);
    if (auto && g.auto.on) autoGuess(g);
  }

  /** Enchaîne automatiquement les prédictions les plus probables (mode auto). */
  function autoGuess(g) {
    if (!g.auto.on) return;
    if (g.autoLeft <= 0) { cashout(g); return; }
    if (!g.ticket) return;
    const m = choiceMath(g);
    const pHigh = m.pHigh, pLow = m.pLow;
    if (pHigh <= 0 && pLow <= 0) { cashout(g); return; }
    const dir = pHigh >= pLow ? 'higher' : 'lower';
    const p = Math.max(pHigh, pLow);
    g.autoLeft--;
    J.Games.schedule(g, () => { if (g.ticket) guess(g, dir, true); }, Math.max(90, (g.auto.speed || 400) * 0.6));
  }

  /** Encaisse le multiplicateur courant — une seule fois par manche. */
  function cashout(g) {
    if (!g || !g.ticket || g.steps <= 0) return;
    const ticket = g.ticket;                      // le règlement consomme le ticket
    const mult = g.mult;
    const payout = Math.round(ticket.bet * mult);
    const steps = g.steps, ties = g.tieCount || 0;
    g.phase = 'idle';
    g.steps = 0;
    g.mult = START_MULT;
    g.tieCount = 0;
    renderAll(g);
    g.msgEl.innerHTML = '💰 <b class="up">Encaissé</b> à ' + U.fmtMult(mult) + ' après ' + steps + ' prédiction(s)' +
      (ties ? ' et ' + ties + ' égalité(s) neutre(s)' : '') + ' — ' + U.fmt(payout) + ' J';
    J.FX.celebrate({ mult: mult, payout: payout, el: g.cardEl });
    if (mult >= 8) J.Live.playerWin('hilo', mult, payout);
    J.Games.finish(g, mult, { detail: steps + ' prédiction(s) juste(s)' + (ties ? ' · ' + ties + ' égalité(s) neutre(s)' : ''), celebrated: true });
  }
})();
