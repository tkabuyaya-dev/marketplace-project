# NUNULIA — Kit marketing

Assets promotionnels ciblant **Burundi 🇧🇮 · RD Congo 🇨🇩 · Tanzanie 🇹🇿**.
4 langues (FR / EN / Swahili / Kirundi) · 2 thèmes (sombre / clair) · carte de visite.

## 🌍 Deux versions : locale (Burundi) vs globale (neutre)

- **Locale** (fichiers sans suffixe) : affiche le **WhatsApp +257 61 65 30 00** et
  **Bujumbura · Burundi**. À utiliser au Burundi.
- **Globale** (`-global`) : **sans numéro burundais ni localisation** — ne révèle pas
  l'origine burundaise. Affiche seulement le site, l'email neutre et le QR.
  À partager en **RDC, Tanzanie et futurs pays**.

## 📱 Réseaux sociaux

| Format | Dimensions | Usage | Fichiers |
|---|---|---|---|
| Post | 1080×1080 | Instagram / Facebook feed | `nunulia-post-{lang}-{dark\|light}[-global].png` |
| Story | 1080×1920 | Story / Reels / WhatsApp Status | `nunulia-story-{lang}-{dark\|light}[-global].png` |
| Bannière | 1200×630 | Aperçu de lien (WhatsApp/FB/OG), couverture | `nunulia-banner-{lang}[-global].png` (sombre) |

`{lang}` = `fr` · `en` · `sw` (Swahili) · `rn` (Kirundi).
Suffixe `-global` = version neutre (voir plus haut). Posts & stories : **globale
disponible en sombre ET clair**. Bannières : thème sombre uniquement.

## 🗂️ Planche récap
`nunulia-apercu-planche.png` — contact sheet de tous les visuels (vignettes + noms),
pour tout voir d'un coup d'œil et choisir.

## 💳 Carte de visite (prête à imprimer)

| Fichier | Dimensions | Note |
|---|---|---|
| `nunulia-card-front.png` | 1050×600 | Recto sombre — marque (logo + wordmark) |
| `nunulia-card-back.png` | 1050×600 | Verso sombre — accroche, coordonnées, drapeaux, QR |
| `nunulia-card-front-light.png` | 1050×600 | Recto **fond clair** |
| `nunulia-card-back-light.png` | 1050×600 | Verso **fond clair** |
| `nunulia-card-front-print-bleed3mm.png` | 1122×672 | Recto **prêt imprimeur** (fond perdu 3 mm) |
| `nunulia-card-back-print-bleed3mm.png` | 1122×672 | Verso **prêt imprimeur** (fond perdu 3 mm) |
| `nunulia-card-back-global.png` | 1050×600 | Verso **global/neutre** (sans +257 ni localisation) |
| `nunulia-card-back-global-print-bleed3mm.png` | 1122×672 | Verso global — **prêt imprimeur** |

> Version globale : le **recto** est identique (`nunulia-card-front.png`), seul le
> **verso** change (contact neutre : email + site + QR).

- **Écran / partage** : utiliser les fichiers 1050×600 (89×51 mm à 300 dpi).
- **Imprimeur** : fournir les fichiers `*-print-bleed3mm` (1122×672 = 89×51 mm de coupe
  + 3 mm de fond perdu sur chaque bord). Trait de coupe à 3 mm des bords ; le contenu
  reste dans la zone de sécurité.
- **Carte de marque** (pas de nom de personne) : accroche « Votre marché, dans votre
  poche », coordonnées, drapeaux et QR. Utilisable par toute l'équipe.

## Contenu commun
- Logo officiel (`public/icons/icon-512.png`) + wordmark NUNULIA
- **Slogan officiel** (source `locales/`, `index.html`, `manifest.json`) :
  FR « Marketplace des Grands Lacs » · EN « The Great Lakes marketplace » ·
  SW « Soko la Maziwa Makuu » · RN « Isoko ry'ibiyaga bigari »
- Message localisé (Achetez et vendez / Buy and sell / Nunua na uuza / Gura kandi ugurishe)
- Drapeaux vectoriels Burundi · RD Congo · Tanzanie
- **Bouton lien `nunulia.com`** + QR code → https://nunulia.com
- **Coordonnées** (version locale) : WhatsApp `+257 61 65 30 00` · `contact@nunulia.com`

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
