/* =========================================================================
   JACKPOTLY — SYMBOLES DES MACHINES À SOUS (v0.4.0)
   -------------------------------------------------------------------------
   Chaque machine a ses NEUF symboles dessinés ici en SVG : aucun emoji, donc
   un rendu identique sur tous les appareils, et un jeu de pictogrammes
   cohérent avec l'univers (Égypte, dragons, gemmes, fruits, bonbons,
   aventure).

   Convention : chaque dessin est construit dans une boîte 0..100, avec un ou
   deux dégradés définis dans le <defs> du pictogramme. `J.SlotArt.svg(key, id)`
   renvoie le SVG complet, `J.SlotArt.keys(id)` la liste des symboles d'une
   machine — utilisée par les tests et par le tableau des gains.

   Les dessins ne dépendent d'aucune ressource externe : ce sont des tracés,
   donc ils s'affichent même hors ligne et ne pèsent que quelques kilo-octets.
   ========================================================================= */
(function () {
  'use strict';
  const J = (window.JACKPOTLY = window.JACKPOTLY || {});
  const A = (J.SlotArt = {});

  /* ------------------------------------------------------- OUTILS DE DESSIN */
  const P = (d, extra) => '<path d="' + d + '"' + (extra || '') + '/>';
  const C = (cx, cy, r, extra) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (extra || '') + '/>';
  const R = (x, y, w, h, rx, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '"' + (extra || '') + '/>';
  const E = (cx, cy, rx, ry, extra) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"' + (extra || '') + '/>';
  const G = (id, from, to, x1, y1, x2, y2) => '<linearGradient id="' + id + '" x1="' + (x1 || 0) + '" y1="' + (y1 || 0) + '" x2="' + (x2 || 0) + '" y2="' + (y2 || 1) + '">' +
    '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/></linearGradient>';
  const G3 = (id, a, b, c) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + a + '"/><stop offset=".55" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></linearGradient>';
  const Rg = (id, stops) => '<radialGradient id="' + id + '" cx=".38" cy=".3" r=".8">' +
    stops.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>').join('') + '</radialGradient>';

  /* ------------------------------------------------------------- UNIVERS A
     TRÉSORS D'ÉGYPTE — or, turquoise, bleu nuit. */
  const EGYPTE = {
    /* Joker : œil d'Horus dans un anneau turquoise */
    W: (id) => '<defs>' + Rg(id + 'g', [[0, '#eafcff'], [.5, '#22d3ee'], [1, '#0e7490']]) + G(id + 'o', '#fff3c4', '#c98a06') + '</defs>' +
      C(50, 50, 40, ' fill="url(#' + id + 'g)" stroke="url(#' + id + 'o)" stroke-width="4"') +
      P('M50 20c14 10 22 18 22 30s-10 26-22 30c-12-4-22-18-22-30s8-20 22-30z', ' fill="#04222b" opacity=".55"') +
      P('M22 50c8-8 17-12 28-12s20 4 28 12c-8 8-17 12-28 12s-20-4-28-12z', ' fill="url(#' + id + 'o)"') +
      C(50, 50, 9, ' fill="#062a33"') + C(50, 50, 4, ' fill="url(#' + id + 'g)"') +
      P('M50 62c-3 8-12 14-20 16 6-8 8-13 8-18', ' fill="url(#' + id + 'o)" opacity=".9"'),
    /* Anubis : gardien de la nécropole, le symbole le plus payant */
    A: (id) => '<defs>' + G3(id + 'g', '#f8fafc', '#94a3b8', '#1e293b') + G(id + 'o', '#fff3c4', '#c98a06') + '</defs>' +
      C(50, 50, 39, ' fill="none" stroke="url(#' + id + 'o)" stroke-width="5"') +
      P('M50 22c9 0 16 6 16 15v14c0 12-7 22-16 27-9-5-16-15-16-27V37c0-9 7-15 16-15z', ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2"') +
      P('M36 26 30 6l14 10zM64 26 70 6 56 16z', ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2" stroke-linejoin="round"') +
      C(43, 42, 3.2, ' fill="#ffd257"') + C(57, 42, 3.2, ' fill="#ffd257"') +
      P('M50 50c-4 6-3 12 0 16 3-4 4-10 0-16z', ' fill="#0b1220"') +
      P('M40 74h20', ' stroke="url(#' + id + 'o)" stroke-width="4" stroke-linecap="round"'),
    /* Pharaon */
    P: (id) => '<defs>' + G3(id + 'g', '#ffe9a8', '#f0a500', '#7a4a00') + G(id + 'b', '#38bdf8', '#0369a1') + '</defs>' +
      P('M50 14 76 30 74 74 50 88 26 74 24 30z', ' fill="url(#' + id + 'g)" stroke="#5a3200" stroke-width="2"') +
      P('M34 20c3-8 10-12 16-12s13 4 16 12l-6 4H40z', ' fill="url(#' + id + 'b)"') +
      P('M28 34h44v6H28zM30 46h40v6H30z', ' fill="url(#' + id + 'b)" opacity=".85"') +
      C(41, 54, 3.6, ' fill="#2a1a00"') + C(59, 54, 3.6, ' fill="#2a1a00"') +
      P('M42 68h16l-4 6h-8z', ' fill="#2a1a00"') + C(50, 66, 2.4, ' fill="#ff2e63"'),
    /* Amphore */
    C: (id) => '<defs>' + G3(id + 'g', '#68e6f7', '#0891b2', '#083344') + G(id + 'o', '#ffe9a8', '#c98a06') + '</defs>' +
      P('M38 16h24l-4 8H42z', ' fill="url(#' + id + 'o)"') +
      P('M42 24c-10 10-16 22-16 34 0 14 11 24 24 24s24-10 24-24c0-12-6-24-16-34z', ' fill="url(#' + id + 'g)" stroke="#06343f" stroke-width="2"') +
      P('M26 44h48', ' stroke="url(#' + id + 'o)" stroke-width="5" stroke-linecap="round"') +
      P('M30 62c4 8 12 12 20 12', ' stroke="#eafcff" stroke-width="3" opacity=".45" fill="none" stroke-linecap="round"') +
      C(50, 52, 7, ' fill="#04222b" opacity=".35"'),
    /* Cobra */
    K: (id) => '<defs>' + G3(id + 'g', '#a7f3d0', '#059669', '#064e3b') + G(id + 'o', '#ffe9a8', '#c98a06') + '</defs>' +
      P('M50 14c10 0 18 8 18 18 0 8-5 12-11 15-8 4-12 9-12 17 0 6 4 10 10 10h10c3 0 5 2 5 5s-2 5-5 5H52c-12 0-21-9-21-21 0-14 8-22 18-26 6-3 9-5 9-9 0-4-3-7-8-7-6 0-11 4-13 9l-8-4c3-9 12-12 21-12z', ' fill="url(#' + id + 'g)"') +
      C(50, 20, 2.6, ' fill="#ff2e63"') + P('M44 44c4 3 8 3 12 0', ' stroke="#eafff5" stroke-width="2" fill="none" opacity=".5"') +
      P('M30 30h6M64 30h6', ' stroke="url(#' + id + 'o)" stroke-width="3" stroke-linecap="round"'),
    /* Scarabée */
    J: (id) => '<defs>' + Rg(id + 'g', [[0, '#0ea5e9'], [.6, '#1d4ed8'], [1, '#0c1a3a']]) + G(id + 'o', '#ffd257', '#a16207') + '</defs>' +
      E(50, 56, 20, 24, ' fill="url(#' + id + 'g)" stroke="url(#' + id + 'o)" stroke-width="3"') +
      P('M50 32c-6 0-9 4-9 9h18c0-5-3-9-9-9z', ' fill="url(#' + id + 'o)"') +
      P('M30 44C16 38 8 44 6 54c10-2 18 0 24 6M70 44c14-6 22 0 24 10-10-2-18 0-24 6', ' fill="none" stroke="url(#' + id + 'o)" stroke-width="4" stroke-linecap="round"') +
      P('M44 40h12', ' stroke="#0b1020" stroke-width="3" stroke-linecap="round"') +
      P('M38 34 44 26M62 34 56 26', ' stroke="url(#' + id + 'o)" stroke-width="3" stroke-linecap="round"'),
    /* Flamme (torche) */
    T: (id) => '<defs>' + G3(id + 'f', '#fff3c4', '#ff9d00', '#ff2e63') + G(id + 'o', '#ffe9a8', '#a16207') + '</defs>' +
      P('M50 10c8 12 20 20 20 34 0 12-9 22-20 22s-20-10-20-22c0-14 12-22 20-34z', ' fill="url(#' + id + 'f)"') +
      P('M50 34c4 6 9 10 9 17 0 6-4 11-9 11s-9-5-9-11c0-7 5-11 9-17z', ' fill="#fffbe8" opacity=".85"') +
      R(44, 66, 12, 22, 3, ' fill="url(#' + id + 'o)"'),
    /* Pièce d'or */
    F: (id) => '<defs>' + G3(id + 'g', '#fff3c4', '#ffd257', '#b45309') + '</defs>' +
      C(50, 50, 38, ' fill="url(#' + id + 'g)" stroke="#7c4a02" stroke-width="3"') +
      C(50, 50, 30, ' fill="none" stroke="#7c4a02" stroke-width="2" opacity=".55"') +
      P('M50 26v48M40 40c0-5 4-8 10-8s10 3 10 8-4 7-10 9-10 4-10 9 4 8 10 8 10-3 10-8', ' stroke="#7c4a02" stroke-width="5" fill="none" stroke-linecap="round"') +
      P('M34 30c6-6 12-9 20-10', ' stroke="#fffbe8" stroke-width="4" opacity=".6" fill="none" stroke-linecap="round"'),
    /* Scatter : croix de vie égyptienne */
    S: (id) => '<defs>' + G3(id + 'g', '#eafcff', '#22d3ee', '#0e7490') + G(id + 'o', '#fff3c4', '#a16207') + '</defs>' +
      C(50, 28, 17, ' fill="none" stroke="url(#' + id + 'g)" stroke-width="9"') +
      R(43, 44, 14, 46, 5, ' fill="url(#' + id + 'g)"') +
      R(28, 54, 44, 12, 5, ' fill="url(#' + id + 'g)"') +
      C(50, 28, 6, ' fill="#04222b" opacity=".5"') +
      C(50, 28, 17, ' fill="none" stroke="url(#' + id + 'o)" stroke-width="3"')
  };

  /* ------------------------------------------------------------- UNIVERS B
     ROYAUME DES DRAGONS — rouge, orange, or, noir. */
  const DRAGON = {
    W: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff3c4'], [.55, '#ff9d00'], [1, '#7c2d12']]) + '</defs>' +
      P('M50 6c6 14 14 20 26 24-10 6-16 14-18 26 12-10 26-12 38-4-14 6-24 18-28 34-10-14-24-22-40-22 12-10 18-24 18-40 0-8 2-14 4-18z', ' fill="url(#' + id + 'g)"') +
      C(50, 40, 6, ' fill="#fffbe8"') + C(50, 40, 3, ' fill="#7c2d12"') +
      P('M44 26c-6-8-4-16 2-20M58 26c6-8 4-16-2-20', ' stroke="#7c2d12" stroke-width="3" fill="none" stroke-linecap="round"'),
    P: (id) => '<defs>' + G3(id + 'g', '#ff9d9d', '#dc2626', '#7f1d1d') + G(id + 'o', '#ffe9a8', '#a16207') + '</defs>' +
      P('M50 12c14 0 26 12 26 26 0 6-2 11-5 15l10 22c2 5-2 10-8 8l-20-6c-1 0-2 0-3 1l-20 5c-6 2-10-3-8-8l10-22c-3-4-5-9-5-15 0-14 12-26 26-26z', ' fill="url(#' + id + 'g)" stroke="#450a0a" stroke-width="2"') +
      P('M34 40c6-6 10-6 14 0-4 8-10 8-14 0zM52 40c4-6 8-6 14 0-4 8-10 8-14 0z', ' fill="#fffbe8"') +
      C(41, 41, 3, ' fill="#1a0505"') + C(59, 41, 3, ' fill="#1a0505"') +
      P('M40 62c6 6 14 6 20 0', ' stroke="url(#' + id + 'o)" stroke-width="4" fill="none" stroke-linecap="round"') +
      P('M30 22c-8-4-16-2-20 4 8 0 14 4 18 10M70 22c8-4 16-2 20 4-8 0-14 4-18 10', ' fill="url(#' + id + 'o)"'),
    C: (id) => '<defs>' + Rg(id + 'g', [[0, '#ffe9a8'], [.5, '#ffd257'], [1, '#b45309']]) + '</defs>' +   /* cristal de feu */
      P('M50 8 78 40 50 92 22 40z', ' fill="url(#' + id + 'g)" stroke="#7c2d12" stroke-width="2.5"') +
      P('M50 8 50 92M22 40h56', ' stroke="#7c2d12" stroke-width="2" opacity=".6"') +
      P('M50 8 36 40 50 92 64 40z', ' fill="#fffbe8" opacity=".35"'),
    K: (id) => '<defs>' + G3(id + 'g', '#fca5a5', '#b91c1c', '#450a0a') + '</defs>' +          /* écaille */
      P('M50 10c20 8 34 26 34 46 0 18-15 34-34 34S16 74 16 56c0-20 14-38 34-46z', ' fill="url(#' + id + 'g)" stroke="#2a0505" stroke-width="2"') +
      P('M50 24c10 6 18 16 18 28S58 74 50 74 32 64 32 52s8-22 18-28z', ' fill="none" stroke="#ffe9a8" stroke-width="2.5" opacity=".65"') +
      P('M50 40c6 4 10 8 10 14s-4 10-10 10-10-4-10-10 4-10 10-14z', ' fill="none" stroke="#ffe9a8" stroke-width="2" opacity=".5"'),
    J: (id) => '<defs>' + G3(id + 'g', '#fdba74', '#ea580c', '#7c2d12') + '</defs>' +          /* griffe */
      P('M30 12c4 20 4 36-4 56-2 5 2 10 8 8 8-3 14-8 18-16 6-12 8-26 6-44l-10 20-6-24-6 22z', ' fill="url(#' + id + 'g)" stroke="#3a0a02" stroke-width="2"') +
      P('M56 30c8 16 12 30 10 46 0 4 4 7 8 4 6-5 10-12 12-21 4-14 2-28-4-40l-6 22-8-24-4 22z', ' fill="url(#' + id + 'g)" stroke="#3a0a02" stroke-width="2" opacity=".92"'),
    T: (id) => '<defs>' + G3(id + 'f', '#fff3c4', '#ff6a00', '#b91c1c') + '</defs>' +          /* flamme */
      P('M50 8c10 16 26 24 26 42 0 14-12 26-26 26S24 64 24 50C24 32 40 24 50 8z', ' fill="url(#' + id + 'f)"') +
      P('M50 32c5 8 12 12 12 22 0 8-5 14-12 14s-12-6-12-14c0-10 7-14 12-22z', ' fill="#fffbe8" opacity=".85"') +
      C(50, 62, 5, ' fill="#ff2e63" opacity=".55"'),
    F: (id) => '<defs>' + G3(id + 'g', '#fff3c4', '#ffd257', '#b45309') + '</defs>' +           /* pièce au dragon */
      C(50, 50, 38, ' fill="url(#' + id + 'g)" stroke="#7c4a02" stroke-width="3"') +
      P('M28 62c10-24 26-36 44-38-10 12-14 24-12 36-10-6-22-6-32 2z', ' fill="#7c2a02" opacity=".7"') +
      C(50, 50, 30, ' fill="none" stroke="#7c4a02" stroke-width="2" opacity=".5"'),
    S: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff3c4'], [.45, '#ff6a00'], [1, '#7f1d1d']]) + '</defs>' +  /* œuf de dragon */
      E(50, 54, 26, 34, ' fill="url(#' + id + 'g)" stroke="#3a0a02" stroke-width="3"') +
      P('M32 44c8 6 14 4 18-2s12-6 20 0M30 64c10 6 16 4 20-2s12-6 20 0', ' stroke="#3a0a02" stroke-width="2.5" fill="none" opacity=".6"') +
      C(50, 30, 4, ' fill="#fffbe8" opacity=".8"'),
    /* Tête de dragon : l'emblème de l'univers, symbole le plus payant */
    A: (id) => DRAGON.P(id)
  };

  /* ------------------------------------------------------------- UNIVERS C
     GEMMES & LUXE — violet, bleu électrique, rose, argent. */
  const GEMMES = {
    W: (id) => '<defs>' + Rg(id + 'g', [[0, '#ffffff'], [.45, '#a855f7'], [1, '#4c1d95']]) + '</defs>' +
      P('M50 6 84 38 50 94 16 38z', ' fill="url(#' + id + 'g)" stroke="#2e1065" stroke-width="2"') +
      P('M50 6 66 38 50 94 34 38z', ' fill="#fff" opacity=".38"') +
      P('M16 38h68M50 6 50 94', ' stroke="#2e1065" stroke-width="1.6" opacity=".5"') +
      P('M28 26 34 18', ' stroke="#fff" stroke-width="4" opacity=".8" stroke-linecap="round"'),
    A: (id) => '<defs>' + G(id + 'o', '#fff6d8', '#b98a2a') + Rg(id + 'g', [[0, '#fff'], [.4, '#f472b6'], [1, '#9d174d']]) + '</defs>' +   /* bague sertie */
      C(50, 66, 22, ' fill="none" stroke="url(#' + id + 'o)" stroke-width="7"') +
      P('M50 12 67 30 50 50 33 30z', ' fill="url(#' + id + 'g)" stroke="#fff" stroke-width="2" stroke-linejoin="round"') +
      P('M33 30h34M50 12v38', ' stroke="#fff" stroke-width="1.6" opacity=".65"') +
      P('M40 18 45 10M60 18 55 10', ' stroke="url(#' + id + 'o)" stroke-width="3" stroke-linecap="round"'),
    P: (id) => '<defs>' + Rg(id + 'g', [[0, '#ffd6f0'], [.45, '#ff2e63'], [1, '#7f1d4d']]) + '</defs>' +   /* rubis taille brillant */
      P('M30 22h40l16 20-36 40-36-40z', ' fill="url(#' + id + 'g)" stroke="#4c0519" stroke-width="2"') +
      P('M30 22l10 20h20l10-20M20 42h60M50 42v40', ' stroke="#4c0519" stroke-width="1.6" opacity=".55" fill="none"') +
      P('M36 28l6 8', ' stroke="#fff" stroke-width="3.4" opacity=".8" stroke-linecap="round"'),
    C: (id) => '<defs>' + Rg(id + 'g', [[0, '#e0f2fe'], [.45, '#38bdf8'], [1, '#075985']]) + '</defs>' +   /* saphir ovale */
      E(50, 52, 30, 38, ' fill="url(#' + id + 'g)" stroke="#082f49" stroke-width="2"') +
      E(50, 52, 20, 27, ' fill="none" stroke="#f0f9ff" stroke-width="2" opacity=".45"') +
      E(40, 38, 8, 12, ' fill="#fff" opacity=".38" transform="rotate(-24 40 38)"'),
    K: (id) => '<defs>' + Rg(id + 'g', [[0, '#d1fae5'], [.45, '#10b981'], [1, '#064e3b']]) + '</defs>' +  /* émeraude carrée */
      P('M24 24h52v52H24z', ' fill="url(#' + id + 'g)" stroke="#022c22" stroke-width="2" transform="rotate(45 50 50)"') +
      P('M40 40l20 20M60 40 40 60', ' stroke="#f0fdf4" stroke-width="2" opacity=".4"') +
      P('M32 32 40 24', ' stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"'),
    J: (id) => '<defs>' + Rg(id + 'g', [[0, '#f5f3ff'], [.45, '#8b5cf6'], [1, '#3730a3']]) + '</defs>' +   /* améthyste poire */
      P('M50 10c18 0 30 14 30 30 0 20-14 30-30 50-16-20-30-30-30-50 0-16 12-30 30-30z', ' fill="url(#' + id + 'g)" stroke="#1e1b4b" stroke-width="2"') +
      P('M50 20v44', ' stroke="#ede9fe" stroke-width="2" opacity=".4"') +
      P('M38 30c4-4 8-6 12-6', ' stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"'),
    T: (id) => '<defs>' + G3(id + 'g', '#fef9c3', '#facc15', '#a16207') + '</defs>' +           /* topaze / citrine */
      P('M50 8 88 50 50 92 12 50z', ' fill="url(#' + id + 'g)" stroke="#713f12" stroke-width="2"') +
      P('M50 8 69 50 50 92 31 50z', ' fill="#fffbe8" opacity=".42"') +
      P('M12 50h76', ' stroke="#713f12" stroke-width="1.4" opacity=".4"'),
    F: (id) => '<defs>' + Rg(id + 'g', [[0, '#ffffff'], [.5, '#cbd5e1'], [1, '#64748b']]) + '</defs>' +   /* diamant brut / argent */
      P('M50 8 82 30 70 92 30 92 18 30z', ' fill="url(#' + id + 'g)" stroke="#334155" stroke-width="2"') +
      P('M18 30h64M34 30l16 62M66 30 50 92', ' stroke="#334155" stroke-width="1.6" fill="none" opacity=".45"') +
      P('M40 22 50 14', ' stroke="#fff" stroke-width="3" opacity=".85" stroke-linecap="round"'),
    S: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff'], [.4, '#22d3ee'], [1, '#6d28d9']]) + '</defs>' +      /* diadème (scatter) */
      P('M16 74 26 30l16 22 8-32 8 32 16-22 10 44z', ' fill="url(#' + id + 'g)" stroke="#2e1065" stroke-width="2"') +
      R(16, 74, 68, 10, 4, ' fill="#a855f7"') +
      C(26, 30, 5, ' fill="#22d3ee"') + C(50, 20, 5, ' fill="#ff2e63"') + C(74, 30, 5, ' fill="#38bdf8"')
  };

  /* ------------------------------------------------------------ FRUITS NÉON
     Classiques réinterprétés au néon : cerise, citron, raisin, melon, cloche, 7, BAR. */
  const FRUITS = {
    W: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff8d6'], [.5, '#ffd257'], [1, '#b45309']]) + '</defs>' +
      P('M50 6 64 38h-9l14 30H59l12 26H29l12-26h-10l14-30h-9z', ' fill="url(#' + id + 'g)" stroke="#7c4a02" stroke-width="2"') +
      P('M50 6 50 58', ' stroke="#fffbe8" stroke-width="2" opacity=".5"'),
    A: (id) => '<defs>' + G3(id + 'g', '#fff8d6', '#ffd257', '#b45309') + Rg(id + 'n', [[0, '#f0abfc'], [1, '#a855f7']]) + '</defs>' +   /* le Sept doré */
      R(16, 10, 68, 80, 16, ' fill="none" stroke="url(#' + id + 'n)" stroke-width="4" opacity=".85"') +
      P('M30 30h40l-9 15c-6 12-9 22-9 33H40c0-14 4-26 12-40H30z', ' fill="url(#' + id + 'g)" stroke="#7c4a02" stroke-width="2" stroke-linejoin="round"') +
      C(37, 26, 4, ' fill="#fff8d6" opacity=".9"'),
    P: (id) => '<defs>' + Rg(id + 'p', [[0, '#fecdd3'], [.45, '#f43f5e'], [1, '#7f1d4d']]) + '</defs>' +  /* pastèque */
      P('M50 90C24 74 12 54 12 40a38 38 0 0 1 76 0c0 14-12 34-38 50z', ' fill="url(#' + id + 'p)" stroke="#4c0519" stroke-width="2"') +
      P('M50 84C30 70 20 54 20 42a30 30 0 0 1 60 0c0 12-10 28-30 42z', ' fill="#86efac" opacity=".85"') +
      P('M50 84V44', ' stroke="#166534" stroke-width="2"') +
      C(40, 60, 2.6, ' fill="#166534"') + C(60, 60, 2.6, ' fill="#166534"') + C(50, 72, 2.6, ' fill="#166534"'),
    C: (id) => '<defs>' + G3(id + 'g', '#fff6c9', '#facc15', '#a16207') + '</defs>' +           /* cloche */
      P('M50 14c4 0 7 3 7 7v4c16 5 26 19 26 36v12H17V61c0-17 10-31 26-36v-4c0-4 3-7 7-7z', ' fill="url(#' + id + 'g)" stroke="#713f12" stroke-width="2"') +
      R(13, 73, 74, 9, 4, ' fill="#eab308" stroke="#713f12" stroke-width="1.6"') +
      C(50, 88, 7, ' fill="#eab308" stroke="#713f12" stroke-width="1.6"') +
      P('M40 34c-8 6-14 16-15 28', ' stroke="#fffbe8" stroke-width="3.4" opacity=".55" fill="none" stroke-linecap="round"'),
    K: (id) => '<defs>' + Rg(id + 'g', [[0, '#e9d5ff'], [.5, '#a855f7'], [1, '#4c1d95']]) + '</defs>' +  /* raisin */
      [[50, 30], [38, 44], [62, 44], [50, 46], [26, 58], [74, 58], [38, 60], [62, 60], [50, 62], [50, 78]]
        .map((p) => C(p[0], p[1], 11, ' fill="url(#' + id + 'g)" stroke="#2e1065" stroke-width="1.4"')).join('') +
      P('M50 22c0-8 6-12 12-12-2 8-6 12-12 12z', ' fill="#22c55e"') +
      P('M50 30V16', ' stroke="#166534" stroke-width="3" stroke-linecap="round"'),
    J: (id) => '<defs>' + Rg(id + 'j', [[0, '#fef9c3'], [.5, '#fde047'], [1, '#a16207']]) + '</defs>' +  /* citron */
      E(50, 54, 32, 38, ' fill="url(#' + id + 'j)" stroke="#713f12" stroke-width="2" transform="rotate(-16 50 54)"') +
      P('M50 16c-2-8 2-12 8-14-2 8-4 12-8 14z', ' fill="#22c55e"') +
      E(40, 44, 9, 13, ' fill="#fffbe8" opacity=".45" transform="rotate(-20 40 44)"'),
    T: (id) => '<defs>' + Rg(id + 'f', [[0, '#ffe4e6'], [.45, '#f43f5e'], [1, '#881337']]) + '</defs>' +  /* cerise */
      C(38, 66, 19, ' fill="url(#' + id + 'f)" stroke="#4c0519" stroke-width="2"') +
      C(66, 72, 16, ' fill="url(#' + id + 'f)" stroke="#4c0519" stroke-width="2"') +
      P('M38 47c2-14 8-24 18-30M66 56c0-16 2-28 6-36', ' stroke="#15803d" stroke-width="4" fill="none" stroke-linecap="round"') +
      P('M50 24c10-6 22-6 32 2-12 2-22 6-30 14', ' fill="#22c55e"') +
      C(32, 60, 5, ' fill="#fff" opacity=".5"'),
    F: (id) => '<defs>' + Rg(id + 'f', [[0, '#ffedd5'], [.45, '#fb923c'], [1, '#9a3412']]) + '</defs>' +  /* orange */
      C(50, 58, 34, ' fill="url(#' + id + 'f)" stroke="#7c2d12" stroke-width="2"') +
      P('M50 24c-2-8 2-14 10-16-2 10-4 14-10 16z', ' fill="#22c55e"') +
      P('M50 26V14', ' stroke="#15803d" stroke-width="3.4" stroke-linecap="round"') +
      C(38, 48, 9, ' fill="#fff" opacity=".3"'),
    S: (id) => '<defs>' + Rg(id + 'g', [[0, '#fef9c3'], [.45, '#f43f5e'], [1, '#701a75']]) + '</defs>' +  /* « NEON » : flèche néon */
      P('M50 10 78 44h-14l14 18H22l14-18H22z', ' fill="url(#' + id + 'g)" stroke="#4a044e" stroke-width="2"') +
      R(34, 62, 32, 26, 5, ' fill="#f43f5e" stroke="#4a044e" stroke-width="2"') +
      P('M42 68h16M42 76h16', ' stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".9"')
  };

  /* ---------------------------------------------------------------- BONBONS */
  const BONBONS = {
    W: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff'], [.4, '#ff8fc8'], [1, '#be185d']]) + '</defs>' +
      C(50, 50, 34, ' fill="url(#' + id + 'g)" stroke="#831843" stroke-width="2"') +
      P('M50 16c8 10 14 18 14 30 0 8-6 14-14 14s-14-6-14-14c0-12 6-20 14-30z', ' fill="#fff" opacity=".9"') +
      C(50, 50, 34, ' fill="none" stroke="#fda4af" stroke-width="3"'),
    A: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff'], [.45, '#f472b6'], [1, '#be185d']]) + G(id + 'w', '#ffffff', '#e2e8f0') + '</defs>' +   /* cœur en sucre */
      P('M50 84S16 62 16 40c0-11 8-18 17-18 7 0 13 4 17 11 4-7 10-11 17-11 9 0 17 7 17 18 0 22-34 44-34 44z', ' fill="url(#' + id + 'g)" stroke="#7f1d4d" stroke-width="2" stroke-linejoin="round"') +
      P('M50 36v42M30 30c-6 8-8 18-6 28M70 30c6 8 8 18 6 28', ' stroke="url(#' + id + 'w)" stroke-width="3" fill="none" opacity=".8" stroke-linecap="round"'),
    P: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff1f2'], [.45, '#fb7185'], [1, '#9f1239']]) + '</defs>' +  /* sucre d'orge */
      C(50, 50, 32, ' fill="url(#' + id + 'g)" stroke="#881337" stroke-width="2"') +
      P('M50 18a32 32 0 0 0 0 64', ' fill="none" stroke="#fff" stroke-width="9" opacity=".85"') +
      P('M50 50 82 30', ' stroke="#fffbe8" stroke-width="5" stroke-linecap="round"') +
      C(50, 50, 7, ' fill="#fff" opacity=".8"'),
    C: (id) => '<defs>' + G3(id + 'g', '#a7f3d0', '#34d399', '#065f46') + '</defs>' +          /* guimauve verte */
      R(22, 34, 56, 40, 16, ' fill="url(#' + id + 'g)" stroke="#064e3b" stroke-width="2"') +
      R(30, 40, 40, 12, 6, ' fill="#fff" opacity=".55"') +
      P('M30 74h40', ' stroke="#fda4af" stroke-width="3" stroke-linecap="round"'),
    K: (id) => '<defs>' + Rg(id + 'g', [[0, '#e0f2fe'], [.45, '#38bdf8'], [1, '#1e40af']]) + '</defs>' +  /* ours en gélatine bleu */
      C(50, 34, 20, ' fill="url(#' + id + 'g)" stroke="#1e3a8a" stroke-width="2"') +
      C(30, 22, 8, ' fill="url(#' + id + 'g)" stroke="#1e3a8a" stroke-width="2"') +
      C(70, 22, 8, ' fill="url(#' + id + 'g)" stroke="#1e3a8a" stroke-width="2"') +
      E(50, 66, 24, 26, ' fill="url(#' + id + 'g)" stroke="#1e3a8a" stroke-width="2"') +
      C(43, 30, 3.4, ' fill="#0b1220"') + C(57, 30, 3.4, ' fill="#0b1220"') +
      P('M44 40c4 4 8 4 12 0', ' stroke="#0b1220" stroke-width="2.4" fill="none" stroke-linecap="round"') +
      C(50, 74, 8, ' fill="#fff" opacity=".4"'),
    J: (id) => '<defs>' + G3(id + 'g', '#fde68a', '#f59e0b', '#78350f') + '</defs>' +          /* caramel */
      R(24, 26, 52, 50, 10, ' fill="url(#' + id + 'g)" stroke="#78350f" stroke-width="2"') +
      P('M24 42c14 8 38 8 52 0M24 60c14 8 38 8 52 0', ' stroke="#fff8e1" stroke-width="3" fill="none" opacity=".45"') +
      P('M40 26v50', ' stroke="#78350f" stroke-width="2.4" opacity=".35"'),
    T: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff'], [.45, '#c084fc'], [1, '#5b21b6']]) + '</defs>' +   /* sucette violette */
      C(50, 46, 30, ' fill="url(#' + id + 'g)" stroke="#4c1d95" stroke-width="2"') +
      P('M50 16a30 30 0 0 1 26 15', ' fill="none" stroke="#fff" stroke-width="8" opacity=".8"') +
      P('M50 46 76 32', ' stroke="#fffbe8" stroke-width="4.4" stroke-linecap="round"') +
      R(46, 74, 8, 20, 3, ' fill="#fff8e1" stroke="#a16207" stroke-width="1.6"'),
    F: (id) => '<defs>' + Rg(id + 'g', [[0, '#ffffff'], [.45, '#60a5fa'], [1, '#1e3a8a']]) + '</defs>' +  /* bonbon enveloppé */
      E(50, 54, 24, 20, ' fill="url(#' + id + 'g)" stroke="#1e3a8a" stroke-width="2"') +
      P('M26 54 6 38v32zM74 54l20-16v32z', ' fill="#93c5fd" stroke="#1e3a8a" stroke-width="2"') +
      P('M40 44c6 8 6 12 0 20', ' stroke="#fff" stroke-width="3.4" opacity=".7" fill="none" stroke-linecap="round"'),
    S: (id) => '<defs>' + Rg(id + 'g', [[0, '#fff'], [.45, '#22d3ee'], [1, '#6d28d9']]) + '</defs>' +     /* pluie de bonbons (scatter) */
      C(34, 34, 13, ' fill="#fb7185" stroke="#831843" stroke-width="2"') +
      C(66, 40, 11, ' fill="#facc15" stroke="#713f12" stroke-width="2"') +
      C(42, 66, 12, ' fill="#38bdf8" stroke="#1e3a8a" stroke-width="2"') +
      C(70, 72, 9, ' fill="#34d399" stroke="#065f46" stroke-width="2"') +
      P('M28 30 40 38M60 36 72 44M36 62 48 70', ' stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"')
  };

  /* ---------------------------------------------------------------- AVENTURE
     Cap sur le trésor : coffre, boussole, ancre, perroquet, kraken… */
  const AVENTURE = {
    W: (id) => '<defs>' + G3(id + 'g', '#fef9c3', '#facc15', '#a16207') + '</defs>' +
      C(50, 50, 34, ' fill="none" stroke="url(#' + id + 'g)" stroke-width="9"') +
      C(50, 50, 14, ' fill="none" stroke="url(#' + id + 'g)" stroke-width="9"') +
      P('M50 6v14M50 80v14M6 50h14M80 50h14', ' stroke="url(#' + id + 'g)" stroke-width="8" stroke-linecap="round"'),
    A: (id) => '<defs>' + G3(id + 'g', '#fde68a', '#b45309', '#78350f') + G(id + 'o', '#e2e8f0', '#94a3b8') + '</defs>' +   /* gouvernail du capitaine */
      P('M50 34V12M50 66v22M34 50H12M66 50h22', ' stroke="url(#' + id + 'g)" stroke-width="7" stroke-linecap="round"') +
      P('M50 34 76 22M50 66 24 78M34 50 22 22M66 50 78 78', ' stroke="url(#' + id + 'g)" stroke-width="5" stroke-linecap="round"') +
      C(50, 10, 7, ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2"') +
      C(50, 90, 7, ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2"') +
      C(10, 50, 7, ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2"') +
      C(90, 50, 7, ' fill="url(#' + id + 'g)" stroke="#0b1220" stroke-width="2"') +
      C(50, 50, 15, ' fill="url(#' + id + 'o)" stroke="#0b1220" stroke-width="2"') + C(50, 50, 6, ' fill="#0b1220"'),
    P: (id) => '<defs>' + G3(id + 'g', '#fcd34d', '#b45309', '#78350f') + '</defs>' +          /* coffre */
      R(18, 44, 64, 42, 6, ' fill="url(#' + id + 'g)" stroke="#451a03" stroke-width="2"') +
      P('M18 46c0-18 14-28 32-28s32 10 32 28z', ' fill="#d97706" stroke="#451a03" stroke-width="2"') +
      R(44, 40, 12, 20, 3, ' fill="#fef9c3" stroke="#451a03" stroke-width="2"') +
      C(50, 50, 3.4, ' fill="#451a03"') +
      P('M18 60h64', ' stroke="#451a03" stroke-width="2" opacity=".5"'),
    C: (id) => '<defs>' + Rg(id + 'g', [[0, '#fef9c3'], [.45, '#fbbf24'], [1, '#92400e']]) + '</defs>' +  /* boussole */
      C(50, 52, 34, ' fill="url(#' + id + 'g)" stroke="#78350f" stroke-width="3"') +
      C(50, 52, 26, ' fill="#082f49" opacity=".85"') +
      P('M50 52 64 30 50 44 36 30z', ' fill="#f43f5e"') +
      P('M50 52 36 74 50 60 64 74z', ' fill="#e2e8f0"') +
      C(50, 52, 3, ' fill="#fef9c3"') +
      P('M50 18v6M50 80v6M16 52h6M78 52h6', ' stroke="#78350f" stroke-width="3" stroke-linecap="round"'),
    K: (id) => '<defs>' + G3(id + 'g', '#cbd5e1', '#64748b', '#1e293b') + '</defs>' +          /* ancre */
      C(50, 22, 11, ' fill="none" stroke="url(#' + id + 'g)" stroke-width="8"') +
      P('M50 33v52M28 48h44', ' stroke="url(#' + id + 'g)" stroke-width="8" stroke-linecap="round"') +
      P('M20 60c0 20 14 32 30 32s30-12 30-32', ' fill="none" stroke="url(#' + id + 'g)" stroke-width="8" stroke-linecap="round"') +
      P('M14 58l6 4-6 4M86 58l-6 4 6 4', ' fill="url(#' + id + 'g)"'),
    J: (id) => '<defs>' + G3(id + 'g', '#fca5a5', '#dc2626', '#7f1d1d') + '</defs>' +          /* perroquet */
      E(50, 56, 24, 28, ' fill="url(#' + id + 'g)" stroke="#450a0a" stroke-width="2"') +
      C(50, 30, 16, ' fill="url(#' + id + 'g)" stroke="#450a0a" stroke-width="2"') +
      P('M66 30c8-4 14-2 18 4-8 2-14 6-18 12z', ' fill="#fbbf24" stroke="#78350f" stroke-width="1.6"') +
      C(46, 28, 3.6, ' fill="#0b1220"') + C(46, 28, 1.6, ' fill="#fff"') +
      P('M50 46c-8 6-12 14-12 24', ' stroke="#fbbf24" stroke-width="4" fill="none" stroke-linecap="round"') +
      P('M36 76c10 6 20 6 30 0', ' stroke="#fbbf24" stroke-width="4" fill="none" stroke-linecap="round"'),
    T: (id) => '<defs>' + G3(id + 'g', '#a7f3d0', '#10b981', '#064e3b') + '</defs>' +          /* carte au trésor */
      P('M16 22 40 14 60 22 84 14v64L60 86 40 78 16 86z', ' fill="url(#' + id + 'g)" stroke="#064e3b" stroke-width="2"') +
      P('M40 14v64M60 22v64', ' stroke="#064e3b" stroke-width="1.6" opacity=".45"') +
      P('M30 46l10-12 8 10 8-14', ' stroke="#7f1d1d" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-dasharray="5 4"') +
      C(66, 56, 5, ' fill="#f43f5e" stroke="#7f1d1d" stroke-width="1.6"'),
    F: (id) => '<defs>' + G3(id + 'g', '#fde68a', '#f59e0b', '#78350f') + '</defs>' +          /* lingot */
      P('M20 74 34 36h32l14 38z', ' fill="url(#' + id + 'g)" stroke="#451a03" stroke-width="2"') +
      P('M34 36 28 74h48l-6-38z', ' fill="#fffbe8" opacity=".22"') +
      P('M40 44h20', ' stroke="#451a03" stroke-width="2" opacity=".4"'),
    S: (id) => '<defs>' + Rg(id + 'g', [[0, '#6ee7b7'], [.45, '#059669'], [1, '#022c22']]) + '</defs>' +  /* œil du kraken (scatter) */
      C(50, 50, 34, ' fill="url(#' + id + 'g)" stroke="#022c22" stroke-width="3"') +
      E(50, 50, 22, 14, ' fill="#fef9c3"') +
      C(50, 50, 9, ' fill="#022c22"') +
      C(54, 46, 3, ' fill="#fff" opacity=".9"') +
      P('M22 40 10 26M78 40l12-14M28 66 14 80M72 66l14 14', ' stroke="url(#' + id + 'g)" stroke-width="7" stroke-linecap="round"')
  };

  A.SETS = { egypte: EGYPTE, dragon: DRAGON, gemmes: GEMMES, neon: FRUITS, bonbons: BONBONS, jackpotly: AVENTURE };

  /* ---------------------------------------------------------------- API --- */
  const REEL_ID = 'e';
  /**
   * SVG d'un symbole. `theme` = identifiant d'univers (`egypte`, `dragon`,
   * `gemmes`, `neon`, `bonbons`, `jackpotly`), `key` = lettre du symbole.
   * Renvoie une chaîne vide si le symbole n'existe pas : l'appelant garde
   * alors son repli (jamais de case vide).
   */
  A.svg = function (theme, key, uid) {
    const set = A.SETS[theme] || A.SETS.egypte;
    const fn = set[key] || (A.SETS.egypte[key]);
    if (!fn) return '';
    const id = REEL_ID + (uid || '') + theme + key;
    return '<svg class="sym-svg" viewBox="0 0 100 100" aria-hidden="true">' + fn(id) + '</svg>';
  };

  /** Pictogramme de présentation (marquee du lobby, badges). */
  A.emblem = function (theme, uid) {
    const set = A.SETS[theme] || A.SETS.egypte;
    const key = { egypte: 'P', dragon: 'P', gemmes: 'W', neon: 'A', bonbons: 'W', jackpotly: 'C' }[theme] || 'W';
    return A.svg(theme, set[key] ? key : 'W', 'm' + (uid || ''));
  };

  A.keys = (theme) => Object.keys(A.SETS[theme] || A.SETS.egypte);

  /** Noms français des symboles, pour le tableau des gains. */
  A.label = function (theme, key) {
    const N = {
      egypte: { W: 'Œil d\'Horus', P: 'Pharaon', C: 'Amphore', K: 'Cobra', J: 'Scarabée', T: 'Flamme', F: 'Pièce d\'or', S: 'Croix de vie' },
      dragon: { W: 'Braise', P: 'Dragon rouge', C: 'Cristal de feu', K: 'Écaille', J: 'Griffe', T: 'Flamme', F: 'Pièce au dragon', S: 'Œuf de dragon' },
      gemmes: { W: 'Diamant', P: 'Rubis', C: 'Saphir', K: 'Émeraude', J: 'Améthyste', T: 'Topaze', F: 'Cristal brut', S: 'Diadème' },
      neon: { W: 'Sept', P: 'Pastèque', C: 'Cloche', K: 'Raisin', J: 'Citron', T: 'Cerise', F: 'Orange', S: 'Flèche néon' },
      bonbons: { W: 'Bonbon magique', P: 'Sucre d\'orge', C: 'Guimauve', K: 'Ourson', J: 'Caramel', T: 'Sucette', F: 'Bonbon', S: 'Pluie de bonbons' },
      jackpotly: { W: 'Poulie dorée', P: 'Coffre au trésor', C: 'Boussole', K: 'Ancre', J: 'Perroquet', T: 'Carte au trésor', F: 'Lingot', S: 'Œil du kraken' }
    };
    return (N[theme] || N.egypte)[key] || key;
  };
})();
