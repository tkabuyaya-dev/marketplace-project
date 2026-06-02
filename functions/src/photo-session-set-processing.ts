/**
 * NUNULIA — photoSessionSetProcessing (Callable, admin uniquement)
 *
 * Petit endpoint qui passe une session du status `waiting_photos` à
 * `processing` quand l'admin commence à retoucher les photos.
 *
 * Effet UX côté vendeur : son tracker temps-réel (listener Firestore sur
 * la session) bascule de "⏳ Photos en attente" à "🔄 En traitement par
 * l'équipe" — rassurant, il sait que sa demande a été vue.
 *
 * Sécurité : admin only via custom claim JWT. Si la session a déjà
 * dépassé `processing` (ready/published/expired), la transition est ignorée
 * (idempotent — pas d'erreur, juste un ack `{ok, alreadyProcessed}`).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";
import { isValidSessionId } from "./session-id.js";

const COLLECTION = "photoSessions";

interface SetProcessingInput {
  sessionId?: string;
}

interface SetProcessingOutput {
  ok: true;
  status: "processing" | "already_advanced";
}

export const photoSessionSetProcessing = onCall<SetProcessingInput, Promise<SetProcessingOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
    timeoutSeconds: 15,
  },
  async (request) => {
    // ── Auth + admin check via JWT custom claim ─────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    if (request.auth?.token?.role !== "admin") {
      throw new HttpsError("permission-denied", "Réservé aux admins.");
    }

    // ── Validation input ────────────────────────────────────────────────
    const sessionId = (request.data?.sessionId || "").trim().toUpperCase();
    if (!isValidSessionId(sessionId)) {
      throw new HttpsError("invalid-argument", "sessionId invalide.");
    }

    const db = await getDb();
    const ref = db.collection(COLLECTION).doc(sessionId);

    // ── Transition atomique ─────────────────────────────────────────────
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { code: "not-found" as const };
      }
      const data = snap.data()!;
      const status = data.status as string;

      // Idempotence : si déjà passée (processing/ready/published), no-op
      if (status === "processing" || status === "ready" || status === "published") {
        return { code: "already" as const };
      }
      // Refus : on ne ré-active pas une session expirée par cette voie
      if (status === "expired") {
        return { code: "expired" as const };
      }
      if (status !== "waiting_photos") {
        return { code: "bad-state" as const, status };
      }

      const now = Date.now();
      tx.update(ref, {
        status: "processing",
        processingStartedAt: now,
      });
      const evRef = ref.collection("events").doc();
      tx.set(evRef, {
        action: "processing_started",
        by: { userId: uid, role: "admin" },
        timestamp: now,
      });
      return { code: "ok" as const };
    });

    if (result.code === "not-found") {
      throw new HttpsError("not-found", "Session introuvable.");
    }
    if (result.code === "expired") {
      throw new HttpsError("failed-precondition", "Session expirée.");
    }
    if (result.code === "bad-state") {
      throw new HttpsError("failed-precondition", `Transition refusée (état actuel: ${result.status}).`);
    }
    if (result.code === "already") {
      logger.info("[photoSessionSetProcessing] Idempotent", { sessionId, adminUid: uid });
      return { ok: true, status: "already_advanced" };
    }

    logger.info("[photoSessionSetProcessing] Marked processing", { sessionId, adminUid: uid });
    return { ok: true, status: "processing" };
  },
);
