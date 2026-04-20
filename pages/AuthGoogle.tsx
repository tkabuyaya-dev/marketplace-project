/**
 * NUNULIA — Page d'authentification Google (mobile + fallbacks).
 *
 * Flux : Google Identity Services `renderButton` → JWT credential →
 *        `signInWithCredential(auth, GoogleAuthProvider.credential(jwt))` →
 *        navigation SPA vers `/`.
 *
 * Pourquoi pas `signInWithPopup` :
 *   Sur Android Chrome, le popup ouvre un nouvel onglet qui ne peut pas être
 *   fermé par `window.close()` (bloqué par Chrome) → écran blanc orphelin.
 *   Le bouton GIS garde tout dans le même contexte, aucun onglet à fermer.
 *
 * Route : /auth-google
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signInWithCredential, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase-config';
import { renderGoogleButton } from '../services/google-one-tap';

type Status = 'idle' | 'loading' | 'success' | 'error';

const AuthGoogle: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);

  // Si déjà connecté (retour d'un onglet fermé, session existante), redirection immédiate
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/', { replace: true });
      }
    });
    return unsub;
  }, [navigate]);

  const handleCredential = useCallback(async (credential: string) => {
    if (!auth) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const authCred = GoogleAuthProvider.credential(credential);
      await signInWithCredential(auth, authCred);
      setStatus('success');
      setTimeout(() => navigate('/', { replace: true }), 800);
    } catch (err: any) {
      console.error('[AuthGoogle] signInWithCredential failed:', err);
      setStatus('error');
      setErrorMsg(err?.message || t('auth.errorGeneric', 'Une erreur est survenue.'));
    }
  }, [navigate, t]);

  // Rendu du bouton GIS — s'exécute à chaque retour en 'idle' (initial + retry)
  useEffect(() => {
    if (status !== 'idle' || !buttonRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    renderGoogleButton(
      buttonRef.current,
      (credential) => { if (!cancelled) handleCredential(credential); },
      (err) => {
        if (cancelled) return;
        console.error('[AuthGoogle] GIS button render failed:', err);
        setStatus('error');
        setErrorMsg(t('auth.gisUnavailable', 'Google Sign-In indisponible. Vérifiez votre connexion.'));
      },
    ).then((c) => { cleanup = c; });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [status, handleCredential, t]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-amber-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-gold-400/30">
          <span className="text-3xl font-black text-gray-900">N</span>
        </div>
        <h1 className="text-2xl font-black text-white">NUNULIA</h1>
      </div>

      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">

        {/* Idle — bouton GIS rendu ici */}
        {status === 'idle' && (
          <>
            <h2 className="text-xl font-bold text-white text-center mb-2">
              {t('auth.signInTitle', 'Connexion')}
            </h2>
            <p className="text-sm text-gray-500 text-center mb-8">
              {t('auth.signInSubtitle', 'Appuyez sur le bouton ci-dessous pour continuer')}
            </p>

            <div ref={buttonRef} className="flex justify-center min-h-[44px]" />

            <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-xs text-amber-400/90 text-center leading-relaxed">
                {t('auth.chooseAccount', 'Choisissez votre compte Google pour accéder à Nunulia.')}
              </p>
            </div>
          </>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-400">
              {t('auth.signingIn', 'Connexion en cours...')}
            </p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="text-center py-4 animate-fade-in">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-white mb-2">
              {t('auth.successTitle', 'Connexion réussie !')}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {t('auth.redirecting', 'Redirection en cours...')}
            </p>
            <div className="w-6 h-6 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center py-2">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {t('auth.errorTitle', 'Erreur de connexion')}
            </h3>
            <p className="text-sm text-red-400 mb-6 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
              {errorMsg}
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-sm transition-colors"
            >
              {t('auth.retry', 'Réessayer')}
            </button>
          </div>
        )}
      </div>

      {/* Back to home link */}
      <button
        onClick={() => navigate('/')}
        className="mt-6 text-sm text-gray-500 hover:text-gray-400 transition-colors"
      >
        {t('auth.continueWithout', 'Continuer sans compte')}
      </button>
    </div>
  );
};

export default AuthGoogle;
