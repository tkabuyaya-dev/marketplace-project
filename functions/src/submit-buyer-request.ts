/**
 * NUNULIA — submitBuyerRequest (Callable Cloud Function)
 *
 * Crée une demande acheteur "Je Cherche" côté serveur via Admin SDK.
 *
 * POURQUOI une Cloud Function plutôt qu'une écriture directe Firestore ?
 * - Les règles Firestore s'appuient sur `createdAt is int/number`.
 *   Sur iOS Safari (ITP strict), le SDK Firebase JS peut encoder
 *   Date.now() en double_value au lieu de integer_value → permission refusée.
 * - L'Admin SDK ignore totalement les security rules → 0 problème de type.
 * - Le timestamp est généré server-side → 0 problème de décalage d'horloge.
 * - Fonctionne sur iOS, Android, tout navigateur, connexion lente.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
const COLLECTION = "buyerRequests";

interface SubmitBuyerRequestData {
  title: string;
  description?: string | null;
  countryId: string;
  province: string;
  city: string;
  category?: string | null;
  budget?: number | null;
  budgetCurrency?: string | null;
  imageUrl?: string | null;
  whatsapp: string;
  buyerId?: string | null;
  buyerName: string;
}

/** Validate WhatsApp format: +XXXXXXXXXXX or XXXXXXXXXXX (7-15 digits) */
function isValidWhatsapp(phone: string): boolean {
  return /^\+?\d{7,15}$/.test(phone.replace(/\s/g, ""));
}

/** Validate a non-empty string within max length */
function isValidString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠️  NE PAS MODIFIER ces options — Configuration critique iOS               ║
// ║                                                                              ║
// ║  • region "europe-west1" : doit correspondre à getFirebaseFunctions()        ║
// ║    dans firebase-config.ts. Changer l'un sans l'autre → ECONNREFUSED.        ║
// ║  • NE PAS ajouter enforceAppCheck: true → bloque iOS Safari (ITP empêche     ║
// ║    reCAPTCHA d'obtenir un token, ce qui produit la même erreur "permissions"  ║
// ║  • cors: ALLOWED_ORIGINS → ne pas supprimer ni élargir à "*"                 ║
// ║                                                                              ║
// ║  Fix validé en production le 2026-04-14. Ne pas toucher.                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
export const submitBuyerRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 20,
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = request.data as SubmitBuyerRequestData;

    // ── Validation des champs obligatoires ──────────────────────────
    if (!isValidString(data.title, 200)) {
      throw new HttpsError("invalid-argument", "Le titre est requis (max 200 caractères).");
    }
    if (!isValidString(data.buyerName, 100)) {
      throw new HttpsError("invalid-argument", "Le nom de l'acheteur est requis.");
    }
    if (!isValidString(data.countryId, 10)) {
      throw new HttpsError("invalid-argument", "Le pays est requis.");
    }
    if (!isValidString(data.province, 100)) {
      throw new HttpsError("invalid-argument", "La province est requise.");
    }
    if (!isValidString(data.city, 100)) {
      throw new HttpsError("invalid-argument", "La ville est requise.");
    }

    const whatsapp = (data.whatsapp || "").replace(/\s/g, "");
    if (!isValidWhatsapp(whatsapp)) {
      throw new HttpsError("invalid-argument", "Numéro WhatsApp invalide.");
    }

    const db = await getDb();

    // ── Rate limiting : max 3 demandes par WhatsApp / 24h ────────────
    const since = Date.now() - 24 * 60 * 60 * 1000;
    try {
      const rateSnap = await db.collection(COLLECTION)
        .where("whatsapp", "==", whatsapp)
        .where("createdAt", ">=", since)
        .where("status", "in", ["active", "fulfilled"])
        .get();

      if (rateSnap.size >= MAX_REQUESTS_PER_DAY) {
        throw new HttpsError(
          "resource-exhausted",
          `Maximum ${MAX_REQUESTS_PER_DAY} demandes par 24h atteint.`
        );
      }
    } catch (err: any) {
      // Re-throw if it's our HttpsError, ignore Firestore index errors
      if (err?.code === "resource-exhausted") throw err;
      logger.warn("[submitBuyerRequest] Rate-limit check failed (index?), continuing:", err?.message);
    }

    // ── Création du document (Admin SDK — bypass rules, timestamp serveur) ──
    const now = Date.now();
    const ref = await db.collection(COLLECTION).add({
      title:          data.title.trim(),
      description:    data.description?.trim() || null,
      countryId:      data.countryId,
      province:       data.province,
      city:           data.city,
      category:       data.category || null,
      budget:         typeof data.budget === "number" ? data.budget : null,
      budgetCurrency: data.budgetCurrency || null,
      imageUrl:       data.imageUrl || null,
      whatsapp,
      buyerId:        data.buyerId || null,
      buyerName:      data.buyerName.trim(),
      status:         "active",
      // Timestamps en entiers ms côté serveur — aucun problème de type/horloge
      createdAt:      now,
      expiresAt:      now + SEVEN_DAYS_MS,
      viewCount:      0,
      contactCount:   0,
      // Timestamp Firestore natif pour les requêtes server-side
      createdAtTs:    FieldValue.serverTimestamp(),
    });

    logger.info("[submitBuyerRequest] Created:", { id: ref.id, whatsapp: whatsapp.slice(0, 6) + "***" });

    return { id: ref.id };
  }
);
