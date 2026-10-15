#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — TEST DE FUMÉE (parcours complet de l'interface)
   Simule un joueur qui explore tout : chaque écran, chaque modale, chaque
   jeu, chaque réglage, l'auto-bet, la boutique, la roue…
   Objectif : aucun exception, aucun message d'erreur, état toujours cohérent.
   Usage : node tests/smoke.mjs
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'jackpotly.html'), 'utf8');
const { JSDOM, VirtualConsole } = await import('jsdom');

const problems = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => problems.push('jsdomError: ' + (e.detail || e.message)));
vc.on('error', (...a) => problems.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://jackpotly.local/', virtualConsole: vc,
  beforeParse(window) {
    const fake = () => new Proxy({}, {
      get(t, k) {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (k === 'measureText') return () => ({ width: 10 });
        if (k in t) return t[k];
        return () => {};
      }, set(t, k, v) { t[k] = v; return true; }
    });
    window.HTMLCanvasElement.prototype.getContext = fake;
    try { window.navigator.vibrate = () => true; } catch { /* noop */ }
    window.addEventListener('error', (e) => problems.push('window.error: ' + (e.message || e.error)));
    window.addEventListener('unhandledrejection', (e) => problems.push('unhandled: ' + (e.reason && e.reason.message || e.reason)));
  }
});

const win = dom.window, doc = win.document;
const J = win.JACKPOTLY;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

/** Clique un élément (ou tous ceux qui correspondent) en absorbant les erreurs. */
function click(sel, all) {
  const els = all ? $$(sel) : [$(sel)].filter(Boolean);
  if (!els.length) { problems.push('sélecteur introuvable: ' + sel); return 0; }
  els.forEach((el) => { try { el.click(); } catch (e) { problems.push('clic ' + sel + ' → ' + e.message); } });
  return els.length;
}

/** Attend que le jeu monté ait terminé sa partie en cours (max 4 s). */
async function waitIdle(g, ms = 4000) {
  const t0 = Date.now();
  while (g.busy && Date.now() - t0 < ms) await wait(50);
  return !g.busy;
}

const steps = [];
function step(name, fn) { steps.push([name, fn]); }

/* ------------------------------------------------------------- PARCOURS */
step('splash puis accueil', async () => {
  await wait(2400);
  if (!J) throw new Error('namespace absent');
  if (J.Store.state.balance !== 10000) throw new Error('solde initial incorrect');
});

step('navigation sur les 5 onglets (2 passes)', async () => {
  for (let round = 0; round < 2; round++) {
    for (const go of ['home', 'originals', 'rank', 'shop', 'profile']) {
      click('.nav-btn[data-go="' + go + '"]');
      await wait(30);
      if (!doc.getElementById('screen-' + go).classList.contains('is-on')) throw new Error('écran ' + go + ' non affiché');
    }
  }
});

step('segments du catalogue et du classement', async () => {
  click('.nav-btn[data-go="originals"]');
  click('#originalsSeg button', true);
  for (const f of ['all', 'originals', 'classics', 'soon']) {
    const b = $('#originalsSeg [data-filter="' + f + '"]');
    b.click(); await wait(20);
    if (!doc.querySelectorAll('#originalsGrid .game-tile').length) throw new Error('catalogue vide: ' + f);
  }
  click('.nav-btn[data-go="rank"]');
  for (const p of ['day', 'week', 'profit']) { $('#rankSeg [data-rank="' + p + '"]').click(); await wait(20); }
  if (!$('#rankList .rank-row.me')) throw new Error('ligne du joueur absente du classement');
});

step('feuilles : menu, portefeuille, historique, réglages, aide', async () => {
  click('#btnMenu');
  await wait(60);
  for (const m of ['daily', 'wheel', 'fair', 'history', 'responsible', 'settings', 'about']) {
    click('#btnMenu'); await wait(40);
    click('[data-menu="' + m + '"]'); await wait(200);
    J.UI.closeModal(); J.UI.closeSheet(); await wait(40);
  }
  click('#balancePill'); await wait(120);
  J.UI.closeSheet();
});

step('réglages : bascule de chaque option', async () => {
  J.UI.openSettings(); await wait(120);
  for (const k of ['sound', 'vibration', 'motion', 'liveFeed', 'autoPause']) {
    const inp = doc.querySelector('[data-set="' + k + '"]');
    inp.checked = !inp.checked;
    inp.dispatchEvent(new win.Event('change'));
    await wait(20);
    inp.checked = !inp.checked;
    inp.dispatchEvent(new win.Event('change'));
  }
  const pseudo = doc.getElementById('setPseudo');
  pseudo.value = 'Testeur';
  pseudo.dispatchEvent(new win.Event('change'));
  if (J.Store.state.pseudo !== 'Testeur') throw new Error('pseudo non enregistré');
  J.UI.closeSheet();
  if (!J.Store.state.settings.motion) throw new Error('option mouvement non rétablie');
});

