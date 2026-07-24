/**
 * NUNULIA - Bannière contextuelle d'activation des notifications push
 *
 * Problème résolu :
 *   Le toggle notifs est isolé dans /profile. Un seller n'a aucune raison
 *   d'y aller spontanément, donc `Notification.permission` reste `default`,
 *   le token FCM ne se crée jamais, et toutes les notifs push (demandes
 *   acheteur, approbations produits, etc.) sont silencieusement perdues.
 *   La cloche in-app les voit (doc Firestore), le téléphone non.
 *
 * Solution :
 *   Bannière en haut des pages où l'absence de notif coûte de l'argent
 *   (= /demandes, /dashboard). Adapte le message selon l'état :
 *
 *     'default'    → CTA pour activer (cas principal).
 *     'denied'     → instructions pour débloquer dans le navigateur.
 *     'granted'    → masquée (et tente une re-registration silencieuse
 *                    du token si Firestore en manque - cas après VAPID
 *                    rotated ou token expiré).
 *     iOS hors PWA → message expliquant l'install obligatoire (Apple
 *                    bloque le Web Push hors Home Screen).
 *
 *   Dismissible (X) mais session-scoped : réapparaît à la prochaine
 *   ouverture si toujours pas activé. Volontairement insistant - c'est
 *   une feature critique côté business.
 */

import React, { useEffect, useState } from 'react';
import { Bell, BellOff, X, Smartphone } from 'lucide-react';
import { useNotificationConsent } from '../hooks/useNotificationConsent';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from './Toast';

const DISMISS_KEY = 'nunulia_notif_banner_dismissed_session';

interface PlatformInfo {
  isIOS: boolean;
  iosVersion: number | null;
  isStandalone: boolean;
  /** true = iOS Safari hors PWA, push impossible sans install Home Screen */
  needsPwaInstall: boolean;
}

function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, iosVersion: null, isStandalone: false, needsPwaInstall: false };
  }
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  let iosVersion: number | null = null;
  if (isIOS) {
    const m = ua.match(/OS (\d+)[_.](\d+)/);
    if (m) iosVersion = parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
  }
  const isStandalone =
    (window as unknown as { navigator: { standalone?: boolean } }).navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS bloque le Web Push sauf en PWA installée sur iOS 16.4+
  const needsPwaInstall = isIOS && (!isStandalone || (iosVersion !== null && iosVersion < 16.4));
  return { isIOS, iosVersion, isStandalone, needsPwaInstall };
}

