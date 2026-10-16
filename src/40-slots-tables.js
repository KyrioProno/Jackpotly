/* =========================================================================
   JACKPOTLY — MACHINES À SOUS : DONNÉES ET MATHÉMATIQUES EXACTES
   Trois machines (5 rouleaux × 3 lignes visibles, 20 lignes de paiement).

   Modèle « bandes de rouleaux » : chaque rouleau est une bande de 40 symboles
   tirée au hasard à chaque tour. Les bandes sont construites ici de façon
   déterministe (compteurs fixés + mélange à graine fixe) : la fréquence de
   chaque symbole est donc maîtrisée au symbole près, exactement comme sur une
   vraie machine.

   Le RTP est calculé de façon EXACTE, sans simulation :

   1) Lignes de paiement — pour un symbole `s` de probabilité p_i(s) sur le
      rouleau i (le joker 💎 compte pour tout symbole sauf le scatter) :
        P(3 à suivre) = p₁p₂p₃ × (1 − p₄)
        P(4 à suivre) = p₁p₂p₃p₄ × (1 − p₅)
        P(5 à suivre) = p₁p₂p₃p₄p₅
      La somme pondérée par les gains donne l'espérance d'une ligne, et
      l'additivité de l'espérance rend le total exact quel que soit le nombre
      de lignes : RTP_lignes = Σ_s [g₃·P₃ + g₄·P₄ + g₅·P₅].

   2) Scatters — le nombre de scatters visibles sur un rouleau est la somme de
      3 positions d'une fenêtre glissante : sa loi est calculée exactement en
      faisant glisser la fenêtre sur la bande, puis les 5 lois sont convoluées.
      Les scatters ne paient que sur les tours payants.

   3) Tours gratuits — déclenchés par 3 scatters et plus : 10 tours offerts
      avec le multiplicateur progressif 1·1·1·2·2·2·3·3·3·4 (somme = 22). Ils
      ne se redéclenchent pas, ce qui permet de calculer leur espérance
      exactement :  22 × RTP_lignes  +  10 × RTP_scatters.
      (Chaque tour gratuit est une mise gratuite : son espérance est celle
      d'un tour payant, d'où la multiplication par la somme des multiplicateurs.)

   Usage : `node tools/design-slots.mjs` recalcule ces valeurs et peut ajuster
   automatiquement les tables de gains pour viser 96,5 %.
   ========================================================================= */