step('bonus quotidien, roue de la chance', async () => {
  const before = J.Store.state.balance;
  J.Rewards.openDaily(); await wait(80);
  click('#modalBox [data-actions] .btn.gold'); await wait(120);
  if (J.Store.state.balance <= before) throw new Error('bonus quotidien non crédité');

  J.Rewards.openWheel(); await wait(120);
  if (!doc.getElementById('wheelCv')) throw new Error('canvas de la roue absent');
  click('#modalBox [data-actions] .btn.gold');
  await wait(5000);                       // durée de la rotation
  const seg = J.Store.state.daily.wheelSpins;
  if (!seg) throw new Error('la roue n\'a pas enregistré le tour');
  J.UI.closeModal();
});

step('recharge gratuite (solde à zéro, délai puis crédit)', async () => {
  J.Store.patch({ balance: 0, freeChips: { day: J.util.dayKey(), used: 0, readyAt: 0 } });
  J.Rewards.openRecharge(); await wait(120);
  click('#modalBox [data-actions] .btn.ghost'); await wait(150);      // « Lancer le délai »
  if (J.Store.state.freeChips.readyAt <= Date.now()) throw new Error('le délai de recharge n\'a pas démarré');
  if (J.Store.state.balance !== 0) throw new Error('jetons crédités avant la fin du délai');
  // Le délai s'écoule : la modale se rafraîchit et le bouton devient actif
  J.Store.patch({ freeChips: { day: J.util.dayKey(), used: 0, readyAt: Date.now() - 500 } });
  J.Rewards.openRecharge(); await wait(150);
  click('#modalBox [data-actions] .btn.primary'); await wait(200);
  if (J.Store.state.balance !== 2500) throw new Error('recharge non créditée (' + J.Store.state.balance + ')');
  J.UI.closeModal();
  J.Store.patch({ balance: 20000, freeChips: { day: J.util.dayKey(), used: 0, readyAt: 0 } });
});

step('Fair Play : rotation de graine et vérificateur', async () => {
  J.UI.openFair(); await wait(120);
  doc.getElementById('clientSeed').value = 'seed-de-test';
  click('#setSeed'); await wait(120);
  if (J.Fair.clientSeed !== 'seed-de-test') throw new Error('clientSeed non appliqué');
  J.UI.openFair(); await wait(120);
  doc.getElementById('vSeed').value = J.Fair.serverSeed;
  doc.getElementById('vClient').value = 'seed-de-test';
  doc.getElementById('vNonce').value = '1';
  click('#verify'); await wait(60);
  if (!/HMAC-SHA256/.test(doc.getElementById('vOut').innerHTML)) throw new Error('vérificateur muet');
  const prev = J.Store.state.fair.serverSeed;
  click('#rotate'); await wait(400);
  if (J.Store.state.fair.prevSeed !== prev) throw new Error('rotation de graine incorrecte');
  J.UI.closeSheet();
});

