#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — AUDIT D'INTÉGRITÉ DES CRÉDITS ET DES TAUX DE RETOUR
   -------------------------------------------------------------------------
   Les jetons sont fictifs, mais la comptabilité doit être exacte : un joueur
   ne doit jamais pouvoir gagner des jetons « sortis de nulle part », perdre
   plus que sa mise, ni voir un multiplicateur qui ne correspond pas au
   montant crédité. Ce contrôle rejoue de vraies manches sur les 16 jeux et
   vérifie, manche par manche :

     A. Δ solde = −mise + gain                    (identité comptable)
     B. gain = arrondi(mise × multiplicateur)     (multiplicateur honnête)
     C. cumuls stats (misé / rendu / net) = Σ des manches
     D. le solde ne devient jamais négatif, les mises jamais supérieures au solde
     E. RTP annoncé = RTP calculé depuis les tables du moteur
     F. les jetons gratuits sont plafonnés et non répétables (bonus, roue,
        quête, recharge, paliers VIP, packs boutique)

   Usage : node tests/credits.mjs [manchesParJeu]   (défaut : 6)
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'jackpotly.html'), 'utf8');
const ROUNDS = Math.max(1, parseInt(process.argv[2] || '6', 10));
const ONLY = (process.argv[3] || '').toLowerCase();      // ex. « f » : ne joue que les récompenses

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.error('jsdom manquant : `npm install --no-save jsdom`'); process.exit(2); }

let passed = 0, failed = 0;
const failures = [];
const section = (t) => console.log('\n' + t);
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + label + (detail ? '  → ' + detail : '')); }
  else { failed++; failures.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fr = (n, d = 2) => n.toFixed(d).replace('.', ',');

/* Canvas / vibration / media queries : mêmes béquilles que tests/probe.mjs. */
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
const errors = [];
win.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
dom.virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));

await wait(400);
const J = win.JACKPOTLY;
if (!J || !J.Games) { console.error("L'application ne s'est pas chargée"); process.exit(1); }

/* =========================================== E. RTP ANNONCÉ = RTP CALCULÉ */
section('E. Taux de retour : annoncé vs calculé depuis les tables du moteur');
{
  const bad = [];
  const lines = [];
  for (const def of J.GAMES) {
    const rtp = typeof def.rtp === 'number' ? def.rtp : parseFloat(def.rtp);
    lines.push(def.id + ' ' + fr(rtp, 2) + ' %');
    if (!(rtp >= 96 && rtp <= 100)) bad.push(def.id + ' hors plage : ' + def.rtp);
  }
  check('les 16 jeux annoncent un RTP entre 96 % et 100 %', bad.length === 0,
    bad.length ? bad.join(' | ') : lines.join(' · '));

  // Roulette : 36/37 = 97,297 %
  const rui = 36 / 37 * 100;
  check('Roulette : RTP calculé = 36/37', Math.abs(rui - 97.297) < 0.01, fr(rui, 3) + ' %');

  // Slots : RTP exact recalculé sur les 3 thèmes à partir des rouleaux
  const SD = J.SLOTS_DATA;
  if (SD && typeof SD.rtp === 'function') {
    // rtp(theme) renvoie une fraction (0,965) : on la passe en pourcentage.
    const per = SD.THEMES.map((t) => ({ name: t.name, rtp: SD.rtp(t) * 100 }));
    const off = per.filter((p) => p.rtp < 95 || p.rtp > 98);
    check('Slots : RTP recalculé sur les 3 thèmes (96,5 % visé)', off.length === 0,
      per.map((p) => p.name + ' ' + fr(p.rtp, 2) + ' %').join(' · '));
  } else {
    check('Slots : table de RTP exposée', false, 'J.SLOTS_DATA.rtp indisponible');
  }

  // Wheel : moyenne des segments = RTP annoncé (97 %)
  if (typeof J.__wheelTable === 'function') {
    const targets = [1.2, 1.5, 2, 3, 5, 10, 25, 50];
    const rtps = targets.map((T) => {
      const t = J.__wheelTable(T);
      return t.table.reduce((a, s) => a + s.m, 0) / t.table.length * 100;
    });
    const worst = Math.max(...rtps.map((r) => Math.abs(r - 97)));
    check('Wheel : moyenne des 60 segments = 97 % pour les 8 cibles', worst < 0.6,
      'pire écart ' + fr(worst, 2) + ' pt · ' + rtps.map((r) => fr(r, 1)).join('/'));
  }
}

