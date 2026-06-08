/**
 * NUNULIA — Speech-to-Text v2 (Chirp 2) — helper REST partagé
 *
 * Mutualise l'appel Google Speech-to-Text entre transcribe-listing.ts (voice
 * listing) et transcribe-search.ts (voice search).
 *
 * REST + metadata server (token ADC) plutôt que @google-cloud/speech : esbuild
 * (functions/build.mjs) bundle tout sauf firebase-admin, et la lib gRPC casse
 * une fois bundlée. → 0 dépendance npm, 0 secret.
 *
 * Pré-requis infra (one-time) : API `speech.googleapis.com` activée sur le
 * projet GCP, et le service account du runtime autorisé à l'appeler.
 */

// Région où le modèle Chirp 2 est servi. Surchargeable via env STT_LOCATION.
// Défaut us-central1 : disponibilité Chirp 2 large. Latence non critique.
const STT_LOCATION = process.env.STT_LOCATION || "us-central1";

// Détection AUTOMATIQUE de langue par Chirp 2 : le modèle identifie seul la
// langue (FR/EN/swahili/…). NE PAS lister les codes à la main — un code non
// supporté (ex "sw-TZ" à us-central1) fait planter TOUTE la requête en
// 400 INVALID_ARGUMENT. "auto" est la valeur documentée pour la détection auto.
const STT_LANGUAGE_CODES = ["auto"];

export interface SttResult {
  transcript: string;
  confidence: number;
  language: string | null;
}

/** Project ID du runtime (gen2 expose GCLOUD_PROJECT). */
function getProjectId(): string {
  const id = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
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
  if (!res.ok) throw new Error(`metadata token HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("metadata token vide");
  return data.access_token;
}

/** Appel Speech-to-Text v2 recognize (Chirp 2) en REST sur le recognizer `_`. */
async function recognize(
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

/**
 * Transcrit un audio base64 en texte. Throw si projectId introuvable, token
 * indisponible, ou erreur STT — l'appelant convertit en HttpsError.
 */
export async function transcribeAudioToText(audioBase64: string): Promise<SttResult> {
  const projectId = getProjectId();
  if (!projectId) throw new Error("projectId introuvable dans l'env runtime");
  const token = await getAccessToken();
  return recognize(audioBase64, projectId, token);
}

export { STT_LOCATION };
