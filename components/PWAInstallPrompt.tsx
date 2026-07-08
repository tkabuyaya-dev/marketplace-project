/**
 * NUNULIA — Invitation à installer la PWA (A2HS)
 *
 * Deux surfaces, un seul composant :
 *
 *   1. OVERLAY plein écran — première visite uniquement (jamais refusé).
 *      Android/desktop : affiché seulement si `beforeinstallprompt` a été
 *      capté → le bouton « Installer » déclenche TOUJOURS le prompt natif
 *      (plus jamais de bouton mort). iOS : instructions manuelles (l'event
 *      n'existe pas, mais l'install Safari est toujours possible).
 *
 *   2. MINI-BANNIÈRE non bloquante — rappel à CHAQUE nouvelle session tant
 *      que l'app n'est pas installée, après un premier refus. Fermable (X),
 *      snooze par session (sessionStorage) : elle revient à la prochaine
 *      ouverture. Positionnée au-dessus de la bottom-nav mobile.
 *
 * Ne s'affiche JAMAIS si : app en standalone, install détectée
 * (`appinstalled` ou flag local), ou navigateur non éligible hors iOS
 * (Firefox/Safari desktop : pas d'event → pas d'UI → pas de bouton mort).
 *
 * L'event `beforeinstallprompt` peut tirer avant le montage React sur les
 * devices lents (2G/3G) : index.tsx le capture tôt dans window.__nunuliaBip.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePushOptIn } from '../hooks/usePushOptIn';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** localStorage — timestamp du premier refus → bascule en mode mini-bannière */
const DISMISS_KEY = 'nunulia_pwa_dismissed';
/** localStorage — '1' quand l'install est faite → plus aucune UI, jamais */
const INSTALLED_KEY = 'nunulia_pwa_installed';
/** sessionStorage — '1' quand la bannière est fermée → snooze jusqu'à la prochaine session */
const SESSION_SNOOZE_KEY = 'nunulia_pwa_snooze_session';
/** localStorage — '1' quand la carte notifs post-install a été proposée (one-shot à vie) */
const NOTIF_ASKED_KEY = 'nunulia_post_install_notif_asked';

const isIOSDevice = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

// Storage peut jeter (Safari private mode, quotas) — jamais bloquant.
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const ssGet = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } };

type Mode = 'hidden' | 'overlay' | 'banner' | 'notifs';

