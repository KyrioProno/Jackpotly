/* =========================================================================
   JACKPOTLY — MOTEUR MUSICAL ET UNIVERS SONORES
   -------------------------------------------------------------------------
   Toute la musique est SYNTHÉTISÉE en Web Audio : aucune requête réseau,
   aucun fichier audio à côté du livrable (contrainte « un seul fichier »),
   et aucune musique d'un autre casino n'est reprise. Chaque piste est
   composée ici (grille, progression d'accords, motifs, instruments), donc
   entièrement originale.

   Une piste = une ambiance :
     · lobby, originals, salle des machines, salle des tables, salon de poker
     · un univers par machine à sous (Égypte, dragons, gemmes, fruits,
       bonbons, aventure)
     · une nappe de tension pour les jeux « Originals »

   Le moteur est un séquenceur à lookahead (pas d'horloge JS dans l'audio) :
   les notes sont programmées à l'avance sur l'horloge du contexte audio, ce
   qui reste stable même si l'interface saccade. Une seule piste joue à la
   fois, le changement se fait par fondu enchaîné, et le changement d'onglet
   du navigateur suspend proprement la musique.
   ========================================================================= */
(function () {
  'use strict';
  const J = (window.JACKPOTLY = window.JACKPOTLY || {});
  const Music = (J.Music = {});

  /* ------------------------------------------------------------- THÉORIE --
     Gammes (en demi-tons) et construction d'accords par degré. */
  const SCALES = {
    major:     [0, 2, 4, 5, 7, 9, 11],
    minor:     [0, 2, 3, 5, 7, 8, 10],
    dorian:    [0, 2, 3, 5, 7, 9, 10],
    mixolydien:[0, 2, 4, 5, 7, 9, 10],
    harmonique:[0, 2, 3, 5, 7, 8, 11],
    pentaMineur:[0, 3, 5, 7, 10]
  };

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /** Note à `deg` degrés d'écart (peut sortir de la gamme : on monte d'octave). */
  function deg2midi(root, scale, deg) {
    const s = SCALES[scale] || SCALES.major;
    const oct = Math.floor(deg / s.length);
    const i = ((deg % s.length) + s.length) % s.length;
    return root + s[i] + 12 * oct;
  }

  /** Accord : fondamentale + tierce + quinte (+ septième), éventuellement renversé. */
  function chordMidi(root, scale, degree, seventh, oct) {
    const o = (oct || 0) * 12;
    const notes = [deg2midi(root, scale, degree) + o, deg2midi(root, scale, degree + 2) + o, deg2midi(root, scale, degree + 4) + o];
    if (seventh) notes.push(deg2midi(root, scale, degree + 6) + o);
    return notes;
  }

  /* --------------------------------------------------------- INSTRUMENTS --
     Chaque instrument reçoit (ctx, dest, temps, fréquence, durée, options).
     Volontairement courts : un timbre = 2 à 8 lignes, lus à l'identique sur
     tous les téléphones puisqu'ils sont générés, pas échantillonnés. */
  let noiseBuf = null;

  function noise(ctx, dur) {
    if (!noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 1;
    return src;
  }

  function env(ctx, t, a, d, peak, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }

  function osc(ctx, type, f, t, dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** Filtre passe-bas avec enveloppe (le « bois » du son). */
  function lp(ctx, f0, f1, t, dur, q) {
    const b = ctx.createBiquadFilter();
    b.type = 'lowpass';
    b.frequency.setValueAtTime(f0, t);
    b.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t + dur);
    b.Q.value = q || 0.7;
    return b;
  }

  const INS = {
    /* Percussions -------------------------------------------------------- */
    kick(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.004, dur || 0.22, (o.gain || 0.9), dest);
      const s = osc(ctx, 'sine', f || 120, t, dur || 0.22);
      s.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      s.connect(g);
      const c = osc(ctx, 'triangle', (f || 120) * 1.6, t, 0.03);
      env(ctx, t, 0.001, 0.03, 0.22 * (o.gain || 0.9), dest).connect ? null : null;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.18 * (o.gain || 0.9), t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      c.connect(cg).connect(dest);
    },
    taiko(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.004, dur || 0.4, (o.gain || 0.85), dest);
      const s = osc(ctx, 'sine', f || 88, t, dur || 0.4);
      s.frequency.exponentialRampToValueAtTime(48, t + 0.2);
      s.connect(g);
      const n = noise(ctx);
      const bf = lp(ctx, 900, 200, t, dur || 0.4, 0.9);
      const ng = env(ctx, t, 0.003, (dur || 0.4) * 0.7, 0.22 * (o.gain || 0.85), dest);
      n.connect(bf).connect(ng);
      n.start(t); n.stop(t + (dur || 0.4) + 0.05);
    },
    snare(ctx, dest, t, f, dur, o) {
      o = o || {};
      const n = noise(ctx);
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 1900; bf.Q.value = 0.9;
      const g = env(ctx, t, 0.002, dur || 0.14, (o.gain || 0.42), dest);
      n.connect(bf).connect(g);
      n.start(t); n.stop(t + (dur || 0.14) + 0.05);
      const t2 = osc(ctx, 'triangle', f || 195, t, 0.09);
      env(ctx, t, 0.002, 0.09, 0.16 * (o.gain || 0.42), dest).connect ? null : null;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.14 * (o.gain || 0.42), t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      t2.connect(g2).connect(dest);
    },
    hat(ctx, dest, t, f, dur, o) {
      o = o || {};
      const n = noise(ctx);
      const bf = ctx.createBiquadFilter();
      bf.type = 'highpass'; bf.frequency.value = o.open ? 6200 : 8600;
      const g = env(ctx, t, 0.001, dur || (o.open ? 0.16 : 0.035), (o.gain || 0.16) * (o.open ? 1 : 0.9), dest);
      n.connect(bf).connect(g);
      n.start(t); n.stop(t + (dur || 0.2) + 0.05);
    },
    shaker(ctx, dest, t, f, dur, o) {
      o = o || {};
      const n = noise(ctx);
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 7400; bf.Q.value = 0.7;
      const g = env(ctx, t, 0.008, dur || 0.07, (o.gain || 0.11), dest);
      n.connect(bf).connect(g);
      n.start(t); n.stop(t + (dur || 0.07) + 0.05);
    },
    clap(ctx, dest, t, f, dur, o) {
      o = o || {};
      [0, 0.012, 0.026].forEach((d, i) => {
        const n = noise(ctx);
        const bf = ctx.createBiquadFilter();
        bf.type = 'bandpass'; bf.frequency.value = 1500 + i * 350; bf.Q.value = 1.1;
        const g = env(ctx, t + d, 0.001, 0.09, (o.gain || 0.3) * (i === 2 ? 1 : 0.6), dest);
        n.connect(bf).connect(g);
        n.start(t + d); n.stop(t + d + 0.14);
      });
    },
    /* Basses ------------------------------------------------------------- */
    bass(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.006, dur, (o.gain || 0.32), dest);
      const b = lp(ctx, 320, 160, t, dur, 1.1);
      osc(ctx, o.type || 'triangle', f, t, dur).connect(b);
      if (o.type === 'saw') osc(ctx, 'sawtooth', f * 0.997, t, dur).connect(b);
      b.connect(g);
    },
    /* Nappes et accords --------------------------------------------------- */
    pad(ctx, dest, t, f, dur, o) {
      o = o || {};
      const b = lp(ctx, o.cut || 1500, o.cut2 || 700, t, dur, 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain || 0.11, t + (o.attack || 0.5));
      g.gain.linearRampToValueAtTime((o.gain || 0.11) * 0.75, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [0, 0.5, -0.5].forEach((det, i) => {
        const s = osc(ctx, i === 2 ? 'triangle' : (o.type || 'sawtooth'), f * Math.pow(2, det / 120), t, dur);
        s.connect(b);
      });
      b.connect(g).connect(dest);
    },
    strings(ctx, dest, t, f, dur, o) {
      o = o || {};
      INS.pad(ctx, dest, t, f, dur, { gain: o.gain || 0.075, attack: 0.7, cut: 2100, cut2: 1200, type: 'sawtooth' });
    },
    /* Claviers et plucks -------------------------------------------------- */
    bell(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.002, dur || 0.9, (o.gain || 0.18), dest);
      osc(ctx, 'sine', f, t, dur || 0.9).connect(g);
      const g2 = env(ctx, t, 0.001, (dur || 0.9) * 0.5, (o.gain || 0.18) * 0.45, dest);
      osc(ctx, 'sine', f * 2.76, t, dur || 0.9).connect(g2);
    },
    glass(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.003, dur || 0.7, (o.gain || 0.15), dest);
      osc(ctx, 'triangle', f, t, dur || 0.7).connect(g);
      const g2 = env(ctx, t, 0.004, (dur || 0.7) * 0.7, (o.gain || 0.15) * 0.5, dest);
      osc(ctx, 'sine', f * 4.02, t, dur || 0.7).connect(g2);
    },
    piano(ctx, dest, t, f, dur, o) {
      o = o || {};
      const b = lp(ctx, 3200, 900, t, (dur || 0.6) * 1.2, 0.6);
      const g = env(ctx, t, 0.004, dur || 0.6, (o.gain || 0.16), dest);
      osc(ctx, 'triangle', f, t, dur || 0.6).connect(b);
      osc(ctx, 'sine', f * 2, t, (dur || 0.6) * 0.6).connect(b);
      b.connect(g);
    },
    marimba(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.004, dur || 0.45, (o.gain || 0.2), dest);
      osc(ctx, 'sine', f, t, dur || 0.45).connect(g);
      const g2 = env(ctx, t, 0.002, 0.12, (o.gain || 0.2) * 0.35, dest);
      osc(ctx, 'sine', f * 3.9, t, 0.14).connect(g2);
    },
    vibes(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.01, dur || 1.1, (o.gain || 0.13), dest);
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.frequency.value = 5.2; vg.gain.value = 3.2;
      v.connect(vg);
      const s = osc(ctx, 'sine', f, t, dur || 1.1);
      vg.connect(s.frequency);
      s.connect(g);
      v.start(t); v.stop(t + (dur || 1.1));
    },
    pluck(ctx, dest, t, f, dur, o) {
      o = o || {};
      const b = lp(ctx, 2600, 420, t, (dur || 0.3) * 1.4, 2.2);
      const g = env(ctx, t, 0.002, dur || 0.3, (o.gain || 0.17), dest);
      osc(ctx, o.type || 'sawtooth', f, t, dur || 0.3).connect(b);
      b.connect(g);
    },
    organ(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.01, dur || 0.22, (o.gain || 0.13), dest);
      osc(ctx, 'square', f, t, dur || 0.22).connect(g);
      osc(ctx, 'sine', f * 2, t, (dur || 0.22) * 0.8).connect(g);
    },
    brass(ctx, dest, t, f, dur, o) {
      o = o || {};
      const b = lp(ctx, 800, 3400, t, 0.09, 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain || 0.16, t + 0.05);
      g.gain.setValueAtTime(o.gain || 0.16, t + (dur || 0.3) * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.3));
      osc(ctx, 'sawtooth', f, t, dur || 0.3).connect(b);
      osc(ctx, 'sawtooth', f * 1.005, t, dur || 0.3).connect(b);
      b.connect(g).connect(dest);
    },
    accordion(ctx, dest, t, f, dur, o) {
      o = o || {};
      const g = env(ctx, t, 0.05, dur || 0.5, (o.gain || 0.12), dest);
      osc(ctx, 'sawtooth', f, t, dur || 0.5).connect(g);
      osc(ctx, 'sawtooth', f * 1.004, t, dur || 0.5).connect(g);
      osc(ctx, 'triangle', f * 0.5, t, dur || 0.5).connect(g);
    },
    lead(ctx, dest, t, f, dur, o) {
      o = o || {};
      const b = lp(ctx, o.cut || 4200, o.cut2 || 1600, t, dur || 0.4, 1.4);
      const g = env(ctx, t, 0.01, dur || 0.4, (o.gain || 0.15), dest);
      const s = osc(ctx, o.type || 'triangle', f, t, dur || 0.4);
      b.connect(g);
      s.connect(b);
    },
    /* Texture ------------------------------------------------------------- */
    vinyl(ctx, dest, t, dur, o) {
      o = o || {};
      const n = noise(ctx);
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 2600; bf.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain || 0.02, t + 0.6);
      g.gain.setValueAtTime(o.gain || 0.02, t + dur - 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      n.connect(bf).connect(g).connect(dest);
      n.start(t); n.stop(t + dur);
    },
    riser(ctx, dest, t, dur, o) {
      o = o || {};
      const n = noise(ctx);
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.Q.value = 1.1;
      bf.frequency.setValueAtTime(400, t);
      bf.frequency.exponentialRampToValueAtTime(6000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain || 0.14, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bf).connect(g).connect(dest);
      n.start(t); n.stop(t + dur + 0.05);
    },
    sweep(ctx, dest, t, o) {
      o = o || {};
      const b = lp(ctx, 2400, 260, t, 0.9, 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.gain || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      [0, -7, 12].forEach((s) => osc(ctx, 'sawtooth', (o.f || 220) * Math.pow(2, s / 12), t, 0.9).connect(b));
      b.connect(g).connect(dest);
    }
  };

  /* ------------------------------------------------------------- PISTES --
     `drums`, `bass`, `arp` : motifs de 16 pas (1 pas = double-croche).
     `prog` : degrés d'accord, un par mesure. `hook` : motif mélodique
     [degré, durée en pas] répété en boucle — c'est la signature du thème.
     `bars` : longueur de la boucle. `swing` : balancement ternaire (0-0.35).
     `rev`/`del` : part de réverbération et de delay. `inst` : instrument
     soliste du thème. */
  const TRACKS = {
    lobby: {
      name: 'Neon Royale', bpm: 100, root: 58, scale: 'major', bars: 4, swing: 0.05,
      prog: [0, 5, 3, 4], inst: 'bell', bassInst: 'bass', rev: 0.34, del: 0.16,
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: '..x...x...x...x.' },
      bassStyle: 'pulse', arp: { mode: 'up', oct: 2, rhythm: 'x..x..x..x..x..x', inst: 'bell' },
      hook: [[7, 2], [6, 2], [4, 2], [2, 2], [4, 6], [2, 2], [0, 4]]
    },
    originals: {
      name: 'Neon Sync', bpm: 118, root: 57, scale: 'minor', bars: 4, swing: 0,
      prog: [0, 5, 2, 6], inst: 'lead', bassInst: 'bass', rev: 0.22, del: 0.28,
      drums: { kick: 'x...x..xx...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', clap: '............x...' },
      bassStyle: 'octave', arp: { mode: 'up', oct: 3, rhythm: 'x.xxx.xxx.xxx.xx', inst: 'pluck' },
      hook: [[0, 3], [3, 1], [4, 4], [7, 4], [4, 3], [2, 1]]
    },
    'room-slots': {
      name: 'Grande Marque', bpm: 124, root: 60, scale: 'major', bars: 4, swing: 0.1,
      prog: [0, 4, 5, 3], inst: 'glass', bassInst: 'bass', rev: 0.26, del: 0.18,
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...' },
      bassStyle: 'walk', arp: { mode: 'up', oct: 3, rhythm: 'x.x.x.x.x.x.x.x.', inst: 'glass' },
      hook: [[4, 2], [4, 2], [6, 2], [7, 4], [4, 2], [2, 2], [0, 4]]
    },
    'room-tables': {
      name: 'Velours Vert', bpm: 108, root: 53, scale: 'major', bars: 8, swing: 0.3,
      prog: [0, 5, 1, 4, 0, 5, 1, 4], inst: 'piano', bassInst: 'bass', rev: 0.3, del: 0.12,
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', shaker: '.x..x...x...x..x' },
      bassStyle: 'walk', arp: { mode: 'off', oct: 2, rhythm: '................', inst: 'piano' },
      hook: [[4, 3], [5, 1], [7, 4], [6, 3], [4, 1], [2, 4]]
    },
    'room-poker': {
      name: 'Salon Fumé', bpm: 84, root: 51, scale: 'major', bars: 8, swing: 0.22,
      prog: [1, 4, 0, 5, 3, 4, 0, 0], inst: 'vibes', bassInst: 'bass', rev: 0.4, del: 0.2,
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x.x.x...x.', shaker: 'x..x..x..x..x..x' },
      bassStyle: 'slow', arp: { mode: 'off', oct: 2, rhythm: '................', inst: 'piano' },
      hook: [[7, 4], [6, 2], [4, 2], [5, 8]],
      vinyl: true
    },
    'slot-egypte': {
      name: 'Sable et Or', bpm: 96, root: 50, scale: 'dorian', bars: 4, swing: 0,
      prog: [0, 3, 0, 6], inst: 'pluck', bassInst: 'bass', rev: 0.4, del: 0.24,
      drums: { kick: 'x..x..x.x..x....', taiko: 'x.......x.......', hat: '..x..x..x..x..x.', shaker: 'x.xx.x.xx.xx.x.x' },
      bassStyle: 'pulse', arp: { mode: 'up', oct: 3, rhythm: 'x..xx..x.x..xx..', inst: 'pluck' },
      padInst: 'strings', hook: [[0, 4], [2, 2], [3, 2], [4, 6], [3, 2]]
    },
    'slot-dragon': {
      name: 'Cœur de Braise', bpm: 104, root: 48, scale: 'minor', bars: 4, swing: 0,
      prog: [0, 5, 3, 4], inst: 'brass', bassInst: 'bass', rev: 0.34, del: 0.12,
      drums: { kick: 'x...x..xx...x..x', taiko: 'x.......x...x...', snare: '....x.......x...', tom: '..x...x...x...x.' },
      bassStyle: 'root8', arp: { mode: 'pentatone', oct: 2, rhythm: 'x.x.x.x.x.x.x.x.', inst: 'pluck' },
      padInst: 'strings', hook: [[0, 2], [3, 2], [5, 4], [7, 4], [5, 3], [3, 1]]
    },
    'slot-gemmes': {
      name: 'Éclat Facetté', bpm: 116, root: 54, scale: 'minor', bars: 4, swing: 0,
      prog: [0, 6, 5, 4], inst: 'glass', bassInst: 'bass', rev: 0.42, del: 0.3,
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...' },
      bassStyle: 'octave', arp: { mode: 'updown', oct: 3, rhythm: 'x.xxx.xxx.xxx.xx', inst: 'glass' },
      padInst: 'pad', hook: [[7, 2], [4, 2], [6, 4], [5, 4], [4, 2], [2, 2]]
    },
    'slot-fruits': {
      name: 'Fruits Néon', bpm: 128, root: 55, scale: 'mixolydien', bars: 4, swing: 0.12,
      prog: [0, 3, 4, 0], inst: 'organ', bassInst: 'bass', rev: 0.2, del: 0.14,
      drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', openhat: '.x..........x...' },
      bassStyle: 'walk', arp: { mode: 'chromatic', oct: 2, rhythm: 'x.x.x.x.x.x.x.x.', inst: 'organ' },
      hook: [[0, 2], [0, 2], [4, 2], [7, 2], [9, 4], [7, 4]]
    },
    'slot-bonbons': {
      name: 'Sucre Rapide', bpm: 132, root: 50, scale: 'major', bars: 4, swing: 0,
      prog: [0, 4, 3, 4], inst: 'marimba', bassInst: 'bass', rev: 0.24, del: 0.2,
      drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', clap: '....x.......x...', shaker: '..x...x...x...x.' },
      bassStyle: 'bounce', arp: { mode: 'up', oct: 3, rhythm: 'xx.xx.xx.x.xx.xx', inst: 'marimba' },
      hook: [[0, 2], [2, 2], [4, 2], [5, 2], [7, 3], [4, 1], [2, 4]]
    },
    'slot-aventure': {
      name: 'Cap sur le Trésor', bpm: 112, root: 45, scale: 'minor', bars: 4, swing: 0.18, steps: 12,
      prog: [0, 6, 5, 6], inst: 'accordion', bassInst: 'bass', rev: 0.3, del: 0.16,
      drums: { taiko: 'x...x...x...', tom: '..x...x...x.', shaker: 'x.x.x.x.x.x.', kick: 'x.......x...' },
      bassStyle: 'shanty', arp: { mode: 'off', oct: 2, rhythm: '............', inst: 'accordion' },
      hook: [[0, 3], [4, 3], [5, 2], [4, 2], [2, 2]]
    },
    game: {
      name: 'Tension', bpm: 110, root: 52, scale: 'minor', bars: 4, swing: 0,
      prog: [0, 0, 5, 4], inst: 'pluck', bassInst: 'bass', rev: 0.26, del: 0.3,
      drums: { kick: 'x..x..x.x..x..x.', hat: '..x...x...x...x.', shaker: 'x.x.x.x.x.x.x.x.' },
      bassStyle: 'pulse', arp: { mode: 'up', oct: 2, rhythm: 'x..x..x..x..x...', inst: 'pluck' },
      padInst: 'pad', hook: [[0, 4], [2, 2], [1, 2], [4, 4], [2, 4]]
    },
    /* Jeux « Originals » qui méritent leur propre tension ------------------ */
    crash: {
      name: 'Montée Libre', bpm: 130, root: 55, scale: 'minor', bars: 4, swing: 0,
      prog: [0, 0, 3, 5], inst: 'lead', bassInst: 'bass', rev: 0.24, del: 0.34,
      drums: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', shaker: 'x.x.x.x.x.x.x.x.', clap: '............x...' },
      bassStyle: 'octave', arp: { mode: 'up', oct: 2, rhythm: 'xx.x.xx.xx.x.xx.', inst: 'pluck' },
      padInst: 'pad', hook: [[0, 2], [0, 2], [3, 2], [5, 4], [3, 2], [2, 4]]
    },
    mines: {
      name: 'Filons Sombres', bpm: 92, root: 49, scale: 'harmonique', bars: 4, swing: 0,
      prog: [0, 0, 5, 4], inst: 'vibes', bassInst: 'bass', rev: 0.42, del: 0.34,
      drums: { kick: 'x.......x.......', taiko: '........x.......', hat: '....x.......x...', shaker: '..x...x...x...x.' },
      bassStyle: 'pulse', arp: { mode: 'updown', oct: 2, rhythm: 'x..x..x...x..x..', inst: 'glass' },
      padInst: 'pad', hook: [[0, 8], [1, 4], [4, 4]]
    },
    plinko: {
      name: 'Chute Dorée', bpm: 126, root: 57, scale: 'major', bars: 4, swing: 0.14,
      prog: [0, 5, 3, 4], inst: 'marimba', bassInst: 'bass', rev: 0.22, del: 0.24,
      drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', shaker: '..x...x...x...x.' },
      bassStyle: 'bounce', arp: { mode: 'up', oct: 2, rhythm: 'x.xx.x.xx.xx.x.x', inst: 'marimba' },
      hook: [[4, 2], [7, 2], [9, 2], [7, 2], [5, 4], [4, 4]]
    },
    wheel: {
      name: 'Grande Roue', bpm: 120, root: 53, scale: 'major', bars: 4, swing: 0.2,
      prog: [0, 3, 0, 4], inst: 'organ', bassInst: 'bass', rev: 0.26, del: 0.16,
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...' },
      bassStyle: 'walk', arp: { mode: 'up', oct: 3, rhythm: 'x.x.x.x.x.x.x.x.', inst: 'glass' },
      hook: [[0, 2], [2, 2], [4, 2], [7, 6], [4, 2], [2, 4]]
    }
  };

  /* ------------------------------------------------------------- MOTEUR -- */
  let ctx = null, sched = null, tracks = new Map(), pending = null, muted = false;
  const LOOKAHEAD = 0.34, TICK = 40;

  function ensure() {
    ctx = J.Sfx && J.Sfx.audioCtx ? J.Sfx.audioCtx() : null;
    return ctx;
  }
  const bus = () => (J.Sfx && J.Sfx.musicBus ? J.Sfx.musicBus() : null);

  /** Réverbération : réponse impulsionnelle synthétisée (bruit décroissant). */
  let revBuf = null;
  function reverb() {
    if (revBuf) return revBuf;
    const dur = 1.7, n = Math.floor(ctx.sampleRate * dur);
    revBuf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = revBuf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (1 - 0.25 * c);
      }
    }
    return revBuf;
  }

  /** Chaîne d'une piste : instruments → filtre → [delay] → gain → réverbe → bus musique. */
  function makeChannel(def) {
    const out = bus();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = def.rev || 0.3;
    dry.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = reverb();
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 5200;
    gain.connect(dry).connect(out);
    gain.connect(conv).connect(damp).connect(wet).connect(out);
    // Delay synchronisé au tempo (croche pointée), léger retour
    let delayIn = gain;
    if (def.del) {
      const d = ctx.createDelay(1.2);
      d.delayTime.value = (60 / def.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const mix = ctx.createGain();
      mix.gain.value = def.del;
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass'; lp2.frequency.value = 2800;
      gain.connect(d);
      d.connect(lp2).connect(fb).connect(d);
      d.connect(mix).connect(out);
      delayIn = gain;
    }
    return { node: delayIn, gain, target: 0 };
  }

  /** Composante rythmique de la piste à l'instant t. */
  function playStep(tr, step, time) {
    const d = tr.def;
    const stepDur = (60 / d.bpm) / 4;
    const swing = d.swing ? (step % 2 === 1 ? d.swing * stepDur * 0.7 : 0) : 0;
    const t = time + swing;
    const ch = tr.ch;

    /* Percussions */
    for (const key in d.drums) {
      const pat = d.drums[key];
      if (pat[step % pat.length] !== 'x') continue;
      if (key === 'kick') INS.kick(ctx, ch.node, t, 124, 0.2, { gain: 0.75 });
      else if (key === 'taiko') INS.taiko(ctx, ch.node, t, 86, 0.42, { gain: 0.6 });
      else if (key === 'snare') INS.snare(ctx, ch.node, t, 195, 0.13, { gain: 0.3 });
      else if (key === 'hat') INS.hat(ctx, ch.node, t, 9000, 0.03, { gain: 0.1 });
      else if (key === 'openhat') INS.hat(ctx, ch.node, t, 7200, 0.18, { gain: 0.08, open: true });
      else if (key === 'shaker') INS.shaker(ctx, ch.node, t, 7400, 0.06, { gain: d.bpm > 120 ? 0.07 : 0.06 });
      else if (key === 'clap') INS.clap(ctx, ch.node, t, 1500, 0.1, { gain: 0.2 });
      else if (key === 'tom') INS.taiko(ctx, ch.node, t, 150, 0.22, { gain: 0.35 });
    }

    /* Accord : posé au début de chaque mesure */
    const stepsPerBar = d.steps || 16;
    if (step % stepsPerBar === 0) {
      const bar = Math.floor(tr.absStep / stepsPerBar) % d.prog.length;
      const root = deg2midi(d.root, d.scale, d.prog[bar]);
      const notes = chordMidi(d.root, d.scale, d.prog[bar], d.seventh !== false, 0);
      const dur = (60 / d.bpm) * (d.bars > 4 ? 4.6 : 2.2);
      notes.forEach((m, i) => {
        if (d.padInst === 'strings') INS.strings(ctx, ch.node, t + i * 0.01, midi(m), dur, { gain: 0.06 });
        else INS.pad(ctx, ch.node, t + i * 0.01, midi(m), dur, { gain: 0.075, attack: 0.6, cut: 1500, cut2: 800 });
      });
      // Basse : fondamentale (et quinte en fin de mesure selon le style)
      const bs = d.bassStyle;
      const bRoot = midi(root - 12);
      const bFifth = midi(root - 5);
      for (let s = 0; s < stepsPerBar; s++) {
        const tt = time + s * stepDur + (d.swing && s % 2 === 1 ? d.swing * stepDur * 0.7 : 0);
        if (bs === 'pulse' && (s % 4 === 0)) INS.bass(ctx, ch.node, tt, bRoot, stepDur * 3.4, { gain: 0.3 });
        else if (bs === 'octave' && (s % 2 === 0)) INS.bass(ctx, ch.node, tt, (s % 4 === 2 ? bRoot * 2 : bRoot), stepDur * 1.6, { gain: 0.26 });
        else if (bs === 'root8' && (s % 4 === 0)) INS.bass(ctx, ch.node, tt, bRoot, stepDur * 3.6, { gain: 0.34, type: 'saw' });
        else if (bs === 'walk' && (s % 2 === 0)) {
          const seq = [0, 4, 7, 10, 12, 7, 4, 0];
          INS.bass(ctx, ch.node, tt, midi(root - 12 + seq[(s / 2) % seq.length]), stepDur * 1.7, { gain: 0.22 });
        } else if (bs === 'slow' && (s === 0 || s === 8)) INS.bass(ctx, ch.node, tt, bRoot, stepDur * 7, { gain: 0.26 });
        else if (bs === 'bounce' && (s % 2 === 0)) INS.bass(ctx, ch.node, tt, (s % 8 === 4 ? bFifth : bRoot), stepDur * 1.4, { gain: 0.24 });
        else if (bs === 'shanty' && (s === 0 || s === 4 || s === 8)) INS.bass(ctx, ch.node, tt, (s === 4 ? bFifth : bRoot), stepDur * 3.6, { gain: 0.26 });
      }
      tr.lastRoot = root;
      tr.lastChord = notes;
    }

    /* Arpège */
    if (d.arp && d.arp.mode !== 'off') {
      const pat = d.arp.rhythm;
      if (pat[step % pat.length] === 'x') {
        const chord = tr.lastChord || chordMidi(d.root, d.scale, 0, false, 1);
        const seq = chord.map((m) => m + 12 * (d.arp.oct || 2));
        let idx;
        if (d.arp.mode === 'up') idx = tr.arpI++ % seq.length;
        else if (d.arp.mode === 'updown') { const L = seq.length * 2 - 2; const k = tr.arpI++ % L; idx = k < seq.length ? k : L - k; }
        else if (d.arp.mode === 'pentatone') idx = [0, 2, 4, 2][tr.arpI++ % 4] % seq.length;
        else idx = tr.arpI++ % seq.length;
        const f = midi(seq[idx]) * (d.arp.mode === 'chromatic' ? Math.pow(2, (tr.arpI % 7) / 12) : 1);
        INS[d.arp.inst || 'bell'](ctx, ch.node, t, f, 0.22, { gain: 0.1 });
      }
    }

    /* Motif signature (le « hook ») : une note toutes les `dur` pas */
    if (d.hook && tr.hookStep === 0) {
      const h = d.hook[tr.hookIdx % d.hook.length];
      const f = midi(deg2midi(d.root, d.scale, h[0]) + 12 * (d.hookOct || 1));
      const dur = h[1] * stepDur * 0.9;
      INS[d.inst || 'bell'](ctx, ch.node, t, f, Math.max(0.18, dur), { gain: 0.12 });
      tr.hookDur = h[1];
      tr.hookIdx++;
    }
    if (d.hook) {
      tr.hookStep = (tr.hookStep + 1) % Math.max(1, tr.hookDur || 4);
    }

    if (d.vinyl && step % 16 === 0) INS.vinyl(ctx, ch.node, t, (60 / d.bpm) * 4 * (d.bars || 4), { gain: 0.012 });
  }

  function startTrack(id, fadeIn) {
    const def = TRACKS[id];
    if (!def) return null;
    ensure();
    if (!ctx) return null;
    const ch = makeChannel(def);
    const tr = {
      id, def, ch, absStep: 0, arpI: 0, hookIdx: 0, hookStep: 0, hookDur: 4,
      nextTime: ctx.currentTime + 0.06, timer: null
    };
    // Fondu d'entrée (respecte le mode silencieux)
    const target = 0.5;
    ch.target = target;
    ch.gain.gain.cancelScheduledValues(ctx.currentTime);
    ch.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    ch.gain.gain.linearRampToValueAtTime(target, ctx.currentTime + (fadeIn === 0 ? 0.01 : 1.6));
    tracks.set(id, tr);
    return tr;
  }

  function stopTrack(tr, fade) {
    if (!tr || !ctx) return;
    const c = ctx;
    const t0 = c.currentTime;
    try {
      tr.ch.gain.gain.cancelScheduledValues(t0);
      tr.ch.gain.gain.setValueAtTime(Math.max(0.0001, tr.ch.gain.gain.value), t0);
      tr.ch.gain.gain.linearRampToValueAtTime(0.0001, t0 + fade);
    } catch (e) { /* contexte fermé */ }
    setTimeout(() => { try { tr.ch.gain.disconnect(); } catch (e) { /* noop */ } }, (fade + 0.3) * 1000);
    tracks.delete(tr.id);
  }

  /** Boucle de programmation : avance tant qu'une piste attend d'être jouée. */
  function scheduler() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime + LOOKAHEAD;
    tracks.forEach((tr) => {
      const stepDur = (60 / tr.def.bpm) / 4;
      if (tr.nextTime < ctx.currentTime) tr.nextTime = ctx.currentTime + 0.05;   // retour d'onglet
      while (tr.nextTime < now) {
        playStep(tr, tr.absStep % 16, tr.nextTime);
        tr.absStep++;
        tr.nextTime += stepDur;
      }
    });
  }

  /* -------------------------------------------------------------- API ---- */
  const Music_ = J.Music;
  Object.assign(Music_, {
    /** Identifiants disponibles (rapport, tests). */
    ids: () => Object.keys(TRACKS),
    def: (id) => TRACKS[id] || null,
    name: (id) => (TRACKS[id] ? TRACKS[id].name : '—'),

    /** Joue une piste. Idempotent : rappeler la même piste ne la relance pas. */
    play(id, opts) {
      opts = opts || {};
      const cur = currentId();
      if (cur === id) return id;
      if (!J.Store.state.settings.music) { pending = id; return id; }
      ensure();
      if (!ctx || ctx.state !== 'running') { pending = id; return id; }
      if (cur) {
        const old = tracks.get(cur);
        stopTrack(old, 1.1);
      }
      startTrack(id, opts.instant ? 0 : 1);
      pending = null;
      J.Bus.emit('music:change', id);
      return id;
    },

    stop(fade) {
      pending = null;
      tracks.forEach((tr) => stopTrack(tr, fade === undefined ? 1.2 : fade));
    },

    current: () => currentId(),
    isPlaying: () => tracks.size > 0,
    pendingTrack: () => pending,

    /** Baisse la musique quelques instants (fanfare de gain, jackpot). */
    duck(ms, amount) {
      const b = bus();
      if (!b || !ctx) return;
      const t0 = ctx.currentTime;
      const a = amount === undefined ? 0.35 : amount;
      try {
        b.gain.cancelScheduledValues(t0);
        b.gain.setValueAtTime(b.gain.value, t0);
        b.gain.linearRampToValueAtTime(J.Sfx.musicLevel() * a, t0 + 0.12);
        b.gain.linearRampToValueAtTime(J.Sfx.musicLevel(), t0 + 0.12 + (ms / 1000));
      } catch (e) { /* noop */ }
    },

    /** Petit motif de transition d'écran (discret). */
    transition(up) {
      if (!ctx) return;
      const base = 62 + (up ? 0 : -3);
      [0, 4, 7].forEach((s, i) => INS.glass(ctx, bus(), ctx.currentTime + i * 0.07, midi(base + s), 0.5, { gain: 0.07 }));
    },

    /* Appelé par le déverrouillage audio (premier geste) et par les réglages. */
    refresh() {
      const s = J.Store.state.settings;
      if (!s.music) { tracks.forEach((tr) => stopTrack(tr, 0.5)); return; }
      ensure();
      if (!ctx) return;
      if (pending) { const p = pending; pending = null; Music_.play(p); }
      else if (!tracks.size && lastWanted) Music_.play(lastWanted, { instant: true });
    },

    /** Le moteur audio vient de s'ouvrir : on démarre la musique attendue. */
    onUnlock() { Music_.refresh(); }
  });

  let lastWanted = null;
  function currentId() { return tracks.size ? [...tracks.keys()][0] : null; }

  /* Mémorise la dernière piste demandée : au retour du déverrouillage audio,
     la musique repart exactement où l'écran l'attendait (sans doublon). */
  J.Bus.on('music:change', (id) => { lastWanted = id; });
  const playWrap = Music_.play;
  Music_.play = function (id, opts) {
    if (J.Store.state.settings.music) lastWanted = id;
    return playWrap.call(Music_, id, opts);
  };

  /* Suspension propre quand l'onglet passe en arrière-plan, et reprise sans
     repartir du début : le séquenceur rattrape l'horloge audio, il ne rejoue
     jamais deux fois la même piste. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (sched) { clearInterval(sched); sched = null; } }
    else if (!sched) { sched = setInterval(scheduler, TICK); }
  });
  sched = setInterval(scheduler, TICK);

  J.Music.TRACKS = TRACKS;
})();
