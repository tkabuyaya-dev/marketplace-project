import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { User, AppNotification } from '../types';
import {
  subscribeToAuth,
  subscribeToUserProfile,
  subscribeToNotifications,
  signInWithGoogle,
  signOut as firebaseSignOut,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToLanguageSettings,
  getCachedUser,
  clearCachedUser,
} from '../services/firebase';
import type { LanguageSettings } from '../services/firebase/admin-data';
import { auth } from '../firebase-config';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { trackPageView, setUserProperties, trackLogin, trackContactSeller as analyticsContactSeller } from '../services/analytics';
import { setSentryUser, clearSentryUser } from '../services/sentry';
import i18n, { loadLanguage } from '../i18n';

interface AppContextType {
  currentUser: User | null;
  isOnline: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  activeCountry: string;
  setActiveCountry: (country: string) => void;
  notifications: AppNotification[];
  unreadCount: number;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleContactSeller: (seller: User, productId?: string) => void;
  handleSellerAccess: () => void;
  loginLoading: boolean;
  authReady: boolean;
  backgroundLoading: boolean;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
  enabledLanguages: string[];
  defaultLanguage: string;
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Instant app shell: use cached user from localStorage (< 1ms)
  // Firebase Auth verifies in background; updates silently if different
  const cachedUser = useRef(getCachedUser()).current;

  const [currentUser, setCurrentUser] = useState<User | null>(cachedUser);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Restore saved country from localStorage, fallback handled by useActiveCountries
  const [activeCountry, setActiveCountry] = useState<string>(() => {
    try {
      return localStorage.getItem('nunulia_active_country') || '';
    } catch { return ''; }
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!!cachedUser);
  const [backgroundLoading, setBackgroundLoading] = useState(!!cachedUser);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['fr', 'en', 'rn', 'sw', 'rw']);
  const [defaultLanguage, setDefaultLanguage] = useState<string>('fr');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const userProfileUnsub = useRef<(() => void) | null>(null);
  const notifUnsub = useRef<(() => void) | null>(null);

  // Network status with automatic token refresh on reconnect
  const handleReconnect = useCallback(async () => {
    if (auth?.currentUser) {
      await auth.currentUser.getIdToken(true);
      toast(i18n.t('toast.connectionRestored'), 'success');
    }
  }, []);
  const { isOnline } = useNetworkStatus(handleReconnect);

