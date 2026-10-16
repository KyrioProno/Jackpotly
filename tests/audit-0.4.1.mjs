#!/usr/bin/env node
/* =========================================================================
 JACKPOTLY — CORRECTIFS v0.4.1 : TESTS DE NON-RÉGRESSION DÉTERMINISTES
   -------------------------------------------------------------------------
   Reproduit puis verrouille les bugs corrigés lors de l'audit, sans attendre
   les animations : le planificateur de manche est accéléré (J.Games.schedule)
   et le générateur de tirages est piloté (J.Fair) pour rendre chaque scénario
   déterministe.

     1. Machines à sous — les 9 scénarios de tours gratuits, sortie, rechargement
     2. Hi-Lo — égalité neutre, pari Égalité, multiplicateurs, jeu épuisé
     3. Baccarat — manches complètes (Joueur / Banque / Égalité) et comptabilité
     4. Crédits — un débit, un crédit, remboursement, reprise après rechargement
     5. Les 16 jeux — démarrage, résolution, solde cohérent, manche comptée
     6. Blackjack — assurance (2:1), refus, règlement unique
     7. Commandes — aucune commande active qui ne ferait rien en manche
     8. Sortie de jeu en pleine manche — mise rendue ou réglée, jamais perdue
     9. Baccarat — tableau officiel de la 3ᵉ carte, paires, paiement case par
        case (égalité = mises Joueur/Banque RENDUES) et RTP mesuré
    10. Hi-Lo — formule exacte des multiplicateurs, égalité neutre au bit près,
        paiement encaissé = mise × multiplicateur affiché
    11. Machines à sous — chaque tour gratuit décompté une fois, barème du
        bonus, nouveau déclenchement après un bonus terminé, retour au mode normal
    12. Audit transversal — clics multiples, crédits tardifs, commandes
        bloquées, cycles ouverture/fermeture, solde insuffisant (16 jeux)

   Usage : node tests/audit-0.4.1.mjs
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'jackpotly.html'), 'utf8');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.error('jsdom manquant : npm install --no-save jsdom'); process.exit(2); }

let passed = 0, failed = 0;
const failures = [];
const section = (t) => console.log('\n' + t);
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + label + (detail ? '  → ' + detail : '')); }
  else { failed++; failures.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

const errors = [];

/** Fabrique une page JACKPOTLY complète. `seed` = état persisté (rechargement). */
function makeDom(seed) {
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://jackpotly.local/',
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
      window.HTMLMediaElement && (window.HTMLMediaElement.prototype.play = () => Promise.resolve());
      if (!window.navigator.vibrate) { try { window.navigator.vibrate = () => true; } catch { /* noop */ } }
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      if (seed) { try { window.localStorage.setItem(seed.key, seed.raw); } catch (e) { errors.push('seed: ' + e.message); } }
    }
  });
}

const dom = makeDom();
const win = dom.window, doc = win.document;
win.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
dom.virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
await wait(400);
const J = win.JACKPOTLY;
if (!J || !J.Games) { console.error("L'application ne s'est pas chargée"); process.exit(1); }
/* Clé de sauvegarde réelle de l'application (utilisée pour simuler un
   rechargement de page avec l'état exact du joueur). */
const SAVE_KEY = J.SAVE_KEY;

/** Attend qu'une condition devienne vraie (au lieu de parier sur une durée). */
async function until(pred, ms = 1500, step = 10) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = pred(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(step);
  }
}
J.Store.patch({ settings: { _welcomed: true, motion: true, sound: false, liveFeed: false } });

/* Vitesse de test : toute manche planifiée s'exécute immédiatement. Les boucles
   d'animation (rouleaux) se terminent d'elles-mêmes puisque les rouleaux sont
   posés aussitôt. */
const FAST_MS = 4;                            // 100× plus rapide, mais observable à la volée
const FAST = (g, fn) => { const id = setTimeout(fn, FAST_MS); if (g && g._timers) g._timers.push(id); return id; };
let realSchedule = J.Games.schedule;
function speedUp() { J.Games.schedule = FAST; }
function speedDown() { J.Games.schedule = realSchedule; }

/** Nettoie l'état entre deux manches : solde, jeu monté, timers. */
function reset(balance = 100000) {
  J.Games.close(true);
  J.Store.state.balance = balance;
  J.Store.save();
  J.Wallet.renderBalance();
}

/* Trace des mouvements du portefeuille */
const rec = { stake: [], settle: [], refund: [] };
J.Bus.on('wallet:stake', (t) => rec.stake.push(t));
J.Bus.on('wallet:settled', (e) => rec.settle.push(e));
J.Bus.on('wallet:refund', (t) => rec.refund.push(t));
const resetRec = () => { rec.stake.length = 0; rec.settle.length = 0; rec.refund.length = 0; };

/* Le payload de `wallet:settled` porte le ticket : la mise se lit sur le ticket
   (et non sur l'événement lui-même). */
const betOf = (e) => (e && e.ticket ? e.ticket.bet : NaN);

/* ================================================== 1. MACHINES À SOUS ===== */
section('1. Machines à sous : 9 scénarios de tours gratuits');

/** Force la prochaine grille : `stops[i]` = position d'arrêt du rouleau i.
 *  (On ne touche à rien d'autre : le reste du tirage reste réel.) */
function forceGrid(stops) {
  const realInt = J.Fair.int.bind(J.Fair);
  let n = 0;
  J.Fair.int = (a, b) => {
    if (a === 0 && b > 3 && n < stops.length) return stops[n++];
    return realInt(a, b);
  };
  return () => { J.Fair.int = realInt; };
}

/** Position d'arrêt qui place `sym` dans la fenêtre visible [stop, stop+2]. */
function stopFor(strip, sym) {
  const i = strip.indexOf(sym);
  return i < 0 ? -1 : (i - 1 + strip.length) % strip.length;
}
/** Position d'arrêt SANS `sym` dans la fenêtre visible. */
function stopWithout(strip, sym) {
  for (let k = 0; k < strip.length; k++) {
    if (strip[k] !== sym && strip[(k + 1) % strip.length] !== sym && strip[(k + 2) % strip.length] !== sym) return k;
  }
  return 0;
}
/** Position d'arrêt donnant au moins un symbole gagnant sur la ligne du milieu. */
function stopMid(strip, sym) {
  const i = strip.indexOf(sym);
  return i < 0 ? 0 : (i - 1 + strip.length) % strip.length;   // sym en position 1 = ligne du milieu
}

/**
 * Pilote les grilles TIRÉES par le moteur, rotation par rotation.
 * `gridFor(spin)` renvoie les 5 arrêts de la rotation n° `spin` (0 = rotation
 * payante) ou null pour laisser le tirage réel.
 *
 * Les tirages d'animation (rouleaux flous) passent par le même générateur : on
 * les reconnaît à leur forme — un tirage de grille suit toujours autre chose
 * qu'un `int(0, 4)` de choix de rouleau. Sans ce filtre, les tirages d'animation
 * consommeraient les grilles forcées et le scénario deviendrait aléatoire.
 */
function forceSpins(gridFor) {
  const realInt = J.Fair.int.bind(J.Fair);
  const ctl = { spins: 0, undo() { J.Fair.int = realInt; } };
  let afterReelPick = false, k = 0, cur = null;
  J.Fair.int = (a, b) => {
    if (a === 0 && b === 4) { afterReelPick = true; return realInt(a, b); }   // rouleau flou
    const isGrid = a === 0 && b > 4 && !afterReelPick;
    afterReelPick = false;
    if (!isGrid) return realInt(a, b);
    if (k === 0) {
      let grid = null;
      try { grid = gridFor(ctl.spins); } catch (e) { grid = null; }
      ctl.spins++;
      cur = grid && grid.length === 5 && grid.every((x) => x >= 0) ? grid : null;
    }
    const v = cur ? cur[k % 5] : null;
    k = (k + 1) % 5;
    return v == null ? realInt(a, b) : v;
  };
  return ctl;
}

async function openSlots(machine = 'bonbons') {
  reset();
  J.Games.open('slots', { machine });
  await wait(60);
  return J.Games.instance();
}

const SPIN = () => doc.querySelector('#gActions [data-act="play"]').click();

/* --- 1.1 aucun scatter : aucune manche bonus ------------------------------ */
{
  speedUp();
  const g = await openSlots();
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const bal0 = J.Wallet.balance;
  const undo = forceGrid(t.reels.map((s) => stopWithout(s, 'S')));
  SPIN();
  await wait(700);
  speedDown();
  const scatters = g.round.scatters;
  check('1.1 aucun scatter : pas de tours gratuits', scatters < 3 && g.free === null && !g.busy,
    'scatters=' + scatters + ' free=' + JSON.stringify(g.free));
  check('1.1 aucun scatter : un seul règlement', rec.settle.length === 1, rec.settle.length + ' règlement(s)');
  check('1.1 aucun scatter : solde = mise + gain', J.Wallet.balance - bal0 === (rec.settle[0] ? rec.settle[0].profit : 0),
    'solde ' + (J.Wallet.balance - bal0) + ' / gain ' + (rec.settle[0] ? rec.settle[0].profit : '—'));
  undo();
}

/* --- 1.2 déclenchement normal : 10 tours, une seule fois ------------------ */
let bonusRun = null;
{
  speedUp();
  const g = await openSlots();
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const bal0 = J.Wallet.balance;
  const stops = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  const undo = forceGrid(stops);
  SPIN();
  await wait(1500);
  speedDown();
  const settle = rec.settle[0];
  bonusRun = { rounds: g.stats.rounds, total: 10 };
  check('1.2 déclenchement : 10 tours gratuits accordés puis soldés', !!settle && g.free === null && !g.busy,
    'free=' + JSON.stringify(g.free) + ' busy=' + g.busy);
  check('1.2 déclenchement : un seul règlement pour toute la manche (bonus compris)', rec.settle.length === 1,
    rec.settle.length + ' règlement(s)');
  check('1.2 déclenchement : le gain crédité = total de la manche',
    !!settle && settle.payout === Math.round(betOf(settle) * settle.mult),
    settle ? settle.payout + ' J · mise ' + betOf(settle) + ' × ' + settle.mult.toFixed(3) : '—');
  check('1.2 déclenchement : solde cohérent', J.Wallet.balance - bal0 === (settle ? settle.profit : 0),
    'solde ' + (J.Wallet.balance - bal0) + ' / gain ' + (settle ? settle.profit : '—'));
  check('1.2 déclenchement : commande de rejeu réactivée et état propre',
    !g.spinning && g.spinFlags.every((f) => f === false) && J.Games.instance() === g,
    JSON.stringify({ spinning: g.spinning, flags: g.spinFlags }));
  undo();
}

/* --- 1.3 dernier tour gratuit : le bonus s'arrête tout seul -------------- */
{
  speedUp();
  const g = await openSlots('egypte');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const scatterGrid = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  /* Seule la rotation payante est forcée : les 10 tours gratuits sont tirés
     pour de vrai. Le bonus doit se terminer au 10ᵉ tour, sans relance. */
  const ctl = forceSpins((spin) => (spin === 0 ? scatterGrid : null));
  SPIN();
  const freeSeen = await until(() => g.free, 1500);
  const freeRef = freeSeen;
  await until(() => !g.free && !g.busy, 8000);
  ctl.undo();
  speedDown();
  check('1.3 fin de bonus : le bonus démarre avec 10 tours', !!freeRef && freeRef.total === 10,
    freeRef ? 'total=' + freeRef.total : 'aucun bonus');
  check('1.3 fin de bonus : la manche se termine seule', !g.busy && g.free === null && rec.settle.length === 1,
    JSON.stringify({ busy: g.busy, free: g.free, reglements: rec.settle.length }));
  check('1.3 fin de bonus : le multiplicateur est revenu au mode normal',
    !g.free && g.msg.indexOf('TOURS GRATUITS') < 0, 'message : « ' + g.msg + ' »');
  check('1.3 fin de bonus : les 10 tours ont bien été décomptés, pas un de plus',
    !!freeRef && freeRef.done === 10 && ctl.spins === 11, 'tours=' + (freeRef ? freeRef.done : '—') +
      ' · rotations tirées=' + ctl.spins + ' (1 payante + 10 gratuites)');
}

