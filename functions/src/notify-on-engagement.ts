/**
 * NUNULIA — User-initiated engagement notifications
 *
 * Crée des notifs in-app dans `/notifications` quand un user déclenche
 * une action d'engagement sur un produit :
 *   - Nouveau like → notifie le vendeur (sauf self-like)
 *   - Nouveau review → notifie le vendeur
 *
 * Pattern : trigger Firestore + read du produit pour récupérer sellerId
 * + addDoc notifications avec serverTimestamp() (apparaît dans la cloche).
 *
 * La CF onNotificationCreate (fcm-send.ts) suit derrière et envoie le
 * push système si le vendeur a un fcmToken enregistré. Pipeline unique.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";

type LikeData = {
  productId?: string;
  userId?: string;
};

type ReviewData = {
  productId?: string;
  userId?: string;
  userName?: string;
  rating?: number;
};

type ProductData = {
  sellerId?: string;
  title?: string;
  slug?: string;
};

// Récupère le sellerId + le titre + le slug du produit en 1 read.
async function getProductMeta(productId: string): Promise<ProductData | null> {
  if (!productId) return null;
  const db = await getDb();
  const snap = await db.collection("products").doc(productId).get();
  if (!snap.exists) return null;
  const d = snap.data() as ProductData;
  return { sellerId: d.sellerId, title: d.title, slug: d.slug };
}

// Récupère le nom de l'utilisateur qui a engagé (pour personnaliser la notif).
async function getUserName(userId: string): Promise<string> {
  if (!userId) return "Quelqu'un";
  const db = await getDb();
  const snap = await db.collection("users").doc(userId).get();
  if (!snap.exists) return "Quelqu'un";
  return (snap.data()?.name as string) || "Quelqu'un";
}

// ── Trigger : nouveau like ──────────────────────────────────────────────────
export const onLikeCreate = onDocumentCreated(
  { document: "likes/{likeId}", region: "europe-west1" },
  async (event) => {
    const like = event.data?.data() as LikeData | undefined;
    if (!like || !like.productId || !like.userId) return;

    const product = await getProductMeta(like.productId);
    if (!product || !product.sellerId) return;
    if (product.sellerId === like.userId) return; // self-like → skip

    const userName = await getUserName(like.userId);

    const db = await getDb();
    await db.collection("notifications").add({
      userId: product.sellerId,
      type: "system",
      title: "Nouveau favori 💛",
      body: `${userName} a ajouté "${product.title || "votre produit"}" à ses favoris.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      data: product.slug ? { productSlug: product.slug } : {},
    });
    console.log(`[notify-on-engagement] like → notif pour seller ${product.sellerId}`);
  },
);

// ── Trigger : nouveau review ────────────────────────────────────────────────
export const onReviewCreate = onDocumentCreated(
  { document: "reviews/{reviewId}", region: "europe-west1" },
  async (event) => {
    const review = event.data?.data() as ReviewData | undefined;
    if (!review || !review.productId || !review.userId) return;

    const product = await getProductMeta(review.productId);
    if (!product || !product.sellerId) return;
    if (product.sellerId === review.userId) return; // jamais self-review en principe, mais ceinture+bretelles

    const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(review.rating || 5))));
    const userName = review.userName || (await getUserName(review.userId));

    const db = await getDb();
    await db.collection("notifications").add({
      userId: product.sellerId,
      type: "system",
      title: `Nouvel avis ${stars}`,
      body: `${userName} a laissé un avis sur "${product.title || "votre produit"}".`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      data: product.slug ? { productSlug: product.slug } : {},
    });
    console.log(`[notify-on-engagement] review → notif pour seller ${product.sellerId}`);
  },
);
