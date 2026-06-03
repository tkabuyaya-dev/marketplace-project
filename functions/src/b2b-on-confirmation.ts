/**
 * NUNULIA — onB2bConfirmation (Cloud Function)
 *
 * Trigger : onCreate b2b_confirmations/{confirmId}
 *
 * Règles :
 *   - On incrémente confirmCount.
 *   - On ajoute confirmerCity (normalisée lowercase) dans uniqueCitiesConfirmed
 *     SI elle n'y est pas déjà, et que le tableau reste ≤ 10.
 *   - Quand uniqueCitiesConfirmed.length >= 3 ET isVerified=false :
 *       isVerified = true
 *       + push notif "✅ Votre signal est Validé par 3 villes" à l'auteur.
 *
 * Tout est transactionnel pour éviter les races (deux confirmateurs simultanés
 * de la même ville → on n'ajoute qu'une fois).
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

type ConfirmData = {
  postId?: string;
  confirmerId?: string;
  confirmerCity?: string;
};

const MAX_TRACKED_CITIES = 10;

function normalizeCity(c: string): string {
  return c.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export const onB2bConfirmation = onDocumentCreated(
  {
    document: "b2b_confirmations/{confirmId}",
    region: "europe-west1",
    timeoutSeconds: 30,
  },
  async (event) => {
    const conf = event.data?.data() as ConfirmData | undefined;
    if (!conf || !conf.postId) return;

    const db = await getDb();
    const postRef = db.collection("b2b_posts").doc(conf.postId);

    const city = normalizeCity(conf.confirmerCity || "");

    let becameVerified = false;
    let authorId = "";

    try {
      await db.runTransaction(async (tx) => {
        const postSnap = await tx.get(postRef);
        if (!postSnap.exists) return;
        const post = postSnap.data() as {
          authorId?: string;
          uniqueCitiesConfirmed?: string[];
          confirmCount?: number;
          isVerified?: boolean;
        };
        authorId = post.authorId || "";
        const cities = Array.isArray(post.uniqueCitiesConfirmed) ? post.uniqueCitiesConfirmed : [];
        const newCities = [...cities];
        if (city && !newCities.includes(city) && newCities.length < MAX_TRACKED_CITIES) {
          newCities.push(city);
        }
        const willVerify = !post.isVerified && newCities.length >= 3;
        becameVerified = willVerify;

        tx.update(postRef, {
          confirmCount: (post.confirmCount || 0) + 1,
          uniqueCitiesConfirmed: newCities,
          isVerified: willVerify ? true : post.isVerified === true,
          updatedAt: Date.now(),
        });
      });
    } catch (err) {
      logger.error("[b2b-on-confirmation] transaction failed", {
        postId: conf.postId,
        err: (err as Error).message,
      });
      return;
    }

    // Notif à l'auteur si on vient de passer "vérifié".
    if (becameVerified && authorId) {
      try {
        await db.collection("notifications").add({
          userId: authorId,
          type: "b2b_verified",
          title: "✅ Votre signal est validé",
          body: "Trois vendeurs de villes différentes ont confirmé votre signal.",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: { link: "/reseau", b2bPostId: conf.postId },
        });
      } catch (err) {
        logger.warn("[b2b-on-confirmation] notif failed", { err: (err as Error).message });
      }
    }

    logger.info("[b2b-on-confirmation] ok", {
      postId: conf.postId,
      becameVerified,
      city,
    });
  },
);