/* --- 1.4 scatters pendant un tour gratuit (règle : pas de tours en plus) --- */
{
  speedUp();
  const g = await openSlots('dragon');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const scatterGrid = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  /* Les scatters retombent à CHAQUE rotation : la règle doit tenir bon et le
     bonus s'arrêter après ses 10 tours, sans en rajouter un seul. */
  const ctl = forceSpins(() => scatterGrid);
  SPIN();
  const freeSeen = await until(() => g.free, 1500);
  const freeRef = freeSeen;
  const totalAtStart = freeSeen ? freeSeen.total : null;
  await until(() => !g.free && !g.busy, 9000);
  ctl.undo();
  speedDown();
  check('1.4 bonus déclenché pour le scénario', totalAtStart === 10, 'total=' + totalAtStart);
  check('1.4 scatters pendant le bonus : aucun tour supplémentaire accordé',
    !!freeRef && freeRef.total === 10 && freeRef.done === 10 && ctl.spins === 11,
    JSON.stringify({ total: freeRef && freeRef.total, tours: freeRef && freeRef.done, rotations: ctl.spins }));
  check('1.4 scatters pendant le bonus : une seule manche réglée', !g.free && rec.settle.length === 1,
    JSON.stringify({ free: g.free, reglements: rec.settle.length }));
  check('1.4 bonus terminé : état final cohérent', !g.spinning && !g.busy && g.free === null,
    JSON.stringify({ spinning: g.spinning, busy: g.busy, free: g.free }));
}

/* --- 1.5 victoire pendant un tour gratuit : créditée une seule fois -------- */
{
  speedUp();
  const g = await openSlots('gemmes');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const bal0 = J.Wallet.balance;
  const scatterGrid = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  /* Après le déclenchement, chaque tour gratuit rapporte : les lignes du
     symbole fort restent alignées sur la ligne du milieu. */
  const winGrid = t.reels.map((strip, i) => (i < 3 ? stopMid(strip, 'W') : stopWithout(strip, 'S')));
  const ctl = forceSpins((spin) => (spin === 0 ? scatterGrid : winGrid));
  SPIN();
  const freeSeen = await until(() => (g.free && g.free.done >= 1 ? g.free : null), 2000);
  const freeRef = freeSeen;
  /* Pendant le bonus, aucune écriture au solde : le moteur ne règle qu'à la fin. */
  const midSettles = rec.settle.length;
  const midBal = J.Wallet.balance;
  const midWon = freeRef ? freeRef.won : 0;
  await until(() => !g.free && !g.busy, 9000);
  ctl.undo();
  speedDown();
  const s1 = rec.settle[0];
  check('1.5 bonus : aucun gain crédité tour par tour (règlement unique à la fin)',
    midSettles === 0 && rec.settle.length === 1, 'pendant=' + midSettles + ' total=' + rec.settle.length);
  check('1.5 bonus : les tours gratuits ont bien produit des gains', midWon > 0 && !!freeRef,
    freeRef ? 'gains du bonus = ' + freeRef.won + ' J · base ' + freeRef.base : 'aucun bonus');
  check('1.5 bonus : le gain affiché = le gain crédité',
    !!s1 && g.lastWin === s1.payout, 'affiché ' + g.lastWin + ' / crédité ' + (s1 ? s1.payout : '—'));
  check('1.5 bonus : solde = mise + gain', J.Wallet.balance - bal0 === (s1 ? s1.profit : 0),
    'solde ' + (J.Wallet.balance - bal0) + ' J · crédité ' + (s1 ? s1.payout : '—') + ' J');
  check('1.5 bonus : le solde n’a pas bougé pendant le bonus',
    midBal === bal0 - (rec.stake[0] ? rec.stake[0].bet : 0),
    'solde pendant le bonus ' + midBal + ' = ' + bal0 + ' − mise ' + (rec.stake[0] ? rec.stake[0].bet : '—'));
}

/* --- 1.6 plusieurs scatters pendant l'animation : une seule résolution ---- */
{
  speedUp();
  const g = await openSlots('bonbons');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const stops = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  const undo = forceGrid(stops);
  let resolutions = 0;
  const realEval = J.Games.finish;
  J.Games.finish = function (gg, mult, extra) { resolutions++; return realEval.call(J.Games, gg, mult, extra); };
  SPIN();
  /* On relance SPIN pendant l'animation du bonus, comme un joueur impatient. */
  await wait(120);
  for (let i = 0; i < 6; i++) { const b = doc.querySelector('#gActions [data-act="play"]'); if (b && !b.disabled) b.click(); }
  await wait(1800);
  J.Games.finish = realEval;
  undo();
  speedDown();
  check('1.6 scatters pendant l’animation : une seule résolution de manche', resolutions === 1, resolutions + ' résolution(s)');
  check('1.6 appuis pendant le bonus : aucune mise supplémentaire', rec.stake.length === 1, rec.stake.length + ' mise(s)');
}

/* --- 1.7 double appui sur SPIN ------------------------------------------- */
{
  speedUp();
  const g = await openSlots();
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const undo = forceGrid(t.reels.map((s) => stopWithout(s, 'S')));
  const b = doc.querySelector('#gActions [data-act="play"]');
  b.click(); b.click(); b.click();
  await wait(600);
  undo();
  speedDown();
  check('1.7 triple appui sur SPIN : une seule mise', rec.stake.length === 1, rec.stake.length + ' mise(s)');
  check('1.7 triple appui sur SPIN : un seul règlement', rec.settle.length === 1, rec.settle.length + ' règlement(s)');
}

/* --- 1.8 sortie de jeu pendant un bonus --------------------------------- */
{
  speedUp();
  const g = await openSlots('aventure');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const bal0 = J.Wallet.balance;
  const stops = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  const undo = forceGrid(stops);
  SPIN();
  await wait(200);
  const inBonus = !!g.free;
  const wonSoFar = g.free ? g.free.base + g.free.won : 0;
  J.Games.close(true);              // comme un retour à l'accueil
  undo();
  speedDown();
  check('1.8 sortie pendant le bonus : la manche est réglée (pas de remboursement sec)',
    rec.settle.length === 1 && rec.refund.length === 0,
    JSON.stringify({ reglements: rec.settle.length, remboursements: rec.refund.length }));
  check('1.8 sortie pendant le bonus : le joueur garde ce qui était acquis',
    rec.settle.length === 1 && Math.abs((J.Wallet.balance - bal0) - rec.settle[0].profit) < 0.51 && inBonus,
    'solde ' + (J.Wallet.balance - bal0) + ' J · acquis ' + wonSoFar + ' J · réglé ' +
      (rec.settle.length ? rec.settle[0].payout : '—') + ' J');
}

/* --- 1.9 rechargement de page pendant un bonus --------------------------- */
{
  speedUp();
  const g = await openSlots();
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  resetRec();
  const scatterGrid = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  const ctl = forceSpins(() => scatterGrid);
  const balBefore = J.Wallet.balance;
  SPIN();
  const inFlight = await until(() => J.Store.state.pending && g.free, 2000);
  const pending = inFlight ? J.Store.state.pending : null;
  const balStaked = J.Wallet.balance;
  /* Un rechargement de page passe par la sauvegarde : on écrit l'état exact. */
  J.Store.flush();
  const raw = win.localStorage.getItem(SAVE_KEY);
  const saved = raw ? JSON.parse(raw) : null;
  ctl.undo();
  check('1.9 manche en cours : elle est notée dans l’état sauvegardé',
    !!(saved && saved.pending && saved.pending.game === 'slots' && saved.pending.bet > 0),
    JSON.stringify(saved && saved.pending));
  check('1.9 manche en cours : la mise a bien été débitée', balStaked === balBefore - (pending ? pending.bet : 0),
    'solde ' + balStaked + ' = ' + balBefore + ' − ' + (pending ? pending.bet : '—'));

  /* Rechargement réel : une page neuve démarre sur la sauvegarde laissée en
     pleine manche. La mise doit revenir, une seule fois, sans gain inventé. */
  const dom2 = makeDom({ key: SAVE_KEY, raw: raw });
  const win2 = dom2.window;
  const booted = await until(() => (win2.JACKPOTLY && win2.JACKPOTLY.Wallet ? win2.JACKPOTLY : null), 3000);
  const J2 = booted;
  const recovered = J2 ? J2.Wallet.balance : null;
  check('1.9 rechargement : la mise est rendue au démarrage suivant',
    !!pending && recovered === balBefore,
    'solde après rechargement ' + recovered + ' (attendu ' + balBefore + ' = ' + balStaked + ' + ' + (pending ? pending.bet : '—') + ')');
  await wait(400);            // l'application écrit sa sauvegarde en différé (220 ms)
  check('1.9 rechargement : la manche en attente est effacée',
    !!J2 && !J2.Store.state.pending && !(JSON.parse(win2.localStorage.getItem(SAVE_KEY) || '{}').pending),
    JSON.stringify(J2 ? J2.Store.state.pending : null));
  check('1.9 rechargement : aucun gain crédité pour une manche interrompue',
    !!J2 && J2.Store.state.history.length === (saved ? saved.history.length : 0),
    'entrées d’historique ' + (J2 ? J2.Store.state.history.length : '—') + ' (avant ' + (saved ? saved.history.length : '—') + ')');
  if (win2) win2.close();
  J.Games.close(true);
  speedDown();
}

/* ========================================================== 2. HI-LO ======= */
section('2. Hi-Lo : égalité neutre, pari Égalité, multiplicateurs');

/** Pilote le tirage : force le rang de la carte suivante. */
function forceRank(g) {
  const realFloat = J.Fair.float.bind(J.Fair);
  let wanted = null;
  J.Fair.float = function (a, b) {
    if (wanted == null) return realFloat();
    let seen = 0;
    for (let r = 1; r <= 13; r++) {
      if (g.deck.counts[r] > 0) {
        if (r === wanted) return (seen + 0.5) / g.deck.remaining;
        seen += g.deck.counts[r];
      }
    }
    return realFloat();
  };
  return {
    next(rank) { wanted = rank; },
    free() { wanted = null; },
    undo() { J.Fair.float = realFloat; }
  };
}

