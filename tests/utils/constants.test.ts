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

  it('has 3 active countries at launch (Grands Lacs : BI, CD, RW)', () => {
    const activeCodes = INITIAL_COUNTRIES.filter(c => c.isActive).map(c => c.code);
    expect(activeCodes).toEqual(['BI', 'CD', 'RW']);
  });

  it('has 3 scaffolded countries for expansion (TZ, KE, UG), all inactive by default', () => {
    const scaffolded = INITIAL_COUNTRIES.filter(c => !c.isActive);
    expect(scaffolded.map(c => c.code)).toEqual(['TZ', 'KE', 'UG']);
    // Safety: scaffolded countries must remain off until admin manually enables them
    scaffolded.forEach(c => expect(c.isActive).toBe(false));
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
