/**
 * Firestore Rules — /subscriptionRequests + /boostRequests
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  setupTestEnv, teardownTestEnv, clearFirestore,
  authed, anon, seedDoc,
  expectPermissionDenied, expectPermissionGranted,
} from './helpers';

const SELLER_ID = 'seller-001';
const OTHER_SELLER_ID = 'seller-002';
const ADMIN_ID = 'admin-001';
const now = Date.now();

const BASE_SUB_REQUEST = {
  userId: SELLER_ID,
  sellerName: 'Boutique Alpha',
  countryId: 'bi',
  planId: 'standard',
  planLabel: 'Standard',
  amount: 10000,
  currency: 'BIF',
  status: 'pending',
  maxProducts: 50,
  transactionRef: null,
  createdAt: now,
  updatedAt: now,
};

const BASE_BOOST_REQUEST = {
  userId: SELLER_ID,
  sellerName: 'Boutique Alpha',
  countryId: 'bi',
  productId: 'prod-001',
  productTitle: 'iPhone 13 Pro',
  amount: 5000,
  currency: 'BIF',
  status: 'pending',
  transactionRef: null,
  createdAt: now,
  updatedAt: now,
};

beforeAll(async () => { await setupTestEnv(); });
afterAll(async () => { await teardownTestEnv(); });
beforeEach(async () => {
  await clearFirestore();
  await seedDoc('users', SELLER_ID, { role: 'seller', isSuspended: false, productCount: 2, sellerDetails: { maxProducts: 50 } });
  await seedDoc('users', OTHER_SELLER_ID, { role: 'seller', isSuspended: false, productCount: 0, sellerDetails: { maxProducts: 50 } });
  await seedDoc('users', ADMIN_ID, { role: 'admin', isSuspended: false });
});

// ─── Subscription Requests ───────────────────────────────────────────────────

describe('/subscriptionRequests — création', () => {
  it('vendeur peut créer sa propre demande d\'abonnement (status=pending)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001'), BASE_SUB_REQUEST)
    );
  });

  it('vendeur ne peut PAS créer une demande pour quelqu\'un d\'autre', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001'), BASE_SUB_REQUEST)
    );
  });

  it('vendeur ne peut PAS créer avec status=approved', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001'), { ...BASE_SUB_REQUEST, status: 'approved' })
    );
  });

  it('non-auth ne peut PAS créer une demande', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001'), BASE_SUB_REQUEST)
    );
  });
});

describe('/subscriptionRequests — confirmation paiement', () => {
  beforeEach(async () => {
    await seedDoc('subscriptionRequests', 'sub-001', BASE_SUB_REQUEST);
  });

  it('vendeur peut confirmer son paiement (pending → pending_validation + transactionRef)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'subscriptionRequests', 'sub-001'), {
        status: 'pending_validation',
        transactionRef: 'TXN-12345',
        updatedAt: now + 1000,
      })
    );
  });

  it('vendeur ne peut PAS passer directement à approved', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'subscriptionRequests', 'sub-001'), { status: 'approved' })
    );
  });

  it('autre vendeur ne peut PAS modifier la demande', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'subscriptionRequests', 'sub-001'), {
        status: 'pending_validation',
        transactionRef: 'TXN-HACK',
        updatedAt: now + 1000,
      })
    );
  });
});

describe('/subscriptionRequests — lecture', () => {
  beforeEach(async () => {
    await seedDoc('subscriptionRequests', 'sub-001', BASE_SUB_REQUEST);
  });

  it('vendeur peut lire ses propres demandes', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'subscriptionRequests', 'sub-001')));
  });

  it('autre vendeur ne peut PAS lire les demandes d\'autrui', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(getDoc(doc(db, 'subscriptionRequests', 'sub-001')));
  });

  it('admin peut lire toutes les demandes', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'subscriptionRequests', 'sub-001')));
  });

  it('non-auth ne peut PAS lire les demandes', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(getDoc(doc(db, 'subscriptionRequests', 'sub-001')));
  });
});

// ─── Boost Requests ──────────────────────────────────────────────────────────

describe('/boostRequests — création', () => {
  it('vendeur peut créer sa propre demande de boost (status=pending)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'boostRequests', 'boost-001'), BASE_BOOST_REQUEST)
    );
  });

  it('vendeur ne peut PAS créer un boost pour un autre userId', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'boostRequests', 'boost-001'), BASE_BOOST_REQUEST)
    );
  });

  it('vendeur ne peut PAS créer avec status=approved', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'boostRequests', 'boost-001'), { ...BASE_BOOST_REQUEST, status: 'approved' })
    );
  });

  it('vendeur suspendu ne peut PAS créer un boost (JWT suspended=true)', async () => {
    const db = authed(SELLER_ID, { role: 'seller', suspended: true }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'boostRequests', 'boost-001'), BASE_BOOST_REQUEST)
    );
  });

  it('non-auth ne peut PAS créer un boost', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'boostRequests', 'boost-001'), BASE_BOOST_REQUEST)
    );
  });
});

describe('/boostRequests — confirmation paiement', () => {
  beforeEach(async () => {
    await seedDoc('boostRequests', 'boost-001', BASE_BOOST_REQUEST);
  });

  it('vendeur peut confirmer son paiement (pending → pending_validation)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'boostRequests', 'boost-001'), {
        status: 'pending_validation',
        transactionRef: 'TXN-BOOST-001',
        updatedAt: now + 1000,
      })
    );
  });

  it('vendeur ne peut PAS s\'approuver lui-même', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'boostRequests', 'boost-001'), { status: 'approved' })
    );
  });
});

describe('/boostRequests — lecture', () => {
  beforeEach(async () => {
    await seedDoc('boostRequests', 'boost-001', BASE_BOOST_REQUEST);
  });

  it('vendeur peut lire ses propres boosts', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'boostRequests', 'boost-001')));
  });

  it('autre vendeur ne peut PAS lire les boosts d\'autrui', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(getDoc(doc(db, 'boostRequests', 'boost-001')));
  });

  it('admin peut lire tous les boosts', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'boostRequests', 'boost-001')));
  });
});

// ─── Boost Pricing ────────────────────────────────────────────────────────────

describe('/boostPricing — accès public', () => {
  beforeEach(async () => {
    await seedDoc('boostPricing', 'bi', { amount: 5000, currency: 'BIF' });
  });

  it('non-auth peut lire le pricing (public)', async () => {
    const db = anon().firestore();
    await expectPermissionGranted(getDoc(doc(db, 'boostPricing', 'bi')));
  });

  it('non-auth ne peut PAS modifier le pricing', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'boostPricing', 'bi'), { amount: 1, currency: 'BIF' })
    );
  });

  it('admin peut modifier le pricing', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'boostPricing', 'bi'), { amount: 6000, currency: 'BIF' })
    );
  });
});
