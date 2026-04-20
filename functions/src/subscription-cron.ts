/**
 * NUNULIA — Subscription Expiration Cron (Scheduled Cloud Function)
 *
 * Runs daily at 02:00 UTC (04:00 Bujumbura time).
 *
 * Step 1 — Auto-downgrade: paid subscriptions expired before `now` → reset to free tier
 *          + sends a "subscription_change" notification.
 *
 * Step 2 — J-3 reminder: paid subscriptions expiring in the next 3 days
 *          → sends exactly ONE "subscription_reminder" per subscription cycle.
 *          Dedup guard: `sellerDetails.reminderSentForExpiry` stores the exact
 *          `subscriptionExpiresAt` value for which the reminder was sent.
 *          After renewal the expiry changes, so the next cycle always triggers.
 *
 * Query design: range filters are applied to a single field at a time to stay
 * within Firestore's single-field auto-index. The `maxProducts > 5` filter
 * (paid-tier guard) is applied in application code after the fetch.
 *
 * Cost: ~$0.01/day for 10k sellers (1–2 queries + N atomic batch writes).
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTIONS = {
  USERS: "users",
  NOTIFICATIONS: "notifications",
} as const;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export const checkSubscriptions = onSchedule(
  {
    region: "europe-west1",
    schedule: "0 2 * * *", // 02:00 UTC daily
    timeZone: "UTC",
    retryCount: 1,
    maxInstances: 1,
  },
  async () => {
    const db = await getDb();
    const now = Date.now();

    // ────────────────────────────────────────────────────────��────────────────
    // Step 1 — Auto-downgrade expired paid subscriptions
    //
    // Query: subscriptionExpiresAt < now (single-field range — uses auto-index).
    // Guard: maxProducts > 5 filtered in code (avoids multi-inequality index).
    // ────────────────────────────────────────────────────────────��────────────
    const expiredSnap = await db
      .collection(COLLECTIONS.USERS)
      .where("sellerDetails.subscriptionExpiresAt", "<", now)
      .get();

    let downgraded = 0;

    for (const userDoc of expiredSnap.docs) {
      const data = userDoc.data();
      const maxProducts = data.sellerDetails?.maxProducts ?? 0;

      // Only process paid-tier users (free tier has maxProducts ≤ 5)
      if (maxProducts <= 5) continue;

      const batch = db.batch();

      // Downgrade to free tier
      batch.update(userDoc.ref, {
        "sellerDetails.maxProducts": 5,
        "sellerDetails.tierLabel": "Gratuit",
        "sellerDetails.subscriptionExpiresAt": null,
        "sellerDetails.reminderSentForExpiry": null, // reset for next cycle
      });

      // Expiration notification
      const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
      batch.set(notifRef, {
        userId: userDoc.id,
        type: "subscription_change",
        title: "Abonnement expiré",
        body: `Votre abonnement "${data.sellerDetails?.tierLabel ?? "payant"}" a expiré. Vous êtes revenu au plan Gratuit (5 produits max). Rendez-vous sur la page Plans pour renouveler.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      downgraded++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2 — J-3 reminder (exactly one per subscription cycle)
    //
    // Query: subscriptionExpiresAt in (now, now + 3 days] — same field, allowed.
    // Dedup: skip if reminderSentForExpiry === subscriptionExpiresAt (already sent
    //        for this cycle). After renewal the expiry value changes, so the guard
    //        clears automatically.
    // ─────────────────────────────────────────────────────────────────────────
    const windowEnd = now + THREE_DAYS_MS;

    const reminderSnap = await db
      .collection(COLLECTIONS.USERS)
      .where("sellerDetails.subscriptionExpiresAt", ">", now)
      .where("sellerDetails.subscriptionExpiresAt", "<=", windowEnd)
      .get();

    let reminded = 0;

    for (const userDoc of reminderSnap.docs) {
      const data = userDoc.data();
      const sellerDetails = data.sellerDetails ?? {};
      const maxProducts: number = sellerDetails.maxProducts ?? 0;
      const expiresAt: number = sellerDetails.subscriptionExpiresAt;
      const alreadyReminded: number | null = sellerDetails.reminderSentForExpiry ?? null;

      // Only paid-tier users
      if (maxProducts <= 5) continue;

      // Skip if a reminder was already sent for this exact expiry value
      if (alreadyReminded === expiresAt) continue;

      const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
      const tierLabel: string = sellerDetails.tierLabel ?? "payant";

      const batch = db.batch();

      // Reminder notification
      const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
      batch.set(notifRef, {
        userId: userDoc.id,
        type: "subscription_reminder",
        title: `Abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        body: `Votre plan "${tierLabel}" expire bientôt. Renouvelez maintenant pour garder tous vos produits visibles.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Mark reminder as sent for this subscription cycle (atomic with notification)
      batch.update(userDoc.ref, {
        "sellerDetails.reminderSentForExpiry": expiresAt,
      });

      await batch.commit();
      reminded++;
    }

    console.log(
      `[checkSubscriptions] downgraded=${downgraded} reminded=${reminded}`
    );
  }
);
