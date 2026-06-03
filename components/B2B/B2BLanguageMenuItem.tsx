/**
 * B2BLanguageMenuItem — entrée "Langue du Réseau B2B" pour la page Profile.
 *
 * Visible uniquement pour les vendeurs/admins. Ouvre un bottom-sheet local
 * permettant de choisir entre FR / EN / SW / RN / RW.
 *
 * Distinct de la langue UI (qui reste sur le LanguageSwitcher global). Le
 * choix écrit users/{uid}.b2bLang via useUserLanguage.setLanguage().
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe2, Check, ChevronRight } from 'lucide-react';
import { useUserLanguage } from '../../hooks/useUserLanguage';
import type { B2BLang } from '../../types';

const LANGS: { code: B2BLang; label: string; nativeLabel: string; flag: string }[] = [
  { code: 'fr', label: 'Français',    nativeLabel: 'Français',    flag: '🇫🇷' },
  { code: 'en', label: 'English',     nativeLabel: 'English',     flag: '🇬🇧' },
  { code: 'sw', label: 'Kiswahili',   nativeLabel: 'Kiswahili',   flag: '🇹🇿' },
  { code: 'rn', label: 'Kirundi',     nativeLabel: 'Ikirundi',    flag: '🇧🇮' },
  { code: 'rw', label: 'Kinyarwanda', nativeLabel: 'Ikinyarwanda', flag: '🇷🇼' },
];

export const B2BLanguageMenuItem: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useUserLanguage();
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = LANGS.find((l) => l.code === language) || LANGS[0];

  const handlePick = async (code: B2BLang) => {
    try {
      await setLanguage(code);
    } finally {
      setSheetOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-3.5 w-full px-4 py-[11px] text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 active:scale-[0.99] active:bg-gray-50"
      >
        <span
          className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center"
          style={{ background: '#F4F5F7', color: '#5C6370' }}
        >
          <Globe2 size={17} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium leading-snug truncate" style={{ color: '#111318' }}>
            {t('b2b.langMenu.title')}
          </span>
          <span className="block text-[11px] mt-0.5 truncate" style={{ color: '#5C6370' }}>
            {current.flag} {current.nativeLabel}
          </span>
        </span>
        <ChevronRight size={15} style={{ color: '#D1D5DB', flexShrink: 0 }} />
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
          onClick={() => setSheetOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-[.07em] font-bold pb-2" style={{ color: '#5C6370' }}>
              {t('b2b.langMenu.title')}
            </p>
            <p className="text-[12px] mb-2" style={{ color: '#5C6370' }}>
              {t('b2b.langMenu.hint')}
            </p>
            <ul>
              {LANGS.map((l) => {
                const active = l.code === language;
                return (
                  <li key={l.code}>
                    <button
                      type="button"
                      onClick={() => handlePick(l.code)}
                      className="flex items-center w-full gap-3 px-2 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-left"
                    >
                      <span className="text-lg leading-none">{l.flag}</span>
                      <span className="flex-1">
                        <span className="block text-[14px] font-semibold" style={{ color: '#111318' }}>
                          {l.label}
                        </span>
                        <span className="block text-[11.5px]" style={{ color: '#5C6370' }}>
                          {l.nativeLabel}
                        </span>
                      </span>
                      {active && <Check size={17} color="#A45F00" strokeWidth={2.5} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
};