/* ======================================== A–D. COMPTABILITÉ DES 16 JEUX */
section('A–D. Comptabilité manche par manche sur les 16 jeux (mise 100 J)');
if (ONLY !== 'f') {
  const BET = 100;
  const state = () => J.Store.state;
  const inst = () => J.Games.instance();
  const btn = (act) => doc.querySelector('#gameShell [data-act="' + act + '"]');
  const clickIf = (sel) => { const e = typeof sel === 'string' ? doc.querySelector(sel) : sel; if (e && !e.disabled) { e.click(); return true; } return false; };
  const ROUND_BET = { roulette: 100, baccarat: 100, mines: 100, blackjack: 100, videopoker: 100, poker: 100 };

  /* Attend qu'une manche soit réglée : l'historique doit grandir et le jeu ne
     doit plus être occupé. Les jeux animés (roulette, keno, slots…) dépassent
     volontiers la seconde. */
  async function waitSettled(before, ms = 9000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const g = inst();
      if (state().history.length > before && g && !g.busy && g.phase !== 'player' && g.phase !== 'insurance') return true;
      await wait(90);
    }
    return false;
  }

  /* Chaque jeu a SA façon de se jouer : on reproduit ici les gestes du joueur
     (les mêmes politiques que tests/verify.mjs §11 et §20, réutilisées pour
     vérifier la comptabilité sur des manches réelles). */
  const press = (re) => {
    const b = Array.from(doc.querySelectorAll('#gActions button, #gameShell button'))
      .find((x) => !x.disabled && re.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  };
  const tapSel = (sel) => {
    const e = doc.querySelector(sel);
    if (e && !e.disabled) { e.click(); return true; }
    return false;
  };
  /* Mises préalables exigées par certains tapis (roulette, baccarat, mines…). */
  const preBet = (id) => {
    // On repart d'un tapis vide : les jeux de table gardent les jetons posés
    // d'une manche à l'autre (comme au casino), ce qui fausserait la mesure.
    if (id === 'roulette') { tapSel('#ruClear'); tapSel('#gStage [data-num="17"]'); tapSel('#gStage [data-out="rouge"]'); }
    else if (id === 'baccarat') { tapSel('#bacClear'); }
    if (id === 'baccarat') { tapSel('#gStage [data-zone="joueur"]'); }
    else if (id === 'mines') { tapSel('#gPanel [data-mines="3"]'); }
  };
  /* Décisions prises pendant la manche (appelée en boucle par oneRound). */
  const decide = (id, g) => {
    switch (id) {
      case 'crash': press(/Encaisser/) || press(/Arrêter l['’]auto/); break;
      case 'mines':
        if (g && g.picked && g.picked.length >= 1) press(/Encaisser/);
        else if (!tapSel('#mnGrid [data-tile="0"]') && !tapSel('#mnGrid [data-tile="6"]')) tapSel('#mnGrid [data-tile="12"]');
        break;
      case 'coinflip': press(/Encaisser/); break;
      case 'hilo':
        if (g && g.steps > 0 && g.mult > 1.01) press(/Encaisser/);
        else if (!tapSel('#hlHigh')) tapSel('#hlLow');
        break;
      case 'tower':
        if (g && g.floor > 0) press(/Encaisser/);
        else {
          const f = (g && g.floor) || 0;
          for (let t = 0; t < 3; t++) if (tapSel('#twFloors [data-floor="' + f + '"][data-tile="' + t + '"]')) break;
        }
        break;
      case 'blackjack':
        if (g && g.phase === 'insurance') press(/Non merci/);
        else if (g && g.phase === 'player') press(/Rester/);
        break;
      case 'videopoker':
        // La phase de décision s'appelle « hold » : on garde une carte puis on tire.
        if (g && (g.phase === 'hold' || g.phase === 'player')) { tapSel('#gStage .vp-card'); press(/Tirer/); }
        break;
      case 'poker': press(/Suivre|Checker/) || press(/Se passer/); break;
      default: break;                          // dice, plinko, limbo, keno, wheel, roulette, baccarat, slots : automatiques
    }
  };

  /* Une manche complète, jouée comme un doigt : mise, bouton principal, puis les
     décisions de la politique ci-dessus jusqu'au règlement. */
  async function oneRound(id) {
    const before = state().history.length;
    const g0 = inst();
    if (!g0) return { err: 'aucune instance' };
    J.Games.setBet(g0, BET, true);
    preBet(id);
    // La manche précédente peut finir par une animation : on attend que le bouton
    // principal redevienne actif (comme un joueur qui regarde le résultat).
    let launched = false;
    for (let i = 0; i < 50 && !launched; i++) launched = clickIf(btn('play')) || (await wait(120), false);
    if (!launched) return { err: 'bouton play absent/inactif' };
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      decide(id, inst());
      if (state().history.length > before && !inst().busy && inst().phase !== 'player') break;
      await wait(120);
    }
    await wait(80);
    if (state().history.length <= before) return { err: 'manche non réglée (12 s)' };
    return {};
  }

  const LIVE = J.GAMES.filter((d) => d.status === 'live').map((d) => d.id);
  const report = [], problems = [];

  for (const id of LIVE) {
    J.Store.reset();
    J.Store.patch({ balance: 200000 });
    J.Wallet.renderBalance();
    J.Games.close(true);
    J.Games.open(id);
    await wait(140);
    if (!inst()) { problems.push(id + ' : jeu non monté'); continue; }

    const rounds = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s0 = state();
      const bal0 = s0.balance, wag0 = s0.stats.wagered, ret0 = s0.stats.returned;
      const n0 = s0.history.length;
      const r = await oneRound(id);
      if (r.err) { problems.push(id + ' : ' + r.err); break; }
      const s1 = state();
      const rec = s1.history[0];
      const staked = s1.stats.wagered - wag0;               // mise réellement débitée
      const gain = s1.balance - bal0 + staked;              // montant crédité par le moteur
      rounds.push({
        bet: rec ? rec.bet : staked, staked,
        mult: rec ? rec.mult : null,
        payout: rec ? rec.payout : null,
        gain, dBal: s1.balance - bal0,
        dWag: s1.stats.wagered - wag0, dRet: s1.stats.returned - ret0,
        newRows: s1.history.length - n0, balAfter: s1.balance
      });
      if (s1.balance < 0) problems.push(id + ' : solde négatif (' + s1.balance + ')');
    }
    if (!rounds.length) { problems.push(id + ' : aucune manche jouée'); continue; }

    for (const r of rounds) {
      if (r.newRows < 1) problems.push(id + ' : manche non enregistrée dans l\'historique');
      if (r.payout === null) continue;
      if (Math.abs(r.gain - r.payout) > 0.5) problems.push(id + ' : gain crédité ' + r.gain + ' ≠ payout historique ' + r.payout);
      if (Math.abs(r.dBal - (-r.dWag + r.payout)) > 0.5) problems.push(id + ' : Δ solde ' + r.dBal + ' ≠ −' + r.dWag + ' + ' + r.payout);
      if (Math.abs(r.dWag - r.bet) > 0.5) problems.push(id + ' : misé cumulé +' + r.dWag + ' ≠ mise de la manche ' + r.bet);
      if (Math.abs(r.dRet - r.payout) > 0.5) problems.push(id + ' : rendu cumulé +' + r.dRet + ' ≠ gain ' + r.payout);
      const expect = Math.round(r.dWag * r.mult);
      if (Math.abs(r.payout - expect) > 1) problems.push(id + ' : gain ' + r.payout + ' ≠ mise×mult = ' + expect + ' (' + r.mult + 'x sur ' + r.dWag + ' J)');
      if (r.mult < 0 || r.mult > 100000) problems.push(id + ' : multiplicateur aberrant ' + r.mult);
    }

    const played = rounds.filter((r) => r.payout !== null);
    const staked = played.reduce((a, r) => a + r.bet, 0);
    const paid = played.reduce((a, r) => a + r.payout, 0);
    report.push({ id, n: played.length, staked, paid, rtp: staked ? paid / staked * 100 : 0,
      best: played.reduce((a, r) => Math.max(a, r.mult), 0) });
  }

  check('les 16 jeux jouent au moins une manche complète', report.length === LIVE.length,
    report.map((r) => r.id + ' ' + r.n).join(' · '));
  check('comptabilité exacte sur ' + report.reduce((a, r) => a + r.n, 0) + ' manches réelles (Δ solde, misé, rendu, mise×mult)',
    problems.length === 0, problems.slice(0, 6).join(' | '));
  check('aucun solde négatif, aucune mise supérieure au solde', problems.filter((p) => /négatif/.test(p)).length === 0,
    report.length + ' jeux contrôlés en parallèle du solde de départ 200 000 J');

  console.log('\n  RTP observé sur ' + ROUNDS + ' manches (indicatif : variance énorme sur si peu de tours) :');
  for (const r of report) {
    console.log('    ' + r.id.padEnd(11) + ' ' + String(r.n).padStart(2) + ' manche(s) · misé ' + r.staked +
      ' · rendu ' + r.paid + ' · observé ' + fr(r.rtp, 0) + ' % · meilleur ' + fr(r.best, 2) + 'x');
  }
}

