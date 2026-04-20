/**
 * Firestore Rules — /products collection
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import {
  setupTestEnv, teardownTestEnv, clearFirestore,
  authed, anon, seedDoc,
  expectPermissionDenied, expectPermissionGranted,
} from './helpers';

const SELLER_ID = 'seller-001';
const BUYER_ID = 'buyer-001';
const ADMIN_ID = 'admin-001';
const OTHER_SELLER_ID = 'seller-002';
const PRODUCT_ID = 'prod-001';

const now = Date.now();

// Valid product for creation
const VALID_PRODUCT_DATA = {
  title: 'iPhone 13 Pro',
  titleLower: 'iphone 13 pro',
  description: 'Excellent état, vendu avec boîte',
  price: 450000,
  sellerId: SELLER_ID,
  category: 'electronique',
  status: 'pending',
  views: 0,
  likesCount: 0,
  reports: 0,
  createdAt: serverTimestamp(),
};

const APPROVED_PRODUCT = {
  title: 'iPhone 13 Pro',
  titleLower: 'iphone 13 pro',
  description: 'Excellent état',
  price: 450000,
  sellerId: SELLER_ID,
  category: 'electronique',
  status: 'approved',
  views: 5,
  likesCount: 2,
  reports: 0,
};

beforeAll(async () => { await setupTestEnv(); });
afterAll(async () => { await teardownTestEnv(); });
beforeEach(async () => {
  await clearFirestore();
  // Seed user docs needed for rules evaluation
  await seedDoc('users', SELLER_ID, {
    role: 'seller',
    isSuspended: false,
    productCount: 2,
    sellerDetails: {
      maxProducts: 50,
      subscriptionExpiresAt: now + 86400000 * 30,
      tierLabel: 'Standard',
    },
  });
  await seedDoc('users', BUYER_ID, { role: 'buyer', isSuspended: false });
  await seedDoc('users', ADMIN_ID, { role: 'admin', isSuspended: false });
  await seedDoc('users', OTHER_SELLER_ID, {
    role: 'seller',
    isSuspended: false,
    productCount: 0,
    sellerDetails: { maxProducts: 50, subscriptionExpiresAt: now + 86400000 * 30 },
  });
});

describe('/products — lecture', () => {
  it('tout le monde (non-auth) peut lire un produit approuvé', async () => {
    await seedDoc('products', PRODUCT_ID, APPROVED_PRODUCT);
    const db = anon().firestore();
    await expectPermissionGranted(getDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('non-auth ne peut PAS lire un produit pending', async () => {
    await seedDoc('products', PRODUCT_ID, { ...APPROVED_PRODUCT, status: 'pending' });
    const db = anon().firestore();
    await expectPermissionDenied(getDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('vendeur peut lire son propre produit pending', async () => {
    await seedDoc('products', PRODUCT_ID, { ...APPROVED_PRODUCT, status: 'pending', sellerId: SELLER_ID });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('un autre vendeur ne peut PAS lire un produit pending d\'autrui', async () => {
    await seedDoc('products', PRODUCT_ID, { ...APPROVED_PRODUCT, status: 'pending', sellerId: SELLER_ID });
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(getDoc(doc(db, 'products', PRODUCT_ID)));
  });
});

describe('/products — création', () => {
  it('vendeur peut créer un produit (status=pending, views/likes/reports=0)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });

  it('vendeur ne peut PAS créer un produit avec status=approved', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), { ...VALID_PRODUCT_DATA, status: 'approved' })
    );
  });

  it('vendeur ne peut PAS créer un produit avec views > 0', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), { ...VALID_PRODUCT_DATA, views: 100 })
    );
  });

  it('vendeur ne peut PAS créer un produit pour un autre sellerId', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), { ...VALID_PRODUCT_DATA, sellerId: OTHER_SELLER_ID })
    );
  });

  it('buyer ne peut PAS créer un produit', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });

  it('non-auth ne peut PAS créer un produit', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });

  it('utilisateur auth avec JWT role=buyer (stale token) ne peut PAS créer un produit', async () => {
    // Firestore doc says seller, but JWT claim says buyer → isSeller() fails
    const db = authed(SELLER_ID, { role: 'buyer' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });

  it('utilisateur auth sans claims JWT ne peut PAS créer un produit', async () => {
    // No role in token → isSeller() returns false
    const db = authed(SELLER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });

  it('vendeur suspendu ne peut PAS créer un produit', async () => {
    await seedDoc('users', SELLER_ID, {
      role: 'seller',
      isSuspended: true,
      productCount: 0,
      sellerDetails: { maxProducts: 50, subscriptionExpiresAt: now + 86400000 },
    });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'products', PRODUCT_ID), VALID_PRODUCT_DATA)
    );
  });
});

describe('/products — mise à jour (champs limités)', () => {
  beforeEach(async () => {
    await seedDoc('products', PRODUCT_ID, APPROVED_PRODUCT);
  });

  it('vendeur peut mettre à jour titre/description (champs autorisés)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'products', PRODUCT_ID), { title: 'iPhone 13 Pro Max' })
    );
  });

  it('vendeur ne peut PAS changer le status d\'un produit', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), { status: 'rejected' })
    );
  });

  it('vendeur ne peut PAS changer le sellerId', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), { sellerId: OTHER_SELLER_ID })
    );
  });

  it('vendeur ne peut PAS modifier le produit d\'un autre', async () => {
    const db = authed(OTHER_SELLER_ID).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), { title: 'Hacked' })
    );
  });

  it('tout utilisateur auth peut incrémenter views de 1', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'products', PRODUCT_ID), { views: 6 })
    );
  });

  it('tout utilisateur auth peut incrémenter likesCount de 1', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'products', PRODUCT_ID), { likesCount: 3 })
    );
  });

  it('on ne peut PAS incrémenter views de plus de 1', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), { views: 100 })
    );
  });
});

describe('/products — édition et re-soumission atomique (rejected → pending)', () => {
  const REJECTED_PRODUCT = {
    ...APPROVED_PRODUCT,
    status: 'rejected',
    rejectionReason: 'Photos de mauvaise qualité',
  };

  it('vendeur peut éditer contenu + resoumettre en 1 write atomique', async () => {
    await seedDoc('products', PRODUCT_ID, REJECTED_PRODUCT);
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'products', PRODUCT_ID), {
        title: 'Plantes 22 pouces',
        titleLower: 'plantes 22 pouces',
        description: 'Nouveau texte',
        price: 25000,
        images: ['https://example.com/new.jpg'],
        status: 'pending',
        resubmittedAt: now,
        resubmitCount: 1,
      })
    );
  });

  it('vendeur ne peut PAS éditer/resoumettre après 3 tentatives', async () => {
    await seedDoc('products', PRODUCT_ID, { ...REJECTED_PRODUCT, resubmitCount: 3 });
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), {
        title: 'New title',
        status: 'pending',
        resubmittedAt: now,
        resubmitCount: 4,
      })
    );
  });

  it('vendeur ne peut PAS changer sellerId via edit-and-resubmit', async () => {
    await seedDoc('products', PRODUCT_ID, REJECTED_PRODUCT);
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), {
        title: 'New title',
        status: 'pending',
        resubmittedAt: now,
        resubmitCount: 1,
        sellerId: OTHER_SELLER_ID,
      })
    );
  });

  it('vendeur ne peut PAS éditer/resoumettre le produit rejeté d\'un autre', async () => {
    await seedDoc('products', PRODUCT_ID, REJECTED_PRODUCT);
    const db = authed(OTHER_SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'products', PRODUCT_ID), {
        title: 'Hacked',
        status: 'pending',
        resubmittedAt: now,
        resubmitCount: 1,
      })
    );
  });
});

describe('/products — suppression', () => {
  beforeEach(async () => {
    await seedDoc('products', PRODUCT_ID, APPROVED_PRODUCT);
  });

  it('vendeur peut supprimer son propre produit', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(deleteDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('un autre utilisateur ne peut PAS supprimer le produit', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(deleteDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('admin peut supprimer n\'importe quel produit', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(deleteDoc(doc(db, 'products', PRODUCT_ID)));
  });

  it('admin sans doc Firestore peut supprimer (JWT seul suffit)', async () => {
    // isAdmin() reads JWT, not Firestore → no user doc needed
    const NO_DOC_ADMIN = 'admin-no-doc';
    const db = authed(NO_DOC_ADMIN, { role: 'admin' }).firestore();
    await expectPermissionGranted(deleteDoc(doc(db, 'products', PRODUCT_ID)));
  });
});
