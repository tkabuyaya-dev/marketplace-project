/**
 * NUNULIA — closeExpiredB2BPosts (cron quotidien)
 *
 * Schedule : 06:30 UTC chaque jour.
 *
 * Itère les posts open dont expiresAt est passé. Les ferme et applique
 * +2 pts de réputation à l'auteur (un post "résolu" — même par expiration
 * — démontre l'engagement). Plafonné à 500 posts par run pour rester sous
 * les quotas Firestore batch.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

const CLOSE_BATCH_SIZE = 500;
const REPUTATION_REWARD = 2;

export const closeExpiredB2BPosts = onSchedule(
  {
    schedule: "30 6 * * *",
    timeZone: "UTC",
    region: "europe-west1",
    timeoutSeconds: 300,
    retryCount: 1,
  },
  async () => {
    const db = await getDb();
    const now = Date.now();

    const snap = await db
      .collection("b2b_posts")
      .where("status", "==", "open")
      .where("expiresAt", "<=", now)
      .limit(CLOSE_BATCH_SIZE)
      .get();

    if (snap.empty) {
      logger.info("[b2b-close-expired] nothing to close");
      return;
    }

    const authorIds: string[] = [];
    const batch = db.batch();
    snap.forEach((doc) => {
      batch.update(doc.ref, {
        status: "closed",
        updatedAt: now,
      });
      const data = doc.data() as { authorId?: string };
      if (data.authorId) authorIds.push(data.authorId);
    });

    try {
      await batch.commit();
    } catch (err) {
      logger.error("[b2b-close-expired] batch commit failed", {
        err: (err as Error).message,
      });
      return;
    }

    // +2 pts de réputation à chaque auteur. Best-effort, sans transaction —
    // l'écart possible (-2 pts) reste négligeable et le coût de N updates
    // sous transaction n'en vaudrait pas le gain.
    const uniqueAuthors = Array.from(new Set(authorIds));
    await Promise.allSettled(
      uniqueAuthors.map((uid) =>
        db.collection("users").doc(uid).update({
          b2bReputation: FieldValue.increment(REPUTATION_REWARD),
        }),
      ),
    );

    logger.info("[b2b-close-expired] closed", {
      count: snap.size,
      uniqueAuthors: uniqueAuthors.length,
    });
  },
);
