# AuraBuja — Premium Upgrade Guide

## What Changed

### 1. Algolia Search Integration
- **Products & Sellers** are automatically synced to Algolia via Cloud Functions triggers
- Frontend search uses Algolia REST API (no SDK — zero bundle impact)
- Falls back to Firestore prefix search if Algolia is unavailable
- Typo-tolerant, multi-language (FR/EN), faceted filtering

### 2. Redis Caching (Cloud Functions)
- Trending products: cached 5 min
- Popular products: cached 10 min
- Personalized recommendations: cached 15 min
- "Also viewed" collaborative filtering: cached 15 min
- Cache invalidation on product write/delete

### 3. Cloud Functions
- `onProductWrite` — Auto-syncs products to Algolia on create/update/delete
- `onSellerWrite` — Auto-syncs seller profiles to Algolia
- `setupAlgoliaIndexes` — One-time setup: configures Algolia index settings + full reindex
- `getTrending` — Cached trending products API
- `getPopular` — Cached popular products API
- `getRecommendations` — Cached personalized recommendations
- `getAlsoViewed` — Cached collaborative filtering

### 4. Resilient Architecture
- Every Cloud Function / Algolia call has a Firestore fallback
- Works fully offline via existing PWA + IndexedDB cache
- 4-second timeout on Cloud Functions API calls

---

## Setup Instructions

### Prerequisites
- Node.js 20+ (Cloud Functions require Node 20)
- Firebase CLI: `npm install -g firebase-tools`
- Firebase login: `firebase login`

### Step 1: Install Dependencies

```bash
# Frontend
cd c:/Projets/aurabuja
npm install --legacy-peer-deps

# Cloud Functions
cd functions
npm install
```

### Step 2: Configure Secrets

#### Option A: Firebase Secrets (Production — recommended)
```bash
# Set each secret interactively:
firebase functions:secrets:set ALGOLIA_APP_ID
# Enter: NZ5TI2OD7P

firebase functions:secrets:set ALGOLIA_ADMIN_KEY
# Enter: 6e5c2f87fc389afd5f37341a78bac993

firebase functions:secrets:set ALGOLIA_SEARCH_KEY
# Enter: cdddaa4523b7179519e71bf9ea94764a

firebase functions:secrets:set REDIS_URL
# Enter: redis://username:password@host:port
```

#### Option B: Local .env (Development only)
Edit `functions/.env`:
```env
ALGOLIA_APP_ID=NZ5TI2OD7P
ALGOLIA_ADMIN_KEY=6e5c2f87fc389afd5f37341a78bac993
ALGOLIA_SEARCH_KEY=cdddaa4523b7179519e71bf9ea94764a
REDIS_URL=redis://username:password@host:port
```

### Step 3: Set Frontend Env Vars

In `.env.local`, these should already be set:
```env
VITE_ALGOLIA_APP_ID=NZ5TI2OD7P
VITE_ALGOLIA_SEARCH_KEY=cdddaa4523b7179519e71bf9ea94764a
VITE_FUNCTIONS_BASE_URL=https://europe-west1-aurburundi-e2fe2.cloudfunctions.net
```

> **Note**: `VITE_FUNCTIONS_BASE_URL` should be set after deploying Cloud Functions.
> Leave it empty to use Firestore-only mode (no caching).

### Step 4: Deploy Cloud Functions

```bash
# From project root:
firebase deploy --only functions

# Or use the deploy script:
# PowerShell:
.\deploy-functions.ps1
# Bash:
bash deploy-functions.sh
```

### Step 5: Initial Algolia Setup (One-Time)

After deploying, trigger the setup function to configure indexes and do a full reindex:

```bash
# Via curl:
curl https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/setupAlgoliaIndexes

# Or open this URL in your browser
```

This will:
1. Configure Algolia index settings (searchable attributes, facets, ranking)
2. Reindex all approved products from Firestore
3. Reindex all sellers from Firestore

### Step 6: Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Step 7: Deploy Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## Redis Setup

You need a Redis instance accessible from Cloud Functions. Options:

1. **Redis Cloud** (free tier available): https://redis.com/try-free/
2. **Upstash** (serverless Redis, pay-per-request): https://upstash.com/
3. **Google Cloud Memorystore** (if already on GCP)

Get the connection URL in format: `redis://username:password@host:port`

---

## Architecture Overview

```
User Browser (PWA)
    |
    |-- Algolia REST API (search-only key)
    |       \-> Products Index
    |       \-> Sellers Index
    |
    |-- Cloud Functions API (Redis-cached)
    |       |-> getTrending (5 min cache)
    |       |-> getPopular (10 min cache)
    |       |-> getRecommendations (15 min cache)
    |       \-> getAlsoViewed (15 min cache)
    |
    |-- Firestore (direct, offline-first)
    |       \-> All CRUD, auth, messaging, likes...
    |
    \-- Cloudinary CDN (images)

Cloud Functions (Background Triggers)
    |-> onProductWrite -> Algolia sync + Redis invalidation
    \-> onSellerWrite -> Algolia sync
```

## Fallback Strategy

| Feature | Primary | Fallback |
|---------|---------|----------|
| Search | Algolia REST API | Firestore prefix query |
| Trending | Cloud Functions (Redis) | Direct Firestore query |
| Popular | Cloud Functions (Redis) | Direct Firestore query |
| Recommendations | Cloud Functions (Redis) | Direct Firestore query |
| Also Viewed | Cloud Functions (Redis) | Direct Firestore query |
| All CRUD | Firestore (IndexedDB cache) | Offline queue |

Every feature works without Algolia and Redis — they just run slower.

---

## Costs

- **Algolia Free Tier**: 10K searches/month, 10K records
- **Redis Cloud Free**: 30MB, 30 connections
- **Cloud Functions**: 2M invocations/month free, 400K GB-seconds free
- **Firestore**: 50K reads/day, 20K writes/day free

For a marketplace with <10K users, you should stay within free tiers.

---

## Running Locally

```bash
# Start frontend dev server:
npm run dev

# Start Firebase emulators (optional, for testing Cloud Functions):
cd functions
npm run serve
```

## Troubleshooting

- **"Algolia search failed"**: Check VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_KEY in .env.local
- **Cloud Functions 500 errors**: Check `firebase functions:log` for details
- **Redis connection errors**: Verify REDIS_URL format and network access from Cloud Functions
- **Build errors in functions/**: Run `cd functions && npm run build` to see TypeScript errors
