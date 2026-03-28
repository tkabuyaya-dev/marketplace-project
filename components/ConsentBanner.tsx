import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'nunulia_consent_accepted';

export const ConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) {
        setVisible(true);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'true');
    } catch { /* ignore */ }
    setFadeOut(true);
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[60] bg-gray-900 border-t border-gray-700 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] px-4 py-4 transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="max-w-lg mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-gray-300 flex-1">
          En utilisant NUNULIA, vous acceptez nos{' '}
          <Link to="/cgu" className="underline text-amber-400 hover:text-amber-300">
            Conditions d'utilisation
          </Link>
          {' '}et notre{' '}
          <Link to="/politique-confidentialite" className="underline text-amber-400 hover:text-amber-300">
            Politique de confidentialité
          </Link>.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/cgu" className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap">
            En savoir plus
          </Link>
          <button
            onClick={handleAccept}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 text-sm font-bold rounded-full transition-colors whitespace-nowrap"
          >
            J'accepte
          </button>
        </div>
      </div>
    </div>
  );
};