export const NotificationEnableBanner: React.FC = () => {
  const { currentUser } = useAppContext();
  const { permission, requestPermission } = useNotificationConsent();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; }
    catch { return false; }
  });
  const [enabling, setEnabling] = useState(false);
  const [platform] = useState(() => detectPlatform());
  const [hasNotificationApi, setHasNotificationApi] = useState(true);

  useEffect(() => {
    setHasNotificationApi(typeof Notification !== 'undefined');
  }, []);

  // Si permission déjà granted mais aucun token Firestore (VAPID rotated,
  // navigateur a purgé sa subscription, install récente), on retente
  // l'enregistrement silencieusement. refreshFcmTokenSilent est idempotent.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (permission !== 'granted') return;
    let cancelled = false;
    import('../services/fcm')
      .then(({ refreshFcmTokenSilent }) => {
        if (!cancelled) void refreshFcmTokenSilent(currentUser.id);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [permission, currentUser?.id]);

  // Filtres d'affichage
  if (!currentUser) return null;
  if (currentUser.role !== 'seller' && currentUser.role !== 'admin') return null;
  if (!hasNotificationApi) return null;
  if (permission === 'granted') return null;
  if (dismissed) return null;

  const handleEnable = async () => {
    // iOS hors PWA - pas de prompt possible, on guide
    if (platform.needsPwaInstall) {
      toast(
        platform.iosVersion !== null && platform.iosVersion < 16.4
          ? 'Mettez à jour iOS vers 16.4+ pour recevoir les notifications.'
          : 'Sur iPhone : Safari → Partager → « Sur l\'écran d\'accueil ». Ouvrez ensuite Nunulia depuis l\'icône.',
        'info',
      );
      return;
    }

    setEnabling(true);
    try {
      const result = await requestPermission(currentUser.id);
      if (result === 'granted') {
        // requestPermission fire-and-forget l'enregistrement. On le refait
        // explicitement pour confirmer que le token est bien en Firestore
        // (VAPID manquante côté env = registerFcmForUser renvoie false).
        const { registerFcmForUser } = await import('../services/fcm');
        const ok = await registerFcmForUser(currentUser.id);
        if (ok) {
          toast('✅ Notifications activées - vous serez alerté à chaque demande client', 'success');
        } else {
          toast('Permission accordée mais l\'enregistrement a échoué. Réessayez ou contactez le support.', 'error');
        }
      } else if (result === 'denied') {
        toast(
          'Notifications refusées. Pour réactiver : cadenas / ⓘ à côté de l\'URL → autoriser les notifications.',
          'error',
        );
      }
      // 'default' = user a fermé le prompt sans choisir, on ne dit rien (il réessaiera)
    } finally {
      setEnabling(false);
    }
  };

  const handleDismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  // ─── iOS hors PWA ────────────────────────────────────────────────
  if (platform.needsPwaInstall) {
    return (
      <div
        className="mx-3 mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3.5 flex items-start gap-3"
        role="alert"
      >
        <div className="w-9 h-9 rounded-full bg-blue-100 inline-flex items-center justify-center shrink-0">
          <Smartphone size={18} strokeWidth={2.25} className="text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-blue-900 leading-tight">
            Installez Nunulia pour les notifications
          </p>
          <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
            {platform.iosVersion !== null && platform.iosVersion < 16.4
              ? `iOS ${platform.iosVersion.toFixed(1)} ne supporte pas le Web Push. Mettez à jour vers iOS 16.4+.`
              : 'Safari → Partager → « Sur l\'écran d\'accueil ». Ouvrez ensuite Nunulia depuis l\'icône.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Masquer"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center text-blue-700 hover:bg-blue-100 shrink-0"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  // ─── Permission refusée ─────────────────────────────────────────
  if (permission === 'denied') {
    return (
      <div
        className="mx-3 mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3.5 flex items-start gap-3"
        role="alert"
      >
        <div className="w-9 h-9 rounded-full bg-orange-100 inline-flex items-center justify-center shrink-0">
          <BellOff size={18} strokeWidth={2.25} className="text-orange-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-orange-900 leading-tight">
            Notifications bloquées
          </p>
          <p className="text-[11px] text-orange-800 mt-1 leading-relaxed">
            Touchez le cadenas / ⓘ à gauche de l'URL → autorisez les notifications.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Masquer"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center text-orange-700 hover:bg-orange-100 shrink-0"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  // ─── Permission default - CTA principal ─────────────────────────
  return (
    <div
      className="mx-3 mt-3 rounded-2xl p-3.5 flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg, #FEF9EC 0%, #FFFCEC 100%)',
        border: '1.5px solid rgba(245, 200, 66, 0.5)',
        boxShadow: '0 2px 12px rgba(245, 200, 66, 0.2)',
      }}
      role="alert"
    >
      <div
        className="w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0"
        style={{ background: '#F5C842', boxShadow: '0 4px 10px rgba(245,200,66,0.45)' }}
      >
        <Bell size={20} strokeWidth={2.25} className="text-[#111318]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-black text-[#111318] leading-tight">
          Activez les notifications
        </p>
        <p className="text-[11px] text-[#5C6370] mt-0.5 leading-relaxed">
          Soyez alerté en premier dès qu'un acheteur poste une demande
        </p>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        disabled={enabling}
        className="shrink-0 h-9 px-4 rounded-full bg-[#111318] text-white text-[12px] font-black inline-flex items-center gap-1.5 active:scale-[0.96] transition disabled:opacity-50"
      >
        {enabling ? '…' : 'Activer'}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Plus tard"
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[#5C6370] hover:bg-black/5 shrink-0"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
};
