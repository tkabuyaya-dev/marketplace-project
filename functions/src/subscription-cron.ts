/**
 * NUNULIA — Subscription Expiration Cron (Scheduled Cloud Function)
 *
 * Runs daily at 02:00 UTC (04:00 Bujumbura time).
 * - Auto-downgrades expired paid subscriptions to free tier
 * - Sends J-3 expiration reminders
 *
 * Cost: ~$0.01/day for 10k sellers (1 query + N writes)
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTIONS = {
  USERS: "users",
  NOTIFICATIONS: "notifications",
} as const;

/**
 * Daily cron: downgrade expired subscriptions + send reminders
 * Schedule: every day at 02:00 UTC
 */
export const checkSubscriptions = onSchedule(
  {
    schedule: "0 2 * * *", // 02:00 UTC daily
    timeZone: "UTC",
    retryCount: 1,
    maxInstances: 1,
  },
  async () => {
    const db = await getDb();
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    // ── 1. Auto-downgrade expired paid users ──
    const expiredSnap = await db
      .collection(COLLECTIONS.USERS)
      .where("sellerDetails.subscriptionExpiresAt", "<", now)
      .where("sellerDetails.maxProducts", ">", 5) // Only paid tiers
      .get();

    let downgraded = 0;
    for (const doc of expiredSnap.docs) {
      const batch = db.batch();

      // Downgrade to free
      batch.update(doc.ref, {
        "sellerDetails.maxProducts": 5,
        "sellerDetails.tierLabel": "Gratuit",
        "sellerDetails.subscriptionExpiresAt": null,
      });

      // Create expiration notification
      const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
      batch.set(notifRef, {
        userId: doc.id,
        type: "subscription_change",
        title: "Abonnement expire",
        body: "Votre abonnement a expire. Vous etes revenu au plan Gratuit (5 produits max). Rendez-vous sur la page Plans pour renouveler.",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      downgraded++;
    }

    // ── 2. Send J-3 reminders ──
    const threeDaysFromNow = now + threeDaysMs;
    const reminderSnap = await db
      .collection(COLLECTIONS.USERS)
      .where("sellerDetails.subscriptionExpiresAt", ">", now)
      .where("sellerDetails.subscriptionExpiresAt", "<=", threeDaysFromNow)
      .where("sellerDetails.maxProducts", ">", 5)
      .get();

    let reminded = 0;
    for (const doc of reminderSnap.docs) {
      const data = doc.data();
      const expiresAt = data.sellerDetails?.subscriptionExpiresAt;
      const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

      const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
      await notifRef.set({
        userId: doc.id,
        type: "subscription_change",
        title: `Abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        body: `Votre plan "${data.sellerDetails?.tierLabel}" expire bientot. Renouvelez pour garder vos avantages.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      reminded++;
    }

    console.log(
      `[checkSubscriptions] ${downgraded} downgraded, ${reminded} reminded`
    );
  }
);
