/* eslint-disable no-undef */
/**
 * NUNULIA — Firebase Cloud Messaging Service Worker
 *
 * Scope: /firebase-cloud-messaging-push-scope (séparé du Workbox SW à '/').
 * Pattern : config Firebase auto-servie par Firebase Hosting via
 *   /__/firebase/init.js — pas de secret à hardcoder, et la config
 *   reste alignée avec le projet déployé.
 *
 * Limitation : en dev local (Vite), /__/firebase/init.js n'existe pas.
 * Le SW se contente alors de no-op. Tester FCM exige une preview channel
 * Firebase Hosting ou la prod.
 */

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

try {
  // Auto-servi par Firebase Hosting (assigne à `firebase` global et init l'app).
  importScripts('/__/firebase/init.js');
} catch (e) {
  // Dev local ou hors-Hosting : on désactive proprement.
  console.warn('[FCM-SW] /__/firebase/init.js indisponible — FCM désactivé.');
}

if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
  const messaging = firebase.messaging();

  // ── Push reçu en arrière-plan ─────────────────────────────────────────────
  // Le SDK affiche déjà automatiquement la notif si le payload est de type
  // `notification` ; on prend la main pour ajouter l'icône, badge et data.
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = (payload.notification && payload.notification.title) || data.title || 'Nunulia';
    const body  = (payload.notification && payload.notification.body)  || data.body  || '';
    const link  = data.link || data.click_action || '/';

    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'nunulia',
      data: { link },
    });
  });
}

// ── Clic sur la notif ────────────────────────────────────────────────────────
// Focus un onglet Nunulia existant, sinon en ouvre un nouveau.
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
