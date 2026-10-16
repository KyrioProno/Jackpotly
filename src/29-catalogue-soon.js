/* =========================================================================
   JACKPOTLY — FEUILLE DE ROUTE (catalogue des jeux à venir)
   Mécanisme du registre : un jeu déclaré avec `status: 'soon'` apparaît dans
   le lobby avec son RTP prévu, sa règle et sa vague, sans être jouable — le
   catalogue reste ainsi la seule source de vérité du lobby.

   Les 16 jeux prévus sont désormais TOUS jouables (vagues 1, 2 et 3) : la
   liste ci-dessous est donc vide. Pour ajouter un jeu futur, il suffit de le
   déclarer ici ; il s'affichera automatiquement dans le catalogue avec son
   badge « bientôt » et sa fiche descriptive.
   ========================================================================= */
(function () {
  'use strict';
  const J = window.JACKPOTLY;

  /** Déclaration compacte d'un jeu à venir (aucun jeu en attente pour l'instant). */
  function soon(id, name, icon, color, rtp, tagline, hint, wave, category, volatility) {
    J.Games.register({
      id: id, name: name, icon: icon, color: color, rtp: rtp, tagline: tagline,
      hint: hint, wave: wave, category: category, volatility: volatility,
      status: 'soon',
      rules: 'Ce jeu arrive bientôt dans JACKPOTLY.'
    });
  }
  void soon;

  /* Aucun jeu en feuille de route : 10 Originals + 6 classiques sont livrés. */
})();
