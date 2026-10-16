/* =========================================================================
   JACKPOTLY — MOTEUR DE CARTES (partagé par les jeux classiques)
   Représentation compacte d'une carte : un entier de 0 à 51
     · couleur = ⌊c / 13⌋  →  0 ♠ Noir · 1 ♥ Rouge · 2 ♦ Rouge · 3 ♣ Noir
     · hauteur = c % 13    →  0 = 2 … 8 = 10, 9 = V, 10 = D, 11 = R, 12 = A
   Fournit : tirage provably fair, évaluation EXACTE d'une main de 5 cartes
   (base des tables du Video Poker, des comparaisons du Poker et du Blackjack)
   et le rendu HTML commun des cartes.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;

  const RANK = new Int8Array(52);        // hauteur 0..12 de chaque carte
  const SUIT = new Int8Array(52);        // couleur 0..3 de chaque carte
  for (let c = 0; c < 52; c++) { RANK[c] = c % 13; SUIT[c] = (c / 13) | 0; }

  const LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const CATS = [
    'Carte haute', 'Paire', 'Deux paires', 'Brelan', 'Quinte',
    'Couleur', 'Full', 'Carré', 'Quinte flush', 'Quinte flush royale'
  ];

  /* ------------------------------------------------------------ ÉVALUATION */
  const TOP = 0x100000;                  // un score = catégorie × TOP + départage
  const CNT = new Int8Array(13);         // compteurs de hauteurs (réutilisés)
  const DESC = new Int8Array(5);         // hauteurs présentes, décroissantes

  function popcount(x) {
    x = x - ((x >> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
    x = (x + (x >> 4)) & 0x0f0f0f0f;
    return (x * 0x01010101) >> 24;
  }

  /**
   * Score d'une main de 5 cartes : entier comparable (plus grand = meilleur).
   * Encodage : catégorie × 2²⁰ + hauteurs de départage (4 bits chacune).
   *   catégorie 0 carte haute · 1 paire · 2 deux paires · 3 brelan · 4 quinte
   *             5 couleur · 6 full · 7 carré · 8 quinte flush · 9 royale
   */
  function eval5(h) {
    const c0 = h[0], c1 = h[1], c2 = h[2], c3 = h[3], c4 = h[4];
    const a = RANK[c0], b = RANK[c1], c = RANK[c2], d = RANK[c3], e = RANK[c4];
    const s = SUIT[c0];
    const flush = (s === SUIT[c1] && s === SUIT[c2] && s === SUIT[c3] && s === SUIT[c4]);

    const m = (1 << a) | (1 << b) | (1 << c) | (1 << d) | (1 << e);
    let straight = 0;
    if (popcount(m) === 5) {
      const hi = 31 - Math.clz32(m), lo = 31 - Math.clz32(m & -m);
      if (hi - lo === 4) straight = hi + 1;               // 5 … 13 (13 = As haut)
      else if (m === 0x100f) straight = 4;                // A-2-3-4-5 : hauteur 5
    }
    if (straight && flush) return (straight === 13 ? 9 : 8) * TOP + (straight << 16);

    CNT[a]++; CNT[b]++; CNT[c]++; CNT[d]++; CNT[e]++;
    let quad = -1, trip = -1, p1 = -1, p2 = -1, k = 0;
    for (let r = 12; r >= 0; r--) {
      const n = CNT[r];
      if (n) {
        if (k < 5) DESC[k++] = r;
        if (n >= 4) quad = r;
        else if (n === 3) trip = r;
        else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
      }
      CNT[r] = 0;                                          // remise à zéro pour l'appel suivant
    }

    if (quad >= 0) {                                        // carré + kicker
      const kick = quad === DESC[0] ? DESC[1] : DESC[0];
      return 7 * TOP + (quad << 16) + (kick << 12);
    }
    if (trip >= 0 && p1 >= 0) return 6 * TOP + (trip << 16) + (p1 << 12);   // full
    if (flush) return 5 * TOP + (DESC[0] << 16) + (DESC[1] << 12) + (DESC[2] << 8) + (DESC[3] << 4) + DESC[4];
    if (straight) return 4 * TOP + (straight << 16);
    if (trip >= 0) {                                        // brelan + 2 kickers
      const o = [];
      for (let i = 0; i < 5; i++) if (DESC[i] !== trip) o.push(DESC[i]);
      return 3 * TOP + (trip << 16) + (o[0] << 12) + (o[1] << 8);
    }
    if (p2 >= 0) {                                          // deux paires + kicker
      const kick = DESC[0] !== p1 && DESC[0] !== p2 ? DESC[0] : DESC[2];
      return 2 * TOP + (p1 << 16) + (p2 << 12) + (kick << 8);
    }
    if (p1 >= 0) {                                          // paire + 3 kickers
      const o = [];
      for (let i = 0; i < 5 && o.length < 3; i++) if (DESC[i] !== p1) o.push(DESC[i]);
      return 1 * TOP + (p1 << 16) + (o[0] << 12) + (o[1] << 8) + (o[2] << 4);
    }
    return (DESC[0] << 16) + (DESC[1] << 12) + (DESC[2] << 8) + (DESC[3] << 4) + DESC[4];
  }

  /** Combinaisons d'indices pour choisir 5 cartes parmi n (n = 5, 6 ou 7). */
  const COMBOS = {};
  (function build() {
    for (let n = 5; n <= 7; n++) {
      const list = [];
      const idx = [0, 1, 2, 3, 4];
      const rec = (start, depth) => {
        if (depth === 5) { list.push(idx.slice()); return; }
        for (let i = start; i < n; i++) { idx[depth] = i; rec(i + 1, depth + 1); }
      };
      rec(0, 0);
      COMBOS[n] = list;
    }
  })();

  const BEST = [];                       // tampon de 5 cartes pour l'évaluation
  /**
   * Meilleure main de 5 cartes parmi `cards` (5 à 7 cartes).
   * Renvoie { score, cat, hand } où hand est la combinaison gagnante.
   */
  function evalBest(cards) {
    const n = cards.length;
    if (n < 5) return { score: -1, cat: -1, hand: null };
    if (n === 5) {
      const sc = eval5(cards);
      return { score: sc, cat: Math.floor(sc / TOP), hand: cards.slice(0, 5) };
    }
    const combos = COMBOS[n] || COMBOS[7];
    let best = -1, bestIdx = null;
    for (let i = 0; i < combos.length; i++) {
      const cb = combos[i];
      for (let k = 0; k < 5; k++) BEST[k] = cards[cb[k]];
      const sc = eval5(BEST);
      if (sc > best) { best = sc; bestIdx = cb; }
    }
    return { score: best, cat: Math.floor(best / TOP), hand: bestIdx.map((i) => cards[i]) };
  }

  /* ---------------------------------------------------------------- TIRAGES */
  /** Jeu de 52 cartes en entiers 0..51. */
  function deck() {
    const d = new Array(52);
    for (let i = 0; i < 52; i++) d[i] = i;
    return d;
  }

  /**
   * Mélange de Fisher-Yates alimenté par le provably fair : chaque tirage est
   * reproductible à partir des graines révélées.
   */
  function shuffle(d) {
    for (let i = d.length - 1; i > 0; i--) {
      const j = J.Fair.int(0, i);
      const t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  const freshDeck = () => shuffle(deck());

  /* ----------------------------------------------------------------- RENDU */
  /** HTML d'une carte (dos si `c` est null). */
  function html(c, cls) {
    const extra = cls ? ' ' + cls : '';
    if (c == null) return '<span class="pcard back' + extra + '"></span>';
    const r = c % 13, s = (c / 13) | 0;
    /* Index en coin (rang + enseigne) comme sur une vraie carte, plus le motif
       central : les deux index sont décoratifs, le centre reste la référence
       lisible (et c'est lui que lisent les tests). */
    const corner = '<span class="pic"><b>' + LABELS[r] + '</b><i>' + SUITS[s] + '</i></span>';
    return '<span class="pcard' + (s === 1 || s === 2 ? ' red' : '') + extra + '">' + corner +
      '<span class="pr">' + LABELS[r] + '</span><span class="ps">' + SUITS[s] + '</span>' +
      corner.replace('class="pic"', 'class="pic br"') + '</span>';
  }

  /** Texte court d'une carte, ex. « A♠ ». */
  const label = (c) => (c == null ? '—' : LABELS[c % 13] + SUITS[(c / 13) | 0]);

  /** Nom français d'une combinaison, ex. « Paire de valets ». */
  function handName(score) {
    const cat = Math.floor(score / TOP);
    if (cat === 1) return 'Paire de ' + LABELS[((score >> 16) & 15)];
    if (cat === 2) return 'Deux paires';
    if (cat === 0) return 'Carte haute (' + LABELS[((score >> 16) & 15)] + ')';
    return CATS[cat] || '';
  }

  /* -------------------------------------------------------------- BLACKJACK */
  /** Valeur d'une main au Blackjack : l'As vaut 11 tant qu'on ne dépasse pas 21. */
  function blackjackValue(cards) {
    let total = 0, aces = 0;
    for (let i = 0; i < cards.length; i++) {
      const r = RANK[cards[i]];
      if (r === 12) { aces++; total += 11; }
      else total += r >= 9 ? 10 : r + 2;         // 9=V,10=D,11=R valent 10
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }

  J.Cards = {
    RANK, SUIT, LABELS, SUITS, CATS, TOP,
    rank: (c) => RANK[c],
    suit: (c) => SUIT[c],
    red: (c) => SUIT[c] === 1 || SUIT[c] === 2,
    label, html, handName, catName: (cat) => CATS[cat] || '',
    eval5, evalBest, deck, shuffle, freshDeck, blackjackValue,
    /** Hauteur jouable 1..13 (As = 14) pour les comparaisons de hauteur. */
    high: (c) => RANK[c] + 2
  };
})();
