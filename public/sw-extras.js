/**
 * NUNULIA — Service Worker extras (Background Sync + Notifications)
 *
 * Loaded by the Workbox-generated SW via `workbox.importScripts` config in
 * vite.config.ts. Adds two non-cache features without forcing us to migrate
 * to injectManifest mode (which would mean rewriting all the runtimeCaching
 * rules by hand — risky pre-launch).
 *
 * What this adds:
 *   1. `sync` event listener with tag 'drafts-pending'. Fired by the browser
 *      when real connectivity returns AFTER the page registered a sync.
 *      We open IDB, count any drafts, and surface a notification so the
 *      seller knows their work is about to be published.
 *   2. `notificationclick` handler that reopens the dashboard and signals
 *      the page to run a sync sweep immediately.
 *
 * Browser support:
 *   - Background Sync API: Chromium-based browsers (Chrome/Edge/Opera/Samsung
 *     Internet) → ~95 % of African Android. Safari/Firefox: silent no-op.
 *   - Notifications: requires user permission, requested contextually from
 *     the page (not here — SW can't prompt).
 */

/* eslint-env serviceworker */
/* global clients, registration */

const DRAFTS_DB_NAME = 'nunulia-drafts-v1';
const DRAFTS_STORE   = 'drafts';
const SYNC_TAG       = 'drafts-pending';
const NOTIFICATION_TAG = 'nunulia-drafts-sync';

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(handleDraftsSync());
});

async function handleDraftsSync() {
  // We do NOT do the full sync here — Firebase Auth / App Check / Cloudinary
  // tokens live in the page context and are non-trivial to replicate. The
  // SW's job is to (a) detect the network is back and (b) get the seller
  // back to the app, where the existing in-page sync sweep takes over.
  let pendingCount = 0;
  try {
    pendingCount = await countPendingDrafts();
  } catch { /* IDB unavailable — show a generic notification */ }

  if (pendingCount === 0) return; // Nothing to sync — don't notify.

  // If a tab is already open AND visible, don't notify — it'll auto-sync.
  // Notifying in that case is just noise.
  try {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = allClients.find((c) => c.visibilityState === 'visible');
    if (visibleClient) {
      visibleClient.postMessage({ type: 'NUNULIA_SYNC_DRAFTS' });
      return;
    }
  } catch { /* fall through to notification */ }

  await self.registration.showNotification('Nunulia', {
    body: pendingCount === 1
      ? '🌐 Réseau retrouvé — touchez pour publier votre brouillon'
      : `🌐 Réseau retrouvé — touchez pour publier vos ${pendingCount} brouillons`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: NOTIFICATION_TAG,
    renotify: false,
    data: { url: '/dashboard?syncDrafts=1' },
    requireInteraction: false,
  });
}

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== NOTIFICATION_TAG) return;
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(focusOrOpen(targetUrl));
});

async function focusOrOpen(url) {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of allClients) {
    // Reuse an existing tab if any — saves the seller from a fresh cold start.
    if ('focus' in client) {
      client.postMessage({ type: 'NUNULIA_SYNC_DRAFTS' });
      try { await client.focus(); } catch { /* noop */ }
      return;
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(url);
  }
}

// Count pending drafts across all users — we don't know which seller is
// signed in from the SW context, so we surface a single aggregate count.
// The actual sync runs in-page where the auth context is intact.
function countPendingDrafts() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(0);
    const req = indexedDB.open(DRAFTS_DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.close();
        return resolve(0);
      }
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const countReq = tx.objectStore(DRAFTS_STORE).count();
      countReq.onsuccess = () => { db.close(); resolve(countReq.result); };
      countReq.onerror   = () => { db.close(); resolve(0); };
    };
    req.onerror = () => reject(req.error);
  });
}