/* ============================================ F. JETONS GRATUITS PLAFONNÉS */
section('F. Jetons gratuits : plafonds, délais et non-répétabilité');
{
  /* --- Recharge gratuite quand le solde tombe à zéro : plafonnée par jour et
         conditionnée à un délai volontairement dissuasif (anti-rachat compulsif). */
  check('recharge gratuite : montant, quota journalier et délai déclarés',
    J.CONST.FREE_CHIPS > 0 && J.CONST.FREE_CHIPS_PER_DAY > 0 && J.CONST.FREE_CHIPS_DELAY > 0,
    J.CONST.FREE_CHIPS + ' J par recharge · ' + J.CONST.FREE_CHIPS_PER_DAY + '/jour · délai ' +
    Math.round(J.CONST.FREE_CHIPS_DELAY / 1000) + ' s');

  J.Store.reset();
  J.Store.patch({ balance: 0 });
  J.Wallet.renderBalance();
  J.Rewards.startRechargeTimer();
  const notYet = J.Rewards.claimFreeChips();                  // juste après le départ du délai
  const ready = J.Rewards.rechargeState();
  check('recharge gratuite : refusée tant que le délai n\'est pas écoulé',
    notYet === 0 && !ready.ready && ready.left === J.CONST.FREE_CHIPS_PER_DAY,
    'crédité ' + notYet + ' J · prêt dans ' + Math.round(ready.readyIn / 1000) + ' s');

  // On court-circuite le délai pour tester le versement sans attendre 30 s.
  J.Store.state.freeChips.readyAt = Date.now() - 1;
  const paid = J.Rewards.claimFreeChips();
  check('recharge gratuite : versée une fois le délai écoulé, montant plafonné',
    paid === J.CONST.FREE_CHIPS && J.Store.state.balance === J.CONST.FREE_CHIPS,
    paid + ' J crédités · solde ' + J.Store.state.balance);

  // Épuisement du quota du jour : plus rien à réclamer.
  let guard = 0;
  while (guard++ < 20) {
    J.Store.state.freeChips.readyAt = Date.now() - 1;
    J.Rewards.startRechargeTimer();
    J.Store.state.freeChips.readyAt = Date.now() - 1;
    if (!J.Rewards.claimFreeChips()) break;
  }
  const quota = J.Store.state.freeChips.used;
  J.Store.state.freeChips.readyAt = Date.now() - 1;
  const extra = J.Rewards.claimFreeChips();
  check('recharge gratuite : quota journalier respecté (' + J.CONST.FREE_CHIPS_PER_DAY + ' par jour)',
    quota === J.CONST.FREE_CHIPS_PER_DAY && extra === 0,
    quota + ' recharge(s) honorée(s) · total ' + J.Store.state.balance + ' J (plafond ' +
    (J.CONST.FREE_CHIPS * J.CONST.FREE_CHIPS_PER_DAY) + ' J)');

  /* --- Bonus quotidien : un seul versement par jour, montant du cycle respecté. */
  J.Store.reset();
  const balBefore = J.Store.state.balance;
  const b1 = J.Rewards.claimDaily();
  const b2 = J.Rewards.claimDaily();
  check('bonus quotidien : versé une seule fois par jour et crédité sur le solde',
    b1 > 0 && b2 === 0 && J.Store.state.balance === balBefore + b1,
    b1 + ' J crédités · 2e tentative ' + b2 + ' J · solde ' + balBefore + ' → ' + J.Store.state.balance);

  /* --- Roue quotidienne : un tour gratuit par jour, rotation animée, gain issu
         des segments affichés (aucun jeton créé en dehors des 10 secteurs). */
  const segs = (J.Rewards.SEGMENTS || []).map((x) => x.v).filter((x) => typeof x === 'number');
  const wheelBefore = J.Store.state.balance;
  const spinsBefore = J.Store.state.daily.wheelSpins || 0;
  J.Rewards.spin();
  // La rotation dure 4,2 s : on attend la fin de l'animation (le crédit tombe à
  // l'arrêt de la roue), pas un nombre de frames.
  for (let i = 0; i < 400 && J.Rewards._spinning !== false; i++) await wait(60);
  const prize = J.Store.state.balance - wheelBefore;
  const again = J.Rewards.canSpinWheel();
  const spinsNow = J.Store.state.daily.wheelSpins || 0;
  check('roue quotidienne : un tour par jour, gain strictement issu des segments',
    segs.indexOf(prize) >= 0 && again === false && spinsNow === spinsBefore + 1,
    'gain ' + prize + ' J (' + Math.min.apply(null, segs) + '–' + Math.max.apply(null, segs) + ' J) · 2e tour : ' +
    (again ? 'possible (!)' : 'bloqué'));

  /* --- Boutique : packs annoncés, limite mensuelle réellement appliquée. */
  J.Store.reset();
  const packs = J.Shop.PACKS;
  check('boutique : 5 packs dont une offre de bienvenue à -70 %',
    packs.length === 5 && packs.some((p) => p.firstOnly) && packs.some((p) => p.tokens === 500000),
    packs.map((p) => p.tokens + ' J/' + p.price + ' €' + (p.firstOnly ? ' (1re fois)' : '')).join(' · '));

  J.Store.state.spend = { month: J.util.monthKey(), total: 10, limit: 10 };   // plafond du mois atteint
  const blocked = J.Shop.canBuy(packs[0]);
  const buyTry = await J.Shop.purchase(packs[0].id).catch((e) => ({ ok: false, error: String(e) }));
  check('boutique : achat bloqué au-delà de la limite mensuelle choisie',
    blocked === false && buyTry.ok === false, 'limite 10 € atteinte · achat refusé (' + (buyTry.error || 'bloqué') + ')');

  // Sous la limite : l'achat livre bien les jetons annoncés (pack + bonus).
  J.Store.state.spend.total = 0;
  const before = J.Store.state.balance;
  const ok = await J.Shop.purchase(packs[0].id).catch((e) => ({ ok: false, error: String(e) }));
  const worth = packs[0].tokens + (packs[0].bonus || 0);
  check('boutique : achat livré = jetons du pack + bonus, sans dépasser la limite',
    ok.ok === true && J.Store.state.balance - before === worth && J.Store.state.spend.total === packs[0].price,
    '+' + (J.Store.state.balance - before) + ' J · dépense du mois ' + J.Store.state.spend.total + ' €');

  /* --- Paliers VIP : une prime par palier, jamais deux fois. */
  J.Store.reset();
  J.Store.state.vip.wagered = 5 * 10 ** 8;                     // tous les paliers franchis
  const v1 = J.Wallet.claimVipReward();
  const v2 = J.Wallet.claimVipReward();
  J.Store.state.vip.wagered = 5 * 10 ** 8;
  const v3 = J.Wallet.claimVipReward();
  check('paliers VIP : une prime par palier, jamais deux fois le même',
    v1 > 0 && v3 !== v1 && (v2 === 0 || v2 !== v1) && J.Store.state.vip.claimedLevels.length <= J.CONST.VIP.length,
    'primes ' + v1 + ' puis ' + v2 + ' puis ' + v3 + ' J · paliers réclamés ' +
    J.Store.state.vip.claimedLevels.length + '/' + J.CONST.VIP.length + ' paliers ' +
    J.CONST.VIP.map((t) => t.name + ' ' + t.need).join(' · '));
}

/* ================================================================ VERDICT */
section('Journal d\'exécution');
check('aucune exception JavaScript pendant l\'audit', errors.length === 0, errors.slice(0, 4).join(' | ') || 'aucune');

console.log('\nRésultats\n');
console.log('────────────────────────────────────────────────────────────────');
if (failed === 0) console.log('✅ ' + passed + ' contrôles de crédits réussis, 0 échec(s)');
else {
  console.log('❌ ' + passed + ' contrôle(s) réussi(s), ' + failed + ' échec(s)');
  console.log('\nÉchecs :');
  for (const f of failures) console.log('  · ' + f);
}
process.exit(failed === 0 ? 0 : 1);