export const PWAInstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('hidden');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => ((window as any).__nunuliaBip as BeforeInstallPromptEvent | undefined) ?? null
  );
  const [installing, setInstalling] = useState(false);
  const [isIOS] = useState(isIOSDevice);
  // Opt-in notifs post-install : l'utilisateur vient d'installer = pic
  // d'engagement, et sur iOS le push EXIGE la PWA installée — c'est donc
  // le premier moment où l'activation devient possible.
  const { enabling: notifEnabling, justEnabled: notifEnabled, enable: enableNotifs } =
    usePushOptIn({ requireUser: false });

  useEffect(() => {
    // Carte notifs one-shot : proposée UNE seule fois par device, uniquement
    // si la permission est encore à 'default'. Retourne l'id du timer (à
    // nettoyer) ou undefined si rien à proposer.
    // ⚠️ Le flag one-shot est posé à l'AFFICHAGE (dans le callback), pas au
    // scheduling : sinon un remontage de l'effect (StrictMode, re-render
    // parent) annule le timer via cleanup alors que le flag est déjà posé
    // → la carte ne s'afficherait jamais.
    const maybeOfferNotifs = (delay: number): number | undefined => {
      if (typeof Notification === 'undefined') return undefined;
      if (Notification.permission !== 'default') return undefined;
      if (lsGet(NOTIF_ASKED_KEY) === '1') return undefined;
      return window.setTimeout(() => {
        lsSet(NOTIF_ASKED_KEY, '1');
        setMode('notifs');
      }, delay);
    };

    if (isStandalone()) {
      // Déjà en mode app — mémorise pour ne rien re-proposer en onglet
      // navigateur, et propose l'activation des notifs (1er lancement
      // installé = le moment iOS/Android où ça devient pertinent).
      lsSet(INSTALLED_KEY, '1');
      const notifTimer = maybeOfferNotifs(2500);
      return () => { if (notifTimer) clearTimeout(notifTimer); };
    }
    if (lsGet(INSTALLED_KEY) === '1') return;

    const everDismissed = !!lsGet(DISMISS_KEY);
    const sessionSnoozed = ssGet(SESSION_SNOOZE_KEY) === '1';

    let timer: number | undefined;

    // Première visite → overlay complet. Déjà refusé → mini-bannière,
    // une fois par session. Délais : laisser le LCP respirer.
    const schedule = (overlayDelay: number, bannerDelay: number) => {
      if (!everDismissed) {
        timer = window.setTimeout(() => setMode('overlay'), overlayDelay);
      } else if (!sessionSnoozed) {
        timer = window.setTimeout(() => setMode('banner'), bannerDelay);
      }
    };

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (timer) clearTimeout(timer);
      schedule(2000, 4000);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    let notifTimer: number | undefined;
    const onInstalled = () => {
      lsSet(INSTALLED_KEY, '1');
      setDeferredPrompt(null);
      setMode('hidden');
      // Enchaînement install → notifs : l'utilisateur est encore là,
      // au pic d'engagement.
      notifTimer = maybeOfferNotifs(1200);
    };
    window.addEventListener('appinstalled', onInstalled);

    if ((window as any).__nunuliaBip) {
      // Event capté avant le montage React (cf. index.tsx).
      schedule(2000, 4000);
    } else if (isIOSDevice()) {
      // iOS : pas d'event, mais l'install Safari est toujours disponible.
      schedule(5000, 5000);
    }
    // Autres cas (Firefox/Safari desktop, critères Chrome non remplis,
    // app déjà installée mais ouverte en onglet) : aucune UI — un bouton
    // « Installer » sans prompt natif derrière serait un bouton mort.

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
      if (notifTimer) clearTimeout(notifTimer);
    };
  }, []);

  const dismiss = () => {
    lsSet(DISMISS_KEY, String(Date.now()));
    ssSet(SESSION_SNOOZE_KEY, '1');
    setMode('hidden');
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        // `appinstalled` confirmera, mais on masque tout de suite.
        lsSet(INSTALLED_KEY, '1');
        setMode('hidden');
      } else {
        // Refus du prompt natif : l'event est consommé (one-shot) — plus
        // d'install possible sur cette page. On bascule en mode rappel.
        dismiss();
      }
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  if (mode === 'hidden') return null;

  // ── Carte notifs post-install (one-shot, non bloquante) ──────────────────
  if (mode === 'notifs') {
    const handleEnableNotifs = async () => {
      const ok = await enableNotifs();
      if (ok) {
        // Laisse le ✅ visible un instant, puis disparaît définitivement.
        setTimeout(() => setMode('hidden'), 2200);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setMode('hidden');
      }
      // Prompt fermé sans choix → la carte reste, l'utilisateur peut retaper.
    };
    return (
      <div
        className="fixed left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-[55] animate-fade-in"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        role="complementary"
        aria-label={t('push.postInstallTitle')}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-gold-500/30 shadow-2xl shadow-black/40 px-3.5 py-3">
          <span className="text-xl shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            {notifEnabled ? (
              <p className="text-[13px] font-bold text-gold-300">{t('push.enabled')}</p>
            ) : (
              <>
                <p className="text-[13px] font-bold text-white leading-tight">{t('push.postInstallTitle')}</p>
                <p className="text-[11px] text-gray-400 leading-snug">{t('push.postInstallText')}</p>
              </>
            )}
          </div>
          {!notifEnabled && (
            <>
              <button
                type="button"
                onClick={() => void handleEnableNotifs()}
                disabled={notifEnabling}
                className="shrink-0 h-8 px-3.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 text-[12px] font-black active:scale-[0.96] transition disabled:opacity-50"
              >
                {notifEnabling ? '…' : t('push.enable')}
              </button>
              <button
                type="button"
                onClick={() => setMode('hidden')}
                aria-label={t('push.later')}
                className="shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Mini-bannière de rappel (non bloquante) ──────────────────────────────
  if (mode === 'banner') {
    return (
      <div
        className="fixed left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-[55] animate-fade-in"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        role="complementary"
        aria-label={t('pwa.installTitle')}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-gold-500/30 shadow-2xl shadow-black/40 px-3.5 py-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-gray-900">N</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white leading-tight">{t('pwa.installTitle')}</p>
            <p className="text-[11px] text-gray-400 leading-snug">{t('pwa.bannerText')}</p>
          </div>
          <button
            type="button"
            onClick={isIOS ? () => setMode('overlay') : handleInstall}
            disabled={installing}
            className="shrink-0 h-8 px-3.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 text-[12px] font-black active:scale-[0.96] transition disabled:opacity-50"
          >
            {installing ? '…' : t('pwa.bannerInstall')}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('pwa.bannerLater')}
            className="shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Overlay plein écran (première visite) ────────────────────────────────
  const benefits = [
    { icon: '⚡', text: t('pwa.benefit1') },
    { icon: '📴', text: t('pwa.benefit2') },
    { icon: '🔔', text: t('pwa.benefit3') },
    { icon: '💾', text: t('pwa.benefit4') },
  ];

  // On iOS, show only 2 benefits to save space for the 3 install steps
  const visibleBenefits = isIOS ? benefits.slice(0, 2) : benefits;

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950/95 backdrop-blur-xl flex flex-col items-center overflow-y-auto overscroll-contain animate-fade-in"
      style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-sm text-center space-y-4 px-6 my-auto">
        {/* Logo */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-2xl shadow-gold-900/50">
          <span className="text-2xl sm:text-3xl font-black text-gray-900">N</span>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white mb-1">
            {t('pwa.installTitle')}
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
            {t('pwa.installSubtitle')}
          </p>
        </div>

        {/* Benefits */}
        <div className="space-y-2 text-left">
          {visibleBenefits.map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-3 py-2.5 border border-gray-700/50">
              <span className="text-base">{item.icon}</span>
              <span className="text-xs sm:text-sm text-gray-300">{item.text}</span>
            </div>
          ))}
        </div>

        {/* iOS: step-by-step instructions */}
        {isIOS ? (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-gold-400">{t('pwa.iosTitle')}</p>
            <div className="space-y-2 text-left">
              {/* Step 1 */}
              <div className="flex items-center gap-3 bg-gray-800/70 rounded-xl px-3 py-2.5 border border-gray-700/50">
                <div className="w-7 h-7 rounded-full bg-gold-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-gold-400 font-bold text-xs">1</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-300">{t('pwa.iosStep1')}</span>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
                  </svg>
                </div>
              </div>
              {/* Step 2 */}
              <div className="flex items-center gap-3 bg-gray-800/70 rounded-xl px-3 py-2.5 border border-gray-700/50">
                <div className="w-7 h-7 rounded-full bg-gold-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-gold-400 font-bold text-xs">2</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-300">{t('pwa.iosStep2')}</span>
              </div>
              {/* Step 3 */}
              <div className="flex items-center gap-3 bg-gray-800/70 rounded-xl px-3 py-2.5 border border-gray-700/50">
                <div className="w-7 h-7 rounded-full bg-gold-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-gold-400 font-bold text-xs">3</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-300">{t('pwa.iosStep3')}</span>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="w-full py-3 bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 font-bold rounded-2xl text-sm shadow-lg shadow-gold-900/30 active:scale-[0.98] transition-transform"
            >
              {t('pwa.iosGotIt')}
            </button>
          </div>
        ) : (
          /* Android/Desktop: native install button (rendu uniquement quand
             beforeinstallprompt a été capté → jamais de bouton mort) */
          <div className="space-y-3 pt-1">
            <button
              onClick={handleInstall}
              disabled={installing || !deferredPrompt}
              className="w-full py-3.5 bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 font-bold rounded-2xl text-sm shadow-lg shadow-gold-900/30 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {installing ? t('pwa.installing') : t('pwa.installBtn')}
            </button>
            <button
              onClick={dismiss}
              className="w-full py-3 text-gray-500 text-sm hover:text-white transition-colors"
            >
              {t('pwa.continueWeb')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
