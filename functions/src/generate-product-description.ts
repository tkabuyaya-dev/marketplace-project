/**
 * NUNULIA — Generate Product Description (callable, Claude Haiku 4.5)
 *
 * Pour faire gagner du temps aux vendeurs, l'IA génère une description
 * professionnelle à partir du titre + catégorie + contexte boutique.
 *
 * Architecture :
 *   1. Auth obligatoire (request.auth.uid)
 *   2. Pro check via sellerDetails.tierLabel
 *   3. Quota check (Free = 3/jour, Pro = illimité)
 *      - Date locale UTC+2 (Africa/Bujumbura) pour reset à minuit chez le vendeur
 *   4. Cache check via hash(title + categorySlug) — TTL 7 jours
 *   5. Si cache miss → Claude Haiku 4.5
 *   6. Réponse JSON : {description, guessedFields, cached, quotaUsed, quotaLimit, isPro}
 *
 * Erreurs HttpsError :
 *   - unauthenticated : pas de token
 *   - resource-exhausted : quota Free dépassé (frontend → upsell vers Pro)
 *   - internal : Anthropic down ou JSON mal formé → frontend fallback template
 *
 * Coût estimé par génération (sans cache) : ~$0.0013 (Haiku 4.5).
 * Avec cache 50%+ hit sur produits standards → ~$45/an au scale prévu.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { ANTHROPIC_API_KEY } from "./config.js";
import { ALLOWED_ORIGINS } from "./config.js";

const FREE_DAILY_QUOTA = 3;
const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

// Plans éligibles à l'usage illimité (aligné sur canContactBuyer).
// Source de vérité : functions/src/plan-features.ts → PLAN_FEATURES.canContactBuyer.
import { featuresForLabel } from "./plan-features.js";

interface GenerateInput {
  title?: string;
  categorySlug?: string;
  countryId?: string;
  shopName?: string;
}

interface GenerateOutput {
  description: string;
  guessedFields: string[];
  cached: boolean;
  quotaUsed: number;
  quotaLimit: number;  // -1 = illimité (Pro)
  isPro: boolean;
}

interface CategoryMeta {
  slug: string;
  name: string;
  icon?: string;
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

/** Date locale UTC+2 (Burundi/Rwanda) au format YYYY-MM-DD. */
function getLocalDateKey(): string {
  const offsetMs = 2 * 60 * 60 * 1000;
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
}

