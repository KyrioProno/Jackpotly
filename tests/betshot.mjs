/* tests/betshot.mjs — sonde « main du joueur » (outil de développement).
   Ouvre jackpotly.html dans un vrai Chromium mobile et mesure, pour chaque
   commande de table, ce qu'un doigt peut réellement atteindre :
   - partie VISIBLE de l'élément (recadrée par tous les conteneurs défilants) ;
   - hit-test du navigateur au centre de cette partie visible ;
   - appui tactile réel, puis lecture de l'état du jeu (spots, bouton, solde).
   Un appui est « réussi » seulement si l'état du moteur change derrière. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer, chromium;
try {
  puppeteer = (await import('puppeteer-core')).default;
  chromium = (await import('@sparticuz/chromium')).default;
} catch {
  console.error('Dépendances manquantes : npm install --no-save puppeteer-core @sparticuz/chromium');
  process.exit(2);
}
const dir = '/tmp/jp-nss/lib';
if (!existsSync(join(dir, 'libnss3.so'))) {
  const br = join(root, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
  writeFileSync('/tmp/jp-al2023.tar', zlib.brotliDecompressSync(readFileSync(br)));
  mkdirSync('/tmp/jp-nss', { recursive: true });
  execFileSync('tar', ['xf', '/tmp/jp-al2023.tar', '-C', '/tmp/jp-nss']);
}
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(root, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const browser = await puppeteer.launch({
  args: [...chromium.args, '--font-render-hinting=none', '--force-color-profile=srgb'],
  executablePath: await chromium.executablePath(), headless: 'shell',
  env: { ...process.env, LD_LIBRARY_PATH: dir }
});
mkdirSync(join(root, 'tests', 'screens'), { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEV = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SMALL = { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/* Point réellement touchable d'un élément : on croise son rectangle avec tous
   les conteneurs défilants qui le contiennent (c'est ce que le navigateur
   découpe à l'écran), puis on demande au navigateur qui est sous ce point. */
const reach = (sel) => {
  const e = document.querySelector(sel);
  if (!e) return { absent: true };
  const r = e.getBoundingClientRect();
  let l = r.left, t = r.top, rr = r.right, b = r.bottom;
  const anc = [];
  for (let p = e.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/auto|scroll|hidden/.test(cs.overflowY) || /auto|scroll|hidden/.test(cs.overflowX)) {
      const pr = p.getBoundingClientRect();
      anc.push((p.id || p.className.split(' ')[0]) + '[' + Math.round(pr.top) + '→' + Math.round(pr.bottom) + ']');
      l = Math.max(l, pr.left); t = Math.max(t, pr.top);
      rr = Math.min(rr, pr.right); b = Math.min(b, pr.bottom);
    }
  }
  l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, innerWidth); b = Math.min(b, innerHeight);
  const vw = Math.max(0, rr - l), vh = Math.max(0, b - t);
  const frac = r.width * r.height ? (vw * vh) / (r.width * r.height) : 0;
  const x = Math.round((l + rr) / 2), y = Math.round((t + b) / 2);
  const top = (vw > 4 && vh > 4) ? document.elementFromPoint(x, y) : null;
  return { x, y, vis: Math.round(frac * 100), w: Math.round(r.width), h: Math.round(r.height),
    rect: [Math.round(r.top), Math.round(r.bottom)], clip: [Math.round(t), Math.round(b)], anc: anc.join(' < '),
    hit: !!top && (top === e || e.contains(top)),
    cover: top ? top.tagName.toLowerCase() + '.' + String(top.className || '').split(' ')[0] : 'aucun' };
};
const reachIn = (page, sel) => page.evaluate(reach, sel);

const swipe = async (page, x, y, dy) => {
  const client = await page.createCDPSession();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 12; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (dy * i) / 12), id: 1 }] });
    await wait(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  await wait(600);
};

