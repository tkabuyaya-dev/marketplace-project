/**
 * NUNULIA — User Activity Purge Cron (Scheduled Cloud Function)
 *
 * Runs daily at 04:00 UTC.
 * Deletes userActivity documents older than 90 days.
 *
 * Design notes:
 * - Firestore batch writes are limited to 500 ops; we loop until no docs remain.
 * - `createdAt` is a Firestore server Timestamp → use Timestamp.fromMillis() to compare.
 * - limit(500) per pass keeps memory usage flat regardless of collection size.
 * - Cost: ~$0.01/month for typical traffic (read + delete per old doc).
 * - The existing single-field index on `createdAt` (desc) covers this query.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import { Timestamp } from "firebase-admin/firestore";

const COLLECTION   = "userActivity";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const BATCH_SIZE   = 500;

export const purgeUserActivity = onSchedule(
  {
    region:       "europe-west1",
    schedule:     "0 4 * * *", // 04:00 UTC daily (06:00 Bujumbura)
    timeZone:     "UTC",
    retryCount:   1,
    maxInstances: 1,
  },
  async () => {
    const db        = await getDb();
    const cutoff    = Timestamp.fromMillis(Date.now() - RETENTION_MS);
    let totalDeleted = 0;

    while (true) {
      const snap = await db
        .collection(COLLECTION)
        .where("createdAt", "<", cutoff)
        .limit(BATCH_SIZE)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      totalDeleted += snap.size;
      console.log(`[purgeUserActivity] Deleted batch of ${snap.size} (total: ${totalDeleted})`);

      // If we got fewer than BATCH_SIZE, there are no more docs to purge
      if (snap.size < BATCH_SIZE) break;
    }

    console.log(`[purgeUserActivity] Done. Total deleted: ${totalDeleted}`);
  }
);
