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
import { verifyRecaptcha } from '../../services/recaptcha';
import { INITIAL_COUNTRIES, PROVINCES_BY_COUNTRY } from '../../constants';
import { COMMUNES_BY_PROVINCE } from '../../data/locations';

// Indicatifs téléphoniques par pays
const PHONE_CODES: Record<string, string> = {
  bi: '+257',
  cd: '+243',
  rw: '+250',
  ug: '+256',
  tz: '+255',
  ke: '+254',
};

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
  const [province, setProvince] = useState('');
  const [city, setCity]         = useState('');
  const [localPhone, setLocalPhone] = useState(() => {
    const wp = currentUser?.whatsapp || '';
    const prefix = PHONE_CODES[defaultCountry] || '+257';
    return wp.startsWith(prefix) ? wp.slice(prefix.length) : wp;
  });
  const [category, setCategory] = useState('');
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
  const phonePrefix = PHONE_CODES[countryId] || '+257';
  const provinces   = PROVINCES_BY_COUNTRY[countryId] || [];
  const communes    = (province && COMMUNES_BY_PROVINCE[countryId]?.[province])
    ? COMMUNES_BY_PROVINCE[countryId][province]
    : [];
  const selectedCountry = INITIAL_COUNTRIES.find(c => c.id === countryId);

  // Sync title when search query changes
  useEffect(() => {
    if (initialQuery && step === 'form') setTitle(initialQuery);
  }, [initialQuery]);

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

  // When country changes: reset province, city and clear local phone
  const handleCountryChange = (newCountryId: string) => {
    setCountryId(newCountryId);
    setProvince('');
    setCity('');
    setLocalPhone('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    const digitsOnly   = localPhone.replace(/\D/g, '');
    const fullWhatsapp = phonePrefix + digitsOnly;

    if (!trimmedTitle)  { setError(t('jeCherche.form.errorTitle'));    return; }
    if (!digitsOnly)    { setError(t('jeCherche.form.errorWhatsapp')); return; }
    if (!province)      { setError(t('jeCherche.form.errorProvince')); return; }
    if (!city)          { setError(t('jeCherche.form.errorCity'));      return; }

    // Rate limit check
    try {
      const recentCount = await getRecentRequestCountByWhatsApp(fullWhatsapp);
      if (recentCount >= 3) {
        setError(t('jeCherche.form.errorRateLimit'));
        return;
      }
    } catch { /* continue — better UX than blocking */ }

    // reCAPTCHA v3 verification (bot protection)
    const captchaOk = await verifyRecaptcha('je_cherche_submit');
    if (!captchaOk) {
      setError(t('jeCherche.form.errorCaptcha'));
      return;
    }

    setLoading(true);
    try {
      await createBuyerRequest({
        title:          trimmedTitle,
        countryId,
        province,
        city,
        whatsapp:       fullWhatsapp,
        buyerId:        currentUser?.id,
        buyerName:      currentUser?.name || t('jeCherche.form.anonymousBuyer'),
        category:       category || undefined,
        budget:         budget ? parseFloat(budget) : undefined,
        budgetCurrency: selectedCountry?.currency,
        imageUrl:       imageUrl || undefined,
      });
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

            {/* 2. Pays — required */}
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
                  <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>

            {/* 3. Province — required */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelProvince')} <span className="text-red-400">*</span>
              </label>
              <select
                value={province}
                onChange={e => { setProvince(e.target.value); setCity(''); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-gold-400/50 outline-none text-sm cursor-pointer"
              >
                <option value="">{t('jeCherche.form.selectProvince')}</option>
                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* 4. Ville/Commune — dropdown si données dispo, sinon texte libre */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5">
                {t('jeCherche.form.labelCity')} <span className="text-red-400">*</span>
              </label>
              {communes.length > 0 ? (
                <select
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  disabled={!province}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-gold-400/50 outline-none text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">{t('jeCherche.form.selectCity')}</option>
                  {communes.map(c => <option key={c} value={c}>{c}</option>)}
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
              <div className="flex gap-0 rounded-xl overflow-hidden border border-gray-700 focus-within:border-gold-400/50 focus-within:ring-1 focus-within:ring-gold-400/20 transition-all">
                {/* Indicatif pays — non modifiable, change avec le pays */}
                <div className="flex items-center gap-1.5 px-3 py-3 bg-gray-700/60 border-r border-gray-700 shrink-0 select-none">
                  <span className="text-base leading-none">{selectedCountry?.flag}</span>
                  <span className="text-sm font-bold text-gold-400 tracking-wide">{phonePrefix}</span>
                </div>
                {/* Numéro local */}
                <input
                  type="tel"
                  value={localPhone}
                  onChange={e => setLocalPhone(e.target.value)}
                  placeholder="79 000 000"
                  inputMode="tel"
                  className="flex-1 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none text-sm min-w-0"
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1 pl-1">
                {t('jeCherche.form.whatsappHint', { prefix: phonePrefix })}
              </p>
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

                {/* Catégorie — optionnelle */}
                {categories.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5">
                      {t('jeCherche.form.labelCategory')}
                    </label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:border-gold-400/50 outline-none text-sm cursor-pointer"
                    >
                      <option value="">{t('jeCherche.form.selectCategory')}</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon ? `${cat.icon} ` : ''}{cat.name || cat.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
              disabled={loading}
              className="w-full py-3.5 bg-gold-400 hover:bg-gold-300 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-black rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
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
