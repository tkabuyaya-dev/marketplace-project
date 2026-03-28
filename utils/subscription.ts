/**
 * NUNULIA — Subscription Utilities (shared between client components)
 *
 * Pure functions for subscription status computation.
 * No Firebase calls — these work with data already loaded in context.
 */

import { SubscriptionTier } from '../types';
import { INITIAL_SUBSCRIPTION_TIERS } from '../constants';

export interface SubscriptionStatus {
  currentTier: SubscriptionTier;
  isExpired: boolean;
  isPaidTier: boolean;
  daysRemaining: number | null;
  isLimitReached: boolean;
  effectiveLimit: number;
  progressPercentage: number;
}

interface SubscriptionInput {
  maxProducts?: number;
  tierLabel?: string;
  subscriptionExpiresAt?: number;
  productCount: number;
  hasNif: boolean;
}

/**
 * Compute the full subscription status from seller data.
 * Single source of truth — used by SellerDashboard and any other component.
 */
export function getSubscriptionStatus(input: SubscriptionInput): SubscriptionStatus {
  const { maxProducts = 5, tierLabel, subscriptionExpiresAt, productCount, hasNif } = input;

  const isPaidTier = maxProducts > 5;
  const isExpired = subscriptionExpiresAt ? Date.now() > subscriptionExpiresAt : false;
  const daysRemaining = subscriptionExpiresAt
    ? Math.max(0, Math.ceil((subscriptionExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Determine current tier (same logic as before, centralized)
  let currentTier: SubscriptionTier;

  if (isPaidTier && isExpired) {
    // Expired → force free tier
    currentTier = INITIAL_SUBSCRIPTION_TIERS[0];
  } else if (maxProducts !== undefined && tierLabel) {
    // Admin-set tier
    currentTier = {
      id: 'admin_set',
      label: tierLabel,
      min: 0,
      max: maxProducts >= 99999 ? null : maxProducts,
      price: 0,
      requiresNif: true,
    };
  } else if (!hasNif) {
    currentTier = INITIAL_SUBSCRIPTION_TIERS[0];
  } else {
    currentTier = INITIAL_SUBSCRIPTION_TIERS.find(t =>
      t.requiresNif && productCount >= t.min && (t.max === null || productCount <= t.max)
    ) || INITIAL_SUBSCRIPTION_TIERS[1];
  }

  const effectiveLimit = currentTier.max === null ? Infinity : currentTier.max;
  const isLimitReached = currentTier.max !== null && productCount >= currentTier.max;
  const progressPercentage = currentTier.max ? (productCount / currentTier.max) * 100 : 100;

  return {
    currentTier,
    isExpired,
    isPaidTier,
    daysRemaining,
    isLimitReached,
    effectiveLimit,
    progressPercentage,
  };
}
