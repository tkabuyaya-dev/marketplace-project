/**
 * NUNULIA — Voice Search Service (callable wrapper)
 *
 * Appelle la CF `transcribeSearch` (publique, STT-only) et renvoie le texte
 * dicté pour alimenter la barre de recherche. Joint le deviceId pour le
 * rate-limit anti-abus côté serveur.
 *
 * Dégradation : toute erreur → { ok:false } typé, le front retombe sur le
 * clavier.
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase-config';
import { getDeviceId } from '../../utils/deviceFingerprint';
import { blobToBase64 } from './voice-listing';

export interface VoiceSearchResult {
  transcript: string;
  detectedLanguage: string | null;
}

export type VoiceSearchError =
  | { kind: 'rate_limited' }
  | { kind: 'service_unavailable' }
  | { kind: 'invalid_input'; message: string };

export type VoiceSearchRes =
  | { ok: true; data: VoiceSearchResult }
  | { ok: false; error: VoiceSearchError };

interface SearchRequest {
  audioBase64: string;
  deviceId: string | null;
}

export async function transcribeVoiceSearch(audioBlob: Blob): Promise<VoiceSearchRes> {
  const fns = await getFirebaseFunctions();
  if (!fns) {
    return { ok: false, error: { kind: 'service_unavailable' } };
  }

  let audioBase64: string;
  try {
    audioBase64 = await blobToBase64(audioBlob);
  } catch {
    return { ok: false, error: { kind: 'service_unavailable' } };
  }

  // deviceId best-effort (anti-abus serveur) — null si indisponible.
  let deviceId: string | null = null;
  try {
    deviceId = await getDeviceId();
  } catch {
    deviceId = null;
  }

  const fn = httpsCallable<SearchRequest, VoiceSearchResult>(fns, 'transcribeSearch');

  try {
    const result = await fn({
      audioBase64,
      deviceId,
    });
    return { ok: true, data: result.data };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'functions/resource-exhausted') {
      return { ok: false, error: { kind: 'rate_limited' } };
    }
    if (e.code === 'functions/invalid-argument') {
      return { ok: false, error: { kind: 'invalid_input', message: e.message || '' } };
    }
    return { ok: false, error: { kind: 'service_unavailable' } };
  }
}