/** Hash stable pour cache key — slugify(title) + '_' + categorySlug. */
function cacheKey(title: string, categorySlug: string): string {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const raw = `${normalized}__${categorySlug}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function getCategoryName(db: FirebaseFirestore.Firestore, slug: string): Promise<string> {
  if (!slug) return "Produit";
  try {
    const snap = await db.collection("categories").doc(slug).get();
    if (snap.exists) return (snap.data() as CategoryMeta).name || slug;
  } catch { /* fallback */ }
  return slug;
}

const SYSTEM_PROMPT = `Tu es un copywriter pour Nunulia, marketplace en Afrique de l'Est centrale (Burundi/RDC/Rwanda/Tanzanie).

Quand un vendeur te donne un titre de produit + sa catégorie, tu génères une description PRO en français.

RÈGLES STRICTES :
1. Réponse UNIQUEMENT en JSON valide : {"description": "...", "guessedFields": [...]}
2. La description fait 4-7 phrases courtes avec puces "•" pour les caractéristiques
3. Structure : accroche commerciale (1 phrase) + caractéristiques (3-5 puces) + dispo locale (1 phrase)
4. JAMAIS de prix dans la description (le prix est ailleurs sur la fiche)
5. Devine des SPECS techniques probables si tu connais le produit (ex: iPhone 15 → écran 6.1 pouces, A17 Pro, 48Mpx)
6. Le champ "guessedFields" liste UNIQUEMENT les specs que tu as INVENTÉES (pas celles déjà dans le titre)
7. Ton chaleureux, africain, direct — pas de pompeux
8. Mentionne la ville/pays si pertinent (Bujumbura, Kigali, Goma...)
9. Si le produit est inconnu, fais une description générique honnête (et guessedFields = [])

Exemple bon :
Titre : "iPhone 15 Pro Max 256Go"
Catégorie : Électronique & Téléphonie
Pays : bi

Réponse :
{
  "description": "L'iPhone 15 Pro Max — la performance Apple à portée de main.\\n\\n• Écran Super Retina XDR 6.7 pouces ProMotion\\n• Stockage 256Go\\n• Puce A17 Pro pour des performances fluides\\n• Triple caméra avec téléobjectif optique\\n• iOS 17, support garanti plusieurs années\\n\\nDisponible à Bujumbura. Contactez-nous pour organiser la livraison ou le retrait.",
  "guessedFields": ["Écran Super Retina XDR 6.7 pouces ProMotion", "Puce A17 Pro", "Triple caméra avec téléobjectif optique", "iOS 17"]
}`;

export const generateProductDescription = onCall<GenerateInput, Promise<GenerateOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    // ── 2. Validation input ──────────────────────────────────────────────
    const title = (request.data.title || "").trim();
    const categorySlug = (request.data.categorySlug || "").trim();
    const countryId = (request.data.countryId || "").trim();
    const shopName = (request.data.shopName || "").trim();

    if (title.length < 3) {
      throw new HttpsError("invalid-argument", "Titre trop court.");
    }
    if (title.length > 200) {
      throw new HttpsError("invalid-argument", "Titre trop long.");
    }
    if (!categorySlug) {
      throw new HttpsError("invalid-argument", "Catégorie requise.");
    }

    const db = await getDb();

    // ── 3. Pro check ─────────────────────────────────────────────────────
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Profil introuvable.");
    }
    const userData = userSnap.data() as {
      sellerDetails?: { tierLabel?: string; subscriptionExpiresAt?: number };
    };
    const tierLabel = userData.sellerDetails?.tierLabel || "";
    const expiresAt = userData.sellerDetails?.subscriptionExpiresAt || 0;
    const isProActive = featuresForLabel(tierLabel).canContactBuyer && (!expiresAt || Date.now() < expiresAt);

    // ── 4. Quota check (Free uniquement) ─────────────────────────────────
    const dateKey = getLocalDateKey();
    const quotaRef = db.collection("users").doc(uid).collection("aiUsage").doc(dateKey);
    let currentCount = 0;
    if (!isProActive) {
      const quotaSnap = await quotaRef.get();
      currentCount = quotaSnap.exists ? (quotaSnap.data()?.count || 0) : 0;
      if (currentCount >= FREE_DAILY_QUOTA) {
        throw new HttpsError(
          "resource-exhausted",
          `Limite quotidienne atteinte (${FREE_DAILY_QUOTA}/jour). Passez Pro pour usage illimité.`,
          { quotaUsed: currentCount, quotaLimit: FREE_DAILY_QUOTA, isPro: false },
        );
      }
    }

    // ── 5. Cache check ───────────────────────────────────────────────────
    const cacheKeyStr = cacheKey(title, categorySlug);
    const cacheRef = db.collection("aiDescriptionCache").doc(cacheKeyStr);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cacheData = cacheSnap.data() as {
        description?: string;
        guessedFields?: string[];
        createdAt?: number;
        hitCount?: number;
      };
      const ageMs = Date.now() - (cacheData.createdAt || 0);
      if (cacheData.description && ageMs < CACHE_TTL_MS) {
        // Cache hit — pas de débit de quota (favorise les sellers, économise des $)
        await cacheRef.update({
          hitCount: (cacheData.hitCount || 0) + 1,
          lastHitAt: FieldValue.serverTimestamp(),
        });
        logger.info("[ai-description] cache HIT", {
          uid, cacheKey: cacheKeyStr, ageDays: Math.round(ageMs / (24 * 60 * 60 * 1000)),
        });
        return {
          description: cacheData.description,
          guessedFields: cacheData.guessedFields || [],
          cached: true,
          quotaUsed: currentCount,
          quotaLimit: isProActive ? -1 : FREE_DAILY_QUOTA,
          isPro: isProActive,
        };
      }
    }

    // ── 6. Appel Claude Haiku 4.5 ────────────────────────────────────────
    const categoryName = await getCategoryName(db, categorySlug);
    const userContent = [
      `Titre : "${title}"`,
      `Catégorie : ${categoryName}`,
      countryId ? `Pays : ${countryId}` : "",
      shopName ? `Boutique : ${shopName}` : "",
    ].filter(Boolean).join("\n");

    let description = "";
    let guessedFields: string[] = [];

    try {
      const client = getClient();
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Pas de bloc texte dans la réponse");
      }
      // Extraction JSON robuste (Haiku peut entourer de ``` ou texte)
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Pas de JSON dans la réponse");
      const parsed = JSON.parse(jsonMatch[0]) as {
        description?: string;
        guessedFields?: string[];
      };
      if (!parsed.description || typeof parsed.description !== "string") {
        throw new Error("Description manquante");
      }
      description = parsed.description.trim();
      guessedFields = Array.isArray(parsed.guessedFields)
        ? parsed.guessedFields.filter((f) => typeof f === "string" && f.length > 0).slice(0, 10)
        : [];

      logger.info("[ai-description] success", {
        uid,
        categorySlug,
        title: title.slice(0, 50),
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        guessedCount: guessedFields.length,
      });
    } catch (err) {
      logger.error("[ai-description] Anthropic error", {
        error: err instanceof Error ? err.message : String(err),
        uid, title: title.slice(0, 50),
      });
      throw new HttpsError("internal", "Service IA temporairement indisponible.");
    }

    // ── 7. Write cache + débit quota ─────────────────────────────────────
    const writes: Promise<unknown>[] = [
      cacheRef.set({
        description,
        guessedFields,
        title: title.slice(0, 200),
        categorySlug,
        createdAt: Date.now(),
        hitCount: 0,
      }),
    ];
    if (!isProActive) {
      writes.push(
        quotaRef.set(
          { count: currentCount + 1, lastUsedAt: FieldValue.serverTimestamp() },
          { merge: true },
        ),
      );
    }
    await Promise.all(writes);

    return {
      description,
      guessedFields,
      cached: false,
      quotaUsed: isProActive ? 0 : currentCount + 1,
      quotaLimit: isProActive ? -1 : FREE_DAILY_QUOTA,
      isPro: isProActive,
    };
  },
);