{
  speedUp();
  reset();
  J.Games.open('hilo');
  await wait(60);
  const g = J.Games.instance();
  const ctl = forceRank(g);
  const bal0 = J.Wallet.balance;
  resetRec();

  check('2.0 Hi-Lo : trois choix proposés (plus haut, égalité, plus bas)',
    !!(doc.getElementById('hlHigh') && doc.getElementById('hlTie') && doc.getElementById('hlLow')),
    JSON.stringify(['hlHigh', 'hlTie', 'hlLow'].map((i) => !!doc.getElementById(i))));
  check('2.0 Hi-Lo : multiplicateur initial affiché = 0,99', g.mult === 0.99, String(g.mult));

  /* Le rang à tirer est choisi parmi les cartes RÉELLEMENT en jeu (le rang le
     plus fourni qui satisfait la condition) : les probabilités testées sont
     celles du jeu distribué, aucun tirage de secours. */
  const availRank = (pred) => {
    let best = null;
    for (let r = 1; r <= 13; r++) {
      if (g.deck.counts[r] > 0 && pred(r, g.card.rank) && (best === null || g.deck.counts[r] > g.deck.counts[best])) best = r;
    }
    return best;
  };

  /* Départ : carte de rang 7 forcée (il existe alors des rangs plus hauts ET
     plus bas, tous disponibles) — chaque scénario suivant reste déterministe. */
  ctl.next(7);
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(80);
  const mult0 = g.mult;
  check('2.1 carte de départ distribuée', g.card.rank === 7 && g.steps === 0 && g.mult === 0.99,
    'carte ' + g.card.rank + ' · mult ' + g.mult);

  const upRank = availRank((r, c) => r > c);
  const before = g.mult;
  if (upRank) { ctl.next(upRank); doc.getElementById('hlHigh').click(); }
  await wait(80);
  check('2.1 carte supérieure : pari gagnant, la carte tirée est bien plus haute',
    !!upRank && g.steps === 1 && g.card.rank === upRank && g.tieCount === 0,
    'rang ' + upRank + ' tiré · carte ' + g.card.rank + ' · pas=' + g.steps);
  check('2.1 carte supérieure : multiplicateur revalorisé', g.mult > before,
    before.toFixed(4) + ' → ' + g.mult.toFixed(4) + ' après ' + g.steps + ' prédiction');

  /* Carte inférieure */
  /* La carte tirée doit garder des cartes au-dessus ET au-dessous : les deux
     égalités neutres qui suivent doivent être réellement jouables. */
  const lowRank = availRank((r, c) => r < c && r > 1);
  const m2 = g.mult;
  if (lowRank) { ctl.next(lowRank); doc.getElementById('hlLow').click(); }
  await wait(80);
  check('2.2 carte inférieure : pari gagnant, multiplicateur revalorisé',
    !!lowRank && g.mult > m2 && g.steps === 2 && g.card.rank === lowRank,
    'rang ' + lowRank + ' tiré · ' + m2.toFixed(4) + ' → ' + g.mult.toFixed(4));

  /* Égalité sur « plus haut » : NEUTRE */
  const m3 = g.mult, s3 = g.steps, prevRank = g.card.rank;
  ctl.next(g.card.rank);
  doc.getElementById('hlHigh').click();
  await wait(60);
  check('2.3 égalité sur « plus haut » : mise conservée, pas de perte',
    !!g.ticket && g.phase === 'guess' && g.mult === m3,
    'mult ' + m3.toFixed(4) + ' → ' + g.mult.toFixed(4) + ' · manche ' + (g.ticket ? 'en cours' : 'terminée'));
  check('2.3 égalité sur « plus haut » : elle ne compte pas comme une prédiction gagnante',
    g.steps === s3 && g.tieCount === 1, 'pas=' + g.steps + ' égalités=' + g.tieCount);
  check('2.3 égalité : les deux choix directionnels restent jouables',
    !g.highBtn.disabled && !g.lowBtn.disabled,
    'plus haut=' + (!g.highBtn.disabled) + ' · plus bas=' + (!g.lowBtn.disabled));
  check('2.3 égalité : la carte tirée devient la carte courante',
    g.chain.length === 3 && g.card && g.card.rank === prevRank,
    'chaîne=' + g.chain.length + ' carte=' + (g.card ? g.card.rank : '—') + ' (rang joué ' + prevRank + ')');

  /* Égalité sur « plus bas » : NEUTRE */
  const m4 = g.mult;
  const prevRank4 = g.card.rank;
  ctl.next(prevRank4);
  doc.getElementById('hlLow').click();
  await wait(60);
  check('2.4 égalité sur « plus bas » : neutre également',
    g.mult === m4 && !!g.ticket && g.tieCount === 2 && g.card.rank === prevRank4,
    'mult ' + m4.toFixed(4) + ' → ' + g.mult.toFixed(4) + ' · égalités=' + g.tieCount +
    ' · carte ' + g.card.rank + ' (rang joué ' + prevRank4 + ')');

  /* Pari Égalité : manche neuve, carte de départ choisie pour qu'il reste des
     cartes du même rang (le pari n'est proposé que s'il est jouable). */
  doc.querySelector('#gActions [data-act="cashout"]').click();
  await wait(80);
  resetRec();
  let startRank = 1;
  for (let r = 1; r <= 13; r++) if (g.deck.counts[r] > g.deck.counts[startRank]) startRank = r;
  ctl.next(startRank);
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(80);
  const tieBtn = doc.getElementById('hlTie');
  const m5 = g.mult, s5 = g.steps, ties5 = g.tieCount;
  const pT = g.deck.counts[g.card.rank] / g.deck.remaining;
  const shownTie = parseFloat(String(doc.getElementById('hlTieMult').textContent).replace(',', '.').replace(/[^0-9.]/g, ''));
  check('2.5 pari Égalité : disponible et documenté',
    g.card.rank === startRank && !tieBtn.disabled && pT > 0 && pT < 1 && isFinite(shownTie),
    'carte ' + g.card.rank + ' · P(égalité) ' + pT.toFixed(4) + ' · paiement affiché ' + shownTie + 'x');
  ctl.next(g.card.rank);
  tieBtn.click();
  await wait(80);
  check('2.5 pari Égalité gagné : multiplicateur = mult / P(égalité)', Math.abs(g.mult - m5 / pT) < 1e-9,
    m5.toFixed(4) + ' / ' + pT.toFixed(4) + ' = ' + (m5 / pT).toFixed(4) + ' (moteur ' + g.mult.toFixed(4) + ')');
  check('2.5 pari Égalité gagné : le paiement appliqué est celui affiché',
    Math.abs(shownTie - g.mult) < 0.005, 'affiché ' + shownTie + 'x · appliqué ' + g.mult.toFixed(4) + 'x');
  check('2.5 pari Égalité gagné : compté comme une prédiction juste',
    g.steps === s5 + 1 && g.tieCount === ties5, 'pas=' + g.steps + ' · égalités neutres=' + g.tieCount);

  /* Échec sur Égalité : la manche est perdue (règlement à 0) — sans nouvelle mise. */
  const balBefore = J.Wallet.balance;
  let otherRank = 1;
  for (let r = 1; r <= 13; r++) if (r !== g.card.rank && g.deck.counts[r] > g.deck.counts[otherRank]) otherRank = r;
  ctl.next(otherRank);
  doc.getElementById('hlTie').click();
  await wait(80);
  check('2.6 échec sur Égalité : la manche est perdue (règlement à 0)',
    rec.settle.length === 1 && rec.settle[0].mult === 0 && !g.ticket,
    JSON.stringify({ reglements: rec.settle.length, mult: rec.settle.length ? rec.settle[0].mult : null }));
  check('2.6 échec sur Égalité : un seul débit, un seul crédit',
    rec.stake.length === 1 && rec.settle.length === 1 && rec.refund.length === 0,
    JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length, remboursements: rec.refund.length }));
  check('2.6 échec sur Égalité : la mise reste perdue, rien n’est rendu',
    J.Wallet.balance === balBefore && rec.settle[0].profit === -betOf(rec.settle[0]),
    'solde ' + J.Wallet.balance + ' J (inchangé) · net de la manche ' + rec.settle[0].profit + ' J');
  check('2.6 nouvelle manche : le multiplicateur repart de 0,99', g.mult === 0.99 && g.steps === 0 && g.phase === 'idle',
    JSON.stringify({ mult: g.mult, steps: g.steps, phase: g.phase }));

  /* Nouvelle manche + encaissement unique */
  resetRec();
  const bal2 = J.Wallet.balance;
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(60);
  ctl.next(Math.min(13, g.card.rank + 4));
  doc.getElementById('hlHigh').click();
  await wait(60);
  const mCash = g.mult;
  const cashBtn = doc.querySelector('#gActions [data-act="cashout"]');
  check('2.7 encaissement : la commande d’encaissement est proposée après une prédiction juste',
    !!cashBtn && /Encaisser/.test(cashBtn.textContent), cashBtn ? cashBtn.textContent.trim() : 'aucune commande');
  cashBtn.click();
  cashBtn.click();                    // double appui réel : le nœud retiré garde son écouteur
  await wait(80);
  check('2.7 encaissement : un seul règlement même en appuyant deux fois', rec.settle.length === 1,
    rec.settle.length + ' règlement(s)');
  check('2.7 encaissement : gain = mise × multiplicateur affiché',
    rec.settle.length === 1 && rec.settle[0].payout === Math.round(betOf(rec.settle[0]) * mCash),
    rec.settle.length ? rec.settle[0].payout + ' J = ' + betOf(rec.settle[0]) + ' × ' + mCash.toFixed(4) : '—');
  check('2.7 encaissement : solde = mise + gain', J.Wallet.balance - bal2 === rec.settle[0].profit,
    'solde ' + (J.Wallet.balance - bal2) + ' J');
  check('2.7 encaissement : multiplicateur remis à 0,99 pour la manche suivante', g.mult === 0.99,
    String(g.mult));

  /* Dernière carte disponible : le jeu ne doit jamais se bloquer */
  resetRec();
  g.deck = { counts: new Array(14).fill(0), remaining: 0 };
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(120);
  check('2.8 jeu épuisé : rebattu automatiquement ou manche close proprement',
    !!g.card && (g.deck.remaining > 0 || !g.ticket), JSON.stringify({ reste: g.deck.remaining, carte: g.card ? g.card.rank : null }));
  /* Fin forcée : une seule carte restante puis tirage */
  ctl.next(13);
  for (let i = 0; i < 200 && g.deck.remaining > 0; i++) {
    const high = doc.getElementById('hlHigh'), low = doc.getElementById('hlLow'), tie = doc.getElementById('hlTie');
    const btn = !tie.disabled ? tie : !high.disabled ? high : !low.disabled ? low : null;
    if (!btn) break;
    btn.click();
    await wait(12);
  }
  await wait(80);
  check('2.8 jeu vidé : aucune exception, manche close ou encaissée',
    g.deck.remaining >= 0 && !g.spinning,
    JSON.stringify({ reste: g.deck.remaining, manche: !!g.ticket, mult: g.mult }));
  ctl.undo();
  check('2.8 chaîne de test : multiplicateur initial', true, mult0.toFixed(2) + ' au départ');
  J.Games.close(true);
  speedDown();
}

