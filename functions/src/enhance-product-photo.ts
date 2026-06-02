/**
 * NUNULIA — enhanceProductPhoto (Callable Cloud Function)
 *
 * Retouche photo synchrone via PhotoRoom API (Basic plan, $0.02/img),
 * déclenchée depuis l'onglet "Ajouter produit" (composant PhotoEnhancementStep).
 * 2 styles disponibles :
 *   - white   : fond blanc neutre (e-commerce classique)
 *   - branded : fond orange NUNULIA (#F5A623) + watermark logo via overlay
 *               Cloudinary appliqué inline dans l'URL retournée
 *
 * Flow :
 *   1. Auth + role seller + not suspended
 *   2. Validation : URL Cloudinary appartenant au cloud NUNULIA (anti-relais)
 *   3. Plan gating PARTAGÉ avec Photo Studio asynchrone (un seul quota
 *      par jour : count(photoSessions) + count(photoEnhancements) ≤
 *      PLAN_FEATURES[plan].dailyStudioSessions)
 *   4. Incrément du compteur AVANT appel PhotoRoom (empêche l'abuse en
 *      cas de retry client). Décrémenté si l'appel échoue côté nous.
 *   5. Download Cloudinary → POST PhotoRoom → réupload Cloudinary signé
 *      dans dossier `aurabuja-app-2026/enhanced/`
 *   6. Pour 'branded' : URL retournée embed la transformation watermark
 *      logo (asset Cloudinary `nunulia_logo` attendu côté médiathèque)
 *
 * Sécurité :
 *   - Clé PhotoRoom uniquement côté serveur (defineSecret)
 *   - URL Cloudinary validée contre le cloud name attendu
 *   - PAS de enforceAppCheck (alignement avec photoSessionCreate — évite
 *     les faux refus iOS Safari ITP)
 *
 * Fail-open côté client :
 *   - HttpsError 'internal' / 'unavailable' → frontend publie les
 *     originaux sans bloquer le vendeur
 *   - HttpsError 'resource-exhausted' → frontend affiche quota épuisé,
 *     permet quand même de publier les originaux
 *
 * Coût estimé : ~$0.10-0.20 par appel PhotoRoom (variable selon plan).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import {
  ALLOWED_ORIGINS,
  PHOTOROOM_API_KEY,
  PHOTOROOM_SANDBOX_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./config.js";
import { featuresForLabel } from "./plan-features.js";

type EnhancementStyle = "white" | "branded";
const VALID_STYLES: ReadonlySet<EnhancementStyle> = new Set(["white", "branded"]);

interface EnhanceInput {
  cloudinaryUrl?: string;
  style?: EnhancementStyle;
}

interface EnhanceOutput {
  enhancedUrl: string;
  style: EnhancementStyle;
  quotaUsed: number;   // total après cet appel (Studio + enhancements)
  quotaLimit: number;
}

const ENHANCED_FOLDER = "aurabuja-app-2026/enhanced";
// Endpoint Basic ($20/mois, $0.02/img) — Remove Background + Color backgrounds.
// L'endpoint v2/edit (Plus plan, $100/mois, $0.10/img) n'est PAS utilisé ici.
const PHOTOROOM_ENDPOINT = "https://sdk.photoroom.com/v1/segment";
const PHOTOROOM_TIMEOUT_MS = 45_000;
const CLOUDINARY_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const NUNULIA_ORANGE_HEX = "F5A623";

/**
 * Watermark logo NUNULIA pour le style 'branded'. Suppose qu'un asset
 * public_id = "nunulia_logo" existe dans la médiathèque Cloudinary
 * (à uploader une fois, manuellement). Si absent, Cloudinary ignore
 * l'overlay silencieusement — l'image reste utilisable.
 */
const BRANDED_WATERMARK_TRANSFORM = "l_nunulia_logo,o_45,g_south_east,x_20,y_20";

function getLocalDateKey(now = Date.now()): string {
  const offsetMs = 2 * 60 * 60 * 1000;
  return new Date(now + offsetMs).toISOString().slice(0, 10);
}

function startOfLocalDayUtc(now = Date.now()): number {
  const todayKey = getLocalDateKey(now);
  const [y, m, d] = todayKey.split("-").map((n) => parseInt(n, 10));
  return Date.UTC(y, m - 1, d, -2, 0, 0);
}

