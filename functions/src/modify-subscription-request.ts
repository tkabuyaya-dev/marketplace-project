/**
 * NUNULIA — modifySubscriptionRequest (Callable Cloud Function)
 *
 * Permet au vendeur de modifier sa demande en cours (plan et/ou période).
 *
 * Règles métier :
 *   - Seller authentifié + non suspendu
 *   - Ownership requis
 *   - Statut autorisé : `pending` (avant soumission de la référence paiement).
 *     Une demande en `pending_validation` ne peut PAS être modifiée — le vendeur
 *     doit l'annuler et en créer une nouvelle.
 *   - Le montant (`amount`) est **recalculé côté serveur** depuis le pricing
 *     courant (subscriptionPricing/{countryId} ou defaults), JAMAIS depuis le
 *     payload client. Empêche toute manipulation.
 *   - NIF non bloquant : le plan Grossiste affiche « NIF requis » côté UI, mais
 *     l'éligibilité n'est plus gatée par le code (l'admin valide + collecte via WhatsApp).
 *   - `transactionRef` réinitialisé à `null` (la modification invalide tout
 *     paiement déjà saisi pour ce plan).
 *
 * Returns: { ok: boolean, newAmount: number, newCurrency: string }
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";
import { PLAN_FEATURES, planIdFromLabel, type PlanId } from "./plan-features.js";

const REQUESTS_COLLECTION = "subscriptionRequests";
const HISTORY_SUBCOLLECTION = "history";
const SUBSCRIPTION_PRICING_COLLECTION = "subscriptionPricing";

// Mêmes valeurs que utils/planFeatures.ts → PLAN_LABELS
const PLAN_LABELS: Record<PlanId, string> = {
  free:      "Découverte",
  vendeur:   "Vendeur",
  pro:       "Pro",
  grossiste: "Grossiste",
};

const VALID_PERIODS = new Set(["1m", "3m", "12m"]);
type Period = "1m" | "3m" | "12m";

interface ModifyData {
  requestId: string;
  planId: PlanId;
  period: Period;
}

/** Defaults par pays — miroir minimal de DEFAULT_SUBSCRIPTION_PRICING (constants.ts). */
const DEFAULT_PRICING: Record<string, { prices: Record<string, number>; currency: string }> = {
  bi: { prices: { vendeur: 9900,  pro: 29000, grossiste: 75000 }, currency: "BIF" },
  cd: { prices: { vendeur: 6000,  pro: 19000, grossiste: 42000 }, currency: "CDF" },
  rw: { prices: { vendeur: 2500,  pro: 7800,  grossiste: 17000 }, currency: "RWF" },
  tz: { prices: { vendeur: 4500,  pro: 15500, grossiste: 34000 }, currency: "TZS" },
  ke: { prices: { vendeur: 650,   pro: 2000,  grossiste: 5000   }, currency: "KES" },
  ug: { prices: { vendeur: 18500, pro: 55500, grossiste: 140000 }, currency: "UGX" },
};

/** Multiplier × discount (cohérent avec getPeriodPrice côté frontend). */
function periodMultiplier(p: Period): number {
  if (p === "3m") return 3 * 0.9;    // -10%
  if (p === "12m") return 12 * 0.75; // -25%
  return 1;
}

