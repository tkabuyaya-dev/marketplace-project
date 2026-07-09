/**
 * NUNULIA — Expire Sellers (HTTP) — déclencheur manuel de secours
 *
 * POST /expireSellers
 * Authorization: Bearer NUNULIA_SECRET_TOKEN
 *
 * Lot B (audit C2/I6) : la logique d'expiration vit désormais dans
 * `runSubscriptionLifecycle` (subscription-lifecycle.ts), exécutée par le
 * cron Firebase `subscriptionLifecycle` (02:00 UTC). Cet endpoint HTTP est
 * conservé comme déclencheur manuel/backup — le pipeline est idempotent,
 * un déclenchement en plus du schedule est sans effet de bord.
 *
 * À décommissionner (avec le cron externe qui l'appelle) après une release
 * de rodage du cron Firebase.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";
import { runSubscriptionLifecycle } from "./subscription-lifecycle.js";

export const expireSellers = onRequest(
  {
    maxInstances: 1,
    secrets: [NUNULIA_SECRET_TOKEN],
    region: "europe-west1",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      console.warn("[expireSellers] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const db = await getDb();
      const counts = await runSubscriptionLifecycle(db, "manual");
      res.json({
        success: true,
        message:
          `grace1: ${counts.grace1} | grace2: ${counts.grace2} | warned: ${counts.warned} | ` +
          `grace3: ${counts.grace3} | freed: ${counts.freed} | orphans: ${counts.orphansRejected}`,
        counts,
      });
    } catch (err: any) {
      console.error("[expireSellers] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);
