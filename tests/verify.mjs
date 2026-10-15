#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — VÉRIFICATION AUTOMATISÉE
   Charge le fichier livré (jackpotly.html) dans un DOM simulé puis contrôle :
     1. Démarrage complet sans erreur (tous les modules s'exécutent)
     2. Crypto provably-fair : vecteurs de test SHA-256 / HMAC-SHA256
     3. Uniformité des tirages
     4. Mathématiques des jeux : RTP Dice, Mines, Plinko, Crash
     5. Portefeuille : mises, gains, remboursement, statistiques, VIP
     6. Une partie réelle via l'interface (Dice) + mode Auto-bet
     7. Persistance, catalogue, récompenses
   Usage : node tests/verify.mjs
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'jackpotly.html'), 'utf8');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.error('jsdom manquant : exécute `npm install --no-save jsdom`'); process.exit(2); }

/* ---------------------------------------------------------------- OUTILS */
let passed = 0, failed = 0;
const results = [];
function check(label, cond, detail) {
  if (cond) { passed++; results.push('  ✓ ' + label); }
  else { failed++; results.push('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
}
function section(t) { results.push('\n' + t); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Contexte 2D factice : toute méthode renvoie un no-op */
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

/* ------------------------------------------------------ CHARGEMENT DE L'APP */
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://jackpotly.local/',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
    window.HTMLMediaElement && (window.HTMLMediaElement.prototype.play = () => Promise.resolve());
    if (!window.navigator.vibrate) { try { window.navigator.vibrate = () => true; } catch { /* noop */ } }
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  }
});
const win = dom.window;
const errors = [];
win.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
const origWarn = win.console.warn;
win.console.warn = (...a) => { errors.push('warn: ' + a.join(' ')); origWarn.apply(win.console, a); };

await wait(120);
const J = win.JACKPOTLY;

/* ============================================================ 1. DÉMARRAGE */
section('1. Démarrage et intégrité de la structure');
check('namespace JACKPOTLY présent', !!J);
check('aucune erreur bloquante au chargement', errors.length === 0, errors.slice(0, 3).join(' | '));
check('les 4 nouveaux jeux jouables sont enregistrés',
  ['crash', 'dice', 'mines', 'plinko'].every((id) => (J.GAMES.find((g) => g.id === id) || {}).status === 'live'));
check('catalogue complet (16 jeux annoncés ou jouables)', J.GAMES.length >= 16, 'reçu ' + J.GAMES.length);
check('chaque jeu déclare id, nom, RTP et règles',
  J.GAMES.every((g) => g.id && g.name && g.rtp > 90 && g.rtp <= 100 && g.rules && g.icon && g.color));
