import { describe, it, expect } from 'vitest';
import {
  CURRENCY,
  PROVINCES_BURUNDI,
  INITIAL_COUNTRIES,
  INITIAL_SUBSCRIPTION_TIERS,
} from '../../constants';

describe('Constants', () => {
  it('uses FBu as currency', () => {
    expect(CURRENCY).toBe('FBu');
  });

  it('has 18 Burundi provinces', () => {
    expect(PROVINCES_BURUNDI).toHaveLength(18);
    expect(PROVINCES_BURUNDI).toContain('Bujumbura Mairie');
    expect(PROVINCES_BURUNDI).toContain('Gitega');
  });

  it('has 6 initial countries', () => {
    expect(INITIAL_COUNTRIES).toHaveLength(6);
    const codes = INITIAL_COUNTRIES.map(c => c.code);
    expect(codes).toEqual(['BI', 'CD', 'RW', 'UG', 'TZ', 'KE']);
  });

  it('subscription tiers are ordered by min', () => {
    for (let i = 1; i < INITIAL_SUBSCRIPTION_TIERS.length; i++) {
      expect(INITIAL_SUBSCRIPTION_TIERS[i].min).toBeGreaterThan(
        INITIAL_SUBSCRIPTION_TIERS[i - 1].min
      );
    }
  });

  it('free tier has no NIF required', () => {
    const free = INITIAL_SUBSCRIPTION_TIERS.find(t => t.id === 'free');
    expect(free?.requiresNif).toBe(false);
  });
});
