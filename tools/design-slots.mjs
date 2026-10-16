#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — CALIBRAGE DES MACHINES À SOUS
   Recalcule le RTP EXACT des trois thèmes à partir des bandes de rouleaux,
   contrôle la composition des bandes, et peut ajuster automatiquement les
   tables de gains pour viser 96,5 % (option --tune, qui réécrit le fichier).

   Usage : node tools/design-slots.mjs [--tune] [--target 96.5]
   ========================================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/40-slots-tables.js');

/* --- Chargement du module de données dans un contexte minimal ------------- */
function load(file) {
  const code = readFileSync(file, 'utf8');
  const win = {};
  new Function('window', code)(win);
  return win.JACKPOTLY.SLOTS_DATA;
}

const args = process.argv.slice(2);
const tune = args.includes('--tune');
const target = (() => {
  const i = args.indexOf('--target');
  return (i >= 0 ? parseFloat(args[i + 1]) : 96.5) / 100;
})();

let D = load(file);
const pct = (x) => (x * 100).toFixed(4).replace('.', ',') + ' %';

/* --- 1) Contrôle des bandes ---------------------------------------------- */
console.log('BANDES DE ROULEAUX (' + D.REEL_LEN + ' symboles)');
let bad = 0;
D.THEMES.forEach((t) => {
  t.reels.forEach((r, i) => {
    const c = {};
    r.forEach((s) => { c[s] = (c[s] || 0) + 1; });
    const total = r.length;
    const ok = total === D.REEL_LEN && r.filter((s) => s === 'S').length >= 1;
    if (!ok) { bad++; console.log('  ✗ ' + t.id + ' rouleau ' + (i + 1) + ' : ' + total + ' symboles'); }
  });
  const counts = t.counts.map((c, i) => Object.entries(c).map(([k, v]) => k + v).join(' '));
  console.log('  ' + (bad ? '✗' : '✓') + ' ' + t.name.padEnd(20) +
    ' jokers/rouleau ' + t.reels.map((r) => r.filter((s) => s === 'W').length).join('·') +
    ' · scatters/rouleau ' + t.reels.map((r) => r.filter((s) => s === 'S').length).join('·'));
  void counts;
});

/* --- 2) RTP exact --------------------------------------------------------- */
function report(D, label) {
  console.log('\n' + label);
  D.THEMES.forEach((t) => {
    const r = D.rtp(t);
    console.log('  ' + t.name.padEnd(20) +
      ' lignes ' + pct(r.lines) + ' · scatters ' + pct(r.scatters) +
      ' · tours gratuits ' + pct(r.free) + '  →  RTP ' + pct(r.total) +
      '   (P(3+ scatters) = ' + (r.q * 100).toFixed(2).replace('.', ',') + ' %)');
  });
}

report(D, 'RTP EXACT AVANT AJUSTEMENT');

/* --- 3) Ajustement : les gains de ligne sont mis à l'échelle ------------- */
if (tune) {
  let src = readFileSync(file, 'utf8');
  D.THEMES.forEach((t) => {
    // Le gain de ligne et les tours gratuits sont proportionnels à la table de
    // gains, mais les scatters ne le sont pas : on résout exactement
    //     cible = k × gains_lignes(1 + 22q) + scatters(1 + 10q)
    const r = D.rtp(t);
    const q = r.q;
    const k = (target - r.scatters * (1 + (t.freeSpins || 10) * q)) / (r.lines * (1 + r.multSum * q));
    const pays = JSON.parse(JSON.stringify(t.pays));
    Object.keys(pays).forEach((s) => {
      [3, 4, 5].forEach((i) => { pays[s][i] = Math.round(pays[s][i] * k * 100) / 100; });
    });

    // Réglage exact : on ajuste le 5-sur-5 du symbole le plus fréquent (F), dont
    // la sensibilité est la plus forte — un centième suffit à coller à la cible.
    const after = D.rtp(t, pays);
    const p5 = t.reels.reduce((a, reel) => a * D.matchProb(reel, 'F'), 1);
    const sens = p5 * (1 + after.multSum * after.q);
    pays.F[5] = Math.round((pays.F[5] + (target - after.total) / sens) * 100) / 100;

    const final = D.rtp(t, pays);
    console.log('  · ' + t.id.padEnd(10) + ' gains × ' + k.toFixed(3) +
      ' · 5-sur-5 de base ajusté à ' + pays.F[5] + ' → RTP ' + pct(final.total));

    // réécriture de la table de gains dans le source, au format d'origine
    const fmt = (o) => '{ ' + Object.keys(o).map((key) =>
      key + ': { 3: ' + o[key][3] + ', 4: ' + o[key][4] + ', 5: ' + o[key][5] + ' }').join(', ') + ' }';
    const re = new RegExp("(id: '" + t.id + "'[\\s\\S]*?pays: )[^\\n]*");
    if (!re.test(src)) { console.log('  ⚠ table non reconnue pour ' + t.id); return; }
    src = src.replace(re, '$1' + fmt(pays));
  });
  writeFileSync(file, src, 'utf8');
  D = load(file);
  report(D, 'RTP EXACT APRÈS AJUSTEMENT');
  const off = D.THEMES.map((t) => Math.abs(D.rtp(t).total - target) * 100);
  console.log('\nécart maximal à la cible : ' + Math.max.apply(null, off).toFixed(4) + ' point(s) de %');
}
if (bad) process.exit(1);
