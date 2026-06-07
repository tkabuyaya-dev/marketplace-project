/**
 * NUNULIA — Voice-first Listing : transcription + extraction (callable)
 *
 * Le vendeur enregistre une note vocale décrivant son produit (dans sa langue :
 * français, anglais, swahili, kinyarwanda…). Cette CF :
 *   1. Transcrit l'audio via Google Speech-to-Text v2 (modèle Chirp 2)
 *   2. Demande à Claude Haiku 4.5 d'EXTRAIRE + TRADUIRE en FR les champs
 *      structurés (titre, prix, devise, catégorie, ville, attributs)
 *   3. Renvoie le tout pour pré-remplir le formulaire d'ajout produit
 *
 * ── POURQUOI REST + metadata server (pas @google-cloud/speech) ──────────────
 * Le bundler esbuild (functions/build.mjs) embarque tout sauf firebase-admin.
 * @google-cloud/speech (gRPC + fichiers proto chargés dynamiquement) casse une
 * fois bundlé. On appelle donc l'API Speech-to-Text v2 en REST avec un token
 * OAuth récupéré sur le metadata server (ADC natif du runtime Cloud Functions).
 *   → 0 nouvelle dépendance npm, 0 risque de bundling, 0 nouveau secret.
 * Pré-requis infra (one-time) : activer l'API "Cloud Speech-to-Text" sur le
 * projet GCP. Le service account du runtime peut alors appeler l'API.
 *
 * ── Dégradation ─────────────────────────────────────────────────────────────
 * Toute erreur (STT down, langue non reconnue, JSON Claude mal formé) renvoie
 * une HttpsError que le front rattrape pour retomber sur la saisie clavier.
 * La voix est un BONUS — jamais un point de blocage.
 *
 * Coût estimé : Google STT ~$0.006/min (~$0.0015 pour 15s) + Claude Haiku
 * ~$0.0013/extraction. Quota Free 10/jour, Pro illimité.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS, ANTHROPIC_API_KEY } from "./config.js";
import { featuresForLabel } from "./plan-features.js";

// Région où le modèle Chirp 2 est servi. Surchargeable via env STT_LOCATION
// (ex: "europe-west4" pour garder la donnée en Europe). Défaut us-central1 :
// disponibilité Chirp 2 large et stable. La latence n'est pas critique (flux
// d'ajout produit, pas temps réel).
const STT_LOCATION = process.env.STT_LOCATION || "us-central1";

// Langues candidates pour l'auto-détection Chirp 2. Ordre = priorité de tie-break.
const STT_LANGUAGE_CODES = ["fr-FR", "en-US", "sw-TZ", "rw-RW"];

const FREE_DAILY_VOICE_QUOTA = 10;
// Plafond taille audio (base64). ~2.5M chars ≈ ~1.8 Mo ≈ ~90s de voix Opus.
// Au-delà = refus (protège coût + timeout).
const MAX_AUDIO_BASE64_CHARS = 2_500_000;

// Source de vérité des slugs : functions/src/ai-classify-category.ts (VALID_SLUGS).
// Dupliqué ici volontairement pour ne pas modifier un fichier calibré et garder
// cette CF découplée. Garder les deux listes synchrones si on ajoute une catégorie.
const VALID_SLUGS = new Set([
  "electronique-telephonie",
  "mode-accessoires",
  "beaute-sante",
  "restaurant",
  "supermarche-alimentaire",
  "maison-cuisine",
  "bebe-enfants",
  "sport-loisirs",
  "education-fournitures",
  "construction-btp",
  "auto-moto",
  "energie-solaire",
  "agriculture-elevage",
  "services",
  "immobilier",
  "emploi-recrutement",
  "evenements-ceremonies",
]);

const EXTRACTION_SYSTEM_PROMPT = `Tu es l'assistant d'ajout produit de Nunulia, marketplace en Afrique de l'Est centrale (Burundi/RDC/Rwanda/Tanzanie).

Un vendeur a dicté une note vocale décrivant un produit à vendre. On te donne la TRANSCRIPTION (qui peut être en français, anglais, swahili, kinyarwanda ou kirundi, et peut contenir des erreurs de transcription).

Tu dois EXTRAIRE les informations et les TRADUIRE EN FRANÇAIS, puis répondre UNIQUEMENT en JSON valide :
{
  "title": "titre produit court et clair en français (max 80 caractères)",
  "price": nombre ou null,
  "currency": "USD" | "BIF" | "CDF" | "RWF" | "TZS" | null,
  "categorySlug": "un slug EXACT de la liste ci-dessous, ou null si incertain",
  "subCategory": "sous-catégorie en texte libre ou null",
  "city": "ville mentionnée ou null",
  "attributes": ["caractéristique 1", "caractéristique 2"],
  "descriptionSeed": "1-2 phrases de description en français à partir de ce qui a été dit, ou null"
}

Slugs de catégorie autorisés (categorySlug doit être l'un d'eux EXACTEMENT) :
electronique-telephonie, mode-accessoires, beaute-sante, restaurant, supermarche-alimentaire, maison-cuisine, bebe-enfants, sport-loisirs, education-fournitures, construction-btp, auto-moto, energie-solaire, agriculture-elevage, services, immobilier, emploi-recrutement, evenements-ceremonies

RÈGLES :
1. Réponds UNIQUEMENT le JSON, sans markdown, sans prose avant/après.
2. Le titre est TOUJOURS en français, même si la voix était dans une autre langue.
3. price : extrais le nombre seul (ex: "180 dollars" → price 180, currency "USD"). Si aucun prix clair, price=null.
4. N'INVENTE PAS de prix ni de catégorie. Dans le doute → null.
5. Si la transcription est inintelligible, renvoie title="" et tout le reste null/[].`;

interface TranscribeInput {
  /** Audio encodé base64 (sans le préfixe data:). */
  audioBase64?: string;
  /** Type MIME réel de l'enregistrement (ex: "audio/webm;codecs=opus", "audio/mp4"). */
  mimeType?: string;
  /** Pays du vendeur (aide la devise par défaut côté extraction). */
  countryId?: string;
}

