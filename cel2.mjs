/* Harnais jetable : diagnostic fin de la célébration (DOM créé ? retiré ?). */
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
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
await page.waitForFunction('window.JACKPOTLY && window.JACKPOTLY.FX');

console.log(await page.evaluate(() => {
  const J = window.JACKPOTLY;
  const out = {};
  out.motionBefore = J.Store.state.settings.motion;
  // 1) bandeau seul
  J.FX.banner('TEST', 'sub', 'jackpot');
  out.bannerImmediat = !!document.getElementById('winBanner');
  out.bannerCls = document.getElementById('winBanner') && document.getElementById('winBanner').className;
  out.bannerRect = (() => { const b = document.getElementById('winBanner'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), getComputedStyle(b).display, getComputedStyle(b).opacity]; })();
  // 2) pulsation du solde
  J.FX.pulseBalance(1000);
  out.pulse = document.getElementById('balancePill').classList.contains('is-pulse');
  // 3) flash
  J.FX.flash('#ffc531', 0.3);
  out.flash = !!document.querySelector('.fx-flash');
  // 4) particules
  J.FX.burst({ x: 100, y: 200, count: 20 });
  out.hasPartsApi = typeof J.FX.burst === 'function';
  // 5) floatText
  J.floatText('+1 000', { x: 100, y: 200 });
  out.floats = document.querySelectorAll('.fx-float').length;
  return out;
}, null, 1));
console.log('erreurs:', errs.slice(0, 3));
await browser.close(); server.close();
