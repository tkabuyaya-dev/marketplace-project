/**
 * NUNULIA — backfillBuyerRequestCounters (one-shot HTTP endpoint)
 *
 * Initialise uniqueSellerCount=0, isFull=false, updatedAt=now sur toutes
 * les demandes existantes qui n'ont pas encore ces champs. Sans cette
 * normalisation, la requête "demandes similaires"
 * (where isFull == false) ignorerait toutes les anciennes.
 *
 * Sécurité : protégé par NUNULIA_SECRET_TOKEN — appelable via :
 *   curl -X POST -H "Authorization: Bearer $TOKEN" .../backfillBuyerRequestCounters
 *
 * Pagination 500 docs par batch, idempotent (skip si déjà initialisé).
 * Safe à re-run.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const BATCH_SIZE = 500;

export const backfillBuyerRequestCounters = onRequest(
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

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    try {
      // Itération paginée par createdAt asc (stable) pour s'assurer qu'on
      // ne re-visite pas un doc déjà mis à jour avant la fin du run.
      while (true) {
        let q = db.collection("buyerRequests")
          .orderBy("createdAt", "asc")
          .limit(BATCH_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let inBatch = 0;
        snap.forEach((doc) => {
          scanned++;
          const data = doc.data();
          const hasUnique = typeof data.uniqueSellerCount === "number";
          const hasFull = typeof data.isFull === "boolean";
          if (hasUnique && hasFull) {
            skipped++;
            return;
          }
          batch.update(doc.ref, {
            uniqueSellerCount: hasUnique ? data.uniqueSellerCount : 0,
            isFull:            hasFull ? data.isFull : false,
            updatedAt:         data.updatedAt || Date.now(),
          });
          inBatch++;
          updated++;
        });
        if (inBatch > 0) await batch.commit();

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < BATCH_SIZE) break;
      }

      logger.info("[backfillBuyerRequestCounters] done", {
        scanned, updated, skipped, elapsedMs: Date.now() - startedAt,
      });
      res.json({
        ok: true, scanned, updated, skipped,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err: any) {
      logger.error("[backfillBuyerRequestCounters] failed", {
        err: err?.message, scanned, updated,
      });
      res.status(500).json({
        ok: false, message: err?.message || "internal error",
        scanned, updated, skipped,
      });
    }
  },
);
