/**
 * Firestore Rules — /photoSessions collection (Photo Studio)
 *
 * Codifie la sécurité du Photo Studio (rules livrées Phase 1).
 * Périmètre vérifié :
 *   - Lecture autorisée pour : admin + vendor propriétaire UNIQUEMENT
 *     (les sessions contiennent vendorPhone et notes internes admin —
 *     jamais publiques).
 *   - TOUTES les écritures côté client refusées (create/update/delete).
 *     Les CFs admin SDK bypassent ces rules.
 *   - Sous-collection events/ : même règle de lecture que le parent.
 *
 * Run :
 *   firebase emulators:start --only firestore   (terminal 1)
 *   npm run test:rules                          (terminal 2)
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import {
  setupTestEnv,
  teardownTestEnv,
  clearFirestore,
  authed,
  anon,
  seedDoc,
  expectPermissionDenied,
  expectPermissionGranted,
} from './helpers';

const VENDOR_ID = 'vendor-001';
const OTHER_VENDOR_ID = 'vendor-002';
const ADMIN_ID = 'admin-001';
const SESSION_ID = 'AM7K2P';

const BASE_SESSION = {
  vendorId: VENDOR_ID,
  vendorName: 'Boutique Joséphine',
  vendorPhone: '+25768515135', // donnée sensible — JAMAIS publique
  countryId: 'bi',
  plan: 'free',
  status: 'ready',
  createdAt: Date.now() - 3600_000,
  expiresAt: Date.now() + 86_400_000, // 24h dans le futur
  processedUrls: ['https://res.cloudinary.com/test/image/upload/v1/sample.jpg'],
  internalNote: 'note admin — ne doit jamais leak',
};

beforeAll(async () => { await setupTestEnv(); });
afterAll(async () => { await teardownTestEnv(); });
beforeEach(async () => { await clearFirestore(); });

// ─── Lecture ─────────────────────────────────────────────────────────────

describe('/photoSessions — lecture', () => {
  beforeEach(async () => {
    await seedDoc('photoSessions', SESSION_ID, BASE_SESSION);
  });

  it('vendeur propriétaire peut lire sa propre session', async () => {
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'photoSessions', SESSION_ID)));
  });

  it('admin peut lire n\'importe quelle session', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(getDoc(doc(db, 'photoSessions', SESSION_ID)));
  });

  it('autre vendeur ne peut PAS lire une session qui n\'est pas la sienne (leak vendorPhone)', async () => {
    const db = authed(OTHER_VENDOR_ID).firestore();
    await expectPermissionDenied(getDoc(doc(db, 'photoSessions', SESSION_ID)));
  });

  it('utilisateur non connecté ne peut PAS lire une session', async () => {
    const db = anon().firestore();
    await expectPermissionDenied(getDoc(doc(db, 'photoSessions', SESSION_ID)));
  });
});

// ─── Écritures (toutes interdites côté client) ───────────────────────────

describe('/photoSessions — écritures toutes interdites (CF admin SDK uniquement)', () => {
  it('vendeur propriétaire ne peut PAS créer un doc directement (anti-bypass throttling)', async () => {
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'photoSessions', SESSION_ID), BASE_SESSION),
    );
  });

  it('vendeur propriétaire ne peut PAS update sa session (status, publishedAt, etc.)', async () => {
    await seedDoc('photoSessions', SESSION_ID, BASE_SESSION);
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionDenied(
      updateDoc(doc(db, 'photoSessions', SESSION_ID), { status: 'published' }),
    );
  });

  it('vendeur propriétaire ne peut PAS supprimer sa session', async () => {
    await seedDoc('photoSessions', SESSION_ID, BASE_SESSION);
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionDenied(
      deleteDoc(doc(db, 'photoSessions', SESSION_ID)),
    );
  });

  it('admin ne peut PAS créer/update/delete depuis le client (CF uniquement)', async () => {
    await seedDoc('photoSessions', SESSION_ID, BASE_SESSION);
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionDenied(
      setDoc(doc(db, 'photoSessions', 'NEWID1'), BASE_SESSION),
    );
    await expectPermissionDenied(
      updateDoc(doc(db, 'photoSessions', SESSION_ID), { status: 'expired' }),
    );
    await expectPermissionDenied(
      deleteDoc(doc(db, 'photoSessions', SESSION_ID)),
    );
  });
});

// ─── Sous-collection events ──────────────────────────────────────────────

describe('/photoSessions/{id}/events — sous-collection', () => {
  beforeEach(async () => {
    await seedDoc('photoSessions', SESSION_ID, BASE_SESSION);
    await seedDoc(`photoSessions/${SESSION_ID}/events`, 'evt-001', {
      action: 'created',
      by: { userId: VENDOR_ID, role: 'seller' },
      timestamp: Date.now(),
    });
  });

  it('vendeur propriétaire peut lire les events de sa session', async () => {
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionGranted(
      getDoc(doc(db, 'photoSessions', SESSION_ID, 'events', 'evt-001')),
    );
  });

  it('admin peut lire les events de n\'importe quelle session', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionGranted(
      getDoc(doc(db, 'photoSessions', SESSION_ID, 'events', 'evt-001')),
    );
  });

  it('autre vendeur ne peut PAS lire les events d\'une session qui n\'est pas la sienne', async () => {
    const db = authed(OTHER_VENDOR_ID).firestore();
    await expectPermissionDenied(
      getDoc(doc(db, 'photoSessions', SESSION_ID, 'events', 'evt-001')),
    );
  });

  it('vendeur propriétaire ne peut PAS écrire un event (CF admin SDK uniquement)', async () => {
    const db = authed(VENDOR_ID).firestore();
    await expectPermissionDenied(
      addDoc(collection(db, 'photoSessions', SESSION_ID, 'events'), {
        action: 'created',
        by: { userId: VENDOR_ID, role: 'seller' },
        timestamp: Date.now(),
      }),
    );
  });

  it('admin ne peut PAS écrire un event depuis le client (CF uniquement)', async () => {
    const db = authed(ADMIN_ID, { role: 'admin' }).firestore();
    await expectPermissionDenied(
      addDoc(collection(db, 'photoSessions', SESSION_ID, 'events'), {
        action: 'processing_started',
        by: { userId: ADMIN_ID, role: 'admin' },
        timestamp: Date.now(),
      }),
    );
  });
});
