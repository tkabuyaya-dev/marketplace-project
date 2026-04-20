import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only import the default language statically — others loaded on demand
import fr from './locales/fr/common.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
] as const;

// Lazy loaders for non-default languages
const languageLoaders: Record<string, () => Promise<Record<string, any>>> = {
  en: () => import('./locales/en/common.json').then(m => m.default),
};

// Detect saved language before init (same logic as i18next LanguageDetector)
const savedLang = localStorage.getItem('nunulia_lang')
  || navigator.language?.slice(0, 2)
  || 'fr';
const detectedLang = SUPPORTED_LANGUAGES.find(l => l.code === savedLang)?.code || 'fr';

// Pre-load detected language if it's not French
let initialResources: Record<string, { translation: Record<string, any> }> = {
  fr: { translation: fr },
};

async function loadInitialLanguage(): Promise<void> {
  if (detectedLang !== 'fr' && languageLoaders[detectedLang]) {
    const translations = await languageLoaders[detectedLang]();
    initialResources[detectedLang] = { translation: translations };
  }
}

// Initialize i18n (called after initial language is loaded)
async function initI18n(): Promise<void> {
  await loadInitialLanguage();

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: initialResources,
      fallbackLng: 'fr',
      supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'nunulia_lang',
      },
    });
}

// Load a language bundle on demand (called when user switches language)
export async function loadLanguage(code: string): Promise<void> {
  if (i18n.hasResourceBundle(code, 'translation')) return;
  const loader = languageLoaders[code];
  if (!loader) return;
  const translations = await loader();
  i18n.addResourceBundle(code, 'translation', translations);
}

// Start initialization immediately
const ready = initI18n();
export const i18nReady = ready;

export default i18n;