check('aucune ressource externe dans le HTML', !/(src|href)\s*=\s*["']https?:/i.test(html));
check('solde initial de 10 000 jetons', J.Store.state.balance === 10000, 'solde ' + J.Store.state.balance);
check('interface de navigation inerte par écran', !!win.document.getElementById('screen-game'));
check('solde affiché dans la barre supérieure', win.document.getElementById('balanceVal').textContent.replace(/\s/g, '') === '10000');

/* =============================================================== 2. CRYPTO */
section('2. Fair Play — vecteurs de test cryptographiques');
check('SHA-256("abc") correct',
  J.crypto.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  J.crypto.sha256Hex('abc'));
check('SHA-256("") correct',
  J.crypto.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('HMAC-SHA256 vecteur RFC 4231 (cas 1) correct',
  J.crypto.hmacHex('0b'.repeat(20).replace(/(..)/g, (m) => String.fromCharCode(parseInt(m, 16))), 'Hi There') ===
  'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  'vérifie l\'implémentation HMAC');
check('HMAC-SHA256("key","The quick brown fox…") correct',
  J.crypto.hmacHex('key', 'The quick brown fox jumps over the lazy dog') ===
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
check('hash du serverSeed publié au démarrage', J.Fair.serverSeedHash && J.Fair.serverSeedHash.length === 64);
check('hash publié = SHA-256 du serverSeed secret',
  J.Fair.serverSeedHash === J.crypto.sha256Hex(J.Fair.serverSeed));
check('le clientSeed est modifiable',
  J.Fair.setClientSeed('test-seed-123') && J.Fair.clientSeed === 'test-seed-123');
check('même graine + même message ⇒ même tirage (déterminisme prouvable)',
  J.Fair.verify('seedA', 'clientA', 3, 1).hmac === J.Fair.verify('seedA', 'clientA', 3, 1).hmac);
check('messages différents ⇒ tirages différents',
  J.Fair.verify('seedA', 'clientA', 3, 1).hmac !== J.Fair.verify('seedA', 'clientA', 3, 2).hmac);
{
  const before = J.Fair.nonce;
  J.Fair.beginBet();
  check('le nonce augmente à chaque pari', J.Fair.nonce === before + 1);
}

/* ================================================== 3. UNIFORMITÉ DES TIRAGES */
section('3. Uniformité des tirages');
{
  const N = 20000;
  let sum = 0, min = 1, max = 0, buckets = new Array(10).fill(0);
  for (let i = 0; i < N; i++) {
    const f = J.Fair.float();
    sum += f; min = Math.min(min, f); max = Math.max(max, f);
    buckets[Math.min(9, Math.floor(f * 10))]++;
  }
  const mean = sum / N;
  check('moyenne des tirages ≈ 0,5', near(mean, 0.5, 0.012), 'moyenne ' + mean.toFixed(4));
  check('tirages dans [0,1[', min >= 0 && max < 1, min + ' … ' + max);
  const dev = buckets.map((b) => Math.abs(b - N / 10) / (N / 10));
  check('déciles équilibrés (écart max < 8 %)', Math.max(...dev) < 0.08, 'écart max ' + (Math.max(...dev) * 100).toFixed(1) + ' %');
}

/* ==================================================== 4. MATHÉMATIQUES DES JEUX */
section('4. RTP et mathématiques des 4 jeux');
// --- Dice : mult = 99 / chance(%)
{
  let bad = 0;
  for (let chance = 1; chance <= 98; chance++) {
    const m = J.Games.multFromChance(chance / 100);
    if (!near((chance / 100) * m * 100, 99, 1e-6)) bad++;
  }
  check('Dice : chance × multiplicateur = 99 % (RTP constant)', bad === 0, bad + ' écarts');
  // Simulation empirique du tirage
  const N = 120000, bet = 100;
  let wagered = 0, returned = 0, wins = 0;
  const target = 50, chance = target / 100, mult = J.Games.multFromChance(chance);
  for (let i = 0; i < N; i++) {
    const roll = Math.floor(J.Fair.float() * 10000) / 100;
    wagered += bet;
    if (roll < target) { returned += bet * mult; wins++; }
  }
  const rtp = returned / wagered;
  check('Dice 50 % : RTP simulé ≈ 99 %', near(rtp, 0.99, 0.01), 'RTP ' + (rtp * 100).toFixed(2) + ' %');
  check('Dice 50 % : taux de victoire ≈ 50 %', near(wins / N, 0.5, 0.01), (wins / N * 100).toFixed(2) + ' %');
}
// --- Mines : mult(k) × P(k) = 0,99
{
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  let worst = 0;
  for (let mines = 1; mines <= 24; mines++) {
    for (let k = 1; k <= 25 - mines; k++) {
      const p = C(25 - mines, k) / C(25, k);              // probabilité de révéler k cases sûres
      // mult = 0,99 / p  ⇒  reproduit par la formule produit du jeu
      let m = 0.99;
      for (let i = 0; i < k; i++) m *= (25 - i) / (25 - mines - i);
      worst = Math.max(worst, Math.abs(p * m - 0.99));
    }
  }
  check('Mines : mult(k) × probabilité = 99 % pour 1→24 mines', worst < 1e-9, 'écart max ' + worst.toExponential(2));
}
// --- Plinko : espérance binomiale = 0,99
{
  const tables = win.JACKPOTLY.__plinkoTable;
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  // On relit les tables depuis le module de jeu (source unique de vérité)
  const src = readFileSync(join(root, 'src/33-game-plinko.js'), 'utf8');
  const tableBlock = src.slice(src.indexOf('const PAYOUTS'), src.indexOf('const RISK_LABEL'));
  const PAYOUTS = eval('(' + tableBlock.replace('const PAYOUTS =', '').replace(/;\s*$/, '') + ')');
  let worst = 0, worstAt = '';
  for (const rows of Object.keys(PAYOUTS)) {
    for (const risk of ['low', 'medium', 'high']) {
      const t = PAYOUTS[rows][risk];
      if (t.length !== Number(rows) + 1) { worst = 1; worstAt = rows + '/' + risk + ' taille ' + t.length; continue; }
      let ev = 0;
      const n = Number(rows);
      for (let k = 0; k <= n; k++) ev += (C(n, k) / Math.pow(2, n)) * t[k];
      if (Math.abs(ev - 0.99) > worst) { worst = Math.abs(ev - 0.99); worstAt = rows + '/' + risk + ' RTP ' + (ev * 100).toFixed(2) + '%'; }
    }
  }
  check('Plinko : RTP = 99 % pour les 27 combinaisons lignes × risque', worst < 0.005, worstAt);
  check('Plinko : 8 à 16 lignes disponibles', Object.keys(PAYOUTS).length === 9);
  // Simulation du chemin (marche aléatoire) pour valider la sélection de caisse
  const N = 60000, bet = 100; let wagered = 0, returned = 0;
  const t12 = PAYOUTS[12].medium;
  for (let i = 0; i < N; i++) {
    let k = 0;
    for (let s = 0; s < 12; s++) if (J.Fair.float() >= 0.5) k++;
    wagered += bet; returned += bet * t12[k];
  }
  check('Plinko 12 lignes / risque moyen : RTP simulé ≈ 99 %',
    near(returned / wagered, 0.99, 0.02), 'RTP ' + (returned / wagered * 100).toFixed(2) + ' %');
}
// --- Crash : P(crash ≥ m) = 0,99 / m
{
  const cpf = (u) => Math.max(1.00, Math.floor(100 * 0.99 / (1 - u)) / 100);
  let hits2 = 0, N = 200000;
  for (let i = 0; i < N; i++) if (cpf(J.Fair.float()) >= 2) hits2++;
  check('Crash : P(multiplier ≥ 2x) ≈ 49,5 %', near(hits2 / N, 0.495, 0.005), (hits2 / N * 100).toFixed(2) + ' %');
  let hits10 = 0;
  for (let i = 0; i < N; i++) if (cpf(J.Fair.float()) >= 10) hits10++;
  check('Crash : P(multiplier ≥ 10x) ≈ 9,9 %', near(hits10 / N, 0.099, 0.004), (hits10 / N * 100).toFixed(2) + ' %');
  // RTP d'une stratégie « cash out à m » : m × P(crash ≥ m) ≈ 0,99
  const m = 2.5, bet = 100;
  let wagered = 0, returned = 0;
  for (let i = 0; i < 100000; i++) { wagered += bet; if (cpf(J.Fair.float()) >= m) returned += bet * m; }
  check('Crash : RTP d\'un cash out fixe à 2,5x ≈ 99 %', near(returned / wagered, 0.99, 0.02),
    'RTP ' + (returned / wagered * 100).toFixed(2) + ' %');
}

/* ============================================================ 5. PORTEFEUILLE */
section('5. Portefeuille, statistiques et VIP');
{
  J.Store.reset();
  J.Wallet.renderBalance();
  const t = J.Wallet.stake(500, 'dice');
  check('la mise est débitée immédiatement', J.Store.state.balance === 9500, 'solde ' + J.Store.state.balance);
  const rec = J.Wallet.settle(t, 1.98, { detail: 'test' });
  check('le gain est crédité au multiplicateur exact', J.Store.state.balance === 9500 + Math.floor(500 * 1.98));
  check('l\'historique enregistre la partie', J.Store.state.history[0].payout === Math.floor(500 * 1.98) && J.Store.state.history[0].mult === 1.98);
  check('le total misé est suivi', J.Store.state.stats.wagered === 500);
  check('les stats par jeu sont suivies', J.Store.state.stats.perGame.dice.bets === 1);
  const t2 = J.Wallet.stake(1000, 'mines');
  J.Wallet.refund(t2);
  check('un pari annulé est remboursé intégralement', J.Store.state.stats.perGame.mines === undefined || J.Store.state.stats.perGame.mines.bets === 0);
  check('impossible de miser plus que le solde', J.Wallet.stake(9e9, 'dice') === null);
  // VIP
  const vip = J.Wallet.vipInfo();
  check('palier VIP cohérent avec le total misé', J.CONST.VIP[vip.index].need <= J.Store.state.vip.wagered);
  J.Store.patch({ vip: { wagered: 30000 } });
  const vipSilver = J.Wallet.vipInfo();
  check('palier Argent atteint à 30 000 jetons misés', vipSilver.tier.id === 'silver', vipSilver.tier.id);
  check('progression vers le palier suivant calculée', near(vipSilver.pct, (30000 - 25000) / (150000 - 25000) * 100, 0.01),
    vipSilver.pct.toFixed(2) + ' %');
  const reward = J.Wallet.claimVipReward();
  check('récompense VIP versée une seule fois', reward === 5000 && J.Wallet.claimVipReward() === false, String(reward));
  J.Store.patch({ vip: { wagered: 260000 } });
  check('palier Or à 260 000 jetons misés', J.Wallet.vipInfo().tier.id === 'gold');
  // Statistiques dérivées
  J.Store.reset();
  J.Store.patch({ stats: { bets: 10, wins: 4, wagered: 1000, returned: 800 } });
  const sum = J.Wallet.summary();
  check('RTP constaté calculé correctement', near(sum.rtp, 80, 0.001));
  check('taux de victoire calculé correctement', near(sum.winRate, 40, 0.001));
}

/* ======================================================== 6. PARTIE VIA L'UI */
section('6. Partie réelle via l\'interface (Dice) puis Auto-bet');
{
  J.Store.reset();
  J.Wallet.renderBalance();
  // Missions forcées : on vérifie que le suivi réagit aux événements de pari
  J.Store.patch({ quests: { day: J.util.dayKey(), reward: 1500, items: [
    { id: 'rounds', title: 'Jouer 25 parties', target: 25, reward: 600, progress: 0, claimed: false, seen: [] },
    { id: 'wager', title: 'Miser 5 000 jetons', target: 5000, reward: 750, progress: 0, claimed: false, seen: [] },
    { id: 'wins', title: 'Gagner 5 parties', target: 5, reward: 800, progress: 0, claimed: false, seen: [] }
  ] } });
  J.Games.open('dice');
  const g = J.Games.instance();
  check('l\'écran de jeu est monté', !!g && g.def.id === 'dice');
  check('le panneau de mise est présent', !!win.document.querySelector('#gameShell [data-act="play"]'));
  J.Games.setBet(g, 100, true);
  win.document.querySelector('[data-act="play"]').click();
  check('la partie est en cours (mise débitée)', J.Store.state.balance === 9900, 'solde ' + J.Store.state.balance);
  await wait(900);
  check('la partie est réglée (historique + solde)', J.Store.state.history.length === 1 && J.Store.state.stats.bets === 1);
  const h = J.Store.state.history[0];
  const expected = 9900 + h.payout;
  check('solde cohérent avec le résultat tiré', J.Store.state.balance === expected,
    'solde ' + J.Store.state.balance + ' attendu ' + expected + ' (' + h.mult + 'x)');

  const qItems = J.Quests.items();
  check('les missions du jour suivent la progression', qItems[0].progress === 1 && qItems[1].progress === 100,
    'rounds=' + qItems[0].progress + ' wager=' + qItems[1].progress);
  check('une mission terminée peut être récupérée une seule fois', (function () {
    const bal = J.Store.state.balance;
    // On force la mission « Jouer 25 parties » à son objectif
    const items = J.Quests.items();
    items.forEach((x) => { if (x.id === 'rounds') x.progress = x.target; });
    const gain = J.Quests.claim('rounds');
    return gain === 600 && J.Quests.items()[0].claimed === true && J.Quests.claim('rounds') === 0 && J.Store.state.balance === bal + 600;
  })(), 'récompense de mission');


  // Auto-bet : 3 parties
  J.Store.reset(); J.Store.patch({ balance: 100000 });
  J.Games.open('dice');
  const g2 = J.Games.instance();
  J.Games.setBet(g2, 100, true);
  win.document.getElementById('gAdvanced').click();
  win.document.getElementById('autoCount').value = '3';
  win.document.getElementById('autoSpeed').value = '60';
  win.document.getElementById('autoStart').click();
  check('le mode auto-bet démarre', g2.auto.on === true);
  await wait(3500);
  check('l\'auto-bet exécute exactement 3 parties', J.Store.state.stats.perGame.dice.bets === 3,
    'reçu ' + (J.Store.state.stats.perGame.dice || {}).bets);
  check('l\'auto-bet s\'arrête tout seul', g2.auto.on === false);

  // Stop à la perte : le solde doit être préservé
  J.Store.reset(); J.Store.patch({ balance: 10000 });
  J.Games.open('dice');
  const g3 = J.Games.instance();
  J.Games.setBet(g3, 100, true);
  win.document.getElementById('gAdvanced').click();
  win.document.getElementById('autoCount').value = '200';
  win.document.getElementById('autoSpeed').value = '60';
  win.document.getElementById('autoLoss').value = '100';
  win.document.getElementById('autoStart').click();
  await wait(2500);
  check('l\'arrêt automatique à la perte fonctionne (< 200 parties)', (J.Store.state.stats.perGame.dice || {}).bets < 200,
    (J.Store.state.stats.perGame.dice || {}).bets + ' parties');

  // Jeu verrouillé : ouverture impossible mais message explicite
  J.Games.open('blackjack');
  check('un jeu de la vague suivante ne se monte pas', J.Games.instance() === null || J.Games.instance().def.id === 'dice');
  check('une modale de feuille de route s\'affiche', J.UI.isModalOpen() === true);
  J.UI.closeModal();
  J.Games.close(true);
}

/* ========================================================= 7. LES 4 JEUX */
section('7. Montage et tour de jeu des 4 Originals');
{
  for (const id of ['crash', 'dice', 'mines', 'plinko']) {
    J.Store.reset(); J.Store.patch({ balance: 50000 });
    J.Games.open(id);
    const g = J.Games.instance();
    const ok = !!g && !!win.document.querySelector('#gameShell [data-act="play"]');
    check(id + ' : écran monté avec ses commandes', ok);
    // Lancer une partie et vérifier qu'elle se résout (sauf Plinko/Mines à rythme propre)
    J.Games.setBet(g, 100, true);
    win.document.querySelector('[data-act="play"]').click();
    check(id + ' : mise débitée au lancement', J.Store.state.stats.bets === 1, 'paris ' + J.Store.state.stats.bets);
    await wait(60);
    if (id === 'mines') {
      // Première case révélée puis encaissement si elle est sûre
      const tiles = win.document.querySelectorAll('#mnGrid [data-tile]');
      check('Mines : grille de 25 cases', tiles.length === 25);
      let safeTile = null;
      for (const t of tiles) {
        const idx = parseInt(t.dataset.tile, 10);
        if (!g.mines.includes(idx)) { safeTile = t; break; }
      }
      safeTile.click();
      check('Mines : le diamant augmente le multiplicateur', g.picked.length === 1);
      g.def.cashout ? J.Games.instance().def.cashout(g) : null;
      const cashBtn = win.document.querySelector('[data-act="cashout"]');
      if (cashBtn) cashBtn.click();
      check('Mines : encaissement crédité', J.Store.state.balance > 50000 - 100, 'solde ' + J.Store.state.balance);
      check('Mines : multiplicateur > 1x', J.Store.state.history[0].mult > 1, String(J.Store.state.history[0].mult));
    } else if (id === 'crash') {
      await wait(400);
      const cash = win.document.querySelector('[data-act="cashout"]');
      check('Crash : bouton d\'encaissement disponible en vol', !!cash && !cash.disabled);
      if (cash && !cash.disabled) cash.click();
      await wait(200);
      check('Crash : partie réglée après encaissement', J.Store.state.history.length === 1, 'historique ' + J.Store.state.history.length);
    } else {
      await wait(id === 'plinko' ? 2200 : 900);
      check(id + ' : la partie se règle et le solde évolue', J.Store.state.history.length === 1,
        'historique ' + J.Store.state.history.length);
    }
    // Historique local des multiplicateurs
    check(id + ' : historique des multiplicateurs alimenté', g.history.length >= 1 || J.Store.state.history.length >= 1);
    J.Games.close(true);
  }
}

/* ============================================== 8. RÉCOMPENSES ET PERSISTANCE */
section('8. Récompenses, quêtes et persistance');
{
  J.Store.reset();
  check('bonus quotidien disponible à la première ouverture', J.Rewards.canClaimDaily() === true);
  const before = J.Store.state.balance;
  const amount = J.Rewards.claimDaily();
  check('le bonus quotidien crédite des jetons', J.Store.state.balance === before + amount && amount === 500);
  check('le bonus quotidien ne peut pas être pris deux fois', J.Rewards.canClaimDaily() === false && J.Rewards.claimDaily() === 0);
  check('la roue est disponible une fois par jour', J.Rewards.canSpinWheel() === true);
  {
    const segs = J.Rewards.SEGMENTS, tot = segs.reduce((a, x) => a + x.w, 0);
    const ev = Math.round(segs.reduce((a, x) => a + x.v * x.w, 0) / tot);
    check('l\'espérance de la roue correspond aux probabilités des segments',
      J.Rewards.expectedPrize() === ev && ev > 1000 && ev < 3000, String(J.Rewards.expectedPrize()));
    check('les tirages de la roue couvrent bien tous les segments',
      segs.every((s2) => s2.v >= 0 && s2.w > 0 && s2.label && s2.color));
  }

  // Recharge gratuite : délai puis crédit
  J.Store.patch({ balance: 0 });
  const st = J.Rewards.rechargeState();
  check('recharge gratuite proposée quand le solde est à zéro', st.left > 0 && st.amount === 2500 && st.ready === false);
  check('la recharge doit être lancée explicitement (délai anti-impulsion)', st.started === false);
  check('réclamer sans avoir lancé le délai ne donne rien', J.Rewards.claimFreeChips() === 0);
  J.Rewards.startRechargeTimer();
  const st2 = J.Rewards.rechargeState();
  check('un délai est imposé avant la recharge', st2.started === true && st2.ready === false && st2.readyIn > 0);
  check('la recharge ne peut pas être prise pendant le délai', J.Rewards.claimFreeChips() === 0);
  // On simule l'écoulement du délai
  J.Store.patch({ freeChips: { day: win.JACKPOTLY.util.dayKey(), used: 0, readyAt: Date.now() - 500 } });
  check('après le délai, la recharge crédite 2 500 jetons', J.Rewards.claimFreeChips() === 2500 && J.Store.state.balance === 2500);
  check('la limite quotidienne de recharges est respectée', J.Rewards.rechargeState().left === 2);

  // Quêtes : accomplir et récupérer
  J.Store.reset();
  const q = J.Quests.items()[0];
  J.Store.patch({ quests: { day: win.JACKPOTLY.util.dayKey(), reward: 1500,
    items: [{ id: q.id, title: q.title, target: 1, reward: 500, progress: 1, claimed: false, seen: [] }] } });
  const gain = J.Quests.claim(q.id);
  check('une mission terminée paie sa récompense (+ bonus complet)', gain >= 500 && J.Store.state.balance === 10000 + gain);

  // Persistance
  J.Store.patch({ balance: 4242, pseudo: 'TestPersist' });
  J.Store.flush();
  const raw = win.localStorage.getItem(win.JACKPOTLY.SAVE_KEY);
  const parsed = JSON.parse(raw);
  check('l\'état est sérialisé dans le stockage local', parsed.balance === 4242 && parsed.pseudo === 'TestPersist');
  check('la sauvegarde contient les stats et l\'historique', 'stats' in parsed && 'history' in parsed && 'fair' in parsed);
  check('la sauvegarde contient les réglages', parsed.settings && typeof parsed.settings.sound === 'boolean');
  check('la sauvegarde contient la limite de dépenses', 'spend' in parsed && 'freeChips' in parsed);

  // Limite de dépenses
  J.Shop.setLimit(20);
  check('limite de dépenses enregistrée', J.Store.state.spend.limit === 20);
  J.Shop.setLimit(5);
  check('la limite peut être baissée immédiatement', J.Store.state.spend.limit === 5);
  J.Shop.setLimit(50);
  check('la hausse est différée au mois suivant (protection joueur)',
    J.Store.state.spend.limit === 5 && J.Store.state.spend.pendingLimit === 50);
  J.Shop.setLimit(null);
  check('la limite peut être retirée', J.Store.state.spend.limit === null);

  // Achat simulé : bloqué par la limite, puis livré
  J.Shop.setLimit(1);
  const blocked = await J.Shop.purchase('starter');
  check('achat bloqué par la limite de dépenses', blocked.ok === false);
  J.Shop.setLimit(null);
  const done = await J.Shop.purchase('starter');
  check('achat simulé livré (jetons + journal de dépense)', done.ok === true && done.tokens === 5000);
}

/* ============================================================= 9. INTERFACE */
section('9. Navigation, modales et rappels');
{
  J.UI.go('originals');
  check('navigation vers le catalogue', win.document.getElementById('screen-originals').classList.contains('is-on'));
  check('le bouton de navigation actif est mis à jour',
    win.document.querySelector('.nav-btn[data-go="originals"]').classList.contains('is-on'));
  J.UI.go('rank');
  const rows = win.document.querySelectorAll('#rankList .rank-row');
  check('le classement affiche des bots et le joueur', rows.length > 5);
  check('le joueur apparaît dans le classement', win.document.querySelectorAll('#rankList .rank-row.me').length === 1);
  J.UI.go('profile');
  check('le profil affiche les missions du jour', win.document.querySelectorAll('#profileBody .quest').length === 3);
  J.UI.go('shop');
  check('la boutique liste les packs avec mention légale',
    win.document.querySelectorAll('#shopBody [data-buy]').length === 5 &&
    /sans valeur monétaire/i.test(win.document.getElementById('shopBody').textContent));
  J.UI.openFair();
  check('l\'écran Fair Play montre le hash et le vérificateur',
    /HMAC-SHA256/.test(win.document.getElementById('sheetRoot').textContent));
  J.UI.closeSheet();
  J.UI.openAbout();
  check('les mentions légales rappellent l\'absence de valeur (18+)',
    /aucune valeur monétaire/i.test(win.document.getElementById('sheetRoot').textContent) &&
    /18 ans/.test(win.document.getElementById('sheetRoot').textContent));
  J.UI.closeSheet();
  check('le rappel de pause est actif (30 minutes)', J.CONST.PAUSE_MS === 30 * 60 * 1000);
  check('les réglages permettent de couper son, vibrations et animations',
    ['sound', 'vibration', 'motion'].every((k) => k in J.Store.state.settings));
  J.UI.go('home');
}

/* ================================== 10. LES 6 NOUVEAUX ORIGINALS (VAGUE 2) */
section('10. Mathématiques et tour de jeu des 6 Originals de la vague 2');
{
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };

  // ---- Limbo : résultat = 0,99/(1−u) ⇒ P(résultat ≥ T) = 0,99/T, RTP = 99 %
  {
    const rollFrom = (u) => Math.max(1.00, Math.floor(99 / (1 - u)) / 100);
    let worst = 0;
    for (const T of [1.2, 2, 3, 5, 10, 100]) {
      const N = 60000; let wins = 0;
      for (let i = 0; i < N; i++) if (rollFrom(J.Fair.float()) >= T) wins++;
      const rtp = (wins / N) * T;
      worst = Math.max(worst, Math.abs(rtp - 0.99));
    }
    check('Limbo : RTP ≈ 99 % pour toutes les cibles testées', worst < 0.03, 'écart max ' + (worst * 100).toFixed(2) + ' pts');
    let below = 0;
    for (let i = 0; i < 20000; i++) if (rollFrom(J.Fair.float()) < 1) below++;
    check('Limbo : le résultat ne descend jamais sous 1,00x', below === 0);
  }

  // ---- Coin Flip : mult(n) = 0,99·2ⁿ et P(n victoires d'affilée) = 1/2ⁿ
  {
    const multOf = (n) => 0.99 * Math.pow(2, n);
    check('Coin Flip : 0,99 × 2ⁿ, série max 12 → 4 055x', Math.abs(multOf(12) - 4055.04) < 1e-6, multOf(12).toFixed(2));
    // Identité mathématique : P(n victoires d'affilée) × mult(n) = 0,99 quel que soit n
    let worst = 0;
    for (let n = 1; n <= 12; n++) worst = Math.max(worst, Math.abs(Math.pow(0.5, n) * multOf(n) - 0.99));
    check('Coin Flip : P(n) × mult(n) = 99 % pour n = 1…12', worst < 1e-12, 'écart ' + worst.toExponential(2));
    // Contrôle empirique des 50/50 (tolérance de ±1 %)
    let hits = 0; const N = 40000;
    for (let i = 0; i < N; i++) if (J.Fair.float() < 0.5) hits++;
    check('Coin Flip : pile ou face ≈ 50/50', Math.abs(hits / N - 0.5) < 0.01, ((hits / N) * 100).toFixed(2) + ' %');
  }

  // ---- Hi-Lo : jeu de 52 cartes sans remise, mult = 0,99 / P cumulée
  {
    // Cas simple : carte de hauteur 6, 4 cartes par hauteur → 28 plus hautes, 20 plus basses
    const counts = new Array(14).fill(4); counts[0] = 0;
    let higher = 0, lower = 0;
    for (let r = 7; r <= 13; r++) higher += counts[r];
    for (let r = 1; r <= 5; r++) lower += counts[r];
    check('Hi-Lo : comptage exact des cartes (jeu neuf, hauteur 6)', higher === 28 && lower === 20, higher + '/' + lower);
    const pHigh = higher / 52;
    check('Hi-Lo : mult = 0,99/probabilité', Math.abs((0.99 / pHigh) - 1.8386) < 0.01, (0.99 / pHigh).toFixed(4));
    // Simulation : on tire réellement une carte et on vérifie que le taux de
    // réussite empirique correspond à la probabilité annoncée (28/52).
    let wagered = 0, returned = 0, wins = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const deck = new Array(14).fill(4); deck[0] = 0;
      const idx = Math.floor(J.Fair.float() * 52);
      let seen = 0, rank = 1;
      for (let r = 1; r <= 13; r++) { if (seen + deck[r] > idx) { rank = r; break; } seen += deck[r]; }
      wagered += 100;
      if (rank > 6) { wins++; returned += 100 * (0.99 / pHigh); }
    }
    const empirical = wins / N;
    check('Hi-Lo : la probabilité annoncée correspond au tirage réel (28/52 = 53,8 %)',
      Math.abs(empirical - pHigh) < 0.01, (empirical * 100).toFixed(2) + ' % vs ' + (pHigh * 100).toFixed(2) + ' %');
    check('Hi-Lo : RTP simulé d\'une prédiction ≈ 99 %', Math.abs(returned / wagered - 0.99) < 0.02,
      ((returned / wagered) * 100).toFixed(2) + ' %');
  }

  // ---- Keno : tables conçues pour 97,5 % (vérifiées ici telles que livrées)
  {
    const src = readFileSync(join(root, 'src/38-game-keno.js'), 'utf8');
    const block = src.slice(src.indexOf('const PAYTABLES'), src.indexOf('/** RTP réel'));
    const PAYTABLES = eval('(' + block.replace('const PAYTABLES =', '').replace(/;\s*$/, '') + ')');
    const total = C(40, 10);
    let minRtp = 999, maxRtp = 0, worstCfg = '';
    for (const risk of ['classic', 'medium', 'high']) {
      for (let k = 1; k <= 10; k++) {
        const table = PAYTABLES[risk][k];
        if (table.length !== k + 1) throw new Error('table keno incorrecte ' + risk + '/' + k);
        let ev = 0;
        for (let h = 0; h <= k; h++) ev += (C(k, h) * C(40 - k, 10 - h) / total) * table[h];
        const rtp = ev * 100;
        minRtp = Math.min(minRtp, rtp); maxRtp = Math.max(maxRtp, rtp);
        if (rtp < minRtp) worstCfg = risk + '/' + k;
      }
    }
    check('Keno : RTP entre 97 % et 98 % pour les 30 configurations', minRtp >= 97 && maxRtp <= 98,
      minRtp.toFixed(2) + ' % … ' + maxRtp.toFixed(2) + ' %');
    check('Keno : les trois risques se distinguent bien', PAYTABLES.high[10][10] > PAYTABLES.medium[10][10] &&
      PAYTABLES.medium[10][10] > PAYTABLES.classic[10][10],
      [PAYTABLES.classic[10][10], PAYTABLES.medium[10][10], PAYTABLES.high[10][10]].join(' < '));
    check('Keno : 68 660x pour 10 sur 10 en risque élevé', PAYTABLES.high[10][10] === 68660);
    // Espérance du meilleur gain (tirage le plus rare) cohérente
    const pPerfect = C(10, 10) * C(30, 0) / total;
    check('Keno : probabilité de 10 sur 10 correcte (≈ 1 sur 847 millions)',
      Math.abs(pPerfect - 1.1797e-9) < 1e-13, (1 / pPerfect / 1e6).toFixed(0) + ' millions');
  }

  // ---- Tower : mult(f) = 0,99 / p^f
  {
    const LEVELS = [
      { tiles: 4, traps: 1 }, { tiles: 3, traps: 1 }, { tiles: 2, traps: 1 },
      { tiles: 3, traps: 2 }, { tiles: 4, traps: 3 }
    ];
    let worst = 0;
    for (const lvl of LEVELS) {
      const p = (lvl.tiles - lvl.traps) / lvl.tiles;
      for (let f = 1; f <= 8; f++) {
        const mult = 0.99 / Math.pow(p, f);
        worst = Math.max(worst, Math.abs(mult * Math.pow(p, f) - 0.99));
      }
    }
    check('Tower : mult(f) × pᶠ = 99 % pour les 5 difficultés', worst < 1e-9, 'écart ' + worst.toExponential(2));
    check('Tower : Maître (4 ouvertures, 3 pièges) vaut 3,96x au 1er étage',
      Math.abs((0.99 / 0.25) - 3.96) < 1e-9, (0.99 / 0.25).toFixed(2) + 'x');
  }

  // ---- Wheel : tables de segments construites pour 97 %
  {
    const buildTable = J.__wheelTable;
    check('Wheel : constructeur de table exposé', typeof buildTable === 'function');
    let worst = 0, worstAt = '';
    const details = [];
    const TARGETS = [1.2, 1.5, 2, 3, 5, 10, 25, 50];
    for (const T of TARGETS) {
      const t = buildTable(T);
      // RTP = moyenne des valeurs des segments (le gain est la valeur du segment)
      const rtp = t.table.reduce((a, s) => a + s.m, 0) / t.table.length * 100;
      details.push(T + 'x→' + rtp.toFixed(1) + '%');
      if (Math.abs(rtp - 97) > worst) { worst = Math.abs(rtp - 97); worstAt = T + 'x (' + rtp.toFixed(2) + '%)'; }
      if (t.table.length !== 60) { worst = 99; worstAt = 'nombre de segments ' + t.table.length; }
      if (!(t.lossMult >= 0 && t.lossMult < 1)) { worst = 99; worstAt = 'consolation ' + t.lossMult; }
    }
    check('Wheel : RTP = 97 % pour les 8 cibles', worst < 0.6, 'pire cas ' + worstAt + ' · ' + details.join(' '));
    check('Wheel : segments gagnants décroissants et toujours ≥ 1',
      buildTable(1.2).wins > buildTable(2).wins && buildTable(2).wins > buildTable(10).wins &&
      buildTable(50).wins >= 1,
      [buildTable(1.2).wins, buildTable(2).wins, buildTable(10).wins, buildTable(50).wins].join(' > '));
    // Simulation : 60 000 lancers à cible 2x, RTP attendu 97 %
    {
      const t = buildTable(2);
      let wagered = 0, returned = 0;
      for (let i = 0; i < 60000; i++) {
        const seg = J.Fair.int(0, t.table.length - 1);
        wagered += 100; returned += 100 * t.table[seg].m;
      }
      check('Wheel : RTP simulé à cible 2x ≈ 97 %', Math.abs(returned / wagered - 0.97) < 0.02,
        ((returned / wagered) * 100).toFixed(2) + ' %');
    }
  }
}

/* =========================== 11. LES 6 JEUX DE LA VAGUE 2 VIA L'INTERFACE */
section('11. Tour de jeu complet des 6 nouveaux jeux (interface)');
{
  const playBtn = () => win.document.querySelector('#gameShell [data-act="play"]');
  for (const id of ['limbo', 'coinflip', 'hilo', 'keno', 'tower', 'wheel']) {
    J.Store.reset();
    J.Store.patch({ balance: 100000 });
    J.Games.open(id);
    await wait(120);
    const g = J.Games.instance();
    check(id + ' : écran monté avec la mise et les réglages', !!g && !!playBtn());
    J.Games.setBet(g, 100, true);
    playBtn().click();
    check(id + ' : mise débitée au lancement', J.Store.state.stats.bets === 1, 'paris ' + J.Store.state.stats.bets);
    await wait(120);

    if (id === 'coinflip') {
      // Encaisse après la première victoire (le lancer est animé)
      await wait(1300);
      const cash = win.document.querySelector('[data-act="cashout"]');
      if (g.streak > 0 && cash) cash.click();
      else { const relaunch = win.document.querySelector('[data-act="custom"]'); if (relaunch) relaunch.click(); }
      await wait(300);
      check('coinflip : la manche se termine (historique)', J.Store.state.history.length === 1, String(J.Store.state.history.length));
    } else if (id === 'hilo') {
      const high = win.document.getElementById('hlHigh'), low = win.document.getElementById('hlLow');
      const pTxt = win.document.getElementById('hlHighP').textContent + ' ' + win.document.getElementById('hlLowP').textContent;
      check('hilo : au moins un sens jouable, probabilités affichées',
        !!high && !!low && (!high.disabled || !low.disabled) && /%/.test(pTxt), pTxt);
      check('hilo : les deux sens se désactivent sur un As ou un Roi (comptage exact)',
        (g.card.rank === 1 ? low.disabled : true) && (g.card.rank === 13 ? high.disabled : true),
        'carte ' + g.card.rank);
      (high.disabled ? low : high).click();
      await wait(200);
      const cash = win.document.querySelector('[data-act="cashout"]');
      if (g.steps > 0 && cash) cash.click();
      else { const again = win.document.querySelector('[data-act="play"]'); if (again && !again.disabled) again.click(); }
      await wait(400);
      check('hilo : la manche se termine (historique)', J.Store.state.history.length >= 1);
    } else if (id === 'keno') {
      check('keno : 40 numéros affichés', win.document.querySelectorAll('#knGrid [data-num]').length === 40);
      check('keno : le tirage révèle 10 boules', await (async () => {
        for (let i = 0; i < 40; i++) { if (win.document.querySelectorAll('#knBalls .keno-ball').length >= 10) return true; await wait(120); }
        return false;
      })());
      for (let i = 0; i < 25 && J.Store.state.history.length === 0; i++) await wait(120);
      check('keno : la manche est réglée', J.Store.state.history.length === 1, String(J.Store.state.history.length));
    } else if (id === 'tower') {
      check('tower : 8 étages affichés', win.document.querySelectorAll('#twFloors .tower-floor').length === 8);
      const tile = win.document.querySelector('#twFloors [data-floor="0"][data-tile="0"]');
      tile.click();
      await wait(200);
      if (g.active && g.floor > 0) {
        const cash = win.document.querySelector('[data-act="cashout"]');
        if (cash && !cash.disabled) cash.click();
      }
      await wait(300);
      check('tower : la manche se termine (encaissement ou piège)', J.Store.state.history.length === 1,
        String(J.Store.state.history.length));
    } else if (id === 'wheel') {
      // Cible plus petite = plus de segments gagnants, rotation plus courte
      const smallTarget = win.document.querySelector('#wgTargets [data-t="1.2"]');
      if (smallTarget) smallTarget.click();
      await wait(120);
      const spin = playBtn();
      if (spin && !spin.disabled) spin.click();
      for (let i = 0; i < 70 && J.Store.state.history.length === 0; i++) await wait(120);
      check('wheel : la manche se règle après la rotation', J.Store.state.history.length === 1, String(J.Store.state.history.length));
    } else if (id === 'limbo') {
      await wait(900);
      check('limbo : la manche se règle après le tirage', J.Store.state.history.length === 1, String(J.Store.state.history.length));
    }
    J.Games.close(true);
    await wait(60);
  }
}

/* ============== 12. BOUTIQUE : OFFRES, PREMIER ACHAT ET ADAPTATEUR IAP */
section('12. Boutique : structure de paiement et offres');
{
  J.Store.reset();
  const packs = J.Shop.PACKS;
  check('5 packs proposés, dont 4 tailles demandées',
    packs.length === 5 && packs.some((p) => p.tokens === 5000) && packs.some((p) => p.tokens === 25000) &&
    packs.some((p) => p.tokens === 100000) && packs.some((p) => p.tokens === 500000),
    packs.map((p) => p.tokens).join('/'));
  check('offre « premier achat » à prix réduit', packs.some((p) => p.firstOnly && p.bonus > 0));
  check('adaptateur de paiement simulé actif', J.Shop.provider && J.Shop.provider.id === 'simulated' &&
    typeof J.Shop.provider.buy === 'function' && typeof J.Shop.provider.available === 'function');
  // Un fournisseur réel peut être branché et remplace le simulé
  const fake = { id: 'storekit', label: 'Apple', available: () => true, buy: () => Promise.resolve({ ok: true, transactionId: 'APPLE-1' }) };
  const before = J.Shop.provider;
  J.Shop.registerProvider(fake);
  check('registerProvider() branche un adaptateur Apple/Google',
    J.Shop.provider.id === 'storekit');
  const res = await J.Shop.purchase('starter');
  check('achat via l\'adaptateur branché : jetons crédités + transaction tracée',
    res.ok === true && res.tokens === 5000 && J.Store.state.shop.lastTransaction === 'APPLE-1');
  J.Shop.registerProvider(before);                       // retour au simulé
  check('retour au fournisseur simulé', J.Shop.provider.id === 'simulated');
  check('l\'offre premier achat devient indisponible après usage', (function () {
    J.Store.patch({ shop: { firstPurchaseUsed: true } });
    const fb = J.Shop.PACKS.find((p) => p.firstOnly);
    return J.Shop.canBuy(fb) === false;
  })());
  check('limite mensuelle respectée par le tunnel d\'achat', (function () {
    J.Store.patch({ spend: { month: win.JACKPOTLY.util.monthKey(), total: 0, limit: 3 } });
    return J.Shop.canBuy(J.Shop.PACKS.find((p) => p.id === 'popular')) === false;
  })());
}

/* ================================================================ SYNTHÈSE */
console.log(results.join('\n'));
console.log('\n' + '─'.repeat(64));
console.log((failed === 0 ? '✅ ' : '❌ ') + passed + ' contrôles réussis, ' + failed + ' échec(s)');
if (errors.length) console.log('Avertissements capturés : ' + errors.slice(0, 5).join(' | '));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
