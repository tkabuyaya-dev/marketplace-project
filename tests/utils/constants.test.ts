import { describe, it, expect } from 'vitest';
import {
  CURRENCY,
  MARKETPLACES,
  getMarketplaceInfo,
  PROVINCES_BURUNDI,
  INITIAL_COUNTRIES,
  INITIAL_SUBSCRIPTION_TIERS,
} from '../../constants';

describe('Constants', () => {
  it('uses FBu as currency', () => {
    expect(CURRENCY).toBe('FBu');
  });

  it('has 5 marketplaces', () => {
    expect(MARKETPLACES).toHaveLength(5);
    expect(MARKETPLACES.map(m => m.id)).toEqual([
      'bata', 'kamenge', 'centre-ville', 'kinama', 'autres',
    ]);
  });

  it('getMarketplaceInfo returns correct marketplace', () => {
    const bata = getMarketplaceInfo('bata');
    expect(bata.name).toBe('Marché de Bata');
  });

  it('getMarketplaceInfo falls back to "autres" for unknown ID', () => {
    const unknown = getMarketplaceInfo('nonexistent' as any);
    expect(unknown.id).toBe('autres');
  });

  it('has 18 Burundi provinces', () => {
    expect(PROVINCES_BURUNDI).toHaveLength(18);
    expect(PROVINCES_BURUNDI).toContain('Bujumbura Mairie');
    expect(PROVINCES_BURUNDI).toContain('Gitega');
  });

  it('has 4 initial countries', () => {
    expect(INITIAL_COUNTRIES).toHaveLength(4);
    const codes = INITIAL_COUNTRIES.map(c => c.code);
    expect(codes).toEqual(['BI', 'CD', 'RW', 'UG']);
  });

  it('subscription tiers are ordered by min', () => {
    for (let i = 1; i < INITIAL_SUBSCRIPTION_TIERS.length; i++) {
      expect(INITIAL_SUBSCRIPTION_TIERS[i].min).toBeGreaterThan(
        INITIAL_SUBSCRIPTION_TIERS[i - 1].min
      );
    }
  });

  it('free tier has price 0 and no NIF required', () => {
    const free = INITIAL_SUBSCRIPTION_TIERS.find(t => t.id === 'free');
    expect(free?.price).toBe(0);
    expect(free?.requiresNif).toBe(false);
  });
});