export const modifySubscriptionRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── Auth check ───────────────────────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const sellerId = request.auth.uid;

    if (request.auth.token.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu — action impossible.");
    }

    // ── Input validation ─────────────────────────────────────────
    const data = request.data as ModifyData;
    const requestId = (data?.requestId || "").trim();
    const planId = (data?.planId || "").trim() as PlanId;
    const period = (data?.period || "1m").trim() as Period;

    if (!requestId || requestId.length > 100) {
      throw new HttpsError("invalid-argument", "requestId invalide.");
    }
    if (!PLAN_FEATURES[planId]) {
      throw new HttpsError("invalid-argument", "planId invalide.");
    }
    if (planId === "free") {
      throw new HttpsError("invalid-argument", "Le plan Découverte est gratuit — pas de demande nécessaire.");
    }
    if (!VALID_PERIODS.has(period)) {
      throw new HttpsError("invalid-argument", "period invalide.");
    }

    const db = await getDb();

    // NIF non bloquant : le plan Grossiste affiche « NIF requis » côté UI,
    // mais l'éligibilité n'est plus gatée par le code — l'admin valide la
    // demande et collecte le NIF via WhatsApp si nécessaire.
    const features = PLAN_FEATURES[planId];

    const reqRef = db.collection(REQUESTS_COLLECTION).doc(requestId);

    // ── Pricing serveur : recalcul du montant ────────────────────
    // On le fait HORS transaction (lecture seule sur subscriptionPricing).
    const reqSnapPreview = await reqRef.get();
    if (!reqSnapPreview.exists) {
      throw new HttpsError("not-found", "Demande introuvable.");
    }
    const previewData = reqSnapPreview.data() as any;
    const countryId = (previewData.countryId || "bi") as string;

    // Override Firestore (admin) prioritaire, sinon defaults par pays
    let basePrices: Record<string, number> | null = null;
    let currency: string | null = null;
    const overrideSnap = await db.collection(SUBSCRIPTION_PRICING_COLLECTION).doc(countryId).get();
    if (overrideSnap.exists) {
      const o = overrideSnap.data() as any;
      basePrices = o?.prices ?? null;
      currency = (o?.currency as string) ?? null;
    }
    if (!basePrices || !currency) {
      const fallback = DEFAULT_PRICING[countryId] || DEFAULT_PRICING.bi;
      basePrices = fallback.prices;
      currency = fallback.currency;
    }
    const monthly = basePrices?.[planId];
    if (typeof monthly !== "number" || monthly <= 0) {
      throw new HttpsError("failed-precondition", "Pricing introuvable pour ce plan / pays.");
    }
    const newAmount = Math.round(monthly * periodMultiplier(period));
    const newMaxProducts = features.maxProducts;
    const newPlanLabel = PLAN_LABELS[planId];

    // ── Transaction : modification atomique + event history ──────
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Demande introuvable.");
      }
      const reqData = snap.data() as any;

      // Ownership
      if (reqData.userId !== sellerId) {
        throw new HttpsError("permission-denied", "Demande non autorisée.");
      }
      // Statut modifiable : pending seulement
      if (reqData.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          `Demande non modifiable (status=${reqData.status}). Annulez et créez une nouvelle demande.`
        );
      }

      const modifiedAt = Date.now();
      const previousSnapshot = {
        planId: reqData.planId,
        planLabel: reqData.planLabel,
        period: reqData.period ?? null,
        amount: reqData.amount,
      };

      tx.update(reqRef, {
        planId,
        planLabel: newPlanLabel,
        amount: newAmount,
        currency,
        maxProducts: newMaxProducts,
        period,
        transactionRef: null, // tout paiement antérieur devient invalide
        proofUrl: null,
        modifiedAt,
        modifiedFrom: previousSnapshot,
        updatedAt: modifiedAt,
      });

      const histRef = reqRef.collection(HISTORY_SUBCOLLECTION).doc();
      tx.set(histRef, {
        action: "modified",
        by: { userId: sellerId, role: "seller" },
        payload: {
          planId,
          planLabel: newPlanLabel,
          period,
          amount: newAmount,
          previous: previousSnapshot,
        },
        timestamp: modifiedAt,
      });
    });

    logger.info("[modify-subscription-request] modified", {
      requestId, sellerId, planId, period, newAmount,
    });

    return { ok: true, newAmount, newCurrency: currency, newPlanLabel };
  }
);

// Export interne pour les tests (non utilisé en prod runtime).
export { planIdFromLabel };
