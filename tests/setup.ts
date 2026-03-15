/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

// Polyfill IntersectionObserver for jsdom
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;

// Mock Firebase config to avoid initialization in tests
vi.mock('../firebase-config', () => ({
  db: null,
  auth: null,
}));

// Mock Cloudinary service
vi.mock('../services/cloudinary', () => ({
  getOptimizedUrl: (url: string) => url,
  getResponsiveSrcSet: () => '',
  uploadImage: vi.fn(),
}));
