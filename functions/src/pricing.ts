/**
 * NUNULIA — Pricing partagé Cloud Functions (Lot D, audit A2)
 *
 * Source unique côté CF pour la grille tarifaire et les durées de période.
 * Remplace les copies locales qui vivaient dans approve-renewal.ts et
 * modify-subscription-request.ts (dérive garantie à 3 exemplaires).
 *
 * Ordre de résolution des prix :
 *   1. Override admin Firestore `subscriptionPricing/{countryId}` (éditeur
 *      admin livré au Lot 5 — modifiable sans redéploiement)
 *   2. DEFAULT_PRICING ci-dessous (seed/fallback — miroir de
 *      DEFAULT_SUBSCRIPTION_PRICING dans constants.ts frontend)
 */

export type PricingSource = "override" | "defaults" | "no_pricing";

/** Miroir de DEFAULT_SUBSCRIPTION_PRICING (constants.ts front). Seed/fallback only. */
export const DEFAULT_PRICING: Record<string, { prices: Record<string, number>; currency: string }> = {
  bi: { prices: { vendeur: 9900,  pro: 29000, grossiste: 75000 }, currency: "BIF" },
  cd: { prices: { vendeur: 6000,  pro: 19000, grossiste: 42000 }, currency: "CDF" },
  rw: { prices: { vendeur: 2500,  pro: 7800,  grossiste: 17000 }, currency: "RWF" },
  tz: { prices: { vendeur: 4500,  pro: 15500, grossiste: 34000 }, currency: "TZS" },
  ke: { prices: { vendeur: 650,   pro: 2000,  grossiste: 5000   }, currency: "KES" },
  ug: { prices: { vendeur: 18500, pro: 55500, grossiste: 140000 }, currency: "UGX" },
};

/** Durée d'une période d'abonnement (jours fixes — décision A4 : 30/90/365). */
export function periodToDurationMs(period?: string): number {
  if (period === "3m")  return 90  * 24 * 60 * 60 * 1000;
  if (period === "12m") return 365 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000; // default 1m
}

/** Multiplicateur période × remise (cohérent avec getPeriodPrice frontend). */
export function periodMultiplier(period?: string): number {
  if (period === "3m")  return 3 * 0.9;    // -10%
  if (period === "12m") return 12 * 0.75;  // -25%
  return 1;
}

export interface BasePrices {
  prices: Record<string, number> | null;
  currency: string | null;
  source: PricingSource;
}

/**
 * Grille mensuelle + devise applicables à un pays.
 * Ne throw jamais — `prices: null` si aucune grille (fail-safe appelant).
 */
export async function loadBasePrices(
  db: FirebaseFirestore.Firestore,
  countryId: string,
): Promise<BasePrices> {
  try {
    const overrideSnap = await db.collection("subscriptionPricing").doc(countryId).get();
    if (overrideSnap.exists) {
      const data = overrideSnap.data() as any;
      const prices = data?.prices ?? null;
      if (prices) {
        return {
          prices,
          currency: typeof data?.currency === "string" ? data.currency : DEFAULT_PRICING[countryId]?.currency ?? null,
          source: "override",
        };
      }
    }
  } catch {
    // ignore — fallback defaults
  }
  const fallback = DEFAULT_PRICING[countryId];
  if (fallback) return { prices: fallback.prices, currency: fallback.currency, source: "defaults" };
  return { prices: null, currency: null, source: "no_pricing" };
}
