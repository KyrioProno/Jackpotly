/* =========================================================================
   JEU 7 — HI-LO
   Devine si la carte suivante est plus haute ou plus basse. Les cartes sont
   tirées d'un jeu de 52 cartes SANS remise : les probabilités affichées sont
   donc exactes (elles évoluent au fil de la série).

   Multiplicateur : mult(n) = 0,99 / P(n prédictions justes d'affilée)
   → à tout moment, EV = 0,99 × mise : RTP 99 % quel que soit le point
   d'encaissement. Une égalité (même hauteur) est perdante, comme au casino.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];   // A=1 … R=13
  const SUITS = [
    { s: '♠', red: false }, { s: '♥', red: true }, { s: '♦', red: true }, { s: '♣', red: false }
  ];
  const HOUSE = 0.99;

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

  /** Nombre de cartes restantes strictement au-dessus / en dessous d'une hauteur. */
  function counts(g, rank) {
    let higher = 0, lower = 0;
    for (let r = rank + 1; r <= 13; r++) higher += g.deck.counts[r];
    for (let r = 1; r < rank; r++) lower += g.deck.counts[r];
    return { higher, lower };
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
      'Une carte est retournée. Devine si la suivante sera <b>plus haute</b> ou <b>plus basse</b>. ' +
      'Les 52 cartes sont distribuées <b>sans remise</b> : les probabilités affichées sont donc exactes et évoluent ' +
      'au fil de la série.<br><br>' +
      'Chaque bonne prédiction augmente le multiplicateur (0,99 ÷ probabilité cumulée), et tu peux ' +
      '<b>encaisser à tout moment</b>. Une <b>égalité</b> (même hauteur) est perdante. ' +
      'En mode Auto-bet, le jeu choisit systématiquement l\'option la plus probable avant d\'encaisser.',
    playLabel: 'Distribuer 🃏',

    /* ---------------------------------------------------------------- ÉTAT */
    state(g) {
      const d = freshDeck();
      g.deck = d;
      g.card = null;
      g.mult = HOUSE;
      g.steps = 0;
      g.chain = [];
      g.phase = 'idle';           // idle | guess
      g.autoSteps = g.autoSteps || 1;
      g.lastOutcome = null;
    },

    /* ------------------------------------------------------------- OPTIONS */
    controls(g) {
      return '<div class="row between"><span class="bet-label">Prédictions auto</span>' +
          '<span class="mono up" id="hlStepsLbl">' + g.autoSteps + '</span></div>' +
        '<input type="range" id="hlSteps" min="1" max="9" step="1" value="' + g.autoSteps + '" class="thin mt-s">' +
        '<div class="sub mt-s">Nombre de prédictions tentées automatiquement par partie en mode Auto-bet ' +
        '(le jeu choisit toujours l\'option la plus probable).';
    },

    payoutHint(g) {
      if (g.steps > 0) return 'Encaissement : <b class="up">' + U.fmtMult(g.mult) + '</b> après ' + g.steps + ' prédiction(s)';
      return 'Multiplicateur de départ : 1,00x — encaisse quand tu veux';
    },

    /* --------------------------------------------------------------- SCÈNE */
    stage() {
      return '<div class="hilo-stage">' +
        '<div class="hilo-card" id="hlCard"><div class="rank">—</div><div class="mid">🂠</div><div class="suit">—</div></div>' +
        '<div class="hilo-history" id="hlChain"></div>' +
        '<div class="hilo-choices" id="hlChoices">' +
          '<button class="hilo-choice" id="hlHigh" disabled><span>▲ Plus haut</span><b id="hlHighMult">—</b><small id="hlHighP">—</small></button>' +
          '<button class="hilo-choice" id="hlLow" disabled><span>▼ Plus bas</span><b id="hlLowMult">—</b><small id="hlLowP">—</small></button>' +
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

      g.highBtn.onclick = () => guess(g, 'higher');
      g.lowBtn.onclick = () => guess(g, 'lower');

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
        return [
          { label: '💰 Encaisser ' + U.fmtMult(g.mult) + ' · +' + U.fmt(Math.round(bet * g.mult) - bet),
            cls: 'primary wide-lg grow', act: 'cashout', alsoWhenBusy: true },
          { label: '↻ Prédire', cls: 'ghost', alsoWhenBusy: true, onClick: () => renderChoices(g) }
        ];
      }
      if (g.phase === 'guess') {
        return [{ label: 'Choisis « plus haut » ou « plus bas »', cls: 'ghost wide-lg grow', act: 'none', disabled: true }];
      }
      return [{ label: g.auto.on ? 'Série en cours…' : 'Distribuer 🃏', cls: 'primary wide-lg grow', act: 'play', disabled: g.auto.on }];
    },

    /* -------------------------------------------------------- TOUR DE JEU */
    start(g) {
      if (g.deck.remaining < 6) {                 // jeu presque épuisé : on rebat
        g.deck = freshDeck();
        J.toast('🃏 Jeu rebattu', 'ok');
      }
      g.mult = HOUSE;
      g.steps = 0;
      g.chain = [];
      g.card = drawCard(g);
      g.phase = 'guess';
      g.autoLeft = g.autoSteps;
      renderCard(g);
      renderDeck(g);
      renderChain(g);
      renderChoices(g);
      J.Games.renderActions(g);
      J.Games.updateHints(g);
      J.Sfx.bet();
      g.msgEl.textContent = 'À toi de prédire la carte suivante';

      // Mode auto : on enchaîne les prédictions les plus probables
      if (g.auto.on) autoGuess(g);
    },

    cashout(g) { return cashout(g); }
  });

  /* ------------------------------------------------------------- ÉCRANS */
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
    if (g.deckEl) g.deckEl.textContent = g.deck.remaining + ' cartes restantes · multiplicateur ' + U.fmtMult(g.mult);
  }

  function renderChain(g) {
    if (!g.chainEl) return;
    g.chainEl.innerHTML = g.chain.map((c) =>
      '<span class="hilo-mini' + (c.red ? ' red' : '') + '">' + RANKS[c.rank] + c.suit + '</span>').join('');
  }

  /** Met à jour les deux boutons avec probabilités et multiplicateurs exacts. */
  function renderChoices(g) {
    if (!g.card) return;
    const c = counts(g, g.card.rank);
    const rem = g.deck.remaining;
    const pHigh = rem ? c.higher / rem : 0;
    const pLow = rem ? c.lower / rem : 0;
    const multHigh = pHigh > 0 ? g.mult / pHigh : 0;
    const multLow = pLow > 0 ? g.mult / pLow : 0;

    g.highBtn.disabled = !(pHigh > 0) || g.phase !== 'guess';
    g.lowBtn.disabled = !(pLow > 0) || g.phase !== 'guess';
    const set = (btn, p, m, idM, idP) => {
      document.getElementById(idM).textContent = p > 0 ? U.fmtMult(m) : '—';
      document.getElementById(idP).textContent = p > 0 ? U.fmtPct(p * 100, 1) + ' · ' + (p > 0 ? Math.round(rem * p) : 0) + ' cartes' : 'aucune carte';
    };
    set(g.highBtn, pHigh, multHigh, 'hlHighMult', 'hlHighP');
    set(g.lowBtn, pLow, multLow, 'hlLowMult', 'hlLowP');
  }

  /* -------------------------------------------------------------- JOUER */
  /** Une prédiction : 'higher' ou 'lower'. */
  function guess(g, dir, auto) {
    if (!g.ticket || g.phase !== 'guess') return;
    const c = counts(g, g.card.rank);
    const rem = g.deck.remaining;
    const p = dir === 'higher' ? c.higher / rem : c.lower / rem;
    if (!(p > 0)) { if (!auto) J.toast('Aucune carte dans ce sens', 'ko'); return; }

    const next = drawCard(g);
    const won = dir === 'higher' ? next.rank > g.card.rank : next.rank < g.card.rank;
    g.chain.push(g.card);
    g.card = next;

    if (won) {
      g.mult = g.mult / p;                      // = 0,99 / P(cumulée)
      g.steps++;
      J.Sfx.reveal(true); J.haptic.tap();
      g.msgEl.innerHTML = '✅ <b class="up">Bien vu</b> — ' + U.fmtMult(g.mult);
    } else {
      g.phase = 'idle';
      renderCard(g); renderDeck(g); renderChain(g); renderChoices(g);
      J.Sfx.lose(); J.haptic.lose(); J.shake(g.stageEl);
      const equal = next.rank === g.card.rank;
      g.msgEl.innerHTML = '❌ <b class="down">Perdu</b> — ' + (equal ? 'égalité (même hauteur)' : 'carte ' + (dir === 'higher' ? 'plus basse' : 'plus haute'));
      J.Games.finish(g, 0, { detail: 'perdu après ' + g.steps + ' prédiction(s)' });
      return;
    }

    renderCard(g); renderDeck(g); renderChain(g); renderChoices(g);
    J.Games.updateHints(g);
    J.Games.renderActions(g);

    if (auto && g.auto.on) autoGuess(g);
  }

  /** Enchaîne automatiquement les prédictions les plus probables (mode auto). */
  function autoGuess(g) {
    if (!g.auto.on) return;
    if (g.autoLeft <= 0) { cashout(g); return; }
    if (!g.ticket) return;
    const c = counts(g, g.card.rank);
    const rem = g.deck.remaining;
    const pHigh = c.higher / rem, pLow = c.lower / rem;
    if (pHigh <= 0 && pLow <= 0) { cashout(g); return; }
    const dir = pHigh >= pLow ? 'higher' : 'lower';
    const p = Math.max(pHigh, pLow);
    g.autoLeft--;
    J.Games.schedule(g, () => { if (g.ticket) guess(g, dir, true); }, Math.max(90, (g.auto.speed || 400) * 0.6));
  }

  /** Encaisse le multiplicateur courant. */
  function cashout(g) {
    if (!g || !g.ticket || g.steps <= 0) return;
    const mult = g.mult;
    const payout = Math.round(g.ticket.bet * mult);
    g.phase = 'idle';
    renderChoices(g);
    g.msgEl.innerHTML = '💰 <b class="up">Encaissé</b> à ' + U.fmtMult(mult) + ' après ' + g.steps + ' prédiction(s)';
    J.Sfx.cashout(); J.haptic.win(mult);
    J.floatText('+' + U.fmt(payout), { el: g.cardEl, color: 'var(--green)', size: 22 });
    if (mult >= 4) J.FX.confetti({ count: mult >= 20 ? 100 : 45, x: window.innerWidth / 2, y: g.stageEl.getBoundingClientRect().top + 80 });
    if (mult >= 8) J.Live.playerWin('hilo', mult, payout);
    const steps = g.steps;
    g.steps = 0;
    g.mult = HOUSE;
    J.Games.finish(g, mult, { detail: steps + ' prédiction(s) juste(s)' });
  }
})();
