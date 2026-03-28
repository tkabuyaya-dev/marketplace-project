/**
 * NUNULIA — Delete User Account (Callable Cloud Function)
 *
 * Anonymises user data, deletes products/likes/notifications,
 * cancels active subscription, and removes Firebase Auth account.
 *
 * Auth deletion is ALWAYS the last operation — if anything fails
 * before that, the user can still log in and retry.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";

const COLLECTIONS = {
  USERS: "users",
  PRODUCTS: "products",
  LIKES: "likes",
  NOTIFICATIONS: "notifications",
  USER_ACTIVITY: "userActivity",
  AUDIT_LOGS: "auditLogs",
} as const;

/** Max documents per batch write (Firestore limit is 500) */
const BATCH_LIMIT = 450;

export const deleteUserAccount = onCall(
  {
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    // ── ÉTAPE A — Vérification identité ──
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const uid = request.auth.uid;
    logger.info(`[deleteAccount] Starting for uid=${uid}`);

    const db = await getDb();

    // ── ÉTAPE B — Lecture état actuel ──
    const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Utilisateur introuvable.");
    }

    const userData = userSnap.data()!;
    const isVendor = userData.role === "seller";
    const sellerDetails = userData.sellerDetails || {};
    const subscriptionExpiresAt = sellerDetails.subscriptionExpiresAt || null;
    const hadActiveSubscription =
      typeof subscriptionExpiresAt === "number" && subscriptionExpiresAt > Date.now();
    const displayName = userData.name || "Inconnu";

    logger.info(`[deleteAccount] User: ${displayName}, vendor=${isVendor}, activeSub=${hadActiveSubscription}`);

    try {
      // ── ÉTAPE C — Batch writes ──

      // C1: Anonymise user document
      let batch = db.batch();
      let opCount = 0;

      batch.update(userRef, {
        name: "Utilisateur supprimé",
        nameLower: "utilisateur supprimé",
        email: null,
        avatar: null,
        whatsapp: null,
        bio: null,
        banner: null,
        isDeleted: true,
        isSuspended: true,
        deletedAt: FieldValue.serverTimestamp(),
        ...(isVendor
          ? {
              sellerDetails: {
                ...sellerDetails,
                phone: null,
                subscriptionExpiresAt: null,
                tierLabel: null,
                shopName: "Boutique supprimée",
                nif: null,
                registryNumber: null,
                documents: null,
              },
            }
          : {}),
      });
      opCount++;

      // C2: Set all seller's products to 'deleted'
      if (isVendor) {
        const productsSnap = await db
          .collection(COLLECTIONS.PRODUCTS)
          .where("sellerId", "==", uid)
          .get();

        for (const doc of productsSnap.docs) {
          batch.update(doc.ref, { status: "deleted" });
          opCount++;
          if (opCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
        logger.info(`[deleteAccount] Marked ${productsSnap.size} products as deleted`);
      }

      // C3: Delete notifications
      const notifsSnap = await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .where("userId", "==", uid)
        .get();

      for (const doc of notifsSnap.docs) {
        batch.delete(doc.ref);
        opCount++;
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }
      logger.info(`[deleteAccount] Deleted ${notifsSnap.size} notifications`);

      // C4: Delete likes by this user
      const likesSnap = await db
        .collection(COLLECTIONS.LIKES)
        .where("userId", "==", uid)
        .get();

      for (const doc of likesSnap.docs) {
        batch.delete(doc.ref);
        opCount++;
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }
      logger.info(`[deleteAccount] Deleted ${likesSnap.size} likes`);

      // C5: Delete user activity logs
      const activitySnap = await db
        .collection(COLLECTIONS.USER_ACTIVITY)
        .where("userId", "==", uid)
        .get();

      for (const doc of activitySnap.docs) {
        batch.delete(doc.ref);
        opCount++;
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }
      logger.info(`[deleteAccount] Deleted ${activitySnap.size} activity logs`);

      // C6: Audit log
      const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
      batch.set(auditRef, {
        action: "account_deleted",
        userId: uid,
        displayName,
        wasVendor: isVendor,
        hadActiveSubscription,
        subscriptionTier: sellerDetails.tierLabel || null,
        timestamp: FieldValue.serverTimestamp(),
      });
      opCount++;

      // Commit remaining batch
      if (opCount > 0) {
        await batch.commit();
      }

      // ── ÉTAPE E — Suppression Firebase Auth (TOUJOURS EN DERNIER) ──
      const { getAuth } = await import("firebase-admin/auth");
      await getAuth().deleteUser(uid);
      logger.info(`[deleteAccount] Auth account deleted for uid=${uid}`);

      // ── ÉTAPE F — Retour ──
      return {
        success: true,
        wasVendor: isVendor,
        hadActiveSubscription,
      };
    } catch (err: any) {
      logger.error(`[deleteAccount] Error for uid=${uid}:`, err);
      throw new HttpsError(
        "internal",
        "La suppression a échoué. Contacte le support si le problème persiste."
      );
    }
  }
);
