/* =========================================================================
   JACKPOTLY — ÉCRANS
   Rendu du lobby (Casino), du catalogue Originals, du classement,
   de la boutique et du profil. Chaque écran est re-rendu après un
   événement pertinent (solde, quêtes, récompenses…).
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;

  const S = (J.Screen = {});
  let originalsFilter = 'all';
  let rankPeriod = 'day';

  const $ = (id) => document.getElementById(id);
  const hexA = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /** Vignette de jeu réutilisable (lobby, catalogue). */
  S.tile = function (g) {
    const locked = g.status !== 'live';
    return '<button class="game-tile' + (locked ? ' locked' : '') + '" data-game="' + g.id + '" style="--tint:' + hexA(g.color, .34) + '">' +
      (g.status === 'live' && g.hot ? '<span class="tag-hot">HOT</span>' : '') +
      (locked ? '<span class="lock-chip">' + (g.wave === 2 ? 'VAGUE 2' : 'VAGUE 3') + '</span>' : '') +
      '<span class="gt-ico" style="color:' + g.color + '">' + J.icon[g.icon] + '</span>' +
      '<span class="gt-name">' + g.name + '</span>' +
      '<span class="gt-meta">' + (locked ? 'Bientôt disponible' : (g.tagline || '')) + '</span>' +
      '<span class="gt-rtp">RTP ' + g.rtp + ' %</span>' +
    '</button>';
  };

  /* =============================================================== LOBBY */
  S.renderHome = function () {
    const st = J.Store.state;
    $('homePseudo').textContent = U.esc(st.pseudo);
    const h = new Date().getHours();
    $('homeGreeting').textContent = h < 6 ? 'Bonne nuit — pense à dormir 😴'
      : h < 12 ? 'Bonne matinée et bonne chance !'
      : h < 18 ? 'Bonne après-midi !'
      : 'Bonne soirée !';

    // Cartes promo (bonus, roue, recharge, VIP)
    const promos = [];
    if (J.Rewards.canClaimDaily()) {
      promos.push({ ico: '🎁', t: 'Bonus quotidien', s: 'Prêt à récupérer !', act: 'daily', cls: 'glow-green' });
    }
    if (J.Rewards.canSpinWheel()) {
      promos.push({ ico: '🎡', t: 'Roue de la chance', s: '1 tour gratuit disponible', act: 'wheel', cls: 'glow-gold' });
    }
    if (J.Wallet.balance < J.CONST.MIN_BET) {
      promos.push({ ico: '💸', t: 'Solde épuisé', s: 'Recharge gratuite disponible', act: 'recharge', cls: '' });
    }
    const vip = J.Wallet.vipInfo();
    promos.push({
      ico: '🏅', t: 'Statut ' + vip.tier.name, s: vip.next ? U.fmtK(vip.remaining) + ' J avant ' + vip.next.name : 'Palier maximum', act: 'vip', cls: ''
    });
    promos.push({ ico: '🛒', t: 'Packs de jetons', s: 'Jetons virtuels · paiement simulé', act: 'shop', cls: '' });

    $('homePromos').innerHTML = promos.map((p, i) =>
      '<button class="promo-card ' + p.cls + '" data-promo="' + p.act + '" data-i="' + i + '">' +
        '<div class="pc-emoji">' + p.ico + '</div>' +
        '<div class="pc-title">' + p.t + '</div>' +
        '<div class="pc-txt">' + p.s + '</div>' +
      '</button>').join('');
    $('homePromos').querySelectorAll('[data-promo]').forEach((b) => {
      b.onclick = () => {
        J.Sfx.click();
        const a = b.dataset.promo;
        if (a === 'daily') J.Rewards.openDaily();
        else if (a === 'wheel') J.Rewards.openWheel();
        else if (a === 'recharge') J.Rewards.openRecharge();
        else if (a === 'shop') J.UI.go('shop');
        else if (a === 'vip') S.openVip();
      };
    });

    // Originals en vedette
    const live = (J.GAMES || []).filter((g) => g.category === 'originals');
    $('homeOriginals').innerHTML = live.slice(0, 4).map(S.tile).join('');
    const classics = (J.GAMES || []).filter((g) => g.category === 'classics').slice(0, 4);
    $('homeClassics').innerHTML = classics.map(S.tile).join('');
    bindTiles($('homeOriginals')); bindTiles($('homeClassics'));

    // Flux des gros gains (les 5 derniers)
    const feed = J.Live.recent.slice(0, 5);
    $('homeFeed').innerHTML = feed.length ? feed.map((f) =>
      '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line-soft)">' +
        '<div class="row grow"><span class="avatar" style="width:24px;height:24px;font-size:10px;background:' + f.color + '">' +
          U.esc(f.name.charAt(0).toUpperCase()) + '</span>' +
          '<span style="font-size:12px;font-weight:700" class="ellipsis">' + U.esc(f.name) + '</span>' +
          '<span class="sub" style="font-size:10.5px">' + U.esc(f.gameName) + '</span></div>' +
        '<div class="row"><span class="mono up" style="font-size:11.5px">' + U.fmtMult(f.mult) + '</span>' +
        '<span class="mono gold" style="font-size:11.5px">+' + U.fmtK(f.amount) + '</span></div>' +
      '</div>').join('') : '<div class="sub">Chargement du flux…</div>';
    $('feedCount').textContent = 'mise à jour auto';
  };

  function bindTiles(rootEl) {
    rootEl.querySelectorAll('[data-game]').forEach((b) => {
      b.onclick = () => J.Games.open(b.dataset.game);
    });
  }

  /* ========================================================== CATALOGUE */
  S.renderOriginals = function () {
    const all = J.GAMES || [];
    const list = originalsFilter === 'all' ? all
      : originalsFilter === 'soon' ? all.filter((g) => g.status !== 'live')
      : all.filter((g) => g.category === originalsFilter);
    $('originalsGrid').innerHTML = list.length ? list.map(S.tile).join('')
      : '<div class="empty">Aucun jeu dans cette catégorie.</div>';
    bindTiles($('originalsGrid'));
  };

  $('originalsSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    J.Sfx.click();
    originalsFilter = b.dataset.filter;
    $('originalsSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    S.renderOriginals();
  });

  /* ========================================================= CLASSEMENT */
  S.renderRank = function () {
    const rows = J.Leaderboard.ranked(rankPeriod);
    const me = rows.find((r) => r.me);
    const st = J.Store.state;
    $('myRankCard').innerHTML =
      '<div class="row between">' +
        '<div class="row"><span class="avatar" style="width:38px;height:38px;font-size:15px;background:linear-gradient(150deg,#00e37a,#8affc1)">' +
          U.esc(st.pseudo.charAt(0).toUpperCase()) + '</span>' +
          '<div><div style="font-weight:800">' + U.esc(st.pseudo) + ' <span class="badge ' + J.Wallet.vipInfo().tier.badge + '">' +
            J.Wallet.vipInfo().tier.name + '</span></div>' +
            '<div class="sub">Misé : ' + U.fmt(me.wagered) + ' J · net ' + (me.net >= 0 ? '+' : '') + U.fmtK(me.net) + '</div></div></div>' +
        '<div class="center"><div class="mono" style="font-size:22px;font-weight:800;color:var(--green)">#' + me.rank + '</div>' +
        '<div class="sub" style="font-size:9.5px">sur ' + rows.length + '</div></div>' +
      '</div>' +
      '<div class="progress thin mt"><i style="width:' + U.clamp((1 - (me.rank - 1) / rows.length) * 100, 4, 100).toFixed(1) + '%"></i></div>';

    // Le joueur voit toujours sa ligne, même s'il est au-delà du top 25
    const top = rows.slice(0, 25);
    const inTop = top.some((r) => r.me);
    const rest = inTop ? [] : [{ sep: true, rank: me.rank }, rows.find((r) => r.me)];

    $('rankList').innerHTML = top.concat(rest).map((r) => r.sep
      ? '<div class="center sub" style="padding:9px 0;letter-spacing:.3em">···</div>'
      :
      '<div class="rank-row' + (r.me ? ' me' : '') + '">' +
        '<span class="rank-pos ' + (r.rank <= 3 ? 'top' + r.rank : '') + '">' + r.rank + '</span>' +
        '<span class="avatar" style="background:' + r.color + '">' + U.esc(r.name.charAt(0).toUpperCase()) + '</span>' +
        '<div class="grow"><div style="font-size:12.5px;font-weight:700" class="ellipsis">' + U.esc(r.name) + (r.me ? ' (toi)' : '') + '</div>' +
          '<div class="sub" style="font-size:10px">' + (rankPeriod === 'profit' ? 'Bénéfice net' : 'Total misé') + '</div></div>' +
        '<div class="center"><div class="mono" style="font-size:12.5px">' + (rankPeriod === 'profit'
          ? (r.net >= 0 ? '+' : '') + U.fmtK(r.net) : U.fmtK(r.wagered)) + '</div></div>' +
      '</div>').join('');
  };

  $('rankSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    J.Sfx.click();
    rankPeriod = b.dataset.rank;
    $('rankSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    S.renderRank();
  });

  /* =========================================================== BOUTIQUE */
  S.renderShop = function () {
    const spend = J.Shop.spendState();
    const st = J.Store.state;
    const packs = J.Shop.PACKS;
    const money = (v) => v.toFixed(2).replace('.', ',') + ' €';
    const firstUsed = st.shop.firstPurchaseUsed;

    /** Une carte de pack : prix, contenu, économie affichée. */
    function packCard(p) {
      const total = p.tokens + (p.bonus || 0);
      const rate = Math.round(total / p.price);
      const available = J.Shop.canBuy(p);
      const bestValue = rate >= 9000;
      return '<div class="card pad" style="margin-bottom:8px;' +
          (p.firstOnly ? 'border-color:rgba(255,197,49,.45)' : bestValue ? 'border-color:rgba(0,227,122,.35)' : '') + '">' +
        '<div class="row between">' +
          '<div class="row grow">' +
            '<div style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;' +
              'background:rgba(255,197,49,.12);color:var(--gold);font-weight:900;font-size:17px">J</div>' +
            '<div><div style="font-weight:800">' + U.fmt(total) + ' jetons</div>' +
              '<div class="sub">' + (p.bonus ? '+' + U.fmt(p.bonus) + ' bonus · ' : '') + p.label + '</div>' +
              '<div class="sub" style="font-size:9.5px">' + U.fmt(rate) + ' jetons par euro</div></div>' +
          '</div>' +
          '<div class="center"><div class="mono" style="font-weight:800;font-size:15px">' + money(p.price) + '</div>' +
            (p.tag ? '<span class="badge ' + (p.firstOnly ? 'gold' : '') + '" style="font-size:8.5px">' +
              (p.firstOnly && firstUsed ? 'déjà utilisé' : p.tag) + '</span>' : '') + '</div>' +
        '</div>' +
        '<button class="btn ' + (p.firstOnly ? 'gold' : available ? 'ghost' : 'ghost') + ' block mt" data-buy="' + p.id + '"' +
          (available ? '' : ' disabled') + '>' +
          (available ? (p.firstOnly ? '🎁 Acheter à prix réduit' : 'Acheter (simulé)') : '🔒 Indisponible (limite atteinte)') + '</button>' +
      '</div>';
    }

    $('shopBody').innerHTML =
      // Packs
      '<div class="section"><div class="section-head"><div class="h2">🛒 Packs de jetons</div>' +
        '<span class="sub">' + (spend.limit == null ? 'aucune limite' : 'limite ' + money(spend.limit) + '/mois') + '</span></div>' +
        packs.map(packCard).join('') +
        '<div class="note"><b>Paiement simulé.</b> Aucun débit réel dans cette version : le tunnel d\'achat, les reçus ' +
        'et la limite de dépenses sont déjà en place, il ne reste qu\'à enregistrer l\'adaptateur Apple / Google ' +
        'In-App Purchase via <span class="mono">J.Shop.registerProvider()</span>.</div>' +
      '</div>' +

      // Jetons gratuits
      '<div class="section"><div class="section-head"><div class="h2">🎁 Jetons gratuits</div>' +
        '<span class="sub">aucune dépense requise</span></div>' +
        '<div class="card pad">' +
          '<div class="kv"><span class="k">Bonus quotidien</span><span class="v ' + (J.Rewards.canClaimDaily() ? 'up' : '') + '">' +
            (J.Rewards.canClaimDaily() ? 'disponible' : 'demain') + '</span></div>' +
          '<div class="kv"><span class="k">Roue de la chance</span><span class="v ' + (J.Rewards.canSpinWheel() ? 'up' : '') + '">' +
            (J.Rewards.canSpinWheel() ? '1 tour gratuit' : 'demain') + '</span></div>' +
          '<div class="kv"><span class="k">Recharges gratuites restantes</span><span class="v">' + J.Rewards.rechargeState().left +
            ' / ' + J.CONST.FREE_CHIPS_PER_DAY + '</span></div>' +
          '<div class="kv"><span class="k">Missions du jour</span><span class="v up">' +
            U.fmt(J.Quests.items().reduce((a, x) => a + (x.claimed ? 0 : x.reward), 0)) + ' J à gagner</span></div>' +
          '<button class="btn ghost block mt" data-shop="free">Recharger gratuitement ' + U.fmt(J.CONST.FREE_CHIPS) + ' jetons</button>' +
          '<div class="sub center mt-s">Tous les jeux restent accessibles sans jamais dépenser d\'argent réel.</div>' +
        '</div>' +
      '</div>' +

      // Contrôle des dépenses
      '<div class="section"><div class="section-head"><div class="h2">🛡️ Contrôle des dépenses</div></div>' +
        '<div class="card pad">' +
          '<div class="note">Tu choisis ta limite mensuelle de dépenses. Une fois atteinte, les achats sont bloqués ' +
          'jusqu\'au mois suivant. Elle peut toujours être <b>baissée immédiatement</b> ; toute hausse est différée ' +
          'au mois suivant (garde-fou anti-impulsion).</div>' +
          '<div class="kv mt"><span class="k">Dépensé ce mois-ci (simulé)</span><span class="v">' + money(spend.total) + '</span></div>' +
          '<div class="kv"><span class="k">Limite mensuelle</span><span class="v">' +
            (spend.limit == null ? 'non définie' : money(spend.limit)) + '</span></div>' +
          '<div class="progress thin mt-s"><i style="width:' +
            (spend.limit ? U.clamp((spend.total / spend.limit) * 100, 0, 100).toFixed(0) : 0) + '%"></i></div>' +
          (st.spend.pendingLimit ? '<div class="kv mt"><span class="k">Hausse programmée (' + U.esc(st.spend.pendingMonth) + ')</span>' +
            '<span class="v gold">' + money(st.spend.pendingLimit) + '</span></div>' : '') +
          '<button class="btn ghost block mt" data-shop="limit">Définir ma limite mensuelle</button>' +
        '</div>' +
      '</div>' +

      // Historique des achats
      (Object.keys(st.shop.purchased).length
        ? '<div class="section"><div class="section-head"><div class="h2">🧾 Mes achats (simulés)</div></div>' +
          '<div class="card pad"><table class="data"><thead><tr><th>Pack</th><th>Qté</th><th>Jetons</th></tr></thead><tbody>' +
          Object.keys(st.shop.purchased).map((id) => {
            const p = packs.find((x) => x.id === id);
            if (!p) return '';
            return '<tr><td class="name">' + U.esc(p.label) + '</td><td>' + st.shop.purchased[id] + '</td>' +
              '<td class="gold">' + U.fmt((p.tokens + (p.bonus || 0)) * st.shop.purchased[id]) + '</td></tr>';
          }).join('') + '</tbody></table>' +
          (st.shop.lastTransaction ? '<div class="sub mt-s">Dernière transaction : <span class="mono">' +
            U.esc(st.shop.lastTransaction) + '</span></div>' : '') +
          '</div></div>'
        : '') +

      '<div class="note danger mt-l">' +
        '<b>Jetons virtuels sans valeur monétaire. Divertissement uniquement. 18+.</b><br>' +
        'Aucun retrait, aucune conversion en argent ou en cadeaux, aucun échange entre joueurs. ' +
        'Les jetons ne peuvent pas être gagnés en argent réel et ne servent qu\'à jouer dans l\'application.' +
      '</div>' +
      '<div class="sub center mt">Version ' + J.VERSION + ' · 10 jeux jouables</div>';

    /* --- Liaisons --- */
    $('shopBody').querySelectorAll('[data-shop]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.shop;
        if (a === 'limit') J.Shop.openLimit();
        else if (a === 'free') J.Rewards.openRecharge();
      };
    });

    $('shopBody').querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.buy;
        const pack = J.Shop.PACKS.find((p) => p.id === id);
        if (!pack) return;
        J.Sfx.click();
        openPurchase(pack);
      };
    });

    /* --- Tunnel d'achat (paiement simulé, prêt pour l'IAP) --- */
    function openPurchase(pack) {
      const total = pack.tokens + (pack.bonus || 0);
      const after = spend.total + pack.price;
      J.UI.modal({
        title: 'Confirmer l\'achat',
        sub: U.fmt(total) + ' jetons virtuels · ' + money(pack.price),
        body:
          '<div class="note warn">Paiement <b>simulé</b> : aucun débit réel n\'a lieu dans cette version. ' +
          'Le tunnel est identique à celui d\'un achat intégré (confirmation, reçu, crédit des jetons).</div>' +
          '<div class="kv mt"><span class="k">Pack</span><span class="v">' + U.esc(pack.label) + '</span></div>' +
          '<div class="kv"><span class="k">Jetons crédités</span><span class="v gold">' + U.fmt(total) + '</span></div>' +
          '<div class="kv"><span class="k">Prix (simulé)</span><span class="v">' + money(pack.price) + '</span></div>' +
          '<div class="kv"><span class="k">Dépense du mois après achat</span><span class="v">' + money(after) +
            ' / ' + (spend.limit == null ? '∞' : money(spend.limit)) + '</span></div>' +
          '<div class="note mt">Les jetons sont virtuels et sans valeur monétaire : aucun retrait, aucune conversion, ' +
          'aucun remboursement. Ils servent uniquement à jouer dans l\'application.</div>',
        actions: [
          { label: 'Annuler', cls: 'ghost' },
          { label: 'Confirmer ' + money(pack.price), cls: 'gold', keepOpen: true, onClick: () => {
            const btn = document.querySelector('#modalBox [data-actions] .btn.gold');
            if (btn) { btn.disabled = true; btn.textContent = 'Paiement en cours…'; }
            J.Shop.purchase(pack.id).then((res) => {
              J.UI.closeModal();
              if (!res.ok) { J.Sfx.error(); J.toast(res.error || 'Achat impossible', 'ko'); return; }
              J.Screen.renderShop();
              J.Screen.renderProfile();
            });
          } }
        ]
      });
    }
  };

  /* ============================================================ PROFIL */
  S.renderProfile = function () {
    const st = J.Store.state;
    const s = J.Wallet.summary();
    const vip = J.Wallet.vipInfo();
    const claimed = st.vip.claimedLevels.includes(vip.index);
    const claimable = vip.tier.reward > 0 && !claimed;
    const q = J.Quests.ensure();
    const allClaimed = q.items.every((x) => x.claimed);
    const readyCount = q.items.filter((x) => !x.claimed && x.progress >= x.target).length;

    $('profileBody').innerHTML =
      // En-tête joueur
      '<div class="card pad mt">' +
        '<div class="row">' +
          '<span class="avatar" style="width:52px;height:52px;font-size:21px;background:linear-gradient(150deg,#00e37a,#8affc1)">' +
            U.esc(st.pseudo.charAt(0).toUpperCase()) + '</span>' +
          '<div class="grow"><div style="font-weight:800;font-size:16px">' + U.esc(st.pseudo) + '</div>' +
          '<div class="row mt-s"><span class="badge ' + vip.tier.badge + '">🏅 ' + vip.tier.name + '</span>' +
          '<span class="badge">RTP ' + U.fmtPct(s.rtp, 1) + '</span></div></div>' +
          '<button class="btn xs ghost" data-prof="editName">Modifier</button>' +
        '</div>' +
        '<div class="progress mt"><i style="width:' + vip.pct.toFixed(1) + '%"></i></div>' +
        '<div class="row between mt-s"><span class="sub">' + U.fmt(st.vip.wagered) + ' J misés au total</span>' +
          '<span class="sub">' + (vip.next ? 'Prochain : ' + vip.next.name : 'Palier max') + '</span></div>' +
        (claimable ? '<button class="btn gold block mt" data-prof="claimVip">Récupérer ' + U.fmt(vip.tier.reward) + ' jetons de palier</button>' : '') +
      '</div>' +

      // Actions rapides
      '<div class="btn-row four mt">' +
        '<button class="btn sm ghost" data-prof="daily">🎁<br>Bonus</button>' +
        '<button class="btn sm ghost" data-prof="wheel">🎡<br>Roue</button>' +
        '<button class="btn sm ghost" data-prof="fair">🔐<br>Fair Play</button>' +
        '<button class="btn sm ghost" data-prof="settings">⚙️<br>Réglages</button>' +
      '</div>' +

      // Stats
      '<div class="section"><div class="section-head"><div class="h2">📊 Statistiques</div>' +
        '<button class="link" data-prof="history">Historique</button></div>' +
        '<div class="card pad">' +
          '<div class="kv"><span class="k">Total misé</span><span class="v">' + U.fmt(s.wagered) + ' J</span></div>' +
          '<div class="kv"><span class="k">Total gagné</span><span class="v up">' + U.fmt(s.returned) + ' J</span></div>' +
          '<div class="kv"><span class="k">Bénéfice net</span><span class="v ' + (s.netProfit >= 0 ? 'up' : 'down') + '">' + (s.netProfit >= 0 ? '+' : '') + U.fmt(s.netProfit) + ' J</span></div>' +
          '<div class="kv"><span class="k">Parties jouées</span><span class="v">' + s.bets + '</span></div>' +
          '<div class="kv"><span class="k">Taux de victoire</span><span class="v">' + U.fmtPct(s.winRate, 1) + '</span></div>' +
          '<div class="kv"><span class="k">Meilleur multiplicateur</span><span class="v up">' + U.fmtMult(s.bestMult) + '</span></div>' +
          '<div class="kv"><span class="k">Plus gros gain</span><span class="v gold">' + U.fmt(s.bestWin) + ' J' + (s.bestWinGame ? ' · ' + U.esc(J.Wallet.gameName(s.bestWinGame)) : '') + '</span></div>' +
          '<div class="kv"><span class="k">Jeu préféré</span><span class="v">' + (s.favGame ? U.esc(J.Wallet.gameName(s.favGame)) : '—') + '</span></div>' +
          '<div class="kv"><span class="k">Temps de jeu (session)</span><span class="v">' + U.fmtDur(Date.now() - st.session.startedAt) + '</span></div>' +
        '</div>' +
      '</div>' +

      // Quêtes du jour
      '<div class="section"><div class="section-head"><div class="h2">🎯 Missions du jour</div>' +
        '<span class="sub">' + q.items.filter((x) => x.claimed).length + ' / ' + q.items.length + ' récupérées</span></div>' +
        '<div class="card pad">' +
          q.items.map((item) => {
            const done = item.progress >= item.target;
            const pct = U.clamp((item.progress / item.target) * 100, 0, 100);
            return '<div class="quest' + (done ? ' done' : '') + (item.claimed ? ' claimed' : '') + '">' +
              '<span class="q-ico">' + (item.claimed ? '✅' : done ? '🎁' : '🎯') + '</span>' +
              '<div class="grow"><div class="q-t">' + item.title + '</div>' +
                '<div class="q-s">' + (item.id === 'wager' || item.id === 'profit'
                  ? U.fmt(item.progress) + ' / ' + U.fmt(item.target) + ' · récompense ' + U.fmt(item.reward) + ' J'
                  : item.progress + ' / ' + item.target + ' · récompense ' + U.fmt(item.reward) + ' J') + '</div>' +
                '<div class="progress thin mt-s"><i style="width:' + pct.toFixed(0) + '%"></i></div></div>' +
              (item.claimed ? '<span class="badge">reçu</span>'
                : done ? '<button class="btn xs gold" data-claim="' + item.id + '">Récupérer</button>'
                : '') +
            '</div>';
          }).join('') +
          (readyCount > 1 ? '<button class="btn gold block mt" data-prof="claimAll">Tout récupérer (' + readyCount + ')</button>' : '') +
          (allClaimed ? '<div class="note mt">Toutes les missions du jour sont terminées. Reviens demain pour de nouvelles missions 💪</div>' : '') +
        '</div>' +
      '</div>' +

      // Détail par jeu
      '<div class="section"><div class="section-head"><div class="h2">🎮 Détail par jeu</div></div>' +
        '<div class="card pad">' + (Object.keys(s.perGame).length
          ? '<table class="data"><thead><tr><th>Jeu</th><th>Parties</th><th>Misé</th><th>Meilleur</th></tr></thead><tbody>' +
            Object.keys(s.perGame).sort((a, b) => s.perGame[b].wagered - s.perGame[a].wagered).map((id) => {
              const g = s.perGame[id];
              return '<tr><td class="name">' + U.esc(J.Wallet.gameName(id)) + '</td><td>' + g.bets + '</td>' +
                '<td>' + U.fmtK(g.wagered) + '</td><td class="up">' + U.fmtMult(g.bestMult) + '</td></tr>';
            }).join('') + '</tbody></table>'
          : '<div class="empty"><div class="e-ico">🎮</div>Aucune partie jouée pour l\'instant.</div>') +
        '</div>' +
      '</div>' +

      // Liens
      '<div class="section"><div class="section-head"><div class="h2">🛡️ Jeu responsable & réglages</div></div>' +
        '<button class="btn ghost block" data-prof="responsible">Jeu responsable · mes limites</button>' +
        '<button class="btn ghost block mt-s" data-prof="about">À propos / Mentions légales</button>' +
        '<button class="btn ghost block mt-s" data-prof="reset">Réinitialiser ma progression</button>' +
      '</div>' +

      '<div class="note mt-l">' + J.CONST.HOUSE_DISCLAIMER + ' Aucun pari sportif. Aucun retrait possible.</div>';

    $('profileBody').querySelectorAll('[data-prof]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.prof;
        J.Sfx.click();
        if (a === 'daily') J.Rewards.openDaily();
        else if (a === 'wheel') J.Rewards.openWheel();
        else if (a === 'fair') J.UI.openFair();
        else if (a === 'settings') J.UI.openSettings();
        else if (a === 'history') J.UI.openHistory();
        else if (a === 'responsible') J.UI.openResponsible();
        else if (a === 'about') J.UI.openAbout();
        else if (a === 'editName') J.UI.openSettings();
        else if (a === 'claimVip') {
          const r = J.Wallet.claimVipReward();
          if (r) { J.Sfx.bonus(); J.FX.coins(30); J.toast('+' + U.fmt(r) + ' jetons VIP', 'gold'); S.renderAll(); }
        } else if (a === 'claimAll') {
          S.renderAll();
          setTimeout(() => J.Quests.claimAll(), 10);
        } else if (a === 'reset') {
          J.UI.confirm('Réinitialiser ?', 'Solde, stats, historique et récompenses seront effacés.', () => {
            J.Store.reset(); J.Fair.init(); J.Wallet.renderBalance(); S.renderAll(); J.UI.renderVipChip();
            J.toast('Progression réinitialisée', 'ok');
          }, 'Tout effacer');
        }
      };
    });
    $('profileBody').querySelectorAll('[data-claim]').forEach((b) => {
      b.onclick = () => { J.Quests.claim(b.dataset.claim); S.renderAll(); };
    });
  };

  /** Modale de détail VIP (depuis le lobby). */
  S.openVip = function () {
    const vip = J.Wallet.vipInfo();
    const tiers = J.CONST.VIP;
    J.UI.modal({
      title: '🏅 Programme VIP',
      sub: 'Basé sur le total misé (jetons virtuels)',
      body:
        '<div class="note">Gagne du rakeback et des récompenses de palier en avançant. Les paliers se débloquent au total misé cumulé.</div>' +
        tiers.map((t, i) => {
          const reached = J.Store.state.vip.wagered >= t.need;
          const claimed = J.Store.state.vip.claimedLevels.includes(i);
          return '<div class="quest' + (reached ? ' done' : '') + (claimed ? ' claimed' : '') + '">' +
            '<span class="q-ico">' + (claimed ? '✅' : reached ? '🎁' : '🔒') + '</span>' +
            '<div class="grow"><div class="q-t">' + t.name + '</div>' +
            '<div class="q-s">' + U.fmt(t.need) + ' J misés · rakeback ' + t.rakeback.toFixed(2).replace('.', ',') + ' %' +
            (t.reward ? ' · récompense ' + U.fmt(t.reward) + ' J' : '') + '</div></div>' +
            (reached && t.reward && !claimed ? '<button class="btn xs gold" data-vipclaim="' + i + '">Récupérer</button>' : '') +
          '</div>';
        }).join('') +
        '<div class="kv mt"><span class="k">Total misé</span><span class="v">' + U.fmt(J.Store.state.vip.wagered) + ' J</span></div>' +
        '<div class="note mt">Le rakeback et les récompenses VIP sont versés en jetons virtuels, sans valeur monétaire.</div>'
    });
    // Réclamation directe depuis la liste
    document.querySelectorAll('[data-vipclaim]').forEach((b) => {
      b.onclick = () => {
        const idx = parseInt(b.dataset.vipclaim, 10);
        const st = J.Store.state;
        if (!st.vip.claimedLevels.includes(idx)) {
          st.vip.claimedLevels.push(idx); J.Store.save();
          J.Wallet.credit(tiers[idx].reward, 'vip:' + tiers[idx].id);
          J.Sfx.bonus(); J.FX.coins(30);
          J.toast('+' + U.fmt(tiers[idx].reward) + ' jetons VIP', 'gold');
        }
        J.UI.closeModal(); S.renderAll(); J.UI.renderVipChip();
      };
    });
  };

  /* ------------------------------------------------------------ RE-RENDU */
  /** Re-rend les écrans visibles (appelé sur changement d'état important). */
  S.renderAll = function () {
    J.UI.renderVipChip();
    S.renderHome();
    S.renderOriginals();
    S.renderRank();
    S.renderShop();
    S.renderProfile();
  };

  // Rafraîchit périodiquement ce qui est « vivant » (flux, classement, session)
  setInterval(() => {
    const cur = J.UI.current();
    if (cur === 'home') S.renderHome();
    else if (cur === 'rank') S.renderRank();
    else if (cur === 'profile') S.renderProfile();
  }, 15000);

  J.Bus.on('quests:changed', () => { if (J.UI.current() === 'profile') S.renderProfile(); });
  J.Bus.on('wallet:credit', () => { S.renderHome(); });
  J.Bus.on('funds:changed', () => { S.renderHome(); });
})();
