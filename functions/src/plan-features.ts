/**
 * NUNULIA — Plan features (Cloud Functions copy)
 *
 * ⚠️ MUST stay in sync with utils/planFeatures.ts (frontend). Toute modification
 * d'un champ doit être appliquée dans les deux fichiers. Le frontend ne peut pas
 * importer ce module et inversement (build TS séparé).
 */

export type PlanId = 'free' | 'vendeur' | 'pro' | 'grossiste';

export interface PlanFeatures {
  maxProducts: number;
  canContactBuyer: boolean;
  badge: 'pro' | 'grossiste' | null;
  priorityRanking: boolean;
  requiresNif: boolean;
}

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
  free:      { maxProducts: 5,     canContactBuyer: false, badge: null,        priorityRanking: false, requiresNif: false },
  vendeur:   { maxProducts: 25,    canContactBuyer: false, badge: null,        priorityRanking: false, requiresNif: false },
  pro:       { maxProducts: 100,   canContactBuyer: true,  badge: 'pro',       priorityRanking: true,  requiresNif: false },
  grossiste: { maxProducts: 99999, canContactBuyer: true,  badge: 'grossiste', priorityRanking: true,  requiresNif: true  },
};

const LABEL_TO_ID: Record<string, PlanId> = {
  // Canonical
  'Découverte': 'free',
  'Vendeur':    'vendeur',
  'Pro':        'pro',
  'Grossiste':  'grossiste',
  // Legacy aliases (existing accounts)
  'Gratuit':              'free',
  'Découverte (Gratuit)': 'free',
  'Starter':              'vendeur',
  'Business Pro':         'pro',
  'Élite':                'pro',
  'Elite':                'pro',
  'Illimité':             'grossiste',
  'Grossiste Illimité':   'grossiste',
};

export function planIdFromLabel(label?: string | null): PlanId | null {
  if (!label) return null;
  return LABEL_TO_ID[label] ?? null;
}

export function featuresForLabel(label?: string | null): PlanFeatures {
  const id = planIdFromLabel(label);
  return PLAN_FEATURES[id ?? 'free'];
}

/** Pratique pour les checks Cloud Function : "ce vendeur peut-il contacter ?". */
export function canContactBuyer(tierLabel?: string, subscriptionExpiresAt?: number): boolean {
  if (subscriptionExpiresAt && Date.now() > subscriptionExpiresAt) return false;
  return featuresForLabel(tierLabel).canContactBuyer;
}
