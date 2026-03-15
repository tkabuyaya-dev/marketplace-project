import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'aurabuja_pwa_dismissed';
const DISMISS_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 jours

export const PWAInstallPrompt: React.FC = () => {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if recently dismissed
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_EXPIRY) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so the app loads first
      setTimeout(() => setShow(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Fallback: show prompt anyway after 5s for iOS/browsers that don't fire the event
    const fallbackTimer = setTimeout(() => {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      if (isIOS || (!deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches)) {
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
    } else {
      // iOS fallback: show manual instructions
      toast("Pour installer : Partager → Sur l'écran d'accueil → Confirmer", 'info');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Logo */}
        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-rose-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-900/50">
          <span className="text-3xl font-black text-white">A</span>
        </div>

        <div>
          <h2 className="text-2xl font-black text-white mb-2">
            Installez AuraBuja
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Accédez au marketplace directement depuis votre écran d'accueil.
            Plus rapide, fonctionne hors-ligne, zéro espace de stockage.
          </p>
        </div>

        {/* Benefits */}
        <div className="space-y-3 text-left">
          {[
            { icon: '⚡', text: 'Chargement instantané' },
            { icon: '📴', text: 'Fonctionne sans internet' },
            { icon: '🔔', text: 'Notifications en temps réel' },
            { icon: '💾', text: "Pas d'espace de stockage utilisé" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-3 border border-gray-700/50">
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm text-gray-300">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-rose-600 text-white font-bold rounded-2xl text-sm shadow-lg shadow-blue-900/30 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {installing ? 'Installation...' : 'Installer l\'application'}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full py-3 text-gray-500 text-sm hover:text-white transition-colors"
          >
            Continuer sur le web
          </button>
        </div>
      </div>
    </div>
  );
};
