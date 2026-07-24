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

  document.title = safeTitle ? `${safeTitle} | Nunulia` : 'Nunulia - Marketplace';

  const updates: Record<string, string> = {
    'og:title': safeTitle || 'Nunulia - Marketplace',
    'og:description': safeDesc || 'Le marketplace des Grands Lacs.',
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
  document.title = 'Nunulia - Marketplace';
  removeJsonLd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema.org JSON-LD injection
//
// Used by ProductDetail and ShopProfile to expose structured data to search
// engines and AI browsing agents (Google Shopping, ChatGPT, Perplexity, Bing).
// The CF renderMeta inlines its own JSON-LD for crawler-only paths; this client
// injection covers the JS-rendered case (user navigation within the SPA).
// ─────────────────────────────────────────────────────────────────────────────

const JSONLD_TAG_ID = 'nun-jsonld';

export function injectJsonLd(data: Record<string, unknown>): void {
  removeJsonLd();
  try {
    const script = document.createElement('script');
    script.id = JSONLD_TAG_ID;
    script.type = 'application/ld+json';
    // JSON.stringify already escapes `<`/`>`/`&` safely for <script type="application/ld+json">.
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  } catch {
    // Defensive: never let structured data injection break the page
  }
}

export function removeJsonLd(): void {
  const existing = document.getElementById(JSONLD_TAG_ID);
  if (existing) existing.remove();
}

/**
 * Build a schema.org `Product` JSON-LD from a Product object.
 * Caller passes the absolute page URL (already canonical) - we don't compute it
 * here so server-rendered and client-rendered paths stay consistent.
 */
export function productToJsonLd(args: {
  id: string;
  title: string;
  description?: string;
  images?: string[];
  price: number;
  currency: string;
  rating?: number;
  reviews?: number;
  sellerName?: string;
  sellerCity?: string;
  countryCode?: string;
  url: string;
  inStock?: boolean;
}): Record<string, unknown> {
  const offers: Record<string, unknown> = {
    '@type': 'Offer',
    price: args.price,
    priceCurrency: args.currency,
    availability: args.inStock === false
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/InStock',
    url: args.url,
  };
  if (args.sellerName) {
    offers.seller = {
      '@type': 'Organization',
      name: args.sellerName,
      ...(args.sellerCity || args.countryCode
        ? {
            address: {
              '@type': 'PostalAddress',
              ...(args.sellerCity ? { addressLocality: args.sellerCity } : {}),
              ...(args.countryCode ? { addressCountry: args.countryCode } : {}),
            },
          }
        : {}),
    };
  }

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': args.url,
    name: args.title,
    ...(args.description ? { description: args.description.slice(0, 500) } : {}),
    ...(args.images && args.images.length > 0 ? { image: args.images.slice(0, 4) } : {}),
    offers,
  };

  if (typeof args.rating === 'number' && args.rating > 0 && typeof args.reviews === 'number' && args.reviews > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(args.rating.toFixed(1)),
      reviewCount: args.reviews,
    };
  }

  return data;
}

/**
 * Build a schema.org `LocalBusiness` JSON-LD from a shop/seller object.
 */
export function shopToJsonLd(args: {
  id: string;
  name: string;
  description?: string;
  image?: string;
  city?: string;
  countryCode?: string;
  url: string;
  rating?: number;
  reviews?: number;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': args.url,
    name: args.name,
    url: args.url,
    ...(args.description ? { description: args.description.slice(0, 500) } : {}),
    ...(args.image ? { image: args.image } : {}),
    ...(args.city || args.countryCode
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(args.city ? { addressLocality: args.city } : {}),
            ...(args.countryCode ? { addressCountry: args.countryCode } : {}),
          },
        }
      : {}),
  };

  if (typeof args.rating === 'number' && args.rating > 0 && typeof args.reviews === 'number' && args.reviews > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(args.rating.toFixed(1)),
      reviewCount: args.reviews,
    };
  }

  return data;
}
