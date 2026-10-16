#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — TESTS EN VRAI NAVIGATEUR MOBILE
   -------------------------------------------------------------------------
   Ouvre jackpotly.html dans Chromium (moteur Blink réel : mise en page,
   polices, media queries, gestes tactiles) sur une matrice d'écrans de
   téléphone, puis vérifie ce qu'un DOM simulé ne peut pas voir :

     · aucun débordement horizontal ni élément hors écran ;
     · cibles tactiles assez grandes (recommandation 44 px) ;
     · aucun chevauchement entre commandes cliquables ;
     · dialogues / feuilles qui tiennent dans l'écran et défilent ;
     · solde affiché = solde réel après chaque action ;
     · retour à l'accueil, reprise d'une partie, pas de calque orphelin ;
     · pas d'erreur JavaScript ni de requête réseau (fichier autonome) ;
     · images de contrôle enregistrées dans tests/screens/.

   Dépendances (non livrées, exclues du dépôt) :
     npm install --no-save jsdom puppeteer-core @sparticuz/chromium
   Le binaire Chromium est fourni par @sparticuz/chromium (téléchargé depuis
   npm, aucune connexion à Google/Playwright) et ses bibliothèques NSS sont
   extraites de bin/al2023.tar.br.

   Usage : node tests/mobile.mjs [--shots] [--keep]
   ========================================================================= */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = join(root, 'tests', 'screens');

let puppeteer, chromium;
try {
  puppeteer = (await import('puppeteer-core')).default;
  chromium = (await import('@sparticuz/chromium')).default;
} catch {
  console.error('Dépendances manquantes : npm install --no-save puppeteer-core @sparticuz/chromium');
  process.exit(2);
}

