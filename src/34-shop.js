/* =========================================================================
   JACKPOTLY — BOUTIQUE & ACHATS INTÉGRÉS (architecture)
   La vague 1 pose l'architecture : catalogue de packs, limite de dépenses
   mensuelle, journal des achats et adaptateur de paiement interchangeable.
   Le paiement reste SIMULÉ (`SimulatedProvider`) ; il suffira d'enregistrer
   un adaptateur Apple/Google pour brancher l'App Store / le Play Store.

   RAPPEL : les jetons sont virtuels, sans valeur monétaire. Aucun retrait,
   aucune conversion en argent ou en cadeaux, aucun échange entre joueurs.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /** Catalogue des packs (prix indicatifs, tout est simulé en vague 1). */
  const PACKS = [
    { id: 'starter',   tokens: 5000,   price: 1.99, bonus: 0,    label: 'Découverte', tag: '' },
    { id: 'firstbuy',  tokens: 25000,  price: 2.99, bonus: 7500, label: 'Premier achat', tag: '1re fois -70 %', firstOnly: true },
    { id: 'popular',   tokens: 25000,  price: 9.99, bonus: 0,    label: 'Populaire', tag: 'Le plus joué' },
    { id: 'big',       tokens: 100000, price: 24.99, bonus: 15000, label: 'Gros pack', tag: '' },
    { id: 'mega',      tokens: 500000, price: 59.99, bonus: 100000, label: 'Méga pack', tag: 'Meilleur ratio' }
  ];

  /* ------------------------------------------------------ ADAPTATEUR DE PAIEMENT */
  /**
   * Contrat d'un fournisseur de paiement. Pour brancher Apple/Google :
   *   1. implémenter `available()` (StoreKit / BillingClient présents ?),
   *   2. `buy(pack)` doit retourner une promesse { ok, transactionId, receipt },
   *   3. appeler J.Shop.deliver(pack, transactionId) après validation du reçu.
   */
  const SimulatedProvider = {
    id: 'simulated',
    label: 'Paiement simulé (démonstration)',
    available: () => true,
    /** Retourne une promesse { ok, transactionId, receipt } */
    buy(pack) {
      return new Promise((resolve) => {
        setTimeout(() => resolve({
          ok: true,
          transactionId: 'SIM-' + Date.now().toString(36).toUpperCase(),
          receipt: 'simulated-receipt'
        }), 850);
      });
    }
  };

  const Shop = (J.Shop = {
    PACKS,
    provider: SimulatedProvider,

    /** Enregistre un fournisseur de paiement réel (App Store, Play Store…). */
    registerProvider(p) {
      if (p && typeof p.buy === 'function') Shop.provider = p;
    },

    /** Un achat est-il possible (limite mensuelle, offre premier achat) ? */
    canBuy(pack) {
      const st = J.Store.state;
      if (pack.firstOnly && st.shop.firstPurchaseUsed) return false;
      const limit = Shop.spendState();
      if (limit.limit != null && limit.total + pack.price > limit.limit) return false;
      return true;
    },

    /** Total dépensé ce mois et limite en vigueur. */
    spendState() {
      const st = J.Store.state;
      const mk = U.monthKey();
      if (st.spend.month !== mk) { st.spend.month = mk; st.spend.total = 0; J.Store.save(); }
      return { total: st.spend.total, limit: st.spend.limit, month: st.spend.month };
    },

    /**
     * Achat d'un pack : vérifie la limite, appelle le fournisseur puis
     * livre les jetons. Utilisé par la vague 2 (interface complète).
     */
    async purchase(packId) {
      const pack = PACKS.find((p) => p.id === packId);
      if (!pack) return { ok: false, error: 'Pack inconnu' };
      if (!Shop.canBuy(pack)) return { ok: false, error: 'Achat bloqué (limite mensuelle ou offre déjà utilisée)' };
      const res = await Shop.provider.buy(pack);
      if (!res || !res.ok) return { ok: false, error: 'Paiement refusé' };
      return Shop.deliver(pack, res.transactionId);
    },

    /** Crédite les jetons d'un achat validé + journalise la dépense. */
    deliver(pack, transactionId) {
      const st = J.Store.state;
      const total = pack.tokens + (pack.bonus || 0);
      st.spend.total += pack.price;
      st.shop.purchased[pack.id] = (st.shop.purchased[pack.id] || 0) + 1;
      if (pack.firstOnly) st.shop.firstPurchaseUsed = true;
      st.shop.lastTransaction = transactionId || null;
      J.Store.save();
      J.Wallet.credit(total, 'purchase:' + pack.id, { amount: pack.price, pack: pack.id });
      J.Sfx.bonus(); J.FX.coins(60); J.haptic.big();
      J.toast('+' + U.fmt(total) + ' jetons virtuels crédités', 'gold');
      return { ok: true, tokens: total, transactionId: transactionId };
    },

    /* --------------------------------------------------- LIMITE DE DÉPENSES */
    /** Modale de définition de la limite mensuelle (jamais relevable à la hausse le mois courant). */
    openLimit() {
      const s = Shop.spendState();
      J.UI.modal({
        title: '🛡️ Limite de dépenses mensuelle',
        sub: 'Tu décides du plafond — il protège ton budget',
        body:
          '<div class="note">Cette limite s\'applique aux achats de packs de jetons. ' +
          'Elle peut être baissée à tout moment ; pour la remonter, la modification est différée au mois suivant. ' +
          'Rappel : les jetons n\'ont aucune valeur monétaire et ne sont pas remboursables.</div>' +
          '<div class="kv mt"><span class="k">Dépensé ce mois (' + s.month + ')</span><span class="v">' + s.total.toFixed(2).replace('.', ',') + ' €</span></div>' +
          '<div class="field mt"><span class="prefix">€</span><input id="limitInput" type="number" min="0" step="1" placeholder="Aucune limite" value="' + (s.limit == null ? '' : s.limit) + '"><span class="suffix">PAR MOIS</span></div>' +
          '<div class="money-quick mt"><button data-lim="0">Bloqué</button><button data-lim="10">10 €</button>' +
          '<button data-lim="20">20 €</button><button data-lim="50">50 €</button><button data-lim="clear">Aucune</button></div>' +
          '<div class="note warn mt">Si les achats deviennent un problème, choisis « Bloqué » ou retire la limite du jeu : ' +
          'le jeu reste entièrement accessible avec les jetons gratuits (bonus quotidien, roue, recharges).</div>',
        actions: [
          { label: 'Annuler', cls: 'ghost' },
          { label: 'Enregistrer', cls: 'primary', onClick: () => {
            const v = document.getElementById('limitInput').value;
            Shop.setLimit(v === '' ? null : Math.max(0, parseFloat(v)));
          } }
        ]
      });
      document.querySelectorAll('[data-lim]').forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.lim;
          const inp = document.getElementById('limitInput');
          if (inp) inp.value = v === 'clear' ? '' : v;
        };
      });
    },

    setLimit(value) {
      const st = J.Store.state;
      const prev = st.spend.limit;
      let v = value == null ? null : Math.max(0, Number(value));
      // On ne relève jamais la limite dans le même mois : on diffère
      if (prev != null && v != null && v > prev) {
        st.spend.pendingLimit = v;
        st.spend.pendingMonth = U.monthKey(Shop.nextMonthTs());
        J.toast('Hausse programmée pour le mois prochain', 'gold');
      } else {
        st.spend.limit = v;
        st.spend.pendingLimit = null;
        J.toast(v == null ? 'Limite supprimée' : 'Limite : ' + v.toFixed(2).replace('.', ',') + ' € / mois', 'ok');
      }
      J.Store.save();
      J.Screen.renderShop();
      return st.spend.limit;
    },

    nextMonthTs() {
      const d = new Date();
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
  });
})();
