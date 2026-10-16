/* Harnais jetable : capture et vérifie les célébrations de gain. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const root = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(root, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/jp-nss/lib' }
});
mkdirSync('tests/screens', { recursive: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  try {
    const st = JSON.parse(localStorage.getItem('jackpotly.state.v1') || '{}');
    st.settings = Object.assign({}, st.settings, { _welcomed: true, motion: true, sound: false });
    localStorage.setItem('jackpotly.state.v1', JSON.stringify(st));
  } catch { /* */ }
});
await page.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
await page.waitForFunction('window.JACKPOTLY && window.JACKPOTLY.FX && window.JACKPOTLY.Games');
await page.evaluate(() => { document.getElementById('splash').style.display = 'none'; JACKPOTLY.Games.open('dice'); });
await new Promise((r) => setTimeout(r, 400));

const fire = (mult, payout) => page.evaluate((m, p) => {
  const el = document.querySelector('#gStage') || document.querySelector('#gPanel');
  return window.JACKPOTLY.FX.celebrate({ mult: m, payout: p, el: el });
}, mult, payout);

const state = () => page.evaluate(() => {
  const b = document.getElementById('winBanner');
  const r = b ? b.getBoundingClientRect() : null;
  return {
    banner: !!b,
    headline: b ? b.querySelector('.wb-h').textContent : null,
    sub: b && b.querySelector('.wb-s') ? b.querySelector('.wb-s').textContent : null,
    top: r ? Math.round(r.top) : null,
    inView: r ? (r.top >= 0 && r.bottom <= innerHeight) : null,
    pulse: document.getElementById('balancePill').classList.contains('is-pulse'),
    flash: !!document.querySelector('.fx-flash'),
    overflow: document.documentElement.scrollWidth > innerWidth + 1
  };
});

for (const [mult, payout, name] of [[1.5, 150, 'petit'], [3.2, 320, 'notable'], [8.5, 850, 'bigwin'], [45, 4500, 'jackpot']]) {
  await fire(mult, payout);
  const st = await state();                       // lecture immédiate (avant la capture)
  console.log(name.padEnd(8), JSON.stringify(st));
  await page.screenshot({ path: 'tests/screens/cel-' + name + '.png' });
  await new Promise((r) => setTimeout(r, 1500));
}
console.log('erreurs :', errors.length ? errors.slice(0, 4) : 'aucune');
await browser.close();
server.close();
