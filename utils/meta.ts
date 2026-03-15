/**
 * Met à jour les meta tags OG côté client (pour le titre de l'onglet navigateur).
 * Note: Les crawlers sociaux (WhatsApp, Facebook) ne voient PAS ces mises à jour JS.
 * Pour eux, la Cloud Function renderMeta sert les vrais meta tags.
 */

function escapeMetaContent(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function updateMetaTags(options: {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}) {
  const safeTitle = options.title ? escapeMetaContent(options.title) : '';
  const safeDesc = options.description ? escapeMetaContent(options.description) : '';

  document.title = safeTitle ? `${safeTitle} | AuraBuja` : 'AuraBuja — Marketplace';

  const updates: Record<string, string> = {
    'og:title': safeTitle || 'AuraBuja — Marketplace',
    'og:description': safeDesc || 'Le marketplace Tech & Beauté de Bujumbura.',
    'og:image': options.image || '/icons/icon-512.png',
    'og:url': options.url || window.location.href,
  };

  Object.entries(updates).forEach(([property, content]) => {
    let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (tag) {
      tag.setAttribute('content', content);
    }
  });
}

export function resetMetaTags() {
  document.title = 'AuraBuja — Marketplace';
}
