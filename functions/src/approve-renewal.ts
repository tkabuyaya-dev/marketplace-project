/**
 * NUNULIA — Approve Seller Renewal (HTTP Cloud Function) — Lot 4 P1+P5
 *
 * POST /approveRenewal
 * Authorization: Bearer <Firebase ID Token> (admin role required)
 * Body (JSON): {
 *   vendorId: string,
 *   requestId?: string,    // links the audit log to the source request
 *   verifiedVia?: string,  // payment method the admin verified against
 * }
 *
 * Fusion atomique (P1 du Lot 4) :
 *   Le seul appel admin pour valider une demande. Tout ce qui était partagé
 *   entre le client (`approveSubscriptionRequest`) et la CF est désormais
 *   fait ICI dans une transaction Firestore admin SDK :
 *     - Update subscriptionRequests/{id} : status='approved', approvedBy,
 *       expiresAt, reviewedAt, updatedAt
 *     - Update users/{uid}.sellerDetails : maxProducts, tierLabel,
 *       subscriptionExpiresAt, reset reminders/phases
 *     - Update users/{uid}.status : 'active'
 *     - Write subscriptionRequests/{id}/history/{eventId} : action='approved'
 *
 *   Plus hors transaction (best-effort, non bloquant) :
 *     - Audit log
 *     - Génération PDF Cloudinary + notification reçu
 *     - Réactivation produits inactive → active (batches)
 *
 * Validation montant côté serveur (P5 du Lot 4) :
 *   Le montant `request.amount` est recalculé depuis subscriptionPricing
 *   (override admin) ou DEFAULT_PRICING (fallback). Si écart > 1%, on logge
 *   un warning et on enrichit l'auditLog avec `amountValidation: {...}`.
 *   On NE bloque pas (l'admin peut avoir validé une remise manuelle), mais
 *   la trace est conservée pour post-mortem.
 *
 * Idempotence :
 *   - Si requestId fourni et déjà 'approved' → no-op (succès renvoyé)
 *   - Si vendorId seulement (admin manual renewal sans requestId) → comme avant
 *
 * Returns: { success: boolean, message: string, count: number, amountValidation?: object }
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { getDb, getAuth } from "./admin.js";
import { buildReceiptPdf, uploadPdfToCloudinary } from "./generate-receipt.js";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  ALLOWED_ORIGINS,
} from "./config.js";

const BATCH_LIMIT = 450;
const AUDIT_LOGS_COLLECTION = "auditLogs";
const HISTORY_SUBCOLLECTION = "history";

function periodToDurationMs(period?: string): number {
  if (period === '3m')  return 90  * 24 * 60 * 60 * 1000;
  if (period === '12m') return 365 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000; // default 1m
}

function periodMultiplier(period?: string): number {
  if (period === '3m')  return 3 * 0.9;    // -10%
  if (period === '12m') return 12 * 0.75;  // -25%
  return 1;
}

// Miroir minimal de DEFAULT_SUBSCRIPTION_PRICING (constants.ts).
// Sync à maintenir : toute modification frontend doit être appliquée ici.
const DEFAULT_PRICING: Record<string, { prices: Record<string, number>; currency: string }> = {
  bi: { prices: { vendeur: 9900,  pro: 29000, grossiste: 75000 }, currency: "BIF" },
  cd: { prices: { vendeur: 6000,  pro: 19000, grossiste: 42000 }, currency: "CDF" },
  rw: { prices: { vendeur: 2500,  pro: 7800,  grossiste: 17000 }, currency: "RWF" },
  tz: { prices: { vendeur: 4500,  pro: 15500, grossiste: 34000 }, currency: "TZS" },
  ke: { prices: { vendeur: 650,   pro: 2000,  grossiste: 5000   }, currency: "KES" },
  ug: { prices: { vendeur: 18500, pro: 55500, grossiste: 140000 }, currency: "UGX" },
};

interface AmountValidation {
  passed: boolean;
  expected: number;
  submitted: number;
  diffPct: number;
  source: 'override' | 'defaults' | 'no_pricing';
}

/**
 * Calcule le montant attendu pour un (countryId, planId, period) et compare
 * avec ce qui a été soumis par le vendeur. Tolérance : 1%.
 */
