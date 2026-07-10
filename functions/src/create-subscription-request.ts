/**
 * NUNULIA — createSubscriptionRequest (Callable Cloud Function) — Lot D
 *
 * Remplace la création client directe (audit I4/A5) : le client ne fournit
 * plus QUE (planId, period) — tout le reste est calculé/vérifié serveur :
 *
 *   - Montant : grille partagée `pricing.ts` (override admin subscriptionPricing
 *     prioritaire, sinon defaults) × multiplicateur de période. Le champ
 *     `amount` devient impossible à manipuler côté client.
 *   - Rate-limit 60s : lu ET écrit serveur (sellerDetails.lastSubRequestCreatedAt)
 *     — plus de write-after best-effort contournable (A5).
 *   - Demande unique (I1) : refus si une demande pending/pending_validation
 *     existe déjà, tous plans confondus. Message FR affiché tel quel par le front.
 *   - Downgrade bloqué (D2/I3) : refus si le plan demandé est inférieur au
 *     plan payant actif (défense en profondeur — l'UI bloque déjà).
 *   - isUpgrade : dérivé serveur (plan payant non expiré).
 *   - Event history `created` : la traçabilité commence dès la création.
 *
 * Tout est fait dans UNE transaction (lectures user + demandes récentes,
 * puis écritures request + history + rate-limit) — deux appels concurrents
 * ne peuvent pas créer deux demandes ouvertes.
 *
 * Le document créé a EXACTEMENT la même forme que celui du flow client
 * historique (PlansPage / RenewSubscriptionModal / admin y sont insensibles).
 *
 * ⚠ Rules : `allow create` sur subscriptionRequests passe à `false` en même
 * temps que ce déploiement (seule modification de rules du plan, validée
 * explicitement — strictement plus restrictive, tests rules mis à jour).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";
import { PLAN_FEATURES, PLAN_LABELS, planIdFromLabel, type PlanId } from "./plan-features.js";
import { loadBasePrices, periodMultiplier, DEFAULT_PRICING } from "./pricing.js";

const REQUESTS_COLLECTION = "subscriptionRequests";
const HISTORY_SUBCOLLECTION = "history";
const USERS_COLLECTION = "users";
const RATE_LIMIT_MS = 60_000;

const VALID_PERIODS = new Set(["1m", "3m", "12m"]);
type Period = "1m" | "3m" | "12m";

// Aligné sur approve-renewal.ts / PlansPage (PLAN_RANK)
const PLAN_RANK: Record<string, number> = { free: 0, vendeur: 1, pro: 2, grossiste: 3 };

interface CreateData {
  planId: PlanId;
  period?: Period;
}

export const createSubscriptionRequest = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── Auth ─────────────────────────────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const sellerId = request.auth.uid;
    if (request.auth.token.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu — action impossible.");
    }

    // ── Input ────────────────────────────────────────────────────
    const data = request.data as CreateData;
    const planId = (data?.planId || "").trim() as PlanId;
    const period = ((data?.period || "1m") as string).trim() as Period;

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
    const userRef = db.collection(USERS_COLLECTION).doc(sellerId);
    const newReqRef = db.collection(REQUESTS_COLLECTION).doc();

    const result = await db.runTransaction(async (tx) => {
      // ── Lectures (toutes avant les écritures) ──────────────────
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("failed-precondition", "Profil introuvable.");
      }
      const user = userSnap.data() as any;
      if (user.role !== "seller" && user.role !== "admin") {
        throw new HttpsError("permission-denied", "Réservé aux vendeurs.");
      }
      const sd = user.sellerDetails ?? {};
      const nowMs = Date.now();

      // Rate-limit serveur (A5) — même seuil que l'ancienne rule (60s)
      const lastCreatedAt = typeof sd.lastSubRequestCreatedAt === "number" ? sd.lastSubRequestCreatedAt : 0;
      if (nowMs - lastCreatedAt < RATE_LIMIT_MS) {
        throw new HttpsError("resource-exhausted", "Veuillez patienter une minute avant de créer une nouvelle demande.");
      }

      // Demande unique (I1) — tous plans confondus
      const recentSnap = await tx.get(
        db.collection(REQUESTS_COLLECTION)
          .where("userId", "==", sellerId)
          .orderBy("createdAt", "desc")
          .limit(20),
      );
      const open = recentSnap.docs.find(d => {
        const s = (d.data() as any).status;
        return s === "pending" || s === "pending_validation";
      });
      if (open) {
        throw new HttpsError(
          "failed-precondition",
          "Vous avez déjà une demande en cours. Modifiez-la ou annulez-la avant d'en créer une nouvelle.",
        );
      }

      // Downgrade bloqué (D2/I3) + isUpgrade serveur
      const currentPlanId = planIdFromLabel(typeof sd.tierLabel === "string" ? sd.tierLabel : null);
      const currentExpiresAt = typeof sd.subscriptionExpiresAt === "number" ? sd.subscriptionExpiresAt : null;
      const paidActive = currentPlanId !== null && currentPlanId !== "free"
        && (sd.maxProducts ?? 0) > 5
        && currentExpiresAt !== null && currentExpiresAt > nowMs;
      if (paidActive && (PLAN_RANK[planId] ?? 0) < (PLAN_RANK[currentPlanId as string] ?? 0)) {
        throw new HttpsError(
          "failed-precondition",
          `Plan disponible à l'expiration de votre plan ${sd.tierLabel} ` +
          `(${new Date(currentExpiresAt as number).toLocaleDateString("fr-FR")}).`,
        );
      }
      const isUpgrade = paidActive;

      // Montant serveur (I4) — grille partagée, pays inconnu → grille bi
      const countryId = (sd.countryId as string) || "bi";
      const loaded = await loadBasePrices(db, countryId);
      const basePrices = loaded.prices ?? DEFAULT_PRICING.bi.prices;
      const currency = loaded.currency ?? DEFAULT_PRICING.bi.currency;
      const monthly = basePrices?.[planId];
      if (typeof monthly !== "number" || monthly <= 0) {
        throw new HttpsError("failed-precondition", "Pricing introuvable pour ce plan / pays.");
      }
      const amount = Math.round(monthly * periodMultiplier(period));

      // ── Écritures — document IDENTIQUE au flow client historique ──
      const requestDoc = {
        userId: sellerId,
        sellerName: (sd.shopName as string) || (user.name as string) || "Vendeur",
        countryId,
        planId,
        planLabel: PLAN_LABELS[planId],
        amount,
        currency,
        status: "pending",
        transactionRef: null,
        proofUrl: null,
        maxProducts: PLAN_FEATURES[planId].maxProducts,
        period,
        isUpgrade,
        approvedBy: null,
        expiresAt: null,
        rejectionReason: null,
        createdAt: nowMs,
        updatedAt: nowMs,
      };
      tx.set(newReqRef, requestDoc);

      const histRef = newReqRef.collection(HISTORY_SUBCOLLECTION).doc();
      tx.set(histRef, {
        action: "created",
        by: { userId: sellerId, role: "seller" },
        payload: { planId, planLabel: PLAN_LABELS[planId], period, amount },
        timestamp: nowMs,
      });

      // Rate-limit écrit serveur (plus de write-after client contournable)
      tx.update(userRef, { "sellerDetails.lastSubRequestCreatedAt": nowMs });

      return { requestId: newReqRef.id, amount, currency, planLabel: PLAN_LABELS[planId] };
    });

    logger.info("[create-subscription-request] created", {
      requestId: result.requestId, sellerId, planId, period, amount: result.amount,
    });

    return { ok: true, ...result };
  }
);
