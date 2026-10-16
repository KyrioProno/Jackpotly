"""Icônes SVG d'interface (suite) : menus, titres de modales, boutons, boutique.
Les emojis des messages, gains et animations sont conservés (choix hybride)."""
import sys

done = []

def sub(path, old, new, tag):
    s = open(path, encoding='utf-8').read()
    if new in s:
        print('déjà fait:', tag)
        return
    if old not in s:
        print('PAS TROUVÉ:', tag)
        sys.exit(1)
    open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    done.append(tag)

U = 'src/24-ui.js'

# --- Modales : titres et menus
sub(U, "title: '\U0001F3C5 Niveau ' + tier.name + ' atteint !',",
       "title: J.icon.medal + ' Niveau ' + tier.name + ' atteint !',", 'paliers')
sub(U, "title: '\u23F8\uFE0F Petite pause ?',", "title: J.icon.hourglass + ' Petite pause ?',", 'pause')
sub(U, "'<button class=\"btn ghost block\" data-menu=\"daily\">\U0001F381 Bonus quotidien ' +",
       "'<button class=\"btn ghost block\" data-menu=\"daily\">' + J.icon.gift + ' Bonus quotidien ' +", 'menu-daily')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"wheel\">\U0001F3A1 Roue de la chance ' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"wheel\">' + J.icon.fortune + ' Roue de la chance ' +", 'menu-wheel')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"fair\">\U0001F510 Fair Play (provably fair)</button>' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"fair\">' + J.icon.key + ' Fair Play (provably fair)</button>' +", 'menu-fair')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"history\">\U0001F9FE Historique des paris</button>' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"history\">' + J.icon.receipt + ' Historique des paris</button>' +", 'menu-history')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"responsible\">\U0001F6E1\uFE0F Jeu responsable</button>' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"responsible\">' + J.icon.shield + ' Jeu responsable</button>' +", 'menu-responsible')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"settings\">\u2699\uFE0F R\u00e9glages</button>' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"settings\">' + J.icon.settings + ' R\u00e9glages</button>' +", 'menu-settings')
sub(U, "'<button class=\"btn ghost block mt-s\" data-menu=\"about\">\u2139\uFE0F \u00c0 propos / Mentions l\u00e9gales</button>' +",
       "'<button class=\"btn ghost block mt-s\" data-menu=\"about\">' + J.icon.info + ' \u00c0 propos / Mentions l\u00e9gales</button>' +", 'menu-about')

# --- Feuille « portefeuille »
sub(U, "'<button class=\"btn ghost block mt\" data-keep-sheet data-menu2=\"daily\">\U0001F381 Bonus quotidien</button>' +",
       "'<button class=\"btn ghost block mt\" data-keep-sheet data-menu2=\"daily\">' + J.icon.gift + ' Bonus quotidien</button>' +", 'sheet-daily')
sub(U, "'<button class=\"btn gold block mt-s\" data-keep-sheet data-menu2=\"shop\">\U0001F6D2 Acheter un pack de jetons</button>' +",
       "'<button class=\"btn gold block mt-s\" data-keep-sheet data-menu2=\"shop\">' + J.icon.cart + ' Acheter un pack de jetons</button>' +", 'sheet-shop')

# --- Titres des feuilles et états vides
sub(U, "'<div class=\"row between\"><div class=\"h2\">Historique des paris</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.receipt + ' Historique des paris</div>", 'h2-history')
sub(U, "'<div class=\"row between\"><div class=\"h2\">R\u00e9glages</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.settings + ' R\u00e9glages</div>", 'h2-settings')
sub(U, "'<div class=\"row between\"><div class=\"h2\">\u00c0 propos</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.info + ' \u00c0 propos</div>", 'h2-about')
sub(U, "'<div class=\"row between\"><div class=\"h2\">\U0001F6E1\uFE0F Jeu responsable</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.shield + ' Jeu responsable</div>", 'h2-responsible')
sub(U, "'<div class=\"row between\"><div class=\"h2\">\U0001F510 Fair Play</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.key + ' Fair Play</div>", 'h2-fair')
sub(U, "'<div class=\"row between\"><div class=\"h2\">\U0001F381 Bonus quotidien</div>",
       "'<div class=\"row between\"><div class=\"h2\">' + J.icon.gift + ' Bonus quotidien</div>", 'h2-daily-modal')
sub(U, "'<div class=\"empty\"><div class=\"e-ico\">\U0001F9FE</div>Aucun pari pour le moment.</div>'",
       "'<div class=\"empty\"><div class=\"e-ico\">' + J.icon.receipt + '</div>Aucun pari pour le moment.</div>'", 'empty-history')
sub(U, "'<button class=\"btn gold block mt-l\" id=\"rotate\">\U0001F504 Tourner la graine & r\u00e9v\u00e9ler</button>' +",
       "'<button class=\"btn gold block mt-l\" id=\"rotate\">' + J.icon.rotate + ' Tourner la graine & r\u00e9v\u00e9ler</button>' +", 'rotate')

R = 'src/26-rewards.js'
sub(R, "title: '\U0001F381 Bonus quotidien',", "title: J.icon.gift + ' Bonus quotidien',", 'rew-daily-title')
sub(R, "title: '\U0001F3A1 Roue de la chance',", "title: J.icon.fortune + ' Roue de la chance',", 'rew-wheel-title')
sub(R, "label: canSpin ? '\U0001F3A1 Tourner' : 'Revenir demain',",
       "label: canSpin ? J.icon.rotate + ' Tourner' : 'Revenir demain',", 'rew-spin')
sub(R, "label: s.ready ? '\U0001F381 Recharger ' + U.fmt(s.amount) + ' jetons'",
       "label: s.ready ? J.icon.refill + ' Recharger ' + U.fmt(s.amount) + ' jetons'", 'rew-recharge')
sub(R, "a.push({ label: '\U0001F6D2 Boutique', cls: 'gold',",
       "a.push({ label: J.icon.cart + ' Boutique', cls: 'gold',", 'rew-shop')
sub(R, "title: '\U0001F4B8 Solde \u00e9puis\u00e9',", "title: J.icon.refill + ' Solde \u00e9puis\u00e9',", 'rew-empty-title')

S = 'src/34-shop.js'
sub(S, "title: '\U0001F6E1\uFE0F Limite de d\u00e9penses mensuelle',",
       "title: J.icon.shield + ' Limite de d\u00e9penses mensuelle',", 'shop-limit')

print('\n'.join('ok ' + d for d in done) if done else 'rien à faire')
