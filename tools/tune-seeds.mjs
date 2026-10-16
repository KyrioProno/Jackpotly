#!/usr/bin/env node
/* Calibrage des graines de mélange.
   Les six machines partagent les compteurs C1..C5, donc les mêmes fréquences de
   symboles (et le même RTP « lignes »). L'ordre des symboles dans la bande joue
   en revanche sur la loi du nombre de scatters visibles : on ne retient donc que
   des graines dont la loi de scatters est IDENTIQUE à celle de la machine de
   référence. Le RTP exact des six machines reste ainsi 96,4997 %.
   Usage : node tools/tune-seeds.mjs  (affichage) */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = {};
new Function('window', readFileSync(join(root, 'src/40-slots-tables.js'), 'utf8'))(win);
const D = win.JACKPOTLY.SLOTS_DATA;
const ref = D.THEMES.find((t) => t.id === 'egypte');
const dist = (reel) => {
  const d = [0, 0, 0, 0];
  for (let i = 0; i < reel.length; i++) { let c = 0; for (let k = 0; k < 3; k++) if (reel[(i + k) % reel.length] === 'S') c++; d[c]++; }
  return d.join(',');
};
const refDist = ref.reels.map(dist);
const seen = ref.reels.map((r) => [r.join('')]);
for (const id of ['dragon', 'gemmes', 'bonbons']) {
  const t = D.THEMES.find((x) => x.id === id);
  const seeds = t.reels.map((r) => r.join(''));           // séquences actuelles
  const ok = t.reels.map(dist).join(' | ') === refDist.join(' | ');
  const distinct = t.reels.every((r, i) => !seen[i].includes(r.join('')));
  console.log(id.padEnd(9),
    'loi de scatters conforme =', ok,
    '· bandes distinctes des autres machines =', distinct,
    '· jokers ' + t.reels.map((r) => r.filter((s) => s === 'W').length).join('·') +
    ' · scatters ' + t.reels.map((r) => r.filter((s) => s === 'S').length).join('·'));
  t.reels.forEach((r, i) => seen[i].push(r.join('')));
}