  // Hide splash loader helper
  const hideLoader = useCallback(() => {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 300);
    }
  }, []);

  // If we have a cached user, hide the loader IMMEDIATELY (< 1ms)
  useEffect(() => {
    if (cachedUser) hideLoader();
  }, []);

  // Auth subscription — Firebase verifies in background
  useEffect(() => {
    // Safety timeout: if Firebase Auth doesn't respond in 3s, show app anyway
    const timeout = setTimeout(() => {
      if (!authReady) {
        setAuthReady(true);
        setBackgroundLoading(false);
        hideLoader();
      }
    }, 3000);

    const unsubscribe = subscribeToAuth((user) => {
      clearTimeout(timeout);
      setCurrentUser(user);
      setAuthReady(true);
      setBackgroundLoading(false);
      hideLoader();
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // NOTE: No handleRedirectResult() needed here.
  // onAuthStateChanged (in subscribeToAuth) handles ALL auth results:
  // popup success, redirect return, and existing sessions.
  // getRedirectResult was removed because it causes "missing initial state"
  // errors on iOS standalone PWA and storage-partitioned browsers.

  // Real-time user profile + notifications listener
  useEffect(() => {
    // Cleanup previous subscriptions
    if (userProfileUnsub.current) { userProfileUnsub.current(); userProfileUnsub.current = null; }
    if (notifUnsub.current) { notifUnsub.current(); notifUnsub.current = null; }

    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Real-time profile updates (subscription tier changes from admin)
    userProfileUnsub.current = subscribeToUserProfile(currentUser.id, (updatedUser) => {
      setCurrentUser(updatedUser);
    });

    // Real-time notifications (exclude new_message from bell — those go on chat icon)
    notifUnsub.current = subscribeToNotifications(currentUser.id, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read && n.type !== 'new_message').length);
    });

    return () => {
      if (userProfileUnsub.current) userProfileUnsub.current();
      if (notifUnsub.current) notifUnsub.current();
    };
  }, [currentUser?.id]);

  // Listener temps réel pour les paramètres de langues (admin)
  useEffect(() => {
    const unsub = subscribeToLanguageSettings((settings: LanguageSettings) => {
      setEnabledLanguages(settings.enabledLanguages);
      setDefaultLanguage(settings.defaultLanguage);
      // Si la langue active est désactivée, basculer vers la langue par défaut
      if (!settings.enabledLanguages.includes(i18n.language)) {
        loadLanguage(settings.defaultLanguage).then(() => i18n.changeLanguage(settings.defaultLanguage));
      }
    });
    return () => unsub();
  }, []);

  // GA4: Track page views on route change
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  // GA4 + Sentry: Set user properties when user changes
  useEffect(() => {
    if (currentUser) {
      setUserProperties(currentUser.id, currentUser.role, currentUser.sellerDetails?.countryId || activeCountry || 'unknown');
      setSentryUser(currentUser.id, currentUser.email, currentUser.role);
    } else {
      clearSentryUser();
    }
  }, [currentUser?.id, currentUser?.role]);

  // Persist selected country to localStorage
  useEffect(() => {
    if (activeCountry) {
      try { localStorage.setItem('nunulia_active_country', activeCountry); } catch { /* ignore */ }
    }
  }, [activeCountry]);

  // Keyboard shortcut: Cmd+K (optimized — listener created once)
  const isSearchOpenRef = useRef(isSearchOpen);
  useEffect(() => { isSearchOpenRef.current = isSearchOpen; }, [isSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape' && isSearchOpenRef.current) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const user = await signInWithGoogle();
      // user is null when: popup was cancelled, or redirect was triggered
      // In redirect case, onAuthStateChanged will handle login after page reload
      if (user) {
        setCurrentUser(user);
        trackLogin('google');
        if (user.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
        }
      }
    } catch (err: any) {
      console.error('[Auth] Login error code:', err?.code, '| message:', err?.message, err);
      if (err?.code === 'auth/network-request-failed') {
        toast(i18n.t('toast.networkError'), 'error');
      } else if (err?.code === 'auth/needs-browser-open') {
        toast('Ouvrez l\'application dans Safari pour vous connecter.', 'error');
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
    clearCachedUser();
    await firebaseSignOut();
    setCurrentUser(null);
    navigate('/');
  };

  const handleContactSeller = (seller: User, productId?: string) => {
    if (!currentUser) {
      toast(i18n.t('toast.loginToContact'), 'info');
      navigate('/login');
      return;
    }
    const whatsapp = seller.whatsapp || (seller as any).sellerDetails?.phone;
    if (!whatsapp) {
      toast(i18n.t('toast.noWhatsapp'), 'error');
      return;
    }
    analyticsContactSeller(seller.id, seller.name, productId);
    const num = whatsapp.replace(/[^0-9+]/g, '');
    // Validate: must be digits and optional leading '+', min 7 digits
    if (!/^\+?\d{7,15}$/.test(num)) {
      toast(i18n.t('toast.noWhatsapp'), 'error');
      return;
    }
    window.open(`https://wa.me/${num}`, '_blank', 'noopener,noreferrer');
  };

  const handleSellerAccess = () => {
    if (!currentUser) { navigate('/login'); return; }
    if (currentUser.role === 'admin') { navigate('/admin'); return; }
    if (currentUser.role === 'seller') { navigate('/dashboard'); }
    else { navigate('/register-seller'); }
  };

  const markNotifRead = async (id: string) => {
    await markNotificationRead(id);
  };

  const markAllNotifsRead = async () => {
    if (currentUser) await markAllNotificationsRead(currentUser.id);
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      isOnline,
      isSearchOpen, setIsSearchOpen,
      activeCountry, setActiveCountry,
      notifications, unreadCount,
      handleLogin, handleLogout,
      handleContactSeller, handleSellerAccess,
      loginLoading,
      authReady,
      backgroundLoading,
      markNotifRead, markAllNotifsRead,
      enabledLanguages, defaultLanguage,
    }}>
      {children}
    </AppContext.Provider>
  );
};
