/* =========================================================================
   JACKPOTLY — CORE
   Namespace global, utilitaires, bus d'événements, persistance locale.
   ========================================================================= */
(function () {
  'use strict';

  /** Espace de noms unique du jeu. Tous les modules s'y rattachent. */
  const J = (window.JACKPOTLY = window.JACKPOTLY || {});
  J.VERSION = '0.3.0';           // vague 3 : 16 jeux jouables (10 Originals + 6 classiques)
  J.SAVE_KEY = 'jackpotly.state.v1';

  /* ------------------------------------------------------------------ UTIL */
  const U = (J.util = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),

    /** Entier de jetons formaté à la française : 1 234 567 */
    fmt(n) {
      n = Math.round(Number(n) || 0);
      return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
    },

    /** Montant compact : 12,4 k / 3,1 M (pour les listes denses) */
    fmtK(n) {
      n = Number(n) || 0;
      const a = Math.abs(n);
      if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
      if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace('.', ',') + ' k';
      return U.fmt(n);
    },

    /** Montant signé : 1200 → "+1 200 J", -340 → "−340 J" */
    fmtSigned(n) {
      n = Math.round(Number(n) || 0);
      return (n >= 0 ? '+' : '−') + U.fmt(Math.abs(n)) + ' J';
    },

    /** Multiplicateur : 2 → "2,00x" ; 123.4 → "123,40x" */
    fmtMult(m) {
      m = Number(m) || 0;
      return (m >= 100 ? m.toFixed(0) : m.toFixed(2)).replace('.', ',') + 'x';
    },

    /** Taux en pourcentage : 49.5 → "49,50 %" */
    fmtPct(p, dec = 2) {
      return (Number(p) || 0).toFixed(dec).replace('.', ',') + ' %';
    },

    /** Date lisible courte */
    fmtDate(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    },

    /** Clé de jour locale YYYY-MM-DD */
    dayKey(ts = Date.now()) {
      const d = new Date(ts);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    monthKey(ts = Date.now()) { return U.dayKey(ts).slice(0, 7); },

    /** Secondes → "2 min 30 s" */
    fmtDur(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      const m = Math.floor(s / 60);
      return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
    },

    /** Nombre aléatoire uniforme (hors provably-fair : cosmétique uniquement) */
    rnd: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    rndInt: (a, b) => Math.floor(U.rnd(a, b + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],

    uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),

    /** Mélange Fisher-Yates (copie) */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },

    /** Arrondi « monnaie virtuelle » : entier de jetons (jamais de fraction affichée) */
    tokens: (n) => Math.floor(Number(n) + 0.5),

    /** Découpe un tableau en morceaux */
    chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; },

    /** Échappe le texte injecté dans du HTML (pseudos, seeds saisies…) */
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },

    /** Coulissant : anime une valeur numérique vers sa cible */
    tween(from, to, ms, onStep, onDone) {
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);          // easeOutCubic
        onStep(from + (to - from) * e, p);
        if (p < 1) requestAnimationFrame(step); else onDone && onDone();
      };
      requestAnimationFrame(step);
    },

    /** Canvas : dimensionne au DPR pour un rendu net */
    fitCanvas(cv, cssW, cssH) {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(cssW * dpr));
      cv.height = Math.max(1, Math.round(cssH * dpr));
      cv.style.width = cssW + 'px';
      cv.style.height = cssH + 'px';
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    }
  });

  /* ------------------------------------------------------------------- BUS */
  /** Bus d'événements minimaliste (pub/sub découplé entre modules). */
  J.Bus = (function () {
    const map = new Map();
    return {
      on(evt, fn) { (map.get(evt) || map.set(evt, []).get(evt)).push(fn); return () => J.Bus.off(evt, fn); },
      off(evt, fn) { const a = map.get(evt); if (a) { const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); } },
      emit(evt, payload) {
        const a = map.get(evt);
        if (a) a.slice().forEach((fn) => { try { fn(payload); } catch (e) { console.warn('[bus]', evt, e); } });
        const any = map.get('*');
        if (any) any.slice().forEach((fn) => { try { fn(evt, payload); } catch (e) { /* noop */ } });
      }
    };
  })();

  /* ------------------------------------------------------------ ÉTAT / STORE */
  /** État par défaut — schéma versionné, migrable. */
  function defaultState() {
    return {
      v: 1,
      created: Date.now(),
      balance: 10000,                       // 10 000 jetons de départ
      pseudo: 'Joueur' + U.rndInt(100, 999),
      settings: {
        sound: true,
        vibration: true,
        motion: true,                        // animations / confettis
        liveFeed: true,                      // faux flux de gros gains
        autoPause: true                      // rappel de pause toutes les 30 min
      },
      stats: {
        bets: 0, wins: 0, wagered: 0, returned: 0, netProfit: 0,
        bestMult: 0, bestWin: 0, bestWinGame: '',
        biggestLoss: 0,
        playMs: 0,
        perGame: {}                          // { id: { bets, wagered, returned, bestMult, wins } }
      },
      history: [],                           // derniers paris (max 250)
      vip: { wagered: 0, level: 0, claimedLevels: [0] },
      quests: { day: '', items: [], reward: 0 },
      daily: { lastClaim: 0, streak: 0, wheelLast: 0, wheelStreak: 0 },
      freeChips: { day: '', used: 0, readyAt: 0 },
      shop: { firstPurchaseUsed: false, purchased: {} },
      spend: { month: '', total: 0, limit: null },   // limite de dépenses mensuelle (achats simulés)
      fair: { serverSeed: '', serverSeedHash: '', prevSeed: '', prevHash: '', clientSeed: '', nonce: 0, cursor: 0, rotatedAt: 0 },
      session: { startedAt: Date.now(), lastPauseAt: Date.now(), rounds: 0 }
    };
  }

  /** Persistance : localStorage, écriture différée pour ne pas bloquer le rendu. */
  J.Store = (function () {
    let state = defaultState();
    let saveTimer = null;

    function deepMerge(base, patch) {
      if (Array.isArray(base) || typeof base !== 'object' || base === null) return patch;
      const out = Object.assign({}, base);
      for (const k in patch) {
        const pv = patch[k];
        out[k] = (pv && typeof pv === 'object' && !Array.isArray(pv) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
          ? deepMerge(base[k], pv) : pv;
      }
      return out;
    }

    const api = {
      get state() { return state; },

      load() {
        try {
          const raw = localStorage.getItem(J.SAVE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            state = deepMerge(defaultState(), saved);
            // Session précédente : on repart d'un horodatage neuf
            state.session = Object.assign({}, state.session, { startedAt: Date.now(), lastPauseAt: Date.now(), rounds: 0 });
            if (!state.pseudo) state.pseudo = 'Joueur' + U.rndInt(100, 999);
          }
        } catch (e) { console.warn('[store] lecture impossible, partie neuve', e); state = defaultState(); }
        return state;
      },

      /** Sauvegarde immédiate */
      flush() {
        try { localStorage.setItem(J.SAVE_KEY, JSON.stringify(state)); }
        catch (e) { console.warn('[store] écriture impossible', e); }
      },

      save() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => { saveTimer = null; api.flush(); }, 220);
      },

      /** Applique un patch et sauvegarde */
      patch(obj) { state = deepMerge(state, obj); api.save(); return state; },

      /** Réinitialise la progression (confirmation demandée par l'UI) */
      reset() {
        const pseudo = state.pseudo;
        state = defaultState();
        state.pseudo = pseudo;
        api.flush();
        return state;
      },

      export() { return JSON.stringify(state, null, 2); }
    };
    return api;
  })();

  /* ----------------------------------------------------------------- ICÔNES */
  /** Icônes SVG inline (aucune dépendance externe). */
  J.icon = {
    dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    crash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 19 9 12l4 3 8-9"/><path d="M21 6h-4M21 6v4"/></svg>',
    mines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>',
    plinko: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14M8 10h8M10 15h4"/><circle cx="12" cy="20" r="2.6"/><circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none"/></svg>',
    limbo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h6"/><path d="M19 16v4M17 18h4"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.6h5M9.5 14.4h5"/></svg>',
    hilo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>',
    keno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/></svg>',
    tower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 21V6l3-3 3 3 3-3 3 3v15z"/><path d="M6 11h12M6 16h12"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>',
    roulette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></svg>',
    blackjack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="12" height="16" rx="2"/><path d="M13 8h8v12a2 2 0 0 1-2 2h-6"/><path d="m17 4 3 3"/></svg>',
    baccarat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="9" r="4"/><circle cx="16" cy="15" r="4"/></svg>',
    slots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16"/><path d="M12 2v2"/></svg>',
    videopoker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h10M9 9l3 3-3 3"/></svg>',
    poker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c2.5 3 5 4.6 5 7a5 5 0 0 1-10 0c0-2.4 2.5-4 5-7z"/><path d="M12 15v6"/>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/></svg>'
  };

  /* --------------------------------------------------------------- CONSTANTES */
  J.CONST = {
    MIN_BET: 10,
    MAX_BET: 100000,
    BET_STEPS: [10, 50, 100, 500, 1000, 5000, 10000, 50000],
    /** Niveaux VIP : index = palier, seuil = total misé cumulé. */
    VIP: [
      { id: 'bronze', name: 'Bronze', badge: 'bronze', need: 0, reward: 0, rakeback: 0.5 },
      { id: 'silver', name: 'Argent', badge: 'silver', need: 25000, reward: 5000, rakeback: 0.75 },
      { id: 'gold', name: 'Or', badge: 'gold', need: 150000, reward: 25000, rakeback: 1.0 },
      { id: 'platinum', name: 'Platine', badge: 'plat', need: 500000, reward: 100000, rakeback: 1.5 },
      { id: 'diamond', name: 'Diamant', badge: 'diam', need: 2000000, reward: 500000, rakeback: 2.0 }
    ],
    PAUSE_MS: 30 * 60 * 1000,     // rappel de jeu responsable toutes les 30 min
    FREE_CHIPS: 2500,             // recharge gratuite quand le solde tombe à zéro
    FREE_CHIPS_DELAY: 25000,      // délai d'attente imposé (anti-spam)
    FREE_CHIPS_PER_DAY: 3,
    HOUSE_DISCLAIMER: 'Jetons virtuels sans valeur monétaire. Divertissement uniquement. 18+.'
  };
})();