step('les 10 jeux : ouverture, commandes, une partie', async () => {
  for (const id of ['crash', 'dice', 'mines', 'plinko', 'limbo', 'coinflip', 'hilo', 'keno', 'tower', 'wheel']) {
    J.Store.patch({ balance: 50000 });
    J.Games.open(id);
    await wait(150);
    const g = J.Games.instance();
    if (!g || g.def.id !== id) throw new Error(id + ' non monté');

    // Toutes les mises rapides
    click('[data-bet="min2"]'); click('[data-bet="half"]'); click('[data-bet="double"]');
    click('[data-bet="max"]'); click('[data-bet="plus"]'); click('[data-bet="minus"]');
    if (g.bet < 10) throw new Error(id + ' : mise invalide ' + g.bet);
    J.Games.setBet(g, 100, true);

    // Mise personnalisée : ouverture puis annulation
    click('[data-bet="custom"]'); await wait(80);
    if (!doc.getElementById('cbVal')) throw new Error(id + ' : modale de mise perso absente');
    const val = doc.getElementById('cbVal'); val.value = '250';
    click('#modalBox [data-actions] .btn.primary'); await wait(60);
    if (g.bet !== 250) throw new Error(id + ' : mise personnalisée non appliquée (' + g.bet + ')');

    // Commandes propres au jeu
    if (id === 'dice') { click('[data-mode="over"]'); click('[data-mode="under"]'); }
    if (id === 'mines') { click('[data-mines="5"]'); click('[data-mines="3"]'); click('[data-mines="1"]'); }
    if (id === 'plinko') { click('[data-risk="high"]'); click('[data-risk="low"]'); }
    if (id === 'limbo') { click('#lbChips .chip', true); }                      // toutes les cibles prédéfinies
    if (id === 'coinflip') { click('#cfSide [data-side="head"]'); click('#cfSide [data-side="tail"]'); }
    if (id === 'keno') {
      click('#knRisk [data-risk="high"]'); click('#knRisk [data-risk="classic"]');
      click('#knRandom'); click('#knClear');
      // Sélection manuelle de 3 numéros puis vérification de la grille
      ['3', '17', '40'].forEach((n) => click('#knGrid [data-num="' + n + '"]'));
      if (doc.querySelectorAll('#knGrid .keno-cell.sel').length !== 3) throw new Error('keno : sélection manuelle KO');
      if (!doc.querySelectorAll('#knPay div').length) throw new Error('keno : table de gains absente');
    }
    if (id === 'tower') { click('#twLevels .chip', true); }                    // les 5 difficultés
    if (id === 'wheel') { click('#wgTargets .chip', true); }                   // les 8 cibles
    click('.seg button', true);                                                // tous les segments restants
    await wait(40);

    // Auto-bet : panneau, démarrage, arrêt manuel
    click('#gAdvanced'); await wait(80);
    if (!doc.getElementById('autoCount')) throw new Error(id + ' : panneau auto-bet absent');
    doc.getElementById('autoCount').value = '50';
    doc.getElementById('autoSpeed').value = '60';
    click('#autoStart'); await wait(320);
    if (!g.auto.on) throw new Error(id + ' : auto-bet non démarré');
    click('#autoStop'); await wait(120);
    if (g.auto.on) throw new Error(id + ' : auto-bet non arrêté');
    // La partie en vol est terminée proprement (encaissement si le jeu le permet)
    let opened = $('[data-act="cashout"]');
    if (opened && !opened.disabled) opened.click();
    if (!await waitIdle(g)) throw new Error(id + ' : la partie en vol ne se termine pas');
    if (!J.Rewards.rechargeState().started) J.Store.patch({ balance: 50000 });

    // Une partie manuelle
    const before = J.Store.state.stats.bets;
    const playBtn = $('[data-act="play"]');
    if (!playBtn || playBtn.disabled) throw new Error(id + ' : bouton de jeu indisponible');
    playBtn.click();
    await wait(80);
    if (id === 'mines') {
      const tiles = doc.querySelectorAll('#mnGrid [data-tile]');
      const safe = Array.from(tiles).find((t) => !g.mines.includes(parseInt(t.dataset.tile, 10)));
      safe.click();
      const cash = $('[data-act="cashout"]');
      if (cash && !cash.disabled) cash.click();
      await wait(200);
    } else if (id === 'crash') {
      await wait(900);
      const cash = $('[data-act="cashout"]');
      if (cash && !cash.disabled) cash.click();
      await wait(300);
    } else if (id === 'tower') {
      // Franchit jusqu'à 3 étages puis encaisse (ou tombe sur un piège)
      for (let f = 0; f < 3 && g.active; f++) {
        const t = doc.querySelector('#twFloors .tower-floor.current [data-tile]');
        if (!t) break;
        t.click();
        await wait(160);
      }
      const cash = $('[data-act="cashout"]');
      if (cash && !cash.disabled) cash.click();
      await wait(250);
    } else if (id === 'wheel') {
      for (let i = 0; i < 70 && J.Store.state.stats.bets <= before; i++) await wait(140);
      if (J.Store.state.stats.bets <= before) throw new Error('wheel : le lancer ne se termine pas');
    } else if (id === 'keno') {
      for (let i = 0; i < 40 && g.busy; i++) await wait(140);
    } else if (id === 'hilo') {
      const hi = doc.getElementById('hlHigh'), lo = doc.getElementById('hlLow');
      const btn = hi.disabled ? lo : hi;
      if (btn) btn.click();
      await wait(220);
      const cash = $('[data-act="cashout"]');
      if (cash && !cash.disabled) cash.click();
      await wait(250);
    } else {
      await wait(id === 'plinko' ? 2600 : 900);
    }
    if (J.Store.state.stats.bets <= before) throw new Error(id + ' : la partie n\'a pas été enregistrée');
    if (J.Store.state.balance < 0) throw new Error(id + ' : solde négatif');

    click('[data-g="info"]'); await wait(80); J.UI.closeSheet();
    click('[data-g="back"]'); await wait(120);
    if (J.Games.instance()) throw new Error(id + ' : jeu non libéré au retour');
  }
});

step('les 6 classiques restants s\'annoncent sans se lancer', async () => {
  const mounted = J.Games.instance();
  if (mounted) J.Games.close(true);                  // aucun jeu ne doit rester monté
  for (const id of ['roulette', 'blackjack', 'baccarat', 'slots', 'videopoker', 'poker']) {
    J.Games.open(id);
    const cur = J.Games.instance();
    if (cur && cur.def.id === id) throw new Error(id + ' ne devrait pas être jouable (vague 3)');
    if (!$('#modalRoot.is-on')) throw new Error(id + ' : aucune modale d\'information');
    J.UI.closeModal();
  }
});

