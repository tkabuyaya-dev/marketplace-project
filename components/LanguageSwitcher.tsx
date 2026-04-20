import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, loadLanguage } from '../i18n';
import { TC } from '../constants';
import { trackLanguageChange } from '../services/analytics';
import { useAppContext } from '../contexts/AppContext';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const { enabledLanguages } = useAppContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Filtrer les langues activées par l'admin
  const visibleLanguages = useMemo(
    () => SUPPORTED_LANGUAGES.filter(l => enabledLanguages.includes(l.code)),
    [enabledLanguages],
  );

  const current = visibleLanguages.find(l => l.code === i18n.language) || visibleLanguages[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchLang = async (code: string) => {
    const prev = i18n.language;
    await loadLanguage(code);
    i18n.changeLanguage(code);
    trackLanguageChange(prev, code, '');
    setOpen(false);
  };

  // Si une seule langue active, pas besoin d'afficher le switcher
  if (visibleLanguages.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 ${compact ? 'px-1.5 py-1 rounded-lg' : 'px-2.5 py-1.5 min-h-[44px] rounded-lg'} border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors text-sm ${
          open ? TC.border400 : ''
        }`}
      >
        {/* Globe icon instead of flag */}
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-gray-400 flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-gray-300 text-xs font-medium">{current?.code.toUpperCase()}</span>
        <span className="text-gray-500 text-[10px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50 animate-fade-in">
          {visibleLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => switchLang(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                lang.code === i18n.language
                  ? `${TC.bg950} ${TC.text400} font-medium`
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
