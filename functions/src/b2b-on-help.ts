/**
 * NUNULIA — onB2bHelp (Cloud Function)
 *
 * Trigger : onCreate b2b_helps/{helpId}
 *
 * Atomicité :
 *   1. Transaction : b2b_posts/{postId}.helpCount += 1 (FieldValue.increment).
 *   2. Best-effort hors transaction (les 2 suivants peuvent retry sans casser
 *      la cohérence du compteur) :
 *      - users/{authorId}.b2bReputation += 0  (l'auteur ne gagne rien sur un help reçu)
 *      - users/{helperId}.b2bReputation += 1  (+1 pt pour le helper)
 *      - notifications/{id} : push "X peut vous aider"
 *
 * Pourquoi pas tout en transaction : la transaction Firestore se limite à
 * 500 docs en write, et impose que TOUS les reads précèdent les writes.
 * Garder helpCount transactionnel + le reste batch async est plus robuste.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

type B2BHelpData = {
  postId?: string;
  helperId?: string;
  helperName?: string;
};

export const onB2bHelp = onDocumentCreated(
  {
    document: "b2b_helps/{helpId}",
    region: "europe-west1",
    timeoutSeconds: 30,
  },
  async (event) => {
    const help = event.data?.data() as B2BHelpData | undefined;
    if (!help || !help.postId || !help.helperId) return;

    const db = await getDb();
    const postRef = db.collection("b2b_posts").doc(help.postId);

    // 1) Increment atomique du helpCount
    try {
      await postRef.update({
        helpCount: FieldValue.increment(1),
        updatedAt: Date.now(),
      });
    } catch (err) {
      logger.error("[b2b-on-help] increment helpCount failed", {
        postId: help.postId,
        err: (err as Error).message,
      });
      // Si le post n'existe plus (delete race), on s'arrête là.
      return;
    }

    // 2) Récupération de l'auteur pour la notif
    let authorId = "";
    let postSnippet = "";
    try {
      const postSnap = await postRef.get();
      if (!postSnap.exists) return;
      const postData = postSnap.data() as { authorId?: string; originalText?: string };
      authorId = postData.authorId || "";
      postSnippet = (postData.originalText || "").slice(0, 60);
    } catch (err) {
      logger.warn("[b2b-on-help] read post failed", { err: (err as Error).message });
    }

    // 3) Réputation +1 pour le helper (best-effort)
    try {
      await db.collection("users").doc(help.helperId).update({
        b2bReputation: FieldValue.increment(1),
      });
    } catch (err) {
      logger.warn("[b2b-on-help] reputation increment failed", {
        helperId: help.helperId,
        err: (err as Error).message,
      });
    }

    // 4) Notification → l'auteur du post (et donc push via onNotificationCreate)
    if (authorId && authorId !== help.helperId) {
      try {
        await db.collection("notifications").add({
          userId: authorId,
          type: "b2b_help_received",
          title: "Un vendeur peut vous aider 💪",
          body: `${help.helperName || "Un vendeur"} : ${postSnippet}…`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: { link: "/reseau", b2bPostId: help.postId },
        });
      } catch (err) {
        logger.warn("[b2b-on-help] notif create failed", { err: (err as Error).message });
      }
    }

    logger.info("[b2b-on-help] ok", {
      postId: help.postId,
      helperId: help.helperId,
      authorId,
    });
  },
);
