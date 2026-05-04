/**
 * NUNULIA — Reject Subscription Request (HTTP Cloud Function)
 *
 * POST /rejectSubscription
 * Authorization: Bearer <Firebase ID Token> (admin role required)
 * Body (JSON): { requestId: string, reason: string }
 *
 * - Marks subscriptionRequests/{requestId} as 'rejected' with the given reason
 * - Sends a notification to the seller
 * - Writes an audit log (admin SDK only — required by Firestore rules)
 *
 * Returns: { success: boolean, message: string }
 *
 * Idempotency: throws 409 if the request is not in a pending state.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getDb, getAuth } from "./admin.js";

const AUDIT_LOGS_COLLECTION = "auditLogs";
const SUBSCRIPTION_REQUESTS_COLLECTION = "subscriptionRequests";
const NOTIFICATIONS_COLLECTION = "notifications";

export const rejectSubscription = onRequest(
  {
    maxInstances: 5,
    region: "europe-west1",
  },
  async (req, res) => {
    // ── Auth check: verify Firebase ID token + admin role ──
    const authHeader = req.headers["authorization"] ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      res.status(401).json({ success: false, message: "Missing authorization token" });
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
        console.warn("[rejectSubscription] Caller is not admin:", decoded.uid);
        res.status(403).json({ success: false, message: "Forbidden: admin role required" });
        return;
      }
      adminUid = decoded.uid;
      adminEmail = decoded.email ?? callerSnap.data()?.email ?? "";
    } catch (authErr: any) {
      console.warn("[rejectSubscription] Token verification failed:", authErr?.message);
      res.status(401).json({ success: false, message: "Invalid or expired token" });
      return;
    }

    // ── Method check ──
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method Not Allowed" });
      return;
    }

    // ── Parse body ──
    const requestId: string | undefined = req.body?.requestId;
    const reasonRaw: string | undefined = req.body?.reason;
    if (!requestId || typeof requestId !== "string") {
      res.status(400).json({ success: false, message: "Missing or invalid requestId" });
      return;
    }
    const reason = (reasonRaw ?? "").trim();
    if (reason.length < 3) {
      res.status(400).json({ success: false, message: "Reason must be at least 3 characters" });
      return;
    }

    try {
      const db = await getDb();
      const requestRef = db.collection(SUBSCRIPTION_REQUESTS_COLLECTION).doc(requestId);

      // Transaction: rejet idempotent (no-op si déjà rejeté avec même raison)
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(requestRef);
        if (!snap.exists) {
          return { ok: false, code: 404, msg: "Demande introuvable" } as const;
        }
        const data = snap.data() as any;

        if (data.status === "rejected") {
          return { ok: true, alreadyRejected: true, data } as const;
        }
        if (data.status !== "pending" && data.status !== "pending_validation") {
          return { ok: false, code: 409, msg: `Demande non rejetable (status=${data.status})` } as const;
        }

        const previousValue = {
          status: data.status,
          transactionRef: data.transactionRef ?? null,
        };

        tx.update(requestRef, {
          status: "rejected",
          rejectionReason: reason,
          updatedAt: Date.now(),
        });

        return { ok: true, alreadyRejected: false, data, previousValue } as const;
      });

      if (!result.ok) {
        res.status(result.code).json({ success: false, message: result.msg });
        return;
      }

      const requestData = result.data;

      // ── Notification (best-effort) ──
      if (!result.alreadyRejected) {
        try {
          await db.collection(NOTIFICATIONS_COLLECTION).add({
            userId: requestData.userId,
            type: "subscription_change",
            title: "Demande d'abonnement refusée",
            body: `Votre demande pour le plan "${requestData.planLabel}" a été refusée. Raison : ${reason}`,
            read: false,
            createdAt: Date.now(),
          });
        } catch (notifErr: any) {
          console.warn("[rejectSubscription] Notification failed:", notifErr?.message);
        }
      }

      // ── Audit log (best-effort) ──
      if (!result.alreadyRejected) {
        try {
          await db.collection(AUDIT_LOGS_COLLECTION).add({
            action: "subscription_rejected",
            entityType: "subscription",
            entityId: requestId,
            adminId: adminUid,
            adminEmail,
            previousValue: result.previousValue,
            newValue: {
              status: "rejected",
              rejectionReason: reason,
              vendorId: requestData.userId,
              planLabel: requestData.planLabel,
              amount: requestData.amount,
              currency: requestData.currency,
            },
            timestamp: Date.now(),
          });
        } catch (auditErr: any) {
          console.warn("[rejectSubscription] Audit log write failed:", auditErr?.message);
        }
      }

      res.json({
        success: true,
        message: result.alreadyRejected
          ? "Demande déjà refusée (no-op)"
          : "Demande refusée avec succès",
      });
    } catch (err: any) {
      console.error("[rejectSubscription] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);
