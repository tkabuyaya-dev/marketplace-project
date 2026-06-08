/**
 * NUNULIA — Voice Listing Service (callable wrapper)
 *
 * Appelle la CF `transcribeListing` : envoie la note vocale du vendeur, reçoit
 * les champs produit extraits + traduits en FR pour pré-remplir le formulaire.
 *
 * Dégradation : toute erreur renvoie un objet { ok:false } typé pour que l'UI
 * affiche un toast adapté et laisse le vendeur saisir au clavier. La voix ne
 * bloque JAMAIS l'ajout produit.
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase-config';

export interface VoiceListingFields {
  title: string;
  price: number | null;
  currency: string | null;
  categorySlug: string | null;
  subCategory: string | null;
  city: string | null;
  attributes: string[];
  descriptionSeed: string | null;
}

export interface VoiceListingResult {
  transcript: string;
  detectedLanguage: string | null;
  sttConfidence: number;
  fields: VoiceListingFields;
  quotaUsed: number;
  quotaLimit: number; // -1 = illimité (Pro)
  isPro: boolean;
}

export type VoiceListingError =
  | { kind: 'quota_exceeded'; quotaUsed: number; quotaLimit: number }
  | { kind: 'unauthenticated' }
  | { kind: 'service_unavailable' }
  | { kind: 'invalid_input'; message: string };

export type VoiceListingRes =
  | { ok: true; data: VoiceListingResult }
  | { ok: false; error: VoiceListingError };

interface TranscribeRequest {
  audioBase64: string;
  countryId?: string;
}

/** Convertit un Blob audio en base64 pur (sans préfixe data:). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_error'));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('read_error'));
        return;
      }
      // result = "data:audio/webm;base64,XXXX" → on ne garde que XXXX
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcrit + extrait une note vocale produit. En cas d'erreur, renvoie
 * { ok:false, error } — l'UI retombe sur la saisie clavier.
 */
export async function transcribeVoiceListing(
  audioBlob: Blob,
  countryId?: string,
): Promise<VoiceListingRes> {
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

  const fn = httpsCallable<TranscribeRequest, VoiceListingResult>(fns, 'transcribeListing');

  try {
    const result = await fn({
      audioBase64,
      countryId,
    });
    return { ok: true, data: result.data };
  } catch (err) {
    const e = err as {
      code?: string;
      message?: string;
      details?: { quotaUsed?: number; quotaLimit?: number };
    };
    if (e.code === 'functions/unauthenticated') {
      return { ok: false, error: { kind: 'unauthenticated' } };
    }
    if (e.code === 'functions/resource-exhausted') {
      return {
        ok: false,
        error: {
          kind: 'quota_exceeded',
          quotaUsed: e.details?.quotaUsed ?? 10,
          quotaLimit: e.details?.quotaLimit ?? 10,
        },
      };
    }
    if (e.code === 'functions/invalid-argument') {
      return { ok: false, error: { kind: 'invalid_input', message: e.message || '' } };
    }
    return { ok: false, error: { kind: 'service_unavailable' } };
  }
}
