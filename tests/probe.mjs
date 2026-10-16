#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — SONDE DE DÉVELOPPEMENT
   Monte un jeu dans un DOM simulé, clique TOUS ses boutons un par un (scène,
   panneau, modales) et signale la moindre exception. Sert à vérifier qu'un
   nouveau jeu ne lève aucune erreur avant d'écrire ses tests définitifs.

   Usage : node tests/probe.mjs roulette [nbPasses]
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'jackpotly.html'), 'utf8');
const gameId = process.argv[2] || 'roulette';
const passes = parseInt(process.argv[3] || '2', 10);

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.error('jsdom manquant : `npm install --no-save jsdom`'); process.exit(2); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://jackpotly.local/',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
    if (!window.navigator.vibrate) { try { window.navigator.vibrate = () => true; } catch { /* noop */ } }
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  }
});
const win = dom.window, doc = win.document;
win.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
dom.virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));

await wait(300);
const J = win.JACKPOTLY;
if (!J || !J.Games) { console.error('L\'application ne s\'est pas chargée'); process.exit(1); }
const def = J.GAMES.find((x) => x.id === gameId);
if (!def) { console.error('Jeu inconnu : ' + gameId + ' — dispo : ' + J.GAMES.map((x) => x.id).join(', ')); process.exit(1); }
if (def.status !== 'live') console.log('⚠️  ' + gameId + ' est encore en feuille de route (status ' + def.status + ')');

J.Wallet.credit(500000, 'probe');
J.Games.open(gameId);
await wait(120);
let g = J.Games.instance();
if (!g) { console.error('Le jeu ne s\'est pas monté'); process.exit(1); }
console.log('▶ ' + def.name + ' monté · mise ' + g.bet + ' · solde ' + J.Wallet.balance);

const seen = new Set();
let clicks = 0, thrown = 0;

/** Clique un élément en absorbant les exceptions (remontées + comptées). */
function safeClick(el) {
  try { el.click(); clicks++; }
  catch (e) { thrown++; errors.push('clic ' + (el.dataset.act || el.dataset.type || el.dataset.num || el.id || el.className) + ' → ' + e.message); }
}

async function clickAll(sel, max) {
  // Re-requête à chaque clic : les jeux reconstruisent leurs boutons après
  // chaque action, un tableau figé ne pointerait que sur des nœuds détachés.
  for (let i = 0, guard = 0; i < max && guard < max * 2; i++, guard++) {
    const list = [...doc.querySelectorAll(sel)];
    if (i >= list.length) break;
    const b = list[i];
    seen.add((b.dataset.act || b.id || '?') + ':' + b.textContent.trim().slice(0, 18));
    safeClick(b);
    await wait(30);
  }
}

for (let pass = 0; pass < passes; pass++) {
  // 1) réglages du panneau d'abord (« Effacer », type de mise, valeur du jeton…)
  await clickAll('#gPanel button:not([data-act="play"])', 40);
  await clickAll('#modalBox button', 6);
  const close = doc.querySelector('#modalBox [data-close], #sheetBox [data-close]');
  if (close) { safeClick(close); await wait(40); }
  // 2) puis la scène : mises, cartes, symboles
  await clickAll('#gStage button:not([data-g="back"])', 60);
  // 3) enfin la manche, en re-remplissant le tapis si besoin
  for (let t = 0; t < 3; t++) {
    let play = doc.querySelector('#gPanel button[data-act="play"]:not([disabled])');
    if (!play) { await clickAll('#gStage button:not([data-g="back"])', 12); play = doc.querySelector('#gPanel button[data-act="play"]:not([disabled])'); }
    if (!play) break;
    safeClick(play);
    await wait(4600);                                          // laisse l'animation finir
  }
}

// Laisse tourner les animations restantes
await wait(3000);
g = J.Games.instance();

console.log('· clics : ' + clicks + ' · boutons distincts : ' + seen.size);
console.log('· parties jouées : ' + (J.Store.state.stats.perGame[gameId] ? J.Store.state.stats.perGame[gameId].bets : 0));
console.log('· solde : ' + J.Wallet.balance + ' · mise courante : ' + (g ? g.bet : '-'));
console.log('· historique : ' + (g ? g.history.slice(0, 8).map((m) => m.toFixed(2)).join(' ') : '-'));

if (errors.length) {
  console.log('\n❌ ' + errors.length + ' erreur(s) :');
  [...new Set(errors)].slice(0, 14).forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
if (thrown) { console.log('\n❌ ' + thrown + ' exception(s) au clic'); process.exit(1); }
console.log('\n✅ aucune exception');
process.exit(0);
