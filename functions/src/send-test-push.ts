/**
 * NUNULIA — Test Push FCM (callable, page /fcm-debug)
 *
 * Permet à un utilisateur connecté de s'envoyer un push FCM réel sur
 * tous ses propres devices enregistrés. Sécurité naturelle : l'uid
 * provient de request.auth → impossible de spammer un autre user.
 *
 * Pattern aligné sur onNotificationCreate (data-only payload + SW
 * affichage via onBackgroundMessage) pour que le test reflète
 * VRAIMENT ce que voit le user en prod.
 *
 * Retour : { sent, failed, tokensCount, errors[] } — exposé sur la
 * page /fcm-debug pour diagnostic.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";

interface TestPushResult {
  sent: number;
  failed: number;
  tokensCount: number;
  errors: string[];
}

export const sendTestPush = onCall<unknown, Promise<TestPushResult>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const db = await getDb();
    const tokensSnap = await db
      .collection("users")
      .doc(uid)
      .collection("fcmTokens")
      .get();

    if (tokensSnap.empty) {
      return { sent: 0, failed: 0, tokensCount: 0, errors: ["NO_TOKEN_REGISTERED"] };
    }

    const tokenDocs = tokensSnap.docs
      .map((d) => ({ id: d.id, token: (d.data().token as string) || "" }))
      .filter((t) => t.token.length > 20);

    if (tokenDocs.length === 0) {
      return { sent: 0, failed: 0, tokensCount: 0, errors: ["INVALID_TOKENS"] };
    }

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    const message = {
      tokens: tokenDocs.map((t) => t.token),
      data: {
        title: "🧪 Test push Nunulia",
        body: `Si tu vois ce popup, le pipeline FCM marche ! (${timeStr})`,
        link: "/fcm-debug",
        type: "test",
      },
      webpush: {
        headers: { Urgency: "high", TTL: "60" },
        fcmOptions: { link: "https://nunulia.com/fcm-debug" },
      },
      android: { priority: "high" as const },
    };

    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging();

    let response;
    try {
      response = await messaging.sendEachForMulticast(message);
    } catch (err) {
      logger.error("[send-test-push] multicast failed", {
        uid, error: err instanceof Error ? err.message : String(err),
      });
      throw new HttpsError("internal", "FCM send failed.");
    }

    const errors = response.responses
      .filter((r) => !r.success)
      .map((r) => r.error?.code || "unknown_error")
      .slice(0, 10);

    logger.info("[send-test-push] result", {
      uid,
      sent: response.successCount,
      failed: response.failureCount,
      tokensCount: tokenDocs.length,
    });

    return {
      sent: response.successCount,
      failed: response.failureCount,
      tokensCount: tokenDocs.length,
      errors,
    };
  },
);