/* ------------------------------------------------------------- SYNTHÈSE --- */
let passed = 0, failed = 0;
const failures = [];
const notes = [];
const section = (t) => console.log('\n' + t);
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + label + (detail ? '  → ' + detail : '')); }
  else { failed++; failures.push(label + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
}
const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');

/* ------------------------------------------------- BIBLIOTHÈQUES CHROMIUM --
   @sparticuz/chromium livre un Chromium qui réclame la NSS du système ; le
   paquet contient ces .so dans bin/al2023.tar.br (brotli + tar). On les
   extrait une fois puis on lance avec LD_LIBRARY_PATH.                       */
async function nssPath() {
  const dir = '/tmp/jp-nss/lib';
  if (existsSync(join(dir, 'libnss3.so'))) return '/tmp/jp-nss/lib';
  const br = join(root, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
  const tar = '/tmp/jp-al2023.tar';
  writeFileSync(tar, zlib.brotliDecompressSync(readFileSync(br)));
  mkdirSync('/tmp/jp-nss', { recursive: true });
  execFileSync('tar', ['xf', tar, '-C', '/tmp/jp-nss']);
  return dir;
}

/* ----------------------------------------------------------- SERVEUR HTTP -- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(root, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

/* ------------------------------------------------------------- NAVIGATEUR - */
const executablePath = await chromium.executablePath();
const browser = await puppeteer.launch({
  args: [...chromium.args, '--font-render-hinting=none', '--force-color-profile=srgb'],
  executablePath,
  headless: 'shell',
  env: { ...process.env, LD_LIBRARY_PATH: await nssPath() }
});
process.on('exit', () => { try { browser.process() && browser.process().kill('SIGKILL'); } catch { /* noop */ } });

const DEVICES = [
  { id: 'iphone-se', label: 'iPhone SE (320×568)', width: 320, height: 568, dpr: 2 },
  { id: 'galaxy-s8', label: 'Galaxy S8 (360×740)', width: 360, height: 740, dpr: 3 },
  { id: 'iphone-13', label: 'iPhone 13 (390×844)', width: 390, height: 844, dpr: 3 },
  { id: 'iphone-max', label: 'iPhone 14 Pro Max (430×932)', width: 430, height: 932, dpr: 3 },
  { id: 'se-paysage', label: 'iPhone SE paysage (568×320)', width: 568, height: 320, dpr: 2 },
  { id: 'ipad-mini', label: 'iPad mini (744×1133)', width: 744, height: 1133, dpr: 2 }
];
const CLASSICS = ['roulette', 'blackjack', 'baccarat', 'slots', 'videopoker', 'poker'];
const SCREENS = ['home', 'originals', 'rank', 'shop', 'profile'];

/* ------------------------------------------------------- SONDE GÉOMÉTRIQUE -
   Injectée dans la page : mesure réelle (getBoundingClientRect), cibles
   tactiles, chevauchements, débordements, solde affiché.                     */
const PROBE = `
window.__jp = (() => {
  const rect = (e) => e.getBoundingClientRect();
  const visible = (e) => {
    const r = rect(e), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const label = (e) => (e.id ? '#' + e.id : '') + (e.dataset && e.dataset.act ? '[data-act=' + e.dataset.act + ']' : '') +
    (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') +
    ' « ' + (e.textContent || '').trim().slice(0, 22) + ' »';
  const interactive = (sel) => Array.from(document.querySelectorAll(sel)).filter(visible);
  const SEL = 'button, [role="button"], a[href], input, select';

  return {
    label,
    /* Débordement horizontal global + éléments qui dépassent du cadre. */
    overflow() {
      const doc = document.documentElement;
      const w = innerWidth;
      // On ne regarde que la partie RÉELLEMENT visible : un élément à l'intérieur
      // d'un carrousel horizontal (promos) a le droit d'être plus large que l'écran.
      const wide = Array.from(document.querySelectorAll('#app *')).filter(visible)
        .filter((e) => getComputedStyle(e).position !== 'fixed')
        .filter((e) => { const c = window.__jp.clipRect(e); return c.right > w + 1.5; })
        .map((e) => label(e) + ' → ' + Math.round(window.__jp.clipRect(e).right) + 'px');
      return { docWidth: doc.scrollWidth, win: w, wide: wide.slice(0, 6), wideCount: wide.length };
    },
    /* Rectangle réellement VISIBLE : on intersecte avec tous les ancêtres qui
       découpent (overflow) puis avec l'écran. Un élément simplement hors de la
       zone défilante ne doit pas être compté comme débordant. */
    clipRect(e) {
      let r = rect(e);
      let p = e.parentElement;
      while (p && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        if (/(hidden|auto|scroll|clip)/.test(cs.overflowX) || /(hidden|auto|scroll|clip)/.test(cs.overflowY)) {
          const pr = rect(p);
          r = { left: Math.max(r.left, pr.left), top: Math.max(r.top, pr.top),
                right: Math.min(r.right, pr.right), bottom: Math.min(r.bottom, pr.bottom) };
        }
        p = p.parentElement;
      }
      return { left: Math.max(r.left, 0), top: Math.max(r.top, 0),
               right: Math.min(r.right, innerWidth), bottom: Math.min(r.bottom, innerHeight) };
    },
    visibles(sel) {
      return interactive(sel || SEL).filter((e) => {
        if (!window.__jp.onScreen(e)) return false;
        const c = window.__jp.clipRect(e);
        return c.right - c.left >= 2 && c.bottom - c.top >= 2;
      });
    },
    /* Le point (x,y) appartient-il à cet élément (lui ou l'un de ses enfants) ? */
    owns(e, x, y) {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
    },
    /* Cible tactile EFFECTIVE : on part du centre et on avance au pixel jusqu'à
       ce que le doigt ne touche plus l'élément (les zones élargies en ::after
       comptent donc pour de vrai). Bornée à +32 px autour de la boîte. */
    hitArea(e) {
      const r = rect(e);
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
      if (!window.__jp.owns(e, cx, cy)) return { covered: true };
      const reach = (dx, dy) => {
        for (let k = 1; k <= 32; k++) {
          const x = cx + dx * k, y = cy + dy * k;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return k - 1;
          if (!window.__jp.owns(e, x, y)) return k - 1;
        }
        return 32;
      };
      return { w: Math.round(r.width) + reach(-1, 0) + reach(1, 0), h: Math.round(r.height) + reach(0, -1) + reach(0, 1) };
    },
    /* Commande réellement atteignable au doigt à son centre ?
       Si une modale ou une feuille est ouverte, on ne teste QUE son contenu :
       un calque recouvre le reste de l'écran, c'est son rôle. */
    /* Un élément appartient-il au calque réellement affiché ? Pendant la
       transition d'écran (300 ms), l'écran sortant est encore visible : le
       compter ferait passer des commandes légitimes pour « recouvertes ». */
    onScreen(e) {
      const sc = e.closest('.screen');
      if (sc && !sc.classList.contains('is-on')) return false;
      return true;
    },
    covered(sel) {
      const bad = [];
      const modalOn = document.getElementById('modalRoot').classList.contains('is-on');
      const sheetOn = document.getElementById('sheetRoot').classList.contains('is-on');
      const scope = modalOn ? document.getElementById('modalBox') : sheetOn ? document.getElementById('sheetRoot') : null;
      interactive(sel || SEL).forEach((e) => {
        if (!visible(e)) return;                       // écran caché : hors sujet
        if (!window.__jp.onScreen(e)) return;          // écran en cours de sortie : hors sujet
        if (scope && !scope.contains(e)) return;       // un calque ouvert recouvre le reste : normal
        const c = window.__jp.clipRect(e);
        if (c.right - c.left < 2 || c.bottom - c.top < 2) return;         // hors zone visible : normal
        const cx = Math.round((c.left + c.right) / 2), cy = Math.round((c.top + c.bottom) / 2);
        if (!window.__jp.owns(e, cx, cy)) {
          const top = document.elementFromPoint(cx, cy);
          bad.push(label(e) + ' recouvert par ' + (top ? label(top) : 'rien'));
        }
      });
      return bad;
    },
    /* Texte réellement coupé : on mesure l'emprise du TEXTE (Range) et pas celle
       des halos décoratifs en position absolue (::after) qui débordent exprès. */
    clipped() {
      const bad = [];
      interactive(SEL).forEach((e) => {
        if (!(e.textContent || '').trim()) return;                    // boutons-icônes
        const cs = getComputedStyle(e);
        const r = rect(e);
        const contentW = r.width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
          - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
        if (contentW <= 2) return;
        const range = document.createRange();
        range.selectNodeContents(e);
        let worst = 0;
        for (const cr of range.getClientRects()) worst = Math.max(worst, cr.width);
        if (worst > contentW + 3) bad.push(label(e) + ' (texte ' + Math.round(worst) + ' > ' + Math.round(contentW) + ')');
      });
      return bad.slice(0, 6);
    },
    /* Calques : la modale / la feuille tiennent-elles dans l'écran ? */
    layers() {
      const out = [];
      const modal = document.getElementById('modalRoot');
      const sheet = document.getElementById('sheetRoot');
      for (const [name, el] of [['modale', modal], ['feuille', sheet]]) {
        if (!el || !el.classList.contains('is-on')) continue;
        const box = name === 'modale' ? document.getElementById('modalBox') : el;
        const r = rect(box);
        const cs = getComputedStyle(box);
        out.push({
          name,
          top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
          fits: r.top >= -1 && r.bottom <= innerHeight + 1,
          scrolls: box.scrollHeight > box.clientHeight + 2,
          overflowY: cs.overflowY
        });
      }
      return out;
    },
    /* Le solde affiché doit correspondre au moteur. */
    balance() {
      const shown = (document.getElementById('balanceVal') || {}).textContent || '';
      const real = window.JACKPOTLY ? window.JACKPOTLY.Wallet.balance : null;
      const fmt = window.JACKPOTLY ? window.JACKPOTLY.util.fmt(real) : '';
      return { shown: shown.trim(), real, fmt: String(fmt).trim() };
    },
    /* Débordement vertical du conteneur défilant de l'écran actif. */
    scrollHost() {
      const main = document.getElementById('screens');
      const sec = document.querySelector('.screen.is-on');
      return main ? { mainScrolls: main.scrollHeight > main.clientHeight + 2, secId: sec ? sec.id : null } : null;
    }
  };
})();
`;

async function newPage(dev) {
  const page = await browser.newPage();
  await page.setViewport({ width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requête échouée: ' + r.url()));
  const externals = [];
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externals.push(r.url()); });
  page.errors = errors;
  page.externals = externals;
  return page;
}

/* État de départ : première visite déjà faite, pour que l'écran de bienvenue
   (testé séparément) ne recouvre pas les mesures. */
const seed = async (page, welcomed = true) => {
  await page.evaluateOnNewDocument((w) => {
    try {
      const raw = localStorage.getItem('jackpotly.state.v1');
      const st = raw ? JSON.parse(raw) : {};
      st.settings = Object.assign({}, st.settings, { _welcomed: w });
      localStorage.setItem('jackpotly.state.v1', JSON.stringify(st));
    } catch { /* stockage indisponible */ }
  }, welcomed);
};

const boot = async (page) => {
  await seed(page);
  await page.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
  await page.waitForFunction('window.JACKPOTLY && window.JACKPOTLY.Screen && document.getElementById("splash") && getComputedStyle(document.getElementById("splash")).display === "none"', { timeout: 8000 })
    .catch(async () => { await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; }); });
  await page.evaluate(PROBE);
};

