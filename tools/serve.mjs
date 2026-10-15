#!/usr/bin/env node
/* =========================================================================
   JACKPOTLY — SERVEUR DE DÉVELOPPEMENT
   Sert le fichier livré (index.html) sur 0.0.0.0 pour l'aperçu mobile.
   Aucune dépendance : module http de Node uniquement.
   Usage : PORT=4173 node tools/serve.mjs
   ========================================================================= */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json'
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(root, url === '/' ? 'index.html' : url);

  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — ' + url);
    return;
  }
  const body = readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length
  });
  res.end(body);
});

server.listen(port, host, () => {
  console.log('JACKPOTLY servi sur http://' + host + ':' + port + ' (index.html)');
});