function validateCloudinaryUrl(url: unknown, expectedCloudName: string): string {
  if (typeof url !== "string" || url.length > 600) {
    throw new HttpsError("invalid-argument", "URL invalide.");
  }
  const safe = expectedCloudName.replace(/[^a-z0-9_-]/gi, "");
  if (!safe) {
    throw new HttpsError("failed-precondition", "Configuration Cloudinary manquante.");
  }
  const pattern = new RegExp(
    `^https://res\\.cloudinary\\.com/${safe}/image/upload/[\\w\\-/.,_%~?=&:+@$#!]+$`,
  );
  if (!pattern.test(url)) {
    throw new HttpsError("invalid-argument", "URL Cloudinary non autorisée.");
  }
  return url;
}

async function countTodayStudioSessions(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<number> {
  const start = startOfLocalDayUtc();
  const snap = await db
    .collection("photoSessions")
    .where("vendorId", "==", uid)
    .where("createdAt", ">=", start)
    .get();
  return snap.size;
}

async function getTodayEnhancementsCount(
  db: FirebaseFirestore.Firestore,
  uid: string,
  dateKey: string,
): Promise<number> {
  const snap = await db
    .collection("users").doc(uid)
    .collection("photoEnhancements").doc(dateKey)
    .get();
  if (!snap.exists) return 0;
  const data = snap.data() as { count?: number } | undefined;
  return typeof data?.count === "number" && data.count > 0 ? data.count : 0;
}

async function incrementEnhancementsCounter(
  db: FirebaseFirestore.Firestore,
  uid: string,
  dateKey: string,
): Promise<void> {
  await db
    .collection("users").doc(uid)
    .collection("photoEnhancements").doc(dateKey)
    .set(
      {
        count: FieldValue.increment(1),
        lastUsedAt: Date.now(),
      },
      { merge: true },
    );
}

async function rollbackEnhancementsCounter(
  db: FirebaseFirestore.Firestore,
  uid: string,
  dateKey: string,
): Promise<void> {
  try {
    await db
      .collection("users").doc(uid)
      .collection("photoEnhancements").doc(dateKey)
      .set({ count: FieldValue.increment(-1) }, { merge: true });
  } catch (err) {
    logger.warn("[enhanceProductPhoto] rollback decrement failed", { uid, dateKey, err });
  }
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new HttpsError("internal", `Téléchargement Cloudinary échoué (${res.status}).`);
    }
    const mime = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mime };
  } finally {
    clearTimeout(timer);
  }
}

