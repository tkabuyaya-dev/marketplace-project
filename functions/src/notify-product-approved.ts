/**
 * NUNULIA — Notification "Produit approuvé"
 *
 * Trigger Firestore : déclenché sur chaque update de products/{id}.
 * Filtre : seulement quand status passe de 'pending' → 'approved'.
 *
 * Crée une notif in-app dans /notifications, qui à son tour fait remonter
 * le push FCM via onNotificationCreate (fcm-send.ts). Pipeline unique,
 * cohérent avec onLikeCreate / onReviewCreate.
 *
 * UX : le seller voit "🎉 Votre {title} est en ligne" → clic ouvre la fiche.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import * as logger from "firebase-functions/logger";

type ProductData = {
  sellerId?: string;
  title?: string;
  slug?: string;
  status?: string;
};

export const onProductApproved = onDocumentUpdated(
  { document: "products/{productId}", region: "europe-west1" },
  async (event) => {
    const before = event.data?.before?.data() as ProductData | undefined;
    const after = event.data?.after?.data() as ProductData | undefined;
    const productId = event.params.productId;

    if (!before || !after) return;
    // Filtre : seul le passage pending → approved nous intéresse.
    if (before.status === "approved") return;
    if (after.status !== "approved") return;
    if (!after.sellerId) return;

    const title = (after.title || "Votre produit").slice(0, 80);
    const slug = after.slug || productId;
    const link = `/product/${slug}`;

    const db = await getDb();
    await db.collection("notifications").add({
      userId: after.sellerId,
      type: "product_approved",
      title: "🎉 Votre annonce est en ligne",
      body: `"${title}" est désormais visible sur Nunulia. Touchez pour voir.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      data: { link, productSlug: slug },
    });

    logger.info("[notify-product-approved] notif créée", {
      productId,
      sellerId: after.sellerId,
      title: title.slice(0, 40),
    });
  },
);
