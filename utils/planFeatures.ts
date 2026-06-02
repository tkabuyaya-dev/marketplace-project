/**
 * NUNULIA — Plan features (single source of truth)
 *
 * Tout consommateur frontend qui doit décider ce qu'un plan permet
 * passe par ici. La copie pour Cloud Functions est dans
 * functions/src/plan-features.ts — toute modification doit rester synchrone
 * (test d'égalité à ajouter dans tests/rules).
 */

import { PlanFeatures, PlanId } from '../types';

export const PLAN_IDS: readonly PlanId[] = ['free', 'vendeur', 'pro', 'grossiste'] as const;

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
  free:      { maxProducts: 5,     canContactBuyer: false, badge: null,        priorityRanking: false, requiresNif: false, dailyStudioSessions: 1 },
  vendeur:   { maxProducts: 25,    canContactBuyer: false, badge: null,        priorityRanking: false, requiresNif: false, dailyStudioSessions: 2 },
  pro:       { maxProducts: 100,   canContactBuyer: true,  badge: 'pro',       priorityRanking: true,  requiresNif: false, dailyStudioSessions: 3 },
  grossiste: { maxProducts: 99999, canContactBuyer: true,  badge: 'grossiste', priorityRanking: true,  requiresNif: true,  dailyStudioSessions: 5 },
};

export const PLAN_LABELS: Record<PlanId, string> = {
  free:      'Découverte',
  vendeur:   'Vendeur',
  pro:       'Pro',
  grossiste: 'Grossiste',
};

/**
 * Map label → PlanId. Tolérant aux labels legacy laissés sur les comptes
 * existants pré-refonte. `Élite` (legacy) est traité comme `pro` (le plan
 * Élite a été supprimé ; les comptes Élite gardent leur tierLabel jusqu'à
 * expiration mais bénéficient des features Pro).
 */
const LABEL_TO_ID: Record<string, PlanId> = {
  // Canonical (post-refonte)
  'Découverte': 'free',
  'Vendeur':    'vendeur',
  'Pro':        'pro',
  'Grossiste':  'grossiste',
  // Legacy aliases — conservés pour les comptes existants
  'Gratuit':              'free',
  'Découverte (Gratuit)': 'free',
  'Starter':              'vendeur',
  'Business Pro':         'pro',
  'Élite':                'pro',         // Élite supprimé → mappé sur Pro
  'Elite':                'pro',
  'Illimité':             'grossiste',
  'Grossiste Illimité':   'grossiste',
};

export function planIdFromLabel(label?: string | null): PlanId | null {
  if (!label) return null;
  return LABEL_TO_ID[label] ?? null;
}

/** Renvoie les features d'un plan à partir de son label. Defaults à `free`. */
export function featuresForLabel(label?: string | null): PlanFeatures {
  const id = planIdFromLabel(label);
  return PLAN_FEATURES[id ?? 'free'];
}
