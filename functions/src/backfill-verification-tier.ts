/**
 * NUNULIA — Backfill `verificationTier` for existing verified sellers (one-shot).
 *
 * Contexte
 * --------
 * La v2 du système de vérification introduit un tier granulaire
 *   - `none`      : aucune vérification
 *   - `phone`     : (Phase 4, non utilisé actuellement)
 *   - `identity`  : review document à distance (badge ✓ bleu)
 *   - `shop`      : visite terrain (badge ★ or)
 *
 * Avant la migration, seul `isVerified: boolean` existait. Tous les comptes
 * `isVerified=true` sont remontés au tier `identity` (le plus neutre), et
 * reçoivent `verifiedAt` + `verificationMethod: 'document_review'` pour
 * alimenter le popover TrustScore et le badge.
 *
 * Sécurité
 * --------
 * - Endpoint HTTP protégé par Bearer token (NUNULIA_SECRET_TOKEN).
 * - Idempotent : ne touche pas les docs qui ont déjà `verificationTier`.
 * - Uniquement POST, max 540s, maxInstances=1.
 *
 * Usage
 * -----
 *   curl -X POST -H "Authorization: Bearer $NUNULIA_SECRET_TOKEN" \
 *        https://europe-west1-<project>.cloudfunctions.net/backfillVerificationTier
 *
 * À exécuter une seule fois après le déploiement des rules + types.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const PAGE_SIZE = 400;

export const backfillVerificationTier = onRequest(
  {
    region:         "europe-west1",
    secrets:        [NUNULIA_SECRET_TOKEN],
    maxInstances:   1,
    timeoutSeconds: 540,
    memory:         "512MiB",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      logger.warn("[backfillVerificationTier] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "POST required" });
      return;
    }

    const startedAt = Date.now();
    const db = await getDb();

    let totalScanned = 0;
    let promotedToIdentity = 0;
    let setToNone = 0;
    let skipped = 0;
    let errors = 0;
    const errorSample: Array<{ uid: string; message: string }> = [];

    try {
      // Streaming pagination: scanne toute la collection users par batch.
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q: FirebaseFirestore.Query = db.collection("users")
          .orderBy("__name__")
          .limit(PAGE_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);

        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let writesInBatch = 0;

        for (const doc of snap.docs) {
          totalScanned++;
          const data = doc.data();

          // Si le tier est déjà défini (migration partielle / déjà appliquée),
          // on skip.
          if (typeof data.verificationTier === "string") {
            skipped++;
            continue;
          }

          try {
            if (data.isVerified === true) {
              // Compte historiquement vérifié → identity (neutre, on ne peut pas
              // distinguer a posteriori si c'était un field visit ou review doc).
              batch.update(doc.ref, {
                verificationTier:    "identity",
                verifiedAt:          data.verifiedAt ?? FieldValue.serverTimestamp(),
                verificationMethod:  "document_review",
              });
              promotedToIdentity++;
              writesInBatch++;
            } else {
              // Tout le reste → none (explicite, au lieu de undefined).
              batch.update(doc.ref, { verificationTier: "none" });
              setToNone++;
              writesInBatch++;
            }
          } catch (err: any) {
            errors++;
            errorSample.push({ uid: doc.id, message: err?.message || "unknown" });
          }
        }

        if (writesInBatch > 0) {
          await batch.commit();
          logger.info(
            `[backfillVerificationTier] batch commit writes=${writesInBatch} scanned=${totalScanned}`
          );
        }

        lastDoc = snap.docs[snap.docs.length - 1] ?? null;
        if (snap.size < PAGE_SIZE) break;
      }

      const elapsedMs = Date.now() - startedAt;
      logger.info(
        `[backfillVerificationTier] DONE scanned=${totalScanned} identity=${promotedToIdentity} none=${setToNone} skipped=${skipped} errors=${errors} elapsed=${elapsedMs}ms`
      );

      res.json({
        success:             errors === 0,
        totalScanned,
        promotedToIdentity,
        setToNone,
        skipped,
        errors,
        errorSample:         errorSample.slice(0, 20),
        elapsedMs,
      });
    } catch (err: any) {
      logger.error("[backfillVerificationTier] Fatal:", err?.message, err?.stack);
      res.status(500).json({
        success:     false,
        message:     err?.message || "internal error",
        totalScanned,
        promotedToIdentity,
        setToNone,
        errors,
      });
    }
  }
);
