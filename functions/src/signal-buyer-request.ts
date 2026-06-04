/**
 * NUNULIA — signalBuyerRequest (Callable Cloud Function — admin only)
 *
 * Suspension manuelle d'une demande signalée comme usurpation par le vrai
 * propriétaire du numéro WhatsApp. Refonte Option C 2026-06-04 : l'admin
 * agit depuis le dashboard après avoir reçu la plainte du vrai propriétaire
 * via WhatsApp Nunulia. La CF n'est plus appelable publiquement (sinon
 * un attaquant pourrait suspendre arbitrairement les demandes des autres).
 *
 * Input accepté :
 *   - { requestId: string } → cas standard depuis le dashboard
 *   - { code: string }      → cas secondaire (URL directe)
 *
 * Action :
 *   - status='suspended', visible=false, isAbuse=true
 *   - deviceFingerprints.abuseFlagged++
 *   - Si 2e abus → blacklist auto 7 jours
 *   - Notif admin créée
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";
import type { DeviceFingerprint } from "../../types.js";

const COLLECTION = "buyerRequests";
const FINGERPRINTS_COLLECTION = "deviceFingerprints";
const BLOCKLIST_COLLECTION = "blocklist";
const NOTIFICATIONS_COLLECTION = "notifications";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * TWENTY_FOUR_HOURS_MS;

interface SignalInput {
  requestId?: string;
  code?: string;
}

function isValidCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{8}$/.test(code);
}

function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

export const signalBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── Gate admin (Option C, 2026-06-04) ────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    if (request.auth.token.role !== "admin") {
      logger.warn("[signalBuyerRequest] non-admin call refused", {
        uid: request.auth.uid,
        role: request.auth.token.role,
      });
      throw new HttpsError("permission-denied", "Réservé aux administrateurs.");
    }
    const adminUid = request.auth.uid;

    const data = request.data as SignalInput;

    const hasRequestId = isValidRequestId(data.requestId);
    const hasCode = isValidCode(data.code);
    if (!hasRequestId && !hasCode) {
      throw new HttpsError("invalid-argument", "requestId ou code requis.");
    }

    const db = await getDb();
    const now = Date.now();

    // ── Lookup ──────────────────────────────────────────────────────
    let docSnap: FirebaseFirestore.DocumentSnapshot;
    if (hasRequestId) {
      docSnap = await db.collection(COLLECTION).doc(data.requestId as string).get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Demande introuvable.");
      }
    } else {
      const snap = await db.collection(COLLECTION)
        .where("confirmationCode", "==", data.code)
        .limit(1)
        .get();
      if (snap.empty) {
        throw new HttpsError("not-found", "Code introuvable.");
      }
      docSnap = snap.docs[0];
    }

    const reqData = docSnap.data() || {};
    const status = reqData.status as string;

    // Déjà suspendue ou supprimée → idempotent
    if (status === "suspended" || status === "deleted" || status === "expired") {
      logger.info("[signalBuyerRequest] already handled", {
        requestId: docSnap.id,
        status,
      });
      return { ok: true, alreadyHandled: true };
    }

    const originDeviceId = typeof reqData.deviceId === "string" ? reqData.deviceId : null;
    const originIp = typeof reqData.deviceIp === "string" ? reqData.deviceIp : null;
    const title = typeof reqData.title === "string" ? reqData.title : "";

    // ── Suspension de la demande ─────────────────────────────────────
    await docSnap.ref.update({
      status: "suspended",
      visible: false,
      isAbuse: true,
      abuseSignaledAt: now,
      abuseSignaledByAdmin: adminUid,
      suspendedReason: "abuse_reported",
      updatedAt: now,
    });

    // ── MAJ deviceFingerprint origine (abuse++) + décision blacklist ─
    let shouldBlock = false;
    let priorAbuseCount = 0;
    if (originDeviceId) {
      try {
        const fpRef = db.collection(FINGERPRINTS_COLLECTION).doc(originDeviceId);
        await db.runTransaction(async (tx) => {
          const fpSnap = await tx.get(fpRef);
          if (fpSnap.exists) {
            const cur = fpSnap.data() as DeviceFingerprint;
            priorAbuseCount = cur.abuseFlagged || 0;
            tx.update(fpRef, {
              abuseFlagged: priorAbuseCount + 1,
              status: priorAbuseCount + 1 >= 2 ? "blocked" : "watched",
              lastSeenAt: now,
            });
            shouldBlock = priorAbuseCount + 1 >= 2;
          } else {
            // Création silencieuse — premier abus connu
            tx.set(fpRef, {
              deviceId: originDeviceId,
              firstSeenAt: now,
              lastSeenAt: now,
              totalRequests: 1,
              confirmedRequests: 0,
              abuseFlagged: 1,
              lastIp: originIp ?? undefined,
              whatsappNumbers: [],
              status: "watched",
            } satisfies DeviceFingerprint);
            shouldBlock = false;
          }
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.warn("[signalBuyerRequest] fingerprint update failed:", e?.message);
      }

      // ── Blacklist auto si 2ᵉ abus depuis ce device ──────────────────
      if (shouldBlock) {
        try {
          await db.collection(BLOCKLIST_COLLECTION).doc(originDeviceId).set({
            deviceId: originDeviceId,
            blockedAt: now,
            blockedBy: "auto",
            reason: "Multiple abuse reports (2+)",
            duration: "7j",
            expiresAt: now + SEVEN_DAYS_MS,
            adminId: null,
            lastIp: originIp ?? undefined,
            totalRequestsBlocked: 0,
          });
          logger.warn("[signalBuyerRequest] device auto-blacklisted 7d", {
            deviceId: originDeviceId,
            abuseCount: priorAbuseCount + 1,
          });
        } catch (err: unknown) {
          const e = err as { message?: string };
          logger.error("[signalBuyerRequest] blacklist write failed:", e?.message);
        }
      }
    }

    // ── Notif admin (best-effort, hors transaction) ──────────────────
    try {
      const adminsSnap = await db.collection("users").where("role", "==", "admin").limit(10).get();
      const batch = db.batch();
      adminsSnap.forEach((adminDoc) => {
        const notifRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
        batch.set(notifRef, {
          userId: adminDoc.id,
          type: "buyer_request_abuse_signaled",
          title: shouldBlock
            ? "🚨 Device blacklisté auto (2+ abus)"
            : "⚠️ Demande signalée par le vrai propriétaire",
          body: `"${title.slice(0, 80)}" — ${shouldBlock ? "device bloqué 7j" : "1er signalement"}`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: {
            link: "/admin?tab=security",
            buyerRequestId: docSnap.id,
            deviceId: originDeviceId,
          },
        });
      });
      await batch.commit();
    } catch (err: unknown) {
      const e = err as { message?: string };
      logger.warn("[signalBuyerRequest] admin notif failed (non-blocking):", e?.message);
    }

    logger.info("[signalBuyerRequest] signaled by admin", {
      requestId: docSnap.id,
      adminUid,
      originDeviceId,
      shouldBlock,
      priorAbuseCount,
    });

    return { ok: true };
  }
);