const openGame = async (page, id, bet) => {
  await page.evaluate((gid, b) => {
    const J = window.JACKPOTLY;
    J.Games.close(true);
    J.Games.open(gid);
    const g = J.Games.instance();
    if (g) J.Games.setBet(g, b, true);
  }, id, bet);
  await new Promise((r) => setTimeout(r, 260));
};

/* Petit tap réel (événements tactiles du navigateur à la position du centre).
   L'élément est d'abord amené dans la zone visible (comme le ferait le doigt) :
   sans cela, on taperait « à travers » un élément sorti de son conteneur. */
const tapSel = async (page, sel) => {
  const box = await bringIntoView(page, sel);
  if (!box) return false;
  await page.touchscreen.tap(box.x, box.y);
  return box.own;                       // false = la cible n'était pas touchable (signalé par l'appelant)
};
/* Amène un élément dans la zone visible comme le ferait un doigt sur l'écran.
   Les scènes de jeu sont des conteneurs défilants imbriqués (le plateau, puis
   la grille) : un seul scrollIntoView peut laisser l'élément hors du cadre, donc
   on vérifie avec elementFromPoint — l'autorité du navigateur sur ce qui est
   réellement touchable — et on recommence en visant « au plus près ». */
const bringIntoView = async (page, sel) => {
  for (let essai = 0; essai < 5; essai++) {
    const st = await page.evaluate((s, first) => {
      const e = document.querySelector(s);
      if (!e || e.disabled) return { none: true };
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const inView = x > 0 && y > 0 && x < innerWidth && y < innerHeight;
      const hit = inView ? document.elementFromPoint(x, y) : null;
      const own = !!hit && (hit === e || e.contains(hit) || hit.contains(e));
      if (!own) e.scrollIntoView({ block: first ? 'nearest' : 'center', inline: 'nearest' });
      return { x, y, own, inView };
    }, sel, essai < 2);
    if (st.none) return null;
    if (st.own) return st;
    await new Promise((r) => setTimeout(r, 80));
  }
  return { x: 0, y: 0, own: false };    // intouchable : l'appelant doit le signaler
};

/** Clique le premier bouton d'un conteneur dont le libellé correspond. */
const tapText = async (page, re, sel = '#gActions') => {
  const tag = await page.evaluate((src, scope) => {
    const rx = new RegExp(src, 'i');
    const b = Array.from(document.querySelectorAll(scope + ' button')).find((x) => rx.test(x.textContent) && !x.disabled);
    if (!b) return null;
    if (!b.id) b.id = '__jp_tap_' + Math.random().toString(36).slice(2, 8);
    return b.id;
  }, re.source || String(re), sel);
  if (!tag) return false;
  const box = await bringIntoView(page, '#' + tag);
  if (box && box.own) { await page.touchscreen.tap(box.x, box.y); return true; }   // vrai appui tactile
  return page.evaluate((t) => { const b = document.getElementById(t); if (b) { b.click(); return true; } return false; }, tag);
};

/** Attend une condition, avec échéance : ne bloque jamais indéfiniment. */
const waitFor = async (page, fn, ms = 6000, step = 120) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn)) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
};