(function () {
  'use strict';
  const J = (window.JACKPOTLY = window.JACKPOTLY || {});

  const REEL_LEN = 40;

  /* ------------------------------------------------------- LIGNES DE PAIEMENT */
  /* 20 lignes classiques : chaque ligne donne la rangée visée (0 haut, 1 milieu,
     2 bas) sur les 5 rouleaux. */
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0], [1, 2, 2, 2, 1], [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 2, 1, 2, 1],
    [1, 0, 1, 0, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2],
    [0, 1, 2, 2, 2], [2, 1, 0, 0, 0], [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1], [0, 2, 2, 2, 0]
  ];

  /* ------------------------------------------------------------ BANDES */
  /** Mélange déterministe : la même bande est reconstruite à chaque chargement. */
  function buildReel(counts, seed) {
    const pool = [];
    for (const k in counts) for (let i = 0; i < counts[k]; i++) pool.push(k);
    let s = (seed * 2654435761) % 2147483647;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool;
  }

  /* Composition d'un rouleau : F/T/J/K/C/P/A = symboles, W = joker, S = scatter. */
  const C1 = { F: 10, T: 8, J: 7, K: 5, C: 4, P: 3, A: 2, W: 0, S: 1 };
  const C2 = { F: 8, T: 8, J: 7, K: 6, C: 4, P: 3, A: 1, W: 1, S: 2 };
  const C3 = { F: 7, T: 8, J: 7, K: 6, C: 4, P: 3, A: 2, W: 1, S: 2 };
  const C4 = { F: 8, T: 7, J: 7, K: 6, C: 4, P: 3, A: 2, W: 1, S: 2 };
  const C5 = { F: 10, T: 8, J: 7, K: 6, C: 4, P: 2, A: 1, W: 1, S: 1 };

  /* --------------------------------------------------------------- THÈMES */
  /* `pays` = gain d'une ligne, en multiples de la mise de ligne. */
  const THEMES = [
    {
      id: 'egypte',
      name: 'Égypte dorée',
      tagline: 'Le trésor des pharaons',
      colors: { from: '#3a2a08', to: '#0e1526', accent: '#ffc531' },
      sym: {
        A: { e: '🐺', n: 'Anubis' },
        P: { e: '👑', n: 'Pharaon' },
        C: { e: '🏺', n: 'Amphore' },
        K: { e: '🐍', n: 'Cobra' },
        J: { e: '🪲', n: 'Scarabée' },
        T: { e: '🔥', n: 'Flamme' },
        F: { e: '🪙', n: 'Pièce d\'or' },
        W: { e: '💎', n: 'Joker' },
        S: { e: '🔱', n: 'Scatter' }
      },
      pays: { W: { 3: 75.19, 4: 375.94, 5: 2506.26 }, A: { 3: 62.66, 4: 250.63, 5: 1253.13 }, P: { 3: 37.59, 4: 150.38, 5: 626.57 }, C: { 3: 25.06, 4: 100.25, 5: 375.94 }, K: { 3: 15.04, 4: 50.13, 5: 200.5 }, J: { 3: 12.53, 4: 37.59, 5: 150.38 }, T: { 3: 10.03, 4: 30.08, 5: 112.78 }, F: { 3: 7.52, 4: 25.06, 5: 100.18 } }
    },
    {
      id: 'neon',
      name: 'Fruits Néon',
      tagline: 'Les classiques en néon',
      colors: { from: '#2b0b34', to: '#0d1526', accent: '#ff4fa3' },
      sym: {
        A: { e: '7️⃣', n: 'Sept' },
        P: { e: '🍉', n: 'Pastèque' },
        C: { e: '🔔', n: 'Cloche' },
        K: { e: '🍇', n: 'Raisin' },
        J: { e: '🍋', n: 'Citron' },
        T: { e: '🍒', n: 'Cerise' },
        F: { e: '🍊', n: 'Orange' },
        W: { e: '⭐', n: 'Joker' },
        S: { e: '🎰', n: 'Scatter' }
      },
      pays: { W: { 3: 75.19, 4: 375.94, 5: 2506.26 }, A: { 3: 62.66, 4: 250.63, 5: 1253.13 }, P: { 3: 37.59, 4: 150.38, 5: 626.57 }, C: { 3: 25.06, 4: 100.25, 5: 375.94 }, K: { 3: 15.04, 4: 50.13, 5: 200.5 }, J: { 3: 12.53, 4: 37.59, 5: 150.38 }, T: { 3: 10.03, 4: 30.08, 5: 112.78 }, F: { 3: 7.52, 4: 25.06, 5: 100.18 } }
    },
    {
      id: 'jackpotly',
      name: 'Aventure Jackpotly',
      tagline: 'Cap sur le trésor',
      colors: { from: '#062b2a', to: '#0b1526', accent: '#00e37a' },
      sym: {
        A: { e: '🐉', n: 'Dragon' },
        P: { e: '🏆', n: 'Trophée' },
        C: { e: '🎲', n: 'Dé' },
        K: { e: '⚓', n: 'Ancre' },
        J: { e: '🧭', n: 'Boussole' },
        T: { e: '🪙', n: 'Pièce' },
        F: { e: '📜', n: 'Parchemin' },
        W: { e: '💎', n: 'Joker' },
        S: { e: '💰', n: 'Scatter' }
      },
      pays: { W: { 3: 75.19, 4: 375.94, 5: 2506.26 }, A: { 3: 62.66, 4: 250.63, 5: 1253.13 }, P: { 3: 37.59, 4: 150.38, 5: 626.57 }, C: { 3: 25.06, 4: 100.25, 5: 375.94 }, K: { 3: 15.04, 4: 50.13, 5: 200.5 }, J: { 3: 12.53, 4: 37.59, 5: 150.38 }, T: { 3: 10.03, 4: 30.08, 5: 112.78 }, F: { 3: 7.52, 4: 25.06, 5: 100.18 } }
    }
  ];

  /* Graines distinctes par thème : les bandes diffèrent d'une machine à l'autre. */
  const SEEDS = {
    egypte: [11, 101, 202, 307, 401],
    neon: [17, 131, 233, 331, 433],
    jackpotly: [23, 149, 257, 353, 457]
  };

  THEMES.forEach((t) => {
    t.counts = [C1, C2, C3, C4, C5];
    t.reels = SEEDS[t.id].map((seed, i) => buildReel(t.counts[i], seed));
    t.freeSpins = 10;
    t.multSchedule = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4];
    t.scatterPays = { 3: 1, 4: 5, 5: 25 };     // en multiples de la mise TOTALE
  });

  /* ---------------------------------------------------- MATHÉMATIQUES EXACTES */
  /** Probabilité que le rouleau i « réponde » au symbole s (joker compris). */
  function matchProb(reel, s) {
    let n = 0;
    for (let i = 0; i < reel.length; i++) {
      if (reel[i] === s) n++;
      else if (s !== 'W' && s !== 'S' && reel[i] === 'W') n++;   // le joker remplace tout sauf le scatter
    }
    return n / reel.length;
  }

  /** Loi exacte du nombre de scatters visibles sur un rouleau (fenêtre de 3). */
  function scatterDist(reel) {
    const L = reel.length;
    const d = [0, 0, 0, 0];
    for (let i = 0; i < L; i++) {
      let c = 0;
      for (let k = 0; k < 3; k++) if (reel[(i + k) % L] === 'S') c++;
      d[c]++;
    }
    return d.map((n) => n / L);
  }

  /** Convolution des 5 lois : loi exacte du nombre total de scatters visibles. */
  function scatterTotal(reels) {
    let acc = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    reels.forEach((r) => {
      const d = scatterDist(r);
      const next = new Array(acc.length).fill(0);
      for (let i = 0; i < acc.length; i++) {
        if (!acc[i]) continue;
        for (let k = 0; k < 4 && i + k < next.length; k++) next[i + k] += acc[i] * d[k];
      }
      acc = next;
    });
    return acc;
  }

  /**
   * RTP exact d'un thème, détaillé. Renvoie des fractions (0,965 = 96,5 %).
   * `pays` peut être remplacé pour tester une autre table de gains.
   */
  function rtp(theme, paysOverride) {
    const pays = paysOverride || theme.pays;
    const reels = theme.reels;

    // 1) lignes : espérance par ligne, en multiples de la mise de ligne
    let lines = 0;
    const perSymbol = {};
    Object.keys(pays).forEach((s) => {
      const p = reels.map((r) => matchProb(r, s));
      const p3 = p[0] * p[1] * p[2], p4 = p3 * p[3], p5 = p4 * p[4];
      const e3 = pays[s][3] * p3 * (1 - p[3]);
      const e4 = pays[s][4] * p4 * (1 - p[4]);
      const e5 = pays[s][5] * p5;
      perSymbol[s] = e3 + e4 + e5;
      lines += e3 + e4 + e5;
    });

    // 2) scatters : gain moyen par tour, en multiples de la mise totale
    const dist = scatterTotal(reels);
    let scatters = 0, q = 0;
    for (let k = 3; k <= 15; k++) {
      scatters += dist[k] * theme.scatterPays[Math.min(5, k)];
      q += dist[k];
    }
    const dist5 = dist[5];                                   // les 5 scatters payent le maximum

    // 3) tours gratuits : 22 × RTP_lignes + 10 × RTP_scatters par déclenchement
    const multSum = theme.multSchedule.reduce((a, b) => a + b, 0);
    const free = q * (multSum * lines + theme.freeSpins * scatters);

    return {
      id: theme.id, name: theme.name,
      lines, scatters, free, total: lines + scatters + free,
      q, multSum, dist, perSymbol, dist5,
      // fréquence de chaque symbole par rouleau (contrôle des bandes)
      perReel: reels.map((r) => {
        const o = {};
        r.forEach((s) => { o[s] = (o[s] || 0) + 1; });
        return o;
      })
    };
  }

  J.SLOTS_DATA = {
    REEL_LEN, LINES, THEMES, SEEDS, buildReel, matchProb, scatterDist, scatterTotal, rtp
  };
})();
