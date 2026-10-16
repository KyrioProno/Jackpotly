#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — PIPELINE D'ASSETS
   -------------------------------------------------------------------------
   Les illustrations vivent dans `assets/art/` (WebP optimisés, sources
   brutes dans `assets/raw/` qui n'est pas versionné). Ce script les embarque
   en data-URI dans `src/02-assets.js`, ce qui garde le livrable
   `jackpotly.html` AUTONOME : un seul fichier, aucune requête réseau, aucune
   image à télécharger à côté.

   Chaque entrée est déclarée avec des métadonnées (famille, dimensions) pour
   que le code de scène puisse composer sans deviner. Si une clé manque à
   l'exécution, `J.Art.get()` renvoie null et l'appelant utilise son repli
   procédural (dégradé, motif CSS) — une image absente ne casse jamais l'écran.

   Usage :
     node tools/assets.mjs            # régénère src/02-assets.js
     node tools/assets.mjs --check    # vérifie que le fichier est à jour
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artDir = join(root, 'assets', 'art');
const outFile = join(root, 'src', '02-assets.js');

/* Métadonnées éditoriales : famille = usage (scène, façade, texture), titre
   lisible pour le rapport. Ajouter une image = déposer le fichier ici. */
const META = {
  'hall':          { family: 'scene',   title: 'Hall du casino' },
  'room-slots':    { family: 'scene',   title: 'Galerie des machines à sous' },
  'room-tables':   { family: 'scene',   title: 'Salle des jeux de table' },
  'room-poker':    { family: 'scene',   title: 'Salon de poker' },
  'slot-egypte':   { family: 'cabinet', title: 'Machine Trésors d\'Égypte' },
  'slot-dragon':   { family: 'cabinet', title: 'Machine Royaume des dragons' },
  'slot-gemmes':   { family: 'cabinet', title: 'Machine Gemmes & Luxe' },
  'slot-fruits':   { family: 'cabinet', title: 'Machine Fruits Néon' },
  'slot-bonbons':  { family: 'cabinet', title: 'Machine Bonbons' },
  'slot-aventure': { family: 'cabinet', title: 'Machine Aventure Jackpotly' }
};

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif' };

if (!existsSync(artDir)) { console.error('dossier absent : ' + artDir); process.exit(1); }

const files = readdirSync(artDir).filter((f) => MIME[extname(f).toLowerCase()]).sort();
const entries = [];
let bytes = 0;

for (const file of files) {
  const key = basename(file, extname(file));
  const mime = MIME[extname(file).toLowerCase()];
  const buf = readFileSync(join(artDir, file));
  bytes += buf.length;
  entries.push({
    key,
    mime,
    family: (META[key] && META[key].family) || 'misc',
    title: (META[key] && META[key].title) || key,
    size: buf.length,
    uri: 'data:' + mime + ';base64,' + buf.toString('base64')
  });
}

// Les clés déclarées dans META mais sans fichier : signalées, jamais bloquantes.
const missing = Object.keys(META).filter((k) => !entries.some((e) => e.key === k));

const body = [
  '/* =========================================================================',
  '   JACKPOTLY — BIBLIOTHÈQUE D\'IMAGES (fichier GÉNÉRÉ)',
  '   -------------------------------------------------------------------------',
  '   Ne pas éditer : lancer `node tools/assets.mjs` après avoir déposé les',
  '   illustrations dans assets/art/. Chaque image est embarquée en data-URI',
  '   pour que jackpotly.html reste un fichier unique et autonome.',
  '   ' + entries.length + ' images · ' + (bytes / 1024).toFixed(0) + ' Ko de WebP · ' + new Date().toISOString().slice(0, 10),
  '   ========================================================================= */',
  '(function () {',
  '  \'use strict\';',
  '  const J = (window.JACKPOTLY = window.JACKPOTLY || {});',
  '',
  '  /* Image : clé → data-URI. `family` distingue les décors, les façades de',
  '     machines et les textures ; `title` sert au rapport et aux infobulles. */',
  '  const IMAGES = {'
];
entries.forEach((e, i) => {
  body.push('    ' + JSON.stringify(e.key) + ': { family: ' + JSON.stringify(e.family) + ', title: ' + JSON.stringify(e.title) +
    ', uri: \'' + e.uri + '\' }' + (i === entries.length - 1 ? '' : ','));
});
body.push('  };');
body.push('');
body.push('  /* ---------------------------------------------------------------- ART */');
body.push('  /**');
body.push('   * Accès aux illustrations. Toujours défensif : une image absente renvoie');
body.push('   * null (l\'appelant garde alors son décor procédural), une clé inconnue');
body.push('   * renvoie null plutôt que de lever une exception en pleine partie.');
body.push('   */');
body.push('  const Art = (J.Art = {');
body.push('    keys: Object.keys(IMAGES),');
body.push('    info: (k) => IMAGES[k] || null,');
body.push('    /** data-URI de l\'image, ou null si absente. */');
body.push('    get: (k) => (IMAGES[k] ? IMAGES[k].uri : null),');
body.push('    has: (k) => !!IMAGES[k],');
body.push('    /** Toutes les clés d\'une famille : \'scene\', \'cabinet\', \'misc\'. */');
body.push('    byFamily: (f) => Object.keys(IMAGES).filter((k) => IMAGES[k].family === f),');
body.push('    /** Valeur CSS `background-image` (repli : dégradé de la palette). */');
body.push('    bg: (k, fallback) => (IMAGES[k] ? "url(\'" + IMAGES[k].uri + "\')" : (fallback || \'none\')),');
body.push('    /** Balise <img> prête à insérer (repli : aucun nœud). */');
body.push('    img: (k, alt) => (IMAGES[k] ? \'<img class="art-img" alt="\' + (alt || \'\') + \'" src="\' + IMAGES[k].uri + \'">\' : \'\')');
body.push('  });');
body.push('})();');

const content = body.join('\n') + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  const same = current.replace(/\d{4}-\d{2}-\d{2}/, 'XXXX-XX-XX') === content.replace(/\d{4}-\d{2}-\d{2}/, 'XXXX-XX-XX');
  console.log((same ? '✓ ' : '✗ ') + 'src/02-assets.js ' + (same ? 'à jour' : 'obsolète — lancer node tools/assets.mjs'));
  if (!same) process.exit(1);
} else {
  writeFileSync(outFile, content, 'utf8');
  console.log('JACKPOTLY — assets embarqués');
  entries.forEach((e) => console.log('  · ' + e.key.padEnd(16) + e.family.padEnd(9) + (e.size / 1024).toFixed(0) + ' Ko   ' + e.title));
  if (missing.length) console.log('  ! déclarées sans fichier : ' + missing.join(', '));
  console.log('  → src/02-assets.js (' + (Buffer.byteLength(content) / 1024).toFixed(0) + ' Ko, ' + entries.length + ' images)');
}
