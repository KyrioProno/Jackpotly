import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
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
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/jp-nss/lib' } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
await page.waitForFunction('window.JACKPOTLY && window.JACKPOTLY.UI');
await page.evaluate(() => { document.getElementById('splash').style.display = 'none'; JACKPOTLY.Games.open('dice'); });
await new Promise((r) => setTimeout(r, 400));

const probe = () => page.evaluate(() => ({
  banner: !!document.getElementById('winBanner'),
  pulse: document.getElementById('balancePill').classList.contains('is-pulse'),
  flash: !!document.querySelector('.fx-flash'),
  floats: document.querySelectorAll('.fx-float').length,
  bodyKids: Array.from(document.body.children).map((e) => e.id || e.className).slice(0, 14)
}));

console.log('avant   ', JSON.stringify(await probe()));
await page.evaluate(() => {
  const J = window.JACKPOTLY;
  const el = document.querySelector('#gStage') || document.querySelector('#gPanel');
  const r = J.FX.celebrate({ mult: 45, payout: 4500, el: el });
  window.__ret = r;
});
console.log('ret     ', await page.evaluate('window.__ret'));
for (const d of [0, 120, 300, 800, 1400, 2000]) {
  if (d) await new Promise((r) => setTimeout(r, d === 120 ? 120 : 200));
  console.log('t+' + d + 'ms ', JSON.stringify(await probe()));
}
await browser.close(); server.close();