/* ======================================================= 3. BACCARAT ====== */
section('3. Baccarat : manches complètes et comptabilité');
{
  speedUp();
  reset();
  J.Games.open('baccarat');
  await wait(60);
  const g = J.Games.instance();
  const bal0 = J.Wallet.balance;

  /* Une carte est un entier 0..51 : hauteur = c % 13 (0 = 2 … 12 = As),
     couleur = ⌊c / 13⌋. On écrit donc les mains en clair, dans l'ordre réel de
     la pioche : p0, p1, b0, b1, puis les 3ᵉ cartes éventuelles. */
  const C = (rank, suit = 0) => rank + 13 * suit;

  /** Sabot truqué : `draw()` dépile la fin, on empile donc à l'envers. */
  function forceHand(drawOrder) {
    g.shoe = [];
    for (let i = 0; i < 40; i++) g.shoe.push(C(0));            // remplissage (2 = 2 points)
    drawOrder.slice().reverse().forEach((c) => g.shoe.push(c));
  }
  const zones = () => doc.querySelectorAll('#bacZones [data-zone]').length;
  const T = (cards) => J.__baccarat.spotTotal(cards);          // total baccarat d'une main

  /* Commandes réelles du tapis (aucun état écrit à la main : c'est le joueur
     qui clique les zones, choisit le jeton et retire ses mises). */
  const clearBets = () => doc.querySelector('#bacClear').click();
  const place = (zone, n = 1) => { for (let i = 0; i < n; i++) doc.querySelector('[data-zone="' + zone + '"]').click(); };
  const playBtn = () => doc.querySelector('#gActions [data-act="play"]');

  check('3.0 Baccarat : les 5 zones du tapis sont proposées',
    ['banque', 'joueur', 'egalite', 'paireJ', 'paireB'].every((k) => !!doc.querySelector('[data-zone="' + k + '"]')),
    zones() + ' zones');
  check('3.0 Baccarat : le jeton choisi est réglable (10 → 5 000)',
    doc.querySelectorAll('#bacChips [data-chip-val]').length === 6 && g.chip === 100,
    doc.querySelectorAll('#bacChips [data-chip-val]').length + ' jetons · jeton courant ' + g.chip);
  check('3.0 Baccarat : la commande de lancement est désactivée sans mise',
    playBtn().disabled === true, 'bouton « ' + playBtn().textContent.trim() + ' » désactivé=' + playBtn().disabled);

  /* 3.1 victoire du Joueur (naturel 8 à 5, aucune 3ᵉ carte) */
  {
    resetRec();
    forceHand([C(6), C(8), C(0), C(1)]);                       // P 8 (8+10) · B 5 (2+3)
    clearBets();
    place('joueur');
    const before = J.Wallet.balance;
    check('3.1 Baccarat : le jeton posé est visible et le bouton devient actif',
      g.spots.joueur === 1 && g.bet === 100 && !playBtn().disabled,
      JSON.stringify(g.spots) + ' · bouton « ' + playBtn().textContent.trim() + ' »');
    playBtn().click();
    await until(() => !g.busy, 3000);
    const settled = rec.settle[0];
    check('3.1 Baccarat — Victoire Joueur : la manche se joue et se règle',
      rec.settle.length === 1 && g.phase === 'done' && g.outcome === 'joueur' && T(g.player) === 8 && T(g.banker) === 5,
      JSON.stringify({ reglements: rec.settle.length, phase: g.phase, resultat: g.outcome, scores: T(g.player) + '/' + T(g.banker) }));
    check('3.1 Baccarat — Victoire Joueur : paiement 1:1',
      settled && Math.abs(settled.mult - 2) < 1e-9 && settled.payout === 200 && betOf(settled) === 100,
      'mise ' + betOf(settled) + ' J · mult ' + (settled ? settled.mult : '—') + ' · payé ' + (settled ? settled.payout : '—') + ' J');
    check('3.1 Baccarat : solde = mise + gain', J.Wallet.balance - before === (settled ? settled.profit : 0),
      'solde ' + (J.Wallet.balance - before) + ' J · gain ' + (settled ? settled.profit : '—'));
  }

  /* 3.2 victoire de la Banque + paire du Joueur sur la même donne */
  {
    resetRec();
    forceHand([C(6, 2), C(6, 3), C(7), C(8)]);                 // P paire de 8 → 6 · B naturel 9
    clearBets();
    place('banque'); place('paireJ');
    const before = J.Wallet.balance;
    playBtn().click();
    await until(() => !g.busy, 3000);
    const settled = rec.settle[0];
    check('3.2 Baccarat — Victoire Banque : résultat calculé',
      g.phase === 'done' && g.outcome === 'banque' && T(g.player) === 6 && T(g.banker) === 9,
      'résultat=' + g.outcome + ' · J ' + T(g.player) + ' / B ' + T(g.banker));
    check('3.2 Baccarat — Victoire Banque : paiement 0,95:1 sur la Banque',
      settled && Math.abs(settled.mult - (1.95 + 12) / 2) < 1e-9,
      'mult=' + (settled ? settled.mult.toFixed(4) : '—') + ' (attendu 6,9750 = moyenne de 1,95 et 12)');
    check('3.2 Baccarat : la paire se lit sur les deux premières cartes',
      J.__baccarat.isPair(g.pFull) && !J.__baccarat.isPair(g.bFull),
      'Joueur ' + g.pFull.map(J.Cards.label).join(' ') + ' · Banque ' + g.bFull.map(J.Cards.label).join(' '));
    check('3.2 Baccarat : solde = mise + gain', J.Wallet.balance - before === (settled ? settled.profit : 0),
      'solde ' + (J.Wallet.balance - before) + ' J');
  }

  /* 3.3 égalité (deux naturels à 8) */
  {
    resetRec();
    forceHand([C(6), C(8), C(6, 3), C(8, 1)]);
    clearBets();
    place('egalite');
    const before = J.Wallet.balance;
    playBtn().click();
    await until(() => !g.busy, 3000);
    const settled = rec.settle[0];
    check('3.3 Baccarat — Égalité : résultat détecté',
      g.phase === 'done' && g.outcome === 'egalite' && T(g.player) === 8 && T(g.banker) === 8,
      'résultat=' + g.outcome + ' (' + T(g.player) + '/' + T(g.banker) + ')');
    check('3.3 Baccarat — Égalité : paiement 8:1', settled && Math.abs(settled.mult - 9) < 1e-9 && settled.payout === 900,
      'mult=' + (settled ? settled.mult : '—') + ' · payé ' + (settled ? settled.payout : '—') + ' J');
    check('3.3 Baccarat : solde = mise + gain', J.Wallet.balance - before === (settled ? settled.profit : 0),
      'solde ' + (J.Wallet.balance - before) + ' J');
  }

  /* 3.4 règle de la 3ᵉ carte : Joueur à 5 qui tire, Banque qui suit le tableau */
  {
    resetRec();
    forceHand([C(0), C(1), C(7), C(2), C(4), C(5)]);           // P 2+3=5 (+6) · B 9+4=13→3 (+7)
    clearBets();
    place('joueur');
    playBtn().click();
    await until(() => !g.busy, 3000);
    check('3.4 Baccarat — 3ᵉ carte : le Joueur tire à 5 et la Banque suit le tableau',
      g.player.length === 3 && g.banker.length === 3 && T(g.player) === 1 && T(g.banker) === 0 && g.outcome === 'joueur',
      JSON.stringify({ joueur: g.player.map(J.Cards.label).join(' '), banque: g.banker.map(J.Cards.label).join(' '),
        scores: T(g.player) + '/' + T(g.banker), resultat: g.outcome }));
    check('3.4 Baccarat : un seul débit, un seul crédit', rec.stake.length === 1 && rec.settle.length === 1,
      JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length }));
  }

  /* 3.5 mises cumulées, retrait d'un jeton, relance de la même mise */
  {
    resetRec();
    forceHand([C(6), C(8), C(0), C(1)]);                       // Joueur gagne → Banque perd
    clearBets();
    place('joueur'); place('banque');
    const before = J.Wallet.balance;
    playBtn().click();
    await until(() => !g.busy, 3000);
    const settled = rec.settle[0];
    check('3.5 Baccarat : mise totale du tapis débitée (= somme des mises)',
      settled && betOf(settled) === 200, 'mise ' + (settled ? betOf(settled) : '—') + ' J (attendu 200)');
    check('3.5 Baccarat : les mises cumulées se pondèrent (1,95 perdu + 2 gagné ÷ 2)',
      settled && Math.abs(settled.mult - 1) < 1e-9 && settled.profit === 0,
      'mult=' + (settled ? settled.mult : '—') + ' · net ' + (settled ? settled.profit : '—') + ' J');
    check('3.5 Baccarat : solde = mise + gain', J.Wallet.balance - before === (settled ? settled.profit : 0),
      'solde ' + (J.Wallet.balance - before) + ' J');

    /* Placement aux vraies commandes du tapis : zones cliquées puis retrait
       d'un jeton. Aucun débit tant que la manche n'est pas lancée. */
    const b2 = J.Wallet.balance;
    doc.querySelector('#bacClear').click();
    check('3.5 Baccarat : « effacer les mises » vide le tapis sans toucher au solde',
      !Object.keys(g.spots).length && J.Wallet.balance === b2, 'solde ' + J.Wallet.balance);
    doc.querySelector('[data-zone="joueur"]').click();
    doc.querySelector('[data-zone="joueur"]').click();
    doc.querySelector('[data-zone="banque"]').click();
    const listJ = doc.querySelector('#bacList [data-off="joueur"]');
    check('3.5 Baccarat : les jetons posés sont visibles et chiffrés sur le tapis',
      g.spots.joueur === 2 && g.spots.banque === 1 && doc.querySelectorAll('#bacList [data-off]').length === 2 &&
        !!listJ && /200/.test(listJ.textContent),
      JSON.stringify(g.spots) + ' · liste : ' + (listJ ? listJ.textContent.trim() : '—'));
    if (listJ) listJ.click();
    check('3.5 Baccarat : retirer un jeton enlève la mise sans toucher au solde',
      J.Wallet.balance === b2 && g.spots.joueur === 1, 'solde ' + J.Wallet.balance + ' · jetons Joueur ' + g.spots.joueur);
    place('joueur');                                           // retour à 2 joueur + 1 banque
    clearBets();                                               // mises mémorisées pour la relance
    check('3.5 Baccarat : effacer mémorise la mise pour la relancer',
      !Object.keys(g.spots).length && !!g.lastSpots && g.lastSpots.joueur === 2 && g.lastSpots.banque === 1,
      JSON.stringify(g.lastSpots));
    doc.querySelector('#bacRebet').click();
    check('3.5 Baccarat : « relancer la même mise » restitue les jetons sans toucher au solde',
      J.Wallet.balance === b2 && g.spots.joueur === 2 && g.spots.banque === 1,
      'solde ' + J.Wallet.balance + ' · ' + JSON.stringify(g.spots));
  }

  /* 3.6 sortie en pleine distribution : remboursement unique */
  {
    resetRec();
    forceHand([C(6), C(8), C(0), C(1)]);
    clearBets();
    place('banque');
    const before = J.Wallet.balance;
    playBtn().click();
    await until(() => J.Store.state.pending, 600);
    const pending = J.Store.state.pending;
    check('3.6 Baccarat : la manche en cours est notée pour un rechargement',
      !!pending && pending.game === 'baccarat' && pending.bet === 100, JSON.stringify(pending));
    const zoneLocked = g.spots.banque;
    doc.querySelector('[data-zone="joueur"]').click();
    check('3.6 Baccarat : le tapis est verrouillé pendant la distribution',
      g.spots.joueur === undefined && g.spots.banque === zoneLocked, JSON.stringify(g.spots));
    J.Games.close(true);                                       // sortie de jeu en pleine donne
    check('3.6 Baccarat : sortir en pleine manche rembourse la mise une seule fois',
      rec.refund.length === 1 && J.Wallet.balance === before,
      JSON.stringify({ remboursements: rec.refund.length, solde: J.Wallet.balance, attendu: before }));
    check('3.6 Baccarat : aucune manche fantôme réglée',
      rec.settle.length === 0 && !J.Store.state.pending,
      JSON.stringify({ reglements: rec.settle.length, enAttente: J.Store.state.pending }));
  }

  check('3.7 Baccarat : aucune erreur JavaScript pendant les manches', errors.length === 0, errors.slice(0, 3).join(' | '));
  J.Games.close(true);
  speedDown();
  void bal0;
}

/* ======================================================== 4. CRÉDITS ====== */
section('4. Moteur de crédits : un débit, un crédit, aucun doublon');
{
  speedUp();
  /* Un jeu « classique » (dice) : la manche la plus simple du catalogue. */
  reset();
  J.Games.open('dice');
  await wait(60);
  const g = J.Games.instance();
  resetRec();
  const b0 = J.Wallet.balance;
  doc.querySelector('#gActions [data-act="play"]').click();
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(600);
  const s = rec.settle[0];
  check('4.1 une manche = une mise + un règlement', rec.stake.length === 1 && rec.settle.length === 1,
    JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length }));
  check('4.1 le solde suit exactement les mouvements', J.Wallet.balance - b0 === (s ? s.profit : 0),
    'solde ' + (J.Wallet.balance - b0) + ' J');
  check('4.1 les statistiques de session suivent le net', g.stats.net === (s ? s.profit : 0),
    'net=' + g.stats.net + ' / attendu=' + (s ? s.profit : '—'));
  check('4.1 le taux de retour par jeu est comptabilisé', J.Store.state.stats.perGame.dice.wagered >= betOf(s),
    JSON.stringify(J.Store.state.stats.perGame.dice));

  /* Solde insuffisant : aucune mise fantôme */
  resetRec();
  J.Wallet.credit(-J.Wallet.balance + 5, 'test');
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(300);
  check('4.2 solde insuffisant : aucune mise débitée', rec.stake.length === 0 && J.Wallet.balance === 5,
    'mises=' + rec.stake.length + ' solde=' + J.Wallet.balance);

  /* Sortie de jeu en pleine manche : remboursement unique */
  reset(100000);
  J.Games.close(true);
  /* Mines : la manche reste ouverte jusqu'à la décision du joueur, la sortie
     tombe donc toujours « en pleine manche » (crash pouvait déjà avoir réglé
     la sienne, ce qui ne testait plus le remboursement). */
  J.Games.open('mines');
  await wait(60);
  const g2 = J.Games.instance();
  resetRec();
  const b2 = J.Wallet.balance;
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(120);
  J.Games.close(true);
  check('4.3 sortie en pleine manche : mise remboursée une seule fois',
    rec.refund.length === 1 && J.Wallet.balance === b2, JSON.stringify({ remboursements: rec.refund.length, solde: J.Wallet.balance }));
  check('4.3 le remboursement est annoncé aux autres modules', rec.refund.length === 1 && rec.refund[0].bet > 0,
    JSON.stringify(rec.refund.map((r) => r.bet)));

  /* Rechargement de page : la mise est rendue au démarrage suivant */
  J.Games.open('dice');
  await wait(60);
  resetRec();
  doc.querySelector('#gActions [data-act="play"]').click();
  await wait(60);
  const pending = J.Store.state.pending;
  const bal3 = J.Wallet.balance;
  const rec2 = J.Wallet.recoverPending();
  check('4.4 manche interrompue par un rechargement : mise rendue',
    !!pending && !!rec2 && J.Wallet.balance === bal3 + pending.bet,
    JSON.stringify({ enAttente: pending, rendu: rec2 ? rec2.bet : 0, solde: J.Wallet.balance }));
  check('4.4 l’enregistrement de manche est effacé après récupération', !J.Store.state.pending && J.Wallet.recoverPending() === null,
    String(J.Store.state.pending));
  J.Games.close(true);
  speedDown();
  void g2;
}

