/**
 * NUNULIA — Notif acheteur quand un vendeur répond à sa demande "Je Cherche"
 *
 * Boucle fermée : jusqu'ici le vendeur contactait l'acheteur sur WhatsApp
 * sans qu'aucune notification in-app/push n'existe côté acheteur. Ce trigger
 * comble le trou : à chaque doc `buyerRequestContacts/{id}` créé (transaction
 * respondToBuyerRequest côté client), on notifie l'acheteur.
 *
 * Pattern identique à notify-on-engagement.ts : trigger Firestore + addDoc
 * dans `notifications` avec serverTimestamp(). La CF onNotificationCreate
 * (fcm-send.ts) suit derrière et envoie le push système si l'acheteur a un
 * token FCM. Pipeline unique, aucune couche parallèle.
 *
 * Pourquoi une CF (admin SDK) : les rules n'autorisent pas un vendeur à
 * créer une notification pour un autre utilisateur (hors 'new_message').
 *
 * Cas ignorés silencieusement :
 *   - demande postée sans compte (buyerId absent) → pas de cloche possible
 *   - self-response (buyerId === sellerId)
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";

type ContactData = {
  requestId?: string;
  sellerId?: string;
};

export const onBuyerRequestContactCreate = onDocumentCreated(
  { document: "buyerRequestContacts/{contactId}", region: "europe-west1" },
  async (event) => {
    const contact = event.data?.data() as ContactData | undefined;
    if (!contact?.requestId || !contact.sellerId) return;

    const db = await getDb();

    const reqSnap = await db.collection("buyerRequests").doc(contact.requestId).get();
    if (!reqSnap.exists) return;
    const req = reqSnap.data() || {};
    const buyerId = (req.buyerId as string) || null;
    if (!buyerId) return;
    if (buyerId === contact.sellerId) return;

    const sellerSnap = await db.collection("users").doc(contact.sellerId).get();
    const seller = sellerSnap.exists ? sellerSnap.data() || {} : {};
    const shopName =
      ((seller.sellerDetails as { shopName?: string } | undefined)?.shopName) ||
      (seller.name as string) ||
      "Un vendeur";

    const reqTitle = ((req.title as string) || "").slice(0, 60);

    await db.collection("notifications").add({
      userId: buyerId,
      type: "buyer_request_response",
      title: "Un vendeur va vous contacter 🤝",
      body: reqTitle
        ? `${shopName} a répondu à votre demande « ${reqTitle} ». Surveillez votre WhatsApp !`
        : `${shopName} a répondu à votre demande. Surveillez votre WhatsApp !`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      data: { link: "/demandes" },
    });
    console.log(
      `[notify-buyer-on-contact] seller ${contact.sellerId} → notif buyer ${buyerId} (req ${contact.requestId})`,
    );
  },
);
