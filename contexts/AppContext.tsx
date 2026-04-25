/**
 * NUNULIA — AppContext (composition shim)
 *
 * AppProvider composes the 3 focused contexts:
 *   PreferencesProvider → AuthProvider → NotificationProvider
 *
 * useAppContext() merges all 3 for backward compatibility.
 * Existing consumers require zero changes.
 *
 * For new components, prefer the focused hooks directly:
 *   useAuthContext()         — auth state only
 *   useNotificationContext() — notifications only
 *   usePreferencesContext()  — country/language/search/online only
 */
import React from 'react';
import { PreferencesProvider, usePreferencesContext } from './PreferencesContext';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider, useAuthContext } from './AuthContext';
import { NotificationProvider, useNotificationContext } from './NotificationContext';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../services/analytics';

// Re-export focused hooks so consumers can import from a single place
export { useAuthContext } from './AuthContext';
export { useNotificationContext } from './NotificationContext';
export { usePreferencesContext } from './PreferencesContext';

/**
 * Backward-compatible hook — merges all 3 contexts.
 * Has the same shape as the old useAppContext() — no consumer changes needed.
 */
export const useAppContext = () => ({
  ...usePreferencesContext(),
  ...useAuthContext(),
  ...useNotificationContext(),
});

/** GA4 page view tracker — lives here to avoid repeating in each sub-provider */
const PageViewTracker: React.FC = () => {
  const location = useLocation();
  React.useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferencesProvider>
      <AuthProvider>
        <NotificationProvider>
          <PageViewTracker />
          {children}
        </NotificationProvider>
      </AuthProvider>
    </PreferencesProvider>
  </ThemeProvider>
);
