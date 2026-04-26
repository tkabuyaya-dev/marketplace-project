import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readCache, writeCache, clearByPrefix } from '../../services/sessionCache';

describe('sessionCache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing keys', () => {
    expect(readCache('p_', 'nope')).toBeUndefined();
  });

  it('round-trips a value', () => {
    writeCache('p_', 'foo', { a: 1, b: 'two' });
    expect(readCache<{ a: number; b: string }>('p_', 'foo')).toEqual({ a: 1, b: 'two' });
  });

  it('isolates entries by prefix', () => {
    writeCache('a_', 'k', 'fromA');
    writeCache('b_', 'k', 'fromB');
    expect(readCache('a_', 'k')).toBe('fromA');
    expect(readCache('b_', 'k')).toBe('fromB');
  });

  it('expires entries past the TTL window (30 min)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    writeCache('p_', 'k', 'value');
    vi.setSystemTime(new Date('2026-01-01T00:31:00Z')); // +31 min
    expect(readCache('p_', 'k')).toBeUndefined();
    // Expired entry should also be evicted from sessionStorage
    expect(sessionStorage.getItem('p_k')).toBeNull();
  });

  it('returns the value when read just before expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    writeCache('p_', 'k', 'value');
    vi.setSystemTime(new Date('2026-01-01T00:29:00Z')); // +29 min
    expect(readCache('p_', 'k')).toBe('value');
  });

  it('clearByPrefix removes only matching keys', () => {
    writeCache('a_', 'x', 1);
    writeCache('a_', 'y', 2);
    writeCache('b_', 'x', 3);
    clearByPrefix('a_');
    expect(readCache('a_', 'x')).toBeUndefined();
    expect(readCache('a_', 'y')).toBeUndefined();
    expect(readCache('b_', 'x')).toBe(3);
  });

  it('handles corrupted JSON gracefully', () => {
    sessionStorage.setItem('p_bad', 'not-json{');
    expect(readCache('p_', 'bad')).toBeUndefined();
  });

  it('supports arrays of plain objects (typical Algolia hits)', () => {
    const products = [
      { id: '1', title: 'TV', price: 100 },
      { id: '2', title: 'PC', price: 500 },
    ];
    writeCache('ac_', 'tv|bi', products);
    expect(readCache('ac_', 'tv|bi')).toEqual(products);
  });
});
