/* =========================================================================
   JACKPOTLY — UI KIT
   Navigation entre écrans, modales, feuilles glissantes, barre supérieure,
   rappels de jeu responsable, helpers d'affichage partagés.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const UI = (J.UI = {});
  let current = 'home';
  let modalOpen = false, sheetOpen = false;

  /* ---------------------------------------------------------------- ÉCRANS */
  const SCREEN_NAV = { home: 'home', originals: 'originals', rank: 'rank', shop: 'shop', profile: 'profile', game: null };

  /** Affiche un écran (avec fondu) et met à jour la navigation basse. */
  /* Ordre des onglets de la barre basse : il donne le SENS du glissement
     (les écrans défilent de gauche à droite comme les onglets). */
  const TAB_ORDER = ['home', 'originals', 'rank', 'shop', 'profile'];

  UI.go = function (id) {
    if (!SCREEN_NAV.hasOwnProperty(id)) id = 'home';
    if (id === current && id !== 'game') return;
    // Quitter l'écran de jeu libère le jeu monté (boucles, timers, ticket ouvert)
    if (current === 'game' && id !== 'game' && J.Games) J.Games.close(true);
    const prev = document.getElementById('screen-' + current);
    const next = document.getElementById('screen-' + id);
    const from = TAB_ORDER.indexOf(current), to = TAB_ORDER.indexOf(id);
    const dir = from >= 0 && to >= 0 ? (to > from ? 'right' : to < from ? 'left' : 'right') : 'right';
    if (prev && prev !== next) {
      prev.classList.remove('is-on', 'enter-right', 'enter-left');
      // L'écran sortant s'efface du côté opposé à l'arrivée du nouveau.
      prev.classList.add(dir === 'right' ? 'leave-left' : 'leave-right');
      window.setTimeout(() => prev.classList.remove('leave-left', 'leave-right'), 260);
      J.Bus.emit('screen:leave', current);
    }
    current = id;
    if (next) {
      next.classList.remove('leave-left', 'leave-right');
      next.classList.add('enter-' + dir);          // position de départ
      void next.offsetWidth;                       // on force un reflow
      next.classList.add('is-on');
      next.scrollTop = id === 'game' ? 0 : next.scrollTop;
      // Arrivée : on relâche la position, puis les blocs du nouvel écran
      // apparaissent en cascade (les écrans de jeu ont leurs propres animations).
      const target = next;
      requestAnimationFrame(() => {
        target.classList.remove('enter-right', 'enter-left');
        if (id !== 'game') {
          Array.prototype.forEach.call(target.children, (el) => {
            const pos = getComputedStyle(el).position;
            if (pos === 'fixed' || pos === 'absolute') return;
            el.classList.remove('cascade');
            void el.offsetWidth;
            el.classList.add('cascade');
          });
        }
      });
    }
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.go === id));
    J.Bus.emit('screen:enter', id);
  };

  UI.current = () => current;

  /* ---------------------------------------------------------------- MODALES */
  const root = document.getElementById('modalRoot');
  const box = document.getElementById('modalBox');

  /** Ouvre une modale. actions = [{label, cls, onClick(close)}] */
  UI.modal = function (opts) {
    opts = opts || {};
    box.innerHTML =
      '<div class="modal-head">' +
        '<div><div class="mh-t">' + (opts.title || '') + '</div>' +
        (opts.sub ? '<div class="mh-s">' + opts.sub + '</div>' : '') + '</div>' +
        (opts.closable === false ? '' : '<button class="modal-x" data-close>✕</button>') +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.actions && opts.actions.length
        ? '<div class="btn-row ' + (opts.actions.length === 2 ? 'two' : opts.actions.length >= 3 ? 'three' : '') + ' mt-l" data-actions></div>'
        : '');
    const act = box.querySelector('[data-actions]');
    if (act) {
      opts.actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'btn ' + (a.cls || '');
        b.innerHTML = a.label;
        b.onclick = () => { if (a.keepOpen !== true) UI.closeModal(); if (a.onClick) a.onClick(); };
        act.appendChild(b);
      });
    }
    root.classList.add('is-on');
    modalOpen = true;
    J.Sfx.tap();
    return box;
  };

  UI.closeModal = function () {
    root.classList.remove('is-on');
    modalOpen = false;
    setTimeout(() => { if (!modalOpen) box.innerHTML = ''; }, 220);
  };
  UI.isModalOpen = () => modalOpen;

  root.addEventListener('click', (e) => {
    if (e.target === root) UI.closeModal();
    else if (e.target.closest('[data-close]')) UI.closeModal();
  });

  /** Confirmation générique. */
  UI.confirm = function (title, text, onOk, okLabel) {
    UI.modal({
      title, sub: text, closable: true,
      actions: [
        { label: 'Annuler', cls: 'ghost' },
        { label: okLabel || 'Confirmer', cls: 'primary', onClick: onOk }
      ]
    });
  };

  /* ------------------------------------------------------- FEUILLES (sheet) */
  const sheet = document.getElementById('sheetRoot');

  /** Feuille glissante depuis le bas (menus, réglages, aide). */
  UI.sheet = function (html, opts) {
    opts = opts || {};
    sheet.innerHTML = '<div class="sheet-grip"></div>' + html;
    sheet.classList.add('is-on');
    sheetOpen = true;
    if (opts.onMount) opts.onMount(sheet);
    return sheet;
  };
  UI.closeSheet = function () { sheet.classList.remove('is-on'); sheetOpen = false; setTimeout(() => { if (!sheetOpen) sheet.innerHTML = ''; }, 300); };
  UI.isSheetOpen = () => sheetOpen;

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) UI.closeSheet();
  });

  // Retour arrière / clic hors zone : ferme ce qui est ouvert
  document.addEventListener('click', (e) => {
    if (sheetOpen && !sheet.contains(e.target) && !e.target.closest('[data-keep-sheet]')) UI.closeSheet();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (modalOpen) UI.closeModal(); else if (sheetOpen) UI.closeSheet(); }
  });

  /* ---------------------------------------------------- LOGO / SOLDE (topbar) */
  /** Affiche le niveau VIP dans la barre supérieure. */
  UI.renderVipChip = function () {
    const info = J.Wallet.vipInfo();
    const el = document.getElementById('brandSub');
    if (el) el.textContent = 'NIVEAU ' + info.tier.name.toUpperCase();
    const dot = document.getElementById('dailyDot');
    if (dot) dot.style.display = J.Rewards && J.Rewards.canClaimDaily() ? 'block' : 'none';
  };

  /** Modale de passage de niveau VIP. */
  UI.showVipUp = function (info) {
    const tier = info.tier;
    const claimable = !J.Store.state.vip.claimedLevels.includes(info.index) && tier.reward > 0;
    UI.modal({
      title: '🏅 Niveau ' + tier.name + ' atteint !',
      sub: 'Total misé : ' + U.fmt(info.wagered) + ' jetons',
      body:
        '<div class="note">Bravo ! Tu progresses dans le programme VIP. Plus tu joues (en jetons virtuels), ' +
        'plus le rakeback et les récompenses augmentent.</div>' +
        (tier.reward ? '<div class="card pad mt"><div class="row between"><span class="sub">Récompense de palier</span>' +
          '<span class="mono gold">' + U.fmt(tier.reward) + ' J</span></div></div>' : ''),
      actions: claimable
        ? [{ label: 'Récupérer', cls: 'gold', onClick: () => { const r = J.Wallet.claimVipReward(); if (r) { J.Sfx.bonus(); J.FX.coins(30); J.toast('+' + U.fmt(r) + ' jetons VIP', 'gold'); } UI.renderVipChip(); } }]
        : [{ label: 'Continuer', cls: 'primary' }]
    });
  };

  /* -------------------------------------------------------- AIDE & RÈGLES */
  /** Règle du jeu en un tap : ouvre la fiche du jeu courant. */
  UI.gameInfo = function (game) {
    UI.sheet(
      '<div class="row between"><div class="h2">' + game.name + '</div>' +
      '<button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="sub mt-s">Comment jouer</div>' +
      '<div class="note mt">' + game.rules + '</div>' +
      '<div class="section-head mt-l"><div class="h2">Chances & RTP</div></div>' +
      '<div class="kv"><span class="k">RTP (retour joueur)</span><span class="v up">' + game.rtp + ' %</span></div>' +
      '<div class="kv"><span class="k">Type</span><span class="v">' + (game.category === 'classics' ? 'Classique' : 'Original') + '</span></div>' +
      (game.volatility ? '<div class="kv"><span class="k">Volatilité</span><span class="v">' + game.volatility + '</span></div>' : '') +
      '<div class="note mt-l">Le RTP est le taux de retour théorique sur de très nombreuses parties. ' +
      'Sur une session courte, le hasard domine : les résultats sont indépendants les uns des autres.</div>' +
      '<button class="btn ghost block mt-l" data-close-sheet>Compris</button>'
    );
  };

  /* ------------------------------------------------- RAPPEL DE PAUSE 30 MIN */
  let lastPause = Date.now();
  UI.touchActivity = function () { lastPause = Date.now(); };

  setInterval(() => {
    if (!J.Store.state.settings.autoPause) return;
    if (Date.now() - lastPause < J.CONST.PAUSE_MS) return;
    lastPause = Date.now();
    const s = J.Store.state.session;
    const dur = Date.now() - s.startedAt;
    UI.modal({
      title: '⏸️ Petite pause ?',
      sub: 'Tu joues depuis ' + U.fmtDur(dur),
      body:
        '<div class="note warn">Les jeux de hasard doivent rester un divertissement. ' +
        'Fais une pause, respire, et fixe-toi une limite de jetons avant de continuer.</div>' +
        '<div class="kv mt"><span class="k">Parties jouées cette session</span><span class="v">' + s.rounds + '</span></div>' +
        '<div class="kv"><span class="k">Total misé aujourd\'hui</span><span class="v">' + U.fmt(J.Store.state.stats.wagered) + ' J</span></div>',
      actions: [
        { label: 'Prendre une pause', cls: 'ghost', onClick: () => { UI.go('profile'); UI.openResponsible(); } },
        { label: 'Je continue', cls: 'primary' }
      ]
    });
  }, 60000);

  /* ------------------------------------------------------------ MENU GLOBAL */
  UI.openMenu = function () {
    const st = J.Store.state;
    UI.sheet(
      '<div class="row between"><div class="h2">Menu</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="mt"></div>' +
      '<button class="btn ghost block" data-menu="daily">🎁 Bonus quotidien ' + (J.Rewards.canClaimDaily() ? '<span class="badge gold">disponible</span>' : '') + '</button>' +
      '<button class="btn ghost block mt-s" data-menu="wheel">🎡 Roue de la chance ' + (J.Rewards.canSpinWheel() ? '<span class="badge gold">1 tour</span>' : '') + '</button>' +
      '<button class="btn ghost block mt-s" data-menu="fair">🔐 Fair Play (provably fair)</button>' +
      '<button class="btn ghost block mt-s" data-menu="history">🧾 Historique des paris</button>' +
      '<button class="btn ghost block mt-s" data-menu="responsible">🛡️ Jeu responsable</button>' +
      '<button class="btn ghost block mt-s" data-menu="settings">⚙️ Réglages</button>' +
      '<button class="btn ghost block mt-s" data-menu="about">ℹ️ À propos / Mentions légales</button>' +
      '<div class="note mt-l">Jetons virtuels sans valeur monétaire — divertissement uniquement — 18+.</div>',
      {
        onMount(el) {
          el.querySelectorAll('[data-menu]').forEach((b) => {
            b.onclick = () => {
              const m = b.dataset.menu;
              UI.closeSheet();
              setTimeout(() => ({
                daily: () => J.Rewards.openDaily(),
                wheel: () => J.Rewards.openWheel(),
                fair: () => UI.openFair(),
                history: () => UI.openHistory(),
                responsible: () => UI.openResponsible(),
                settings: () => UI.openSettings(),
                about: () => UI.openAbout()
              }[m] || (() => {}))(), 240);
            };
          });
        }
      }
    );
  };

  /* ------------------------------------------------------------- MODALES CLÉS */
  /** Détail du portefeuille (tap sur le solde). */
  UI.openWallet = function () {
    const s = J.Wallet.summary();
    const vip = J.Wallet.vipInfo();
    UI.sheet(
      '<div class="row between"><div class="h2">Portefeuille</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="card pad mt">' +
        '<div class="row between"><span class="sub">Solde de jetons</span><span class="mono" style="font-size:19px;color:var(--gold)">' + U.fmt(J.Wallet.balance) + '</span></div>' +
        '<div class="progress thin mt-s"><i style="width:' + vip.pct.toFixed(1) + '%"></i></div>' +
        '<div class="row between mt-s"><span class="badge ' + vip.tier.badge + '">' + vip.tier.name + '</span>' +
        '<span class="sub">' + (vip.next ? U.fmt(vip.remaining) + ' J avant ' + vip.next.name : 'Palier maximum') + '</span></div>' +
      '</div>' +
      '<div class="kv"><span class="k">Total misé (à vie)</span><span class="v">' + U.fmt(s.wagered) + ' J</span></div>' +
      '<div class="kv"><span class="k">Total gagné</span><span class="v up">' + U.fmt(s.returned) + ' J</span></div>' +
      '<div class="kv"><span class="k">Bénéfice net</span><span class="v ' + (s.netProfit >= 0 ? 'up' : 'down') + '">' + (s.netProfit >= 0 ? '+' : '') + U.fmt(s.netProfit) + ' J</span></div>' +
      '<button class="btn ghost block mt" data-keep-sheet data-menu2="daily">🎁 Bonus quotidien</button>' +
      '<button class="btn gold block mt-s" data-keep-sheet data-menu2="shop">🛒 Acheter un pack de jetons</button>' +
      '<div class="note mt-l">' + J.CONST.HOUSE_DISCLAIMER + ' Aucun retrait ni conversion possible.</div>',
      {
        onMount(el) {
          el.querySelectorAll('[data-menu2]').forEach((b) => {
            b.onclick = () => {
              if (b.dataset.menu2 === 'daily') { UI.closeSheet(); setTimeout(() => J.Rewards.openDaily(), 240); }
              else { UI.closeSheet(); UI.go('shop'); }
            };
          });
        }
      }
    );
  };

  /** Historique complet des paris. */
  UI.openHistory = function () {
    const h = J.Store.state.history;
    UI.sheet(
      '<div class="row between"><div class="h2">Historique des paris</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="sub mt-s">' + h.length + ' derniers paris enregistrés</div>' +
      (h.length
        ? '<table class="data mt"><thead><tr><th>Heure</th><th>Jeu</th><th>Mise</th><th>Mult.</th><th>Gain</th></tr></thead><tbody>' +
          h.slice(0, 60).map((r) =>
            '<tr><td>' + new Date(r.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</td>' +
            '<td class="name">' + U.esc(J.Wallet.gameName(r.game)) + (r.detail ? '<span class="sub"> · ' + U.esc(r.detail) + '</span>' : '') + '</td>' +
            '<td>' + U.fmt(r.bet) + '</td>' +
            '<td class="' + (r.mult >= 1 ? 'up' : 'down') + '">' + U.fmtMult(r.mult) + '</td>' +
            '<td class="' + (r.payout > 0 ? 'up' : 'muted') + '">' + (r.payout ? '+' + U.fmt(r.payout) : '—') + '</td></tr>').join('') +
          '</tbody></table>'
        : '<div class="empty"><div class="e-ico">🧾</div>Aucun pari pour le moment.</div>')
    );
  };

  /** Réglages : son, vibrations, animations, flux live, pseudo, RAZ. */
  UI.openSettings = function () {
    const s = J.Store.state.settings;
    UI.sheet(
      '<div class="row between"><div class="h2">Réglages</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="kv"><span class="k">Sons</span><label class="switch"><input type="checkbox" data-set="sound"' + (s.sound ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
      '<div class="kv"><span class="k">Vibrations</span><label class="switch"><input type="checkbox" data-set="vibration"' + (s.vibration ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
      '<div class="kv"><span class="k">Animations & confettis</span><label class="switch"><input type="checkbox" data-set="motion"' + (s.motion ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
      '<div class="kv"><span class="k">Flux « gros gains »</span><label class="switch"><input type="checkbox" data-set="liveFeed"' + (s.liveFeed ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
      '<div class="kv"><span class="k">Rappel de pause (30 min)</span><label class="switch"><input type="checkbox" data-set="autoPause"' + (s.autoPause ? ' checked' : '') + '><span class="track"></span><span class="thumb"></span></label></div>' +
      '<div class="section-head mt-l"><div class="h2">Pseudo</div></div>' +
      '<div class="field"><input id="setPseudo" maxlength="14" value="' + U.esc(J.Store.state.pseudo) + '"><span class="suffix">14 car. max</span></div>' +
      '<button class="btn ghost block mt-l" data-keep-sheet id="btnReset">Réinitialiser ma progression</button>' +
      '<div class="note mt">La réinitialisation remet le solde à 10 000 jetons et efface stats, historique et récompenses. Les achats simulés ne sont pas remboursés (ils n\'ont aucune valeur).</div>',
      {
        onMount(el) {
          el.querySelectorAll('[data-set]').forEach((inp) => {
            inp.onchange = () => {
              const k = inp.dataset.set;
              J.Store.patch({ settings: { [k]: inp.checked } });
              document.body.classList.toggle('no-motion', !J.Store.state.settings.motion);
              if (k === 'sound') { J.Sfx.setEnabled(inp.checked); if (inp.checked) J.Sfx.click(); }
              if (k === 'liveFeed' && J.Live) J.Live.setEnabled(inp.checked);
              if (k === 'vibration') J.haptic.tap();
            };
          });
          el.querySelector('#setPseudo').onchange = (e) => {
            const v = U.esc(e.target.value.trim().slice(0, 14)) || 'Joueur';
            J.Store.patch({ pseudo: e.target.value.trim().slice(0, 14) || 'Joueur' });
            J.Screen && J.Screen.renderHome && J.Screen.renderHome();
            J.Screen && J.Screen.renderProfile && J.Screen.renderProfile();
            J.toast('Pseudo mis à jour', 'ok');
          };
          el.querySelector('#btnReset').onclick = () => {
            UI.confirm('Réinitialiser ?', 'Solde, stats et historique seront effacés.', () => {
              J.Store.reset();
              J.Fair.init();
              J.Wallet.renderBalance();
              J.Screen.renderAll();
              UI.renderVipChip();
              J.toast('Progression réinitialisée', 'ok');
            }, 'Tout effacer');
          };
        }
      }
    );
  };

  /** Mentions légales et avertissements. */
  UI.openAbout = function () {
    UI.sheet(
      '<div class="row between"><div class="h2">À propos</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="note mt">' +
        '<b>JACKPOTLY</b> est un <b>simulateur de casino social</b> de divertissement.<br><br>' +
        '• Les jetons sont <b>virtuels</b> et n\'ont <b>aucune valeur monétaire</b>.<br>' +
        '• Aucun retrait, aucune conversion en argent réel ou en cadeau, aucun échange entre joueurs.<br>' +
        '• L\'argent réel n\'intervient que pour l\'achat de packs de jetons, en paiement simulé dans cette version de démonstration.<br>' +
        '• Aucun pari sportif.<br>' +
        '• Jeu réservé aux <b>18 ans et plus</b>.<br><br>' +
        'Les résultats sont générés localement par un générateur vérifiable (voir Fair Play). ' +
        'Ce jeu ne permet de gagner ni argent, ni bien, ni service de valeur.' +
      '</div>' +
      '<div class="note warn mt">Si le jeu cesse d\'être un plaisir : fais une pause, fixe-toi des limites, parle-en à quelqu\'un. ' +
      'En France, des lignes d\'écoute existent : Joueurs Info Service au 09 74 75 13 13 (appel non surtaxé).</div>' +
      '<div class="sub center mt">Version ' + J.VERSION + ' · ' + U.fmt(J.Store.state.created ? Date.now() - J.Store.state.created : 0) + ' de jeu cumulé (approx.)</div>'
    );
  };

  UI.openResponsible = function () {
    const s = J.Wallet.summary();
    UI.sheet(
      '<div class="row between"><div class="h2">🛡️ Jeu responsable</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="note mt">Ce jeu est un <b>divertissement sans enjeu réel</b>. Voici tes repères de session :</div>' +
      '<div class="kv"><span class="k">Temps de jeu (session)</span><span class="v">' + U.fmtDur(Date.now() - J.Store.state.session.startedAt) + '</span></div>' +
      '<div class="kv"><span class="k">Parties jouées (session)</span><span class="v">' + J.Store.state.session.rounds + '</span></div>' +
      '<div class="kv"><span class="k">Total misé (à vie)</span><span class="v">' + U.fmt(s.wagered) + ' J</span></div>' +
      '<div class="kv"><span class="k">RTP constaté</span><span class="v">' + U.fmtPct(s.rtp) + '</span></div>' +
      '<div class="section-head mt-l"><div class="h2">Mes outils</div></div>' +
      '<button class="btn ghost block" data-keep-sheet id="pauseGame">Prendre une pause (retour à l\'accueil)</button>' +
      '<button class="btn ghost block mt-s" data-keep-sheet id="limitBet">Me fixer une limite de dépenses mensuelle</button>' +
      '<button class="btn danger block mt-s" data-keep-sheet id="stopSession">Arrêter ma session et tout réinitialiser</button>' +
      '<div class="note warn mt-l"><b>Signaux d\'alerte :</b> jouer plus longtemps que prévu, augmenter les mises pour retrouver les mêmes sensations, ' +
      'mentir sur le temps passé. En cas de besoin réel d\'aide : <b>Joueurs Info Service — 09 74 75 13 13</b> (France, appel non surtaxé, 8h-2h).</div>',
      {
        onMount(el) {
          el.querySelector('#pauseGame').onclick = () => { UI.closeSheet(); UI.go('home'); J.toast('Pause enregistrée. À bientôt !', 'ok'); };
          el.querySelector('#limitBet').onclick = () => { UI.closeSheet(); setTimeout(() => J.Shop.openLimit(), 240); };
          el.querySelector('#stopSession').onclick = () => {
            UI.closeSheet();
            UI.confirm('Tout réinitialiser ?', 'Solde, stats, historique et récompenses seront effacés (achats simulés inclus).', () => {
              J.Store.reset(); J.Fair.init(); J.Wallet.renderBalance(); J.Screen.renderAll(); UI.renderVipChip();
              UI.go('home'); J.toast('Session réinitialisée', 'ok');
            }, 'Tout effacer');
          };
        }
      }
    );
  };

  /** Écran Fair Play : graines, hash, vérification. */
  UI.openFair = function () {
    const st = J.Store.state.fair;
    const last = st.history && st.history.length ? st.history[st.history.length - 1] : null;
    UI.sheet(
      '<div class="row between"><div class="h2">🔐 Fair Play</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="note mt">Chaque résultat est calculé à partir de <b>HMAC-SHA256(serverSeed, « clientSeed:nonce:curseur »)</b>. ' +
      'Le hash du serverSeed est publié à l\'avance : impossible de le modifier ensuite. En tournant la graine, elle est révélée ' +
      'et tu peux revérifier chaque tirage.</div>' +
      '<div class="section-head mt-l"><div class="h2">Graines actives</div></div>' +
      '<div class="kv"><span class="k">Hash du serverSeed (engagé)</span></div>' +
      '<div class="mono sub" style="word-break:break-all;color:var(--txt-2)">' + U.esc(st.serverSeedHash) + '</div>' +
      '<div class="kv mt"><span class="k">ServerSeed (secret jusqu\'à rotation)</span></div>' +
      '<div class="mono sub" style="word-break:break-all">•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••</div>' +
      '<div class="section-head mt-l"><div class="h2">ClientSeed (modifiable)</div></div>' +
      '<div class="field"><input id="clientSeed" value="' + U.esc(st.clientSeed) + '" maxlength="64"><button class="btn xs primary" id="setSeed">OK</button></div>' +
      '<div class="kv mt"><span class="k">Nonce (pari en cours)</span><span class="v">' + st.nonce + '</span></div>' +
      (st.prevSeed
        ? '<div class="section-head mt-l"><div class="h2">Graine précédente révélée</div></div>' +
          '<div class="mono sub" style="word-break:break-all">' + U.esc(st.prevSeed) + '</div>' +
          '<div class="kv mt"><span class="k">Hash publié avant</span></div><div class="mono sub" style="word-break:break-all">' + U.esc(st.prevHash) + '</div>'
        : '') +
      '<button class="btn gold block mt-l" id="rotate">🔄 Tourner la graine & révéler</button>' +
      '<div class="section-head mt-l"><div class="h2">Vérificateur</div></div>' +
      '<div class="sub">Recalculer un tirage à partir des graines révélées.</div>' +
      '<div class="field mt-s"><input id="vSeed" placeholder="serverSeed (hex)"></div>' +
      '<div class="field mt-s"><input id="vClient" value="' + U.esc(st.clientSeed) + '" placeholder="clientSeed"></div>' +
      '<div class="row mt-s"><div class="field grow"><input id="vNonce" type="number" value="1" placeholder="nonce"></div>' +
      '<div class="field grow"><input id="vCursor" type="number" value="0" placeholder="curseur"></div>' +
      '<button class="btn xs primary" id="verify">Calculer</button></div>' +
      '<div id="vOut" class="note mt"></div>',
      {
        onMount(el) {
          el.querySelector('#setSeed').onclick = () => {
            const v = el.querySelector('#clientSeed').value.trim();
            if (J.Fair.setClientSeed(v)) { J.toast('ClientSeed enregistrée', 'ok'); UI.closeSheet(); }
            else J.toast('Graine invalide', 'ko');
          };
          el.querySelector('#rotate').onclick = () => {
            const r = J.Fair.rotate();
            J.toast('Nouvelle graine · précédente révélée', 'ok');
            UI.closeSheet(); setTimeout(UI.openFair, 260);
          };
          el.querySelector('#verify').onclick = () => {
            const out = el.querySelector('#vOut');
            const seed = el.querySelector('#vSeed').value.trim();
            const cs = el.querySelector('#vClient').value.trim();
            const n = parseInt(el.querySelector('#vNonce').value, 10) || 0;
            const c = parseInt(el.querySelector('#vCursor').value, 10) || 0;
            if (!seed || !cs) { out.textContent = 'Renseigne serverSeed et clientSeed.'; return; }
            const v = J.Fair.verify(seed, cs, n, c);
            out.innerHTML =
              '<div><b>Message</b><br><span class="mono">' + U.esc(v.message) + '</span></div>' +
              '<div class="mt-s"><b>HMAC-SHA256</b><br><span class="mono" style="word-break:break-all">' + v.hmac + '</span></div>' +
              '<div class="mt-s"><b>Aléa obtenu</b><br><span class="mono">' + v.float.toFixed(8) + '</span></div>' +
              '<div class="mt-s"><b>Hash du serverSeed</b><br><span class="mono" style="word-break:break-all">' + v.hash + '</span></div>';
          };
        }
      }
    );
  };

  /* ---------------------------------------------------------- EN-TÊTE ACTIONS */
  document.getElementById('balancePill').addEventListener('click', () => { J.Sfx.click(); UI.openWallet(); });
  document.getElementById('btnMenu').addEventListener('click', () => { J.Sfx.click(); UI.openMenu(); });
  document.getElementById('btnDaily').addEventListener('click', () => {
    J.Sfx.click();
    if (J.Rewards.canClaimDaily()) J.Rewards.openDaily();
    else UI.sheet(
      '<div class="row between"><div class="h2">🎁 Bonus quotidien</div><button class="modal-x" data-close-sheet>✕</button></div>' +
      '<div class="note mt">Bonus déjà récupéré aujourd\'hui. Reviens demain ! Série actuelle : <b>' + J.Store.state.daily.streak + ' jour(s)</b>.</div>' +
      '<div class="kv"><span class="k">Série maximale</span><span class="v">' + (J.Store.state.daily.best || J.Store.state.daily.streak) + ' jour(s)</span></div>' +
      '<button class="btn gold block mt" data-close-sheet>OK</button>');
  });

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { J.Sfx.click(); J.haptic.tap(); UI.go(b.dataset.go); });
  });

  // Boutons génériques « data-goto » présents dans le HTML statique
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { J.Sfx.click(); UI.go(g.dataset.goto); }
  });

  // Toute interaction compte comme activité (rappels de pause)
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => UI.touchActivity(), { passive: true }));
})();
