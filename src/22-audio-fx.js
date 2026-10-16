/* =========================================================================
   JACKPOTLY — SON, VIBRATIONS, EFFETS VISUELS
   Audio synthétisé via WebAudio (aucun fichier externe), retour haptique,
   confettis sur canvas, toasts, textes flottants.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;

  /* ------------------------------------------------------------------ SON */
  /** Petit moteur audio : oscillateurs + bruit blanc, tout synthétisé. */
  const Sfx = (J.Sfx = (function () {
    let ctx = null, master = null, noiseBuf = null, unlocked = false;

    function ensure() {
      if (!J.Store.state.settings.sound) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.ratio.value = 6;
        master.connect(comp).connect(ctx.destination);
        // Buffer de bruit blanc réutilisable (percussions, whoosh)
        const n = ctx.sampleRate * 0.6;
        noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    /** Débloque l'audio au premier geste utilisateur (règles navigateurs). */
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      ensure();
    }

    /** Une note (ou un glissando si slide est fourni). */
    /** Une valeur utilisable pour l'API audio (jamais NaN / Infinity). */
    const fin = (v, def) => (Number.isFinite(v) ? v : def);

    function tone(o) {
      const c = ensure(); if (!c) return;
      const freq = fin(o.freq, 440), dur = fin(o.dur, 0.1);
      if (dur <= 0) return;
      const t0 = c.currentTime + fin(o.delay, 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, fin(o.slide, freq)), t0 + dur);
      const vol = Math.max(0.0002, fin(o.gain, 0.25));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.03);
    }

    /** Percussion / whoosh à partir du bruit blanc. */
    function noise(o) {
      const c = ensure(); if (!c || !noiseBuf) return;
      const dur = fin(o.dur, 0.1);
      if (dur <= 0) return;
      const t0 = c.currentTime + fin(o.delay, 0);
      const src = c.createBufferSource(); src.buffer = noiseBuf;
      const f = c.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      const f0 = fin(o.freq, 1200);
      f.frequency.setValueAtTime(f0, t0);
      if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, fin(o.slide, f0)), t0 + dur);
      f.Q.value = fin(o.q, 1.6);
      const g = c.createGain();
      const vol = Math.max(0.0002, fin(o.gain, 0.2));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    }

    /** Arpège (gains, niveaux, jackpot). */
    function arp(freqs, o) {
      o = o || {};
      freqs.forEach((f, i) => tone({
        freq: f, dur: o.dur || 0.16, type: o.type || 'triangle',
        gain: o.gain || 0.22, delay: (o.delay || 0) + i * (o.step || 0.06)
      }));
    }

    const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

    return {
      unlock,
      setEnabled(on) { if (on) ensure(); else Sfx.ambience(false); },
      /** Clic UI discret */
      click() { tone({ freq: 620, dur: 0.045, type: 'square', gain: 0.07, slide: 780 }); },
      tap() { tone({ freq: 320, dur: 0.05, type: 'sine', gain: 0.10 }); },
      /** Mise posée (jeton) */
      chip() { noise({ freq: 2600, dur: 0.07, gain: 0.12, q: 2 }); tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.10 }); },
      bet() { arp([NOTES.C5, NOTES.E5], { step: 0.045, dur: 0.10, gain: 0.16 }); },
      /** Gain standard */
      win(mult) {
        mult = Number.isFinite(mult) ? mult : 1;
        if (mult >= 10) return arp([NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.E6], { step: 0.055, dur: 0.22, gain: 0.24 });
        if (mult >= 2) return arp([NOTES.C5, NOTES.E5, NOTES.G5], { step: 0.05, dur: 0.18, gain: 0.22 });
        return arp([NOTES.E5, NOTES.G5], { step: 0.05, dur: 0.15, gain: 0.20 });
      },
      bigwin() {
        arp([NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6], { step: 0.07, dur: 0.34, gain: 0.28 });
        noise({ freq: 900, slide: 5200, dur: 0.5, gain: 0.14, q: 0.9, filter: 'highpass' });
      },
      /** Perte */
      lose() { tone({ freq: 220, dur: 0.30, type: 'sawtooth', gain: 0.13, slide: 90 }); },
      bust() { tone({ freq: 180, dur: 0.7, type: 'sawtooth', gain: 0.2, slide: 45 }); noise({ freq: 420, slide: 90, dur: 0.65, gain: 0.16, filter: 'lowpass' }); },
      /** Tick de multiplicateur (crash / roue) */
      tick(v) { tone({ freq: 1000 + Math.min(900, (Number.isFinite(v) ? v : 0) * 40), dur: 0.035, type: 'square', gain: 0.055 }); },
      cashout() { arp([NOTES.G5, NOTES.C6, NOTES.E6], { step: 0.045, dur: 0.22, gain: 0.26 }); },
      /** Révélation de case (mines, keno) */
      reveal(safe) {
        if (safe) tone({ freq: 1180, dur: 0.11, type: 'triangle', gain: 0.16, slide: 1560 });
        else { tone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.22, slide: 60 }); noise({ freq: 500, slide: 100, dur: 0.5, gain: 0.18, filter: 'lowpass' }); }
      },
      coin() { tone({ freq: 1760, dur: 0.09, type: 'square', gain: 0.10, slide: 2400 }); tone({ freq: 2400, dur: 0.10, type: 'triangle', gain: 0.07, delay: 0.05 }); },
      levelup() { arp([NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.G5, NOTES.C6, NOTES.E6], { step: 0.08, dur: 0.3, gain: 0.24 }); },
      error() { tone({ freq: 170, dur: 0.16, type: 'square', gain: 0.14, slide: 120 }); },
      /** Recharge / bonus */
      bonus() { arp([NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6], { step: 0.07, dur: 0.28, gain: 0.24 }); },
      /** Compteur de roue qui ralentit */
      wheelTick(speed) { tone({ freq: 780 + (Number.isFinite(speed) ? speed : 0.5) * 340, dur: 0.03, type: 'square', gain: 0.05 }); },

      /* ------------------------------------------------- JINGLES DE GAIN --
         Un timbre par palier : le joueur entend la taille de son gain avant
         d'avoir lu le chiffre. Rien n'est joué pour une perte. */
      winJingle(mult) {
        mult = Number.isFinite(mult) ? mult : 1;
        if (!(mult > 1)) return;
        if (mult > 20) return Sfx.jackpot();
        if (mult > 5) {                                     // gros gain : montée + accord tenu
          arp([NOTES.C5, NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6], { step: 0.075, dur: 0.30, gain: 0.26 });
          tone({ freq: NOTES.C6, dur: 0.9, type: 'triangle', gain: 0.16, delay: 0.34 });
          tone({ freq: NOTES.E6, dur: 0.7, type: 'triangle', gain: 0.10, delay: 0.38 });
          noise({ freq: 700, slide: 4200, dur: 0.45, gain: 0.10, q: 0.8, filter: 'highpass' });
          return;
        }
        if (mult > 2) {                                     // gain notable : trois notes
          arp([NOTES.E5, NOTES.G5, NOTES.C6], { step: 0.06, dur: 0.22, gain: 0.24 });
          tone({ freq: NOTES.C6 * 2, dur: 0.30, type: 'sine', gain: 0.07, delay: 0.14 });
          return;
        }
        arp([NOTES.G5, NOTES.C6], { step: 0.055, dur: 0.16, gain: 0.20 });   // petit gain : deux notes
      },
      /** Fanfare de jackpot (multiplicateur ≥ 20). */
      jackpot() {
        const N = NOTES;
        arp([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], { step: 0.085, dur: 0.32, gain: 0.26 });
        arp([N.C6, N.G6], { step: 0.09, dur: 0.55, gain: 0.20, delay: 0.52, type: 'square' });
        tone({ freq: N.C5 / 2, dur: 1.4, type: 'triangle', gain: 0.20, delay: 0.5 });     // basse tenue
        tone({ freq: N.E6 * 2, dur: 1.1, type: 'sine', gain: 0.10, delay: 0.58 });
        noise({ freq: 500, slide: 7000, dur: 0.7, gain: 0.14, q: 0.7, filter: 'highpass' });
        noise({ freq: 2200, slide: 300, dur: 0.9, gain: 0.08, q: 0.6, filter: 'lowpass', delay: 0.4 });
      },
      /* -------------------------------------------------- NAPPE D'AMBIANCE --
         Deux oscillateurs légèrement désaccordés sous un filtre lent : une
         respiration sonore discrète, démarrée pendant une manche et coupée à la
         fin. Volume très bas (on doit l'oublier), coupée avec le son du jeu. */
      ambience(on) {
        if (!on) {
          if (Sfx._amb) {
            const c = Sfx._amb.ctx;
            try {
              Sfx._amb.gain.gain.cancelScheduledValues(c.currentTime);
              Sfx._amb.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
              const amb = Sfx._amb;
              setTimeout(() => { try { amb.osc.forEach((o) => o.stop()); } catch (e) { /* déjà arrêté */ } }, 1500);
            } catch (e) { /* contexte fermé */ }
            Sfx._amb = null;
          }
          return;
        }
        const c = ensure(); if (!c || Sfx._amb) return;
        const gain = c.createGain();
        gain.gain.value = 0.0001;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 620; filter.Q.value = 0.6;
        const lfo = c.createOscillator(), lfoGain = c.createGain();
        lfo.frequency.value = 0.07; lfoGain.gain.value = 220;
        lfo.connect(lfoGain).connect(filter.frequency);
        const osc = [220, 220.6, 329.63].map((f, i) => {
          const o = c.createOscillator();
          o.type = i === 2 ? 'triangle' : 'sine';
          o.frequency.value = f;
          const g = c.createGain(); g.gain.value = i === 2 ? 0.5 : 1;
          o.connect(g).connect(filter);
          o.start();
          return o;
        });
        filter.connect(gain).connect(master);
        gain.gain.setTargetAtTime(0.030, c.currentTime, 1.2);
        lfo.start();
        osc.push(lfo);
        Sfx._amb = { ctx: c, osc: osc, gain: gain };
      }
    };
  })());

  /* ------------------------------------------------------------ VIBRATIONS */
  /** Retour haptique court, désactivable dans les réglages. */
  J.haptic = {
    buzz(pattern) {
      if (!J.Store.state.settings.vibration) return;
      if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignoré */ } }
    },
    tap() { this.buzz(8); },
    win(mult) { mult = Number.isFinite(mult) ? mult : 1; this.buzz(mult >= 10 ? [16, 40, 16, 40, 60] : mult >= 2 ? [14, 30, 22] : 12); },
    lose() { this.buzz([28, 50, 28]); },
    big() { this.buzz([18, 44, 18, 44, 18, 60, 90]); }
  };

  /* ------------------------------------------------------------------ FX */
  /** Effets visuels : confettis (canvas plein écran), toasts, textes, secousses. */
  J.FX = (function () {
    const cv = document.getElementById('fxCanvas');
    let ctx = null, W = 0, H = 0, parts = [], raf = null;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      ctx = J.util.fitCanvas(cv, W, H);
    }
    resize();
    window.addEventListener('resize', () => { resize(); });

    const COLORS = ['#00e37a', '#ffc531', '#3b82f6', '#8b5cf6', '#ff4fa3', '#ffffff', '#00f085'];

    function loop() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += p.g;
        p.vx *= 0.995; p.vy *= 0.995;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        if (p.shape === 'ring') { p.grow = Math.min(1, (p.grow || 0) + 0.035); p.w += 9; }
        p.life -= 1;
        const alpha = Math.max(0, Math.min(1, p.life / 30));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'coin') {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.ellipse(0, 0, p.w * 0.5, p.w * 0.5 * Math.abs(Math.cos(p.rot)), 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'circle') {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'spark') {
          // Étincelle : traînée dans l'axe du déplacement, cœur brillant.
          const len = Math.min(26, Math.hypot(p.vx, p.vy) * 2.6);
          const ang = Math.atan2(p.vy, p.vx);
          ctx.rotate(ang);
          const grd = ctx.createLinearGradient(-len, 0, 0, 0);
          grd.addColorStop(0, 'rgba(255,255,255,0)');
          grd.addColorStop(1, p.color);
          ctx.fillStyle = grd;
          ctx.fillRect(-len, -p.w * 0.18, len, p.w * 0.36);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, p.w * 0.26, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'ring') {
          // Onde de choc : rayon qui s'étend, trait qui s'affine.
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.6, p.w * (1 - p.grow) * 0.5);
          ctx.beginPath(); ctx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2); ctx.stroke();
        } else if (p.shape === 'star') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const rr = k % 2 ? p.w * 0.22 : p.w * 0.5;
            const a = p.rot + (k * Math.PI) / 5;
            if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
        if (p.y > H + 60 || p.life <= 0) parts.splice(i, 1);
      }
      if (parts.length) raf = requestAnimationFrame(loop);
      else { raf = null; ctx.clearRect(0, 0, W, H); }
    }

    function kick() { if (!raf) raf = requestAnimationFrame(loop); }

    return {
      /** Pluie de confettis depuis un point (ou depuis le haut si x est omis). */
      confetti(opts) {
        if (!J.Store.state.settings.motion) return;
        opts = opts || {};
        const count = opts.count || 90;
        const ox = opts.x == null ? W / 2 : opts.x;
        const oy = opts.y == null ? -20 : opts.y;
        for (let i = 0; i < count; i++) {
          const ang = opts.x == null ? Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
          const sp = (opts.x == null ? 2 : 3) + Math.random() * (opts.power || 7);
          parts.push({
            x: ox + (Math.random() - 0.5) * (opts.spread || 40),
            y: oy,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1,
            g: 0.22 + Math.random() * 0.12,
            w: 4 + Math.random() * 6, h: 6 + Math.random() * 9,
            rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.34,
            color: opts.colors ? J.util.pick(opts.colors) : J.util.pick(COLORS),
            shape: opts.shape || (Math.random() < 0.25 ? 'circle' : 'rect'),
            life: 150 + Math.random() * 90
          });
        }
        kick();
      },
      /** Pluie de pièces dorées (gros gains, recharges). */
      coins(count, x, y) {
        this.confetti({ count: count || 34, shape: 'coin', spread: 26, power: 8, x: x, y: y,
          colors: ['#ffc531', '#ffe08a', '#e0a000', '#fff3c4'] });
      },

      /** Étincelles + onde de choc rayonnant depuis un point (gros gains). */
      burst(opts) {
        if (!J.Store.state.settings.motion) return;
        opts = opts || {};
        const x = opts.x == null ? W / 2 : opts.x;
        const y = opts.y == null ? H / 2 : opts.y;
        const n = opts.count || 26;
        const colors = opts.colors || ['#ffc531', '#fff3c4', '#00e37a', '#ffffff'];
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
          const sp = (opts.power || 9) * (0.55 + Math.random() * 0.75);
          parts.push({
            x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            g: 0.05 + Math.random() * 0.06, w: 3 + Math.random() * 3, h: 3,
            rot: ang, vr: 0, shape: 'spark',
            color: J.util.pick(colors), life: 46 + Math.random() * 34
          });
        }
        for (let i = 0; i < 4; i++) {
          parts.push({
            x, y, vx: 0, vy: 0, g: 0, w: 12 + i * 16, h: 0, rot: 0, vr: 0, grow: 0,
            shape: 'ring', color: i % 2 ? 'rgba(255,255,255,.85)' : (opts.ringColor || '#ffc531'),
            life: 26 + i * 5
          });
        }
        for (let i = 0; i < Math.round(n / 3); i++) {
          const ang = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
          parts.push({
            x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.5,
            g: 0.12, w: 7 + Math.random() * 7, h: 7, rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3, shape: 'star',
            color: J.util.pick(colors), life: 90 + Math.random() * 60
          });
        }
        kick();
      },

      /** Halo doré + montant qui s'envole du compteur de solde. */
      pulseBalance(payout) {
        const box = document.getElementById('balancePill') || document.getElementById('balanceVal');
        if (!box || !J.Store.state.settings.motion) return;
        box.classList.remove('is-pulse'); void box.offsetWidth; box.classList.add('is-pulse');
        setTimeout(() => box.classList.remove('is-pulse'), 900);
        const val = document.getElementById('balanceVal');
        if (val && payout > 0) {
          // Décalé au-dessus du compteur : sinon le montant recouvre le solde.
          const r = val.getBoundingClientRect();
          J.floatText('+' + J.util.fmt(payout), {
            x: r.width ? r.left + r.width / 2 : null,
            y: r.height ? r.top - 22 : null,
            color: 'var(--gold)', size: 18
          });
        }
      },

      /**
       * Bandeau de gain au centre de l'écran : « GAIN », « BIG WIN » ou
       * « JACKPOT » selon le palier. Retiré de lui-même après l'animation.
       */
      banner(headline, sub, tier) {
        if (!J.Store.state.settings.motion) return;
        const old = document.getElementById('winBanner');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'winBanner';
        el.className = 'win-banner is-' + (tier || 'win');
        const h = document.createElement('div'); h.className = 'wb-h'; h.textContent = headline;
        el.appendChild(h);
        if (sub) { const b = document.createElement('div'); b.className = 'wb-s'; b.textContent = sub; el.appendChild(b); }
        document.body.appendChild(el);
        setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 1500);
      },

      /* ---------------------------------------------------------------------
         CÉLÉBRATION D'UN GAIN
         Point de passage unique pour les 16 jeux : le palier est déduit du
         multiplicateur, l'effet part de l'élément de gain du plateau quand il
         est fourni. `mult <= 1` ne déclenche rien (une perte n'est pas fêtée).
         ------------------------------------------------------------------- */
      celebrate(opts) {
        opts = opts || {};
        const mult = Number.isFinite(opts.mult) ? opts.mult : 0;
        const payout = Math.max(0, Math.round(opts.payout || 0));
        if (!(mult > 1) || payout <= 0) return false;
        const motion = J.Store.state.settings.motion;
        // Position de départ des particules : l'élément de gain, sinon le centre.
        let x = opts.x, y = opts.y;
        if (x == null || y == null) {
          const el = opts.el;
          if (el && el.getBoundingClientRect) {
            const r = el.getBoundingClientRect();
            if (r.width && r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
          }
          if (x == null || y == null) { x = window.innerWidth / 2; y = Math.min(window.innerHeight * 0.42, window.innerHeight - 90); }
        }
        const big = mult > 20, strong = mult > 5, nice = mult > 2;

        // --- texte flottant + son (toujours)
        J.floatText('+' + J.util.fmt(payout), {
          x: x, y: y - 8, color: big ? 'var(--gold)' : 'var(--green)',
          size: big ? 30 : strong ? 26 : nice ? 22 : 19
        });
        if (!opts.silent) J.Sfx.winJingle(mult);
        if (!opts.silent) (big ? J.haptic.big() : J.haptic.win(mult));

        if (!motion) return true;

        // --- particules : graduées selon le palier
        if (nice) this.confetti({ count: strong ? (big ? 150 : 80) : 38, x: x, y: y, power: strong ? 9 : 6, spread: 60 });
        if (strong) this.coins(big ? 70 : 26, x, y - 10);
        if (big) this.burst({ x: x, y: y, count: 34, power: 11 });

        // --- bandeau de palier
        if (strong) {
          this.banner(big ? 'JACKPOT' : 'BIG WIN', J.util.fmtMult(mult) + '  ·  +' + J.util.fmt(payout) + ' J',
            big ? 'jackpot' : 'big');
          window.setTimeout(() => J.shake(document.getElementById('gameShell') || document.getElementById('app')), 40);
          this.flash(big ? '#ffc531' : '#00e37a', big ? 0.34 : 0.18);
        }
        this.pulseBalance(payout);
        return true;
      },

      /** Voile coloré bref sur toute la coque (accentue les gros gains). */
      flash(color, strength) {
        const app = document.getElementById('app');
        if (!app || !J.Store.state.settings.motion) return;
        const el = document.createElement('div');
        el.className = 'fx-flash';
        el.style.background = 'radial-gradient(circle at 50% 42%, ' + color + ' 0%, transparent 62%)';
        el.style.opacity = String(strength == null ? 0.25 : strength);
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 620);
      },
      /** Confettis masqués si le mode « mouvement » est désactivé */
      enabled() { return J.Store.state.settings.motion; }
    };
  })();

  /* --------------------------------------------------------------- TOASTS */
  /** Messages courts en bas d'écran. */
  J.toast = function (msg, type) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = msg;
    root.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, type === 'ko' ? 2600 : 2100);
    if (root.children.length > 3) root.firstChild.remove();
  };

  /* ------------------------------------------------------ TEXTE FLOTTANT */
  /** "+1 250" qui s'envole depuis un point de l'écran (ou d'un élément). */
  J.floatText = function (text, opts) {
    opts = opts || {};
    let x, y;
    if (opts.el) {
      const r = opts.el.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    } else { x = opts.x == null ? window.innerWidth / 2 : opts.x; y = opts.y == null ? window.innerHeight / 2 : opts.y; }
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = text;
    el.style.left = (x - 30) + 'px';
    el.style.top = (y - 14) + 'px';
    el.style.color = opts.color || 'var(--green)';
    el.style.fontSize = (opts.size || 20) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  };

  /** Bandeau de gain centré dans un conteneur (stage de jeu). */
  J.winBurst = function (container, text, color) {
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'win-burst';
    const t = document.createElement('div');
    t.className = 'wb-txt';
    t.textContent = text;
    if (color) t.style.color = color;
    wrap.appendChild(t);
    container.appendChild(wrap);
    setTimeout(() => wrap.remove(), 950);
  };

  /** Secousse d'un élément (échec, crash, bombe). */
  J.shake = function (el) {
    if (!el || !J.Store.state.settings.motion) return;
    el.classList.remove('screen-shake');
    void el.offsetWidth;
    el.classList.add('screen-shake');
    setTimeout(() => el.classList.remove('screen-shake'), 450);
  };

  /** Flash rouge discret sur la coque de l'app (perte importante). */
  J.redFlash = function () {
    const app = document.getElementById('app');
    if (!app || !J.Store.state.settings.motion) return;
    app.classList.remove('red-flash'); void app.offsetWidth; app.classList.add('red-flash');
    setTimeout(() => app.classList.remove('red-flash'), 520);
  };
})();
