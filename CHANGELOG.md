# CHANGELOG — AuraBuja Marketplace

## [2.0.0] — 2026-03-06

### Ajouts majeurs

#### Systeme Marketplaces Physiques de Bujumbura (COR-0)
- **Type `MarketplaceId`** — 5 marches: Bata, Kamenge, Centre Ville, Kinama, Autres
- **Constantes MARKETPLACES** avec nom, icone, couleurs Tailwind par marche (`constants.ts`)
- **Fonction `getMarketplaceInfo()`** pour recuperer les infos d'un marche
- **Champ `marketplace` dans `SellerDetails`** — obligatoire a l'inscription vendeur
- **Denormalisation dans `Product`** — `marketplace` copie dans chaque produit pour queries directes
- **`addProduct()`** denormalise automatiquement le marketplace du vendeur
- **`getProducts()`** accepte un filtre `marketplace` optionnel
- **Firestore Rules** — validation du champ marketplace (enum valide)
- **Indexes composites** — `marketplace + status + createdAt` et `marketplace + category + status + createdAt`

#### Page d'accueil — Filtres Marketplace
- Section hero avec 6 boutons (5 marches + Tous) en haut de page, avant le carousel
- Boutons colores avec icone par marche, feedback visuel immediat
- **Persistance du filtre** via state global (`AppContext`) — conserve apres navigation
- Query Firestore optimisee avec `where('marketplace', '==', selected)`
- Pagination compatible avec filtre marketplace

#### Inscription Vendeur
- Champ select obligatoire "Votre marche physique" avec les 5 options (etape 2)
- Boutons visuels colores pour chaque marche
- Validation : impossible de passer a l'etape suivante sans selection

#### Page Boutique (ShopProfile)
- **Badge marketplace colore** affiche sous le nom de la boutique
- **Section Avis clients** (placeholder, collection `reviews` a venir)

#### Dashboard Vendeur
- Marketplace affiche dans le bandeau de bienvenue
- **Selecteur marketplace** dans les parametres boutique (modifiable)
- Sauvegarde du marketplace dans `sellerDetails.marketplace`

#### Admin Dashboard
- **Stats par marche** dans la vue d'ensemble (vendeurs + produits par marketplace)
- **Badge marketplace** visible sur chaque fiche vendeur

### Corrections

#### COR-1: Safe Area Messagerie iOS
- Verifie: `.pb-safe` et `viewport-fit=cover` deja correctement configures

#### COR-3: Auth Reconnexion Robuste
- **Retry avec backoff exponentiel** (1s, 2s, 4s) pour `getIdToken()` apres coupure reseau
- **Toast "Connexion retablie"** au retour du reseau
- **Bandeau offline** dans le Navbar (visible sur toutes les pages)
- Suppression du bandeau offline duplique dans `App.tsx`

#### COR-5: Badge Verifie ProductCard
- Icone check bleu SVG a cote du nom vendeur dans la grille de produits

#### COR-6: Categories — Source Unique Temps Reel
- `useCategories()` utilise desormais `onSnapshot` (temps reel) au lieu de `getCategories()` ponctuel
- Suppression du cache `sessionStorage` (IndexedDB Firestore suffit)
- `Home.tsx` utilise le hook au lieu d'appeler `getCategories()` directement

#### COR-4: Page Offline Fallback
- Cree `public/offline.html` en francais, design coherent avec l'app

### Fichiers modifies
- `types.ts` — Ajout `MarketplaceId`, champ `marketplace` dans `SellerDetails` et `Product`
- `constants.ts` — Ajout `MARKETPLACES`, `MarketplaceInfo`, `getMarketplaceInfo()`
- `services/firebase.ts` — `getProducts()` filtre marketplace, `addProduct()` denormalise, import `MarketplaceId`
- `firestore.rules` — Validation marketplace dans products
- `firestore.indexes.json` — 2 nouveaux index composites marketplace
- `pages/Home.tsx` — Filtres marketplace hero, `useCategories()`, import nettoyage
- `pages/SellerRegistration.tsx` — Champ marketplace obligatoire etape 2
- `pages/ShopProfile.tsx` — Badge marketplace, section avis clients
- `pages/SellerDashboard.tsx` — Marketplace dans overview + parametres boutique
- `pages/AdminDashboard.tsx` — Stats marketplace, badge vendeurs
- `contexts/AppContext.tsx` — `activeMarketplace` state global, toast reconnexion
- `hooks/useNetworkStatus.ts` — Retry backoff exponentiel
- `hooks/useCategories.ts` — Migration vers `onSnapshot` temps reel
- `components/ProductCard.tsx` — Badge verifie vendeur
- `components/Navbar.tsx` — Bandeau offline, prop `isOnline`
- `App.tsx` — Passage `isOnline` au Navbar, suppression bandeau duplique
- `public/offline.html` — Nouvelle page offline