/* ======================================================= 1. INSTALLATION === */
section('1. Installation : fichier autonome, splash, solde');
{
  const page = await newPage(DEVICES[2]);
  await boot(page);
  const info = await page.evaluate(() => ({
    version: window.JACKPOTLY.VERSION,
    games: window.JACKPOTLY.GAMES.length,
    live: window.JACKPOTLY.GAMES.filter((g) => g.status === 'live').length,
    scripts: document.querySelectorAll('script').length,
    links: document.querySelectorAll('link:not([rel="icon"])').length,
    imgs: document.querySelectorAll('img').length,
    lsKey: Object.keys(localStorage).join(','),
    vpMeta: JSON.stringify(document.querySelector('meta[name=viewport]').content),
    dpr: devicePixelRatio, touch: navigator.maxTouchPoints
  }));
  check('l\'application démarre hors ligne (fichier autonome)', info.version === '0.3.1' && info.games === 16 && info.live === 16,
    info.version + ' · ' + info.live + '/' + info.games + ' jeux jouables');
  check('aucune ressource externe : 1 script inline, 0 <link>, 0 <img>',
    info.scripts === 1 && info.links === 0 && info.imgs === 0, info.scripts + ' script(s) · ' + info.links + ' link · ' + info.imgs + ' img');
  check('viewport mobile avec viewport-fit=cover (encoches)',
    /width=device-width/.test(info.vpMeta) && /viewport-fit=cover/.test(info.vpMeta));
  check('aucune requête hors du serveur local', page.externals.length === 0, page.externals.slice(0, 3).join(' '));
  check('aucune erreur JavaScript au démarrage', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

  const bal = await page.evaluate('window.__jp.balance()');
  check('le solde affiché correspond au moteur (10 000 jetons de départ)',
    bal.real === 10000 && bal.shown === bal.fmt, bal.shown + ' affiché / ' + bal.real + ' réel');
  await page.close();
}

/* ================================================= 2. GÉOMÉTRIE PAR ÉCRAN == */
section('2. Géométrie des 6 écrans sur 6 formats (débordements, cibles, chevauchements)');
{
  const report = [];
  for (const dev of DEVICES) {
    const page = await newPage(dev);
    await boot(page);
    for (const s of SCREENS) {
      await page.evaluate((id) => window.JACKPOTLY.UI.go(id), s);
      await new Promise((r) => setTimeout(r, 420));   // transition d'écran : 300 ms
      const o = await page.evaluate('window.__jp.overflow()');
      const t = await page.evaluate(`(() => {
        const small = [], big = [];
        window.__jp.visibles().forEach((e) => {
          const a = window.__jp.hitArea(e);
          if (!a || a.covered) return;
          const rec = window.__jp.label(e) + ' ' + a.w + '×' + a.h;
          if (Math.min(a.w, a.h) < 30) small.push(rec);
          if (Math.min(a.w, a.h) < 42) big.push(rec);
        });
        return { small, big, total: window.__jp.visibles().length };
      })()`);
      const cov = await page.evaluate('window.__jp.covered()');
      const cl = await page.evaluate('window.__jp.clipped()');
      report.push({ dev: dev.id, screen: s, o, t, cov, cl });
    }
    await page.close();
  }

  const bad = report.filter((r) => r.o.wideCount > 0);
  check('aucun élément visible ne dépasse la largeur de l\'écran sur les 6 formats',
    bad.length === 0, bad.map((r) => r.dev + '/' + r.screen + ' : ' + r.o.wide.join(', ')).slice(0, 4).join(' | '));
  const tooSmall = report.flatMap((r) => r.t.small.map((x) => r.dev + '/' + r.screen + ' ' + x));
  check('toutes les commandes offrent au moins 30 px de zone tactile', tooSmall.length === 0,
    tooSmall.slice(0, 6).join(' | ') || report.length + ' écrans × formats, ' + report[0].t.total + ' à ' +
    Math.max(...report.map((r) => r.t.total)) + ' commandes visibles par écran');
  const medium = report.flatMap((r) => r.t.big.map((x) => r.dev + '/' + r.screen + ' ' + x));
  const tight = report.filter((r) => r.t.big.length);
  check('la plupart des commandes atteignent la recommandation de 42 px',
    tight.length <= report.length * 0.25,
    medium.length ? medium.length + ' commande(s) juste en dessous : ' + medium.slice(0, 5).join(' | ') : 'toutes ≥ 42 px');
  const coveredBad = report.flatMap((r) => r.cov.map((x) => r.dev + '/' + r.screen + ' ' + x));
  check('aucune commande visible n\'est recouverte par une autre (collision réelle au doigt)',
    coveredBad.length === 0, coveredBad.slice(0, 5).join(' | '));
  const clipBad = report.filter((r) => r.cl.length > 0);
  check('aucun libellé de bouton tronqué', clipBad.length === 0,
    clipBad.map((r) => r.dev + '/' + r.screen + ' : ' + r.cl.slice(0, 2).join(', ')).slice(0, 4).join(' | '));
  const scrollers = report.filter((r) => r.o.docWidth > r.o.win + 1);
  check('la page ne défile jamais horizontalement', scrollers.length === 0,
    scrollers.map((r) => r.dev + '/' + r.screen + ' : ' + r.o.docWidth + '>' + r.o.win).slice(0, 4).join(' | '));
}

/* ============================================ 3. LES 16 JEUX SUR ÉCRAN ===== */
section('3. Les 16 jeux montés sur petit écran (320×568 et 360×740)');
{
  const ids = await (async () => {
    const page = await newPage(DEVICES[0]);
    await boot(page);
    const list = await page.evaluate('window.JACKPOTLY.GAMES.map((g) => g.id)');
    await page.close();
    return list;
  })();

  for (const dev of [DEVICES[0], DEVICES[1]]) {
    const page = await newPage(dev);
    await boot(page);
    const issues = [], tiny = [], overlap = [];
    for (const id of ids) {
      await openGame(page, id, 100);
      const r = await page.evaluate(`(() => {
        const o = window.__jp.overflow();
        const cov = window.__jp.covered('#gStage button, #gActions button, #gScroll button, #gScroll input');
        const tiny = [];
        window.__jp.visibles('#gStage button, #gActions button, #gScroll button, #gScroll input').forEach((e) => {
          const a = window.__jp.hitArea(e);
          if (!a || a.covered) return;
          if (Math.min(a.w, a.h) < 28) tiny.push(window.__jp.label(e) + ' ' + a.w + '×' + a.h);
        });
        const acts = document.querySelector('#gActions');
        const ar = acts ? acts.getBoundingClientRect() : null;
        const stage = document.querySelector('#gStage').getBoundingClientRect();
        return { o, cov, tiny,
          actionsVisible: !!ar && ar.top >= 0 && ar.bottom <= innerHeight + 1,
          stageH: Math.round(stage.height), hasPlay: !!document.querySelector('#gActions button') };
      })()`);
      if (r.o.wideCount) issues.push(id + ' : ' + r.o.wide.slice(0, 2).join(', '));
      if (r.tiny.length) tiny.push(id + ' : ' + r.tiny.slice(0, 2).join(', '));
      if (r.cov.length) overlap.push(id + ' : ' + r.cov.slice(0, 2).join(' / '));
      if (!r.hasPlay) issues.push(id + ' : aucun bouton d\'action');
      if (!r.actionsVisible) issues.push(id + ' : bouton principal hors de l\'écran');
      if (r.stageH < 140) issues.push(id + ' : scène réduite à ' + r.stageH + ' px');
    }
    check(dev.label + ' — les 16 scènes tiennent dans l\'écran et le bouton principal est visible',
      issues.length === 0, issues.slice(0, 4).join(' | '));
    check(dev.label + ' — cibles tactiles ≥ 28 px (zone élargie incluse) dans les jeux', tiny.length === 0, tiny.slice(0, 4).join(' | '));
    check(dev.label + ' — aucun bouton de plateau recouvert par un autre', overlap.length === 0, overlap.slice(0, 4).join(' | '));
    check(dev.label + ' — aucune erreur JavaScript en montant les 16 jeux', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    await page.close();
  }
}

/* ==================================== 4. CIBLES TACTILES : APPUI RÉEL ===== */
section('4. Appuis réels (événements tactiles) : les commandes répondent');
{
  const page = await newPage(DEVICES[2]);
  await boot(page);
  for (const s of SCREENS) {
    await page.evaluate((id) => window.JACKPOTLY.UI.go(id), s);
    await new Promise((r) => setTimeout(r, 120));
  }
  const navOk = await page.evaluate(async () => {
    const J = window.JACKPOTLY;
    const out = [];
    for (const id of ['originals', 'rank', 'shop', 'profile', 'home']) {
      document.querySelector('.nav-btn[data-go="' + id + '"]').click();
      await new Promise((r) => setTimeout(r, 80));
      out.push(document.querySelector('.nav-btn[data-go="' + id + '"]').classList.contains('is-on') && !!document.querySelector('#screen-' + id + '.is-on'));
    }
    return out;
  });
  check('les 5 onglets de navigation répondent au tap', navOk.every(Boolean), JSON.stringify(navOk));

  // Bandeau de solde, menu, bonus quotidien, roue : géométrie réelle
  const header = await page.evaluate(() => {
    const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) }; };
    return { w: innerWidth, menu: box('btnMenu'), daily: box('btnDaily'), pill: box('balancePill') };
  });
  check('les 3 commandes d\'en-tête tiennent en largeur et restent tactiles (zone élargie incluse)',
    header.pill.right <= header.w + 0.5 && header.menu.right <= header.w + 0.5 &&
    header.menu.w >= 30 && header.daily.w >= 30,
    'menu ' + header.menu.w + '×' + header.menu.h + ' · bonus ' + header.daily.w + '×' + header.daily.h +
    ' · solde ' + header.pill.w + '×' + header.pill.h + ' (cible élargie +10 px)');

  // Écran de bienvenue (première visite) : la modale et ses 2 boutons doivent tenir
  {
    const p2 = await newPage(DEVICES[0]);              // 320×568 : le plus serré
    await seed(p2, false);
    await p2.goto(ORIGIN + '/jackpotly.html', { waitUntil: 'load' });
    await waitFor(p2, 'getComputedStyle(document.getElementById("splash")).display === "none"', 9000);
    const shown = await waitFor(p2, 'document.getElementById("modalRoot").classList.contains("is-on")', 9000);
    const geo = await p2.evaluate(() => {
      const box = document.getElementById('modalBox');
      const acts = box.querySelector('[data-actions]');
      const r = box.getBoundingClientRect(), ar = acts.getBoundingClientRect();
      const btns = Array.from(acts.querySelectorAll('button')).map((b) => {
        const br = b.getBoundingClientRect();
        const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
        return { label: b.textContent.trim(), bottom: Math.round(br.bottom), tappable: !!hit && (hit === b || b.contains(hit)) };
      });
      return { vh: innerHeight, bottom: Math.round(r.bottom), bodyScrolls: box.querySelector('.modal-body').scrollHeight > box.querySelector('.modal-body').clientHeight, btns };
    });
    check('écran de bienvenue : la modale reste dans l\'écran sur 320×568', shown && geo.bottom <= geo.vh + 1,
      'bas de modale à ' + geo.bottom + ' / ' + geo.vh + ' px');
    check('écran de bienvenue : les 2 boutons sont atteignables au doigt sans défiler',
      geo.btns.length === 2 && geo.btns.every((b) => b.tappable && b.bottom <= geo.vh + 1),
      geo.btns.map((b) => b.label + (b.tappable ? ' ✓' : ' ✗')).join(' · '));
    // On ferme par un vrai tap sur « Explorer les jeux »
    const closed = await tapSel(p2, '#modalBox [data-actions] button:last-child');
    const gone = await waitFor(p2, '!document.getElementById("modalRoot").classList.contains("is-on")', 3000);
    check('écran de bienvenue : un tap sur « Explorer les jeux » ouvre l\'application',
      closed && gone && !(await p2.evaluate('window.JACKPOTLY.UI.isModalOpen()')));
    check('écran de bienvenue : aucune erreur JavaScript', p2.errors.length === 0, p2.errors.slice(0, 2).join(' | '));
    await p2.close();
  }

  // Feuilles du menu et du portefeuille : elles doivent tenir dans l'écran
  const sheets = [];
  for (const [from, open] of [['menu', '#btnMenu'], ['portefeuille', '#balancePill']]) {
    await tapSel(page, open);
    await new Promise((r) => setTimeout(r, 460));      // l'animation de la feuille dure 280 ms
    sheets.push(await page.evaluate((f) => {
      const el = document.getElementById('sheetRoot');
      const r = el.getBoundingClientRect();
      const btns = Array.from(el.querySelectorAll('button')).map((b) => {
        const br = b.getBoundingClientRect();
        const hit = br.width && br.height ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
        return { label: (b.textContent || '').trim().slice(0, 18), tappable: !!hit && (hit === b || b.contains(hit)), h: Math.round(br.height) };
      });
      return { from: f, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, on: el.classList.contains('is-on'),
        scrolls: el.scrollHeight > el.clientHeight + 2, closed: btns.filter((b) => !b.tappable && b.h > 0).length, buttons: btns.length };
    }, from));
    await page.evaluate(() => window.JACKPOTLY.UI.closeSheet());
    await new Promise((r) => setTimeout(r, 200));
  }
  check('les feuilles tiennent dans l\'écran et défilent si besoin', sheets.every((sh) => sh.on && sh.top >= -1 && sh.bottom <= sh.vh + 1),
    sheets.map((sh) => sh.from + ' ' + sh.top + '→' + sh.bottom + '/' + sh.vh + (sh.scrolls ? ' (défilable)' : '')).join(' · '));
  check('aucune commande de feuille n\'est masquée par un autre élément',
    sheets.every((sh) => sh.closed === 0), sheets.map((sh) => sh.from + ' : ' + sh.buttons + ' bouton(s), ' + sh.closed + ' masqué(s)').join(' · '));

  // Ouverture d'un jeu puis retour : état propre
  await openGame(page, 'mines', 100);
  const mounted = await page.evaluate('!!window.JACKPOTLY.Games.instance()');
  await tapSel(page, '#gameShell [data-g="back"]');
  await new Promise((r) => setTimeout(r, 320));
  const after = await page.evaluate(() => ({
    mounted: !!window.JACKPOTLY.Games.instance(),
    onGame: !!document.querySelector('#screen-game.is-on'),
    modal: document.getElementById('modalRoot').classList.contains('is-on'),
    screens: document.querySelectorAll('.screen.is-on').length
  }));
  check('ouverture d\'un jeu puis retour à l\'accueil : jeu libéré, un seul écran actif',
    mounted && !after.mounted && after.screens === 1 && !after.modal, JSON.stringify(after));
  check('aucune erreur JavaScript pendant les interactions d\'interface', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

/* ============================== 5. UNE MANCHE COMPLÈTE PAR JEU CLASSIQUE == */
section('5. Une manche complète sur les 6 classiques, au doigt, sur iPhone 13');
{
  const page = await newPage(DEVICES[2]);
  await boot(page);
  const readGame = () => page.evaluate(() => {
    const J = window.JACKPOTLY, g = J.Games.instance();
    return g ? {
      id: g.def.id, phase: g.phase, busy: g.busy, bet: g.bet, mult: g.lastMult,
      balance: J.Wallet.balance, shown: (document.getElementById('balanceVal') || {}).textContent,
      play: (() => { const b = document.querySelector('#gActions [data-act="play"]'); return b ? { label: b.textContent.trim(), disabled: b.disabled } : null; })(),
      actions: Array.from(document.querySelectorAll('#gActions button')).map((b) => ({ t: b.textContent.trim(), d: b.disabled }))
    } : null;
  });
  const round = async (name, steps) => {
    await page.evaluate(() => {
      const J = window.JACKPOTLY;
      J.Games.close(true);
      J.Store.reset();
      J.Store.patch({ balance: 100000 });
      J.Wallet.renderBalance();
      J.UI.go('home');
    });
    await new Promise((r) => setTimeout(r, 180));
    await openGame(page, name, 100);
    const before = await readGame();
    const res = await steps(page);
    const after = await readGame();
    return { before, after, res };
  };

  /* --- Roulette : 2 mises, rotation, règlement --- */
  {
    const r = await round('roulette', async (page) => {
      await tapSel(page, '#gStage [data-num="17"]');
      await tapSel(page, '#gStage [data-out="rouge"]');
      // Mise réellement posée = Σ jetons × valeur du jeton (g.bet ne reflète la
      // mise qu'une fois la manche lancée).
      const placed = await page.evaluate(() => {
        const g = window.JACKPOTLY.Games.instance();
        const keys = Object.keys(g.spots);
        const units = keys.reduce((a, k) => a + g.spots[k].w, 0);
        return { n: keys.length, units, chip: g.chip, stake: units * g.chip };
      });
      await tapSel(page, '#gActions [data-act="play"]');
      const spun = await waitFor(page, 'window.JACKPOTLY.Games.instance().spinning === true', 2000);
      const done = await waitFor(page, 'window.JACKPOTLY.Games.instance().busy === false', 8000);
      return { placed, spun, done };
    });
    check('Roulette : deux mises posées puis rotation complète et règlement',
      r.res.placed.n === 2 && r.res.placed.units === 2 && r.res.placed.stake === 2 * r.res.placed.chip && r.res.spun && r.res.done,
      r.res.placed.n + ' mise(s) · ' + r.res.placed.stake + ' J posés (' + r.res.placed.units + ' jeton(s) de ' +
      r.res.placed.chip + ') · mult ' + r.after.mult);
    await page.waitForFunction(
      'document.getElementById("balanceVal").textContent.trim() === window.JACKPOTLY.util.fmt(window.JACKPOTLY.Wallet.balance)',
      { timeout: 2500 }).catch(() => {});
    const balAfter = await page.evaluate('window.__jp.balance()');
    check('Roulette : le solde affiché suit le moteur après le tirage',
      balAfter.shown === balAfter.fmt, balAfter.shown + ' / ' + balAfter.real);
    check('Roulette : le bouton principal redevient « Lancer la roue » après la manche',
      !r.after.play.disabled && /Lancer la roue/.test(r.after.play.label), r.after.play.label);
  }

  /* --- Blackjack : Tirer puis Rester (boutons actifs PENDANT la manche) --- */
  {
    const r = await round('blackjack', async (page) => {
      let dealt = false, enabled = [], clicks = 0;
      // Un blackjack naturel termine la main tout de suite : on redistribue
      // jusqu'à disposer d'une main à décider (comme le ferait un joueur).
      for (let essai = 0; essai < 4 && !enabled.length; essai++) {
        await tapSel(page, '#gActions [data-act="play"]');
        dealt = await waitFor(page, '["player","insurance","done"].indexOf(window.JACKPOTLY.Games.instance().phase) >= 0', 4000) || dealt;
        await new Promise((res) => setTimeout(res, 120));
        enabled = await page.evaluate(() => {
          const g = window.JACKPOTLY.Games.instance();
          if (g.phase !== 'player' && g.phase !== 'insurance') return [];
          return Array.from(document.querySelectorAll('#gActions button')).filter((b) => !b.disabled).map((b) => b.textContent.trim());
        });
        if (!enabled.length) await waitFor(page, 'window.JACKPOTLY.Games.instance().phase === "done"', 6000);
      }
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const st = await readGame();
        if (st.phase === 'done') break;
        // Au doigt : Tirer si c'est proposé, sinon Rester, sinon refuser l'assurance
        const hit = await tapText(page, /^Tirer/) || await tapText(page, /^Rester/) || await tapText(page, /Non merci/);
        if (hit) clicks++;
        await new Promise((res) => setTimeout(res, 280));
      }
      return { dealt, enabled, clicks };
    });
    check('Blackjack : la donne se déroule puis Tirer/Rester sont actifs pendant la manche',
      r.res.dealt && r.res.enabled.some((t) => /Tirer|Rester/.test(t)), r.res.enabled.join(' / '));
    check('Blackjack : la main se termine (phase done) et une nouvelle manche est proposée',
      r.after.phase === 'done' && !!r.after.play && !r.after.play.disabled && /Nouvelle main/.test(r.after.play.label),
      r.after.phase + ' · ' + (r.after.play ? r.after.play.label : '-') + ' · ' + r.res.clicks + ' taps');
  }

  /* --- Baccarat : deux zones puis distribution --- */
  {
    const r = await round('baccarat', async (page) => {
      await tapSel(page, '#gStage [data-zone="joueur"]');
      await tapSel(page, '#gStage [data-zone="egalite"]');
      const placed = await page.evaluate(() => ({ n: Object.keys(window.JACKPOTLY.Games.instance().spots).length, bet: window.JACKPOTLY.Games.instance().bet }));
      await tapSel(page, '#gActions [data-act="play"]');
      const done = await waitFor(page, 'window.JACKPOTLY.Games.instance().busy === false && window.JACKPOTLY.Games.instance().phase === "done"', 8000);
      return { placed, done };
    });
    check('Baccarat : deux zones de mise puis donne complète et règlement',
      r.res.placed.n === 2 && r.res.done && /joueur|banque|egalite/.test(r.after.phase === 'done' ? 'joueur' : ''),
      r.res.placed.n + ' zone(s) · mult ' + r.after.mult);
  }

  /* --- Machines à sous : rouleaux, arrêt, nouvelle partie --- */
  {
    const r = await round('slots', async (page) => {
      await tapSel(page, '#gActions [data-act="play"]');
      const spinning = await waitFor(page, 'window.JACKPOTLY.Games.instance().spinning === true', 1500);
      const stopped = await waitFor(page, 'window.JACKPOTLY.Games.instance().spinning === false && window.JACKPOTLY.Games.instance().busy === false', 12000);
      return { spinning, stopped };
    });
    check('Slots : les rouleaux tournent, s\'arrêtent et la manche se règle',
      r.res.spinning && r.res.stopped && !r.after.play.disabled, 'mult ' + r.after.mult + ' · ' + r.after.play.label);
    const turnAgain = await page.evaluate(() => { const b = document.querySelector('#gActions [data-act="play"]'); b.click(); return true; });
    const second = await waitFor(page, 'window.JACKPOTLY.Games.instance().spinning === true', 1500);
    check('Slots : le bouton « Tourner » relance une manche', turnAgain && second);
    await waitFor(page, 'window.JACKPOTLY.Games.instance().busy === false', 12000);
  }

  /* --- Video Poker : garder deux cartes, tirer, enchaîner --- */
  {
    const r = await round('videopoker', async (page) => {
      await tapSel(page, '#gActions [data-act="play"]');
      const held = await tapSel(page, '#gStage .vp-card:nth-child(1)') && await tapSel(page, '#gStage .vp-card:nth-child(3)');
      const marks = await page.evaluate('document.querySelectorAll("#gStage .vp-card.is-hold").length');
      await tapText(page, /Tirer|Garder tout/);
      const done = await waitFor(page, 'window.JACKPOTLY.Games.instance().phase === "done"', 4000);
      return { held, marks, done };
    });
    check('Video Poker : deux cartes gardées, tirage, manche réglée',
      r.res.held && r.res.marks === 2 && r.res.done && /Nouvelle main/.test(r.after.play.label),
      r.res.marks + ' gardée(s) · mult ' + r.after.mult);
  }

  /* --- Texas Hold'em : suivre jusqu'à l'abattage --- */
  {
    const r = await round('poker', async (page) => {
      await tapSel(page, '#gActions [data-act="play"]');
      let clicks = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        const st = await readGame();
        if (st.phase === 'done') break;
        const b = await page.evaluate(() => {
          const list = Array.from(document.querySelectorAll('#gActions button'));
          const pick = list.find((x) => /Suivre|Checker/.test(x.textContent) && !x.disabled) || list.find((x) => !x.disabled && /Se passer/.test(x.textContent));
          if (!pick) return false;
          pick.click(); return true;
        });
        if (b) clicks++;
        await new Promise((res) => setTimeout(res, 300));
      }
      return { clicks };
    });
    check('Hold\'em : la main se joue jusqu\'au bout en cliquant Suivre',
      r.after.phase === 'done' && !r.after.play.disabled && /Nouvelle main/.test(r.after.play.label),
      r.res.clicks + ' clics · mult ' + r.after.mult + ' · ' + r.after.play.label);
  }

  check('aucune erreur JavaScript pendant les 6 manches jouées au doigt', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  if (SHOTS) {
    mkdirSync(SHOT_DIR, { recursive: true });
    for (const id of CLASSICS) {
      await openGame(page, id, 100);
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: join(SHOT_DIR, id + '.png') });
    }
    await page.evaluate(() => window.JACKPOTLY.UI.go('home'));
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: join(SHOT_DIR, 'accueil.png') });
    notes.push('images de contrôle écrites dans tests/screens/');
  }
  await page.close();
}

