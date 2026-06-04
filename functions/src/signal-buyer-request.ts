/**
 * NUNULIA — signalBuyerRequest (Callable Cloud Function)
 *
 * Endpoint /signaler/:code — le vrai propriétaire du numéro WhatsApp signale
 * une demande qu'il n'a pas postée. Suspend la demande immédiatement et,
 * selon le pattern, blacklist le deviceId d'origine.
 *
 * Réponse VOLONTAIREMENT MINIMALE :
 *   - Toujours { ok: true } pour ne pas leaker l'état (anti-énumération)
 *   - Honeypot doux : l'abuseur, s'il tape l'URL, voit le même retour
 *
 * Sécurité :
 *   - Si deviceId origine == deviceId clic → auto-signalement par erreur, ignoré
 *   - Si deviceId origine ≠ deviceId clic ET deviceFingerprints.abuseFlagged >= 1
 *     → blacklist auto 24h du device origine
 *   - Notif admin créée (réutilise pattern notifications/{auto} role=admin)
 */

import { onCall } from "firebase-functions/v2/https";
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
  code: string;
  deviceId?: string | null;
}

function isValidCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{8}$/.test(code);
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{12,16}$/.test(value);
}

export const signalBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    const data = request.data as SignalInput;

    // Validation très permissive — on retourne TOUJOURS ok:true (honeypot).
    if (!isValidCode(data.code)) return { ok: true };

    const clickDeviceId = isValidDeviceId(data.deviceId) ? data.deviceId : null;
    const clickIp = (request.rawRequest as { ip?: string } | undefined)?.ip ?? null;

    const db = await getDb();
    const now = Date.now();

    // ── Lookup ──────────────────────────────────────────────────────
    const snap = await db.collection(COLLECTION)
      .where("confirmationCode", "==", data.code)
      .limit(1)
      .get();

    if (snap.empty) {
      // Code introuvable — retour silencieux. Code utilisé peut-être déjà nettoyé.
      logger.info("[signalBuyerRequest] code unknown (silent ok)");
      return { ok: true };
    }

    const docSnap = snap.docs[0];
    const reqData = docSnap.data();
    const status = reqData.status as string;

    // Déjà suspendue ou supprimée → silencieux
    if (status === "suspended" || status === "deleted" || status === "expired") {
      logger.info("[signalBuyerRequest] already handled (silent ok)", {
        requestId: docSnap.id,
        status,
      });
      return { ok: true };
    }

    const originDeviceId = typeof reqData.deviceId === "string" ? reqData.deviceId : null;
    const originIp = typeof reqData.deviceIp === "string" ? reqData.deviceIp : null;
    const title = typeof reqData.title === "string" ? reqData.title : "";

    // ── Auto-signalement par erreur (même device) — on ignore ────────
    // Le vrai propriétaire n'aurait aucune raison de signaler sa propre demande
    // depuis son propre device. Si c'est le cas, probablement un clic accidentel.
    const isSelfSignal = clickDeviceId && originDeviceId && clickDeviceId === originDeviceId;
    if (isSelfSignal) {
      logger.info("[signalBuyerRequest] self-signal ignored", { requestId: docSnap.id });
      return { ok: true };
    }

    // ── Suspension de la demande ─────────────────────────────────────
    await docSnap.ref.update({
      status: "suspended",
      visible: false,
      isAbuse: true,
      abuseSignaledAt: now,
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

    logger.info("[signalBuyerRequest] signaled", {
      requestId: docSnap.id,
      originDeviceId,
      clickDeviceId,
      shouldBlock,
      priorAbuseCount,
      clickIp,
    });

    return { ok: true };
  }
);
