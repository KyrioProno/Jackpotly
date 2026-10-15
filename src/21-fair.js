/* =========================================================================
   JACKPOTLY — FAIR PLAY (provably fair)
   SHA-256 + HMAC-SHA256 implémentés en JS pur (aucune dépendance).
   Chaque tirage dérive de : HMAC_SHA256(serverSeed, "clientSeed:nonce:cursor").
   Le hash du serverSeed est publié AVANT les mises, la graine est révélée
   lors d'une rotation : n'importe qui peut alors revérifier les tirages passés.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;

  /* ------------------------------------------------------------- SHA-256 */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** SHA-256 sur un Uint8Array -> Uint8Array(32) */
  function sha256Bytes(msg) {
    const len = msg.length;
    const withPad = new Uint8Array((((len + 9) >> 6) + 1) << 6);
    withPad.set(msg);
    withPad[len] = 0x80;
    const bitLenHi = Math.floor(len / 536870912);      // len*8 / 2^32
    const bitLenLo = (len * 8) >>> 0;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 8, bitLenHi);
    dv.setUint32(withPad.length - 4, bitLenLo);

    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);

    for (let off = 0; off < withPad.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + (i << 2));
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i << 2, H[i]);
    return out;
  }

  const enc = new TextEncoder();
  const sha256 = (str) => sha256Bytes(enc.encode(str));
  const toHex = (bytes) => Array.prototype.map.call(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  /** HMAC-SHA256(key, message) -> Uint8Array(32) */
  function hmac(keyBytes, msgBytes) {
    let k = keyBytes;
    if (k.length > 64) k = sha256Bytes(k);
    const inner = new Uint8Array(64 + msgBytes.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
      const kb = i < k.length ? k[i] : 0;
      inner[i] = kb ^ 0x36;
      outer[i] = kb ^ 0x5c;
    }
    inner.set(msgBytes, 64);
    outer.set(sha256Bytes(inner), 64);
    return sha256Bytes(outer);
  }

  J.crypto = {
    sha256Hex: (str) => toHex(sha256(str)),
    hmacHex: (key, msg) => toHex(hmac(enc.encode(key), enc.encode(msg)))
  };

  /* ------------------------------------------------- MODULE FAIR PLAY (state) */
  /** Tirage déterministe mais imprévisible, vérifiable a posteriori. */
  J.Fair = (function () {
    const hexId = (n) => {
      const a = new Uint8Array(n);
      (window.crypto && window.crypto.getRandomValues ? window.crypto : { getRandomValues: (x) => x.forEach((_, i) => x[i] = Math.floor(Math.random() * 256)) }).getRandomValues(a);
      return toHex(a);
    };

    /** Floats dérivés d'un message : 4 octets -> valeur dans [0,1) */
    function floatsFrom(serverSeed, message) {
      const bytes = hmac(enc.encode(serverSeed), enc.encode(message));
      const out = [];
      for (let i = 0; i + 4 <= bytes.length; i += 4) {
        out.push(bytes[i] / 256 + bytes[i + 1] / 65536 + bytes[i + 2] / 16777216 + bytes[i + 3] / 4294967296);
      }
      return out;
    }

    const api = {
      /** Initialise (ou migre) les graines. Appelé au démarrage. */
      init() {
        const st = J.Store.state.fair;
        if (!st.serverSeed) {
          st.serverSeed = hexId(32);
          st.serverSeedHash = J.crypto.sha256Hex(st.serverSeed);
        }
        st.serverSeedHash = J.crypto.sha256Hex(st.serverSeed);       // resynchronise
        if (!st.clientSeed) st.clientSeed = hexId(8);
        // Attention : `typeof NaN === 'number'`. On teste donc la finitude réelle,
        // sinon un curseur corrompu figerait tous les tirages sur la même valeur.
        if (!Number.isFinite(st.nonce)) st.nonce = 0;
        if (!Number.isFinite(st.cursor)) st.cursor = 0;
        J.Store.save();
        return st;
      },

      get clientSeed() { return J.Store.state.fair.clientSeed; },
      get nonce() { return J.Store.state.fair.nonce; },
      get serverSeed() { return J.Store.state.fair.serverSeed; },
      get serverSeedHash() { return J.Store.state.fair.serverSeedHash; },
      get message() {
        const st = J.Store.state.fair;
        return st.clientSeed + ':' + st.nonce + ':' + st.cursor;
      },

      setClientSeed(seed) {
        const s = String(seed || '').slice(0, 64);
        if (!s) return false;
        J.Store.patch({ fair: { clientSeed: s, cursor: 0 } });
        return true;
      },

      /** Ouvre un nouveau pari : nouveau nonce, curseur remis à zéro. */
      beginBet() {
        const st = J.Store.state.fair;
        st.nonce = (Number.isFinite(st.nonce) ? st.nonce : 0) + 1;
        st.cursor = 0;
        J.Store.save();
        return st.nonce;
      },

      /** Curseur courant, toujours un entier fini (protection contre NaN). */
      _cursor() {
        const st = J.Store.state.fair;
        const c = Number.isFinite(st.cursor) ? st.cursor : 0;
        return c < 0 ? 0 : Math.floor(c);
      },

      /** Float suivant du flux (avance le curseur). */
      float() {
        const st = J.Store.state.fair;
        const cursor = api._cursor();
        st.cursor = cursor + 1;
        J.Store.save();
        return floatsFrom(st.serverSeed, `${st.clientSeed}:${st.nonce || 0}:${cursor}`)[0];
      },

      /** n floats consécutifs */
      floats(n) { const a = []; for (let i = 0; i < n; i++) a.push(api.float()); return a; },

      /** Entier uniforme dans [min,max] inclus, via 4 octets (biais négligeable) */
      int(min, max) {
        const st = J.Store.state.fair;
        const cursor = api._cursor();
        st.cursor = cursor + 1;
        J.Store.save();
        const bytes = hmac(enc.encode(st.serverSeed), enc.encode(`${st.clientSeed}:${st.nonce || 0}:${cursor}`));
        const v = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
        return min + (v % (max - min + 1));
      },

      /** Sélection pondérée : pick([{w:2,…},{w:1,…}]) */
      weighted(items, weightOf) {
        const total = items.reduce((s, it) => s + weightOf(it), 0);
        let r = api.float() * total;
        for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
        return items[items.length - 1];
      },

      /** Idem, mais avec un float déjà tiré (utile en animation) */
      weightedBy(items, weightOf, r) {
        const total = items.reduce((s, it) => s + weightOf(it), 0);
        let x = r * total;
        for (const it of items) { x -= weightOf(it); if (x <= 0) return it; }
        return items[items.length - 1];
      },

      /** Révèle l'ancienne graine et en génère une neuve (le joueur peut vérifier). */
      rotate() {
        const st = J.Store.state.fair;
        const revealed = { seed: st.serverSeed, hash: st.serverSeedHash, nonce: st.nonce };
        const fresh = hexId(32);
        J.Store.patch({
          fair: {
            prevSeed: revealed.seed, prevHash: revealed.hash,
            serverSeed: fresh, serverSeedHash: J.crypto.sha256Hex(fresh),
            nonce: 0, cursor: 0, rotatedAt: Date.now()
          }
        });
        return revealed;
      },

      /** Vérification pédagogique : recalcule un float à partir des graines révélées. */
      verify(serverSeed, clientSeed, nonce, cursor) {
        const msg = `${clientSeed}:${nonce}:${cursor}`;
        return {
          message: msg,
          hmac: J.crypto.hmacHex(serverSeed, msg),
          hash: J.crypto.sha256Hex(serverSeed),
          float: floatsFrom(serverSeed, msg)[0]
        };
      }
    };
    return api;
  })();
})();
