/**
 * NUNULIA — Deal Loop : confirmDeal (callable)
 *
 * Le vendeur répond à la question « Avez-vous vendu X ? » (Oui/Non) depuis le
 * dashboard. On enregistre la réponse sur le contactEvent et, si oui, on
 * incrémente sellerStats.confirmedSales (vente déclarée → GMV réel + trust).
 *
 * Sécurité : seul le vendeur destinataire (event.sellerUid) peut confirmer SES
 * ventes. Toute autre identité est refusée.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS } from "./config.js";

interface ConfirmDealData {
  eventId?: string;
  answer?: "yes" | "no";
}

export const confirmDeal = onCall<ConfirmDealData>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const eventId = (request.data?.eventId || "").trim();
    const answer = request.data?.answer;
    if (!eventId || (answer !== "yes" && answer !== "no")) {
      throw new HttpsError("invalid-argument", "Paramètres invalides.");
    }

    const db = await getDb();
    const ref = db.collection("contactEvents").doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Contact introuvable.");
    }
    const e = snap.data() as { sellerUid?: string; status?: string };

    // Seul le vendeur concerné peut confirmer.
    if (e.sellerUid !== uid) {
      throw new HttpsError("permission-denied", "Action non autorisée.");
    }

    const now = Date.now();
    await ref.update({
      status: answer === "yes" ? "confirmed_yes" : "confirmed_no",
      confirmedAt: now,
      confirmedBy: "seller",
      updatedAt: now,
    });

    if (answer === "yes") {
      // Collection isolée CF-only (le vendeur la lit, jamais ne l'écrit).
      try {
        await db.collection("sellerStats").doc(uid).set(
          { confirmedSales: FieldValue.increment(1), lastSaleAt: now },
          { merge: true },
        );
      } catch (err) {
        logger.warn("[confirmDeal] sellerStats increment failed (non-blocking)", {
          error: err instanceof Error ? err.message : String(err),
          uid,
        });
      }
    }

    logger.info("[confirmDeal] recorded", { eventId, answer, sellerUid: uid });
    return { ok: true };
  },
);
