/**
 * NUNULIA — Photo Studio Expiration Cron
 *
 * Tourne chaque jour à 06:00 UTC (= 08:00 Bujumbura/Kigali).
 * - Marque comme `expired` les sessions dont `expiresAt < now` et qui sont
 *   encore dans un état actif (waiting_photos / processing / ready).
 * - Les sessions `published` ne sont JAMAIS expirées (la publication est
 *   définitive et clôture le cycle).
 *
 * Schedule (06:00 UTC quotidien) :
 *   - Décalé d'une heure après le cron buyer requests (03:00 UTC) pour
 *     éviter une fenêtre de charge concentrée.
 *   - 08:00 heure locale Burundi/Rwanda = encore tôt → minimise le risque
 *     qu'un vendeur ouvre l'app au même moment que le batch.
 *
 * Côut estimé : ~$0,001/jour (1 query + N updates batch ≤500).
 *
 * Future evolution : ajouter une étape de purge Cloudinary des photos
 * traitées des sessions expirées depuis plus de 7 jours et non publiées
 * (pour libérer du storage). Pour V1 on garde — le coût est marginal.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";
import * as logger from "firebase-functions/logger";

const COLLECTION = "photoSessions";
// Tous les status actifs (non terminaux) — published et déjà expired exclus
const ACTIVE_STATUSES = ["waiting_photos", "processing", "ready"];
const BATCH_LIMIT = 500;

export const expirePhotoSessions = onSchedule(
  { schedule: "0 6 * * *", timeZone: "UTC", region: "europe-west1" },
  async () => {
    const db = await getDb();
    const now = Date.now();
    let totalExpired = 0;

    // On boucle sur chaque status actif pour respecter les index Firestore
    // existants : on a un index composite (status, expiresAt ASC). Faire
    // `where status in [...]` forcerait un index multi-IN différent.
    for (const status of ACTIVE_STATUSES) {
      const snap = await db
        .collection(COLLECTION)
        .where("status", "==", status)
        .where("expiresAt", "<", now)
        .limit(BATCH_LIMIT)
        .get();

      if (snap.empty) continue;

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, { status: "expired", expiredAt: now });
        // On ne crée PAS de sub-event "expired" en batch (limite 500 ops,
        // doublerait la taille). Pour l'audit, le `expiredAt` au niveau du
        // doc principal suffit. Les events restent pour les transitions
        // déclenchées par humain.
      });
      await batch.commit();
      totalExpired += snap.size;

      logger.info("[expirePhotoSessions] expired batch", {
        status,
        count: snap.size,
      });
    }

    if (totalExpired === 0) {
      logger.info("[expirePhotoSessions] no sessions to expire");
    } else {
      logger.info("[expirePhotoSessions] done", { totalExpired });
    }
  },
);
