#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — CONCEPTION DES TABLES DE GAINS (Keno)
   Génère les tables de gains du Keno avec un RTP cible, puis les imprime
   sous forme de littéral JS prêt à coller dans src/38-game-keno.js.

   Méthode :
     1. Probabilités exactes P(h correspondances | k numéros choisis sur 40,
        10 numéros tirés) via la loi hypergéométrique.
     2. Une forme de gains (shape) par niveau de risque : quelles
        correspondances paient, et de combien relativement.
     3. Mise à l'échelle λ telle que Σ P(h)·λ·shape(h) = RTP cible.
     4. Arrondi des multiplicateurs, puis calcul du RTP réel (affiché en jeu).

   Usage : node tools/design-tables.mjs
   ========================================================================= */

/* ------------------------------------------------ probabilités exactes */
const C = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
};
const TOTAL = C(40, 10);                                  // 847 660 528 tirages possibles

/** Proba d'exactement h correspondances en choisissant k numéros sur 40. */
const prob = (k, h) => (C(k, h) * C(40 - k, 10 - h)) / TOTAL;

/* ------------------------------------------------------- arrondi « casino » */
function roundMult(m) {
  if (m >= 1000) return Math.round(m / 10) * 10;
  if (m >= 100) return Math.round(m);
  if (m >= 10) return Math.round(m * 10) / 10;
  return Math.round(m * 100) / 100;
}

/* --------------------------------------------------------------- conception */
const RTP_TARGET = 0.975;                                  // Keno annoncé à 97,5 %

const RISKS = {
  // « Classique » : paie souvent, multiplicateurs modestes
  classic: { label: 'Classique', hMinRatio: 0.5, base: 2.1, round: 0.5 },
  // « Moyen »
  medium: { label: 'Moyen', hMinRatio: 0.6, base: 2.8, round: 0.6 },
  // « Élevé » : paie rarement, gros multiplicateurs
  high: { label: 'Élevé', hMinRatio: 0.7, base: 3.6, round: 0.7 }
};

const tables = {};
const report = [];

for (const riskId of Object.keys(RISKS)) {
  const cfg = RISKS[riskId];
  tables[riskId] = {};
  for (let k = 1; k <= 10; k++) {
    const hMin = Math.max(1, Math.min(k, Math.round(k * cfg.hMinRatio)));
    // Forme : 0 pour h < hMin, puis croissance géométrique
    const shape = [];
    for (let h = 0; h <= k; h++) shape.push(h < hMin ? 0 : Math.pow(cfg.base, h - hMin));
    // Mise à l'échelle pour atteindre le RTP cible
    let ev = 0;
    for (let h = 0; h <= k; h++) ev += prob(k, h) * shape[h];
    const lambda = RTP_TARGET / ev;
    // Arrondi des multiplicateurs (le gain doit rester ≥ 1 pour être « gagnant »)
    const table = shape.map((v) => {
      if (v === 0) return 0;
      const m = roundMult(v * lambda);
      return Math.max(m >= 1 ? m : 0, 0) === 0 && v > 0 ? roundMult(v * lambda) : m;
    });
    // RTP réel après arrondi
    let rtp = 0;
    for (let h = 0; h <= k; h++) rtp += prob(k, h) * table[h];
    tables[riskId][k] = table;
    report.push({
      risk: cfg.label, k, hMin, top: table[k], rtp: rtp * 100,
      tirage: `P(${k}/${k}) = ${(prob(k, k) * 100).toFixed(5)} %`
    });
  }
}

/* ----------------------------------------------------------------- rapport */
console.log('KENO — 40 numéros, 10 tirés — RTP cible ' + (RTP_TARGET * 100) + ' %\n');
console.log('risque    | k  | top gain | RTP réel | proba de tout trouver');
console.log('----------|----|----------|----------|----------------------');
report.forEach((r) => {
  console.log(
    r.risk.padEnd(9) + ' | ' + String(r.k).padStart(2) + ' | ' +
    (r.top + 'x').padStart(8) + ' | ' +
    (r.rtp.toFixed(2) + ' %').padStart(8) + ' | ' + r.tirage
  );
});
const rtps = report.map((r) => r.rtp);
console.log('\nRTP min ' + Math.min(...rtps).toFixed(2) + ' % · max ' + Math.max(...rtps).toFixed(2) +
  ' % · moyenne ' + (rtps.reduce((a, b) => a + b, 0) / rtps.length).toFixed(2) + ' %');

/* ------------------------------------------- littéral JS prêt à intégrer */
console.log('\n\n/* ---- à coller dans src/38-game-keno.js ---- */');
console.log('const PAYTABLES = {');
for (const riskId of Object.keys(tables)) {
  console.log('  ' + riskId + ': {');
  for (let k = 1; k <= 10; k++) {
    console.log('    ' + k + ': [' + tables[riskId][k].join(', ') + '],' +
      '   // ' + report.find((r) => r.risk === RISKS[riskId].label && r.k === k).rtp.toFixed(2) + ' %');
  }
  console.log('  },');
}
console.log('};');
