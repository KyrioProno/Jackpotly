/* =========================================================================
   JACKPOTLY — LE LOBBY DU CASINO (v0.4.0)
   -------------------------------------------------------------------------
   Le hall n'est plus une grille de boutons : c'est un casino à étages.

   Six salles, chacune avec son décor, sa couleur d'ambiance et sa musique :
     · hall      — l'entrée : enseigne, vedettes, flux des gros gains ;
     · machines  — la galerie des six machines à sous (façade illustrée) ;
     · tables    — roulette, blackjack, baccarat sur feutre ;
     · poker     — video poker et Texas Hold'em, ambiance feutrée ;
     · favoris   — les jeux mis en favori (cœur sur chaque carte) ;
     · récompenses — bonus quotidien, roue, VIP, missions.

   Le décor est une image de salle posée dans #scene (fixe, non cliquable),
   voilée par des dégradés pour que le texte reste lisible ; la couleur
   d'accent de la salle est publiée dans la variable CSS --salle, ce qui
   recolore boutons, onglets et lueurs sans dupliquer les règles.

   Aucune donnée de jeu n'est calculée ici : le lobby ne fait qu'afficher et
   router vers J.Games. Il reste donc sans effet sur les RNG et les gains.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;
  const U = J.util;
  const L = (J.Lobby = {});

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------- SALLES -- */
  const ROOMS = [
    { id: 'hall',    name: 'Accueil',    ico: 'sparkle',  scene: 'hall',        accent: '#ffd257', accent2: '#ff2e63', music: 'lobby' },
    { id: 'machines',name: 'Machines',   ico: 'slots',    scene: 'room-slots',  accent: '#ff5fb0', accent2: '#a855f7', music: 'room-slots' },
    { id: 'tables',  name: 'Jeux de table', ico: 'coin',  scene: 'room-tables', accent: '#10b981', accent2: '#ffd257', music: 'room-tables' },
    { id: 'poker',   name: 'Poker',      ico: 'cards',    scene: 'room-poker',  accent: '#a855f7', accent2: '#38bdf8', music: 'room-poker' },
    { id: 'favoris', name: 'Favoris',    ico: 'heart',    scene: 'hall',        accent: '#ff2e63', accent2: '#ffd257', music: 'lobby' },
    { id: 'bonus',   name: 'Récompenses',ico: 'gift',     scene: 'room-slots',  accent: '#ffd257', accent2: '#10b981', music: 'room-slots' }
  ];
  L.ROOMS = ROOMS;
  let room = 'hall';

  /* ------------------------------------------------- LES 6 MACHINES À SOUS --
     Chaque machine est présentée comme un jeu à part entière dans le lobby :
     nom, univers, façade illustrée, couleurs, musique et symboles propres.
     Le moteur reste commun (voir src/40-slots-tables.js) : une seule
     implémentation des règles et du RNG, six habillages complets. */
  const MACHINES = [
    {
      id: 'egypte', game: 'slots', theme: 'egypte', name: 'Trésors d\'Égypte',
      uniCourt: 'Sable & Or',
      univers: 'Univers A · Sable et Or', tagline: 'Le trésor des pharaons',
      art: 'slot-egypte', accent: '#ffd257', accent2: '#22d3ee', badge: 'or', music: 'slot-egypte',
      line: 'Hiéroglyphes, scarabées et chambres d\'or massif.'
    },
    {
      id: 'dragon', game: 'slots', theme: 'dragon', name: 'Royaume des Dragons',
      uniCourt: 'Cœur de Braise',
      univers: 'Univers B · Cœur de Braise', tagline: 'Le pacte du feu',
      art: 'slot-dragon', accent: '#ff3d3d', accent2: '#ff9d00', badge: 'r', music: 'slot-dragon',
      line: 'Écailles noires, lave et trésors du volcan.'
    },
    {
      id: 'gemmes', game: 'slots', theme: 'gemmes', name: 'Gemmes & Luxe',
      uniCourt: 'Éclat Facetté',
      univers: 'Univers C · Éclat Facetté', tagline: 'Le salon des bijoux',
      art: 'slot-gemmes', accent: '#a855f7', accent2: '#38bdf8', badge: 'v', music: 'slot-gemmes',
      line: 'Diamants à facettes, néons roses et argent poli.'
    },
    {
      id: 'fruits', game: 'slots', theme: 'neon', name: 'Fruits Néon',
      uniCourt: 'Rétro Néon',
      univers: 'Classique · Rétro Néon', tagline: 'Les classiques en néon',
      art: 'slot-fruits', accent: '#ff5fb0', accent2: '#a3e635', badge: 'c', music: 'slot-fruits',
      line: 'Les fruits et le 777, revisités au néon.'
    },
    {
      id: 'bonbons', game: 'slots', theme: 'bonbons', name: 'Sucre Rapide',
      uniCourt: 'Confiserie',
      univers: 'Classique · Confiserie', tagline: 'La machine gourmande',
      art: 'slot-bonbons', accent: '#ff8fc8', accent2: '#5eead4', badge: 'v', music: 'slot-bonbons',
      line: 'Sucettes, guimauves et pluie de bonbons.'
    },
    {
      id: 'aventure', game: 'slots', theme: 'jackpotly', name: 'Aventure Jackpotly',
      uniCourt: 'Cap sur le Trésor',
      univers: 'Maison · Cap sur le Trésor', tagline: 'Cap sur le trésor',
      art: 'slot-aventure', accent: '#10b981', accent2: '#ffd257', badge: 'c', music: 'slot-aventure',
      line: 'Coffres, cartes au trésor et kraken vert.'
    }
  ];
  L.MACHINES = MACHINES;
  L.machine = (id) => MACHINES.find((m) => m.id === id) || MACHINES[0];

  /* ------------------------------------------------------ COULEURS DE CARTE --
     Accent de présentation par jeu (séparé du moteur : c'est de l'habillage). */
  const ACCENT = {
    crash: { a: '#00e37a', b: '#38bdf8', badge: 'vert', uni: 'Originals' },
    dice: { a: '#38bdf8', b: '#a855f7', badge: 'c', uni: 'Originals' },
    mines: { a: '#22d3ee', b: '#0ea5e9', badge: 'c', uni: 'Originals' },
    plinko: { a: '#ffd257', b: '#ff5fb0', badge: 'or', uni: 'Originals' },
    limbo: { a: '#a855f7', b: '#ff2e63', badge: 'v', uni: 'Originals' },
    coinflip: { a: '#ffd257', b: '#10b981', badge: 'or', uni: 'Originals' },
    hilo: { a: '#ff5fb0', b: '#a855f7', badge: 'v', uni: 'Originals' },
    keno: { a: '#10b981', b: '#22d3ee', badge: 'vert', uni: 'Originals' },
    tower: { a: '#ff9d00', b: '#ff2e63', badge: 'r', uni: 'Originals' },
    wheel: { a: '#ff2e63', b: '#ffd257', badge: 'r', uni: 'Originals' },
    roulette: { a: '#10b981', b: '#ffd257', badge: 'vert', uni: 'Jeux de table' },
    blackjack: { a: '#0ea5e9', b: '#10b981', badge: 'c', uni: 'Jeux de table' },
    baccarat: { a: '#ffd257', b: '#ff2e63', badge: 'or', uni: 'Jeux de table' },
    videopoker: { a: '#a855f7', b: '#38bdf8', badge: 'v', uni: 'Poker' },
    poker: { a: '#38bdf8', b: '#a855f7', badge: 'c', uni: 'Poker' },
    slots: { a: '#ffd257', b: '#ff2e63', badge: 'or', uni: 'Machines à sous' }
  };
  const accentOf = (g) => ACCENT[g.id] || { a: '#ffd257', b: '#ff2e63', badge: 'or', uni: 'Casino' };

  /* La façade illustrée de la machine fait aussi office de visuel dans les
     listes : une carte de machine à sous montre son vrai cabinet. */
  const artOf = (g) => {
    if (g.id === 'slots') {
      const m = L.machine(J.Store.state.settings.lastMachine);
      return m.art;
    }
    return g.art || null;
  };

  /* -------------------------------------------------------------- FAVORIS -- */
  L.favorites = () => (J.Store.state.favorites || []);
  L.isFav = (id) => L.favorites().indexOf(id) >= 0;
  L.toggleFav = function (id) {
    const list = L.favorites().slice();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    J.Store.patch({ favorites: list });
    J.Sfx.click();
    J.haptic.tap();
    J.toast(i >= 0 ? 'Retiré des favoris' : 'Ajouté aux favoris', i >= 0 ? '' : 'ok');
    L.render();
  };

  /* ---------------------------------------------------------------- CARTES -- */
  /** Carte de jeu illustrée (utilisée par le lobby ET par le catalogue). */
  L.card = function (g, opts) {
    opts = opts || {};
    const a = accentOf(g);
    const machine = opts.machine || (g.id === 'slots' ? L.machine(J.Store.state.settings.lastMachine) : null);
    const art = opts.art || (machine ? machine.art : artOf(g));
    const contain = !!machine && !!art;
    const name = machine ? machine.name : g.name;
    const tag = machine ? machine.tagline : (g.tagline || '');
    const uni = machine ? machine.univers : a.uni;
    const fav = L.isFav(opts.favKey || g.id);
    const badgeCls = 'gc-badge ' + (machine ? (machine.badge || '') : (a.badge === 'or' ? '' : a.badge));
    const uniCourt = machine ? (machine.uniCourt || machine.univers) : uni;
    const style = '--tint:' + a.a + ';--tint2:' + a.b;
    return '<button class="game-tile gcard' + (machine ? ' tall' : '') + (g.hot ? ' hot' : '') + '" style="' + style + '"' +
        ' data-game="' + (machine ? g.id : g.id) + '"' + (machine ? ' data-machine="' + machine.id + '"' : '') +
        ' aria-label="' + U.esc(name + ' — ' + tag) + '">' +
      '<span class="gc-halo"></span>' +
      '<span class="gc-art" style="' + (art
          ? 'background-image:' + (contain ? 'radial-gradient(80% 50% at 50% 20%, ' + a.a + '2e, transparent 70%), ' : 'linear-gradient(180deg, rgba(0,0,0,.10), rgba(6,5,12,.92)), ') +
            'url(\'' + (J.Art.get(art) || '') + '\')'
          : 'background-image:radial-gradient(120% 90% at 50% 20%, ' + a.a + '4d, rgba(8,6,16,.92) 66%), linear-gradient(150deg,' + a.b + '33, transparent 70%)') + '">' +
        (art ? '' : '<span class="gc-glyph" style="color:' + a.a + '">' + (J.icon[g.icon] || '') + '</span>') +
        '<span class="' + badgeCls + '">' + U.esc(uniCourt) + '</span>' +
        (opts.fav === false ? '' : '<span class="gc-fav' + (fav ? ' on' : '') + '" data-fav="' + U.esc(opts.favKey || g.id) + '" role="button" aria-label="Favori">' + (fav ? J.icon.heartFull : J.icon.heart) + '</span>') +
      '</span>' +
      '<span class="gc-body">' +
        '<span class="gc-name">' + U.esc(name) + '</span>' +
        '<span class="gc-tag">' + U.esc(tag) + '</span>' +
        '<span class="gc-foot"><span class="gc-chips">' +
          '<span class="gc-rtp">' + (machine ? '5 rouleaux' : (g.category === 'originals' ? 'Original' : 'Table')) + '</span>' +
          (g.rtp ? '<span class="gc-rtp alt">RTP ' + g.rtp + ' %</span>' : '') +
        '</span><span class="gc-play">Jouer</span></span>' +
      '</span>' +
    '</button>';
  };

  /** Vignette du catalogue : conserve la classe .game-tile attendue par les tests. */
  L.tile = (g) => L.card(g);

  function bindCards(root) {
    root.querySelectorAll('[data-fav]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); e.preventDefault(); L.toggleFav(b.dataset.fav); };
    });
    root.querySelectorAll('[data-game]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.machine) return L.openMachine(b.dataset.machine);
        J.Games.open(b.dataset.game);
      };
    });
  }
  L.bindCards = bindCards;

  /* Ouvre une machine à sous précise : la dernière utilisée est mémorisée pour
     que la vignette générique du catalogue rouvre la même machine. */
  L.openMachine = function (machineId) {
    J.Store.patch({ settings: { lastMachine: machineId } });
    const m = L.machine(machineId);
    if (J.Music && m.music) J.Music.play(m.music);
    J.Games.open(m.game, { machine: machineId });
  };

  /* ---------------------------------------------------------- LE DÉCOR ---- */
  /** Applique la salle : image de fond, couleur d'accent, musique. */
  L.setScene = function (id, opts) {
    opts = opts || {};
    const r = ROOMS.find((x) => x.id === id) || ROOMS[0];
    room = r.id;
    const scene = $('scene');
    if (scene) {
      const uri = J.Art.get(r.scene);
      // Le dégradé de lisibilité est dans #scene::before : ici, juste l'image
      scene.style.setProperty('--scene-img', uri ? 'url("' + uri + '")' : 'none');
      scene.classList.toggle('no-art', !uri);
      scene.classList.add('room-scene');
      setTimeout(() => scene.classList.remove('room-scene'), 360);
    }
    document.documentElement.style.setProperty('--salle', r.accent);
    document.documentElement.style.setProperty('--salle-2', r.accent2);
    document.body.dataset.room = r.id;
    if (J.Music && r.music && !opts.silent) J.Music.play(r.music);
    return r;
  };
  L.room = () => room;

  /* --------------------------------------------------------- LE LOBBY ----- */
  function heroHtml() {
    const st = J.Store.state;
    const vip = J.Wallet.vipInfo();
    const uri = J.Art.get('hall');
    const canDaily = J.Rewards.canClaimDaily();
    const canWheel = J.Rewards.canSpinWheel();
    return '<div class="hero">' +
        '<div class="hero-bg" style="' + (uri ? 'background-image:url(\'' + uri + '\')' : 'background-image:radial-gradient(120% 90% at 50% 0%, #35207a, #0b0818 70%)') + '"></div>' +
        '<i class="hero-neon"></i>' +
        '<div class="hero-in">' +
          '<span class="hero-kicker">' + J.icon.crown + ' Casino social · jetons virtuels</span>' +
          '<div class="hero-t neon-title">Bienvenue, ' + U.esc(st.pseudo) + '</div>' +
          '<div class="hero-s">Six machines illustrées, dix Originals et six tables. Chaque salle a son décor, sa lumière et sa musique.</div>' +
          '<div class="hero-cta">' +
            '<button class="btn gold sm" data-hero="machines">' + J.icon.slots + ' Machines</button>' +
            '<button class="btn ghost sm" data-hero="tables">' + J.icon.coin + ' Tables</button>' +
          '</div>' +
          '<div class="row mt-s" style="gap:10px;flex-wrap:wrap">' +
            '<span class="badge ' + vip.tier.badge + '">' + J.icon.medal + ' ' + vip.tier.name + '</span>' +
            (canDaily ? '<span class="badge gold">' + J.icon.gift + ' Bonus prêt</span>' : '') +
            (canWheel ? '<span class="badge gold">' + J.icon.fortune + ' 1 tour offert</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      /* Accès rapides au pouce */
      '<div class="quick4 mt">' +
        quick('Bonus', J.icon.gift, 'quotidien', 'daily') +
        quick('Roue', J.icon.fortune, '1 tour/jour', 'wheel') +
        quick('Palier', J.icon.medal, 'VIP', 'vip') +
        quick('Jetons', J.icon.cart, 'boutique', 'shop') +
      '</div>';
  }

  function quick(label, icon, sub, act) {
    return '<button class="qc" data-quick="' + act + '">' +
      '<span class="qc-ico">' + icon + '</span><b>' + label + '</b><i>' + sub + '</i></button>';
  }

  function roomHall() {
    const featured = (J.GAMES || []).filter((g) => g.status === 'live').slice(0, 4);
    return heroHtml() +
      '<div class="sec-head"><div class="sec-t"><span class="sec-ico">' + J.icon.sparkle + '</span>' +
        '<span class="sec-txt"><b>En vedette ce soir</b><i>Les tables les plus jouées du hall</i></span></div></div>' +
      '<div class="grid2">' + featured.map((g) => L.card(g, { fav: false })).join('') + '</div>' +
      '<div class="sec-head rubis"><div class="sec-t"><span class="sec-ico">' + J.icon.chart + '</span>' +
        '<span class="sec-txt"><b>Gros gains récents</b><i>flux d\'ambiance · bots fictifs</i></span></div>' +
        '<span class="sec-more" id="feedCount">live</span></div>' +
      '<div class="card pad" id="homeFeed"></div>';
  }

  function roomMachines() {
    return '<div class="sec-head"><div class="sec-t"><span class="sec-ico">' + J.icon.slots + '</span>' +
        '<span class="sec-txt"><b>Galerie des machines</b><i>Six univers complets, cinq rouleaux chacun</i></span></div></div>' +
      '<div class="grid2">' + MACHINES.map((m) => L.card(J.Games.byId('slots'), { machine: m, fav: false, favKey: 'slots-' + m.id })).join('') + '</div>' +
      '<div class="note mt">Chaque machine possède sa façade, ses symboles, sa musique et ses effets de victoire. ' +
        'Les tours gratuits se déclenchent avec trois symboles de dispersion. RTP 96,5 % par machine.</div>';
  }

  function roomTables() {
    const ids = ['roulette', 'blackjack', 'baccarat'];
    return '<div class="sec-head vert"><div class="sec-t"><span class="sec-ico">' + J.icon.coin + '</span>' +
        '<span class="sec-txt"><b>Salle des jeux de table</b><i>Feutre vert, croupier et jetons</i></span></div></div>' +
      '<div class="grid2">' + ids.map((id) => J.Games.byId(id)).filter(Boolean).map((g) => L.card(g)).join('') + '</div>' +
      '<div class="note mt">' + J.icon.shield + ' Les adversaires sont des bots locaux, le croupier est simulé. ' +
      'Aucun échange entre joueurs, aucune valeur monétaire.</div>';
  }

  function roomPoker() {
    const ids = ['videopoker', 'poker'];
    return '<div class="sec-head violet"><div class="sec-t"><span class="sec-ico">' + J.icon.cards + '</span>' +
        '<span class="sec-txt"><b>Salon de poker</b><i>Feutre violet, lumières basses</i></span></div></div>' +
      '<div class="grid2">' + ids.map((id) => J.Games.byId(id)).filter(Boolean).map((g) => L.card(g)).join('') + '</div>' +
      '<div class="sec-head violet mt-l"><div class="sec-t"><span class="sec-ico">' + J.icon.sparkle + '</span>' +
        '<span class="sec-txt"><b>Originals du salon</b><i>Rapides, animés, au tap</i></span></div>' +
        '<span class="sec-more" data-room="machines">Autres salles</span></div>' +
      '<div class="grid2">' + (J.GAMES || []).filter((g) => ['hilo', 'coinflip', 'dice', 'limbo'].indexOf(g.id) >= 0).map((g) => L.card(g)).join('') + '</div>';
  }

  function roomFavoris() {
    const list = L.favorites();
    const games = (J.GAMES || []).filter((g) => list.indexOf(g.id) >= 0);
    const machines = MACHINES.filter((m) => list.indexOf('slots-' + m.id) >= 0);
    if (!games.length && !machines.length) {
      return '<div class="sec-head rubis"><div class="sec-t"><span class="sec-ico">' + J.icon.heartFull + '</span>' +
          '<span class="sec-txt"><b>Tes favoris</b><i>Vide pour l\'instant</i></span></div></div>' +
        '<div class="card pad center" style="padding:22px 16px">' +
          '<div style="color:var(--rubis);width:44px;height:44px;margin:0 auto 8px">' + J.icon.heartFull + '</div>' +
          '<b>Appuie sur le cœur d\'une carte</b>' +
          '<div class="sub mt-s">Le jeu apparaît ici, juste sous ton pouce.</div>' +
          '<button class="btn gold block mt" data-room="machines">' + J.icon.slots + ' Parcourir les machines</button>' +
        '</div>';
    }
    const slotGames = games.filter((g) => g.id === 'slots');
    return '<div class="sec-head rubis"><div class="sec-t"><span class="sec-ico">' + J.icon.heartFull + '</span>' +
        '<span class="sec-txt"><b>Tes favoris</b><i>' + (games.length + machines.length) + ' jeu(x) épinglé(s)</i></span></div></div>' +
      '<div class="grid2">' +
        slotGames.map((g) => L.card(g)).join('') +
        machines.map((m) => L.card(J.Games.byId('slots'), { machine: m, favKey: 'slots-' + m.id })).join('') +
        games.filter((g) => g.id !== 'slots').map((g) => L.card(g)).join('') +
      '</div>';
  }

  function roomBonus() {
    const st = J.Store.state;
    const vip = J.Wallet.vipInfo();
    const canDaily = J.Rewards.canClaimDaily();
    const canWheel = J.Rewards.canSpinWheel();
    const rc = J.Rewards.rechargeState ? J.Rewards.rechargeState() : null;
    const quests = (st.quests && st.quests.items) || [];
    const doneQ = quests.filter((q) => q.claimed).length;
    const pct = Math.round(vip.pct);
    return '<div class="sec-head"><div class="sec-t"><span class="sec-ico">' + J.icon.gift + '</span>' +
        '<span class="sec-txt"><b>Récompenses</b><i>Gratuit, plafonné, une fois par période</i></span></div></div>' +
      '<div class="grid2">' +
        '<button class="card pad' + (canDaily ? ' glow-green' : '') + '" data-quick="daily" style="min-height:96px;text-align:left">' +
          '<span style="color:var(--green)">' + J.icon.gift + '</span><b class="mt-s" style="display:block">Bonus quotidien</b>' +
          '<span class="sub">' + (canDaily ? 'Disponible maintenant' : 'Déjà récupéré aujourd\'hui') + '</span></button>' +
        '<button class="card pad' + (canWheel ? ' glow-gold' : '') + '" data-quick="wheel" style="min-height:96px;text-align:left">' +
          '<span style="color:var(--or)">' + J.icon.fortune + '</span><b class="mt-s" style="display:block">Roue de la chance</b>' +
          '<span class="sub">' + (canWheel ? '1 tour gratuit' : 'Reviens demain') + '</span></button>' +
      '</div>' +
      '<div class="card pad mt">' +
        '<div class="row between"><b>' + J.icon.medal + ' ' + vip.tier.name + '</b><span class="sub">' + (vip.next ? 'Prochain : ' + vip.next.name : 'Palier max') + '</span></div>' +
        '<div class="progress mt-s"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sub mt-s">' + U.fmt(st.vip.wagered) + ' J misés' + (vip.next ? ' · ' + U.fmtK(vip.remaining) + ' J avant ' + vip.next.name : '') + '</div>' +
        '<div class="btn-row two mt"><button class="btn gold" data-quick="vip">Voir les paliers</button>' +
        '<button class="btn ghost" data-quick="shop">Packs de jetons</button></div>' +
      '</div>' +
      '<div class="sec-head mt-l"><div class="sec-t"><span class="sec-ico">' + J.icon.target + '</span>' +
        '<span class="sec-txt"><b>Missions du jour</b><i>' + doneQ + ' / ' + quests.length + ' récupérée(s)</i></span></div>' +
        '<span class="sec-more" data-goto-profile="1">Profil</span></div>' +
      '<div class="card pad">' + (quests.length ? quests.slice(0, 3).map((q) =>
          '<div class="row between" style="padding:5px 0"><span class="sub" style="font-size:11.5px">' + U.esc(q.title || '') + '</span>' +
          '<span class="' + (q.claimed ? 'up' : 'muted') + '" style="font-size:11px;font-weight:800">' +
            (q.claimed ? 'récupérée' : U.fmt(Math.min(q.progress || 0, q.target || 0)) + ' / ' + U.fmt(q.target || 0)) + '</span></div>').join('')
        : '<div class="sub">Missions en préparation…</div>') + '</div>' +
      (rc && rc.ready ? '<div class="card pad mt glow-green"><b>' + J.icon.refill + ' Recharge gratuite prête</b>' +
        '<div class="sub mt-s">Ton solde est bas : ' + U.fmt(rc.amount) + ' jetons offerts.</div>' +
        '<button class="btn gold block mt" data-quick="recharge">Recharger</button></div>' : '');
  }

  const RENDER = { hall: roomHall, machines: roomMachines, tables: roomTables, poker: roomPoker, favoris: roomFavoris, bonus: roomBonus };

  /** Rendu complet du lobby (appelé par J.Screen.renderHome). */
  L.render = function () {
    const st = J.Store.state;
    const tabs = $('roomTabs');
    if (!tabs) return;
    $('homePseudo').textContent = U.esc(st.pseudo);
    const h = new Date().getHours();
    $('homeGreeting').textContent = h < 6 ? 'Bonne nuit — pense à dormir 😴'
      : h < 12 ? 'Bonne matinée et bonne chance !'
      : h < 18 ? 'Bonne après-midi !' : 'Bonne soirée !';

    tabs.innerHTML = ROOMS.map((r) =>
      '<button class="room' + (r.id === room ? ' is-on' : '') + '" data-room="' + r.id + '">' +
        (J.icon[r.ico] || '') + ' ' + r.name + '</button>').join('');

    const body = $('roomBody');
    body.innerHTML = (RENDER[room] || roomHall)();

    bindCards(body);
    body.querySelectorAll('[data-room]').forEach((b) => { b.onclick = () => { J.Sfx.click(); L.go(b.dataset.room); }; });
    body.querySelectorAll('[data-quick]').forEach((b) => {
      b.onclick = () => {
        J.Sfx.click();
        const a = b.dataset.quick;
        if (a === 'daily') J.Rewards.openDaily();
        else if (a === 'wheel') J.Rewards.openWheel();
        else if (a === 'recharge') J.Rewards.openRecharge();
        else if (a === 'vip') J.Screen.openVip();
        else if (a === 'shop') J.UI.go('shop');
      };
    });
    body.querySelectorAll('[data-goto-profile]').forEach((b) => { b.onclick = () => J.UI.go('profile'); });
    body.querySelectorAll('[data-hero]').forEach((b) => { b.onclick = () => { J.Sfx.click(); L.go(b.dataset.hero); }; });

    // Flux des gros gains (salle du hall uniquement)
    const feed = $('homeFeed');
    if (feed) {
      const rows = J.Live.recent.slice(0, 5);
      feed.innerHTML = rows.length ? rows.map((f) =>
        '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line-soft)">' +
          '<div class="row grow"><span class="avatar" style="width:24px;height:24px;font-size:10px;background:' + f.color + '">' +
            U.esc(f.name.charAt(0).toUpperCase()) + '</span>' +
            '<span style="font-size:12px;font-weight:700" class="ellipsis">' + U.esc(f.name) + '</span>' +
            '<span class="sub" style="font-size:10.5px">' + U.esc(f.gameName) + '</span></div>' +
          '<div class="row"><span class="mono up" style="font-size:11.5px">' + U.fmtMult(f.mult) + '</span>' +
          '<span class="mono gold" style="font-size:11.5px">+' + U.fmtK(f.amount) + '</span></div>' +
        '</div>').join('') : '<div class="sub">Chargement du flux…</div>';
      const c = $('feedCount');
      if (c) c.textContent = 'live';
    }
  };

  /** Change de salle : décor, musique, onglet et remontée en haut de page. */
  L.go = function (id) {
    if (!ROOMS.some((r) => r.id === id)) id = 'hall';
    L.setScene(id);
    if (id !== room || !$('roomBody').innerHTML) { room = id; }
    room = id;
    L.render();
    const s = document.getElementById('screen-home');
    if (s) s.scrollTop = 0;
  };

  /* Le décor suit aussi la navigation générale : le hall garde sa salle. */
  J.Bus.on('screen:enter', (id) => {
    if (id === 'home') { L.setScene(room, { silent: true }); L.render(); }
    else if (id === 'originals') L.setScene('machines', { silent: true });
    else if (id === 'rank') L.setScene('hall', { silent: true });
    else if (id === 'shop') L.setScene('bonus', { silent: true });
    else if (id === 'profile') L.setScene('poker', { silent: true });
  });

  J.Bus.on('wallet:settled', () => { if (J.UI.current && J.UI.current() === 'home') L.render(); });
  J.Bus.on('quests:update', () => { if (room === 'bonus') L.render(); });
})();
