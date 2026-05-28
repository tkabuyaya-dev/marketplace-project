/**
 * NUNULIA — Buyer Request → Matching sellers notification
 *
 * Architecture en 3 branches selon ce qu'on sait :
 *
 *   1. Catégorie explicite (slug réel comme "mode-accessoires")
 *      → notify les sellers de cette catégorie dans le pays.
 *
 *   2. Catégorie = "_help" (le buyer a choisi "Je ne sais pas trop")
 *      → on appelle Claude Haiku 4.5 sur le titre.
 *        - Si confiance ≥ 0.7 → traite comme branche 1 (mais notif type
 *          buyer_request_match — invisible pour le buyer, l'IA est cachée).
 *        - Si confiance < 0.7 OU IA indispo → branche 3.
 *
 *   3. Fallback "TOP 20 Pro" du pays
 *      → trustScore desc, exclude buyer lui-même + isSuspended.
 *        Notif type buyer_request_help (icône ✨, body distinct).
 *
 * Pipeline : addDoc dans /notifications → onNotificationCreate (fcm-send)
 * envoie le push système. Un seul write par seller.
 *
 * Plafonds :
 * - MAX_SELLERS_SCANNED = 200 (lecture Firestore plafonnée par pays)
 * - MAX_SELLERS_NOTIFIED = 50 pour le match catégorie normal
 * - MAX_PRO_FALLBACK = 20 pour le fallback "_help"
 *
 * Coûts CF :
 * - Branche 1 : ~5 reads Firestore, 1 batch write → négligeable
 * - Branche 2 : + 1 appel Anthropic ~$0.0006
 * - Branche 3 : même que branche 1 mais query mémoire-filtrée sur tierLabel
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ANTHROPIC_API_KEY } from "./config.js";
import { classifyWithAI } from "./ai-classify-category.js";

const HELP_CATEGORY_SLUG = "_help";
const AI_CONFIDENCE_THRESHOLD = 0.7;

const MAX_SELLERS_NOTIFIED = 50;
const MAX_SELLERS_SCANNED = 200;
const MAX_PRO_FALLBACK = 20;

// Tiers éligibles pour le fallback "demande sans catégorie" (cf. service
// canContactBuyer — mêmes labels que la logique frontend qui gate les clics
// WhatsApp). Les sellers gratuits ne sont PAS spammés ici, c'est volontaire :
// argument upsell vers Pro.
const PRO_TIER_LABELS = new Set(["Business Pro", "Élite", "Grossiste Illimité"]);

type BuyerRequestData = {
  title?: string;
  category?: string | null;
  countryId?: string;
  buyerId?: string | null;
  buyerName?: string;
};

type SellerDoc = {
  isSuspended?: boolean;
  trustScore?: number;
  sellerDetails?: {
    categories?: string[];
    tierLabel?: string;
    subscriptionExpiresAt?: number;
  };
};

export const onBuyerRequestMatch = onDocumentCreated(
  {
    document: "buyerRequests/{requestId}",
    region: "europe-west1",
    secrets: [ANTHROPIC_API_KEY],
    // Augmenté à 60s pour couvrir l'appel Anthropic (300-800ms typique)
    // + la lecture Firestore (parfois 1-2s sur cold start).
    timeoutSeconds: 60,
  },
  async (event) => {
    const req = event.data?.data() as BuyerRequestData | undefined;
    const requestId = event.params.requestId;
    if (!req) return;

    const rawCategory = (req.category || "").trim();
    const countryId = (req.countryId || "").trim();
    const title = (req.title || "").trim() || "un produit";
    const buyerName = (req.buyerName || "").trim() || "Un acheteur";
    const buyerId = req.buyerId || "";

    if (!countryId) {
      logger.info("[buyer-request-match] skip — countryId manquant", { requestId });
      return;
    }
    if (!rawCategory) {
      logger.info("[buyer-request-match] skip — category vide (devrait être bloqué côté form)", { requestId });
      return;
    }

    const db = await getDb();

    // ── Branche 2 : "_help" → IA classifier ──────────────────────────────
    let resolvedSlug = rawCategory;
    let aiClassified = false;
    let aiConfidence: number | null = null;

    if (rawCategory === HELP_CATEGORY_SLUG) {
      const aiResult = await classifyWithAI(title, countryId);
      if (aiResult && aiResult.confidence >= AI_CONFIDENCE_THRESHOLD) {
        resolvedSlug = aiResult.slug;
        aiClassified = true;
        aiConfidence = aiResult.confidence;
        logger.info("[buyer-request-match] IA classification réussie", {
          requestId,
          aiSlug: aiResult.slug,
          confidence: aiResult.confidence,
        });
      } else {
        // Branche 3 : fallback top 20 Pro
        logger.info("[buyer-request-match] IA incertaine ou null → fallback Pro", {
          requestId,
          aiConfidence: aiResult?.confidence ?? null,
        });
        await notifyTopPro({
          db,
          requestId,
          countryId,
          buyerId,
          buyerName,
          title,
        });
        return;
      }
    }

    // ── Branche 1 (et 2-confident) : match par catégorie ───────────────
    const catSnap = await db.collection("categories").get();
    const slugToName = new Map<string, string>();
    catSnap.forEach((d) => {
      const data = d.data() as { name?: string; slug?: string };
      const slug = data.slug || d.id;
      if (data.name) slugToName.set(slug, data.name);
    });
    const categoryName = slugToName.get(resolvedSlug) || "";

    const snap = await db
      .collection("users")
      .where("role", "==", "seller")
      .where("sellerDetails.countryId", "==", countryId)
      .limit(MAX_SELLERS_SCANNED)
      .get();

    const matched: string[] = [];
    snap.forEach((doc) => {
      if (doc.id === buyerId) return;
      const d = doc.data() as SellerDoc;
      if (d.isSuspended) return;
      const cats = d.sellerDetails?.categories || [];
      if (cats.includes(resolvedSlug) || (categoryName && cats.includes(categoryName))) {
        matched.push(doc.id);
      }
    });

    if (matched.length === 0) {
      logger.info("[buyer-request-match] aucun seller matching catégorie", {
        requestId,
        resolvedSlug,
        categoryName,
        countryId,
        scanned: snap.size,
        aiClassified,
      });
      return;
    }

    const targets = matched.slice(0, MAX_SELLERS_NOTIFIED);
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
      resolvedSlug,
      countryId,
      scanned: snap.size,
      matched: matched.length,
      notified: targets.length,
      aiClassified,
      aiConfidence,
    });
  },
);

// ── Fallback : notify TOP 20 sellers Pro du pays ────────────────────────────
async function notifyTopPro(params: {
  db: FirebaseFirestore.Firestore;
  requestId: string;
  countryId: string;
  buyerId: string;
  buyerName: string;
  title: string;
}) {
  const { db, requestId, countryId, buyerId, buyerName, title } = params;

  // Même query que la branche normale, on filtre tierLabel + suspension en mémoire
  // pour éviter d'ajouter un index composite à 3 niveaux (role + countryId + tierLabel).
  const snap = await db
    .collection("users")
    .where("role", "==", "seller")
    .where("sellerDetails.countryId", "==", countryId)
    .limit(MAX_SELLERS_SCANNED)
    .get();

  const now = Date.now();
  const candidates: Array<{ id: string; trustScore: number }> = [];

  snap.forEach((doc) => {
    if (doc.id === buyerId) return;
    const d = doc.data() as SellerDoc;
    if (d.isSuspended) return;

    const tierLabel = d.sellerDetails?.tierLabel || "";
    if (!PRO_TIER_LABELS.has(tierLabel)) return;

    // Exclure les Pro expirés
    const expiresAt = d.sellerDetails?.subscriptionExpiresAt;
    if (expiresAt && now > expiresAt) return;

    candidates.push({
      id: doc.id,
      trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
    });
  });

  if (candidates.length === 0) {
    logger.info("[buyer-request-match] fallback Pro : 0 Pro éligible", {
      requestId,
      countryId,
      scanned: snap.size,
    });
    return;
  }

  candidates.sort((a, b) => b.trustScore - a.trustScore);
  const targets = candidates.slice(0, MAX_PRO_FALLBACK);

  const batch = db.batch();
  const notifCol = db.collection("notifications");
  for (const c of targets) {
    const ref = notifCol.doc();
    batch.set(ref, {
      userId: c.id,
      type: "buyer_request_help",
      title: "✨ Nouvelle demande à fort potentiel",
      body: `${buyerName} cherche : ${title}. Peut-être pour vous ?`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      data: { link: "/demandes", buyerRequestId: requestId },
    });
  }
  await batch.commit();

  logger.info("[buyer-request-match] fallback Pro notifs créées", {
    requestId,
    countryId,
    scanned: snap.size,
    eligible_pro: candidates.length,
    notified: targets.length,
  });
}
