/**
 * NUNULIA — Buyer Request → Matching sellers notification
 *
 * Quand un acheteur poste une demande "Je Cherche", on notifie tous les
 * vendeurs actifs dont la catégorie correspond et qui opèrent dans le
 * même pays. C'est le pendant offre/demande de la feature.
 *
 * Pipeline : addDoc dans /notifications → onNotificationCreate (fcm-send)
 * envoie le push système. Pas de duplication.
 *
 * Choix de design — query large pays puis filtre catégorie en mémoire :
 * - Évite un index composite avec arrayConfig:CONTAINS sur champ nested,
 *   dont le support reste plus fragile selon les régions Firestore.
 * - Coût Firestore acceptable : MAX_SELLERS_SCANNED plafond strict, et
 *   le set de vendeurs par pays reste petit à notre échelle (centaines).
 * - Permet de filtrer aussi sur isSuspended (pas indexable proprement).
 *
 * Plafond MAX_SELLERS_NOTIFIED = 50 pour éviter le spam (le trigger
 * FCM crée 1 push par notif → 50 sellers × 7 jours d'expiration de la
 * demande = OK, sous le quota multicast FCM).
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

const MAX_SELLERS_NOTIFIED = 50;
const MAX_SELLERS_SCANNED = 200;

type BuyerRequestData = {
  title?: string;
  category?: string | null;
  countryId?: string;
  buyerId?: string | null;
  buyerName?: string;
};

export const onBuyerRequestMatch = onDocumentCreated(
  { document: "buyerRequests/{requestId}", region: "europe-west1" },
  async (event) => {
    const req = event.data?.data() as BuyerRequestData | undefined;
    const requestId = event.params.requestId;
    if (!req) return;

    const category = (req.category || "").trim();
    const countryId = (req.countryId || "").trim();

    // Sans catégorie on ne sait pas qui cibler sans spammer tout le pays.
    if (!category || !countryId) {
      logger.info("[buyer-request-match] skip — catégorie ou pays manquant", {
        requestId,
        hasCategory: !!category,
        hasCountryId: !!countryId,
      });
      return;
    }

    const db = await getDb();

    const snap = await db
      .collection("users")
      .where("role", "==", "seller")
      .where("sellerDetails.countryId", "==", countryId)
      .limit(MAX_SELLERS_SCANNED)
      .get();

    const buyerId = req.buyerId || "";
    const matched: string[] = [];

    snap.forEach((doc) => {
      if (doc.id === buyerId) return;
      const d = doc.data() as { isSuspended?: boolean; sellerDetails?: { categories?: string[] } };
      if (d.isSuspended) return;
      const cats = d.sellerDetails?.categories || [];
      if (cats.includes(category)) matched.push(doc.id);
    });

    if (matched.length === 0) {
      logger.info("[buyer-request-match] aucun seller matching", {
        requestId,
        category,
        countryId,
        scanned: snap.size,
      });
      return;
    }

    const targets = matched.slice(0, MAX_SELLERS_NOTIFIED);
    const title = (req.title || "").trim() || "un produit";
    const buyerName = (req.buyerName || "").trim() || "Un acheteur";

    // Batch limit Firestore = 500 ops. MAX_SELLERS_NOTIFIED = 50 → 1 batch suffit.
    const batch = db.batch();
    const notifCol = db.collection("notifications");
    for (const sellerId of targets) {
      const ref = notifCol.doc();
      batch.set(ref, {
        userId: sellerId,
        type: "buyer_request_match",
        title: "Nouvelle demande dans votre catégorie 🔔",
        body: `${buyerName} cherche : ${title}`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        data: { link: "/demandes", buyerRequestId: requestId },
      });
    }
    await batch.commit();

    logger.info("[buyer-request-match] notifs créées", {
      requestId,
      category,
      countryId,
      scanned: snap.size,
      matched: matched.length,
      notified: targets.length,
    });
  },
);
