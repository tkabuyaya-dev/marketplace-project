/**
 * NUNULIA — Deal Loop : recordContact (callable)
 *
 * Journalise qu'un acheteur a cliqué « Contacter sur WhatsApp » sur un produit.
 * C'est le point de départ du deal loop : 48h plus tard, dealLoopSweep demande
 * au vendeur si la vente a eu lieu (cf. deal-loop-sweep.ts).
 *
 * Appelée en fire-and-forget depuis ProductDetail : le client n'attend PAS la
 * réponse (WhatsApp s'ouvre immédiatement). Donc tout échec est silencieux.
 *
 * Dédup : docId déterministe `${actorKey}__${productId}` (actorKey = buyerUid
 * sinon deviceId) → un seul event par acheteur et par produit, sans query ni
 * index. Les contacts répétés ne réarment pas le timer (createdAt préservé).
 *
 * Callable (Admin SDK) plutôt qu'écriture directe : iOS-safe (cf.
 * submit-buyer-request.ts) + écriture serveur sur une collection CF-only.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";

const COLLECTION = "contactEvents";

interface RecordContactData {
  productId?: string;
  sellerUid?: string;
  productSlug?: string | null;
  productTitle?: string;
  /** Prix affiché au moment du contact — sert au calcul du GMV estimé. */
  productPrice?: number;
  /** Devise du prix (BIF, CDF, USD, RWF, TZS) — le GMV est agrégé par devise. */
  currency?: string;
  deviceId?: string | null;
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{12,16}$/.test(value);
}

export const recordContact = onCall<RecordContactData>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 20,
    timeoutSeconds: 30,
  },
  async (request) => {
    const data = request.data || {};
    const productId = (data.productId || "").trim();
    const sellerUid = (data.sellerUid || "").trim();
    const productTitle = (data.productTitle || "").trim().slice(0, 140);

    if (!productId || !sellerUid) {
      throw new HttpsError("invalid-argument", "productId et sellerUid requis.");
    }

    const buyerUid = request.auth?.uid ?? null;
    const deviceId = isValidDeviceId(data.deviceId) ? data.deviceId : null;
    const productPrice =
      typeof data.productPrice === "number" && isFinite(data.productPrice) && data.productPrice > 0
        ? data.productPrice
        : null;
    const currency =
      typeof data.currency === "string" && data.currency.trim()
        ? data.currency.trim().slice(0, 8)
        : null;

    // Self-contact (le vendeur clique son propre produit) → on ignore.
    if (buyerUid && buyerUid === sellerUid) {
      return { ok: true, skipped: "self" as const };
    }

    const actorKey = buyerUid || deviceId;
    const db = await getDb();
    const now = Date.now();
    const ref = actorKey
      ? db.collection(COLLECTION).doc(`${actorKey}__${productId}`)
      : db.collection(COLLECTION).doc();

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          tx.set(ref, {
            sellerUid,
            buyerUid,
            deviceId,
            productId,
            productSlug: data.productSlug || null,
            productTitle,
            productPrice,
            currency,
            status: "pending",
            createdAt: now,
            updatedAt: now,
            contactCount: 1,
          });
        } else {
          // Contact répété : on ne touche ni createdAt ni status (le timer 48h
          // court depuis le 1er contact, la confirmation éventuelle est préservée).
          tx.update(ref, {
            updatedAt: now,
            contactCount: FieldValue.increment(1),
          });
        }
      });
    } catch (err) {
      // Fire-and-forget côté client → on n'échoue jamais bruyamment.
      logger.warn("[recordContact] write failed (non-blocking)", {
        error: err instanceof Error ? err.message : String(err),
        productId,
      });
    }

    return { ok: true };
  },
);
