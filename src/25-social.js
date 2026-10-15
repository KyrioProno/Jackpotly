/* =========================================================================
   JACKPOTLY — SOCIAL & PROGRESSION
   · Quêtes / missions du jour
   · Classement fictif (bots + position du joueur)
   · Faux flux « gros gains récents »
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /* =====================================================================
     QUÊTES DU JOUR
     ===================================================================== */
  /** Catalogue des missions. Les cibles sont dimensionnées pour ~15 min de jeu. */
  const QUEST_POOL = [
    { id: 'rounds',   title: 'Jouer 25 parties',              target: 25,   reward: 600 },
    { id: 'wager',    title: 'Miser 5 000 jetons',            target: 5000, reward: 750 },
    { id: 'wins',     title: 'Gagner 5 parties',              target: 5,    reward: 800 },
    { id: 'mult',     title: 'Atteindre un multiplicateur ≥ 5x', target: 1, reward: 1200 },
    { id: 'games',    title: 'Jouer à 3 jeux différents',     target: 3,    reward: 900 },
    { id: 'mines',    title: 'Gagner 3 fois à Mines',         target: 3,    reward: 1000 },
    { id: 'crash',    title: 'Cash out à Crash (≥ 2x)',       target: 1,    reward: 900 },
    { id: 'dice',     title: 'Jouer 20 parties de Dice',      target: 20,   reward: 700 },
    { id: 'plinko',   title: 'Jouer 10 parties de Plinko',    target: 10,   reward: 700 },
    { id: 'profit',   title: 'Terminer avec +1 000 jetons sur une partie', target: 1000, reward: 1100 }
  ];

  /** Tire 3 missions du jour, de façon stable pour la journée. */
  function rollQuests(day) {
    // PRNG déterministe à partir de la date : les missions ne changent pas en cours de journée
    let seed = 0;
    for (let i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pool = QUEST_POOL.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const i = Math.floor(rnd() * pool.length);
      const q = pool.splice(i, 1)[0];
      picked.push(Object.assign({}, q, { progress: 0, claimed: false, seen: [] }));
    }
    return picked;
  }

  const Quests = (J.Quests = {
    /** Charge (ou régénère) les missions du jour. */
    ensure() {
      const st = J.Store.state;
      const day = U.dayKey();
      if (st.quests.day !== day) {
        st.quests = { day, items: rollQuests(day), reward: 1500 };
        J.Store.save();
      }
      return st.quests;
    },

    items() { return Quests.ensure().items; },

    done() { return Quests.items().filter((q) => q.progress >= q.target).length; },

    /** Progression : appelé par les événements du portefeuille. */
    track() {
      Quests.ensure();

      /** Incrémente une mission. On relit toujours la liste courante :
       *  elle est recréée à chaque changement de jour ou réinitialisation. */
      function bump(id, amount) {
        const q = Quests.items().find((x) => x.id === id);
        if (!q || q.progress >= q.target) return;
        q.progress = Math.min(q.target, q.progress + amount);
        if (q.progress >= q.target) {
          J.toast('✅ Mission accomplie : <b>' + q.title + '</b>', 'ok');
          J.Sfx.bonus();
          J.Bus.emit('quests:changed');
        }
        J.Store.save();
      }

      J.Bus.on('wallet:stake', (t) => {
        bump('rounds', 1);
        bump('wager', t.bet);
        const q = Quests.items().find((x) => x.id === 'games');
        if (q && !q.seen.includes(t.game)) { q.seen.push(t.game); bump('games', 1); }
      });

      J.Bus.on('wallet:settled', ({ ticket, mult, profit }) => {
        if (mult >= 1) bump('wins', 1);
        if (mult >= 5) bump('mult', 1);
        if (ticket.game === 'mines' && mult >= 1) bump('mines', 1);
        if (ticket.game === 'crash' && mult >= 2) bump('crash', 1);
        if (ticket.game === 'dice') bump('dice', 1);
        if (ticket.game === 'plinko') bump('plinko', 1);
        if (profit >= 1000) bump('profit', profit);
        J.Bus.emit('quests:changed');
      });

      J.Bus.on('wallet:stake', () => J.Bus.emit('quests:changed'));
    },

    /** Récupère la récompense d'une mission terminée. */
    claim(id) {
      const Q = Quests.ensure();
      const q = Q.items.find((x) => x.id === id);
      if (!q || q.claimed || q.progress < q.target) return 0;
      q.claimed = true;
      // Bonus si toutes les missions du jour sont validées
      const allDone = Q.items.every((x) => x.claimed);
      let gain = q.reward;
      if (allDone) gain += Q.reward;
      J.Store.save();
      J.Wallet.credit(gain, 'quest:' + id + (allDone ? '+all' : ''));
      J.Sfx.bonus(); J.haptic.win(3); J.FX.coins(28);
      J.toast('+' + U.fmt(gain) + ' jetons' + (allDone ? ' (bonus complet !)' : ''), 'gold');
      J.Bus.emit('quests:changed');
      return gain;
    },

    /** Récupère toutes les récompenses disponibles d'un coup. */
    claimAll() {
      let total = 0;
      Quests.items().forEach((q) => { if (!q.claimed && q.progress >= q.target) total += Quests.claim(q.id); });
      return total;
    }
  });

  /* =====================================================================
     CLASSEMENT FICTIF (BOTS)
     ===================================================================== */
  const BOT_NAMES = ['LuckyLéa', 'MaxouBT', 'KryptoKing', 'ZoéDiamant', 'NeonNinja', 'JulieVegas', 'TomRivers', 'AsDePique',
    'Charly777', 'MiaLuna', 'BigBossFR', 'Sardine51', 'RayanGold', 'Noisette', 'VincentPoker', 'CassandraX', 'LeRoiDuFlop',
    'SushiMaster', 'DragonBleu', 'PetitScarabée', 'EvaCash', 'MehdiRun', 'ChloéSpin', 'BountyMan', 'FraiseTagada',
    'HugoPlinko', 'MarionAce', 'ZeroChance', 'TitouanO', 'KellyKeno', 'MathisCrash', 'LolaFortune', 'GrizzlyDuNord',
    'SamBaccarat', 'OcéaneRouge', 'FistonDu13', 'NinaJackpot', 'ProfessorX', 'BastienLedoux', 'YasmineOr'];
  const BOT_COLORS = ['#00e37a', '#ffc531', '#3b82f6', '#8b5cf6', '#ff4fa3', '#22d3ee', '#f97316'];

  function seededRnd(seedStr) {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 131 + seedStr.charCodeAt(i)) >>> 0;
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }

  const Leaderboard = (J.Leaderboard = {
    /** Construit un classement stable pour une période donnée ('day' | 'week'). */
    build(period) {
      const key = period === 'week' ? U.dayKey().slice(0, 8) + 'W' : U.dayKey();
      const rnd = seededRnd('lb:' + key + ':' + period);
      const scale = period === 'week' ? 6 : 1;
      const bots = BOT_NAMES.map((name, i) => {
        const wagered = Math.round((3000 + rnd() * 420000) * scale);
        const net = Math.round(wagered * (rnd() * 0.35 - 0.16));
        return { name, wagered, net, bot: true, color: BOT_COLORS[i % BOT_COLORS.length] };
      });
      return bots;
    },

    /** Total misé par le joueur sur la période (reconstruit depuis l'historique). */
    playerWagered(period) {
      const now = Date.now();
      const from = period === 'week' ? now - 7 * 864e5 : new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      const h = J.Store.state.history;
      let sum = 0, net = 0;
      for (const r of h) if (r.t >= from) { sum += r.bet; net += r.profit; }
      return { wagered: sum, net };
    },

    /** Liste triée incluant le joueur. */
    ranked(period) {
      const p = Leaderboard.playerWagered(period);
      const st = J.Store.state;
      const rows = Leaderboard.build(period);
      rows.push({ name: st.pseudo, wagered: p.wagered, net: p.net, me: true, color: '#00e37a' });
      const sortKey = period === 'profit' ? 'net' : 'wagered';
      rows.sort((a, b) => b[sortKey] - a[sortKey]);
      rows.forEach((r, i) => { r.rank = i + 1; });
      return rows;
    },

    myRank(period) {
      const rows = Leaderboard.ranked(period);
      return rows.find((r) => r.me) || { rank: rows.length, wagered: 0, net: 0 };
    }
  });

  /* =====================================================================
     FLUX « GROS GAINS RÉCENTS » (faux, ambiance live)
     ===================================================================== */
  const Live = (J.Live = (function () {
    let timer = null;
    const recent = [];
    const GAME_FEED = ['crash', 'dice', 'mines', 'plinko', 'slots', 'roulette', 'blackjack', 'wheel', 'keno'];

    function makeWin() {
      const name = U.pick(BOT_NAMES);
      const gameId = U.pick(GAME_FEED);
      const game = (J.GAMES || []).find((g) => g.id === gameId);
      const mult = [1.2, 1.5, 1.9, 2.1, 2.7, 3.4, 5.2, 7.8, 11.4, 19.6, 44.3, 120.7][U.rndInt(0, 11)];
      const bet = U.pick([50, 100, 250, 500, 1000, 2500, 5000]);
      const amount = Math.round(bet * mult);
      return {
        t: Date.now(), name, game: gameId, gameName: game ? game.name : gameId,
        mult, bet, amount, color: U.pick(BOT_COLORS)
      };
    }

    function push(item, silent) {
      recent.unshift(item);
      if (recent.length > 14) recent.pop();
      if (!silent) { render(item); J.Bus.emit('feed:item', item); }
    }

    function render(item) {
      if (!J.Store.state.settings.liveFeed) return;
      const el = document.createElement('div');
      el.className = 'feed-item';
      el.innerHTML =
        '<span class="av" style="background:' + item.color + '">' + U.esc(item.name.charAt(0).toUpperCase()) + '</span>' +
        '<span>' + U.esc(item.name) + ' · ' + U.esc(item.gameName) + '</span>' +
        '<span class="mx">' + U.fmtMult(item.mult) + '</span>' +
        '<span class="amt">+' + U.fmtK(item.amount) + '</span>';
      const root = document.getElementById('liveFeed');
      if (!root) return;
      root.appendChild(el);
      if (root.children.length > 3) root.firstChild.remove();
      setTimeout(() => el.remove(), 4800);
    }

    return {
      recent,

      init() {
        // Historique initial pour que l'écran d'accueil ne soit pas vide
        for (let i = 0; i < 8; i++) push(makeWin(), true);
        Live.start();
      },

      start() {
        if (timer) return;
        const tick = () => {
          push(makeWin());
          timer = setTimeout(tick, U.rndInt(5000, 13000));
        };
        timer = setTimeout(tick, 6000);
      },

      stop() { clearTimeout(timer); timer = null; },

      setEnabled(on) {
        if (on) { Live.start(); J.toast('Flux live activé', 'ok'); }
        else { Live.stop(); const r = document.getElementById('liveFeed'); if (r) r.innerHTML = ''; }
      },

      /** Un gain du joueur est aussi poussé dans le flux (ambiance partagée). */
      playerWin(gameId, mult, amount) {
        const game = (J.GAMES || []).find((g) => g.id === gameId);
        push({
          t: Date.now(), name: J.Store.state.pseudo, me: true, game: gameId,
          gameName: game ? game.name : gameId, mult, bet: amount / mult, amount, color: '#00e37a'
        });
      }
    };
  })());
})();
