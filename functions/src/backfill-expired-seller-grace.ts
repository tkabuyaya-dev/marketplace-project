/**
 * NUNULIA — backfillExpiredSellerGrace (one-shot HTTP endpoint)
 *
 * CONTEXTE (fix C1, 2026-06) :
 * Avant le fix, expireSellers Phase 2/3 interrogeaient les produits avec
 * status=="active" — valeur qu'aucun produit n'a jamais (les approuvés sont
 * "approved"). Résultat : les actions PRODUITS étaient des no-op, mais la
 * progression de phase sur le doc USER (downgradePhase 1→2→3) avançait quand
 * même. Conséquence à la mise en service du fix :
 *
 *   - Vendeurs déjà bloqués à downgradePhase=3 : plus jamais re-interrogés
 *     (Phase 2 lit ==1, Phase 3 lit ==2). Leurs produits resteraient visibles
 *     pour toujours → le fix ne les atteindrait jamais.
 *   - Vendeurs à downgradePhase=2 avec un vieux gracePhaseSince : au PREMIER
 *     run du cron post-fix, Phase 3 poserait deleteAt=now → suppression DURE
 *     immédiate (doc Firestore + images Cloudinary) sans nouvelle période de
 *     grâce ni rappel.
 *
 * CE QUE FAIT CE BACKFILL :
 * Ré-enrôle tous les vendeurs actuellement dans le pipeline de downgrade
 * (sellerDetails.downgradePhase >= 1) en repartant proprement :
 *   - downgradePhase            → 1   (recommence à la Phase 1)
 *   - gracePhaseSince           → now (horloge de grâce remise à zéro : J0)
 *   - reminderSent* (J7/J3/J1)  → null (les rappels d'expiration re-déclenchent)
 *
 * Ainsi, après le fix, chaque vendeur expiré obtient une fenêtre de grâce
 * complète J0→J3→J14 AVANT toute désactivation/suppression. Aucune suppression
 * surprise. À exécuter UNE FOIS, juste après le déploiement du fix C1.
 *
 * Sécurité : protégé par NUNULIA_SECRET_TOKEN — appelable via :
 *   curl -X POST -H "Authorization: Bearer $TOKEN" .../backfillExpiredSellerGrace
 *
 * Idempotent par nature : re-run = re-remise à zéro de l'horloge (sans danger,
 * repousse simplement le downgrade). Batches de 450.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const BATCH_LIMIT = 450;

export const backfillExpiredSellerGrace = onRequest(
  {
    region: "europe-west1",
    secrets: [NUNULIA_SECRET_TOKEN],
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "POST required" });
      return;
    }

    const db = await getDb();
    const startedAt = Date.now();
    const now = Date.now();

    try {
      // Tous les vendeurs actuellement engagés dans le downgrade (phase 1/2/3).
      // L'inégalité exclut nativement les docs sans le champ (jamais expirés).
      const snap = await db
        .collection("users")
        .where("sellerDetails.downgradePhase", ">=", 1)
        .get();

      let updated = 0;
      let batch = db.batch();
      let ops = 0;

      for (const doc of snap.docs) {
        batch.update(doc.ref, {
          "sellerDetails.downgradePhase": 1,
          "sellerDetails.gracePhaseSince": now,
          "sellerDetails.reminderSentForExpiry": null,
          "sellerDetails.reminderSentJ7": null,
          "sellerDetails.reminderSentJ3": null,
          "sellerDetails.reminderSentJ1": null,
        });
        ops++;
        updated++;
        if (ops >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();

      logger.info("[backfillExpiredSellerGrace] done", {
        scanned: snap.size,
        updated,
        elapsedMs: Date.now() - startedAt,
      });
      res.json({
        ok: true,
        scanned: snap.size,
        updated,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err: any) {
      logger.error("[backfillExpiredSellerGrace] failed", { err: err?.message });
      res.status(500).json({ ok: false, message: err?.message || "internal error" });
    }
  },
);