interface ExtractedFields {
  title: string;
  price: number | null;
  currency: string | null;
  categorySlug: string | null;
  subCategory: string | null;
  city: string | null;
  attributes: string[];
  descriptionSeed: string | null;
}

interface TranscribeOutput {
  transcript: string;
  detectedLanguage: string | null;
  sttConfidence: number;
  fields: ExtractedFields;
  quotaUsed: number;
  quotaLimit: number; // -1 = illimité (Pro)
  isPro: boolean;
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

/** Date locale UTC+2 (Burundi/Rwanda) au format YYYY-MM-DD (reset quota local). */
function getLocalDateKey(): string {
  const offsetMs = 2 * 60 * 60 * 1000;
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
}

/** Project ID du runtime (gen2 expose GCLOUD_PROJECT). */
function getProjectId(): string {
  const id =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "";
  if (id) return id;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
    return cfg.projectId || "";
  } catch {
    return "";
  }
}

/** Token OAuth du service account du runtime via le metadata server (ADC). */
async function getAccessToken(): Promise<string> {
  const url =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
  const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
  if (!res.ok) {
    throw new Error(`metadata token HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("metadata token vide");
  return data.access_token;
}

interface SttResult {
  transcript: string;
  confidence: number;
  language: string | null;
}

/** Appel Speech-to-Text v2 recognize (Chirp 2) en REST. */
async function transcribeAudio(
  audioBase64: string,
  projectId: string,
  token: string,
): Promise<SttResult> {
  const endpoint = `https://${STT_LOCATION}-speech.googleapis.com/v2/projects/${projectId}/locations/${STT_LOCATION}/recognizers/_:recognize`;
  const body = {
    config: {
      autoDecodingConfig: {},
      model: "chirp_2",
      languageCodes: STT_LANGUAGE_CODES,
      features: { enableAutomaticPunctuation: true },
    },
    content: audioBase64,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`STT HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
      languageCode?: string;
    }>;
  };

  const parts: string[] = [];
  let confSum = 0;
  let confN = 0;
  let language: string | null = null;
  for (const r of data.results || []) {
    const alt = r.alternatives?.[0];
    if (alt?.transcript) parts.push(alt.transcript);
    if (typeof alt?.confidence === "number") {
      confSum += alt.confidence;
      confN += 1;
    }
    if (!language && r.languageCode) language = r.languageCode;
  }

  return {
    transcript: parts.join(" ").trim(),
    confidence: confN > 0 ? confSum / confN : 0,
    language,
  };
}

/** Extraction structurée via Claude Haiku — renvoie des champs sûrs/normalisés. */
async function extractFields(
  transcript: string,
  countryId: string,
): Promise<ExtractedFields> {
  const empty: ExtractedFields = {
    title: "",
    price: null,
    currency: null,
    categorySlug: null,
    subCategory: null,
    city: null,
    attributes: [],
    descriptionSeed: null,
  };
  if (!transcript) return empty;

  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Pays du vendeur : ${countryId || "inconnu"}\nTranscription : "${transcript}"\n\nRéponds UNIQUEMENT avec le JSON.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return empty;
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return empty;

  let parsed: Partial<ExtractedFields>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedFields>;
  } catch {
    return empty;
  }

  // Normalisation + garde-fous (ne jamais propager un slug inventé).
  const slug =
    typeof parsed.categorySlug === "string" && VALID_SLUGS.has(parsed.categorySlug)
      ? parsed.categorySlug
      : null;
  const price =
    typeof parsed.price === "number" && isFinite(parsed.price) && parsed.price > 0
      ? parsed.price
      : null;
  const attributes = Array.isArray(parsed.attributes)
    ? parsed.attributes
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .slice(0, 8)
    : [];

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 80) : "",
    price,
    currency: typeof parsed.currency === "string" ? parsed.currency.trim().slice(0, 8) : null,
    categorySlug: slug,
    subCategory:
      typeof parsed.subCategory === "string" && parsed.subCategory.trim()
        ? parsed.subCategory.trim().slice(0, 80)
        : null,
    city:
      typeof parsed.city === "string" && parsed.city.trim()
        ? parsed.city.trim().slice(0, 80)
        : null,
    attributes,
    descriptionSeed:
      typeof parsed.descriptionSeed === "string" && parsed.descriptionSeed.trim()
        ? parsed.descriptionSeed.trim().slice(0, 500)
        : null,
  };
}

export const transcribeListing = onCall<TranscribeInput, Promise<TranscribeOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    // ── 2. Validation input ──────────────────────────────────────────────
    const audioBase64 = (request.data.audioBase64 || "").trim();
    const countryId = (request.data.countryId || "").trim();
    if (!audioBase64) {
      throw new HttpsError("invalid-argument", "Audio manquant.");
    }
    if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      throw new HttpsError("invalid-argument", "Enregistrement trop long (max ~90s).");
    }

    const db = await getDb();

    // ── 3. Pro check + quota Free (aligné sur generateProductDescription) ──
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("permission-denied", "Profil introuvable.");
    }
    const userData = userSnap.data() as {
      sellerDetails?: { tierLabel?: string; subscriptionExpiresAt?: number };
    };
    const tierLabel = userData.sellerDetails?.tierLabel || "";
    const expiresAt = userData.sellerDetails?.subscriptionExpiresAt || 0;
    const isProActive =
      featuresForLabel(tierLabel).canContactBuyer && (!expiresAt || Date.now() < expiresAt);

    const dateKey = getLocalDateKey();
    const quotaRef = db
      .collection("users")
      .doc(uid)
      .collection("aiUsage")
      .doc(`${dateKey}_voice`);
    let currentCount = 0;
    if (!isProActive) {
      const quotaSnap = await quotaRef.get();
      currentCount = quotaSnap.exists ? quotaSnap.data()?.count || 0 : 0;
      if (currentCount >= FREE_DAILY_VOICE_QUOTA) {
        throw new HttpsError(
          "resource-exhausted",
          `Limite quotidienne atteinte (${FREE_DAILY_VOICE_QUOTA} annonces vocales/jour). Passez Pro pour un usage illimité.`,
          { quotaUsed: currentCount, quotaLimit: FREE_DAILY_VOICE_QUOTA, isPro: false },
        );
      }
    }

    // ── 4. Transcription (Google STT v2 Chirp 2) ─────────────────────────
    const projectId = getProjectId();
    if (!projectId) {
      logger.error("[transcribe-listing] projectId introuvable dans l'env runtime");
      throw new HttpsError("internal", "Configuration serveur incomplète.");
    }

    let stt: SttResult;
    try {
      const token = await getAccessToken();
      stt = await transcribeAudio(audioBase64, projectId, token);
    } catch (err) {
      logger.error("[transcribe-listing] STT error", {
        error: err instanceof Error ? err.message : String(err),
        uid,
        location: STT_LOCATION,
      });
      throw new HttpsError("unavailable", "Transcription temporairement indisponible.");
    }

    // ── 5. Extraction structurée (Claude Haiku) ──────────────────────────
    let fields: ExtractedFields;
    try {
      fields = await extractFields(stt.transcript, countryId);
    } catch (err) {
      logger.error("[transcribe-listing] extraction error", {
        error: err instanceof Error ? err.message : String(err),
        uid,
      });
      // On a quand même le transcript brut — on le renvoie pour édition manuelle.
      fields = {
        title: stt.transcript.slice(0, 80),
        price: null,
        currency: null,
        categorySlug: null,
        subCategory: null,
        city: null,
        attributes: [],
        descriptionSeed: null,
      };
    }

    // ── 6. Débit quota (Free uniquement, best-effort) ────────────────────
    if (!isProActive) {
      try {
        await quotaRef.set(
          { count: currentCount + 1, lastUsedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      } catch (err) {
        logger.warn("[transcribe-listing] quota write failed (non-blocking)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[transcribe-listing] success", {
      uid,
      lang: stt.language,
      conf: Math.round(stt.confidence * 100) / 100,
      transcriptLen: stt.transcript.length,
      hasTitle: !!fields.title,
      hasPrice: fields.price != null,
      slug: fields.categorySlug,
    });

    return {
      transcript: stt.transcript,
      detectedLanguage: stt.language,
      sttConfidence: stt.confidence,
      fields,
      quotaUsed: isProActive ? 0 : currentCount + 1,
      quotaLimit: isProActive ? -1 : FREE_DAILY_VOICE_QUOTA,
      isPro: isProActive,
    };
  },
);
