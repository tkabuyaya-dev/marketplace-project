/**
 * Firestore Rules — /notifications + /buyerRequests + /buyerRequestContacts
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  setupTestEnv, teardownTestEnv, clearFirestore,
  authed, anon, seedDoc,
  expectPermissionDenied, expectPermissionGranted,
} from './helpers';

const USER_A = 'user-a';
const USER_B = 'user-b';
const SELLER_ID = 'seller-001';
const ADMIN_ID = 'admin-001';
const now = Date.now();

beforeAll(async () => { await setupTestEnv(); });
afterAll(async () => { await teardownTestEnv(); });
beforeEach(async () => {
  await clearFirestore();
  await seedDoc('users', USER_A, { role: 'buyer', isSuspended: false });
  await seedDoc('users', USER_B, { role: 'buyer', isSuspended: false });
  await seedDoc('users', SELLER_ID, { role: 'seller', isSuspended: false, productCount: 1, sellerDetails: { maxProducts: 50, subscriptionExpiresAt: now + 86400000 * 30 } });
  await seedDoc('users', ADMIN_ID, { role: 'admin', isSuspended: false });
});

// ─── Notifications ────────────────────────────────────────────────────────────

describe('/notifications — lecture', () => {
  beforeEach(async () => {
    await seedDoc('notifications', 'notif-001', {
      userId: USER_A,
      type: 'subscription_approved',
      title: 'Abonnement activé',
      read: false,
      createdAt: now,
    });
  });

  it('utilisateur peut lire ses propres notifications', async () => {
    const db = authed(USER_A).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'notifications', 'notif-001')));
  });

  it('autre utilisateur ne peut PAS lire les notifications d\'autrui', async () => {
    const db = authed(USER_B).firestore();
    await expectPermissionDenied(getDoc(doc(db, 'notifications', 'notif-001')));
  });

  it('non-auth ne peut PAS lire les notifications', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(getDoc(doc(db, 'notifications', 'notif-001')));
  });
});

describe('/notifications — mise à jour (mark as read)', () => {
  beforeEach(async () => {
    await seedDoc('notifications', 'notif-001', {
      userId: USER_A,
      type: 'subscription_approved',
      title: 'Abonnement activé',
      read: false,
      createdAt: now,
    });
  });

  it('utilisateur peut marquer sa propre notification comme lue', async () => {
    const db = authed(USER_A).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'notifications', 'notif-001'), { read: true })
    );
  });

  it('utilisateur ne peut PAS modifier d\'autres champs que read', async () => {
    const db = authed(USER_A).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'notifications', 'notif-001'), { title: 'Hack', read: true })
    );
  });

  it('autre utilisateur ne peut PAS marquer comme lue la notif d\'autrui', async () => {
    const db = authed(USER_B).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'notifications', 'notif-001'), { read: true })
    );
  });
});

// ─── Buyer Requests ───────────────────────────────────────────────────────────

const VALID_BUYER_REQUEST = {
  title: 'Cherche iPhone 13',
  whatsapp: '+25712345678',
  buyerName: 'Jean Dupont',
  countryId: 'bi',
  province: 'Bujumbura Mairie',
  city: 'Bujumbura',
  status: 'active',
  viewCount: 0,
  contactCount: 0,
  createdAt: now,
  expiresAt: now + 86400000 * 7,
};

describe('/buyerRequests — création (public)', () => {
  it('non-auth peut créer une demande valide', async () => {
    const db = anon().firestore();
    await expectPermissionGranted(
      setDoc(doc(db, 'buyerRequests', 'req-001'), VALID_BUYER_REQUEST)
    );
  });

  it('ne peut PAS créer avec status != active', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'buyerRequests', 'req-001'), { ...VALID_BUYER_REQUEST, status: 'deleted' })
    );
  });

  it('ne peut PAS créer avec viewCount > 0', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'buyerRequests', 'req-001'), { ...VALID_BUYER_REQUEST, viewCount: 5 })
    );
  });

  it('ne peut PAS créer avec un numéro WhatsApp invalide', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'buyerRequests', 'req-001'), { ...VALID_BUYER_REQUEST, whatsapp: 'pas-un-numero' })
    );
  });

  it('ne peut PAS créer avec expiresAt > 8 jours', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'buyerRequests', 'req-001'), {
        ...VALID_BUYER_REQUEST,
        expiresAt: now + 86400000 * 10, // 10 jours > max 8
      })
    );
  });
});

describe('/buyerRequests — lecture', () => {
  beforeEach(async () => {
    await seedDoc('buyerRequests', 'req-001', VALID_BUYER_REQUEST);
  });

  it('tout le monde peut lire les buyer requests (public)', async () => {
    const db = anon().firestore();
    await expectPermissionGranted(getDoc(doc(db, 'buyerRequests', 'req-001')));
  });
});

describe('/buyerRequests — incrémentation compteurs (vendeur)', () => {
  beforeEach(async () => {
    await seedDoc('buyerRequests', 'req-001', VALID_BUYER_REQUEST);
  });

  it('vendeur peut incrémenter viewCount de 1', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'buyerRequests', 'req-001'), { viewCount: 1 })
    );
  });

  it('vendeur peut incrémenter contactCount de 1', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionGranted(
      updateDoc(doc(db, 'buyerRequests', 'req-001'), { contactCount: 1 })
    );
  });

  it('personne ne peut modifier des champs autres que viewCount/contactCount (sans être propriétaire)', async () => {
    const db = authed(SELLER_ID, { role: 'seller' }).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'buyerRequests', 'req-001'), { title: 'Hacked' })
    );
  });
});

// ─── Deny all unknown collections ────────────────────────────────────────────

describe('Deny-all — collections inconnues', () => {
  it('non-auth ne peut PAS accéder à une collection non déclarée', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(getDoc(doc(db, 'secretCollection', 'doc-001')));
  });

  it('utilisateur auth ne peut PAS accéder à une collection non déclarée', async () => {
    const db = authed(USER_A).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'secretCollection', 'doc-001'), { data: 'hack' })
    );
  });
});
