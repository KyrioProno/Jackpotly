"""Icônes SVG d'interface (fin) : écran de bienvenue (dernier écran emoji)."""
import sys

P = 'src/50-boot.js'
s = open(P, encoding='utf-8').read()

pairs = [
    ("title: 'Bienvenue sur JACKPOTLY \U0001F44B',",
     "title: 'Bienvenue sur JACKPOTLY',"),
    ("'<div class=\"kv mt\"><span class=\"k\">\U0001F381 Bonus quotidien</span>",
     "'<div class=\"kv mt\"><span class=\"k\">' + J.icon.gift + ' Bonus quotidien</span>"),
    ("'<div class=\"kv\"><span class=\"k\">\U0001F3A1 Roue de la chance</span>",
     "'<div class=\"kv\"><span class=\"k\">' + J.icon.fortune + ' Roue de la chance</span>"),
    ("'<div class=\"kv\"><span class=\"k\">\U0001F4B8 Solde \u00e0 z\u00e9ro</span>",
     "'<div class=\"kv\"><span class=\"k\">' + J.icon.refill + ' Solde \u00e0 z\u00e9ro</span>"),
    ("{ label: '\U0001F381 Prendre mon bonus',",
     "{ label: J.icon.gift + ' Prendre mon bonus',"),
]

for old, new in pairs:
    if new in s:
        print('déjà fait:', new[:44])
        continue
    if old not in s:
        print('PAS TROUVÉ:', old[:60])
        sys.exit(1)
    s = s.replace(old, new, 1)
    print('ok', new[:44])

open(P, 'w', encoding='utf-8').write(s)
