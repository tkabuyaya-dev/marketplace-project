/* eslint-disable no-undef */
/**
 * NUNULIA — Firebase Cloud Messaging Service Worker
 *
 * Scope: /firebase-cloud-messaging-push-scope (séparé du Workbox SW à '/').
 *
 * Stratégie : on s'abonne au `push` natif du Service Worker EN PLUS du
 * onBackgroundMessage du SDK, comme filet de sécurité. Sur certains
 * Android Chrome récents, le SDK ne déclenche pas l'affichage auto même
 * quand il devrait. L'écoute `push` native garantit l'affichage.
 *
 * Le serveur envoie un payload data-only : `data: { title, body, link, type }`.
 * Pas de champ `notification` → on garde le contrôle total de l'affichage.
 */

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

let fcmReady = false;
try {
  // Auto-servi par Firebase Hosting (init firebase global avec la config prod).
  importScripts('/__/firebase/init.js');
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      console.log('[FCM-SW] onBackgroundMessage', payload);
      showFromPayload(payload && payload.data);
    });
    fcmReady = true;
    console.log('[FCM-SW] Firebase messaging ready');
  }
} catch (e) {
  console.warn('[FCM-SW] init failed — fallback to native push event:', e);
}

// ── Helper d'affichage ──────────────────────────────────────────────────────
function showFromPayload(data) {
  if (!data) return;
  const title = data.title || 'Nunulia';
  return self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.type || 'nunulia',
    renotify: true,
    data: { link: data.link || '/' },
  });
}

// ── Fallback : événement `push` natif ───────────────────────────────────────
// Garantit l'affichage même si le SDK FCM ne déclenche pas onBackgroundMessage
// (cas observé sur Android Chrome 130+ avec payloads mixed notification/data).
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[FCM-SW] push event without data — ignored');
    return;
  }
  let payload = null;
  try { payload = event.data.json(); } catch { /* ignore */ }
  console.log('[FCM-SW] native push event', payload);

  // FCM enveloppe parfois sous `data` ou `notification`, parfois plat.
  const data = (payload && (payload.data || payload.notification || payload)) || {};
  // Évite le double-affichage si le SDK a déjà géré le payload.
  // Heuristique : si le SDK est ready ET qu'on a un payload data-only,
  // onBackgroundMessage l'a déjà affiché — on skip.
  if (fcmReady && payload && payload.data && !payload.notification) {
    console.log('[FCM-SW] SDK already handled this push — skip native fallback');
    return;
  }
  event.waitUntil(showFromPayload(data));
});

// ── Clic sur la notif ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = self.location.origin;
    for (const client of allClients) {
      if (client.url.startsWith(origin)) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(link); } catch { /* ignore */ }
        }
        return;
      }
    }
    await clients.openWindow(link);
  })());
});