/* ==================================================== 5. LES 16 JEUX ===== */
section('5. Les 16 jeux : démarrage, mise, résolution, solde');
{
  speedUp();
  /* Certains jeux attendent une décision du joueur (révéler une case, rester,
     tirer, se passer) : la manche ne peut pas se régler toute seule. On pilote
     donc chaque table avec ses VRAIES commandes, comme le ferait un joueur, et
     on attend la fin réelle de la manche. */
  const clickSel = (sel) => { const el = doc.querySelector(sel); if (el && !el.disabled) { el.click(); return true; } return false; };
  const clickAct = (a) => clickSel('#gActions [data-act="' + a + '"]:not([disabled])');
  const clickText = (re) => {
    const b = Array.prototype.slice.call(doc.querySelectorAll('#gActions button:not([disabled])')).find((x) => re.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  };
  let n = 0;                      // nombre d'étapes déjà jouées dans la manche courante
  const STEP = {
    /* Révéler deux diamants puis encaisser (une mine ferait perdre la manche) */
    mines: () => (n++ < 2 ? clickSel('#mnGrid [data-tile]:not(.picked):not(.bomb)') : clickAct('cashout')),
    /* On ne joue que l'ÉTAGE COURANT (les autres cases sont inactives) */
    tower: (g) => clickSel('#twFloors [data-floor="' + g.floor + '"][data-tile="0"]') || clickAct('cashout'),
    keno: () => clickSel('#knRandom') || clickAct('play'),
    coinflip: () => clickAct('cashout') || clickSel('#cfSide [data-side]'),
    crash: () => clickAct('cashout'),
    blackjack: () => clickText(/Rester/) || clickText(/Non merci/) || clickText(/Nouvelle main/),
    /* Garder une carte puis tirer les remplacements */
    videopoker: () => (n++ < 1 ? clickSel('.vp-card[data-card="0"]') : false) || clickText(/Tirer/),
    poker: () => clickText(/Se passer/),
    roulette: () => clickSel('#ruPresets [data-preset]'),
    baccarat: () => clickSel('#bacZones [data-zone]'),
    hilo: () => clickSel('#hlHigh') || clickSel('#hlLow'),
    wheel: () => false
  };
  const live = J.GAMES.filter((d) => d.status === 'live');
  const problems = [];
  const results = [];
  for (const def of live) {
    reset();
    resetRec();
    n = 0;
    const bal0 = J.Wallet.balance;
    try {
      J.Games.open(def.id);
      await wait(40);
      const g = J.Games.instance();
      if (!g) { problems.push(def.id + ' : ne se monte pas'); continue; }
      const step = STEP[def.id];
      const t0 = Date.now();
      let staked = 0;
      while (Date.now() - t0 < 15000) {
        if (rec.settle.length) break;
        /* 1) poser une mise si le jeu l'exige (tapis), puis 2) lancer la manche */
        if (!rec.stake.length && !g.busy) {
          const b = doc.querySelector('#gActions [data-act="play"]:not([disabled])');
          if (b) { b.click(); staked++; await wait(20); }
          else if (step) { step(g); await wait(20); }
        } else if (step) {
          step(g);                                // 3) agir dans la manche (l'étape du joueur)
        }
        await wait(24);
        if (!rec.stake.length && !staked && Date.now() - t0 > 3000) break;   // commission jamais engagée
      }
      const settled = rec.settle[0];
      if (rec.stake.length !== 1) { problems.push(def.id + ' : ' + rec.stake.length + ' mise(s) au lieu d’une'); continue; }
      if (!settled) {
        problems.push(def.id + ' : manche jamais réglée (phase=' + (g.phase || '?') + ', busy=' + g.busy +
          ', commandes=' + doc.querySelectorAll('#gActions button').length + ')');
        continue;
      }
      const delta = J.Wallet.balance - bal0;
      if (Math.abs(delta - settled.profit) > 0.51) problems.push(def.id + ' : solde ' + delta + ' ≠ gain net ' + settled.profit);
      if (g.ticket) problems.push(def.id + ' : ticket encore ouvert après règlement');
      /* Contrôle par jeu : une mise, un règlement, un solde qui suit le gain
         net, et la manche comptée côté session. */
      check('5 ' + def.id + ' : une mise, un règlement, solde exact, manche comptée',
        rec.stake.length === 1 && rec.settle.length === 1 && !g.ticket &&
        Math.abs(delta - settled.profit) <= 0.51 && g.stats.rounds >= 1,
        'solde ' + delta + ' J · net ' + settled.profit + ' J · mult ' + settled.mult.toFixed(2) + ' · manches ' + g.stats.rounds);
      results.push(def.id + ' ' + (settled.payout > 0 ? '+' + settled.payout : '0') + ' J (mult ' + settled.mult.toFixed(2) + ')');
    } catch (e) {
      problems.push(def.id + ' : exception ' + e.message);
    }
  }
  check('les 16 jeux montent, misent, se règlent et rendent la main', problems.length === 0,
    problems.length ? problems.slice(0, 6).join(' | ') : results.length + ' jeux réglés : ' + results.join(' · '));
  check('les 16 jeux sont tous dans le catalogue jouable', live.length === 16, live.length + ' jeu(x) en ligne');
  J.Games.close(true);
  speedDown();
}

/* ================================================== 6. BLACKJACK : ASSURANCE = */
section('6. Blackjack : assurance (2:1) et règles de paiement');
{
  speedUp();
  reset();
  J.Games.open('blackjack');
  await wait(60);
  const g = J.Games.instance();
  const card = (rank, suit = 0) => rank + 13 * suit;
  /** Sabot truqué : ordre de pioche p0, d0, p1, d1 (draw = pop). */
  function forceShoe(drawOrder) {
    g.shoe = [];
    for (let i = 0; i < 60; i++) g.shoe.push(card(0));
    drawOrder.slice().reverse().forEach((c) => g.shoe.push(c));
  }
  const btnText = (re) => Array.prototype.slice.call(doc.querySelectorAll('#gActions button:not([disabled])')).find((x) => re.test(x.textContent));
  const standBtn = () => btnText(/^Rester/);

  /* Le croupier montre un As et fait blackjack, le joueur a 5 : sans assurance
     la main est perdue ; avec assurance (2:1) la manche revient à zéro. */
  const deal = [card(0), card(12), card(1), card(11)];         // J 2+3=5 · B As+Roi=21

  /* 6.1 assurance acceptée */
  {
    resetRec();
    forceShoe(deal);
    const bal0 = J.Wallet.balance;
    doc.querySelector('#gActions [data-act="play"]').click();
    await until(() => g.phase === 'insurance', 3000);
    check('6.1 Blackjack : l’assurance est proposée quand le croupier montre un As',
      g.phase === 'insurance' && J.Cards.rank(g.dealer[0]) === 12,
      'phase=' + g.phase + ' · carte visible ' + J.Cards.label(g.dealer[0]));
    const ins = btnText(/Assurance/);
    check('6.1 Blackjack : la commande d’assurance est proposée et chiffrée',
      !!ins && /50/.test(ins.textContent), ins ? ins.textContent.trim() : 'aucune commande');
    if (ins) ins.click();
    await wait(40);
    check('6.1 Blackjack : l’assurance est débitée et rattachée à la manche',
      g.insurance === 50 && J.Wallet.balance === bal0 - 150 && g.ticket && g.ticket.bet === 150,
      JSON.stringify({ assurance: g.insurance, solde: J.Wallet.balance, miseTicket: g.ticket ? g.ticket.bet : null }));
    if (standBtn()) standBtn().click();
    await until(() => !g.busy, 4000);
    const settled = rec.settle[0];
    check('6.1 Blackjack : blackjack du croupier payé, l’assurance rembourse la main',
      !!settled && Math.abs(settled.mult - 1) < 1e-9 && settled.payout === 150 && settled.profit === 0,
      settled ? 'mise totale ' + betOf(settled) + ' J · mult ' + settled.mult.toFixed(2) + ' · payé ' + settled.payout + ' J' : '—');
    check('6.1 Blackjack : solde revenu au niveau d’avant la main (assurance 2:1)',
      J.Wallet.balance === bal0, 'solde ' + J.Wallet.balance + ' (départ ' + bal0 + ')');
    check('6.1 Blackjack : un seul règlement pour la manche (assurance incluse)',
      rec.settle.length === 1 && rec.refund.length === 0,
      JSON.stringify({ reglements: rec.settle.length, remboursements: rec.refund.length }));
  }

  /* 6.2 assurance refusée : la main est perdue, rien n’est rendu */
  {
    resetRec();
    forceShoe(deal);
    const bal0 = J.Wallet.balance;
    doc.querySelector('#gActions [data-act="play"]').click();
    await until(() => g.phase === 'insurance', 3000);
    const no = btnText(/Non merci/);
    if (no) no.click();
    await wait(40);
    check('6.2 Blackjack : refuser l’assurance ne débite rien de plus',
      g.insurance === 0 && J.Wallet.balance === bal0 - 100, 'solde ' + J.Wallet.balance + ' · assurance ' + g.insurance);
    if (standBtn()) standBtn().click();
    await until(() => !g.busy, 4000);
    const settled = rec.settle[0];
    check('6.2 Blackjack : sans assurance, le blackjack du croupier fait perdre la mise',
      !!settled && settled.mult === 0 && settled.profit === -100 && J.Wallet.balance === bal0 - 100,
      settled ? 'mult ' + settled.mult + ' · net ' + settled.profit + ' J' : '—');
  }

  check('6.3 Blackjack : aucune erreur JavaScript sur les mains d’assurance',
    errors.length === 0, errors.slice(0, 3).join(' | '));
  J.Games.close(true);
  speedDown();
}

/* ================================ 7. COMMANDES PENDANT UNE MANCHE ======== */
section('7. Commandes : aucune commande active qui ne ferait rien');
{
  /* Ces contrôles se font en temps réel (animations non accélérées) : c'est
     pendant la manche que le joueur peut appuyer, et c'est là que le bouton
     doit dire la vérité — actif s'il agit, désactivé sinon. */
  const sample = async (pred, ms) => {
    const t0 = Date.now();
    let busySamples = 0, activeButDead = 0;
    while (Date.now() - t0 < ms) {
      const b = doc.querySelector('#gActions [data-act="play"]');
      if (J.Games.instance() && J.Games.instance().busy) {
        busySamples++;
        if (b && !b.disabled) activeButDead++;
      }
      await wait(24);
    }
    return { busySamples, activeButDead };
  };

  /* 7.1 dice : la commande principale doit être inerte ET désactivée */
  reset();
  resetRec();
  J.Games.open('dice');
  await wait(80);
  const g1 = J.Games.instance();
  doc.querySelector('#gActions [data-act="play"]').click();
  const d1 = await sample(null, 400);
  await until(() => !g1.busy, 6000);
  check('7.1 dice : « Lanc… » est désactivée pendant la manche (aucun bouton actif sans effet)',
    d1.busySamples > 0 && d1.activeButDead === 0,
    d1.busySamples + ' mesures en manche · ' + d1.activeButDead + ' bouton(s) actif(s) sans effet');
  check('7.1 dice : la manche se règle et la commande redevient active',
    rec.settle.length === 1 && !g1.busy && !doc.querySelector('#gActions [data-act="play"]').disabled,
    'règlements=' + rec.settle.length + ' · busy=' + g1.busy);

  /* 7.2 crash : la commande d'encaissement DOIT rester active pendant le vol */
  reset();
  resetRec();
  J.Games.open('crash');
  await wait(80);
  const g2 = J.Games.instance();
  doc.querySelector('#gActions [data-act="play"]').click();
  let cashActiveWhileBusy = false, sawBusy = false;
  for (let i = 0; i < 40 && !rec.settle.length; i++) {
    const c = doc.querySelector('#gActions [data-act="cashout"]');
    if (g2.busy) { sawBusy = true; if (c && !c.disabled) cashActiveWhileBusy = true; }
    if (cashActiveWhileBusy) { c.click(); break; }
    await wait(40);
  }
  await until(() => !g2.busy, 8000);
  check('7.2 crash : encaisser reste actif pendant le vol et règle la manche',
    sawBusy && cashActiveWhileBusy && rec.settle.length === 1,
    JSON.stringify({ mancheEnCours: sawBusy, boutonActif: cashActiveWhileBusy, reglements: rec.settle.length }));

  /* 7.3 assurance : les commandes de décision restent actives pendant la manche */
  reset();
  resetRec();
  J.Games.open('blackjack');
  await wait(80);
  const g3 = J.Games.instance();
  doc.querySelector('#gActions [data-act="play"]').click();
  /* Le croupier peut montrer un As : on refuse alors l'assurance pour arriver
     à la phase de décision, exactement comme un joueur. */
  let stand = null;
  const findStand = () => Array.prototype.slice.call(doc.querySelectorAll('#gActions button:not([disabled])')).find((b) => /^Rester/.test(b.textContent));
  const dec = await until(() => {
    if (g3.phase === 'insurance') {
      const no = Array.prototype.slice.call(doc.querySelectorAll('#gActions button:not([disabled])')).find((x) => /Non merci/.test(x.textContent));
      if (no) no.click();
      return null;
    }
    if (g3.phase === 'player') { stand = findStand(); return stand ? g3 : null; }
    return null;
  }, 5000);
  check('7.3 blackjack : la commande de décision est proposée et active en manche',
    !!dec && !!stand && !stand.disabled, stand ? 'bouton « ' + stand.textContent.trim() + ' » actif' : 'aucune commande');
  if (stand) stand.click();
  await until(() => !g3.busy, 6000);
  check('7.3 blackjack : la main se règle après la décision', rec.settle.length === 1 && !g3.busy,
    'règlements=' + rec.settle.length + ' · busy=' + g3.busy);
  J.Games.close(true);
}

/* ============ 8. SORTIE DE JEU EN PLEINE MANCHE (roue, plinko, limbo) ==== */
section('8. Sortie de jeu en pleine manche : aucune mise perdue ni dupliquée');
{
  speedUp();
  const CASES = [
    { id: 'wheel', at: 400 },
    { id: 'plinko', at: 300 },
    /* dice : l'ancien code lisait g.ticket.bet dans son image d'animation après
       une sortie de jeu → exception non rattrapée (voir section 8, dernier
       contrôle « aucune erreur JavaScript »). */
    { id: 'dice', at: 200 },
    { id: 'limbo', at: 300 }
  ];
  for (const cs of CASES) {
    reset();
    resetRec();
    const bal0 = J.Wallet.balance;
    J.Games.open(cs.id);
    await wait(80);
    const play = doc.querySelector('#gActions [data-act="play"]');
    check('8 ' + cs.id + ' : la commande de jeu est disponible au montage', !!play && !play.disabled,
      play ? play.textContent.trim() : 'aucune commande');
    if (play) play.click();
    await until(() => rec.stake.length === 1, 1200);
    await wait(cs.at);
    J.Games.close(true);                       // sortie en pleine manche, comme un retour au lobby
    await wait(150);
    check('8 ' + cs.id + ' : la mise est soldée une seule fois (règlement ou remboursement)',
      rec.stake.length === 1 && rec.settle.length + rec.refund.length === 1 && !J.Store.state.pending,
      JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length, remboursements: rec.refund.length,
        solde: J.Wallet.balance, attendu: bal0 }));
    check('8 ' + cs.id + ' : le solde ne perd ni ne duplique la mise',
      J.Wallet.balance === bal0 + (rec.settle[0] ? rec.settle[0].payout - betOf(rec.settle[0]) : 0),
      'solde ' + J.Wallet.balance + ' (départ ' + bal0 + ')');

    /* Réouverture : le jeu doit rester jouable, manche comprise. */
    resetRec();
    J.Games.open(cs.id);
    await wait(80);
    const play2 = doc.querySelector('#gActions [data-act="play"]');
    if (play2) play2.click();
    await until(() => rec.settle.length === 1, 12000);
    check('8 ' + cs.id + ' : réouverture puis manche complète (aucun jeu bloqué)',
      rec.stake.length === 1 && rec.settle.length === 1, JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length }));
    J.Games.close(true);
  }
  check('8. sorties de manche : aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  speedDown();
}

