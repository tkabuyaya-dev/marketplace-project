/**
 * NUNULIA — photoSessionPublish (Callable, vendeur)
 *
 * Le vendeur publie son produit depuis /studio/:sessionId. La CF :
 *   1. Vérifie auth + ownership (request.auth.uid == session.vendorId)
 *   2. Vérifie l'état (session.status === 'ready', non expirée)
 *   3. Valide les champs du formulaire (titre, prix, catégorie, description)
 *   4. Re-vérifie le quota produits du plan (canCreateProduct équivalent)
 *      + le cooldown 20s (anti-burst)
 *   5. Transaction atomique :
 *        - Création products/{productId} avec viaStudio: true + photoSessionId
 *        - Update session → status='published', publishedProductId, publishedAt
 *        - Update user → productCount +1, lastProductCreatedAt
 *        - Write event 'published' dans la sub-collection
 *   6. Retourne {productId, productSlug, status: 'pending'}
 *
 * Pourquoi cette CF et pas le helper addProduct() côté front :
 *   - Garantir l'atomicité publication ↔ fermeture session (un produit Studio
 *     ne peut pas exister sans clôturer sa session, et inversement)
 *   - Empêcher la double publication (idempotence stricte : session.status
 *     est checké dans la transaction → bascule sous verrou)
 *   - Réutiliser les checks de subscription côté serveur (bypass des rules
 *     n'est PAS un bypass de la logique métier — on la ré-implémente)
 *
 * Le produit créé respecte EXACTEMENT le schéma utilisé par addProduct()
 * côté front : tous les champs dénormalisés (sellerName, sellerShopName,
 * sellerWhatsapp, etc.) pour rester compatible avec ProductCard, Algolia
 * sync, recommendations, etc.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";
import { isValidSessionId } from "./session-id.js";

const COLLECTION = "photoSessions";
const PRODUCTS_COLLECTION = "products";
const USERS_COLLECTION = "users";
const COOLDOWN_MS = 20_000;       // aligné avec firestore.rules canCreateProduct
const FREE_TIER_LIMIT = 5;        // aligné avec PLAN_FEATURES.free.maxProducts

interface PublishInput {
  sessionId?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
  subCategory?: string;
  condition?: "new" | "good" | "fair";
  originalPrice?: number;
  isWholesale?: boolean;
  minOrderQuantity?: number;
  wholesalePrice?: number;
}

interface PublishOutput {
  ok: true;
  productId: string;
  productSlug: string;
  status: "pending";
}

/** Slugify minimal — miroir de utils/slug.ts côté front. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

function generateUniqueSlug(title: string): string {
  const base = slugify(title);
  // 4 chars random — suffisamment pour éviter les collisions en pratique.
  const suffix = Math.random().toString(36).substring(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}

/** Validation stricte des champs requis pour la publication. */
function validateInput(data: PublishInput): {
  title: string;
  description: string;
  price: number;
  category: string;
  subCategory: string;
  condition: "new" | "good" | "fair" | null;
  currency: string | null;
  originalPrice: number | null;
  isWholesale: boolean;
  minOrderQuantity: number | null;
  wholesalePrice: number | null;
} {
  const title = (data.title || "").trim();
  if (title.length < 3 || title.length > 200) {
    throw new HttpsError("invalid-argument", "Titre invalide (3-200 caractères).");
  }
  const description = (data.description || "").trim();
  if (description.length < 10 || description.length > 5000) {
    throw new HttpsError("invalid-argument", "Description invalide (10-5000 caractères).");
  }
  const price = data.price;
  if (typeof price !== "number" || !isFinite(price) || price < 0 || price > 999_999_999) {
    throw new HttpsError("invalid-argument", "Prix invalide.");
  }
  const category = (data.category || "").trim();
  if (category.length < 2 || category.length > 80) {
    throw new HttpsError("invalid-argument", "Catégorie invalide.");
  }
  const subCategory = (data.subCategory || "").trim().slice(0, 80);

  const condition = data.condition && ["new", "good", "fair"].includes(data.condition)
    ? data.condition
    : null;

  const currency = typeof data.currency === "string"
    && data.currency.trim().length >= 2
    && data.currency.trim().length <= 10
      ? data.currency.trim().toUpperCase()
      : null;

  const originalPrice = typeof data.originalPrice === "number"
    && isFinite(data.originalPrice)
    && data.originalPrice >= 0
    && data.originalPrice <= 999_999_999
      ? data.originalPrice
      : null;

  const isWholesale = data.isWholesale === true;
  const minOrderQuantity = isWholesale
    && typeof data.minOrderQuantity === "number"
    && isFinite(data.minOrderQuantity)
    && data.minOrderQuantity >= 1
    && data.minOrderQuantity <= 999_999
      ? Math.floor(data.minOrderQuantity)
      : null;
  const wholesalePrice = isWholesale
    && typeof data.wholesalePrice === "number"
    && isFinite(data.wholesalePrice)
    && data.wholesalePrice >= 0
    && data.wholesalePrice <= 999_999_999
      ? data.wholesalePrice
      : null;

  return {
    title, description, price, category, subCategory, condition, currency,
    originalPrice, isWholesale, minOrderQuantity, wholesalePrice,
  };
}

