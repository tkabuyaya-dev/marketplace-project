/**
 * Firestore Rules — /users collection
 *
 * Run: firebase emulators:start --only firestore (port 8080) then vitest run
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  setupTestEnv, teardownTestEnv, clearFirestore,
  authed, anon, seedDoc,
  expectPermissionDenied, expectPermissionGranted,
} from './helpers';

const BUYER_ID = 'buyer-001';
const SELLER_ID = 'seller-001';
const ADMIN_ID = 'admin-001';
const OTHER_ID = 'other-001';

const BASE_BUYER = {
  name: 'Jean Dupont',
  email: 'jean@example.com',
  role: 'buyer',
  joinDate: Date.now(),
};

const BASE_SELLER_DETAILS = {
  maxProducts: 50,
  subscriptionExpiresAt: Date.now() + 86400000 * 30,
  tierLabel: 'Standard',
};

beforeAll(async () => { await setupTestEnv(); });
afterAll(async () => { await teardownTestEnv(); });
beforeEach(async () => { await clearFirestore(); });

describe('/users — lecture', () => {
  it('tout le monde peut lire un profil (marketplace public)', async () => {
    await seedDoc('users', BUYER_ID, BASE_BUYER);
    const db = anon().firestore();
    await expectPermissionGranted(getDoc(doc(db, 'users', BUYER_ID)));
  });

  it('utilisateur non-auth peut lire un profil vendeur', async () => {
    await seedDoc('users', SELLER_ID, { ...BASE_BUYER, role: 'seller' });
    const db = anon().firestore();
    await expectPermissionGranted(getDoc(doc(db, 'users', SELLER_ID)));
  });
});

describe('/users — création', () => {
  it('un utilisateur peut créer son propre profil avec role=buyer', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'users', BUYER_ID), BASE_BUYER)
    );
  });

  it('un utilisateur ne peut PAS créer un profil pour quelqu\'un d\'autre', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'users', OTHER_ID), { ...BASE_BUYER })
    );
  });

  it('un utilisateur ne peut PAS créer un compte avec role=seller ou admin', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'users', BUYER_ID), { ...BASE_BUYER, role: 'seller' })
    );
    await expectPermissionDenied(
      setDoc(doc(db, 'users', BUYER_ID), { ...BASE_BUYER, role: 'admin' })
    );
  });

  it('un utilisateur non-auth ne peut PAS créer un profil', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'users', BUYER_ID), BASE_BUYER)
    );
  });
});

describe('/users — mise à jour', () => {
  beforeEach(async () => {
    await seedDoc('users', BUYER_ID, { ...BASE_BUYER, isSuspended: false });
    await seedDoc('users', SELLER_ID, {
      ...BASE_BUYER,
      role: 'seller',
      isSuspended: false,
      sellerDetails: BASE_SELLER_DETAILS,
    });
    // Admin user doc needed for isAdmin() check
    await seedDoc('users', ADMIN_ID, { ...BASE_BUYER, role: 'admin', isSuspended: false });
  });

  it('un utilisateur peut mettre à jour son propre profil (champs autorisés)', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'users', BUYER_ID), { name: 'Jean Martin' })
    );
  });

  it('un utilisateur ne peut PAS modifier son propre rôle', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'users', BUYER_ID), { role: 'admin' })
    );
  });

  it('un vendeur ne peut PAS modifier les champs d\'abonnement (maxProducts)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'users', SELLER_ID), {
        sellerDetails: { ...BASE_SELLER_DETAILS, maxProducts: 999 },
      })
    );
  });

  it('un vendeur ne peut PAS modifier le subscriptionExpiresAt', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'users', SELLER_ID), {
        sellerDetails: {
          ...BASE_SELLER_DETAILS,
          subscriptionExpiresAt: Date.now() + 86400000 * 365,
        },
      })
    );
  });

  it('un utilisateur ne peut PAS modifier le profil d\'un autre', async () => {
    const db = authed(OTHER_ID).firestore();
    await seedDoc('users', OTHER_ID, { ...BASE_BUYER, isSuspended: false });
    await expectPermissionDenied(
      updateDoc(doc(db, 'users', BUYER_ID), { name: 'Hacker' })
    );
  });

  it('admin peut modifier n\'importe quel profil', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'users', BUYER_ID), { isSuspended: true })
    );
  });
});

describe('/users — suppression', () => {
  beforeEach(async () => {
    await seedDoc('users', BUYER_ID, BASE_BUYER);
    await seedDoc('users', ADMIN_ID, { ...BASE_BUYER, role: 'admin', isSuspended: false });
  });

  it('un utilisateur lambda ne peut PAS supprimer un profil', async () => {
    const db = authed(BUYER_ID).firestore();
    await expectPermissionDenied(deleteDoc(doc(db, 'users', BUYER_ID)));
  });

  it('admin peut supprimer un profil', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(deleteDoc(doc(db, 'users', BUYER_ID)));
  });

  it('uid admin dans Firestore SANS JWT claim admin → ne peut PAS supprimer (JWT requis)', async () => {
    const db = authed(ADMIN_ID).firestore();
    await expectPermissionDenied(deleteDoc(doc(db, 'users', BUYER_ID)));
  });
});
