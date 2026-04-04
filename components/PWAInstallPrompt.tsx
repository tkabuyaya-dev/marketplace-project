import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'nunulia_pwa_dismissed';
const DISMISS_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 jours

const isIOSDevice = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

export const PWAInstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isIOS] = useState(isIOSDevice);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_EXPIRY) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const fallbackTimer = setTimeout(() => {
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        const dismissed = localStorage.getItem(DISMISS_KEY);
        if (!dismissed || Date.now() - Number(dismissed) >= DISMISS_EXPIRY) {
          setShow(true);
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShow(false);
      }
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  const benefits = [
    { icon: '\u26A1', text: t('pwa.benefit1') },
    { icon: '\uD83D\uDCF4', text: t('pwa.benefit2') },
    { icon: '\uD83D\uDD14', text: t('pwa.benefit3') },
    { icon: '\uD83D\uDCBE', text: t('pwa.benefit4') },
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
              onClick={handleDismiss}
              className="w-full py-3 bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 font-bold rounded-2xl text-sm shadow-lg shadow-gold-900/30 active:scale-[0.98] transition-transform"
            >
              {t('pwa.iosGotIt')}
            </button>
          </div>
        ) : (
          /* Android/Desktop: native install button */
          <div className="space-y-3 pt-1">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="w-full py-3.5 bg-gradient-to-r from-gold-400 to-gold-600 text-gray-900 font-bold rounded-2xl text-sm shadow-lg shadow-gold-900/30 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {installing ? t('pwa.installing') : t('pwa.installBtn')}
            </button>
            <button
              onClick={handleDismiss}
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
