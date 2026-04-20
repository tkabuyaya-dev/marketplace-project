# Tests E2E — Playwright

Tests end-to-end pour NUNULIA PWA. Simulent un utilisateur réel dans un vrai navigateur.

## Prérequis

```bash
# Depuis la racine du projet
npx playwright install chromium  # Installe les navigateurs (première fois)
```

## Lancer les tests

```bash
# Tous les tests (headless, local dev server démarré automatiquement)
npm run test:e2e

# Mode visuel (voir le navigateur)
npm run test:e2e -- --headed

# Un seul fichier
npm run test:e2e -- tests/e2e/search.spec.ts

# Contre le staging
BASE_URL=https://staging.nunulia.com npm run test:e2e
```

## Scénarios couverts

| Fichier | Flux testé |
|---------|-----------|
| `home.spec.ts` | Home page charge, navbar, SearchOverlay Ctrl+K, Échap |
| `search.spec.ts` | Tape → /search, suggestions 3 chars, filtres pays |
| `product-detail.spec.ts` | Slug inexistant = gracieux, navigation depuis home |
| `auth.spec.ts` | Login page, bouton Google, redirects /dashboard et /admin |
| `buyer-requests.spec.ts` | Page /je-cherche charge, formulaire visible |

## Résultats

Les screenshots et traces sont dans `test-results/e2e/` (ignoré par git).

## Notes

- Les tests **ne testent pas Google OAuth** (impossible en automatisé sans mock)
- Les tests sont conçus pour être robustes : ils s'adaptent à la présence ou absence de données réelles en environnement de test
- En CI, les tests s'exécutent contre le build de staging (`BASE_URL` injecté par GitHub Actions)
