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

  it('subscription tiers are ordered by max products (asc, null = illimité en dernier)', () => {
    // Post-refonte (2026-06) : les tiers sont choisis explicitement par le vendeur,
    // pas auto-graduated par productCount. On ordonne par capacité max croissante.
    for (let i = 1; i < INITIAL_SUBSCRIPTION_TIERS.length; i++) {
      const prev = INITIAL_SUBSCRIPTION_TIERS[i - 1].max;
      const curr = INITIAL_SUBSCRIPTION_TIERS[i].max;
      const prevVal = prev === null ? Infinity : prev;
      const currVal = curr === null ? Infinity : curr;
      expect(currVal).toBeGreaterThan(prevVal);
    }
  });

  it('free tier has no NIF required', () => {
    const free = INITIAL_SUBSCRIPTION_TIERS.find(t => t.id === 'free');
    expect(free?.requiresNif).toBe(false);
  });

  it('only Grossiste requires NIF (post-refonte 2026-06)', () => {
    const nifRequired = INITIAL_SUBSCRIPTION_TIERS.filter(t => t.requiresNif);
    expect(nifRequired).toHaveLength(1);
    expect(nifRequired[0].id).toBe('grossiste');
  });

  it('has 4 tiers : free, vendeur, pro, grossiste', () => {
    expect(INITIAL_SUBSCRIPTION_TIERS.map(t => t.id)).toEqual([
      'free', 'vendeur', 'pro', 'grossiste',
    ]);
  });
});