export const photoSessionPublish = onCall<PublishInput, Promise<PublishOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    maxInstances: 20,
    timeoutSeconds: 30,
  },
  async (request) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    if (request.auth?.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu.");
    }

    // ── 2. Validation input ─────────────────────────────────────────────
    const sessionId = (request.data?.sessionId || "").trim().toUpperCase();
    if (!isValidSessionId(sessionId)) {
      throw new HttpsError("invalid-argument", "sessionId invalide.");
    }
    const valid = validateInput(request.data || {});

    const db = await getDb();
    const sessionRef = db.collection(COLLECTION).doc(sessionId);
    const userRef = db.collection(USERS_COLLECTION).doc(uid);

    // ── 3. Lecture pré-transaction (session + user) ─────────────────────
    const [sessionSnap, userSnap] = await Promise.all([
      sessionRef.get(),
      userRef.get(),
    ]);
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session introuvable.");
    }
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Profil vendeur introuvable.");
    }
    const session = sessionSnap.data()!;
    const user = userSnap.data()!;

    // Ownership strict
    if (session.vendorId !== uid) {
      throw new HttpsError("permission-denied", "Cette session ne vous appartient pas.");
    }
    // État valide pour publication
    const status = session.status as string;
    if (status === "published") {
      throw new HttpsError("failed-precondition", "Produit déjà publié.");
    }
    if (status === "expired") {
      throw new HttpsError("failed-precondition", "Session expirée.");
    }
    if (status !== "ready") {
      throw new HttpsError(
        "failed-precondition",
        `Session pas encore prête (état actuel: ${status}).`,
      );
    }
    // Expiration race protection
    if (typeof session.expiresAt === "number" && session.expiresAt < Date.now()) {
      throw new HttpsError("failed-precondition", "Session expirée.");
    }
    // Photos obligatoires
    const processedUrls = session.processedUrls;
    if (!Array.isArray(processedUrls) || processedUrls.length === 0) {
      throw new HttpsError("failed-precondition", "Aucune photo traitée disponible.");
    }

    // ── 4. Subscription / quota check (défense en profondeur, mirror addProduct) ─
    const sellerDetails = (user.sellerDetails as Record<string, unknown>) || {};
    const maxProducts = typeof sellerDetails.maxProducts === "number"
      ? (sellerDetails.maxProducts as number)
      : FREE_TIER_LIMIT;
    const subExpiresAt = typeof sellerDetails.subscriptionExpiresAt === "number"
      ? (sellerDetails.subscriptionExpiresAt as number)
      : 0;
    const isPaidTier = maxProducts > FREE_TIER_LIMIT;
    const effectiveLimit = (isPaidTier && subExpiresAt > 0 && Date.now() > subExpiresAt)
      ? FREE_TIER_LIMIT
      : maxProducts;

    // Count active products (approved + pending) — alignement avec addProduct front
    const activeQuery = await db
      .collection(PRODUCTS_COLLECTION)
      .where("sellerId", "==", uid)
      .where("status", "in", ["approved", "pending"])
      .get();
    const activeCount = activeQuery.size;

    if (activeCount >= effectiveLimit) {
      throw new HttpsError(
        "resource-exhausted",
        isPaidTier && subExpiresAt > 0 && Date.now() > subExpiresAt
          ? "Votre abonnement a expiré. Renouvelez votre plan pour publier plus de produits."
          : `Limite de produits atteinte (${effectiveLimit} max).`,
      );
    }

    // Cooldown 20s (alignement avec firestore.rules canCreateProduct)
    const lastProductCreatedAt = typeof user.lastProductCreatedAt === "number"
      ? (user.lastProductCreatedAt as number)
      : 0;
    if (Date.now() - lastProductCreatedAt < COOLDOWN_MS) {
      throw new HttpsError(
        "resource-exhausted",
        "Trop rapide. Attendez quelques secondes avant de réessayer.",
      );
    }

    // ── 5. Préparation du payload produit (mirror exact d'addProduct front) ─
    const productId = db.collection(PRODUCTS_COLLECTION).doc().id;
    const slug = generateUniqueSlug(valid.title);
    const now = Date.now();
    const productRef = db.collection(PRODUCTS_COLLECTION).doc(productId);

    // Snake-case toutes les valeurs dénormalisées pour rester cohérent avec
    // services/firebase/products.ts addProduct().
    const productPayload: Record<string, unknown> = {
      title:                  valid.title,
      slug,
      titleLower:             valid.title.toLowerCase(),
      price:                  valid.price,
      originalPrice:          valid.originalPrice,
      currency:               valid.currency,
      description:            valid.description,
      images:                 processedUrls,
      category:               valid.category,
      subCategory:            valid.subCategory || "",
      status:                 "pending",
      isPromoted:             false,
      views:                  0,
      likesCount:             0,
      reports:                0,
      rating:                 0,
      reviews:                0,
      sellerId:               uid,
      sellerName:             (user.name as string) || "",
      sellerShopName:         (sellerDetails.shopName as string | undefined) || null,
      sellerEmail:            (user.email as string) || "",
      sellerAvatar:           (user.avatar as string) || "",
      sellerIsVerified:       (user.isVerified as boolean) || false,
      sellerVerificationTier: (user.verificationTier as string | undefined)
                                || (user.isVerified ? "identity" : "none"),
      sellerWhatsapp:         (user.whatsapp as string | undefined) || null,
      sellerCommune:          (sellerDetails.commune as string | undefined) || null,
      sellerProvince:         (sellerDetails.province as string | undefined) || null,
      countryId:              (sellerDetails.countryId as string | undefined) || null,
      isWholesale:            valid.isWholesale,
      minOrderQuantity:       valid.minOrderQuantity,
      wholesalePrice:         valid.wholesalePrice,
      blurhash:               null,                 // pas de blurhash via Studio (photos Cloudinary CDN)
      createdAt:              FieldValue.serverTimestamp(),
      // ─ Marquage Studio ─
      viaStudio:              true,
      photoSessionId:         sessionId,
      // ─ État optionnel issu du form Studio (informatif, non requis par les rules) ─
      ...(valid.condition && { productCondition: valid.condition }),
    };

    // ── 6. Transaction atomique : produit + session + user + event ──────
    try {
      await db.runTransaction(async (tx) => {
        // Re-check session dans la TX (anti-race contre attach / expire)
        const freshSession = await tx.get(sessionRef);
        if (!freshSession.exists) {
          throw new HttpsError("not-found", "Session introuvable (race).");
        }
        const freshStatus = freshSession.data()?.status as string;
        if (freshStatus === "published") {
          throw new HttpsError("failed-precondition", "Produit déjà publié (race).");
        }
        if (freshStatus !== "ready") {
          throw new HttpsError(
            "failed-precondition",
            `Session pas prête (race, état: ${freshStatus}).`,
          );
        }

        // Create product (set, pas add — on contrôle l'ID)
        tx.set(productRef, productPayload);

        // Update session → published
        tx.update(sessionRef, {
          status: "published",
          publishedProductId: productId,
          publishedAt: now,
        });

        // Update user counters
        tx.update(userRef, {
          productCount: FieldValue.increment(1),
          lastProductCreatedAt: now,
        });

        // Event d'historique
        const evRef = sessionRef.collection("events").doc();
        tx.set(evRef, {
          action: "published",
          by: { userId: uid, role: "seller" },
          payload: {
            productId,
            slug,
            category: valid.category,
            price: valid.price,
          },
          timestamp: now,
        });
      });
    } catch (err) {
      // Si l'erreur est déjà une HttpsError (lancée dans la TX), on la propage tel quel
      if (err instanceof HttpsError) throw err;
      logger.error("[photoSessionPublish] Transaction failed", {
        sessionId, uid, err: err instanceof Error ? err.message : String(err),
      });
      throw new HttpsError("internal", "Publication impossible — réessayez.");
    }

    logger.info("[photoSessionPublish] Published", {
      sessionId,
      uid,
      productId,
      slug,
      category: valid.category,
    });

    return {
      ok: true,
      productId,
      productSlug: slug,
      status: "pending",
    };
  },
);
