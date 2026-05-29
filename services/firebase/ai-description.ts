/**
 * NUNULIA — AI Description Service (callable wrapper)
 *
 * Appelle la CF generateProductDescription côté Anthropic Haiku 4.5.
 * Gère le fallback template + les erreurs de quota proprement.
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase-config';
import { generateDescription as generateTemplateFallback } from '../../utils/descriptionTemplates';

export interface AIDescriptionRequest {
  title: string;
  categorySlug: string;
  countryId?: string;
  shopName?: string;
}

export interface AIDescriptionResult {
  description: string;
  guessedFields: string[];
  cached: boolean;
  quotaUsed: number;
  quotaLimit: number;  // -1 = illimité (Pro)
  isPro: boolean;
}

export type AIDescriptionError =
  | { kind: 'quota_exceeded'; quotaUsed: number; quotaLimit: number }
  | { kind: 'unauthenticated' }
  | { kind: 'service_unavailable' }
  | { kind: 'invalid_input'; message: string };

export type AIDescriptionRes =
  | { ok: true; data: AIDescriptionResult }
  | { ok: false; error: AIDescriptionError; fallback: string };

/**
 * Génère une description IA. En cas d'erreur, renvoie un fallback template
 * + l'erreur pour que l'UI puisse afficher un toast adapté.
 */
export async function generateAIDescription(
  req: AIDescriptionRequest,
): Promise<AIDescriptionRes> {
  const fns = await getFirebaseFunctions();
  if (!fns) {
    return {
      ok: false,
      error: { kind: 'service_unavailable' },
      fallback: generateTemplateFallback(req.title, req.categorySlug),
    };
  }

  const fn = httpsCallable<AIDescriptionRequest, AIDescriptionResult>(
    fns,
    'generateProductDescription',
  );

  try {
    const result = await fn({
      title: req.title.trim(),
      categorySlug: req.categorySlug,
      countryId: req.countryId,
      shopName: req.shopName,
    });
    return { ok: true, data: result.data };
  } catch (err) {
    const e = err as { code?: string; message?: string; details?: { quotaUsed?: number; quotaLimit?: number } };
    const fallback = generateTemplateFallback(req.title, req.categorySlug);

    if (e.code === 'functions/unauthenticated') {
      return { ok: false, error: { kind: 'unauthenticated' }, fallback };
    }
    if (e.code === 'functions/resource-exhausted') {
      return {
        ok: false,
        error: {
          kind: 'quota_exceeded',
          quotaUsed: e.details?.quotaUsed ?? 3,
          quotaLimit: e.details?.quotaLimit ?? 3,
        },
        fallback,
      };
    }
    if (e.code === 'functions/invalid-argument') {
      return { ok: false, error: { kind: 'invalid_input', message: e.message || '' }, fallback };
    }
    // 'functions/internal' ou autre — service down, fallback template silencieux
    return { ok: false, error: { kind: 'service_unavailable' }, fallback };
  }
}
