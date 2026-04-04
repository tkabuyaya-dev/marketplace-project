/**
 * NUNULIA — Page d'authentification pour iOS PWA / WebView
 *
 * Ouverte dans Safari (full browser) depuis une PWA iOS ou un in-app browser.
 * L'utilisateur clique "Continuer avec Google" → signInWithPopup fonctionne
 * dans Safari full même si bloqué dans la PWA.
 *
 * Après succès : Firebase met à jour IndexedDB → la PWA détecte l'utilisateur
 * via onAuthStateChanged sans rechargement.
 *
 * Route : /auth-google
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase-config';

type Status = 'idle' | 'loading' | 'success' | 'error';

const AuthGoogle: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignIn = async () => {
    if (!auth) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);

      setStatus('success');

      // Tenter de fermer l'onglet (fonctionne si ouvert par window.open)
      setTimeout(() => {
        window.close();
        // Si window.close ne fonctionne pas (onglet ouvert manuellement),
        // rediriger vers l'accueil après 2 secondes
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }, 800);

    } catch (err: any) {
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        setStatus('idle');
        return;
      }
      console.error('[AuthGoogle]', err);
      setStatus('error');
      setErrorMsg(err?.message || t('auth.errorGeneric', 'Une erreur est survenue.'));
    }
  };

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

        {/* Idle / Loading */}
        {(status === 'idle' || status === 'loading') && (
          <>
            <h2 className="text-xl font-bold text-white text-center mb-2">
              {t('auth.signInTitle', 'Connexion')}
            </h2>
            <p className="text-sm text-gray-500 text-center mb-8">
              {t('auth.signInSubtitle', 'Appuyez sur le bouton ci-dessous pour continuer')}
            </p>

            <button
              onClick={handleSignIn}
              disabled={status === 'loading'}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-bold rounded-xl text-sm transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {status === 'loading' ? (
                <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              )}
              {status === 'loading'
                ? t('auth.signingIn', 'Connexion en cours...')
                : t('auth.continueWithGoogle', 'Continuer avec Google')}
            </button>

            <p className="text-[11px] text-gray-600 text-center mt-6 leading-relaxed">
              {t('auth.closeAfterSignIn', 'Après connexion, fermez cet onglet et revenez à l\'application.')}
            </p>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="text-center py-4 animate-fade-in">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h3 className="text-xl font-black text-white mb-2">
              {t('auth.successTitle', 'Connexion réussie !')}
            </h3>
            <p className="text-sm text-gray-400">
              {t('auth.successClose', 'Vous pouvez fermer cet onglet et revenir à l\'application.')}
            </p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center py-2">
            <div className="text-4xl mb-4">⚠️</div>
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
    </div>
  );
};

export default AuthGoogle;
