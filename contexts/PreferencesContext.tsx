/**
 * NUNULIA — PreferencesContext
 * Holds: activeCountry, isSearchOpen, isOnline, enabledLanguages, defaultLanguage
 * Independent of Auth and Notifications — renders once per preference change.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { subscribeToLanguageSettings } from '../services/firebase';
import type { LanguageSettings } from '../services/firebase/admin-data';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { auth } from '../firebase-config';
import i18n, { loadLanguage } from '../i18n';

interface PreferencesContextType {
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  activeCountry: string;
  setActiveCountry: (country: string) => void;
  isOnline: boolean;
  enabledLanguages: string[];
  defaultLanguage: string;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export const usePreferencesContext = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferencesContext must be used within PreferencesProvider');
  return ctx;
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useToast();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState<string>(() => {
    try { return localStorage.getItem('nunulia_active_country') || ''; } catch { return ''; }
  });
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['fr', 'en', 'rn', 'sw', 'rw']);
  const [defaultLanguage, setDefaultLanguage] = useState<string>('fr');

  // Network status — token refresh on reconnect
  const handleReconnect = useCallback(async () => {
    if (auth?.currentUser) {
      await auth.currentUser.getIdToken(true);
      toast(i18n.t('toast.connectionRestored'), 'success');
    }
  }, []);
  const { isOnline } = useNetworkStatus(handleReconnect);

  // Persist selected country ('' = Tous les pays)
  useEffect(() => {
    try { localStorage.setItem('nunulia_active_country', activeCountry); } catch { /* ignore */ }
  }, [activeCountry]);

  // Real-time language settings from admin
  useEffect(() => {
    const unsub = subscribeToLanguageSettings((settings: LanguageSettings) => {
      setEnabledLanguages(settings.enabledLanguages);
      setDefaultLanguage(settings.defaultLanguage);
      if (!settings.enabledLanguages.includes(i18n.language)) {
        loadLanguage(settings.defaultLanguage).then(() => i18n.changeLanguage(settings.defaultLanguage));
      }
    });
    return () => unsub();
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
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

  return (
    <PreferencesContext.Provider value={{
      isSearchOpen, setIsSearchOpen,
      activeCountry, setActiveCountry,
      isOnline,
      enabledLanguages, defaultLanguage,
    }}>
      {children}
    </PreferencesContext.Provider>
  );
};
