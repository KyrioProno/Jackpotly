#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — BUILD
   Assemble le fichier unique et autonome `jackpotly.html` à partir de :
     src/00-head.html     en-tête + <style>
     src/01-styles.css    design system
     src/10-body.html     structure HTML
     src/2x..4x *.js      modules JavaScript (ordre alphabétique)
     src/99-tail.html     fermeture du document
   Aucune dépendance externe : tout est en ligne, aucune requête réseau.
   Usage : node tools/build.mjs           reconstruit le livrable
           node tools/build.mjs --check    vérifie que les fichiers livrés
                                          correspondent EXACTEMENT aux sources
                                          (aucune écriture ; sortie 1 si écart)
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const head = readFileSync(join(src, '00-head.html'), 'utf8');
/* Design system assemblé dans l'ordre des préfixes numériques : le noyau
   (01-styles) puis les couches de l'univers de casino (Royale, salles, jeux). */
const cssFiles = readdirSync(src).filter((f) => f.endsWith('.css')).sort();
if (!cssFiles.length) { console.error('Aucun CSS trouvé dans src/'); process.exit(1); }
const css = cssFiles.map((f) => '/* ===== ' + f + ' ' + '='.repeat(Math.max(0, 64 - f.length)) + ' */\n' +
  readFileSync(join(src, f), 'utf8').trimEnd()).join('\n\n');
const body = readFileSync(join(src, '10-body.html'), 'utf8');
const tail = readFileSync(join(src, '99-tail.html'), 'utf8');

/** Modules JS chargés dans l'ordre des préfixes numériques. */
const jsFiles = readdirSync(src).filter((f) => f.endsWith('.js')).sort();
if (!jsFiles.length) { console.error('Aucun module JS trouvé dans src/'); process.exit(1); }

const js = jsFiles.map((f) => {
  const code = readFileSync(join(src, f), 'utf8').trimEnd();
  return `/* ===== ${f} ${'='.repeat(Math.max(0, 64 - f.length))} */\n${code}`;
}).join('\n\n');

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
// Empreinte déterministe du contenu : deux builds des mêmes sources sont identiques
// (pas d'horodatage) et l'empreinte identifie précisément la version livrée.
const fingerprint = createHash('sha256').update(head + css + body + js).digest('hex').slice(0, 12);

const html = [
  head,
  '/* JACKPOTLY v' + version + ' — build ' + fingerprint + ' — fichier généré, ne pas éditer (voir src/) */\n',
  css.trimEnd(),
  '</style>\n</head>\n<body>',
  body.trimEnd(),
  '\n<script>\n"use strict";\n' + js + '\n</script>',
  tail.trimEnd()
].join('\n');

const out = join(root, 'jackpotly.html');
const out2 = join(root, 'index.html');
/* `--check` : on n'écrit RIEN, on compare le fichier livré au résultat du build
   des sources. C'est la garantie que le fichier distribué (téléchargement, CDN,
   GitHub Pages) est exactement celui que produisent les sources versionnées. */
if (process.argv.includes('--check')) {
  const lire = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
  const disque = lire(out), copie = lire(out2);
  const meme = disque === html && copie === html;
  console.log('JACKPOTLY — vérification du livrable v' + version + ' (build ' + fingerprint + ')');
  console.log('  ' + (disque === html ? '✓' : '✗') + ' jackpotly.html identique au build des sources' +
    (disque === null ? ' (fichier absent)' : ''));
  console.log('  ' + (copie === html ? '✓' : '✗') + ' index.html identique au build des sources' +
    (copie === null ? ' (fichier absent)' : ''));
  if (!meme) console.error('Écart entre les sources et le fichier livré : relancer `node tools/build.mjs`.');
  process.exit(meme ? 0 : 1);
}
writeFileSync(out, html, 'utf8');
// Copie servie par défaut (aperçu, GitHub Pages) — identique au fichier livré
copyFileSync(out, out2);

/* ---------------------------------------------------------------- CONTRÔLES */
// Version « code seul » (commentaires retirés) pour les analyses de source
const codeOnly = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const checks = [
  ['balise <style> unique', (html.match(/<style>/g) || []).length === 1],
  ['balise <script> unique', (html.match(/<script>/g) || []).length === 1],
  ['aucune balise <link>', !/<link[^>]+stylesheet/i.test(html)],
  ['aucune ressource http', !/(src|href)\s*=\s*["']https?:/i.test(html)],
  ['aucun @import CSS', !/@import/.test(html)],
  ['aucun fetch/XHR externe', !/fetch\s*\(|XMLHttpRequest/.test(html)],
  ['aucun dialogue natif (alert/prompt/confirm)', !/(?<![.\w])(alert|prompt|confirm)\s*\(/.test(codeOnly)],
  ['aucune dépendance marquée TODO', !/À COMPLÉTER|TODO:|FIXME/i.test(codeOnly)]
];

console.log('JACKPOTLY — build v' + version + ' (' + fingerprint + ')');
console.log('Modules JS : ' + jsFiles.length + ' → ' + jsFiles.join(', '));
console.log('Feuilles CSS : ' + cssFiles.length + ' → ' + cssFiles.join(', '));
let ok = true;
for (const [label, pass] of checks) {
  console.log((pass ? '  ✓ ' : '  ✗ ') + label);
  if (!pass) ok = false;
}
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('  · taille : ' + kb + ' Ko (' + html.split('\n').length + ' lignes)');
console.log('  · sortie : jackpotly.html + index.html');
if (!ok) { console.error('Contrôles échoués.'); process.exit(1); }
