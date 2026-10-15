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
    function tone(o) {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + o.dur);
      const vol = (o.gain == null ? 0.25 : o.gain);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, o.dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(g).connect(master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.03);
    }

    /** Percussion / whoosh à partir du bruit blanc. */
    function noise(o) {
      const c = ensure(); if (!c || !noiseBuf) return;
      const t0 = c.currentTime + (o.delay || 0);
      const src = c.createBufferSource(); src.buffer = noiseBuf;
      const f = c.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.slide), t0 + o.dur);
      f.Q.value = o.q == null ? 1.6 : o.q;
      const g = c.createGain();
      const vol = o.gain == null ? 0.2 : o.gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(f).connect(g).connect(master);
      src.start(t0); src.stop(t0 + o.dur + 0.02);
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
      setEnabled(on) { if (on) ensure(); },
      /** Clic UI discret */
      click() { tone({ freq: 620, dur: 0.045, type: 'square', gain: 0.07, slide: 780 }); },
      tap() { tone({ freq: 320, dur: 0.05, type: 'sine', gain: 0.10 }); },
      /** Mise posée (jeton) */
      chip() { noise({ freq: 2600, dur: 0.07, gain: 0.12, q: 2 }); tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.10 }); },
      bet() { arp([NOTES.C5, NOTES.E5], { step: 0.045, dur: 0.10, gain: 0.16 }); },
      /** Gain standard */
      win(mult) {
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
      tick(v) { tone({ freq: 1000 + Math.min(900, v * 40), dur: 0.035, type: 'square', gain: 0.055 }); },
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
      wheelTick(speed) { tone({ freq: 780 + speed * 340, dur: 0.03, type: 'square', gain: 0.05 }); }
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
    win(mult) { this.buzz(mult >= 10 ? [16, 40, 16, 40, 60] : mult >= 2 ? [14, 30, 22] : 12); },
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
      coins(count) { this.confetti({ count: count || 34, shape: 'coin', spread: 26, power: 8, colors: ['#ffc531', '#ffe08a', '#e0a000', '#fff3c4'] }); },
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
