/**
 * NUNULIA — AuthContext
 * Holds: currentUser, loginLoading, authReady, backgroundLoading
 * Handles: login, logout, contact seller, seller access routing
 * Re-renders only when auth state changes (not on notification/preference changes).
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { User } from '../types';
import {
  subscribeToAuth,
  subscribeToUserProfile,
  signInWithGoogle,
  signOut as firebaseSignOut,
  getCachedUser,
  clearCachedUser,
} from '../services/firebase';
import { auth } from '../firebase-config';
import { useNavigate } from 'react-router-dom';
import { trackLogin, trackContactSeller as analyticsContactSeller, setUserProperties } from '../services/analytics';
import { setSentryUser, clearSentryUser } from '../services/sentry';
import i18n from '../i18n';
import { usePreferencesContext } from './PreferencesContext';

interface AuthContextType {
  currentUser: User | null;
  loginLoading: boolean;
  authReady: boolean;
  backgroundLoading: boolean;
  /** True pendant la transition login/logout — évite l'écran blanc mobile */
  isAuthTransitioning: boolean;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleContactSeller: (seller: User, productId?: string) => void;
  handleSellerAccess: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeCountry } = usePreferencesContext();

  const cachedUser = useRef(getCachedUser()).current;
  const [currentUser, setCurrentUser] = useState<User | null>(cachedUser);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!!cachedUser);
  const [backgroundLoading, setBackgroundLoading] = useState(!!cachedUser);
  // Vrai pendant les transitions login/logout pour bloquer tout rendu intermédiaire
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);

  const userProfileUnsub = useRef<(() => void) | null>(null);

  // Hide splash loader
  const hideLoader = useCallback(() => {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 300);
    }
  }, []);

  // Hide loader immediately when React mounts — don't block on Firebase auth.
  // The page renders immediately; auth state updates progressively in the background.
  // Previously this waited for Firebase (added 1-5s of blank screen on slow networks).
  useEffect(() => {
    hideLoader();
  }, []);

  // Firebase Auth subscription
  useEffect(() => {
    // Safety net: if Firebase hasn't responded in 2s, unblock the UI.
    // IMPORTANT: must also clear isAuthTransitioning — without this, a slow
    // login that triggers onAuthStateChanged late would leave the app frozen
    // forever behind AuthLoadingScreen even after the timeout fires.
    const timeout = setTimeout(() => {
      setAuthReady(true);
      setBackgroundLoading(false);
      setIsAuthTransitioning(false); // ← fix: was missing, caused infinite white screen
      hideLoader();
    }, 2000);

    const unsubscribe = subscribeToAuth((user) => {
      clearTimeout(timeout);
      setCurrentUser(user);
      setAuthReady(true);
      setBackgroundLoading(false);
      setIsAuthTransitioning(false);
      hideLoader();
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // Real-time user profile updates (subscription tier changes from admin)
  useEffect(() => {
    if (userProfileUnsub.current) { userProfileUnsub.current(); userProfileUnsub.current = null; }
    if (!currentUser) return;

    userProfileUnsub.current = subscribeToUserProfile(currentUser.id, (updatedUser) => {
      setCurrentUser(updatedUser);
    });

    return () => {
      if (userProfileUnsub.current) userProfileUnsub.current();
    };
  }, [currentUser?.id]);

  // GA4 + Sentry: set user properties on auth change
  useEffect(() => {
    if (currentUser) {
      setUserProperties(currentUser.id, currentUser.role, currentUser.sellerDetails?.countryId || activeCountry || 'unknown');
      setSentryUser(currentUser.id, currentUser.email, currentUser.role);
    } else {
      clearSentryUser();
    }
  }, [currentUser?.id, currentUser?.role]);

  const handleLogin = async () => {
    setLoginLoading(true);
    // Ne PAS mettre isAuthTransitioning=true ici — le popup Google est ouvert
    // et l'utilisateur doit voir la page Login derrière (pas un écran blanc).
    // On ne bloque le rendu que APRÈS le popup, pendant la résolution Firestore.

    try {
      const user = await signInWithGoogle();
      if (user) {
        // Popup fermé, user résolu — montrer le loading pendant la navigation
        setIsAuthTransitioning(true);
        setCurrentUser(user);
        trackLogin('google');
        if (user.role === 'admin') navigate('/admin');
        else navigate('/');
        // Libérer dès le prochain tick (la navigation est déjà déclenchée)
        // onAuthStateChanged libérera aussi via son callback.
        requestAnimationFrame(() => setIsAuthTransitioning(false));
      }
      // Popup annulé → rien à faire, l'utilisateur reste sur /login
    } catch (err: any) {
      setIsAuthTransitioning(false);
      // Android browser : One Tap indisponible → transition SPA vers /auth-google
      // (évite le flash blanc d'un hard reload sur 3G/4G).
      if (err?.code === 'auth/needs-auth-page') {
        navigate('/auth-google');
        return;
      }
      console.error('[Auth] Login error:', err?.code, err?.message);
      if (err?.code === 'auth/network-request-failed') {
        toast(i18n.t('toast.networkError'), 'error');
      } else if (err?.code === 'auth/needs-browser-open') {
        toast("Ouvrez l'application dans Safari pour vous connecter.", 'error');
      } else if (err?.code === 'auth/popup-blocked-manual') {
        toast('Popups bloqués — autorisez-les pour ce site dans les paramètres du navigateur.', 'error');
      } else {
        toast(i18n.t('toast.loginError'), 'error');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthTransitioning(true);
    clearCachedUser();
    setCurrentUser(null);
    try {
      await firebaseSignOut();
    } finally {
      setIsAuthTransitioning(false);
    }
    // Redirige vers /login (plus propre que /) : évite de rendre Home sans utilisateur
    navigate('/login');
  };

  const handleContactSeller = (seller: User, productId?: string) => {
    // No login required — anyone can contact a seller via WhatsApp
    const whatsapp = seller.whatsapp || (seller as any).sellerDetails?.phone;
    if (!whatsapp) {
      toast(i18n.t('toast.noWhatsapp'), 'error');
      return;
    }
    analyticsContactSeller(seller.id, seller.name, productId);
    const num = whatsapp.replace(/[^0-9+]/g, '');
    if (!/^\+?\d{7,15}$/.test(num)) {
      toast(i18n.t('toast.noWhatsapp'), 'error');
      return;
    }
    // Professional shop greeting message (used for shop profile contact)
    const shopName = seller.sellerDetails?.shopName || seller.name;
    const message = i18n.t('toast.shopContactMessage', { shopName });
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSellerAccess = () => {
    if (!currentUser) { navigate('/login'); return; }
    if (currentUser.role === 'admin') { navigate('/admin'); return; }
    if (currentUser.role === 'seller') navigate('/dashboard');
    else navigate('/register-seller');
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      loginLoading,
      authReady,
      backgroundLoading,
      isAuthTransitioning,
      handleLogin,
      handleLogout,
      handleContactSeller,
      handleSellerAccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