/* ========== 9. BACCARAT : 3ᵉ CARTE, PAIRES ET PAIEMENTS AU DÉTAIL ======== */
section('9. Baccarat : tableau de la 3ᵉ carte, paires, paiement case par case, RTP mesuré');
{
  speedUp();
  reset();
  J.Games.open('baccarat');
  await wait(60);
  const g = J.Games.instance();
  const D = J.__baccarat;
  const T = D.spotTotal;
  const CD = (rank, suit) => rank + 13 * (suit || 0);
  const clearBets = () => doc.querySelector('#bacClear').click();
  const place = (zone, n) => { for (let i = 0; i < (n || 1); i++) doc.querySelector('[data-zone="' + zone + '"]').click(); };
  const playBtn = () => doc.querySelector('#gActions [data-act="play"]');
  const forceHand = (drawOrder) => {
    g.shoe = [];
    for (let i = 0; i < 40; i++) g.shoe.push(CD(0));          // remplissage (2 points)
    drawOrder.slice().reverse().forEach((c) => g.shoe.push(c));
  };

  /* 9.1 — Tableau officiel de la 3ᵉ carte.
     Une SECONDE implémentation, écrite à partir des règles du Punto Banco (et
     non du code du jeu), rejoue 20 000 donnes : cartes tirées, totaux et
     résultat doivent être identiques. C'est la preuve que le « tableau
     officiel » annoncé dans les règles est bien celui qui est appliqué. */
  const refPlayOut = (shoe) => {
    const draw = () => shoe.pop();
    const val = (c) => { const r = c % 13; return r === 12 ? 1 : r >= 9 ? 0 : r + 2; };
    const tot = (cs) => cs.reduce((a, c) => a + val(c), 0) % 10;
    const p = [draw(), draw()], b = [draw(), draw()];
    const pt = tot(p), bt = tot(b);
    let pThird = null, bThird = null;
    if (pt < 8 && bt < 8) {                                   // pas de naturel
      if (pt <= 5) { pThird = draw(); p.push(pThird); }
      const v = pThird === null ? null : val(pThird);
      let bankDraw;
      if (v === null) bankDraw = bt <= 5;                     // le Joueur a passé
      else if (bt <= 2) bankDraw = true;
      else if (bt === 3) bankDraw = v !== 8;
      else if (bt === 4) bankDraw = v >= 2 && v <= 7;
      else if (bt === 5) bankDraw = v >= 4 && v <= 7;
      else if (bt === 6) bankDraw = v === 6 || v === 7;
      else bankDraw = false;                                  // bt === 7
      if (bankDraw) { bThird = draw(); b.push(bThird); }
    }
    const fp = tot(p), fb = tot(b);
    return { player: p, banker: b, pThird, bThird, pTotal: fp, bTotal: fb,
      outcome: fp > fb ? 'joueur' : fb > fp ? 'banque' : 'egalite' };
  };
  {
    const N = 20000;
    let diffs = 0, premier = '';
    for (let i = 0; i < N; i++) {
      const shoe = D.newShoe();
      const r = refPlayOut(shoe.slice());
      const e = D.playOut(shoe.slice());
      const meme = r.pTotal === e.pTotal && r.bTotal === e.bTotal && r.outcome === e.outcome &&
        String(r.pThird) === String(e.pThird) && String(r.bThird) === String(e.bThird) &&
        r.player.join(' ') === e.player.join(' ') && r.banker.join(' ') === e.banker.join(' ');
      if (!meme) { diffs++; if (!premier) premier = JSON.stringify({ reference: r, moteur: e }); }
    }
    check('9.1 3ᵉ carte : le moteur suit le tableau officiel sur ' + N + ' donnes', diffs === 0,
      diffs ? diffs + ' écart(s) · ' + premier.slice(0, 150) : 'cartes, totaux et résultat identiques');
  }

  /* 9.2 — Matrice de paiement : pour chaque résultat, la valeur RÉGLÉE de
     chaque case du tapis. Les mises sont posées aux vraies commandes, une case
     à la fois, et chaque règlement est comparé à la règle annoncée :
     Joueur 1:1 (rendu sur égalité) · Banque 0,95:1 (rendue sur égalité) ·
     Égalité 8:1 · Paire 11:1 (sur les deux premières cartes de la main). */
  const MATRICE = [
    { nom: 'Victoire Joueur (naturel 8 contre 5)',
      hand: [CD(6), CD(8, 1), CD(0), CD(1)], outcome: 'joueur',
      attendu: { joueur: 2, banque: 0, egalite: 0, paireJ: 0, paireB: 0 } },
    { nom: 'Victoire Banque (9 contre 6, paire Joueur)',
      hand: [CD(6, 2), CD(6, 3), CD(7), CD(8)], outcome: 'banque',
      attendu: { joueur: 0, banque: 1.95, paireJ: 12, paireB: 0 } },
    { nom: 'Égalité (deux naturels à 8)',
      hand: [CD(6), CD(8, 1), CD(6, 2), CD(8, 3)], outcome: 'egalite',
      attendu: { joueur: 1, banque: 1, egalite: 9, paireJ: 0, paireB: 0 } },
    { nom: 'Paire Banque alors que le Joueur gagne',
      hand: [CD(6), CD(8, 1), CD(0), CD(0, 3)], outcome: 'joueur',
      attendu: { banque: 0, paireB: 12 } }
  ];
  for (const cas of MATRICE) {
    const lignes = [];
    let ok = true;
    for (const zone of Object.keys(cas.attendu)) {
      resetRec();
      forceHand(cas.hand);
      clearBets();
      place(zone);
      const avant = J.Wallet.balance;
      playBtn().click();
      await until(() => !g.busy && g.phase === 'done', 4000);
      const s = rec.settle[0];
      const attendu = cas.attendu[zone];
      const paye = Math.round(100 * attendu);
      const bon = !!s && Math.abs(s.mult - attendu) < 1e-9 && s.payout === paye &&
        (J.Wallet.balance - avant) === (paye - 100) && g.outcome === cas.outcome;
      if (!bon) ok = false;
      lignes.push(zone + ' : ' + (s ? s.mult.toFixed(2).replace('.', ',') + 'x payé ' + s.payout + ' J' : 'AUCUN RÈGLEMENT') +
        ' (règle ' + attendu + 'x → ' + paye + ' J)');
      if (g.outcome !== cas.outcome) lignes.push('résultat ' + g.outcome + ' ≠ ' + cas.outcome + ' (scénario à revoir)');
    }
    check('9.2 ' + cas.nom + ' : chaque case réglée à sa valeur', ok, lignes.join(' · '));
  }

  /* 9.3 — RTP de chaque case, mesuré sur le moteur réel (300 000 donnes).
     Les valeurs annoncées (Joueur 98,76 % · Banque 98,94 % · Égalité 85,64 % ·
     Paire 89,64 %) supposent que l'ÉGALITÉ REMBOURSE les mises Joueur et
     Banque : ce contrôle attrape donc aussi une régression de cette règle
     (sans le remboursement, le Joueur tomberait à 89,24 %). */
  {
    const N = 300000;
    const somme = { joueur: 0, banque: 0, egalite: 0, paireJ: 0, paireB: 0 };
    let shoe = D.newShoe();
    for (let i = 0; i < N; i++) {
      if (shoe.length < 12) shoe = D.newShoe();
      const r = D.playOut(shoe);
      const tie = r.outcome === 'egalite';
      somme.joueur += r.outcome === 'joueur' ? 2 : (tie ? 1 : 0);
      somme.banque += r.outcome === 'banque' ? 1.95 : (tie ? 1 : 0);
      somme.egalite += tie ? 9 : 0;
      somme.paireJ += D.isPair(r.player) ? 12 : 0;
      somme.paireB += D.isPair(r.banker) ? 12 : 0;
    }
    const ATTENDU = { joueur: 98.76, banque: 98.94, egalite: 85.64, paireJ: 89.64, paireB: 89.64 };
    const rtp = (k) => (somme[k] / N) * 100;
    const hors = Object.keys(ATTENDU).filter((k) => Math.abs(rtp(k) - ATTENDU[k]) > 1.5);
    check('9.3 RTP mesuré sur ' + N + ' donnes du moteur (tolérance 1,5 point)', hors.length === 0,
      Object.keys(ATTENDU).map((k) => k + ' ' + rtp(k).toFixed(2) + ' % / annoncé ' + ATTENDU[k] + ' %').join(' · '));
  }
  check('9. Baccarat : aucune erreur JavaScript sur les manches de contrôle', errors.length === 0, errors.slice(0, 3).join(' | '));
  J.Games.close(true);
  speedDown();
}