async function validateRequestAmount(
  db: FirebaseFirestore.Firestore,
  reqData: any,
): Promise<AmountValidation> {
  const submitted = typeof reqData.amount === 'number' ? reqData.amount : 0;
  const countryId = (reqData.countryId || 'bi') as string;
  const planId = (reqData.planId || '') as string;
  const period = (reqData.period || '1m') as string;

  // 1. Override admin Firestore prioritaire
  let basePrices: Record<string, number> | null = null;
  let source: AmountValidation['source'] = 'no_pricing';
  try {
    const overrideSnap = await db.collection('subscriptionPricing').doc(countryId).get();
    if (overrideSnap.exists) {
      basePrices = (overrideSnap.data() as any)?.prices ?? null;
      source = 'override';
    }
  } catch {
    // ignore
  }
  if (!basePrices) {
    const fallback = DEFAULT_PRICING[countryId];
    if (fallback) {
      basePrices = fallback.prices;
      source = 'defaults';
    }
  }

  if (!basePrices) {
    return { passed: false, expected: 0, submitted, diffPct: 0, source: 'no_pricing' };
  }

  const monthly = basePrices[planId];
  if (typeof monthly !== 'number' || monthly <= 0) {
    return { passed: false, expected: 0, submitted, diffPct: 0, source };
  }

  const expected = Math.round(monthly * periodMultiplier(period));
  const diffPct = expected === 0 ? 0 : Math.abs(submitted - expected) / expected;
  return { passed: diffPct <= 0.01, expected, submitted, diffPct, source };
}

