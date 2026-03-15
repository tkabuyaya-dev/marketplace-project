import { describe, it, expect } from 'vitest';
import { slugify, generateUniqueSlug } from '../../utils/slug';

describe('slugify', () => {
  it('converts basic text to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes accents', () => {
    expect(slugify('Café résumé')).toBe('cafe-resume');
  });

  it('handles special characters', () => {
    expect(slugify('iPhone 15 Pro Max!!!')).toBe('iphone-15-pro-max');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('truncates to 80 characters', () => {
    const longText = 'a'.repeat(100);
    expect(slugify(longText).length).toBeLessThanOrEqual(80);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles French marketplace names', () => {
    expect(slugify('Électronique & Téléphones')).toBe('electronique-telephones');
  });

  it('handles Kirundi/Swahili text', () => {
    expect(slugify('Bujumbura Mairie')).toBe('bujumbura-mairie');
  });
});

describe('generateUniqueSlug', () => {
  it('generates slug with random suffix', () => {
    const slug = generateUniqueSlug('Test Product');
    expect(slug).toMatch(/^test-product-[a-z0-9]{4}$/);
  });

  it('returns random string for empty input', () => {
    const slug = generateUniqueSlug('');
    expect(slug.length).toBeGreaterThan(0);
  });

  it('generates different slugs each time', () => {
    const slug1 = generateUniqueSlug('Same Title');
    const slug2 = generateUniqueSlug('Same Title');
    expect(slug1).not.toBe(slug2);
  });
});
