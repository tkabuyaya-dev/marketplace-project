import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { User, AppNotification, MarketplaceId } from '../types';
import {
  subscribeToAuth,
  subscribeToUserProfile,
  subscribeToNotifications,
  subscribeToUnreadMessages,
  signInWithGoogle,
  signOut as firebaseSignOut,
  createOrGetConversation,
  getFirstAdmin,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/firebase';
import { auth } from '../firebase-config';
import { useNavigate } from 'react-router-dom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface AppContextType {
  currentUser: User | null;
  isOnline: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  activeCountry: string;
  setActiveCountry: (country: string) => void;
  activeMarketplace: MarketplaceId | null;
  setActiveMarketplace: (mp: MarketplaceId | null) => void;
  notifications: AppNotification[];
  unreadCount: number;
  unreadMessagesCount: number;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleContactSeller: (seller: User, productId?: string) => Promise<void>;
  handleSellerAccess: () => void;
  loginLoading: boolean;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState<string>('bi');
  const [activeMarketplace, setActiveMarketplace] = useState<MarketplaceId | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const userProfileUnsub = useRef<(() => void) | null>(null);
  const notifUnsub = useRef<(() => void) | null>(null);
  const msgUnsub = useRef<(() => void) | null>(null);

  // Network status with automatic token refresh on reconnect
  const handleReconnect = useCallback(async () => {
    if (auth?.currentUser) {
      await auth.currentUser.getIdToken(true);
      toast('Connexion rétablie', 'success');
    }
  }, []);
  const { isOnline } = useNetworkStatus(handleReconnect);

  // Auth subscription
  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setCurrentUser(user);
      // Hide initial loader
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => loader.remove(), 300);
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time user profile + notifications listener
  useEffect(() => {
    // Cleanup previous subscriptions
    if (userProfileUnsub.current) { userProfileUnsub.current(); userProfileUnsub.current = null; }
    if (notifUnsub.current) { notifUnsub.current(); notifUnsub.current = null; }
    if (msgUnsub.current) { msgUnsub.current(); msgUnsub.current = null; }

    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      setUnreadMessagesCount(0);
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

    // Real-time unread messages count (for chat icon badge)
    msgUnsub.current = subscribeToUnreadMessages((count) => {
      setUnreadMessagesCount(count);
    });

    return () => {
      if (userProfileUnsub.current) userProfileUnsub.current();
      if (notifUnsub.current) notifUnsub.current();
      if (msgUnsub.current) msgUnsub.current();
    };
  }, [currentUser?.id]);

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
      setCurrentUser(user);
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Erreur connexion:', err);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await firebaseSignOut();
    setCurrentUser(null);
    navigate('/');
  };

  const handleContactSeller = async (seller: User, productId?: string) => {
    if (!currentUser) {
      toast("Connectez-vous pour contacter le vendeur.", 'info');
      navigate('/login');
      return;
    }
    try {
      const conversationId = await createOrGetConversation(seller.id, productId);
      navigate(`/messenger/${conversationId}`, { state: { contactSeller: seller } });
    } catch (err) {
      console.error('Erreur création conversation:', err);
      navigate('/messenger');
    }
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
      activeMarketplace, setActiveMarketplace,
      notifications, unreadCount, unreadMessagesCount,
      handleLogin, handleLogout,
      handleContactSeller, handleSellerAccess,
      loginLoading,
      markNotifRead, markAllNotifsRead,
    }}>
      {children}
    </AppContext.Provider>
  );
};
