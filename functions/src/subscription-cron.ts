/**
 * NUNULIA — Subscription Expiration Cron (Scheduled Cloud Function)
 *
 * Runs daily at 02:00 UTC (04:00 Bujumbura time).
 *
 * Step 1 — Auto-downgrade: paid subscriptions expired before `now` → reset to free tier
 *          + sends a "subscription_change" notification (acts as the J0 message).
 *
 * Step 2 — Pre-expiry reminders: 3 windows (J-7, J-3, J-1) — each sends exactly
 *          ONE notification per subscription cycle.
 *          Per-window dedup guards (independent so a vendor receives 1 notif per
 *          window without overlap):
 *            sellerDetails.reminderSentJ7  — set when J-7 sent
 *            sellerDetails.reminderSentJ3  — set when J-3 sent (also kept in
 *                                            legacy reminderSentForExpiry for
 *                                            backward-compatibility)
 *            sellerDetails.reminderSentJ1  — set when J-1 sent
 *          Each guard stores the exact subscriptionExpiresAt for which the
 *          reminder fired. After renewal the expiry value changes, so the next
 *          cycle always triggers fresh notifications.
 *
 * Step 3 — Auto-reject orphan requests: subscriptionRequests with
 *          status == 'pending' and createdAt older than 7 days are auto-rejected
 *          to keep the admin queue clean. These are vendors who clicked "Create
 *          request" but never returned to submit a transaction reference.
 *
 * Query design: range filters are applied to a single field at a time to stay
 * within Firestore's single-field auto-index. The `maxProducts > 5` filter
 * (paid-tier guard) is applied in application code after the fetch.
 *
 * Cost: ~$0.02/day for 10k sellers (1 + 3 queries + N atomic batch writes).
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTIONS = {
  USERS: "users",
  NOTIFICATIONS: "notifications",
  SUBSCRIPTION_REQUESTS: "subscriptionRequests",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const ORPHAN_REJECT_REASON =
  "Demande expirée : aucune référence de paiement reçue dans les 7 jours. Vous pouvez créer une nouvelle demande à tout moment.";

/** Configuration of pre-expiration reminder windows.
 *  Each window owns its own dedup guard field on sellerDetails so vendors
 *  receive ONE notification per window per subscription cycle. */
const REMINDER_WINDOWS = [
  { id: "J7", days: 7, guardField: "reminderSentJ7" },
  { id: "J3", days: 3, guardField: "reminderSentJ3" },
  { id: "J1", days: 1, guardField: "reminderSentJ1" },
] as const;

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

      // Downgrade to free tier — reset all reminder dedup guards so a future
      // renewal cycle restarts the J-7/J-3/J-1 sequence cleanly.
      batch.update(userDoc.ref, {
        "sellerDetails.maxProducts": 5,
        "sellerDetails.tierLabel": "Gratuit",
        "sellerDetails.subscriptionExpiresAt": null,
        "sellerDetails.reminderSentForExpiry": null, // legacy field
        "sellerDetails.reminderSentJ7": null,
        "sellerDetails.reminderSentJ3": null,
        "sellerDetails.reminderSentJ1": null,
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
    // Step 2 — Pre-expiry reminders (J-7, J-3, J-1)
    //
    // For each window, query subscriptionExpiresAt in (now + (N-1)d, now + N*d]
    // and send exactly one notification per cycle. Each window has its own
    // dedup guard so a vendor receives 3 separate notifications across the
    // 7 days leading to expiration (no overlap, no duplicates).
    // ─────────────────────────────────────────────────────────────────────────
    const remindedByWindow: Record<string, number> = {};

    for (const win of REMINDER_WINDOWS) {
      const windowStart = now + (win.days - 1) * DAY_MS;
      const windowEnd = now + win.days * DAY_MS;

      const winSnap = await db
        .collection(COLLECTIONS.USERS)
        .where("sellerDetails.subscriptionExpiresAt", ">", windowStart)
        .where("sellerDetails.subscriptionExpiresAt", "<=", windowEnd)
        .get();

      let reminded = 0;

      for (const userDoc of winSnap.docs) {
        const data = userDoc.data();
        const sellerDetails = data.sellerDetails ?? {};
        const maxProducts: number = sellerDetails.maxProducts ?? 0;
        const expiresAt: number = sellerDetails.subscriptionExpiresAt;
        const alreadyReminded: number | null = sellerDetails[win.guardField] ?? null;

        // Only paid-tier users
        if (maxProducts <= 5) continue;

        // Already notified for this exact expiry value in this window — skip
        if (alreadyReminded === expiresAt) continue;

        const daysLeft = Math.ceil((expiresAt - now) / DAY_MS);
        const tierLabel: string = sellerDetails.tierLabel ?? "payant";

        const batch = db.batch();

        const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
        batch.set(notifRef, {
          userId: userDoc.id,
          type: "subscription_reminder",
          title: `Abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
          body: `Votre plan "${tierLabel}" expire bientôt. Renouvelez maintenant pour garder tous vos produits visibles.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Atomically mark this window's guard. For J-3 we also write the
        // legacy `reminderSentForExpiry` so any old caller reading that field
        // still gets a coherent value.
        const update: Record<string, unknown> = {
          [`sellerDetails.${win.guardField}`]: expiresAt,
        };
        if (win.id === "J3") {
          update["sellerDetails.reminderSentForExpiry"] = expiresAt;
        }
        batch.update(userDoc.ref, update);

        await batch.commit();
        reminded++;
      }

      remindedByWindow[win.id] = reminded;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3 — Auto-reject orphan pending requests (>7 days, no transactionRef)
    //
    // Vendors who created a request but never submitted a payment reference.
    // We reject them so the admin queue stays focused on `pending_validation`.
    // The vendor receives a notification and can re-create a request anytime.
    // ─────────────────────────────────────────────────────────────────────────
    const orphanCutoff = now - SEVEN_DAYS_MS;

    const orphanSnap = await db
      .collection(COLLECTIONS.SUBSCRIPTION_REQUESTS)
      .where("status", "==", "pending")
      .where("createdAt", "<", orphanCutoff)
      .get();

    let orphansRejected = 0;

    for (const reqDoc of orphanSnap.docs) {
      const data = reqDoc.data();

      // Defensive: skip if a transactionRef exists (should be 'pending_validation'
      // already, but a stale write could leave the status mismatched).
      if (data.transactionRef) continue;

      const batch = db.batch();

      batch.update(reqDoc.ref, {
        status: "rejected",
        rejectionReason: ORPHAN_REJECT_REASON,
        updatedAt: now,
      });

      const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
      batch.set(notifRef, {
        userId: data.userId,
        type: "subscription_change",
        title: "Demande d'abonnement expirée",
        body: `Votre demande pour le plan "${data.planLabel}" a expiré (aucun paiement reçu). Vous pouvez en créer une nouvelle à tout moment.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      orphansRejected++;
    }

    console.log(
      `[checkSubscriptions] downgraded=${downgraded} ` +
      `remindedJ7=${remindedByWindow.J7 ?? 0} ` +
      `remindedJ3=${remindedByWindow.J3 ?? 0} ` +
      `remindedJ1=${remindedByWindow.J1 ?? 0} ` +
      `orphansRejected=${orphansRejected}`
    );
  }
);
