/**
 * NUNULIA — Scrub des données d'identité vendeur (one-shot).
 *
 * Contexte
 * --------
 * La collecte in-app de documents d'identité (CNI/NIF/registre) et de numéros
 * (cni, nif, registryNumber) a été supprimée (minimisation des données). Les
 * documents `users` existants contiennent encore ces champs, lisibles
 * publiquement (`allow read: if true` sur /users). Ce backfill les efface.
 *
 * Ce qu'il fait, par document `users` :
 *   - Préserve le badge : si `sellerDetails.nif` était non vide, force
 *     `sellerDetails.hasNif = true` (l'« Entreprise déclarée » reste visible).
 *   - Supprime `sellerDetails.cni`, `.nif`, `.registryNumber`, `.documents`.
 *
 * NB : les fichiers Cloudinary sous `aurabuja-app-2026/documents` ne sont PAS
 * supprimés ici (nécessite l'API admin Cloudinary). Après ce scrub, leurs URLs
 * ne sont plus référencées dans Firestore — purger le dossier via la console
 * Cloudinary pour effacer physiquement les scans.
 *
 * Sécurité
 * --------
 * - Endpoint HTTP protégé par Bearer token (NUNULIA_SECRET_TOKEN).
 * - Idempotent : skip les docs n'ayant aucun des champs ciblés.
 * - POST uniquement, maxInstances=1.
 *
 * Usage
 * -----
 *   curl -X POST -H "Authorization: Bearer $NUNULIA_SECRET_TOKEN" \
 *        https://europe-west1-<project>.cloudfunctions.net/scrubSellerDocuments
 *
 * À exécuter une seule fois après le déploiement de la minimisation NIF.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const PAGE_SIZE = 400;

export const scrubSellerDocuments = onRequest(
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
      logger.warn("[scrubSellerDocuments] Unauthorized request");
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
    let scrubbed = 0;
    let hasNifPreserved = 0;
    let skipped = 0;
    let errors = 0;
    const errorSample: Array<{ id: string; message: string }> = [];

    try {
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
          const sd = doc.data()?.sellerDetails;
          if (!sd) { skipped++; continue; }

          const hasTarget =
            "cni" in sd || "nif" in sd || "registryNumber" in sd || "documents" in sd;
          if (!hasTarget) { skipped++; continue; }

          try {
            const update: Record<string, any> = {
              "sellerDetails.cni":            FieldValue.delete(),
              "sellerDetails.nif":            FieldValue.delete(),
              "sellerDetails.registryNumber": FieldValue.delete(),
              "sellerDetails.documents":      FieldValue.delete(),
            };
            // Préserve le badge « Entreprise déclarée » si un NIF était renseigné.
            const hadNif = typeof sd.nif === "string" && sd.nif.trim().length > 0;
            if (hadNif && sd.hasNif !== true) {
              update["sellerDetails.hasNif"] = true;
              hasNifPreserved++;
            }
            batch.update(doc.ref, update);
            scrubbed++;
            writesInBatch++;
          } catch (err: any) {
            errors++;
            errorSample.push({ id: doc.id, message: err?.message || "unknown" });
          }
        }

        if (writesInBatch > 0) {
          await batch.commit();
          logger.info(`[scrubSellerDocuments] batch writes=${writesInBatch} scanned=${totalScanned}`);
        }

        lastDoc = snap.docs[snap.docs.length - 1] ?? null;
        if (snap.size < PAGE_SIZE) break;
      }

      const elapsedMs = Date.now() - startedAt;
      logger.info(
        `[scrubSellerDocuments] DONE scanned=${totalScanned} scrubbed=${scrubbed} hasNifPreserved=${hasNifPreserved} skipped=${skipped} errors=${errors} elapsed=${elapsedMs}ms`
      );

      res.json({ success: errors === 0, totalScanned, scrubbed, hasNifPreserved, skipped, errors, errorSample: errorSample.slice(0, 20), elapsedMs });
    } catch (err: any) {
      logger.error("[scrubSellerDocuments] Fatal:", err?.message, err?.stack);
      res.status(500).json({ success: false, message: err?.message || "internal error", totalScanned, scrubbed, errors });
    }
  }
);
