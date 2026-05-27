import { useState, useEffect } from 'react';
import { registerFcmForUser } from '../services/fcm';

const NOTIF_KEY = 'nunulia_notif_asked';

/**
 * Permission notifications navigateur + enregistrement FCM côté Firestore.
 *
 * - `requestPermission(uid?)` : si le navigateur accorde la perm, et qu'un
 *   `uid` est fourni, on enregistre aussitôt le token FCM. Sans `uid`, on
 *   se contente du prompt navigateur (utile sur une page avant login).
 * - Si la VAPID key est absente ou le navigateur ne supporte pas FCM,
 *   l'enregistrement échoue silencieusement — le toggle UI reste utilisable
 *   sans casser le flow.
 */
export function useNotificationConsent() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const alreadyAsked = (() => {
    try { return localStorage.getItem(NOTIF_KEY) === 'true'; }
    catch { return false; }
  })();

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async (uid?: string): Promise<NotificationPermission> => {
    try { localStorage.setItem(NOTIF_KEY, 'true'); } catch { /* ignore */ }
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted' && uid) {
      // Non bloquant — si VAPID/SW indispo, on continue sans erreur
      registerFcmForUser(uid).catch(() => {});
    }
    return result;
  };

  return { alreadyAsked, permission, requestPermission };
}