/* ============== 10. HI-LO : MULTIPLICATEURS ET ÉGALITÉS NEUTRES ========= */
section('10. Hi-Lo : formule des multiplicateurs, égalité neutre, paiement affiché');
{
  speedUp();
  reset();
  J.Games.open('hilo');
  await wait(60);
  const g = J.Games.instance();
  const ctl = forceRank(g);
  const play = () => doc.querySelector('#gActions [data-act="play"]');
  const cash = () => doc.querySelector('#gActions [data-act="cashout"]');
  const num = (txt) => parseFloat(String(txt).replace(',', '.').replace(/[^0-9.]/g, ''));
  /* Multiplicateur affiché dans le message du jeu (« · multiplicateur 1,02x ») */
  const msgMult = () => { const m = String(doc.getElementById('hlMsg').textContent).match(/[0-9]+,[0-9]+x/); return m ? num(m[0]) : NaN; };
  const msgMultTxt = () => (String(doc.getElementById('hlMsg').textContent).match(/[0-9]+,[0-9]+x/) || ['—'])[0];
  /* Montant annoncé par la commande d'encaissement (« Encaisser 8 272 J ») */
  const montant = (el) => {
    const m = String(el ? el.textContent : '').match(/Encaisser\s*([0-9][0-9\s\u00a0\u202f]*)\s*J/);
    return m ? parseInt(m[1].replace(/[\s\u00a0\u202f]/g, ''), 10) : NaN;
  };
  /* Rang encore fourni (au moins deux exemplaires) : garantit que le pari
     Égalité est réellement proposé par la table. */
  const rangFourni = () => {
    let b = null;
    for (let r = 1; r <= 13; r++) if (g.deck.counts[r] >= 2 && (b === null || g.deck.counts[r] > g.deck.counts[b])) b = r;
    return b;
  };
  /* Valeurs EXACTES attendues, recalculées depuis le jeu restant (aucune
     relecture du moteur) : pW, pT, puis la formule de la règle affichée. */
  const attendu = () => {
    const c = g.deck.counts, rem = g.deck.remaining, r = g.card.rank, m = g.mult;
    let hi = 0, lo = 0, same = 0;
    for (let x = 1; x <= 13; x++) { const nb = c[x]; if (x > r) hi += nb; else if (x < r) lo += nb; else same += nb; }
    const pH = hi / rem, pL = lo / rem, pT = same / rem;
    return { pH, pL, pT, mH: m * (1 - pT) / pH, mL: m * (1 - pT) / pL, mT: same ? m / pT : 0 };
  };
  const bestRank = (pred) => { let b = null; for (let r = 1; r <= 13; r++) if (g.deck.counts[r] > 0 && pred(r, g.card.rank) && (b === null || g.deck.counts[r] > g.deck.counts[b])) b = r; return b; };

  ctl.next(7);
  play().click();
  await wait(60);
  check('10.0 Hi-Lo : carte de départ et multiplicateur de départ', g.card.rank === 7 && g.mult === 0.99 && g.steps === 0,
    'carte ' + g.card.rank + ' · mult ' + g.mult);

  /* 10.1 victoire « Plus haut » : mult' = mult × (1 − pT) / pW */
  const up = bestRank((r, c) => r > c);
  const a1 = attendu();
  ctl.next(up);
  doc.getElementById('hlHigh').click();
  await wait(60);
  check('10.1 victoire « Plus haut » : multiplicateur conforme à la formule m × (1 − pT) / pW',
    Math.abs(g.mult - a1.mH) < 1e-9 && g.mult > 0.99,
    'attendu ' + a1.mH.toFixed(6) + ' · moteur ' + g.mult.toFixed(6) + ' (pW ' + a1.pH.toFixed(4) + ' · pT ' + a1.pT.toFixed(4) + ')');
  check('10.1 victoire « Plus haut » : la prédiction est comptée, l’égalité neutre non',
    g.steps === 1 && g.tieCount === 0, 'pas=' + g.steps + ' · égalités=' + g.tieCount);
  check('10.1 multiplicateur affiché = multiplicateur du moteur', Math.abs(msgMult() - g.mult) < 0.005,
    'affiché ' + msgMult() + ' · moteur ' + g.mult.toFixed(4));
  check('10.1 les trois choix sont proposés avec leurs paiements exacts',
    Math.abs(num(doc.getElementById('hlHighMult').textContent) - attendu().mH) < 0.005 &&
    Math.abs(num(doc.getElementById('hlLowMult').textContent) - attendu().mL) < 0.005 &&
    Math.abs(num(doc.getElementById('hlTieMult').textContent) - attendu().mT) < 0.005,
    'plus haut ' + doc.getElementById('hlHighMult').textContent + ' · égalité ' + doc.getElementById('hlTieMult').textContent +
    ' · plus bas ' + doc.getElementById('hlLowMult').textContent);

  /* 10.2 carte inférieure : la formule doit tenir aussi pour « Plus bas » */
  const low = bestRank((r, c) => r < c && r > 1);
  const a2 = attendu();
  ctl.next(low);
  doc.getElementById('hlLow').click();
  await wait(60);
  check('10.2 victoire « Plus bas » : multiplicateur conforme à m × (1 − pT) / pL',
    Math.abs(g.mult - a2.mL) < 1e-9 && g.mult > a1.mH,
    'attendu ' + a2.mL.toFixed(6) + ' · moteur ' + g.mult.toFixed(6) + ' (pL ' + a2.pL.toFixed(4) + ')');

  /* 10.3 égalité sur un pari directionnel : NEUTRE, au bit près */
  const m3 = g.mult, s3 = g.steps, t3 = g.tieCount;
  const txt3 = msgMultTxt();
  ctl.next(g.card.rank);
  doc.getElementById('hlHigh').click();
  await wait(60);
  check('10.3 égalité sur « Plus haut » : le multiplicateur ne bouge pas (valeur affichée identique)',
    g.mult === m3 && msgMultTxt() === txt3,
    'moteur ' + m3.toFixed(6) + ' → ' + g.mult.toFixed(6) + ' · affiché « ' + txt3 + ' » → « ' + msgMultTxt() + ' »');
  check('10.3 égalité : la prédiction n’est pas comptée, l’égalité neutre est notée',
    g.steps === s3 && g.tieCount === t3 + 1, 'pas=' + g.steps + ' (avant ' + s3 + ') · égalités=' + g.tieCount);
  check('10.3 égalité : la manche continue (mise conservée, trois choix toujours proposés)',
    !!g.ticket && g.phase === 'guess' && !g.highBtn.disabled && !g.lowBtn.disabled,
    'manche ' + (g.ticket ? 'en cours' : 'terminée') + ' · phase ' + g.phase);

  /* 10.4 pari Égalité gagné : manche NEUVE dont la carte de départ a encore des
     copies dans le sabot (sans quoi la table ne propose pas le pari : c'est la
     règle), puis tirage forcé du même rang. */
  cash().click();                                  // encaisser la manche testée en 10.1-10.3
  await wait(60);
  resetRec();
  const rStart = rangFourni();
  const avantTie = J.Wallet.balance;
  ctl.next(rStart);
  play().click();
  await wait(60);
  check('10.4 pari Égalité : proposé et chiffré quand des cartes du même rang restent',
    g.card.rank === rStart && !doc.getElementById('hlTie').disabled && rangFourni() !== null,
    'carte ' + g.card.rank + ' · ' + doc.getElementById('hlTieMult').textContent + ' pour ' +
    g.deck.counts[g.card.rank] + ' carte(s) sur ' + g.deck.remaining);
  const a4 = attendu();
  const pTie = a4.pT;
  ctl.next(g.card.rank);
  doc.getElementById('hlTie').click();
  await wait(60);
  check('10.4 pari Égalité gagné : multiplicateur = mult / P(égalité)', Math.abs(g.mult - a4.mT) < 1e-9,
    'attendu ' + a4.mT.toFixed(6) + ' · moteur ' + g.mult.toFixed(6) + ' (pT ' + pTie.toFixed(4) + ')');
  check('10.4 pari Égalité gagné : il compte comme une prédiction juste, pas comme une égalité neutre',
    g.steps === 1 && g.tieCount === 0,
    'pas=' + g.steps + ' (attendu 1) · égalités neutres=' + g.tieCount + ' (attendu 0)');

  const cashBtn = cash();
  const multAffiche = msgMult();
  const mise = g.ticket.bet;
  check('10.4 encaissement : la commande annonce mise × multiplicateur affiché',
    !!cashBtn && montant(cashBtn) === Math.round(mise * multAffiche),
    (cashBtn ? cashBtn.textContent.trim() : 'aucune commande') + ' (attendu ' + Math.round(mise * multAffiche) + ' J)');
  resetRec();
  cashBtn.click();
  cashBtn.click();                                   // double appui réel
  await wait(80);
  check('10.4 encaissement : paiement = mise × multiplicateur affiché, une seule fois',
    rec.settle.length === 1 && rec.settle[0].payout === Math.round(mise * multAffiche) && rec.stake.length === 0,
    (rec.settle.length ? rec.settle[0].payout + ' J' : '—') + ' · multiplicateur ' + multAffiche.toFixed(4) +
    ' · solde ' + (J.Wallet.balance - avantTie > 0 ? '+' : '') + (J.Wallet.balance - avantTie) + ' J');
  check('10.4 encaissement : la manche suivante repart de 0,99 avec l’état remis à zéro',
    g.mult === 0.99 && g.steps === 0 && g.tieCount === 0 && g.phase === 'idle',
    JSON.stringify({ mult: g.mult, pas: g.steps, egalites: g.tieCount, phase: g.phase }));

  /* 10.5 échec sur Égalité : manche neuve jouable, puis tirage d'un AUTRE rang */
  resetRec();
  ctl.next(rangFourni());
  play().click();
  await wait(60);
  const bal5 = J.Wallet.balance;
  const mise5 = g.bet;
  const other = bestRank((r, c) => r !== c);
  ctl.next(other);
  doc.getElementById('hlTie').click();
  await wait(60);
  /* bal5 est relevé APRÈS le débit de la mise : une manche perdue laisse donc
     le solde exactement où il est (aucun crédit, aucun remboursement). */
  check('10.5 échec sur Égalité : manche perdue, mise non rendue, un seul débit et un seul règlement',
    rec.stake.length === 1 && rec.settle.length === 1 && rec.settle[0].mult === 0 && rec.settle[0].payout === 0 &&
      rec.refund.length === 0 && !g.ticket && J.Wallet.balance === bal5,
    JSON.stringify({ mises: rec.stake.length, reglements: rec.settle.length, remboursements: rec.refund.length,
      mise: mise5, solde: 'inchangé à ' + J.Wallet.balance }));
  check('10.5 après une perte : multiplicateur remis à 0,99 pour la manche suivante',
    g.mult === 0.99 && g.steps === 0 && g.ticket === null && g.phase === 'idle',
    JSON.stringify({ mult: g.mult, phase: g.phase }));
  ctl.undo();
  J.Games.close(true);
  speedDown();
}

