/**
 * NUNULIA — "Je Cherche" Form
 *
 * Slide-up modal allowing buyers (logged-in or anonymous) to post a product need.
 * Designed to complete in < 10 seconds.
 *
 * Rules:
 * - Max 3 active requests per WhatsApp per 24h
 * - Auto-expires in 7 days (server-side cron)
 * - Pre-fills title from current search query
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../contexts/AppContext';
import { useCategories } from '../../hooks/useCategories';
import {
  createBuyerRequest,
  getRecentRequestCountByWhatsApp,
} from '../../services/firebase/buyer-requests';
import { uploadImage } from '../../services/cloudinary';
import { verifyRecaptcha, loadRecaptchaScript } from '../../services/recaptcha';
import { INITIAL_COUNTRIES, getCountryFlag } from '../../constants';
import { CITIES_BY_COUNTRY } from '../../data/locations';
import { CategoryGridPicker } from './CategoryGridPicker';
import { suggestCategory, HELP_CATEGORY_SLUG } from '../../utils/categoryAutoSuggest';
import {
  validatePhone,
  normalizeLocalDigits,
  getPhoneSpec,
} from '../../utils/phoneValidation';

const LAST_CATEGORY_KEY = 'nunulia_last_category';

interface JeChercheFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

type Step = 'form' | 'success';

export const JeChercheForm: React.FC<JeChercheFormProps> = ({ isOpen, onClose, initialQuery = '' }) => {
  const { t } = useTranslation();
  const { currentUser } = useAppContext();
  const { categories } = useCategories();

  const defaultCountry = currentUser?.sellerDetails?.countryId || 'bi';

  // Form fields
  const [title, setTitle]       = useState(initialQuery);
  const [countryId, setCountryId] = useState(defaultCountry);
  const [city, setCity]         = useState('');
  const [localPhone, setLocalPhone] = useState(() => {
    const wp = currentUser?.whatsapp || '';
    const prefix = getPhoneSpec(defaultCountry).dialCode;
    const stripped = wp.startsWith(prefix) ? wp.slice(prefix.length) : wp;
    return normalizeLocalDigits(stripped);
  });
  // Catégorie : pré-remplie depuis la dernière utilisée (sauf _help)
  const [category, setCategory] = useState(() => {
    try {
      const last = localStorage.getItem(LAST_CATEGORY_KEY);
      return last && last !== HELP_CATEGORY_SLUG ? last : '';
    } catch { return ''; }
  });
  const [suggested, setSuggested] = useState<string | null>(null);
  const [budget, setBudget]     = useState('');
  const [showOptional, setShowOptional] = useState(false);

  // Image upload state
  const [imagePreview, setImagePreview]   = useState<string | null>(null);
  const [imageUrl, setImageUrl]           = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError]       = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [step, setStep]     = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const titleRef = useRef<HTMLInputElement>(null);

  // Derived
  const phoneSpec   = getPhoneSpec(countryId);
  const phonePrefix = phoneSpec.dialCode;
  const phoneCheck  = validatePhone(countryId, localPhone);
  const cities      = CITIES_BY_COUNTRY[countryId] || [];
  const selectedCountry = INITIAL_COUNTRIES.find(c => c.id === countryId);

  // Sync title when search query changes
  useEffect(() => {
    if (initialQuery && step === 'form') setTitle(initialQuery);
  }, [initialQuery]);

  // Auto-suggestion catégorie (debounce 350ms pour éviter le jitter pendant la frappe)
  useEffect(() => {
    const handle = setTimeout(() => {
      setSuggested(suggestCategory(title));
    }, 350);
    return () => clearTimeout(handle);
  }, [title]);

  // Load reCAPTCHA script on first open (lazy — not at module import)
  useEffect(() => {
    if (isOpen) loadRecaptchaScript();
  }, [isOpen]);

  // Focus title on open + reset state
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 100);
      setStep('form');
      setError('');
      setImagePreview(null);
      setImageUrl(null);
      setImageError('');
    }
  }, [isOpen]);

  // Upload image immédiatement à la sélection (en arrière-plan)
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation locale rapide
    if (!file.type.startsWith('image/')) {
      setImageError(t('jeCherche.form.imageErrorType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError(t('jeCherche.form.imageErrorSize'));
      return;
    }

    setImageError('');
    // Aperçu local immédiat
    setImagePreview(URL.createObjectURL(file));
    setImageUrl(null);
    setImageUploading(true);

    try {
      const url = await uploadImage(file, { folder: 'buyer-requests', maxWidth: 800 });
      setImageUrl(url);
    } catch {
      setImageError(t('jeCherche.form.imageErrorUpload'));
      setImagePreview(null);
    } finally {
      setImageUploading(false);
    }
  }, [t]);

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    setImageUrl(null);
    setImageError('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  // When country changes: reset city and clear local phone
  const handleCountryChange = (newCountryId: string) => {
    setCountryId(newCountryId);
    setCity('');
    setLocalPhone('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    const digitsOnly   = normalizeLocalDigits(localPhone);
    const fullWhatsapp = phonePrefix + digitsOnly;

    // Synchronous validation — fail fast before any network call
    if (!trimmedTitle)  { setError(t('jeCherche.form.errorTitle'));    return; }
    if (!digitsOnly)    { setError(t('jeCherche.form.errorWhatsapp')); return; }
    if (!phoneCheck.valid) {
      const msg = phoneCheck.missing > 0
        ? `Il manque ${phoneCheck.missing} chiffre${phoneCheck.missing > 1 ? 's' : ''} (${phoneCheck.required} requis pour ${phoneSpec.flag}).`
        : `${phoneCheck.extra} chiffre${phoneCheck.extra > 1 ? 's' : ''} en trop (${phoneCheck.required} requis pour ${phoneSpec.flag}).`;
      setError(msg);
      return;
    }
    if (!city)          { setError(t('jeCherche.form.errorCity'));      return; }
    if (!category)      { setError(t('jeCherche.form.errorCategory'));  return; }

    // Show loading spinner immediately — before any async work
    // (reCAPTCHA + rate limit can take 1-3s on slow networks)
    setLoading(true);

    try {
      // Rate limit check — fire-and-forget on error (don't block legit users)
      try {
        const recentCount = await getRecentRequestCountByWhatsApp(fullWhatsapp);
        if (recentCount >= 3) {
          setError(t('jeCherche.form.errorRateLimit'));
          return;
        }
      } catch { /* network error — continue */ }

      // ⚠️  NE PAS supprimer ce Promise.race — Fix iOS Safari (ITP)
      // Sur iPhone, window.grecaptcha.ready() peut ne jamais se déclencher
      // (ITP bloque les scripts Google). Sans ce timeout, le formulaire
      // se bloque indéfiniment. Le fallback resolve(true) laisse passer la soumission.
      const captchaOk = await Promise.race([
        verifyRecaptcha('je_cherche_submit'),
        new Promise<boolean>(resolve => setTimeout(() => resolve(true), 3000)),
      ]);
      if (!captchaOk) {
        setError(t('jeCherche.form.errorCaptcha'));
        return;
      }

      await createBuyerRequest({
        title:          trimmedTitle,
        countryId,
        province:       city,
        city,
        whatsapp:       fullWhatsapp,
        buyerId:        currentUser?.id,
        buyerName:      currentUser?.name || t('jeCherche.form.anonymousBuyer'),
        category,
        budget:         budget ? parseFloat(budget) : undefined,
        budgetCurrency: selectedCountry?.currency,
        imageUrl:       imageUrl || undefined,
      });

      // Mémorise la dernière catégorie réelle utilisée (jamais _help)
      if (category !== HELP_CATEGORY_SLUG) {
        try { localStorage.setItem(LAST_CATEGORY_KEY, category); } catch { /* quota */ }
      }

      setStep('success');
    } catch (err: any) {
      setError(err?.message || t('jeCherche.form.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('jeCherche.form.title')}
        className="fixed bottom-0 left-0 right-0 z-[71] bg-gray-900 border-t border-gray-700 rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up md:max-w-lg md:mx-auto md:left-1/2 md:-translate-x-1/2 md:rounded-2xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:border md:border-gray-700 md:shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-black text-white">{t('jeCherche.form.title')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{t('jeCherche.form.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors"
            aria-label={t('jeCherche.form.close')}
          >
            ✕
          </button>
        </div>

        {/* ── STEP: FORM ── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 1. Titre — required */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelTitle')} <span className="text-red-400">*</span>
              </label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('jeCherche.form.placeholderTitle')}
                maxLength={100}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/20 outline-none text-sm"
              />
            </div>

            {/* 2. Catégorie — required (avec suggestion auto + grid + "Je ne sais pas trop") */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelCategory')} <span className="text-red-400">*</span>
              </label>
              {categories.length > 0 ? (
                <CategoryGridPicker
                  value={category}
                  onChange={setCategory}
                  suggested={suggested}
                  categories={categories}
                />
              ) : (
                <div className="h-20 bg-gray-800/40 border border-gray-700/50 rounded-xl animate-pulse" />
              )}
            </div>

            {/* 3. Pays — required */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelCountry')} <span className="text-red-400">*</span>
              </label>
              <select
                value={countryId}
                onChange={e => handleCountryChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-gold-400/50 outline-none text-sm cursor-pointer"
              >
                {INITIAL_COUNTRIES.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{getCountryFlag(c)} {c.name}</option>
                ))}
              </select>
            </div>

            {/* 3. Ville — dropdown depuis la liste officielle par pays */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelCity')} <span className="text-red-400">*</span>
              </label>
              {cities.length > 0 ? (
                <select
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-gold-400/50 outline-none text-sm cursor-pointer"
                >
                  <option value="">{t('jeCherche.form.selectCity')}</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder={t('jeCherche.form.placeholderCity')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/20 outline-none text-sm"
                />
              )}
            </div>

            {/* 5. WhatsApp — après la localisation, avec indicatif auto */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelWhatsapp')} <span className="text-red-400">*</span>
              </label>
              <div className={`flex gap-0 rounded-xl overflow-hidden border focus-within:ring-1 transition-all ${
                phoneCheck.digits.length === 0
                  ? 'border-gray-700 focus-within:border-gold-400/50 focus-within:ring-gold-400/20'
                  : phoneCheck.valid
                    ? 'border-green-500/40 focus-within:ring-green-500/20'
                    : 'border-red-500/40 focus-within:ring-red-500/20'
              }`}>
                {/* Indicatif pays — non modifiable, change avec le pays */}
                <div className="flex items-center gap-1.5 px-3 py-3 bg-gray-700/60 border-r border-gray-700 shrink-0 select-none">
                  <span className="text-base leading-none">{selectedCountry ? getCountryFlag(selectedCountry) : ''}</span>
                  <span className="text-sm font-bold text-gold-400 tracking-wide">{phonePrefix}</span>
                </div>
                {/* Numéro local — input strict : on n'accepte que les chiffres */}
                <input
                  type="tel"
                  value={localPhone}
                  onChange={e => setLocalPhone(normalizeLocalDigits(e.target.value))}
                  placeholder={phoneSpec.placeholder}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={phoneSpec.digits + 2}
                  className="flex-1 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none text-sm min-w-0 tracking-wider"
                />
                {/* Compteur live à droite */}
                <div className="flex items-center px-3 py-3 bg-gray-700/40 border-l border-gray-700 shrink-0 select-none">
                  <span className={`text-xs font-mono font-bold ${
                    phoneCheck.valid
                      ? 'text-green-400'
                      : phoneCheck.digits.length === 0
                        ? 'text-gray-500'
                        : 'text-orange-400'
                  }`}>
                    {phoneCheck.digits.length}/{phoneCheck.required}
                  </span>
                </div>
              </div>
              {/* Hint dynamique selon état */}
              {phoneCheck.digits.length === 0 ? (
                <p className="text-[10px] text-gray-600 mt-1 pl-1">
                  Ex: {phoneSpec.placeholder} — {phoneCheck.required} chiffres requis pour {phoneSpec.flag}
                </p>
              ) : phoneCheck.valid ? (
                <p className="text-[10px] text-green-400 mt-1 pl-1">
                  ✓ Numéro complet : {phonePrefix} {phoneCheck.digits}
                </p>
              ) : phoneCheck.missing > 0 ? (
                <p className="text-[10px] text-orange-400 mt-1 pl-1">
                  ⚠ Il manque {phoneCheck.missing} chiffre{phoneCheck.missing > 1 ? 's' : ''} ({phoneCheck.required} requis pour {phoneSpec.flag})
                </p>
              ) : (
                <p className="text-[10px] text-red-400 mt-1 pl-1">
                  ⚠ {phoneCheck.extra} chiffre{phoneCheck.extra > 1 ? 's' : ''} en trop — vérifiez le numéro
                </p>
              )}
            </div>

            {/* Options facultatives */}
            <button
              type="button"
              onClick={() => setShowOptional(p => !p)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <span
                className="inline-block transition-transform duration-200"
                style={{ transform: showOptional ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >▶</span>
              {t('jeCherche.form.optionalDetails')}
            </button>

            {showOptional && (
              <div className="space-y-3 pl-3 border-l-2 border-gray-700/60">

                {/* Image — optionnelle */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">
                    {t('jeCherche.form.labelImage')}
                  </label>

                  {/* Zone d'upload / aperçu */}
                  {imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800">
                      <img
                        src={imagePreview}
                        alt="Aperçu"
                        className="w-full h-40 object-cover"
                      />
                      {/* Overlay upload en cours */}
                      {imageUploading && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                          <span className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-gold-400 font-bold">{t('jeCherche.form.imageUploading')}</span>
                        </div>
                      )}
                      {/* Badge succès + bouton supprimer */}
                      {!imageUploading && imageUrl && (
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <span className="bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            ✓ {t('jeCherche.form.imageReady')}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="w-6 h-6 bg-black/60 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white text-xs transition-colors"
                            title={t('jeCherche.form.imageRemove')}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Zone de sélection */
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full h-24 border-2 border-dashed border-gray-700 hover:border-gold-400/50 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-gray-300 transition-all duration-200 bg-gray-800/40 hover:bg-gray-800/70 group"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
                      <span className="text-xs font-medium">{t('jeCherche.form.imageUploadHint')}</span>
                      <span className="text-[10px] text-gray-600">JPG, PNG, WebP · max 5 Mo</span>
                    </button>
                  )}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />

                  {imageError && (
                    <p className="text-xs text-red-400 mt-1.5 pl-1">{imageError}</p>
                  )}
                </div>

                {/* Budget — optionnel */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">
                    {t('jeCherche.form.labelBudget')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="Ex: 50000"
                      min="0"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:border-gold-400/50 outline-none text-sm"
                    />
                    <span className="flex items-center px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-xs text-gray-400 font-bold">
                      {selectedCountry?.currency || 'BIF'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !phoneCheck.valid || !title.trim() || !city || !category}
              className="w-full py-3.5 bg-gold-400 hover:bg-gold-300 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-black rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>🔍 {t('jeCherche.form.submit')}</>
              )}
            </button>

            <p className="text-[10px] text-gray-600 text-center">
              {t('jeCherche.form.privacyNote')}
            </p>
          </form>
        )}

        {/* ── STEP: SUCCESS ── */}
        {step === 'success' && (
          <div className="text-center py-6 animate-fade-in">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-black text-white mb-3">{t('jeCherche.success.title')}</h3>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">{t('jeCherche.success.subtitle')}</p>
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-gold-400 hover:bg-gold-300 text-gray-900 font-black rounded-xl text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t('jeCherche.success.close')}
            </button>
          </div>
        )}
      </div>
    </>
  );
};
