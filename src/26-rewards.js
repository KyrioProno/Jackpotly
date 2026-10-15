/* =========================================================================
   JACKPOTLY — RÉCOMPENSES QUOTIDIENNES
   · Bonus quotidien (cycle de 7 jours avec série)
   · Roue de la chance (1 tour gratuit par jour, animation canvas)
   · Recharge gratuite quand le solde tombe à zéro (avec délai)
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  /** Cycle du bonus quotidien (jetons). */
  const DAILY_CYCLE = [500, 750, 1000, 1500, 2000, 3000, 5000];
  const DAY_MS = 24 * 3600 * 1000;

  const isSameDay = (ts) => !!ts && U.dayKey(ts) === U.dayKey();
  /** Série maintenue si le dernier retrait date de moins de 48 h. */
  const keepsStreak = (ts) => !!ts && (Date.now() - ts) < 2 * DAY_MS && !isSameDay(ts);

  const Rewards = (J.Rewards = {
    DAILY_CYCLE,

    /* --------------------------------------------------------- BONUS QUOTIDIEN */
    canClaimDaily() { return !isSameDay(J.Store.state.daily.lastClaim); },

    /** Position dans le cycle de 7 jours (0-6) pour le prochain retrait. */
    dailyIndex() {
      const d = J.Store.state.daily;
      if (isSameDay(d.lastClaim)) return U.clamp((d.streak || 1) - 1, 0, 6);  // jour déjà pris : on l'affiche
      return keepsStreak(d.lastClaim) ? U.clamp(d.streak || 0, 0, 6) : 0;
    },

    openDaily() {
      const d = J.Store.state.daily;
      const claimable = Rewards.canClaimDaily();
      const idx = Rewards.dailyIndex();
      const cards = DAILY_CYCLE.map((v, i) =>
        '<div class="card pad center" style="padding:9px 5px;' +
        (i === idx ? 'border-color:rgba(0,227,122,.55);box-shadow:var(--sh-green)' : 'opacity:.7') + '">' +
          '<div class="sub" style="font-size:9.5px">JOUR ' + (i + 1) + '</div>' +
          '<div class="mono" style="font-size:12.5px;font-weight:' + (i === idx ? 800 : 600) + ';color:' + (i === idx ? 'var(--green)' : 'var(--txt-2)') + '">' + U.fmtK(v) + '</div>' +
        '</div>').join('');

      J.UI.modal({
        title: '🎁 Bonus quotidien',
        sub: 'Jour ' + (idx + 1) + ' du cycle · ' + (d.claims || 0) + ' bonus déjà reçus',
        body:
          '<div class="note">Connecte-toi chaque jour : la récompense grimpe jusqu\'au 7ᵉ jour, puis le cycle recommence. ' +
          'Aucun paiement requis — ce sont des jetons virtuels offerts.</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px" class="mt">' + cards + '</div>',
        actions: claimable
          ? [{ label: 'Récupérer ' + U.fmt(DAILY_CYCLE[idx]) + ' jetons', cls: 'gold', onClick: () => Rewards.claimDaily() }]
          : [{ label: 'Déjà récupéré — à demain !', cls: 'ghost' }]
      });
    },

    claimDaily() {
      if (!Rewards.canClaimDaily()) return 0;
      const d = J.Store.state.daily;
      const idx = Rewards.dailyIndex();
      const amount = DAILY_CYCLE[idx];
      d.lastClaim = Date.now();
      d.streak = (idx + 1) % 7;          // index du prochain jour (cycle de 7)
      d.claims = (d.claims || 0) + 1;
      d.best = Math.max(d.best || 0, d.claims);
      J.Store.save();
      J.Wallet.credit(amount, 'daily');
      J.Sfx.bonus(); J.haptic.win(5);
      J.FX.coins(40);
      J.floatText('+' + U.fmt(amount), { color: 'var(--gold)', size: 26, y: window.innerHeight * 0.34 });
      J.toast('Bonus quotidien : +' + U.fmt(amount) + ' jetons', 'gold');
      J.UI.renderVipChip();
      J.Screen.renderAll();
      return amount;
    },

    /* ---------------------------------------------------- ROUE DE LA CHANCE */
    canSpinWheel() { return !isSameDay(J.Store.state.daily.wheelLast); },

    SEGMENTS: [
      { v: 250,  label: '250',   w: 20, color: '#1d2a45' },
      { v: 750,  label: '750',   w: 18, color: '#00b862' },
      { v: 1500, label: '1,5k',  w: 14, color: '#1d2a45' },
      { v: 500,  label: '500',   w: 18, color: '#e0a000' },
      { v: 3000, label: '3k',    w: 9,  color: '#1d2a45' },
      { v: 1000, label: '1k',    w: 12, color: '#3b82f6' },
      { v: 5000, label: '5k',    w: 5,  color: '#8b5cf6' },
      { v: 10000, label: '10k',  w: 2,  color: '#ffc531' },
      { v: 25000, label: '25k',  w: 1,  color: '#ff4fa3' },
      { v: 0,    label: 'Perdu', w: 1,  color: '#ff4d5e' }
    ],

    /** Espérance de gain du tour gratuit (moyenne pondérée des segments). */
    expectedPrize() {
      const segs = Rewards.SEGMENTS;
      const total = segs.reduce((s, x) => s + x.w, 0);
      return Math.round(segs.reduce((s, x) => s + x.v * x.w, 0) / total);
    },

    openWheel() {
      const canSpin = Rewards.canSpinWheel();
      J.UI.modal({
        title: '🎡 Roue de la chance',
        sub: canSpin ? 'Un tour gratuit par jour' : 'Prochain tour gratuit demain',
        body:
          '<div class="wheel-wrap"><canvas id="wheelCv"></canvas>' +
          '<div class="wheel-needle"></div><div class="wheel-hub" id="wheelHub">' + (canSpin ? 'TOURNE<br>GRATUIT' : 'DÉJÀ<br>TOURNÉE') + '</div></div>' +
          '<div id="wheelOut" class="note center">' + (canSpin
            ? 'Tente ta chance : les jetons gagnés sont virtuels (aucune valeur monétaire).'
            : 'Tu as déjà utilisé ton tour gratuit aujourd\'hui. Reviens demain !') + '</div>' +
          '<div class="sub center mt-s" style="font-size:10px">Tour gratuit · gain moyen ' + U.fmt(Rewards.expectedPrize()) + ' jetons (calculé sur les probabilités des segments)</div>',
        actions: [
          { label: canSpin ? '🎡 Tourner' : 'Revenir demain', cls: canSpin ? 'gold' : 'ghost', keepOpen: true,
            onClick: () => { if (canSpin) Rewards.spin(); } },
          { label: 'Fermer', cls: 'ghost' }
        ]
      });
      if (Rewards._angle == null) Rewards._angle = -Math.PI / 2;
      const cv = document.getElementById('wheelCv');
      if (cv) Rewards.drawWheel(cv, Rewards._angle);
    },

    /** Dessine la roue à un angle donné (radians). */
    drawWheel(cv, angle) {
      const seg = Rewards.SEGMENTS;
      const S = 246;
      const ctx = J.util.fitCanvas(cv, S, S);
      const cx = S / 2, cy = S / 2, R = S / 2 - 8;
      ctx.clearRect(0, 0, S, S);
      const n = seg.length, step = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        const a0 = angle + i * step, a1 = a0 + step;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = seg[i].color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a0 + step / 2);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = seg[i].v === 0 ? '#fff' : '#eaf2ff';
        ctx.font = '700 13px -apple-system, system-ui, sans-serif';
        ctx.fillText(seg[i].label, R - 12, 0);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,197,49,.65)'; ctx.lineWidth = 5; ctx.stroke();
    },

    /** Lance la rotation : le résultat est tiré AVANT l'animation (provably fair). */
    spin() {
      if (!Rewards.canSpinWheel() || Rewards._spinning) return;
      Rewards._spinning = true;
      const seg = Rewards.SEGMENTS;
      const winner = J.Fair.weighted(seg, (s) => s.w);      // tirage HMAC vérifiable
      const idx = seg.indexOf(winner);
      const n = seg.length, step = (Math.PI * 2) / n;
      const hub = document.getElementById('wheelHub');
      if (hub) hub.textContent = '…';

      // Le centre du secteur gagnant doit finir sous l'aiguille (haut = -π/2)
      const from = Rewards._angle || 0;
      const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const targetNorm = norm(-Math.PI / 2 - (idx * step + step / 2));
      const delta = norm(targetNorm - from) + Math.PI * 2 * 5;   // 5 tours + ajustement
      const target = from + delta;
      const dur = 4200, t0 = performance.now();
      let lastTick = 0;

      const frame = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3.4);
        const ang = from + delta * e;
        Rewards._angle = ang;
        const cv = document.getElementById('wheelCv');
        if (cv) Rewards.drawWheel(cv, ang);
        const speed = delta * 3.4 * Math.pow(Math.max(0.001, 1 - p), 2.4) / (dur / 1000);
        if (t - lastTick > 55 && speed > 1.5) { lastTick = t; J.Sfx.wheelTick(U.clamp(speed / 40, 0, 1)); }
        if (p < 1) requestAnimationFrame(frame);
        else { Rewards._spinning = false; Rewards.finishSpin(winner); }
      };
      requestAnimationFrame(frame);
    },

    finishSpin(winner) {
      const st = J.Store.state;
      st.daily.wheelLast = Date.now();
      st.daily.wheelSpins = (st.daily.wheelSpins || 0) + 1;
      J.Store.save();
      const hub = document.getElementById('wheelHub');
      const out = document.getElementById('wheelOut');
      if (winner.v > 0) {
        J.Wallet.credit(winner.v, 'wheel');
        J.Sfx.bigwin(); J.haptic.big();
        J.FX.confetti({ count: 120, x: window.innerWidth / 2, y: window.innerHeight * 0.4 });
        if (hub) hub.innerHTML = '+' + U.fmtK(winner.v);
        if (out) out.innerHTML = '🎉 <b class="gold">+' + U.fmt(winner.v) + ' jetons</b> ! Reviens demain pour un nouveau tour gratuit.';
        J.floatText('+' + U.fmt(winner.v), { color: 'var(--gold)', size: 26, y: window.innerHeight * 0.4 });
      } else {
        J.Sfx.lose();
        if (hub) hub.innerHTML = 'RATÉ';
        if (out) out.innerHTML = '😅 Aucun gain cette fois. Nouveau tour gratuit demain !';
      }
      J.UI.renderVipChip();
      J.Screen.renderAll();
    },

    /* ---------------------------------------------- RECHARGE GRATUITE (solde 0) */
    /** État de la recharge gratuite : disponible ? délai restant ? */
    rechargeState() {
      const f = J.Store.state.freeChips;
      const day = U.dayKey();
      if (f.day !== day) { f.day = day; f.used = 0; f.readyAt = 0; J.Store.save(); }
      const started = (f.readyAt || 0) > 0;                       // délai lancé par le joueur
      const readyIn = Math.max(0, (f.readyAt || 0) - Date.now());
      const left = Math.max(0, J.CONST.FREE_CHIPS_PER_DAY - f.used);
      return {
        amount: J.CONST.FREE_CHIPS, used: f.used, left, readyIn, started,
        // Prêt uniquement après le délai : cela évite le rachat compulsif
        ready: started && readyIn <= 0 && left > 0
      };
    },

    /** Démarre le compte à rebours (petit délai anti-spam). */
    startRechargeTimer() {
      const f = J.Store.state.freeChips;
      if (f.used >= J.CONST.FREE_CHIPS_PER_DAY) return false;
      f.readyAt = Date.now() + J.CONST.FREE_CHIPS_DELAY;
      J.Store.save();
      J.Screen.renderAll();
      return true;
    },

    /** Encaissement effectif de la recharge gratuite. */
    claimFreeChips() {
      const st = Rewards.rechargeState();
      if (!st.ready) return 0;
      const f = J.Store.state.freeChips;
      f.used++; f.readyAt = 0;
      J.Store.save();
      J.Wallet.credit(J.CONST.FREE_CHIPS, 'free-chips');
      J.Sfx.bonus(); J.FX.coins(26); J.toast('+' + U.fmt(J.CONST.FREE_CHIPS) + ' jetons offerts', 'ok');
      J.Screen.renderAll();
      J.Bus.emit('funds:changed');
      return J.CONST.FREE_CHIPS;
    },

    /** Fenêtre « solde épuisé » : recharge gratuite ou boutique. */
    openRecharge() {
      clearInterval(Rewards._rechargeTick);
      const st = Rewards.rechargeState();

      function bodyHtml(s) {
        return '<div class="note warn">Ton solde de jetons virtuels est épuisé. Tu peux recharger gratuitement ' +
          'jusqu\'à ' + J.CONST.FREE_CHIPS_PER_DAY + ' fois par jour (avec un court délai de ' + Math.round(J.CONST.FREE_CHIPS_DELAY / 1000) + ' s), ' +
          'ou prendre un pack dans la boutique.</div>' +
          '<div class="kv mt"><span class="k">Recharges gratuites restantes aujourd\'hui</span><span class="v">' + s.left + ' / ' + J.CONST.FREE_CHIPS_PER_DAY + '</span></div>' +
          '<div class="kv"><span class="k">Montant par recharge</span><span class="v gold">' + U.fmt(s.amount) + ' J</span></div>' +
          '<div id="rechargeMsg" class="note mt">' + (s.left === 0
            ? 'Limite quotidienne atteinte. Reviens demain, ou prends un pack (achat simulé).'
            : s.readyIn > 0 ? 'Recharge prête dans ' + Math.ceil(s.readyIn / 1000) + ' s…'
            : 'Appuie sur « Lancer le délai » : la recharge se débloque après un court temps d\'attente.') + '</div>' +
          '<div class="note mt-s">Les jetons n\'ont aucune valeur monétaire et ne peuvent pas être retirés. ' +
          'Cette limite quotidienne encourage un jeu maîtrisé.</div>';
      }

      function actionsFor(s) {
        const a = [];
        if (s.left > 0) {
          a.push({
            label: s.ready ? '🎁 Recharger ' + U.fmt(s.amount) + ' jetons'
                           : (s.readyIn > 0 ? '⏳ Patienter ' + Math.ceil(s.readyIn / 1000) + ' s'
                                            : '⏳ Lancer le délai (' + Math.round(J.CONST.FREE_CHIPS_DELAY / 1000) + ' s)'),
            cls: s.ready ? 'primary' : 'ghost', keepOpen: true,
            onClick: () => {
              const now = Rewards.rechargeState();
              if (now.ready) { if (Rewards.claimFreeChips()) { J.UI.closeModal(); } }
              else if (!now.started) {
                Rewards.startRechargeTimer();
                J.toast('Recharge lancée : ' + Math.round(J.CONST.FREE_CHIPS_DELAY / 1000) + ' s d\'attente', 'ok');
                Rewards.openRecharge();
              }
            }
          });
        }
        a.push({ label: '🛒 Boutique', cls: 'gold', onClick: () => { J.UI.closeSheet(); J.UI.go('shop'); } });
        a.push({ label: 'Fermer', cls: 'ghost' });
        return a;
      }

      J.UI.modal({
        title: '💸 Solde épuisé',
        sub: 'Jetons virtuels — aucune valeur monétaire',
        body: bodyHtml(st), actions: actionsFor(st)
      });

      // Compte à rebours vivant : met à jour le message puis l'état du bouton
      if (st.readyIn > 0) {
        Rewards._rechargeTick = setInterval(() => {
          const s = Rewards.rechargeState();
          const msg = document.getElementById('rechargeMsg');
          if (!msg || !J.UI.isModalOpen()) { clearInterval(Rewards._rechargeTick); return; }
          if (s.ready) {
            clearInterval(Rewards._rechargeTick);
            Rewards.openRecharge();     // réaffiche avec le bouton actif
          } else {
            msg.textContent = 'Recharge prête dans ' + Math.ceil(s.readyIn / 1000) + ' s…';
            const btn = document.querySelector('#modalBox [data-actions] .btn.ghost');
            if (btn) btn.textContent = '⏳ Patienter ' + Math.ceil(s.readyIn / 1000) + ' s';
          }
        }, 1000);
      }
    }
  });
})();
