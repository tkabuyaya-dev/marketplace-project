# NUNULIA — Kit marketing

Assets promotionnels ciblant **Burundi 🇧🇮 · RD Congo 🇨🇩 · Tanzanie 🇹🇿**.
4 langues (FR / EN / Swahili / Kirundi) · 2 thèmes (sombre / clair) · carte de visite.

## 📱 Réseaux sociaux

| Format | Dimensions | Usage | Fichiers |
|---|---|---|---|
| Post | 1080×1080 | Instagram / Facebook feed | `nunulia-post-{lang}-{dark\|light}.png` |
| Story | 1080×1920 | Story / Reels / WhatsApp Status | `nunulia-story-{lang}-{dark\|light}.png` |
| Bannière | 1200×630 | Aperçu de lien (WhatsApp/FB/OG), couverture | `nunulia-banner-{lang}.png` (sombre) |

`{lang}` = `fr` · `en` · `sw` (Swahili) · `rn` (Kirundi)

## 💳 Carte de visite (prête à imprimer)

| Fichier | Dimensions | Note |
|---|---|---|
| `nunulia-card-front.png` | 1050×600 | Recto — marque (logo + wordmark) |
| `nunulia-card-back.png` | 1050×600 | Verso — nom, coordonnées, drapeaux, QR |

- **1050×600 px = 89×51 mm à 300 dpi** (format standard). Pour l'impression avec fond
  perdu, demander la version avec 3 mm de bleed (1063×613).
- **Carte de marque** (pas de nom de personne) : accroche « Votre marché, dans votre
  poche », coordonnées, drapeaux et QR. Utilisable par toute l'équipe.

## Contenu commun
- Logo officiel (`public/icons/icon-512.png`) + wordmark NUNULIA
- Message localisé (Achetez et vendez / Buy and sell / Nunua na uuza / Gura kandi ugurishe)
- Drapeaux vectoriels Burundi · RD Congo · Tanzanie
- **Bouton lien `nunulia.com`** + QR code → https://nunulia.com
- **Coordonnées** : WhatsApp `+257 61 65 30 00` · `contact@nunulia.com`

> ⚠️ Un PNG n'est pas « cliquable » : le lien devient actif via la légende / bio du
> réseau où tu publies, ou en scannant le QR. Le lien est mis en avant (bouton + QR).

## Charte (source : `tailwind.config.js` + `config/whatsapp.config.ts`)
- Or : `#FDDA4A → #F5C842 → #E8B817 → #C08008` — accent texte clair `#A45F00` (WCAG AA)
- Encre (fond sombre) : `#111318` · fond clair : `#FFFFFF → #EEF0F4`
- Typo : Inter → rendu en Segoe UI (substitut système équivalent)

## Régénérer
SVG → PNG via `@resvg/resvg-js` + `sharp`, 100 % hors-ligne (supersampling ×2).
Script source : `scratchpad/nunulia-mkt/build.js` (hors dépôt).
Aucun code de production n'est impacté.
