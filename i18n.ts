import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import fr from './locales/fr/common.json';
import en from './locales/en/common.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  // Phase 7: Swahili, Kirundi, Kinyarwanda, Luganda
  // { code: 'sw', label: 'Kiswahili', flag: '🇹🇿' },
  // { code: 'rn', label: 'Ikirundi', flag: '🇧🇮' },
  // { code: 'rw', label: 'Ikinyarwanda', flag: '🇷🇼' },
  // { code: 'lg', label: 'Luganda', flag: '🇺🇬' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'aurabuja_lang',
    },
  });

export default i18n;
