/**
 * Utilitaires de génération de slugs URL-friendly
 */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

export function generateUniqueSlug(base: string): string {
  const slug = slugify(base);
  if (!slug) return Math.random().toString(36).substring(2, 8);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}
