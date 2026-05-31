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
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY } from "./config.js";
import { moderateBuyerRequest } from "./moderate-buyer-request.js";

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
    secrets: [ANTHROPIC_API_KEY],
    // 60s pour couvrir l'appel Anthropic (600-900ms typ.) + rate-limit query + write.
    timeoutSeconds: 60,
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
    // Catégorie obligatoire depuis le smart picker (slug réel OU "_help" pour "Je ne sais pas trop").
    // Si _help, la CF onBuyerRequestMatch appellera Claude Haiku pour deviner.
    if (!isValidString(data.category, 80)) {
      throw new HttpsError("invalid-argument", "La catégorie est requise.");
    }

    const whatsapp = (data.whatsapp || "").replace(/\s/g, "");
    if (!isValidWhatsapp(whatsapp)) {
      throw new HttpsError("invalid-argument", "Numéro WhatsApp invalide.");
    }

    const db = await getDb();

    // ── Rate limiting : max 3 demandes par WhatsApp / 24h ────────────
    // Query "single-field equality" uniquement → utilise l'index auto Firestore,
    // zéro besoin d'index composite. Le filtrage createdAt + status se fait
    // en mémoire (volume max ~50 docs : TTL 7j × 3/j = 21, + marge expirées).
    // FAIL-CLOSED : si la query échoue, on REFUSE — vaut mieux faux positif
    // qu'ouvrir le spam.
    const since = Date.now() - 24 * 60 * 60 * 1000;
    try {
      const rateSnap = await db.collection(COLLECTION)
        .where("whatsapp", "==", whatsapp)
        .get();

      const activeCount = rateSnap.docs.filter((d) => {
        const data = d.data();
        const status = data.status;
        const createdAt = typeof data.createdAt === "number" ? data.createdAt : 0;
        return (status === "active" || status === "fulfilled") && createdAt >= since;
      }).length;

      if (activeCount >= MAX_REQUESTS_PER_DAY) {
        throw new HttpsError(
          "resource-exhausted",
          `Maximum ${MAX_REQUESTS_PER_DAY} demandes par 24h atteint pour ce numéro.`
        );
      }
    } catch (err: any) {
      if (err?.code === "resource-exhausted") throw err;
      logger.error("[submitBuyerRequest] Rate-limit check failed — REFUSING request:", err?.message);
      throw new HttpsError(
        "unavailable",
        "Service temporairement indisponible. Réessayez dans quelques instants."
      );
    }

    // ── Modération IA (Claude Haiku 4.5) ─────────────────────────────
    // Bloque les contenus illicites avant publication. Fail-open si Anthropic
    // est down (cf. moderate-buyer-request.ts) pour ne pas casser le service.
    const moderation = await moderateBuyerRequest({
      title: data.title,
      description: data.description,
      category: data.category,
    });

    if (moderation.verdict === "reject") {
      logger.warn("[submitBuyerRequest] BLOCKED by AI moderation:", {
        whatsapp: whatsapp.slice(0, 6) + "***",
        title: data.title.slice(0, 100),
        reason: moderation.reason,
      });
      throw new HttpsError(
        "invalid-argument",
        "Demande refusée. Vérifiez le contenu et réessayez."
      );
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
      // Borderline : publié mais flagué pour review admin
      ...(moderation.verdict === "borderline" && {
        moderationFlag: true,
        moderationReason: moderation.reason,
      }),
    });

    logger.info("[submitBuyerRequest] Created:", {
      id: ref.id,
      whatsapp: whatsapp.slice(0, 6) + "***",
      moderation: moderation.verdict,
    });

    return { id: ref.id };
  }
);
