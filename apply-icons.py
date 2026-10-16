"""Remplace les emojis d'INTERFACE par des icônes SVG internes (choix hybride).
Les emojis restent dans les messages, gains et animations."""
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

P = 'src/27-screens.js'

# --- Cartes de l'accueil
sub(P, "promos.push({ ico: '\U0001F381', t: 'Bonus quotidien'",
       "promos.push({ ico: J.icon.gift, t: 'Bonus quotidien'", 'promo-bonus')
sub(P, "promos.push({ ico: '\U0001F3A1', t: 'Roue de la chance'",
       "promos.push({ ico: J.icon.fortune, t: 'Roue de la chance'", 'promo-roue')
sub(P, "promos.push({ ico: '\U0001F4B8', t: 'Solde \u00e9puis\u00e9'",
       "promos.push({ ico: J.icon.refill, t: 'Solde \u00e9puis\u00e9'", 'promo-refill')
sub(P, "ico: '\U0001F3C5', t: 'Statut ' + vip.tier.name",
       "ico: J.icon.medal, t: 'Statut ' + vip.tier.name", 'promo-vip')
sub(P, "promos.push({ ico: '\U0001F6D2', t: 'Packs de jetons'",
       "promos.push({ ico: J.icon.cart, t: 'Packs de jetons'", 'promo-shop')

# --- Titres de sections
def h2(emoji, label, icon, tag):
    sub(P, "'<div class=\"section\"><div class=\"section-head\"><div class=\"h2\">" + emoji + " " + label + "</div>",
           "'<div class=\"section\"><div class=\"section-head\"><div class=\"h2\">' + J.icon." + icon + " + ' " + label + "</div>", tag)

h2('\U0001F6D2', 'Packs de jetons', 'cart', 'h2-shop')
h2('\U0001F381', 'Jetons gratuits', 'gift', 'h2-gratuits')
h2('\U0001F6E1\ufe0f', 'Contr\u00f4le des d\u00e9penses', 'shield', 'h2-depenses')
h2('\U0001F9FE', 'Mes achats (simul\u00e9s)', 'receipt', 'h2-achats')
h2('\U0001F4CA', 'Statistiques', 'chart', 'h2-stats')
h2('\U0001F3AF', 'Missions du jour', 'target', 'h2-missions')
h2('\U0001F3AE', 'D\u00e9tail par jeu', 'gamepad', 'h2-detail')
h2('\U0001F6E1\ufe0f', 'Jeu responsable & r\u00e9glages', 'shield', 'h2-responsable')

# --- Badge VIP du profil
sub(P, "'<div class=\"row mt-s\"><span class=\"badge ' + vip.tier.badge + '\">\U0001F3C5 ' + vip.tier.name + '</span>' +",
       "'<div class=\"row mt-s\"><span class=\"badge ' + vip.tier.badge + '\">' + J.icon.medal + ' ' + vip.tier.name + '</span>' +", 'badge-vip')

# --- Rangée d'actions rapides du profil
sub(P,
    "'<button class=\"btn sm ghost\" data-prof=\"daily\">\U0001F381<br>Bonus</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"wheel\">\U0001F3A1<br>Roue</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"fair\">\U0001F510<br>Fair Play</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"settings\">\u2699\ufe0f<br>R\u00e9glages</button>' +",
    "'<button class=\"btn sm ghost\" data-prof=\"daily\">' + J.icon.gift + '<br>Bonus</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"wheel\">' + J.icon.fortune + '<br>Roue</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"fair\">' + J.icon.key + '<br>Fair Play</button>' +\n"
    "        '<button class=\"btn sm ghost\" data-prof=\"settings\">' + J.icon.settings + '<br>R\u00e9glages</button>' +",
    'profil-boutons')

# --- Pastilles de missions et de paliers VIP
sub(P, "'<span class=\"q-ico\">' + (item.claimed ? '\u2705' : done ? '\U0001F381' : '\U0001F3AF') + '</span>' +",
       "'<span class=\"q-ico\">' + (item.claimed ? J.icon.check : done ? J.icon.gift : J.icon.target) + '</span>' +", 'q-ico')
sub(P, "'<span class=\"q-ico\">' + (claimed ? '\u2705' : reached ? '\U0001F381' : '\U0001F512') + '</span>' +",
       "'<span class=\"q-ico\">' + (claimed ? J.icon.check : reached ? J.icon.gift : J.icon.lock) + '</span>' +", 'vip-ico')

# --- Modale VIP + écran vide + bouton de pack
sub(P, "title: '\U0001F3C5 Programme VIP',", "title: J.icon.medal + ' Programme VIP',", 'vip-titre')
sub(P, "'<div class=\"empty\"><div class=\"e-ico\">\U0001F3AE</div>Aucune partie jou\u00e9e pour l\\'instant.</div>'",
       "'<div class=\"empty\"><div class=\"e-ico\">' + J.icon.gamepad + '</div>Aucune partie jou\u00e9e pour l\\'instant.</div>'", 'empty-jeux')
sub(P, "(available ? (p.firstOnly ? '\U0001F381 Acheter \u00e0 prix r\u00e9duit' : 'Acheter (simul\u00e9)') : '\U0001F512 Indisponible (limite atteinte)') + '</button>' +",
       "(available ? (p.firstOnly ? J.icon.gift + ' Acheter \u00e0 prix r\u00e9duit' : 'Acheter (simul\u00e9)') : J.icon.lock + ' Indisponible (limite atteinte)') + '</button>' +", 'pack-bouton')

print('\n'.join('ok ' + d for d in done))
