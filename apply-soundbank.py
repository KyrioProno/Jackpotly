"""Banque sonore par jeu (v0.3.2).

Chaque jeu reçoit un timbre (forme d'onde), un registre (décalage en demi-tons)
et un motif de 2 à 4 notes. Les sons de manche passent par ce timbre ; les
jingles de gain restent communs (signature de JACKPOTLY)."""
import sys

P = 'src/22-audio-fx.js'
s = open(P, encoding='utf-8').read()
done = []

def sub(old, new, tag):
    global s
    if new in s:
        print('déjà fait:', tag)
        return
    if old not in s:
        print('PAS TROUVÉ:', tag)
        sys.exit(1)
    s = s.replace(old, new, 1)
    done.append(tag)

# 1) Transposition : demi-tons -> rapport de fréquences (notes ET bruit)
sub("""    function tone(o) {
      const c = ensure(); if (!c) return;
      const freq = fin(o.freq, 440), dur = fin(o.dur, 0.1);""",
    """    /** Rapport de fréquences d'un décalage en demi-tons (banque sonore). */
    const pow2 = (semi) => Math.pow(2, fin(semi, 0) / 12);

    function tone(o) {
      const c = ensure(); if (!c) return;
      const tr = pow2(o.semi);
      const freq = fin(o.freq, 440) * tr, dur = fin(o.dur, 0.1);""", 'tone-transpose')

sub("""      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, fin(o.slide, freq)), t0 + dur);""",
    """      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, fin(o.slide, fin(o.freq, 440)) * tr), t0 + dur);""",
    'tone-slide')

sub("""    function noise(o) {
      const c = ensure(); if (!c || !noiseBuf) return;
      const dur = fin(o.dur, 0.1);""",
    """    function noise(o) {
      const c = ensure(); if (!c || !noiseBuf) return;
      const tr = pow2(o.semi);
      const dur = fin(o.dur, 0.1);""", 'noise-transpose')

sub("""      const f0 = fin(o.freq, 1200);
      f.frequency.setValueAtTime(f0, t0);
      if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, fin(o.slide, f0)), t0 + dur);""",
    """      const f0 = fin(o.freq, 1200) * tr;
      f.frequency.setValueAtTime(f0, t0);
      if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, fin(o.slide, fin(o.freq, 1200)) * tr), t0 + dur);""",
    'noise-slide')

# 2) Table des timbres + helpers « voix du jeu »
sub("""    const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };""",
    """    const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

    /* ------------------------------------------- BANQUE SONORE PAR JEU (v0.3.2)
       Chaque table possède un timbre (wave), un registre (semi : décalage en
       demi-tons) et un motif (signature de 2 à 4 notes jouée à l'ouverture).
       Les sons de manche — mise, tick, révélation, encaissement, perte —
       passent par ce timbre : sans regarder l'écran, on reconnaît le jeu.
       Les jingles de gain (winJingle/jackpot) restent communs : c'est la
       signature sonore de JACKPOTLY, identique sur les 16 tables. */
    const BANK = {
      crash:      { wave: 'sawtooth', semi: -5, motif: [0, 7, 12] },
      dice:       { wave: 'square',   semi:  3, motif: [0, 5] },
      mines:      { wave: 'triangle', semi: -3, motif: [0, 3, 7] },
      plinko:     { wave: 'sine',     semi:  5, motif: [0, 4, 7, 12] },
      limbo:      { wave: 'square',   semi: -7, motif: [0, 10] },
      coinflip:   { wave: 'triangle', semi:  7, motif: [0, 12] },
      hilo:       { wave: 'sine',     semi: -1, motif: [0, 2, 5] },
      keno:       { wave: 'triangle', semi:  4, motif: [0, 4, 7, 11] },
      tower:      { wave: 'sawtooth', semi:  2, motif: [0, 5, 9] },
      wheel:      { wave: 'square',   semi: -4, motif: [0, 7] },
      roulette:   { wave: 'sine',     semi:  0, motif: [0, 7, 10] },
      blackjack:  { wave: 'triangle', semi: -2, motif: [0, 3, 5, 8] },
      baccarat:   { wave: 'sine',     semi:  2, motif: [0, 5, 9] },
      slots:      { wave: 'sawtooth', semi:  6, motif: [0, 4, 9, 12] },
      videopoker: { wave: 'square',   semi: -6, motif: [0, 2, 7] },
      poker:      { wave: 'triangle', semi:  1, motif: [0, 4, 6] },
      default:    { wave: null,       semi:  0, motif: [0, 7] }        // hors table
    };

    let active = 'default';
    const theme = () => BANK[active] || BANK.default;

    /** Note jouée avec le timbre du jeu ouvert. */
    function vtone(o) {
      const t = theme();
      tone(Object.assign({ type: t.wave || 'sine', semi: t.semi }, o));
    }
    /** Percussion jouée dans le registre du jeu ouvert. */
    function vnoise(o) {
      noise(Object.assign({ semi: theme().semi }, o));
    }
    /** Arpège joué avec le timbre du jeu ouvert. */
    function varp(freqs, o) {
      const t = theme();
      arp(freqs.map((f) => f * pow2(t.semi)), Object.assign({ type: t.wave || 'triangle' }, o));
    }""", 'bank')