export const approveRenewal = onRequest(
  {
    maxInstances: 5,
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
  },
  async (req, res) => {
    // ── Auth check: verify Firebase ID token + admin role ──
    const authHeader = req.headers["authorization"] ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      res.status(401).json({ success: false, message: "Missing authorization token", count: 0 });
      return;
    }
    let adminUid = "";
    let adminEmail = "";
    try {
      const adminAuth = await getAuth();
      const decoded = await adminAuth.verifyIdToken(idToken);
      const db = await getDb();
      const callerSnap = await db.collection("users").doc(decoded.uid).get();
      if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
        console.warn("[approveRenewal] Caller is not admin:", decoded.uid);
        res.status(403).json({ success: false, message: "Forbidden: admin role required", count: 0 });
        return;
      }
      adminUid = decoded.uid;
      adminEmail = decoded.email ?? callerSnap.data()?.email ?? "";
    } catch (authErr: any) {
      console.warn("[approveRenewal] Token verification failed:", authErr?.message);
      res.status(401).json({ success: false, message: "Invalid or expired token", count: 0 });
      return;
    }

    // ── Method check ──
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method Not Allowed", count: 0 });
      return;
    }

    // ── Parse body ──
    const vendorId: string | undefined = req.body?.vendorId;
    const requestId: string | undefined =
      typeof req.body?.requestId === "string" ? req.body.requestId : undefined;
    const verifiedViaRaw: string | undefined =
      typeof req.body?.verifiedVia === "string" ? req.body.verifiedVia.trim() : undefined;
    const verifiedVia = verifiedViaRaw && verifiedViaRaw.length > 0 ? verifiedViaRaw : null;
    if (!vendorId || typeof vendorId !== "string") {
      res.status(400).json({
        success: false,
        message: "Missing or invalid vendorId in request body.",
        count: 0,
      });
      return;
    }

    try {
      const db = await getDb();

      // ── Verify seller exists ──
      const sellerRef = db.collection("users").doc(vendorId);
      const sellerSnap = await sellerRef.get();

      if (!sellerSnap.exists) {
        res.status(404).json({
          success: false,
          message: `Seller ${vendorId} not found.`,
          count: 0,
        });
        return;
      }

      // ── Lot 4 P1+P5 : si requestId fourni, fusion atomique ──────────────
      // Replace l'ancien path "client transaction puis CF" par une seule
      // transaction admin SDK. P5 valide le montant côté serveur.
      // ────────────────────────────────────────────────────────────────────
      let subscriptionExpiresAt: number;
      let resolvedTierLabel: string | null = null;
      let resolvedMaxProducts: number | null = null;
      let reqDataAfterCommit: Record<string, any> = {};
      let amountValidation: AmountValidation | null = null;

      if (requestId) {
        const reqRef = db.collection("subscriptionRequests").doc(requestId);

        // P5 : amount validation (hors transaction — c'est de la lecture seulement)
        const reqSnapPreview = await reqRef.get();
        if (reqSnapPreview.exists) {
          const reqDataPreview = reqSnapPreview.data() ?? {};
          amountValidation = await validateRequestAmount(db, reqDataPreview);
          if (!amountValidation.passed) {
            console.warn(
              `[approveRenewal] P5 amount mismatch req=${requestId} ` +
              `expected=${amountValidation.expected} submitted=${amountValidation.submitted} ` +
              `diff=${(amountValidation.diffPct * 100).toFixed(2)}% source=${amountValidation.source} ` +
              `— approving anyway (admin override) but logging.`
            );
          }
        }

        // Transaction : tout en atomique sur request + user
        const txResult = await db.runTransaction(async (tx) => {
          const reqSnap = await tx.get(reqRef);
          if (!reqSnap.exists) {
            return { ok: false as const, code: 404, msg: "Demande introuvable" };
          }
          const reqData = reqSnap.data() as any;

          // Idempotence — déjà approuvée. On renvoie les valeurs déjà
          // persistées pour que le reste du code puisse continuer (audit log,
          // reçu PDF si manquant, réactivation produits).
          if (reqData.status === "approved") {
            const existingExpiresAt = typeof reqData.expiresAt === "number"
              ? reqData.expiresAt
              : Date.now() + periodToDurationMs(reqData.period);
            return {
              ok: true as const,
              alreadyApproved: true,
              reqData,
              expiresAt: existingExpiresAt,
              tierLabel: (reqData.planLabel as string) ?? "",
              maxProducts: (reqData.maxProducts as number) ?? 0,
            };
          }
          // Refus si déjà rejected ou cancelled (statut terminal)
          if (reqData.status === "rejected" || reqData.status === "cancelled") {
            return {
              ok: false as const,
              code: 409,
              msg: `Demande non approuvable (status=${reqData.status})`,
            };
          }

          const expiresAt = Date.now() + periodToDurationMs(reqData.period);
          const tierLabel = reqData.planLabel as string;
          const maxProducts = reqData.maxProducts as number;

          // 1. Mark request approved
          tx.update(reqRef, {
            status: "approved",
            approvedBy: adminUid,
            expiresAt,
            reviewedAt: Date.now(),
            updatedAt: Date.now(),
          });

          // 2. Activate seller in a single coherent write
          tx.update(sellerRef, {
            status: "active",
            "sellerDetails.maxProducts": maxProducts,
            "sellerDetails.tierLabel": tierLabel,
            "sellerDetails.subscriptionExpiresAt": expiresAt,
            "sellerDetails.reminderSentForExpiry": null,
            "sellerDetails.reminderSentJ7": null,
            "sellerDetails.reminderSentJ3": null,
            "sellerDetails.reminderSentJ1": null,
            "sellerDetails.gracePhaseSince": null,
            "sellerDetails.downgradePhase": null,
          });

          // 3. History event
          const histRef = reqRef.collection(HISTORY_SUBCOLLECTION).doc();
          tx.set(histRef, {
            action: "approved",
            by: { userId: adminUid, role: "admin" },
            payload: {
              planId: reqData.planId ?? null,
              planLabel: tierLabel,
              period: reqData.period ?? null,
              amount: reqData.amount ?? null,
              verifiedVia,
            },
            timestamp: Date.now(),
          });

          return {
            ok: true as const,
            alreadyApproved: false,
            reqData: { ...reqData, expiresAt, status: "approved" },
            expiresAt,
            tierLabel,
            maxProducts,
          };
        });

        if (!txResult.ok) {
          res.status(txResult.code).json({ success: false, message: txResult.msg, count: 0 });
          return;
        }

        reqDataAfterCommit = txResult.reqData;
        subscriptionExpiresAt = txResult.expiresAt;
        resolvedTierLabel = txResult.tierLabel;
        resolvedMaxProducts = txResult.maxProducts;
        if (txResult.alreadyApproved) {
          console.log(`[approveRenewal] Idempotent — request ${requestId} already approved`);
        }
      } else {
        // ── Path "admin_manual" sans requestId : flow legacy ────────────────
        // Renouvellement forcé par l'admin (vendeur sans demande active).
        // On garde l'ancien comportement : on calcule expiresAt = now + 30j et
        // on met le seller actif. Pas de transaction multi-doc requise.
        subscriptionExpiresAt = Date.now() + periodToDurationMs(undefined);
        await sellerRef.update({
          status: "active",
          "sellerDetails.subscriptionExpiresAt": subscriptionExpiresAt,
          "sellerDetails.reminderSentForExpiry": null,
          "sellerDetails.reminderSentJ7": null,
          "sellerDetails.reminderSentJ3": null,
          "sellerDetails.reminderSentJ1": null,
          "sellerDetails.gracePhaseSince": null,
          "sellerDetails.downgradePhase": null,
        });
      }

      console.log(
        `[approveRenewal] Seller ${vendorId} → active, subscriptionExpiresAt: ${new Date(subscriptionExpiresAt).toISOString()}`
      );

      // ── Audit log (best-effort, ne doit jamais bloquer l'approval) ──────
      const sellerData = sellerSnap.data() ?? {};
      const sellerDetails = sellerData.sellerDetails ?? {};
      try {
        await db.collection(AUDIT_LOGS_COLLECTION).add({
          action: "subscription_approved",
          entityType: "subscription",
          entityId: requestId ?? vendorId,
          adminId: adminUid,
          adminEmail,
          previousValue: null,
          newValue: {
            vendorId,
            requestId: requestId ?? null,
            tierLabel: resolvedTierLabel ?? sellerDetails.tierLabel ?? null,
            maxProducts: resolvedMaxProducts ?? sellerDetails.maxProducts ?? null,
            subscriptionExpiresAt,
            verifiedVia,
            amountValidation: amountValidation ?? null,
          },
          timestamp: Date.now(),
        });
      } catch (auditErr: any) {
        console.warn("[approveRenewal] Audit log write failed:", auditErr?.message);
      }

      // ── Generate PDF receipt + notify seller (best-effort) ──────────────
      if (requestId) {
        try {
          const reqData = reqDataAfterCommit;
          const pdfBytes = await buildReceiptPdf({
            receiptId:      requestId.slice(-8).toUpperCase(),
            vendorId,
            sellerName:     reqData.sellerName ?? sellerData.sellerDetails?.shopName ?? vendorId,
            sellerEmail:    undefined,
            planLabel:      reqData.planLabel ?? sellerDetails.tierLabel ?? "Abonnement",
            countryId:      reqData.countryId ?? sellerData.countryId ?? "bi",
            currency:       reqData.currency ?? "BIF",
            amount:         reqData.amount ?? 0,
            transactionRef: reqData.transactionRef ?? null,
            verifiedVia:    verifiedVia,
            approvedAt:     Date.now(),
            expiresAt:      subscriptionExpiresAt,
          });

          const publicId  = `receipt_${vendorId}_${Date.now()}`;
          const receiptUrl = await uploadPdfToCloudinary(
            pdfBytes,
            publicId,
            CLOUDINARY_CLOUD_NAME.value(),
            CLOUDINARY_API_KEY.value(),
            CLOUDINARY_API_SECRET.value(),
          );

          await db.collection("subscriptionRequests").doc(requestId).update({ receiptUrl });

          await db.collection("notifications").add({
            userId:    vendorId,
            type:      "subscription_receipt",
            title:     "Recu d'abonnement disponible",
            body:      `Votre abonnement ${reqData.planLabel ?? "NUNULIA"} est actif. Telechargez votre recu.`,
            read:      false,
            createdAt: Date.now(),
            data:      { receiptUrl },
          });

          console.log(`[approveRenewal] Receipt generated for request ${requestId}: ${receiptUrl}`);
        } catch (receiptErr: any) {
          console.warn("[approveRenewal] Receipt generation failed:", receiptErr?.message);
        }
      }

      // ── Reactivate inactive products (remove deleteAt) ──────────────────
      const productsSnap = await db
        .collection("products")
        .where("sellerId", "==", vendorId)
        .where("status", "==", "inactive")
        .get();

      let productCount = 0;

      if (!productsSnap.empty) {
        let batch = db.batch();
        let batchOps = 0;

        for (const productDoc of productsSnap.docs) {
          batch.update(productDoc.ref, {
            status: "active",
            deleteAt: FieldValue.delete(),
          });
          batchOps++;
          productCount++;

          if (batchOps >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            batchOps = 0;
          }
        }

        if (batchOps > 0) await batch.commit();

        console.log(
          `[approveRenewal] ${productCount} product(s) of seller ${vendorId} → active, deleteAt removed`
        );
      } else {
        console.log(`[approveRenewal] Seller ${vendorId}: no inactive products to reactivate.`);
      }

      res.json({
        success: true,
        message: `Seller ${vendorId} renewed. ${productCount} product(s) reactivated.`,
        count: productCount,
        amountValidation: amountValidation ?? null,
      });
    } catch (err: any) {
      console.error("[approveRenewal] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error", count: 0 });
    }
  }
);