step('boutique : packs, limite, achat simulé', async () => {
  J.Store.patch({ balance: 10000, spend: { month: J.util.monthKey(), total: 0, limit: null }, shop: { firstPurchaseUsed: false, purchased: {} } });
  J.Screen.renderShop();
  J.UI.go('shop'); await wait(60);
  const buy = $$('#shopBody [data-buy]');
  if (buy.length !== 5) throw new Error('packs manquants : ' + buy.length);
  // Ouvre la confirmation puis annule
  buy[0].click(); await wait(80);
  click('#modalBox [data-actions] .btn.ghost'); await wait(60);
  if (J.Store.state.shop.purchased.starter) throw new Error('achat effectué alors qu\'il a été annulé');
  // Achète réellement (paiement simulé) — le pack « premier achat » doit basculer
  J.Screen.renderShop();
  $$('#shopBody [data-buy]')[1].click(); await wait(80);
  click('#modalBox [data-actions] .btn.gold'); await wait(1400);
  if (J.Store.state.shop.purchased.firstbuy !== 1) throw new Error('achat simulé non livré');
  if (!J.Store.state.shop.firstPurchaseUsed) throw new Error('offre premier achat non consommée');
  // Limite de dépenses
  J.Shop.openLimit(); await wait(80);
  const inp = doc.getElementById('limitInput'); inp.value = '5';
  click('#modalBox [data-actions] .btn.primary'); await wait(80);
  if (J.Store.state.spend.limit !== 5) throw new Error('limite non enregistrée');
});

step('modales de sécurité : pause, jeu responsable, mentions', async () => {
  J.UI.openResponsible(); await wait(80);
  click('#pauseGame'); await wait(150);
  if (J.UI.current() !== 'home') throw new Error('retour à l\'accueil raté');
  J.UI.openAbout(); await wait(80);
  if (!/18 ans/.test($('#sheetRoot').textContent)) throw new Error('mention 18+ absente');
  J.UI.closeSheet();
  J.UI.openHistory(); await wait(80);
  if (!doc.querySelectorAll('#sheetRoot table.data tr').length) throw new Error('historique vide alors que des parties existent');
  J.UI.closeSheet();
});

step('catalogue : 10 jeux jouables, 6 en feuille de route', async () => {
  const live = J.GAMES.filter((g) => g.status === 'live').map((g) => g.id);
  const soon = J.GAMES.filter((g) => g.status !== 'live').map((g) => g.id);
  if (live.length !== 10) throw new Error('jeux jouables : ' + live.join(', '));
  if (soon.length !== 6) throw new Error('feuille de route : ' + soon.join(', '));
  const expectLive = ['crash', 'dice', 'mines', 'plinko', 'limbo', 'coinflip', 'hilo', 'keno', 'tower', 'wheel'];
  if (!expectLive.every((id) => live.includes(id))) throw new Error('jeu manquant : ' + expectLive.filter((i) => !live.includes(i)));
});

step('état final cohérent et persisté', async () => {
  J.Store.flush();
  const st = J.Store.state;
  if (st.balance < 0 || !isFinite(st.balance)) throw new Error('solde invalide');
  if (!win.localStorage.getItem(J.SAVE_KEY)) throw new Error('rien dans le stockage local');
  if (st.stats.bets < 8) throw new Error('parties trop peu nombreuses : ' + st.stats.bets);
  if (Object.keys(st.stats.perGame).length < 8) throw new Error('jeux couverts : ' + Object.keys(st.stats.perGame).join(', '));
  if (!Object.keys(st.stats.perGame).every((id) => st.stats.perGame[id].bets > 0)) throw new Error('stats par jeu incohérentes');
  const parsed = JSON.parse(win.localStorage.getItem(J.SAVE_KEY));
  if (parsed.history.length > 250) throw new Error('historique non borné');
  if (Object.keys(parsed.stats.perGame).length < 4) throw new Error('stats par jeu incomplètes');
});

/* ------------------------------------------------------------- EXÉCUTION */
let failed = 0;
for (const [name, fn] of steps) {
  try { await fn(); console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '  → ' + e.message); }
}
await wait(300);

console.log('\n' + '─'.repeat(64));
if (problems.length) {
  console.log('⚠️  ' + problems.length + ' problème(s) runtime :');
  [...new Set(problems)].slice(0, 20).forEach((p) => console.log('   · ' + p));
  failed += problems.length;
} else {
  console.log('✅ Aucun message d\'erreur, aucune exception non gérée.');
}
console.log((failed === 0 ? '✅ ' : '❌ ') + steps.length + ' étapes de parcours, ' + failed + ' problème(s)');
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
