/**
 * NUNULIA — ThemeContext
 *
 * Light mode is the default for first-time visitors (target users browse in
 * direct equatorial sunlight in Bujumbura/Kinshasa/Kigali markets).
 * Dark mode is opt-in and persists in localStorage.
 *
 * The pre-paint bootstrap script in index.html applies the `dark` class on
 * <html> before React mounts, so there is no flash on reload.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'nunulia_theme';

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

const readStoredTheme = (): Theme => {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const applyTheme = (t: Theme) => {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // Keep PWA theme-color in sync (status bar tint on Android Chrome)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#111318' : '#FAFAF8');
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, _setTheme] = useState<Theme>(readStoredTheme);

  // Mirror the boot script (no-op when class already matches).
  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    _setTheme(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
