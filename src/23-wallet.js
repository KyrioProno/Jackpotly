/* =========================================================================
   JACKPOTLY — PORTEFEUILLE
   Source de vérité unique du solde : mise (débit immédiat), résolution
   (crédit du gain), stats, historique, progression VIP.
   Aucun module de jeu ne touche directement au solde : tout passe par ici.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  let shown = null;          // valeur affichée (compteur animé du solde)
  let animRAF = null;

  const W = (J.Wallet = {
    /* ------------------------------------------------------------- LECTURES */
    get balance() { return J.Store.state.balance; },

    /** Le joueur peut-il miser ce montant ? */
    canBet(amount) { return amount > 0 && amount <= J.Store.state.balance; },

    /** Mise maximale disponible (bornée par le plafond de table). */
    maxBet() { return Math.min(J.Store.state.balance, J.CONST.MAX_BET); },

    /* ---------------------------------------------------------- MOUVEMENTS */
    /**
     * Débite une mise et ouvre un « ticket ». Renvoie le ticket, ou null si
     * le solde est insuffisant. Le ticket doit ensuite être résolu par settle()
     * ou annulé par refund().
     */
    stake(amount, gameId, meta) {
      amount = U.tokens(amount);
      const st = J.Store.state;
      if (amount <= 0) return null;
      if (amount > st.balance) return null;

      // Chaque pari ouvre un nouveau nonce provably fair : le joueur peut
      // vérifier tirage par tirage à partir des graines révélées.
      J.Fair.beginBet();
      st.balance -= amount;
      st.stats.bets++;
      st.stats.wagered += amount;
      st.vip.wagered += amount;
      const g = (st.stats.perGame[gameId] = st.stats.perGame[gameId] || { bets: 0, wagered: 0, returned: 0, wins: 0, bestMult: 0 });
      g.bets++; g.wagered += amount;

      const ticket = {
        id: U.uid(), game: gameId, bet: amount, t: Date.now(),
        meta: meta || null, _open: true
      };
      J.Store.save();
      W.renderBalance();
      J.Bus.emit('wallet:stake', ticket);
      J.Bus.emit('stats:changed');
      W.checkVip();
      return ticket;
    },

    /** Résout un ticket : multiplier renvoyé (0 = perte sèche). */
    settle(ticket, multiplier, extra) {
      if (!ticket || !ticket._open) return null;
      ticket._open = false;
      const st = J.Store.state;
      const mult = Math.max(0, Number(multiplier) || 0);
      const payout = U.tokens(ticket.bet * mult);
      const profit = payout - ticket.bet;

      st.balance += payout;
      st.stats.returned += payout;
      st.stats.netProfit += profit;
      st.session.rounds++;

      if (payout > 0) {
        st.stats.wins++;
        st.stats.bestWin = Math.max(st.stats.bestWin, payout);
        if (payout > st.stats.bestWin) st.stats.bestWinGame = ticket.game;
        st.stats.bestMult = Math.max(st.stats.bestMult, mult);
        const g = st.stats.perGame[ticket.game];
        g.wins++; g.returned += payout; g.bestMult = Math.max(g.bestMult, mult);
      } else {
        st.stats.biggestLoss = Math.max(st.stats.biggestLoss, ticket.bet);
      }

      const rec = {
        t: Date.now(), game: ticket.game, bet: ticket.bet,
        mult: mult, payout: payout, profit: profit,
        detail: (extra && extra.detail) || ''
      };
      st.history.unshift(rec);
      if (st.history.length > 250) st.history.length = 250;

      J.Store.save();
      W.renderBalance(payout > 0 ? 'up' : 'down');
      J.Bus.emit('wallet:settled', { ticket, mult, payout, profit });
      J.Bus.emit('stats:changed');
      return rec;
    },

    /** Annule un ticket encore ouvert (erreur, sortie de jeu, mise indisponible). */
    refund(ticket) {
      if (!ticket || !ticket._open) return;
      ticket._open = false;
      const st = J.Store.state;
      st.balance += ticket.bet;
      st.stats.bets = Math.max(0, st.stats.bets - 1);
      st.stats.wagered = Math.max(0, st.stats.wagered - ticket.bet);
      st.vip.wagered = Math.max(0, st.vip.wagered - ticket.bet);
      const g = st.stats.perGame[ticket.game];
      if (g) { g.bets = Math.max(0, g.bets - 1); g.wagered = Math.max(0, g.wagered - ticket.bet); }
      J.Store.save();
      W.renderBalance();
    },

    /** Crédit libre (bonus, récompense VIP, achat de pack, recharge gratuite). */
    credit(amount, reason, opts) {
      amount = U.tokens(amount);
      if (!amount) return 0;
      const st = J.Store.state;
      st.balance += amount;
      J.Store.save();
      W.renderBalance('up');
      J.Bus.emit('wallet:credit', { amount, reason: reason || 'credit', opts: opts || null });
      return amount;
    },

    /** Débit libre (achat simulé, correction). */
    debit(amount) {
      amount = U.tokens(amount);
      const st = J.Store.state;
      if (amount <= 0 || amount > st.balance) return false;
      st.balance -= amount;
      J.Store.save(); W.renderBalance('down');
      return true;
    },

    /* ------------------------------------------------------------ AFFICHAGE */
    /** Met à jour la pastille de solde avec compteur animé + flash couleur. */
    renderBalance(kind) {
      const el = document.getElementById('balanceVal');
      const pill = document.getElementById('balancePill');
      const target = J.Store.state.balance;
      if (shown === null) shown = target;
      if (el) {
        if (animRAF) cancelAnimationFrame(animRAF);
        const from = shown;
        if (from === target) { el.textContent = U.fmt(target); }
        else {
          const t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(target - from) / 40);
          const step = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const v = from + (target - from) * (1 - Math.pow(1 - p, 3));
            el.textContent = U.fmt(v);
            if (p < 1) animRAF = requestAnimationFrame(step);
            else { shown = target; el.textContent = U.fmt(target); animRAF = null; }
          };
          animRAF = requestAnimationFrame(step);
        }
        shown = target;
      }
      if (pill && kind) {
        pill.classList.remove('pulse', 'loss');
        void pill.offsetWidth;
        pill.classList.add(kind === 'down' ? 'loss' : 'pulse');
        setTimeout(() => pill.classList.remove('pulse', 'loss'), 700);
      }
    },

    /* ------------------------------------------------------------------ VIP */
    /** Palier VIP courant d'après le total misé. */
    vipInfo() {
      const wagered = J.Store.state.vip.wagered;
      const tiers = J.CONST.VIP;
      let i = 0;
      for (let k = 0; k < tiers.length; k++) if (wagered >= tiers[k].need) i = k;
      const cur = tiers[i], next = tiers[i + 1] || null;
      const from = cur.need, to = next ? next.need : cur.need;
      const pct = next ? U.clamp(((wagered - from) / (to - from)) * 100, 0, 100) : 100;
      return { index: i, tier: cur, next, wagered, pct, remaining: next ? Math.max(0, to - wagered) : 0 };
    },

    /** Détecte un passage de palier et propose la récompense. */
    checkVip() {
      const info = W.vipInfo();
      const st = J.Store.state;
      if (info.index > st.vip.level) {
        st.vip.level = info.index;
        J.Store.save();
        J.Sfx.levelup(); J.haptic.big();
        J.FX.confetti({ count: 110, x: window.innerWidth / 2, y: window.innerHeight * 0.35 });
        if (J.UI && J.UI.showVipUp) J.UI.showVipUp(info);
        J.Bus.emit('vip:levelup', info);
      }
    },

    /** Réclame la récompense du palier courant (une fois par palier). */
    claimVipReward() {
      const info = W.vipInfo();
      const st = J.Store.state;
      const idx = info.index;
      if (st.vip.claimedLevels.includes(idx)) return false;
      const tier = J.CONST.VIP[idx];
      if (!tier.reward) return false;
      st.vip.claimedLevels.push(idx);
      J.Store.save();
      W.credit(tier.reward, 'vip:' + tier.id);
      return tier.reward;
    },

    /* --------------------------------------------------------------- STATS */
    /** Statistiques dérivées, prêtes à afficher. */
    summary() {
      const s = J.Store.state.stats;
      const rtp = s.wagered ? (s.returned / s.wagered) * 100 : 0;
      const winRate = s.bets ? (s.wins / s.bets) * 100 : 0;
      let favGame = null, best = -1;
      for (const id in s.perGame) {
        const g = s.perGame[id];
        if (g.wagered > best) { best = g.wagered; favGame = id; }
      }
      return {
        bets: s.bets, wins: s.wins, wagered: s.wagered, returned: s.returned,
        netProfit: s.netProfit, bestMult: s.bestMult, bestWin: s.bestWin,
        bestWinGame: s.bestWinGame, rtp, winRate, favGame, perGame: s.perGame
      };
    },

    /** Nom lisible d'un jeu à partir de son identifiant. */
    gameName(id) {
      const g = (J.GAMES || []).find((x) => x.id === id);
      return g ? g.name : id;
    }
  });
})();
