import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Product } from '../types';
import { THEME } from '../constants';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SearchOverlay } from './SearchOverlay';
import { JeChercheForm } from './JeCherche/JeChercheForm';
import { CountrySwitcher } from './CountrySwitcher';
import { ThemeToggle } from './ThemeToggle';
import { useRotatingPlaceholder } from '../hooks/useRotatingPlaceholder';

interface NavbarProps {
  currentUser: User | null;
  onSellerAccess: () => void;
  isOnline?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentUser, onSellerAccess, isOnline = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isJeChercheOpen, setIsJeChercheOpen] = useState(false);

  // Rotating placeholder — terms defined in locale files (nav.searchTerms)
  // useMemo keeps the array reference stable so the hook's interval never resets
  const searchTerms = useMemo(
    () => (t('nav.searchTerms', { returnObjects: true }) as string[]) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const { term: rotatingTerm, visible: termVisible } = useRotatingPlaceholder(searchTerms);

  // Allow other pages (e.g. Search results JeChercheBlock) to open the form via a custom event
  useEffect(() => {
    const handler = () => setIsJeChercheOpen(true);
    window.addEventListener('open-je-cherche', handler);
    return () => window.removeEventListener('open-je-cherche', handler);
  }, []);

  const handleProductClick = (product: Product) => {
    setIsSearchOpen(false);
    navigate(`/product/${product.slug || product.id}`);
  };

  const renderActionItem = () => {
    if (!currentUser) return { path: '/login', icon: '👤', label: t('nav.login'), useSellerAccess: false };
    if (currentUser.role === 'admin') return { path: '/admin', icon: '🛡️', label: t('nav.admin'), useSellerAccess: true };
    if (currentUser.role === 'seller') return { path: '/dashboard', icon: '📊', label: t('nav.myShop'), useSellerAccess: true };
    return { path: '/dashboard', icon: '💼', label: t('nav.sell'), useSellerAccess: true };
  };

  const actionItem = renderActionItem();

  const navItems = [
    { path: '/', icon: '🏠', label: t('nav.home'), useSellerAccess: false },
    { path: '/favorites', icon: '❤️', label: t('nav.favorites'), useSellerAccess: false },
    actionItem,
    { path: '/profile', icon: '⚙️', label: t('nav.account'), useSellerAccess: false },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleNav = (item: typeof navItems[0]) => {
    if (item.useSellerAccess) onSellerAccess();
    else navigate(item.path);
  };

  return (
    <>
      {/* Search Overlay — shared between mobile & desktop */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onProductClick={handleProductClick}
      />

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full z-[60] bg-yellow-600 text-yellow-950 text-center text-xs font-bold py-1.5 pt-safe px-4">
          {t('offline.banner')}
        </div>
      )}

      {/* ── Desktop/Tablet Top Nav ── */}
      <nav className="hidden md:flex fixed top-0 w-full z-50 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-6 py-4 justify-between items-center transition-all duration-500">
        <button
          onClick={() => navigate('/')}
          className={`text-2xl font-black bg-gradient-to-r ${THEME.gradient} text-transparent bg-clip-text transition-all duration-500`}
        >
          NUNULIA
        </button>

        {/* Desktop search bar — fake input, opens overlay on click */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800/90 dark:hover:bg-gray-800 border border-gray-200 hover:border-gray-300 dark:border-gray-700/70 dark:hover:border-gray-600 rounded-2xl w-64 lg:w-96 text-left transition-all duration-200 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/40"
        >
          {/* Search icon */}
          <svg
            width="15" height="15" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2.5}
            className="text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 flex-shrink-0 transition-colors duration-200"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          {/* Animated rotating placeholder */}
          <span className="flex-1 overflow-hidden h-5 relative">
            <span
              className={`absolute inset-0 text-sm text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-400 transition-all duration-300 whitespace-nowrap overflow-hidden text-ellipsis ${
                termVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1.5'
              }`}
            >
              {rotatingTerm || t('nav.search')}
            </span>
          </span>

          {/* Keyboard shortcut badge */}
          <span className="text-[10px] bg-gray-200 dark:bg-gray-700/80 border border-gray-300 dark:border-gray-600/60 rounded-md px-1.5 py-0.5 text-gray-600 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-400 hidden lg:inline-block font-mono flex-shrink-0 transition-colors duration-200">
            {t('nav.shortcut')}
          </span>
        </button>

        <div className="flex items-center gap-4">
          {/* Je Cherche — desktop */}
          <button
            onClick={() => setIsJeChercheOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-gold-400 text-gray-900 text-sm font-bold shadow-[0_0_12px_rgba(251,191,36,0.35)] hover:shadow-[0_0_20px_rgba(251,191,36,0.55)] hover:scale-105 transition-all duration-200"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Je Cherche
          </button>

          <LanguageSwitcher />
          <CountrySwitcher />
          <ThemeToggle />
          {currentUser && <NotificationBell />}

          <div className="flex gap-6">
            {navItems.map((item) => (
              <button
                key={item.path + item.label}
                onClick={() => handleNav(item)}
                className={`text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'text-gold-600 dark:text-gold-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Mobile Top Bar — single row 56px matching Home reference ── */}
      <div className="md:hidden fixed top-0 w-full z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-safe-nav shadow-[0_1px_10px_rgba(0,0,0,0.06)] dark:shadow-none">
        <div className="flex items-center gap-2 px-3 h-14">
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 flex-shrink-0"
            aria-label="NUNULIA — Accueil"
          >
            <div className="w-7 h-7 rounded-md bg-gold-400 flex items-center justify-center text-gray-900 font-black text-sm leading-none">
              N
            </div>
            <span className="text-base font-black tracking-[-0.03em] text-gray-900 dark:text-white">
              NUNULIA
            </span>
          </button>

          {/* Search input — flex:1, opens overlay on tap */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-1.5 bg-[#F7F7F5] dark:bg-gray-800 border-[1.5px] border-gray-200 dark:border-gray-700 hover:border-gold-400 focus-visible:border-gold-400 rounded-[10px] px-2.5 h-9 text-left transition-colors duration-200 focus-visible:outline-none"
            aria-label={t('nav.search')}
          >
            <svg
              width="15" height="15" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2.5}
              className="text-gray-400 dark:text-gray-500 flex-shrink-0"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="flex-1 overflow-hidden h-4 relative">
              <span
                className={`absolute inset-0 text-[13px] text-gray-500 dark:text-gray-400 transition-all duration-300 whitespace-nowrap overflow-hidden text-ellipsis ${
                  termVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
                }`}
              >
                {rotatingTerm || t('search.searchPlaceholder')}
              </span>
            </span>
          </button>

          {/* Actions — Bell + Avatar */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {currentUser && <NotificationBell />}
            <button
              onClick={() => navigate(currentUser ? '/profile' : '/login')}
              className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-gray-900 font-black text-[13px] flex-shrink-0 active:scale-95 transition-transform"
              aria-label={t('nav.account')}
            >
              {currentUser?.name?.charAt(0)?.toUpperCase() || '?'}
            </button>
          </div>
        </div>
      </div>

      {/* Je Cherche Form — global modal, opened from header button or JeChercheBlock */}
      <JeChercheForm
        isOpen={isJeChercheOpen}
        onClose={() => setIsJeChercheOpen(false)}
      />

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gold-900/30 pb-safe transition-all duration-500">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <button
              key={item.path + item.label}
              onClick={() => handleNav(item)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive(item.path)
                  ? 'text-gold-600 dark:text-gold-400'
                  : 'text-gray-500 dark:text-gray-500'
              }`}
            >
              <span className={`text-xl transition-transform duration-200 ${isActive(item.path) ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive(item.path) && (
                <span className="absolute bottom-1 w-1 h-1 bg-current rounded-full shadow-[0_0_8px_currentColor]" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