# 3) Sons de manche routés par le timbre du jeu
sub("""      chip() { noise({ freq: 2600, dur: 0.07, gain: 0.12, q: 2 }); tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.10 }); },
      bet() { arp([NOTES.C5, NOTES.E5], { step: 0.045, dur: 0.10, gain: 0.16 }); },""",
    """      chip() { vnoise({ freq: 2600, dur: 0.07, gain: 0.12, q: 2 }); vtone({ freq: 880, dur: 0.06, gain: 0.10 }); },
      bet() { varp([NOTES.C5, NOTES.E5], { step: 0.045, dur: 0.10, gain: 0.16 }); },""", 'chip-bet')

sub("""      lose() { tone({ freq: 220, dur: 0.30, type: 'sawtooth', gain: 0.13, slide: 90 }); },
      bust() { tone({ freq: 180, dur: 0.7, type: 'sawtooth', gain: 0.2, slide: 45 }); noise({ freq: 420, slide: 90, dur: 0.65, gain: 0.16, filter: 'lowpass' }); },""",
    """      lose() { vtone({ freq: 220, dur: 0.30, type: 'sawtooth', gain: 0.13, slide: 90 }); },
      bust() { vtone({ freq: 180, dur: 0.7, type: 'sawtooth', gain: 0.2, slide: 45 }); vnoise({ freq: 420, slide: 90, dur: 0.65, gain: 0.16, filter: 'lowpass' }); },""", 'lose-bust')

sub("""      tick(v) { tone({ freq: 1000 + Math.min(900, (Number.isFinite(v) ? v : 0) * 40), dur: 0.035, type: 'square', gain: 0.055 }); },
      cashout() { arp([NOTES.G5, NOTES.C6, NOTES.E6], { step: 0.045, dur: 0.22, gain: 0.26 }); },""",
    """      tick(v) { vtone({ freq: 1000 + Math.min(900, (Number.isFinite(v) ? v : 0) * 40), dur: 0.035, gain: 0.055 }); },
      cashout() { varp([NOTES.G5, NOTES.C6, NOTES.E6], { step: 0.045, dur: 0.22, gain: 0.26 }); },""", 'tick-cashout')

sub("""      reveal(safe) {
        if (safe) tone({ freq: 1180, dur: 0.11, type: 'triangle', gain: 0.16, slide: 1560 });
        else { tone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.22, slide: 60 }); noise({ freq: 500, slide: 100, dur: 0.5, gain: 0.18, filter: 'lowpass' }); }
      },
      coin() { tone({ freq: 1760, dur: 0.09, type: 'square', gain: 0.10, slide: 2400 }); tone({ freq: 2400, dur: 0.10, type: 'triangle', gain: 0.07, delay: 0.05 }); },""",
    """      reveal(safe) {
        if (safe) vtone({ freq: 1180, dur: 0.11, gain: 0.16, slide: 1560 });
        else { vtone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.22, slide: 60 }); vnoise({ freq: 500, slide: 100, dur: 0.5, gain: 0.18, filter: 'lowpass' }); }
      },
      coin() { vtone({ freq: 1760, dur: 0.09, gain: 0.10, slide: 2400 }); tone({ freq: 2400, dur: 0.10, type: 'triangle', gain: 0.07, delay: 0.05 }); },""", 'reveal-coin')

sub("""      wheelTick(speed) { tone({ freq: 780 + (Number.isFinite(speed) ? speed : 0.5) * 340, dur: 0.03, type: 'square', gain: 0.05 }); },""",
    """      wheelTick(speed) { vtone({ freq: 780 + (Number.isFinite(speed) ? speed : 0.5) * 340, dur: 0.03, gain: 0.05 }); },

      /* -------------------------------------------- VOIX DU JEU (v0.3.2) --
         setGame() choisit le timbre ; motif() joue la signature de la table à
         son ouverture, spinup() marque le départ d'une manche et land() son
         atterrissage. Rien de tout cela ne dépend du résultat du jeu. */
      setGame(id) { active = BANK[id] ? id : 'default'; },
      currentGame: () => active,
      motif() { varp(theme().motif.map((semi) => NOTES.C6 * pow2(semi)), { step: 0.075, dur: 0.20, gain: 0.13 }); },
      spinup() {
        vnoise({ freq: 700, slide: 3200, dur: 0.30, gain: 0.09, q: 0.9, filter: 'highpass' });
        varp([NOTES.E5, NOTES.G5], { step: 0.055, dur: 0.12, gain: 0.15 });
      },
      land() { vnoise({ freq: 260, slide: 150, dur: 0.10, gain: 0.09, q: 1.2, filter: 'lowpass' }); },""", 'voix-du-jeu')

open(P, 'w', encoding='utf-8').write(s)
print('\n'.join('ok ' + d for d in done) if done else 'rien à faire')