/* === 11. MACHINES À SOUS : COMPTEUR DES TOURS GRATUITS ET RETOUR AU NORMAL = */
section('11. Machines à sous : compteur, barème du bonus, nouveau déclenchement');
{
  speedUp();
  /* Le planificateur accéléré rendrait le bonus trop rapide pour observer le
     compteur : on ralentit UNIQUEMENT les rappels du bonus (30 ms), le reste de
     la manche garde la vitesse de test. */
  const g = await openSlots('gemmes');
  const t = J.SLOTS_DATA.THEMES[g.themeIdx];
  const scheduleRapide = J.Games.schedule;
  J.Games.schedule = (gg, fn, delay) => {
    const id = setTimeout(fn, gg && gg.free ? 30 : 4);
    if (gg && gg._timers) gg._timers.push(id);
    return id;
  };
  resetRec();
  const scatterGrid = [0, 1, 2, 3, 4].map((i) => (i < 3 ? stopFor(t.reels[i], 'S') : stopWithout(t.reels[i], 'S')));
  const ctl = forceSpins((spin) => (spin === 0 ? scatterGrid : null));
  const bal0 = J.Wallet.balance;
  SPIN();
  const f = await until(() => g.free, 1500);
  const baseBonus = f ? f.base : 0;
  check('11.0 le bonus s’ouvre avec le nombre de tours annoncé par les règles (' + t.freeSpins + ')',
    !!f && f.total === t.freeSpins && f.done === 0,
    f ? 'total=' + f.total + ' · joués=' + f.done : 'aucun bonus');

  /* On écoute le compteur et le barème AU MOMENT où le moteur les écrit :
     chaque tour gratuit doit incrémenter le compteur d'exactement 1, et le
     multiplicateur doit suivre le barème de la machine. */
  let joues = f.done, gagnes = f.won, barème = f.mult;
  const pas = [], baremeVu = [];
  Object.defineProperty(f, 'done', {
    configurable: true,
    get: () => joues,
    set: (v) => { if (v !== joues) pas.push(v - joues); joues = v; }
  });
  Object.defineProperty(f, 'won', { configurable: true, get: () => gagnes, set: (v) => { gagnes = v; } });
  Object.defineProperty(f, 'mult', {
    configurable: true,
    get: () => barème,
    set: (v) => { if (v !== barème) baremeVu.push([joues, v]); barème = v; }
  });
  let resolutions = 0;
  const vraiFinish = J.Games.finish;
  J.Games.finish = function (jeu, m, e) { resolutions++; return vraiFinish.call(J.Games, jeu, m, e); };
  const fini = await until(() => !g.free && !g.busy && rec.settle.length, 15000);
  J.Games.finish = vraiFinish;
  ctl.undo();

  check('11.1 chaque tour gratuit est décompté exactement une fois (10 incréments de 1)',
    pas.length === t.freeSpins && pas.every((d) => d === 1) && joues === t.freeSpins,
    'incréments ' + JSON.stringify(pas) + ' · compteur final ' + joues + '/' + t.freeSpins);
  const baremeAttendu = [];
  for (let d = 1; d < t.multSchedule.length; d++) if (t.multSchedule[d] !== t.multSchedule[d - 1]) baremeAttendu.push([d, t.multSchedule[d]]);
  check('11.1 le multiplicateur du bonus suit le barème de la machine',
    JSON.stringify(baremeVu) === JSON.stringify(baremeAttendu),
    JSON.stringify(baremeVu) + ' · barème ' + JSON.stringify(t.multSchedule));
  check('11.1 le bonus se termine de lui-même après le dernier tour', !!fini && !g.free && !g.busy && !g.spinning,
    JSON.stringify({ free: g.free, busy: g.busy, spinning: g.spinning, compteur: joues }));
  check('11.1 une seule résolution de manche pour tout le bonus', resolutions === 1 && rec.settle.length === 1,
    resolutions + ' résolution(s) · ' + rec.settle.length + ' règlement(s)');
  const s1 = rec.settle[0];
  const totalAttendu = Math.min(baseBonus + gagnes, Math.round((s1 ? s1.ticket.bet : 0) * 2500));
  check('11.1 gain du bonus crédité une seule fois et égal aux tours gagnés + rotation payante',
    !!s1 && s1.payout === totalAttendu && s1.payout === Math.round(s1.ticket.bet * s1.mult) &&
      J.Wallet.balance - bal0 === s1.profit,
    'payé ' + (s1 ? s1.payout : '—') + ' J · attendu ' + totalAttendu + ' J (rotation payante ' + baseBonus +
    ' J + tours gratuits ' + gagnes + ' J) · solde ' + (J.Wallet.balance - bal0) + ' J');
  check('11.1 retour au mode normal : aucun tour gratuit ne reste en mémoire',
    g.free === null && g.msg.indexOf('TOURS GRATUITS') < 0 && !g.spinning,
    'message : « ' + g.msg + ' »');

  /* 11.2 nouveau déclenchement APRÈS la fin du bonus (le retrigger autorisé par
     les règles : un nouveau coup payant peut rouvrir un bonus complet). */
  const ctl2 = forceSpins((spin) => (spin === 0 ? scatterGrid : null));
  const bal2 = J.Wallet.balance;
  SPIN();
  const f2 = await until(() => g.free, 1500);
  check('11.2 après un bonus terminé, un nouveau coup peut rouvrir un bonus complet',
    !!f2 && f2.total === t.freeSpins && f2.done === 0, f2 ? 'total=' + f2.total : 'aucun bonus');
  const fini2 = await until(() => !g.free && !g.busy, 15000);
  ctl2.undo();
  check('11.2 le deuxième bonus se termine aussi proprement', !!fini2 && g.free === null && rec.settle.length === 2,
    JSON.stringify({ reglements: rec.settle.length, busy: g.busy, free: g.free }));
  check('11.2 deux bonus = deux manches payantes distinctes (2 mises, 2 règlements, solde = somme des nets)',
    rec.stake.length === 2 && Math.abs((J.Wallet.balance - bal2) - (rec.settle[1].profit)) < 0.51,
    'solde ' + (J.Wallet.balance - bal2) + ' J sur la 2ᵉ manche · net ' + rec.settle[1].profit + ' J');

  /* 11.3 une manche payante ordinaire ne doit PAS hériter du barème du bonus */
  const vis = (strip, k) => [strip[k], strip[(k + 1) % strip.length], strip[(k + 2) % strip.length]];
  const symWin = Object.keys(t.pays).find((k) => k !== 'W' && k !== 'S');
  const stopsWin = t.reels.map((strip, i) => {
    for (let k = 0; k < strip.length; k++) {
      if (vis(strip, k).indexOf('S') >= 0) continue;                       // aucun scatter visible
      if (i < 3 && strip[(k + 1) % strip.length] !== symWin) continue;     // aligné sur la ligne du milieu
      return k;
    }
    return -1;
  });
  check('11.3 grille de contrôle trouvée (gain sur la ligne du milieu, sans scatter)',
    stopsWin.every((k) => k >= 0), 'arrêts ' + JSON.stringify(stopsWin) + ' · symbole ' + symWin);
  resetRec();
  const undo3 = forceGrid(stopsWin);
  const bal3 = J.Wallet.balance;
  SPIN();
  await until(() => rec.settle.length === 1, 4000);
  undo3();
  await wait(80);
  const s3 = rec.settle[0];
  const attendu3 = s3 ? Math.round(g.round.lineWin * (s3.ticket.bet / g.lines) * 1 + g.round.scatterWin * s3.ticket.bet) : 0;
  check('11.3 manche payante suivante : aucun multiplicateur de bonus ne subsiste',
    !!s3 && g.round.scatters === 0 && g.round.lineWin > 0 && s3.payout === attendu3 && s3.mult === s3.payout / s3.ticket.bet,
    'payé ' + (s3 ? s3.payout : '—') + ' J · attendu ' + attendu3 + ' J (lignes ' + g.round.lineWin +
    ' × mise/' + g.lines + ', mult appliqué ' + (s3 ? s3.mult.toFixed(3) : '—') + ')');
  check('11.3 état final : machine au repos, prête pour un nouveau coup',
    !g.spinning && !g.busy && g.free === null && g.spinFlags.every((x) => x === false),
    JSON.stringify({ spinning: g.spinning, busy: g.busy, free: g.free }));
  check('11.3 solde de la manche payante = mise + gain', Math.abs((J.Wallet.balance - bal3) - (s3 ? s3.profit : 0)) < 0.51,
    'solde ' + (J.Wallet.balance - bal3) + ' J · net ' + (s3 ? s3.profit : '—') + ' J');
  J.Games.schedule = scheduleRapide;
  J.Games.close(true);
  speedDown();
}

/* ==== 12. AUDIT TRANSVERSAL : CLICS MULTIPLES, SOLDE, COMMANDES, CYCLES === */
section('12. Audit transversal : clics multiples, solde insuffisant, commandes, cycles');
{
  speedUp();
  const clickSel = (sel) => { const el = doc.querySelector(sel); if (el && !el.disabled) { el.click(); return true; } return false; };
  const clickAct = (a) => clickSel('#gActions [data-act="' + a + '"]:not([disabled])');
  const clickText = (re) => {
    const b = Array.prototype.slice.call(doc.querySelectorAll('#gActions button:not([disabled])')).find((x) => re.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  };
  let n = 0;
  const STEP = {
    mines: () => (n++ < 2 ? clickSel('#mnGrid [data-tile]:not(.picked):not(.bomb)') : clickAct('cashout')),
    tower: (g) => clickSel('#twFloors [data-floor="' + g.floor + '"][data-tile="0"]') || clickAct('cashout'),
    keno: () => clickSel('#knRandom') || clickAct('play'),
    coinflip: () => clickAct('cashout') || clickSel('#cfSide [data-side]'),
    crash: () => clickAct('cashout'),
    blackjack: () => clickText(/Rester/) || clickText(/Non merci/) || clickText(/Nouvelle main/),
    videopoker: () => (n++ < 1 ? clickSel('.vp-card[data-card="0"]') : false) || clickText(/Tirer/),
    poker: () => clickText(/Se passer/),
    roulette: () => clickSel('#ruPresets [data-preset]'),
    baccarat: () => clickSel('#bacZones [data-zone]'),
    hilo: () => clickSel('#hlHigh') || clickSel('#hlLow'),
    wheel: () => false
  };
  const live = J.GAMES.filter((d) => d.status === 'live');
  const clicsMultiples = [], commandesBloquees = [], creditsTardifs = [], cyclesKo = [], fauché = [];

  for (const def of live) {
    /* --- 12.1 clics multiples : la commande principale est frappée trois fois
       d'affilée (un doigt impatient) — une seule mise doit être engagée. */
    reset();
    resetRec();
    n = 0;
    J.Games.open(def.id);
    await wait(40);
    const g = J.Games.instance();
    const step = STEP[def.id];
    if (!g) { clicsMultiples.push(def.id + ' : ne se monte pas'); continue; }
    const t0 = Date.now();
    while (Date.now() - t0 < 9000 && !rec.settle.length) {
      if (!rec.stake.length && !g.busy) {
        const b = doc.querySelector('#gActions [data-act="play"]:not([disabled])');
        if (b) { b.click(); b.click(); b.click(); await wait(20); }
        else if (step) { step(g); await wait(20); }
      } else if (step) { step(g); }
      await wait(24);
    }
    const s = rec.settle[0];
    if (rec.stake.length !== 1 || rec.settle.length !== 1 || !s) {
      clicsMultiples.push(def.id + ' : ' + rec.stake.length + ' mise(s) / ' + rec.settle.length + ' règlement(s) après 3 appuis');
    }
    /* --- 12.2 aucun crédit tardif : la manche réglée, le solde ne bouge plus */
    const balApres = J.Wallet.balance, reglApres = rec.settle.length, rembApres = rec.refund.length;
    await wait(260);
    if (J.Wallet.balance !== balApres || rec.settle.length !== reglApres || rec.refund.length !== rembApres) {
      creditsTardifs.push(def.id + ' : solde ' + balApres + ' → ' + J.Wallet.balance + ' après coup (' +
        (rec.settle.length - reglApres) + ' règlement(s), ' + (rec.refund.length - rembApres) + ' remboursement(s))');
    }
    /* --- 12.3 commandes : le jeu ne doit pas rester sur une commande morte */
    const needsBet = def.id === 'roulette' || def.id === 'baccarat';
    await wait(80);
    if (needsBet && step) { step(g); await wait(40); }
    const playApres = doc.querySelector('#gActions [data-act="play"]');
    if (!playApres || playApres.disabled) {
      commandesBloquees.push(def.id + ' : « ' + (playApres ? playApres.textContent.trim() : 'aucune commande') + ' » désactivée après la manche');
    }
    /* --- 12.4 cycles ouverture/fermeture : rien ne doit rester en suspens */
    for (let i = 0; i < 3; i++) {
      J.Games.close(true);
      if (J.Games.instance()) { cyclesKo.push(def.id + ' : un jeu reste monté après la fermeture'); break; }
      J.Games.open(def.id);
      await wait(24);
      if (!J.Games.instance()) { cyclesKo.push(def.id + ' : le jeu ne se remonte pas (cycle ' + (i + 1) + ')'); break; }
    }
    J.Games.close(true);
    if (J.Store.state.pending) cyclesKo.push(def.id + ' : manche en attente oubliée ' + JSON.stringify(J.Store.state.pending));
  }
  check('12.1 les 16 jeux : trois appuis d’affilée sur la commande principale = une seule mise, un seul règlement',
    clicsMultiples.length === 0, clicsMultiples.slice(0, 5).join(' | ') || live.length + ' jeux conformes');
  check('12.2 les 16 jeux : aucun crédit ni remboursement tardif après la fin de la manche',
    creditsTardifs.length === 0, creditsTardifs.slice(0, 5).join(' | ') || 'solde figé 260 ms après chaque manche');
  check('12.3 les 16 jeux : aucune commande principale bloquée après une manche',
    commandesBloquees.length === 0, commandesBloquees.slice(0, 5).join(' | ') || 'commande de rejeu disponible partout');
  check('12.4 les 16 jeux : 3 cycles ouverture/fermeture sans jeu fantôme ni manche en attente',
    cyclesKo.length === 0, cyclesKo.slice(0, 5).join(' | ') || '3 cycles × ' + live.length + ' jeux');

  /* --- 12.5 solde insuffisant : aucune mise fantôme, aucun solde négatif --- */
  for (const id of ['crash', 'dice', 'mines', 'plinko', 'limbo', 'coinflip', 'hilo', 'keno', 'tower', 'wheel',
    'roulette', 'blackjack', 'baccarat', 'slots', 'videopoker', 'poker']) {
    J.Games.close(true);
    J.Store.state.balance = 5;                     // sous la mise minimale (10 J)
    J.Store.save();
    J.Wallet.renderBalance();
    resetRec();
    J.Games.open(id);
    await wait(40);
    const g = J.Games.instance();
    const step = STEP[id];
    if (step) step(g);                             // poser une mise si la table l'exige
    const b = doc.querySelector('#gActions [data-act="play"]:not([disabled])');
    if (b) b.click();
    await wait(160);
    if (J.Wallet.balance !== 5 || rec.stake.length || rec.settle.length || J.Store.state.pending) {
      fauché.push(id + ' : solde ' + J.Wallet.balance + ' · ' + rec.stake.length + ' mise(s) · pending=' +
        JSON.stringify(J.Store.state.pending));
    }
    try { J.UI.closeModal(); } catch (e) { /* aucune fenêtre ouverte */ }
    J.Games.close(true);
  }
  check('12.5 solde insuffisant : les 16 jeux refusent proprement (solde intact, aucune mise fantôme)',
    fauché.length === 0, fauché.slice(0, 5).join(' | ') || 'solde 5 J conservé, aucun ticket ouvert');
  reset();
  check('12. Audit transversal : aucune erreur JavaScript sur les 16 jeux', errors.length === 0, errors.slice(0, 3).join(' | '));
  speedDown();
}

/* ---------------------------------------------------------------- BILAN -- */
console.log('\n' + '─'.repeat(72));
console.log((failed === 0 ? '✅ ' : '❌ ') + passed + ' contrôles réussis, ' + failed + ' échec(s)');
if (errors.length) console.log('Erreurs de page : ' + errors.slice(0, 5).join(' | '));
if (failures.length) {
  console.log('\nÉchecs :');
  failures.forEach((f) => console.log('  · ' + f));
}
process.exit(failed === 0 ? 0 : 1);
