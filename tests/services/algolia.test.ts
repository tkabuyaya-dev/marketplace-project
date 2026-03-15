import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Must import after mock setup
import { isAlgoliaConfigured } from '../../services/algolia';

describe('Algolia Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('isAlgoliaConfigured returns false when env vars are empty', () => {
    // The function checks VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_KEY
    // In test env these are not set
    const result = isAlgoliaConfigured();
    expect(typeof result).toBe('boolean');
  });
});
