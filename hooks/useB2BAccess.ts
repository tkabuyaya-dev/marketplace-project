/**
 * NUNULIA — useB2BAccess
 *
 * Source de vérité unique pour le contrôle d'accès au Réseau B2B.
 * Aligné sur PLAN_FEATURES.canContactBuyer (Pro + Grossiste actifs).
 *
 * Le JWT ne porte PAS le subscriptionTier (cf. functions/src/sync-user-claims).
 * On lit donc directement currentUser.sellerDetails.tierLabel — déjà mis à
 * jour en temps réel via subscribeToUserProfile dans AuthContext.
 */

import { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { B2BAccess, PlanId } from '../types';

const PRO_LABELS = new Set([
  'Pro', 'Business Pro', 'Élite', 'Elite',
  'Grossiste', 'Grossiste Illimité', 'Illimité',
]);

function tierFromLabel(label?: string | null): PlanId {
  const l = (label || '').toLowerCase();
  if (l.includes('grossiste') || l.includes('illim') || l.includes('unlimited')) return 'grossiste';
  if (l.includes('pro') || l.includes('élite') || l.includes('elite')) return 'pro';
  if (l.includes('vendeur') || l.includes('starter')) return 'vendeur';
  return 'free';
}

export function useB2BAccess(): B2BAccess {
  const { currentUser } = useAppContext();

  return useMemo<B2BAccess>(() => {
    if (!currentUser) {
      return { canView: true, canInteract: false, canPublish: false, tier: 'free', isAuth: false };
    }
    const tierLabel = currentUser.sellerDetails?.tierLabel || '';
    const tier = tierFromLabel(tierLabel);
    const expiresAt = currentUser.sellerDetails?.subscriptionExpiresAt;
    const notExpired = !expiresAt || expiresAt > Date.now();
    const allowed = PRO_LABELS.has(tierLabel) && notExpired;

    return {
      canView: true,
      canInteract: allowed,
      canPublish: allowed,
      tier,
      isAuth: true,
    };
  }, [currentUser]);
}
