/**
 * NUNULIA — Algolia Insights (Click & Conversion Analytics)
 *
 * Sends clickedObjectIDsAfterSearch and convertedObjectIDsAfterSearch
 * events to Algolia Insights API for relevance learning.
 *
 * Uses REST API (no SDK) to keep bundle lean.
 */

const env = import.meta.env;
const ALGOLIA_APP_ID = env.VITE_ALGOLIA_APP_ID || '';
const ALGOLIA_SEARCH_KEY = env.VITE_ALGOLIA_SEARCH_KEY || '';
const PRODUCTS_INDEX = 'products';
const INSIGHTS_URL = `https://insights.algolia.io/1/events`;

const isConfigured = !!(ALGOLIA_APP_ID && ALGOLIA_SEARCH_KEY);

/** Get or create a persistent anonymous user token for Algolia */
function getUserToken(): string {
  const key = 'nunulia_algolia_token';
  let token = localStorage.getItem(key);
  if (!token) {
    token = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(key, token);
  }
  return token;
}

async function sendEvent(event: Record<string, any>): Promise<void> {
  if (!isConfigured) return;

  try {
    await fetch(INSIGHTS_URL, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: [event] }),
    });
  } catch {
    // Silent fail — analytics should never block UX
  }
}

/**
 * Track when a user clicks on a product from search results.
 * Call this when a product card is clicked on the search page.
 */
export function trackSearchClick(
  objectID: string,
  queryID: string | undefined,
  position: number,
): void {
  if (!queryID) return;

  sendEvent({
    eventType: 'click',
    eventName: 'Product Clicked',
    index: PRODUCTS_INDEX,
    userToken: getUserToken(),
    queryID,
    objectIDs: [objectID],
    positions: [position + 1], // Algolia uses 1-based positions
    timestamp: Date.now(),
  });
}

/**
 * Track when a user converts (e.g., contacts seller, adds to favorites).
 * Call this on conversion actions for products found via search.
 */
export function trackSearchConversion(
  objectID: string,
  queryID: string | undefined,
): void {
  if (!queryID) return;

  sendEvent({
    eventType: 'conversion',
    eventName: 'Product Converted',
    index: PRODUCTS_INDEX,
    userToken: getUserToken(),
    queryID,
    objectIDs: [objectID],
    timestamp: Date.now(),
  });
}

/**
 * Track a product view from search (non-search contexts).
 */
export function trackProductView(objectID: string): void {
  sendEvent({
    eventType: 'view',
    eventName: 'Product Viewed',
    index: PRODUCTS_INDEX,
    userToken: getUserToken(),
    objectIDs: [objectID],
    timestamp: Date.now(),
  });
}

export { getUserToken };
