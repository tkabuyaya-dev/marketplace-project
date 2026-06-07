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

  it('vendeur peut joindre une preuve de paiement Cloudinary lors de la confirmation', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'subscriptionRequests', 'sub-001'), {
        status: 'pending_validation',
        transactionRef: 'TXN-12345',
        proofUrl: 'https://res.cloudinary.com/demo/image/upload/v1/payment-proof.jpg',
        updatedAt: now + 1000,
      })
    );
  });

  it('vendeur ne peut PAS écrire un champ non-autorisé en plus (ex: amount)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'subscriptionRequests', 'sub-001'), {
        status: 'pending_validation',
        transactionRef: 'TXN-12345',
        amount: 1, // forbidden — not in affectedKeys allowlist
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

// ─── Grossiste : NIF non bloquant (gate retiré — minimisation des données) ───
// Le plan Grossiste affiche « NIF requis » côté UI, mais la création n'est plus
// gatée par le NIF. L'admin valide la demande et collecte le NIF via WhatsApp.

describe('/subscriptionRequests — Grossiste sans gate NIF', () => {
  const GROSSISTE_REQUEST = {
    ...BASE_SUB_REQUEST,
    planId: 'grossiste',
    planLabel: 'Grossiste',
    amount: 75000,
    maxProducts: 99999,
  };

  it('vendeur SANS NIF PEUT créer une demande Grossiste (gate retiré)', async () => {
    // Le seed par défaut a sellerDetails: { maxProducts: 50 } SANS hasNif/nif
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-grossiste-1'), GROSSISTE_REQUEST)
    );
  });

  it('vendeur AVEC hasNif peut aussi créer une demande Grossiste', async () => {
    await seedDoc('users', SELLER_ID, {
      role: 'seller', isSuspended: false, productCount: 2,
      sellerDetails: { maxProducts: 50, hasNif: true },
    });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-grossiste-2'), GROSSISTE_REQUEST)
    );
  });

  it('les autres plans (Pro / Vendeur / Découverte) restent créables sans NIF', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-pro-1'), {
        ...BASE_SUB_REQUEST, planId: 'pro', planLabel: 'Pro', amount: 29000, maxProducts: 100,
      })
    );
  });
});

// ─── Lot 4 : rate-limit createSubscriptionRequest (P4) ───────────────────────

describe('/subscriptionRequests — rate-limit (Lot 4 P4)', () => {
  it('vendeur peut créer une demande la première fois (lastSubRequestCreatedAt absent)', async () => {
    // SELLER_ID seed default = pas de lastSubRequestCreatedAt (= 0)
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-rl-1'), BASE_SUB_REQUEST)
    );
  });

  it('vendeur ne peut PAS créer 2 demandes en <60s (rate-limit)', async () => {
    // Simule un lastSubRequestCreatedAt très récent (= maintenant)
    await seedDoc('users', SELLER_ID, {
      role: 'seller', isSuspended: false, productCount: 2,
      sellerDetails: { maxProducts: 50, lastSubRequestCreatedAt: Date.now() },
    });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-rl-2'), BASE_SUB_REQUEST)
    );
  });

  it('vendeur peut créer après 60s écoulées', async () => {
    // Simule un lastSubRequestCreatedAt >60s dans le passé
    await seedDoc('users', SELLER_ID, {
      role: 'seller', isSuspended: false, productCount: 2,
      sellerDetails: { maxProducts: 50, lastSubRequestCreatedAt: Date.now() - 90 * 1000 },
    });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'subscriptionRequests', 'sub-rl-3'), BASE_SUB_REQUEST)
    );
  });
});

// ─── Lot 3 : sous-collection history (read seller+admin, write false) ────────

describe('/subscriptionRequests/{id}/history (Lot 3)', () => {
  beforeEach(async () => {
    await seedDoc('subscriptionRequests', 'sub-001', BASE_SUB_REQUEST);
    await seedDoc(
      'subscriptionRequests/sub-001/history',
      'evt-001',
      { action: 'created', by: { userId: SELLER_ID, role: 'seller' }, timestamp: now }
    );
  });

  it('vendeur peut lire l\'historique de SA demande', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      getDoc(doc(db, 'subscriptionRequests', 'sub-001', 'history', 'evt-001'))
    );
  });

  it('autre vendeur ne peut PAS lire l\'historique d\'autrui', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(
      getDoc(doc(db, 'subscriptionRequests', 'sub-001', 'history', 'evt-001'))
    );
  });

  it('admin peut lire tous les historiques', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(
      getDoc(doc(db, 'subscriptionRequests', 'sub-001', 'history', 'evt-001'))
    );
  });

  it('aucun client (même admin) ne peut écrire dans history (admin SDK only)', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001', 'history', 'evt-fake'), {
        action: 'modified', by: { userId: ADMIN_ID, role: 'admin' }, timestamp: now,
      })
    );
  });

  it('seller ne peut PAS écrire dans history', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'subscriptionRequests', 'sub-001', 'history', 'evt-fake-seller'), {
        action: 'cancelled', by: { userId: SELLER_ID, role: 'seller' }, timestamp: now,
      })
    );
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