async function callPhotoRoom(
  source: Buffer,
  mime: string,
  style: EnhancementStyle,
  apiKey: string,
): Promise<Buffer> {
  // PhotoRoom v1 /segment — Basic plan. Field name: `image_file` (snake_case).
  // Le paramètre `bg_color` (hex sans #) demande l'ajout d'un fond uni au
  // résultat sans transparence — supporté nativement par le plan Basic.
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(source)], { type: mime }), "source.jpg");
  form.append("bg_color", style === "branded" ? NUNULIA_ORANGE_HEX : "FFFFFF");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTOROOM_TIMEOUT_MS);

  try {
    const res = await fetch(PHOTOROOM_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Accept": "image/jpeg",
      },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("[enhanceProductPhoto] PhotoRoom error", {
        status: res.status,
        body: text.slice(0, 300),
        style,
      });
      throw new HttpsError("internal", `PhotoRoom error ${res.status}`);
    }

    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToCloudinary(
  buffer: Buffer,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Signature Cloudinary : params triés alphabétiquement, sans api_key/file
  const signatureString = `folder=${ENHANCED_FOLDER}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash("sha1").update(signatureString).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), "enhanced.jpg");
  form.append("folder", ENHANCED_FOLDER);
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("api_key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUDINARY_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("[enhanceProductPhoto] Cloudinary upload failed", {
        status: res.status,
        body: text.slice(0, 300),
      });
      throw new HttpsError("internal", `Cloudinary upload error ${res.status}`);
    }
    const json = (await res.json()) as { secure_url?: string };
    if (!json.secure_url) {
      throw new HttpsError("internal", "Cloudinary upload returned no URL.");
    }
    return json.secure_url;
  } finally {
    clearTimeout(timer);
  }
}

function applyBrandedWatermark(url: string): string {
  const parts = url.split("/upload/");
  if (parts.length !== 2) return url;
  return `${parts[0]}/upload/${BRANDED_WATERMARK_TRANSFORM}/${parts[1]}`;
}

export const enhanceProductPhoto = onCall<EnhanceInput, Promise<EnhanceOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    secrets: [
      PHOTOROOM_API_KEY,
      PHOTOROOM_SANDBOX_KEY,
      CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET,
    ],
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (request) => {
    // ── 1. Auth + role + not suspended ───────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const role = (request.auth?.token?.role as string | undefined) ?? "";
    if (role !== "seller" && role !== "admin") {
      throw new HttpsError("permission-denied", "Réservé aux vendeurs.");
    }
    if (request.auth?.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Compte suspendu.");
    }

    // ── 2. Validation input ──────────────────────────────────────────────
    const cloudName = CLOUDINARY_CLOUD_NAME.value();
    const inputUrl = validateCloudinaryUrl(request.data?.cloudinaryUrl, cloudName);
    const style = request.data?.style;
    if (!style || !VALID_STYLES.has(style)) {
      throw new HttpsError("invalid-argument", "Style invalide.");
    }

    const db = await getDb();

    // ── 3. Plan + quota partagé avec Photo Studio ────────────────────────
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Profil vendeur introuvable.");
    }
    const userData = userSnap.data() as {
      sellerDetails?: { tierLabel?: string; subscriptionExpiresAt?: number };
    };
    const sellerDetails = userData.sellerDetails ?? {};
    const expiresAt = sellerDetails.subscriptionExpiresAt ?? 0;
    const isPlanExpired = expiresAt > 0 && Date.now() > expiresAt;
    const features = isPlanExpired
      ? featuresForLabel(null)
      : featuresForLabel(sellerDetails.tierLabel ?? null);
    const dailyLimit = features.dailyStudioSessions;
    if (dailyLimit <= 0) {
      throw new HttpsError("permission-denied", "Amélioration non disponible pour ce plan.");
    }

    const dateKey = getLocalDateKey();
    const [studioCount, enhanceCount] = await Promise.all([
      countTodayStudioSessions(db, uid),
      getTodayEnhancementsCount(db, uid, dateKey),
    ]);
    const totalUsed = studioCount + enhanceCount;
    if (totalUsed >= dailyLimit) {
      throw new HttpsError(
        "resource-exhausted",
        `Quota Photo Studio atteint (${totalUsed}/${dailyLimit} aujourd'hui).`,
        { quotaUsed: totalUsed, quotaLimit: dailyLimit },
      );
    }

    // ── 4. Incrément AVANT appel PhotoRoom ───────────────────────────────
    await incrementEnhancementsCounter(db, uid, dateKey);

    try {
      // ── 5. PhotoRoom + réupload Cloudinary ─────────────────────────────
      const useSandbox = process.env.PHOTOROOM_USE_SANDBOX === "true";
      const photoroomKey = useSandbox
        ? PHOTOROOM_SANDBOX_KEY.value()
        : PHOTOROOM_API_KEY.value();
      if (!photoroomKey) {
        throw new HttpsError("failed-precondition", "PhotoRoom non configuré.");
      }

      const source = await downloadImage(inputUrl);
      const enhanced = await callPhotoRoom(source.buffer, source.mime, style, photoroomKey);
      const secureUrl = await uploadToCloudinary(
        enhanced,
        cloudName,
        CLOUDINARY_API_KEY.value(),
        CLOUDINARY_API_SECRET.value(),
      );

      const finalUrl = style === "branded" ? applyBrandedWatermark(secureUrl) : secureUrl;

      logger.info("[enhanceProductPhoto] OK", {
        uid,
        style,
        dateKey,
        totalUsed: totalUsed + 1,
        sandbox: useSandbox,
      });

      return {
        enhancedUrl: finalUrl,
        style,
        quotaUsed: totalUsed + 1,
        quotaLimit: dailyLimit,
      };
    } catch (err) {
      // Rollback : le vendeur ne consomme pas son quota si l'appel échoue
      await rollbackEnhancementsCounter(db, uid, dateKey);
      if (err instanceof HttpsError) throw err;
      logger.error("[enhanceProductPhoto] Unexpected", {
        uid,
        err: err instanceof Error ? err.message : String(err),
      });
      throw new HttpsError("internal", "Amélioration échouée, réessayez.");
    }
  },
);
