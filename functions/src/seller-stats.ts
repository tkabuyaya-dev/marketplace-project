/**
 * NUNULIA — getMyProductsActivity (Callable Cloud Function)
 *
 * Returns the last 30 days of activity (views, contacts, likes) for a seller's
 * own products.
 *
 * POURQUOI une Cloud Function plutôt qu'une lecture directe Firestore ?
 * - La règle Firestore sur `userActivity` autorise la lecture uniquement à
 *   l'auteur de l'événement (`resource.data.userId == request.auth.uid`).
 *   C'est volontaire — on ne veut pas qu'un vendeur découvre QUI a vu son
 *   produit. Mais ça empêche aussi le vendeur de voir l'activité agrégée
 *   sur ses propres produits (la dashboard "Statistiques" affichait 0 partout).
 * - Cette fonction tourne avec les droits admin SDK et :
 *   1. authentifie l'appelant (request.auth.uid)
 *   2. vérifie que CHAQUE productId appartient bien à l'appelant (sellerId)
 *   3. agrège l'activité des 30 derniers jours sans exposer les userId
 *      des viewers (réponse : { productId, action, createdAt } seulement)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";

const COLLECTION_PRODUCTS = "products";
const COLLECTION_ACTIVITY = "userActivity";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PRODUCT_IDS = 200;
const FIRESTORE_IN_LIMIT = 30;
const ACTIVITY_HARD_CAP = 5000; // safety net per call

interface RequestData {
  productIds: string[];
}

interface ActivityEntry {
  productId: string;
  action: string;
  createdAt: number;
}

export const getMyProductsActivity = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<{ entries: ActivityEntry[] }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data as RequestData;
    if (!Array.isArray(data?.productIds) || data.productIds.length === 0) {
      return { entries: [] };
    }
    if (data.productIds.length > MAX_PRODUCT_IDS) {
      throw new HttpsError(
        "invalid-argument",
        `Too many productIds (max ${MAX_PRODUCT_IDS}).`
      );
    }
    const ids = data.productIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (ids.length === 0) return { entries: [] };

    const db = await getDb();

    // ── 1. Verify ownership of every productId ──────────────────────────────
    // Batched 'in' queries — anything not returned is rejected (deleted or
    // not owned). Anything whose sellerId !== uid is rejected.
    const ownedIds = new Set<string>();
    for (let i = 0; i < ids.length; i += FIRESTORE_IN_LIMIT) {
      const batch = ids.slice(i, i + FIRESTORE_IN_LIMIT);
      const snap = await db
        .collection(COLLECTION_PRODUCTS)
        .where("__name__", "in", batch.map((id) => db.collection(COLLECTION_PRODUCTS).doc(id)))
        .get();
      snap.docs.forEach((d) => {
        if (d.data().sellerId === uid) ownedIds.add(d.id);
      });
    }
    if (ownedIds.size === 0) {
      logger.info("[getMyProductsActivity] No owned products in request", { uid, requested: ids.length });
      return { entries: [] };
    }

    // ── 2. Fetch activity for owned products only ───────────────────────────
    const sinceMs = Date.now() - THIRTY_DAYS_MS;
    const ownedArray = [...ownedIds];
    const entries: ActivityEntry[] = [];

    for (let i = 0; i < ownedArray.length; i += FIRESTORE_IN_LIMIT) {
      if (entries.length >= ACTIVITY_HARD_CAP) break;
      const batch = ownedArray.slice(i, i + FIRESTORE_IN_LIMIT);
      const remaining = ACTIVITY_HARD_CAP - entries.length;
      const snap = await db
        .collection(COLLECTION_ACTIVITY)
        .where("productId", "in", batch)
        .limit(remaining)
        .get();
      snap.docs.forEach((d) => {
        const docData = d.data();
        const ts: number = docData.createdAt?.toMillis?.() ?? 0;
        if (ts >= sinceMs) {
          entries.push({
            productId: docData.productId as string,
            action: docData.action as string,
            createdAt: ts,
          });
        }
      });
    }

    logger.info("[getMyProductsActivity] OK", {
      uid,
      requested: ids.length,
      owned: ownedIds.size,
      entries: entries.length,
    });

    return { entries };
  }
);