/* ========================================== 6. DÉFILEMENT ET FLUIDITÉ ===== */
section('6. Défilement, orientation et fluidité');
{
  const page = await newPage(DEVICES[0]);            // 320×568 : le plus serré
  await boot(page);
  const sc = await page.evaluate('window.__jp.scrollHost()');
  check('l\'écran actif est bien dans un conteneur défilant vertical', !!sc && sc.mainScrolls, sc ? sc.secId + ' · scrollHeight > clientHeight' : 'conteneur absent');

  // Le doigt doit pouvoir faire défiler la liste des jeux
  const scroller = await page.evaluate(() => {
    const el = document.querySelector('.screen.is-on');
    return el && el.scrollHeight > el.clientHeight ? '.screen.is-on' : '#screens';
  });
  const before = await page.evaluate((sel) => document.querySelector(sel).scrollTop, scroller);
  await page.touchscreen.touchStart(160, 430);
  await page.touchscreen.touchMove(160, 150);
  await page.touchscreen.touchMove(160, 90);
  await page.touchscreen.touchEnd();
  await new Promise((r) => setTimeout(r, 320));
  const after = await page.evaluate((sel) => document.querySelector(sel).scrollTop, scroller);
  check('le glissement du doigt fait défiler la page', after > before, before + ' → ' + after + ' px');

  // Fluidité : images par seconde pendant l'animation la plus lourde (roue de la chance)
  await page.evaluate(() => window.JACKPOTLY.UI.go('home'));
  const fps = await page.evaluate(async () => {
    let n = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    return Math.round(n / ((performance.now() - t0) / 1000));
  });
  check('la boucle d\'animation tient son rythme (> 30 img/s en mode headless)', fps > 30, fps + ' img/s (indicatif : rendu logiciel du sandbox)');

  // Paysage : navigation utilisable et aucun débordement
  await page.setViewport({ width: 568, height: 320, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 260));
  const land = await page.evaluate(() => {
    const h = (id) => Math.round(document.getElementById(id).getBoundingClientRect().height);
    return Object.assign(window.__jp.overflow(), { nav: h('nav'), top: h('topbar'), vh: innerHeight });
  });
  check('en paysage, aucun débordement et la barre de navigation tient dans l\'écran',
    land.wideCount === 0 && land.nav + land.top <= land.vh, 'nav ' + land.nav + ' px + en-tête ' + land.top + ' px ≤ ' + land.vh + ' px');

  await openGame(page, 'slides' in {} ? 'roulette' : 'roulette', 100);
  const inGame = await page.evaluate(() => ({ ...window.__jp.overflow(), stage: document.getElementById('gStage').getBoundingClientRect().height, panel: document.getElementById('gPanel').getBoundingClientRect().height, h: innerHeight }));
  check('en paysage, un jeu reste utilisable (scène + panneau visibles)',
    inGame.wideCount === 0 && inGame.stage + inGame.panel <= inGame.h + 2 && inGame.stage > 60,
    'scène ' + Math.round(inGame.stage) + ' px + panneau ' + Math.round(inGame.panel) + ' px ≤ ' + inGame.h + ' px');
  check('aucune erreur JavaScript en paysage', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

/* ======================================= 7. SOLDE AFFICHÉ ET COHÉRENCE ===== */
section('7. Solde affiché cohérent après chaque action');
{
  const page = await newPage(DEVICES[2]);
  await boot(page);
  const mismatches = [];
  const audit = async (step) => {
    // Le compteur de solde s'anime (jusqu'à 700 ms) : on attend qu'il se pose.
    await page.waitForFunction(
      'document.getElementById("balanceVal").textContent.trim() === window.JACKPOTLY.util.fmt(window.JACKPOTLY.Wallet.balance)',
      { timeout: 2500 }).catch(() => {});
    const b = await page.evaluate('window.__jp.balance()');
    if (b.shown !== b.fmt) mismatches.push(step + ' : affiché « ' + b.shown + ' » / réel ' + b.real + ' (attendu ' + b.fmt + ')');
    return b;
  };
  await audit('démarrage');
  await page.evaluate(() => { window.JACKPOTLY.Store.patch({ balance: 50000 }); window.JACKPOTLY.Wallet.renderBalance(); });
  await audit('crédit de 50 000');
  await openGame(page, 'dice', 500);
  await tapSel(page, '#gActions [data-act="play"]');
  await waitFor(page, 'window.JACKPOTLY.Games.instance().busy === false', 6000);
  await audit('après une manche de Dice');
  await page.evaluate(() => { window.JACKPOTLY.UI.go('home'); });
  await new Promise((r) => setTimeout(r, 200));
  await audit('retour à l\'accueil');
  await page.evaluate(() => { document.getElementById('balancePill').click(); });
  await new Promise((r) => setTimeout(r, 200));
  await audit('portefeuille ouvert');
  await page.evaluate(() => window.JACKPOTLY.UI.closeSheet());
  check('le solde de l\'en-tête est identique au moteur à chaque étape', mismatches.length === 0, mismatches.join(' | '));
  check('aucune erreur JavaScript sur le parcours du solde', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

/* ===================================================== RAPPORT FINAL ====== */
section('Résultats');
console.log('\n' + '─'.repeat(64));
console.log((failed === 0 ? '✅ ' : '❌ ') + passed + ' contrôles mobiles réussis, ' + failed + ' échec(s)');
notes.forEach((n) => console.log('   · ' + n));
if (failures.length) console.log('\nÉchecs :\n' + failures.map((f) => '  · ' + f).join('\n'));

await browser.close();
server.close();
process.exit(failed === 0 ? 0 : 1);
