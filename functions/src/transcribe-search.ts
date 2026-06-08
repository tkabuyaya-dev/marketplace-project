/**
 * NUNULIA — Voice Search : transcription (callable, public)
 *
 * L'acheteur dicte sa recherche → cette CF transcrit l'audio (Google STT v2
 * Chirp 2) et renvoie le texte, qui alimente la recherche Algolia existante.
 *
 * Différences avec transcribeListing :
 *   - PUBLIC (pas d'auth) : les acheteurs anonymes peuvent dicter.
 *   - STT-only : pas d'extraction Claude (plus rapide, moins cher).
 *   - Anti-abus : rate-limit quotidien par deviceId (ou IP en fallback),
 *     car sans auth le coût STT est un vecteur d'abus.
 *
 * Dégradation : toute erreur → HttpsError, le front retombe sur la saisie
 * clavier. La voix n'est qu'un canal d'entrée supplémentaire.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";
import { transcribeAudioToText, STT_LOCATION } from "./stt.js";

// Clips de recherche plus courts qu'une annonce → cap plus serré (~50s).
const MAX_AUDIO_BASE64_CHARS = 1_500_000;
// Plafonds quotidiens distincts selon l'axe de rate-limit :
//  - deviceId : axe précis (1 appareil) → cap serré.
//  - IP (fallback sans deviceId) : un même CGNAT opérateur africain peut
//    masquer des milliers d'utilisateurs → cap large pour ne pas bloquer des
//    utilisateurs légitimes, tout en stoppant une IP unique qui s'emballe.
const DAILY_CAP_DEVICE = 30;
const DAILY_CAP_IP = 300;
const USAGE_COLLECTION = "voiceSearchUsage";

interface SearchInput {
  audioBase64?: string;
  deviceId?: string | null;
}

interface SearchOutput {
  transcript: string;
  detectedLanguage: string | null;
}

/** Date locale UTC+2 (Burundi/Rwanda) au format YYYY-MM-DD. */
function getLocalDateKey(): string {
  const offsetMs = 2 * 60 * 60 * 1000;
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10);
}

/** deviceId 12-16 chars alphanum (cf. utils/deviceFingerprint.ts). */
function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{12,16}$/.test(value);
}

export const transcribeSearch = onCall<SearchInput, Promise<SearchOutput>>(
  {
    region: "europe-west1",
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request) => {
    // ── 1. Validation input ──────────────────────────────────────────────
    const audioBase64 = (request.data.audioBase64 || "").trim();
    if (!audioBase64) {
      throw new HttpsError("invalid-argument", "Audio manquant.");
    }
    if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      throw new HttpsError("invalid-argument", "Enregistrement trop long.");
    }

    const db = await getDb();
    const dateKey = getLocalDateKey();

    // ── 2. Rate-limit par deviceId (ou IP en fallback) ───────────────────
    // Sans auth, c'est notre garde-fou coût. Fail-open : si la vérif échoue
    // (Firestore down), on laisse passer — le STT search reste peu coûteux.
    const deviceId = isValidDeviceId(request.data.deviceId) ? request.data.deviceId : null;
    const ip = (request.rawRequest as { ip?: string } | undefined)?.ip ?? null;
    const key = deviceId || (ip ? `ip_${ip.replace(/[^a-zA-Z0-9]/g, "")}` : null);
    const cap = deviceId ? DAILY_CAP_DEVICE : DAILY_CAP_IP;

    let allowed = true;
    if (key) {
      try {
        const ref = db.collection(USAGE_COLLECTION).doc(key);
        allowed = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const data = snap.exists
            ? (snap.data() as { date?: string; count?: number })
            : null;
          const count = data && data.date === dateKey ? data.count || 0 : 0;
          if (count >= cap) return false;
          tx.set(
            ref,
            { date: dateKey, count: count + 1, lastAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
          return true;
        });
      } catch (err) {
        logger.warn("[transcribe-search] rate-limit check failed (fail-open)", {
          error: err instanceof Error ? err.message : String(err),
        });
        allowed = true;
      }
    }
    if (!allowed) {
      throw new HttpsError(
        "resource-exhausted",
        "Trop de recherches vocales aujourd'hui. Réessayez plus tard.",
      );
    }

    // ── 3. Transcription (helper partagé) ────────────────────────────────
    try {
      const stt = await transcribeAudioToText(audioBase64);
      logger.info("[transcribe-search] success", {
        lang: stt.language,
        len: stt.transcript.length,
        hasDevice: !!deviceId,
      });
      return { transcript: stt.transcript, detectedLanguage: stt.language };
    } catch (err) {
      logger.error("[transcribe-search] STT error", {
        error: err instanceof Error ? err.message : String(err),
        location: STT_LOCATION,
      });
      throw new HttpsError("unavailable", "Transcription temporairement indisponible.");
    }
  },
);
