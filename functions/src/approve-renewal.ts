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
import { PLAN_FEATURES, PLAN_LABELS, planIdFromLabel, type PlanId } from "./plan-features.js";
import { loadBasePrices, periodToDurationMs, periodMultiplier } from "./pricing.js";
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
const DAY_MS = 24 * 60 * 60 * 1000;
const UPGRADE_CREDIT_CAP_DAYS = 90;

// Ordre des plans — un rang inférieur pendant un plan actif = downgrade (bloqué, D2).
const PLAN_RANK: Record<string, number> = { free: 0, vendeur: 1, pro: 2, grossiste: 3 };

/**
 * Lot A (C1) : point de départ de la nouvelle expiration.
 * Renouvellement du MÊME plan avec une expiration encore dans le futur
 * → on ÉTEND l'expiration courante (le vendeur qui paie à J-7 sur rappel
 * ne perd plus ses 7 jours). Upgrade/downgrade ou plan expiré → départ
 * de maintenant (le crédit prorata upgrade arrive au Lot C).
 */
function renewalBaseMs(
  currentTierLabel: unknown,
  currentExpiresAt: unknown,
  approvedPlanId: unknown,
  nowMs: number,
): number {
  const currentPlanId = planIdFromLabel(typeof currentTierLabel === "string" ? currentTierLabel : null);
  const samePlan = currentPlanId !== null && currentPlanId === approvedPlanId;
  if (samePlan && typeof currentExpiresAt === "number" && currentExpiresAt > nowMs) {
    return currentExpiresAt;
  }
  return nowMs;
}

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

  const { prices: basePrices, source } = await loadBasePrices(db, countryId);

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
      // Lot A (C1) : millisecondes de l'ancien cycle reportées sur le nouveau
      // (0 si plan expiré ou changement de plan). Tracé dans l'audit log.
      let carriedOverMs = 0;
      // Lot C (D1) : jours offerts lors d'un upgrade en cours de cycle
      // (valeur restante de l'ancien plan convertie au tarif du nouveau).
      let upgradeCreditDays = 0;

      if (requestId) {
        const reqRef = db.collection("subscriptionRequests").doc(requestId);

        // P5 : amount validation (hors transaction — c'est de la lecture seulement)
        // + grille mensuelle pour le crédit prorata upgrade (D1).
        let creditPrices: Record<string, number> | null = null;
        const reqSnapPreview = await reqRef.get();
        if (reqSnapPreview.exists) {
          const reqDataPreview = reqSnapPreview.data() ?? {};
          creditPrices = (await loadBasePrices(db, (reqDataPreview.countryId as string) || "bi")).prices;
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
              carriedOverMs: 0,
              upgradeCreditDays: 0,
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

          // Lot C (I1) : anti double-approbation. Si une AUTRE demande du même
          // vendeur a été approuvée pendant que celle-ci était ouverte, les
          // deux coexistaient → double paiement probable. On refuse (409) et
          // l'admin arbitre (rejet ou geste commercial).
          const recentReqsSnap = await tx.get(
            db.collection("subscriptionRequests")
              .where("userId", "==", vendorId)
              .orderBy("createdAt", "desc")
              .limit(30),
          );
          const conflicting = recentReqsSnap.docs.find(d => {
            if (d.id === requestId) return false;
            const r = d.data() as any;
            return r.status === "approved" && (r.updatedAt ?? 0) >= (reqData.createdAt ?? 0);
          });
          if (conflicting) {
            const other = conflicting.data() as any;
            return {
              ok: false as const,
              code: 409,
              msg: `Conflit : la demande "${other.planLabel}" de ce vendeur a déjà été approuvée ` +
                `pendant que celle-ci était ouverte (double paiement probable). ` +
                `Vérifiez le paiement puis rejetez cette demande ou contactez le vendeur.`,
            };
          }

          // Lecture du seller DANS la transaction (Lot A C1 / Lot C D1-D2).
          const sellerTxSnap = await tx.get(sellerRef);
          const sd = (sellerTxSnap.data() ?? {}).sellerDetails ?? {};
          const nowMs = Date.now();

          const currentPlanId = planIdFromLabel(typeof sd.tierLabel === "string" ? sd.tierLabel : null);
          const currentExpiresAt = typeof sd.subscriptionExpiresAt === "number" ? sd.subscriptionExpiresAt : null;
          const paidActive = currentPlanId !== null && currentPlanId !== "free"
            && (sd.maxProducts ?? 0) > 5
            && currentExpiresAt !== null && currentExpiresAt > nowMs;
          const approvedPlanId = (reqData.planId ?? null) as string | null;

          let baseMs = nowMs;
          let creditDays = 0;
          if (paidActive && approvedPlanId && PLAN_RANK[approvedPlanId] !== undefined) {
            const curRank = PLAN_RANK[currentPlanId as string] ?? 0;
            const newRank = PLAN_RANK[approvedPlanId];
            if (newRank < curRank) {
              // D2/I3 : downgrade volontaire bloqué tant qu'un plan supérieur est actif
              return {
                ok: false as const,
                code: 409,
                msg: `Downgrade bloqué : le vendeur a un plan "${sd.tierLabel}" actif jusqu'au ` +
                  `${new Date(currentExpiresAt as number).toLocaleDateString("fr-FR")}. ` +
                  `Le passage à un plan inférieur se fait à l'expiration — rejetez cette demande.`,
              };
            }
            if (newRank === curRank) {
              // C1 : renouvellement du même plan → extension de l'expiration
              baseMs = currentExpiresAt as number;
            } else {
              // D1/I2 : upgrade en cours de cycle → crédit prorata en jours,
              // arrondi supérieur, plafonné (valeur restante ÷ tarif du nouveau plan).
              const oldMonthly = creditPrices?.[currentPlanId as string];
              const newMonthly = creditPrices?.[approvedPlanId];
              if (typeof oldMonthly === "number" && oldMonthly > 0
                  && typeof newMonthly === "number" && newMonthly > 0) {
                const remainingDays = ((currentExpiresAt as number) - nowMs) / DAY_MS;
                creditDays = Math.min(
                  UPGRADE_CREDIT_CAP_DAYS,
                  Math.ceil(remainingDays * (oldMonthly / newMonthly)),
                );
              } else {
                // Fail-safe : pas de grille fiable → pas de crédit (jamais bloquant)
                console.warn(
                  `[approveRenewal] D1 credit skipped — pricing introuvable (${currentPlanId} → ${approvedPlanId})`
                );
              }
            }
          }

          const expiresAt = baseMs + periodToDurationMs(reqData.period) + creditDays * DAY_MS;
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
            "sellerDetails.subscriptionState": "active",
            "sellerDetails.maxProducts": maxProducts,
            "sellerDetails.tierLabel": tierLabel,
            "sellerDetails.subscriptionExpiresAt": expiresAt,
            "sellerDetails.reminderSentForExpiry": null,
            "sellerDetails.reminderSentJ7": null,
            "sellerDetails.reminderSentJ3": null,
            "sellerDetails.reminderSentJ1": null,
            "sellerDetails.gracePhaseSince": null,
            "sellerDetails.downgradePhase": null,
            "sellerDetails.graceWarnedAt": null,
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
              upgradeCreditDays: creditDays,
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
            carriedOverMs: baseMs - nowMs,
            upgradeCreditDays: creditDays,
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
        carriedOverMs = txResult.carriedOverMs;
        upgradeCreditDays = txResult.upgradeCreditDays;
        if (txResult.alreadyApproved) {
          console.log(`[approveRenewal] Idempotent — request ${requestId} already approved`);
        }
      } else {
        // ── Path "admin_manual" sans requestId ──────────────────────────────
        // Renouvellement forcé par l'admin (paiement reçu hors-app). Lot A :
        //   C3 — si `planId` est fourni, tierLabel/maxProducts sont restaurés :
        //        un vendeur déjà auto-downgradé retrouve le plan qu'il a payé.
        //   C1 — renouvellement du même plan → extension de l'expiration.
        // Sans planId (ancien front pendant la fenêtre de deploy) : ancien
        // comportement (status + expiry seulement), avec extension.
        const bodyPlanIdRaw = typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
        const manualPlanId: PlanId | null =
          bodyPlanIdRaw && bodyPlanIdRaw !== "free" && PLAN_FEATURES[bodyPlanIdRaw as PlanId]
            ? (bodyPlanIdRaw as PlanId)
            : null;
        const bodyPeriodRaw = typeof req.body?.period === "string" ? req.body.period : "1m";
        const manualPeriod = ["1m", "3m", "12m"].includes(bodyPeriodRaw) ? bodyPeriodRaw : "1m";

        const sd = (sellerSnap.data() ?? {}).sellerDetails ?? {};
        const nowMs = Date.now();
        // Sans planId explicite, la sémantique legacy est « renouveler le plan
        // courant » → on étend l'expiration courante quelle qu'elle soit.
        const baseMs = manualPlanId
          ? renewalBaseMs(sd.tierLabel, sd.subscriptionExpiresAt, manualPlanId, nowMs)
          : (typeof sd.subscriptionExpiresAt === "number" && sd.subscriptionExpiresAt > nowMs
              ? sd.subscriptionExpiresAt
              : nowMs);
        carriedOverMs = baseMs - nowMs;
        subscriptionExpiresAt = baseMs + periodToDurationMs(manualPeriod);

        const manualUpdate: Record<string, unknown> = {
          status: "active",
          "sellerDetails.subscriptionState": "active",
          "sellerDetails.subscriptionExpiresAt": subscriptionExpiresAt,
          "sellerDetails.reminderSentForExpiry": null,
          "sellerDetails.reminderSentJ7": null,
          "sellerDetails.reminderSentJ3": null,
          "sellerDetails.reminderSentJ1": null,
          "sellerDetails.gracePhaseSince": null,
          "sellerDetails.downgradePhase": null,
          "sellerDetails.graceWarnedAt": null,
        };
        if (manualPlanId) {
          resolvedTierLabel = PLAN_LABELS[manualPlanId];
          resolvedMaxProducts = PLAN_FEATURES[manualPlanId].maxProducts;
          manualUpdate["sellerDetails.tierLabel"] = resolvedTierLabel;
          manualUpdate["sellerDetails.maxProducts"] = resolvedMaxProducts;
        }
        await sellerRef.update(manualUpdate);
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
            carriedOverMs,
            upgradeCreditDays,
            verifiedVia,
            amountValidation: amountValidation ?? null,
          },
          timestamp: Date.now(),
        });
      } catch (auditErr: any) {
        console.warn("[approveRenewal] Audit log write failed:", auditErr?.message);
      }

      // ── Notification crédit upgrade (D1, best-effort) ───────────────────
      if (requestId && upgradeCreditDays > 0) {
        try {
          await db.collection("notifications").add({
            userId: vendorId,
            type: "subscription_change",
            title: "Crédit upgrade appliqué",
            body: `Votre plan ${resolvedTierLabel ?? ""} démarre avec ${upgradeCreditDays} jour(s) offert(s), issus du temps restant de votre ancien plan.`,
            read: false,
            createdAt: Date.now(),
          });
        } catch (creditNotifErr: any) {
          console.warn("[approveRenewal] Credit notification failed:", creditNotifErr?.message);
        }
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
            upgradeCreditDays,
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

      // ── Reactivate grace-deactivated products (Lot B, audit I7) ─────────
      // Seuls les produits masqués PAR LA GRÂCE (deactivatedBy:'grace') sont
      // republiés — les pauses manuelles du vendeur sont préservées (on leur
      // retire juste un éventuel deleteAt pour annuler la suppression).
      // Fallback transition : les vendeurs entrés en grâce AVANT le Lot B
      // (downgradePhase legacy sans subscriptionState) n'ont pas de marqueur
      // → comportement historique (tout réactiver), identique à avant.
      const wasLegacyGrace = !!sellerDetails.downgradePhase && !sellerDetails.subscriptionState;

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
          const p = productDoc.data();
          if (wasLegacyGrace || p.deactivatedBy === "grace") {
            batch.update(productDoc.ref, {
              status: "approved",
              deleteAt: FieldValue.delete(),
              deactivatedBy: FieldValue.delete(),
            });
            productCount++;
            batchOps++;
          } else if (p.deleteAt) {
            // Pause manuelle programmée pour suppression (grace_3) : on annule
            // la suppression sans republier le produit.
            batch.update(productDoc.ref, { deleteAt: FieldValue.delete() });
            batchOps++;
          } else {
            continue; // pause manuelle simple — on n'y touche pas
          }

          if (batchOps >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            batchOps = 0;
          }
        }

        if (batchOps > 0) await batch.commit();

        console.log(
          `[approveRenewal] ${productCount} grace product(s) of seller ${vendorId} → active (manual pauses preserved)`
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
