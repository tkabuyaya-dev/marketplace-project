import { useState, useEffect } from 'react';

const NOTIF_KEY = 'nunulia_notif_asked';

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

  const requestPermission = async (): Promise<NotificationPermission> => {
    try { localStorage.setItem(NOTIF_KEY, 'true'); } catch { /* ignore */ }
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

  return { alreadyAsked, permission, requestPermission };
}
