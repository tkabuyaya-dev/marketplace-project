/* eslint-disable no-undef */
/**
 * NUNULIA — Firebase Cloud Messaging Service Worker
 *
 * Scope: /firebase-cloud-messaging-push-scope (séparé du Workbox SW à '/').
 *
 * Stratégie : handler `push` natif uniquement, sans dépendance au SDK
 * firebase-messaging.compat. Pourquoi :
 *
 *   1. Le SDK Web Messaging dispatche `onBackgroundMessage` mais ne garantit
 *      pas que le callback complète son `showNotification` avant que le SW
 *      ne shutdown. Symptôme observé en prod : push acquitté par FCM
 *      (sent=1) mais jamais affiché côté device. La cloche in-app voit
 *      bien la notif Firestore, le téléphone non.
 *
 *   2. Le SDK n'apporte aucune valeur ici : il décodait juste `payload.data`
 *      qu'on peut récupérer directement via `event.data.json()`.
 *
 *   3. L'init `/__/firebase/init.js` faisait un import réseau supplémentaire
 *      sur un SW qui doit démarrer en <100ms pour ne pas dépasser le délai
 *      de dispatch du push event.
 *
 * Côté page (services/fcm.ts), le SDK reste utilisé pour `getToken()` —
 * c'est là qu'il a sa raison d'être.
 *
 * skipWaiting + clientsClaim : sans ces flags, un device qui a installé le
 * SW il y a 1 semaine reste bloqué dessus, même après un deploy de fix.
 * Aligné sur le Workbox SW (cf. commit 81432f5).
 *
 * Payload attendu (cf. fcm-send.ts) — DATA-ONLY :
 *   data: { title, body, link, type }
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Helper d'affichage ──────────────────────────────────────────────────────
function showFromPayload(data) {
  if (!data) return;
  const title = data.title || 'Nunulia';
  // Broadcaste vers /fcm-debug si la page est ouverte (debug live, no-op sinon).
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('nunulia-fcm-debug');
      ch.postMessage({ title, body: data.body, type: data.type, link: data.link, receivedAt: Date.now() });
      ch.close();
    }
  } catch (e) { /* ignore */ }
  return self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.type || 'nunulia',
    renotify: true,
    data: { link: data.link || '/' },
  });
}

// ── Réception du push ───────────────────────────────────────────────────────
// FCM enveloppe le payload différemment selon la version SDK Admin et le
// transport. Tolère { data: {...} }, { notification: {...} }, ou plat.
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[FCM-SW] push event without data — ignored');
    return;
  }
  let payload = null;
  try { payload = event.data.json(); } catch { /* ignore */ }
  console.log('[FCM-SW] push event', payload);

  const data = (payload && (payload.data || payload.notification || payload)) || {};
  event.waitUntil(showFromPayload(data));
});

// ── Clic sur la notif ───────────────────────────────────────────────────────
// Chrome `Client.navigate()` est silencieusement cassé depuis Chrome 130+ :
// le focus marche mais la navigation ne s'exécute pas. On passe par
// postMessage → l'app React route via React Router (cf. App.tsx).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = self.location.origin;
    for (const client of allClients) {
      if (client.url.startsWith(origin)) {
        await client.focus();
        client.postMessage({ type: 'NOTIFICATION_NAVIGATE', link });
        return;
      }
    }
    await clients.openWindow(link);
  })());
});
