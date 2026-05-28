/**
 * NUNULIA — FCM Push Sender (trigger Firestore)
 *
 * Architecture : on s'aligne sur la collection `notifications` déjà créée
 * par les flows métier (subscription approved, boost activated, buyer
 * request match, etc). À chaque nouveau doc, on lit les tokens FCM du
 * destinataire et on envoie un push à chaque device enregistré.
 *
 * Avantages :
 *   - Zéro changement chez les producteurs de notifs (createNotification()
 *     suffit, le push suit automatiquement).
 *   - Single source of truth : la cloche in-app et le push système restent
 *     synchrones (même titre, même body, même lien).
 *   - Pruning automatique des tokens invalides (UNREGISTERED, INVALID_ARGUMENT).
 *
 * Sécurité : utilise admin SDK → bypass des Firestore rules pour pouvoir
 * supprimer les tokens morts d'un autre user (le notif arrive pour `userId`,
 * c'est lui dont les tokens sont consultés/nettoyés — pas d'élévation de
 * privilège).
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getDb } from "./admin.js";

const PUBLIC_ORIGIN = "https://nunulia.com";

type NotifData = {
  userId?: string;
  title?: string;
  body?: string;
  type?: string;
  data?: { link?: string; productSlug?: string; sellerSlug?: string };
};

function resolveLink(notif: NotifData): string {
  const link = notif.data?.link;
  if (link) return link;
  if (notif.data?.productSlug) return `/product/${notif.data.productSlug}`;
  if (notif.data?.sellerSlug)  return `/shop/${notif.data.sellerSlug}`;
  return "/";
}

export const onNotificationCreate = onDocumentCreated(
  {
    document: "notifications/{notifId}",
    region: "europe-west1",
  },
  async (event) => {
    const notif = event.data?.data() as NotifData | undefined;
    if (!notif || !notif.userId) return;

    const db = await getDb();

    // 1) Lecture des tokens FCM du destinataire
    const tokensSnap = await db
      .collection("users")
      .doc(notif.userId)
      .collection("fcmTokens")
      .get();

    if (tokensSnap.empty) {
      console.log(`[fcm-send] No FCM tokens for user ${notif.userId} — skip.`);
      return;
    }

    const tokenDocs = tokensSnap.docs
      .map(d => ({ id: d.id, token: (d.data().token as string) || "" }))
      .filter(t => t.token.length > 20);

    if (tokenDocs.length === 0) return;

    // 2) Construction du payload — DATA-ONLY (pas de champ notification top-level).
    //
    // Pourquoi : le FCM Web SDK a un comportement instable sur Android Chrome
    // récent quand le payload contient à la fois `notification` ET `data`.
    // Symptôme : push acked par FCM (sent=1) mais jamais affiché par le SW.
    // Solution canonique recommandée par l'équipe Firebase : payload data-only
    // + affichage explicite via onBackgroundMessage dans firebase-messaging-sw.js.
    const link = resolveLink(notif);
    const message = {
      tokens: tokenDocs.map(t => t.token),
      data: {
        title: notif.title || "Nunulia",
        body:  notif.body  || "",
        link,
        type:  notif.type  || "system",
      },
      webpush: {
        // Urgency: high → bypass Doze mode Android, livraison immédiate.
        // TTL: 24h → on abandonne si device hors-ligne plus longtemps.
        headers: { Urgency: "high", TTL: "86400" },
        fcmOptions: { link: `${PUBLIC_ORIGIN}${link.startsWith("/") ? link : `/${link}`}` },
      },
      // Android (mobile natif — non utilisé ici mais utile si on ajoute Capacitor)
      android: { priority: "high" as const },
    };

    // 3) Envoi multicast
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging();

    let response;
    try {
      response = await messaging.sendEachForMulticast(message);
    } catch (err) {
      console.error("[fcm-send] sendEachForMulticast failed:", err);
      return;
    }

    console.log(
      `[fcm-send] user=${notif.userId} sent=${response.successCount}/${tokenDocs.length} failed=${response.failureCount}`,
    );

    // 4) Pruning des tokens invalides
    const stale: string[] = [];
    response.responses.forEach((res, i) => {
      if (res.success) return;
      const code = res.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        stale.push(tokenDocs[i].id);
      }
    });

    if (stale.length > 0) {
      const batch = db.batch();
      const base = db.collection("users").doc(notif.userId).collection("fcmTokens");
      stale.forEach(id => batch.delete(base.doc(id)));
      await batch.commit();
      console.log(`[fcm-send] Pruned ${stale.length} stale tokens for user ${notif.userId}.`);
    }
  },
);
