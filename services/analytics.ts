/**
 * AURABUJA — Analytics Service (GA4 + Custom Tracking)
 *
 * Centralized analytics with Google Analytics 4 integration.
 * Tracks: page views, product interactions, conversions, search events.
 *
 * Architecture:
 * - GA4 via gtag.js (loaded in index.html)
 * - Custom events mapped to GA4 event schema
 * - Consent-aware: only fires if GA is loaded
 */

const GA_MEASUREMENT_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '';

/** Load Google Analytics dynamically (avoids hardcoding ID in index.html) */
let gaLoaded = false;
function loadGA(): void {
  if (gaLoaded || !GA_MEASUREMENT_ID || typeof document === 'undefined') return;
  gaLoaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).gtag = function (...args: any[]) {
    (window as any).dataLayer.push(args);
  };
  (window as any).gtag('js', new Date());
  (window as any).gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
}

// Auto-load on import
loadGA();

/** Safe gtag wrapper — no-op if GA not loaded */
function gtag(...args: any[]): void {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag(...args);
  }
}

// ── Page Views ──

export function trackPageView(pagePath: string, pageTitle?: string): void {
  gtag('event', 'page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
  });
}

// ── Product Events ──

export function trackProductView(productId: string, productName: string, category: string, price: number, sellerId: string): void {
  gtag('event', 'view_item', {
    currency: 'BIF',
    value: price,
    items: [{
      item_id: productId,
      item_name: productName,
      item_category: category,
      price,
      affiliation: sellerId,
    }],
  });
}

export function trackAddToFavorites(productId: string, productName: string, category: string, price: number): void {
  gtag('event', 'add_to_wishlist', {
    currency: 'BIF',
    value: price,
    items: [{
      item_id: productId,
      item_name: productName,
      item_category: category,
      price,
    }],
  });
}

// ── Search Events ──

export function trackSearch(searchTerm: string, resultsCount: number): void {
  gtag('event', 'search', {
    search_term: searchTerm,
    results_count: resultsCount,
  });
}

export function trackShopSearch(
  searchTerm: string,
  resultsCount: number,
  sellerId: string,
  sellerName: string,
  filters?: { category?: string; sort?: string; minPrice?: number; maxPrice?: number; inStock?: boolean }
): void {
  gtag('event', 'shop_search', {
    search_term: searchTerm,
    results_count: resultsCount,
    seller_id: sellerId,
    seller_name: sellerName,
    filter_category: filters?.category || '',
    filter_sort: filters?.sort || 'relevance',
    filter_min_price: filters?.minPrice || 0,
    filter_max_price: filters?.maxPrice || 0,
    filter_in_stock: filters?.inStock || false,
  });
}

// ── Conversion Events ──

export function trackContactSeller(sellerId: string, sellerName: string, productId?: string): void {
  gtag('event', 'generate_lead', {
    currency: 'BIF',
    value: 0,
    seller_id: sellerId,
    seller_name: sellerName,
    product_id: productId || '',
  });
}

export function trackSellerRegistration(): void {
  gtag('event', 'sign_up', {
    method: 'seller_registration',
  });
}

export function trackProductPublish(productId: string, category: string): void {
  gtag('event', 'publish_product', {
    product_id: productId,
    category,
  });
}

// ── User Events ──

export function trackLogin(method: string = 'google'): void {
  gtag('event', 'login', { method });
}

export function trackSignUp(method: string = 'google'): void {
  gtag('event', 'sign_up', { method });
}

// ── User Properties ──

export function setUserProperties(userId: string, role: string, country: string): void {
  gtag('config', GA_MEASUREMENT_ID, {
    user_id: userId,
  });
  gtag('set', 'user_properties', {
    user_role: role,
    user_country: country,
  });
}

// ── Language & Country Events ──

export function trackLanguageChange(fromLang: string, toLang: string, country: string): void {
  gtag('event', 'language_change', {
    from_language: fromLang,
    to_language: toLang,
    country,
  });
}

export function trackCountrySwitch(fromCountry: string, toCountry: string): void {
  gtag('event', 'country_switch', {
    from_country: fromCountry,
    to_country: toCountry,
  });
}

// ── Custom Events ──

export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>): void {
  gtag('event', eventName, params);
}
