/**
 * NUNULIA — Photo Studio Share Card + Caption (Phase 7)
 *
 * Trigger Firestore qui se déclenche quand `photoSessions/{id}.status` passe
 * à 'published'. En arrière-plan :
 *   1. Fetch product depuis publishedProductId
 *   2. Génère une carte 1080×1920 PNG (SVG + resvg) : photo retouchée +
 *      branding STUDIO NUNULIA + shopName + countryCode + QR code → fiche
 *   3. Génère une caption WhatsApp via Claude Haiku (text-only, ~150 tokens)
 *   4. Upload carte → Cloudinary (signed)
 *   5. Update session avec { shareCardUrl, shareCaption }
 *
 * Async + idempotent : ne fait rien si shareCardUrl déjà présent ou si on
 * n'est pas dans la transition vers 'published'. Fail-open : si la carte OU
 * la caption échoue, on écrit la partie qui a réussi (Promise.allSettled).
 * Si tout échoue, le publish reste valide — le frontend affiche skeleton
 * "Génération de votre carte..." indéfiniment et le vendeur peut refresh
 * pour réessayer en V1 (retry button = Phase 8).
 *
 * Coûts (1000 sessions/mois) :
 *   - Haiku caption : ~$0.20
 *   - Cloudinary storage : ~50 MB (négligeable)
 *   - CF invocations : ~$0.01
 *
 * Pas de modification de photo-session-publish.ts : le trigger est totalement
 * découplé via Firestore event.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { createHash } from "crypto";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./admin.js";
import {
  ANTHROPIC_API_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  STUDIO_PUBLIC_BASE_URL,
} from "./config.js";

// ─── Constantes ───────────────────────────────────────────────────────────

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const CARD_PHOTO_SIZE = 960;
const CLOUDINARY_FOLDER = "aurabuja-app-2026/studio-cards";

const COUNTRY_NAMES: Record<string, string> = {
  bi: "Burundi",
  cd: "RDC",
  rw: "Rwanda",
  tz: "Tanzanie",
  ke: "Kenya",
  ug: "Ouganda",
};

const COUNTRY_HASHTAGS: Record<string, string> = {
  bi: "#Burundi",
  cd: "#RDC",
  rw: "#Rwanda",
  tz: "#Tanzania",
  ke: "#Kenya",
  ug: "#Uganda",
};

const COUNTRY_CODE_DISPLAY: Record<string, string> = {
  bi: "BI",
  cd: "CD",
  rw: "RW",
  tz: "TZ",
  ke: "KE",
  ug: "UG",
};

// ─── Types Firestore loose ────────────────────────────────────────────────

type SessionData = {
  status?: string;
  publishedProductId?: string;
  shareCardUrl?: string;
  processedUrls?: string[];
  countryId?: string;
  plan?: string;
  vendorName?: string;
};

type ProductData = {
  id?: string;
  title?: string;
  slug?: string;
  price?: number;
  currency?: string;
  category?: string;
  sellerShopName?: string;
  sellerName?: string;
  sellerCommune?: string;
  sellerProvince?: string;
  countryId?: string;
};

// ─── Trigger principal ────────────────────────────────────────────────────

export const onPhotoSessionPublished = onDocumentUpdated(
  {
    document: "photoSessions/{sessionId}",
    region: "europe-west1",
    secrets: [
      ANTHROPIC_API_KEY,
      CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET,
    ],
    timeoutSeconds: 90,
    memory: "512MiB",
  },
  async (event) => {
    const sessionId = event.params.sessionId;
    const before = event.data?.before?.data() as SessionData | undefined;
    const after = event.data?.after?.data() as SessionData | undefined;
    if (!before || !after || !event.data) return;

    // Idempotence : on déclenche UNIQUEMENT sur la transition vers 'published'.
    // Si on était déjà 'published' avant (write secondaire — y compris notre
    // propre update plus bas), on no-op pour éviter une boucle infinie.
    if (before.status === "published" || after.status !== "published") return;
    // Déjà généré ? (backfill manuel, retry, etc.)
    if (after.shareCardUrl) return;
    if (!after.publishedProductId || typeof after.publishedProductId !== "string") {
      logger.warn("[share-card-trigger] missing publishedProductId", { sessionId });
      return;
    }

    const productId = after.publishedProductId;
    const sessionRef = event.data.after.ref;

    try {
      // Lecture du produit publié
      const db = await getDb();
      const productSnap = await db.collection("products").doc(productId).get();
      if (!productSnap.exists) {
        logger.warn("[share-card-trigger] product not found", { sessionId, productId });
        return;
      }
      const product = productSnap.data() as ProductData;

      // Carte + caption en parallèle
      const [cardResult, captionResult] = await Promise.allSettled([
        generateAndUploadCard(sessionId, after, product),
        generateCaption(after, product),
      ]);

      const updates: Record<string, unknown> = {};
      if (cardResult.status === "fulfilled" && cardResult.value) {
        updates.shareCardUrl = cardResult.value;
      } else if (cardResult.status === "rejected") {
        logger.warn("[share-card-trigger] card generation failed", {
          sessionId,
          err: cardResult.reason instanceof Error
            ? cardResult.reason.message
            : String(cardResult.reason),
        });
      }
      if (captionResult.status === "fulfilled" && captionResult.value) {
        updates.shareCaption = captionResult.value;
      } else if (captionResult.status === "rejected") {
        logger.warn("[share-card-trigger] caption generation failed", {
          sessionId,
          err: captionResult.reason instanceof Error
            ? captionResult.reason.message
            : String(captionResult.reason),
        });
      }

      if (Object.keys(updates).length === 0) {
        logger.warn("[share-card-trigger] nothing to write — both failed", { sessionId });
        return;
      }

      await sessionRef.update(updates);
      logger.info("[share-card-trigger] done", {
        sessionId,
        productId,
        hasCard: "shareCardUrl" in updates,
        hasCaption: "shareCaption" in updates,
      });
    } catch (err) {
      logger.error("[share-card-trigger] unexpected failure", {
        sessionId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// ─── Carte virale 1080×1920 ───────────────────────────────────────────────

async function generateAndUploadCard(
  sessionId: string,
  session: SessionData,
  product: ProductData,
): Promise<string | null> {
  const photoUrl = Array.isArray(session.processedUrls) && session.processedUrls.length > 0
    ? session.processedUrls[0]
    : null;
  if (!photoUrl) {
    throw new Error("no processedUrls on session");
  }

  // Optimise l'URL Cloudinary pour réduire la taille de l'embed base64
  // (avoid telecharger un 4000×3000 quand on veut un 960×960 final).
  const optimizedUrl = optimizeCloudinaryUrl(photoUrl);
  const photoDataUrl = await fetchAsDataUrl(optimizedUrl);

  // QR code → SVG inline en data URL
  const productUrl = `${STUDIO_PUBLIC_BASE_URL}/product/${product.slug || product.id || ""}`;
  const qrSvg = await QRCode.toString(productUrl, {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#1a1a1a", light: "#FFFFFF00" },
  });
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  // Construit le SVG complet
  const countryCode = (product.countryId || session.countryId || "bi").toLowerCase();
  const svg = buildSvgTemplate({
    photoDataUrl,
    qrDataUrl,
    title: product.title || "",
    price: typeof product.price === "number" ? product.price : 0,
    currency: product.currency || "BIF",
    shopName: product.sellerShopName || product.sellerName || "Nunulia",
    countryCode,
    commune: product.sellerCommune || "",
  });

  // SVG → PNG via resvg-js (Rust binary, ~1-2s warm, ~3-5s cold)
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_WIDTH },
    background: "#FFFDF4",
    font: { loadSystemFonts: true },
  });
  const pngBuffer = resvg.render().asPng();

  // Upload Cloudinary signé (resource_type=image, idempotent via overwrite=true)
  const publicId = `card-${sessionId}`;
  const url = await uploadPngToCloudinary(
    pngBuffer,
    publicId,
    CLOUDINARY_FOLDER,
    CLOUDINARY_CLOUD_NAME.value(),
    CLOUDINARY_API_KEY.value(),
    CLOUDINARY_API_SECRET.value(),
  );
  return url;
}

function optimizeCloudinaryUrl(url: string): string {
  if (!url.includes("cloudinary.com") || !url.includes("/upload/")) return url;
  const parts = url.split("/upload/");
  if (parts.length !== 2) return url;
  // Square crop, 960px, JPEG, quality auto eco — réduit drastiquement l'embed
  return `${parts[0]}/upload/c_fill,w_960,h_960,f_jpg,q_auto:eco/${parts[1]}`;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = response.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

interface SvgOpts {
  photoDataUrl: string;
  qrDataUrl: string;
  title: string;
  price: number;
  currency: string;
  shopName: string;
  countryCode: string;
  commune: string;
}

function buildSvgTemplate(o: SvgOpts): string {
  const title = escapeXml(truncate(o.title, 40));
  const shopName = escapeXml(truncate(o.shopName, 32));
  const commune = o.commune ? escapeXml(truncate(o.commune, 30)) : "";
  const currency = escapeXml(o.currency.toUpperCase());
  const priceStr = `${o.price.toLocaleString("fr-FR")} ${currency}`;
  const countryDisplay = COUNTRY_CODE_DISPLAY[o.countryCode] || o.countryCode.toUpperCase();
  const locationLine = commune ? `${commune} · ${countryDisplay}` : countryDisplay;

  // Note: les emojis SVG ne rendent pas fiablement sans Noto Color Emoji
  // installé. On reste sur du texte propre + couleur or signature.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFDF4"/>
      <stop offset="100%" stop-color="#FFF3D0"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#D89B1F"/>
      <stop offset="100%" stop-color="#F5C842"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>

  <!-- Header bar -->
  <rect width="${CARD_WIDTH}" height="180" fill="url(#header)"/>
  <text x="540" y="92" text-anchor="middle" fill="#FFFDF4" font-family="sans-serif" font-size="58" font-weight="bold" letter-spacing="2">STUDIO NUNULIA</text>
  <text x="540" y="142" text-anchor="middle" fill="#FFFDF4" font-family="sans-serif" font-size="28" opacity="0.92" letter-spacing="3">PHOTOS PRO RETOUCHÉES</text>

  <!-- Photo frame -->
  <rect x="56" y="216" width="${CARD_PHOTO_SIZE + 8}" height="${CARD_PHOTO_SIZE + 8}" rx="20" fill="#FFFFFF" stroke="#E5D6A8" stroke-width="2"/>
  <image href="${o.photoDataUrl}" x="60" y="220" width="${CARD_PHOTO_SIZE}" height="${CARD_PHOTO_SIZE}" preserveAspectRatio="xMidYMid slice"/>

  <!-- Product title -->
  <text x="60" y="1280" fill="#1a1a1a" font-family="sans-serif" font-size="52" font-weight="bold">${title}</text>

  <!-- Price -->
  <text x="60" y="1352" fill="#D89B1F" font-family="sans-serif" font-size="46" font-weight="bold">${priceStr}</text>

  <!-- Shop -->
  <text x="60" y="1480" fill="#3a3a3a" font-family="sans-serif" font-size="38" font-weight="bold">${shopName}</text>
  <text x="60" y="1528" fill="#7a7a7a" font-family="sans-serif" font-size="28">${locationLine}</text>

  <!-- QR card -->
  <rect x="772" y="1480" width="252" height="252" rx="16" fill="#FFFFFF" stroke="#E5D6A8" stroke-width="2"/>
  <image href="${o.qrDataUrl}" x="778" y="1486" width="240" height="240"/>
  <text x="898" y="1762" text-anchor="middle" fill="#7a7a7a" font-family="sans-serif" font-size="22" letter-spacing="2">SCANNEZ</text>

  <!-- Footer -->
  <rect y="1820" width="${CARD_WIDTH}" height="100" fill="#D89B1F" fill-opacity="0.12"/>
  <text x="540" y="1882" text-anchor="middle" fill="#92400E" font-family="sans-serif" font-size="38" font-weight="bold" letter-spacing="2">nunulia.com</text>
</svg>`;
}

// ─── Cloudinary signed upload (image PNG) ─────────────────────────────────

async function uploadPngToCloudinary(
  pngBytes: Buffer,
  publicId: string,
  folder: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Params sorted alphabetically pour la signature HMAC SHA1
  const signParams = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash("sha1").update(signParams).digest("hex");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([pngBytes.buffer as ArrayBuffer], { type: "image/png" }),
    `${publicId}.png`,
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("public_id", publicId);
  formData.append("folder", folder);
  formData.append("overwrite", "true");

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary image upload failed (${response.status}): ${text}`);
  }
  const json = (await response.json()) as { secure_url: string };
  return json.secure_url;
}

// ─── Caption Haiku ────────────────────────────────────────────────────────

let cachedAnthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  cachedAnthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedAnthropic;
}

const CAPTION_SYSTEM_PROMPT = `Tu rédiges un statut WhatsApp pour un vendeur Nunulia (marketplace Burundi/RDC/Rwanda/Tanzanie) qui vient de publier un nouveau produit.

Contraintes strictes :
- 2 phrases courtes maximum (35 mots total max)
- 1 emoji maximum, bien placé
- 2-3 hashtags pertinents (pays + catégorie)
- Ton enthousiaste et chaleureux mais professionnel
- Pas de "Découvrez", "N'hésitez pas", clichés marketing
- Pas de guillemets autour du nom du produit
- Pas de markdown
- Langue : français
- Réponds UNIQUEMENT le texte du statut, rien d'autre`;

async function generateCaption(
  session: SessionData,
  product: ProductData,
): Promise<string> {
  const title = product.title || "";
  const shopName = product.sellerShopName || product.sellerName || "votre boutique";
  const category = product.category || "";
  const countryCode = (product.countryId || session.countryId || "bi").toLowerCase();
  const countryName = COUNTRY_NAMES[countryCode] || "Afrique";
  const countryTag = COUNTRY_HASHTAGS[countryCode] || "";

  const userMessage = `Produit : ${title}\nCatégorie : ${category}\nBoutique : ${shopName}\nPays : ${countryName}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: CAPTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no text block");
    const text = block.text.trim().slice(0, 500);
    if (text.length < 10) throw new Error("caption too short");
    logger.info("[share-card-trigger] caption ok", {
      length: text.length,
      input_tokens: response.usage.input_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return text;
  } catch (err) {
    logger.warn("[share-card-trigger] caption fallback", {
      err: err instanceof Error ? err.message : String(err),
    });
    // Fallback français hardcodé — toujours mieux que rien
    const fallback = `Nouvelle pépite chez ${shopName} ✨ ${title} disponible sur Nunulia. #Nunulia ${countryTag}`.trim();
    return fallback.slice(0, 500);
  }
}