for (const [name, dev] of [['iphone13', DEV], ['se320', SMALL]]) {
  const page = await browser.newPage();
  await page.setViewport(dev);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
  await page.waitForFunction('window.JACKPOTLY && JACKPOTLY.Games', { timeout: 25000 });
  await page.waitForFunction('(() => { const s = document.getElementById("splash"); return !s || getComputedStyle(s).display === "none"; })()', { timeout: 20000 });
  const boot = async (id) => page.evaluate((id) => {
    const J = window.JACKPOTLY;
    try { J.UI.closeModal(); } catch (e) {}
    /* le sondage mesure le tapis, pas l'écran de bienvenue du premier lancement */
    if (!J.__shot) { J.Wallet.credit(500000, 'shot'); J.Store.patch({ settings: { _welcomed: true } }); J.__shot = true; }
    document.querySelectorAll('.overlay.is-on').forEach((o) => o.classList.remove('is-on'));
    if (J.Games.instance()) J.Games.close(true);
    J.Games.open(id);
  }, id);
  const ZONES = ['[data-zone="banque"]', '[data-zone="joueur"]', '[data-zone="egalite"]', '[data-zone="paireJ"]', '[data-zone="paireB"]'];

  /* ---------------------------------------------------------- BACCARAT */
  await boot('baccarat');
  await wait(700);
  const bac = [];
  for (const sel of [...ZONES, '#bacClear']) bac.push([sel, await reachIn(page, sel)]);
  console.log('## ' + name + ' BACCARAT ' + JSON.stringify(bac.map(([s, g]) => s.replace(/\[data-zone="/, '').replace(/"\]/, '') + ':' + (g.absent ? 'absent' : 'vis' + g.vis + ' ' + (g.hit ? 'hit' : 'BLOQUÉ par ' + g.cover)))));
  const z = bac.find(([s]) => s.includes('joueur'))[1];
  await page.touchscreen.tap(z.x, z.y);
  await wait(350);
  const bacAfter = await page.evaluate(() => {
    const J = window.JACKPOTLY, g = J.Games.instance();
    const badge = document.querySelector('#gStage [data-zone="joueur"] .bac-w');
    const b = document.querySelector('#gActions [data-act="play"]');
    return { spots: JSON.stringify(g.spots), badge: badge ? badge.textContent : null,
      play: b ? b.textContent.trim() + (b.disabled ? ' [off]' : '') : '-',
      info: (document.getElementById('bacInfo') || {}).textContent };
  });
  console.log('   appui « joueur » → ' + JSON.stringify(bacAfter));
  await page.screenshot({ path: join(root, 'tests', 'screens', 'baccarat-' + name + '.png') });

  /* ---------------------------------------------------------- ROULETTE */
  await boot('roulette');
  await wait(700);
  /* le panneau du bas est toujours visible : un préréglage doit permettre de
     miser sans même toucher le tapis (petits écrans) */
  const preset = await page.evaluate(() => {
    const b = document.querySelector('#ruPresets [data-preset]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { name: b.textContent.trim().split('\n')[0], x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), h: Math.round(r.height) };
  });
  if (preset) {
    await page.touchscreen.tap(preset.x, preset.y);
    await wait(400);
    console.log('   préréglage « ' + preset.name + ' » (h ' + preset.h + ') → ' + await page.evaluate(() => {
      const g = window.JACKPOTLY.Games.instance();
      const b = document.querySelector('#gActions [data-act="play"]');
      return Object.keys(g.spots).length + ' mise(s) · ' + (b ? b.textContent.trim() + (b.disabled ? ' [off]' : '') : '-');
    }));
    await page.evaluate(() => { const b = document.getElementById('ruClear'); if (b) b.click(); });
    await wait(300);
  }
  const RUI = ['[data-num="1"]', '[data-num="17"]', '[data-num="36"]', '[data-out="rouge"]'];
  const before = [];
  for (const sel of RUI) before.push([sel, await reachIn(page, sel)]);
  console.log('   ROULETTE avant défilement ' + JSON.stringify(before.map(([s, g]) => s.replace('[data-num=', 'n').replace('[data-out=', 'o').replace(/[\]"]/g, '') + ':' + (g.absent ? 'absent' : 'vis' + g.vis + ' ' + (g.hit ? 'hit' : 'BLOQUÉ par ' + g.cover) + ' ' + JSON.stringify([g.rect, g.clip, g.anc])))));
  const tap = before.find(([s]) => s === '[data-num="1"]')[1];
  await page.touchscreen.tap(tap.x, tap.y);
  await wait(350);
  const ruAfter = await page.evaluate(() => {
    const g = window.JACKPOTLY.Games.instance();
    const b = document.querySelector('#gActions [data-act="play"]');
    return JSON.stringify(g.spots) + ' · ' + (b ? b.textContent.trim() + (b.disabled ? ' [off]' : '') : '-');
  });
  console.log('   appui n°1 → ' + ruAfter);
  /* un doigt balaie le tapis vers le haut : la grille ne doit pas retenir le geste
     en otage des paris extérieurs (Rouge/Noir, douzaines, colonnes) */
  const stage = await page.evaluate(() => {
    const r = document.getElementById('gStage').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.5),
      h: Math.round(r.height), sh: document.getElementById('gStage').scrollHeight };
  });
  await swipe(page, stage.x, stage.y, -300);
  const afterSwipe = await reachIn(page, '[data-out="rouge"]');
  console.log('   scène ' + stage.h + 'px pour ' + stage.sh + 'px de tapis · après balayage : ' + JSON.stringify(afterSwipe));
  if (!afterSwipe.absent && afterSwipe.hit) {
    await page.touchscreen.tap(afterSwipe.x, afterSwipe.y);
    await wait(350);
    console.log('   appui « rouge » → ' + await page.evaluate(() => {
      const g = window.JACKPOTLY.Games.instance();
      const b = document.querySelector('#gActions [data-act="play"]');
      return JSON.stringify(g.spots) + ' · ' + (b ? b.textContent.trim() + (b.disabled ? ' [off]' : '') : '-');
    }));
  }
  await page.screenshot({ path: join(root, 'tests', 'screens', 'roulette-' + name + '.png') });
  console.log('   erreurs : ' + errs.length + (errs.length ? ' → ' + errs.join(' | ') : ''));
  await page.close();
}
await browser.close();
server.close();
process.exit(0);
