# Firestore Security Rules Tests

Tests automatisés pour les règles Firestore de NUNULIA.
Utilise `@firebase/rules-unit-testing` + Firebase Emulator.

## Prérequis

1. Firebase CLI installé : `npm install -g firebase-tools`
2. Java installé (requis par l'émulateur Firestore)

## Installation

```bash
cd tests/rules
npm install
```

## Lancer les tests

### 1. Démarrer l'émulateur Firestore (terminal 1)

```bash
firebase emulators:start --only firestore
```

L'émulateur écoute sur `127.0.0.1:8080` par défaut.

### 2. Lancer les tests (terminal 2)

```bash
cd tests/rules
npm test
```

### Script combiné (depuis la racine du projet)

```bash
npm run test:rules
```

## Structure des tests

| Fichier | Collections testées |
|---------|-------------------|
| `users.test.ts` | `/users` — création profil, mise à jour, suppression |
| `products.test.ts` | `/products` — lecture, création, update limité, suppression |
| `subscriptions-boost.test.ts` | `/subscriptionRequests`, `/boostRequests`, `/boostPricing` |
| `notifications-buyer-requests.test.ts` | `/notifications`, `/buyerRequests`, deny-all |

## Ce que les tests vérifient

- **Isolation** : un utilisateur ne peut pas lire/modifier les données d'un autre
- **Champs protégés** : `role`, `maxProducts`, `subscriptionExpiresAt`, `status` ne sont pas modifiables par les clients
- **Status initial** : produit créé toujours `pending`, demande créée toujours `pending`
- **Anti-fraude** : `views`, `likesCount` ne peuvent être incrémentés que de 1
- **Format WhatsApp** : validé regex côté Firestore rules
- **Timestamps bornés** : `createdAt` dans ±60s du temps serveur
- **Deny-all** : toute collection non listée est bloquée
