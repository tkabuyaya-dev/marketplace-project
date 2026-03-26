import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { User, SellerDetails } from '../types';
import { PROVINCES_BY_COUNTRY } from '../constants';
import { registerSeller, updateUserProfile } from '../services/firebase';
import { uploadImage } from '../services/cloudinary';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { verifyRecaptcha } from '../services/recaptcha';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useActiveCountries } from '../hooks/useActiveCountries';

export const SellerRegistration: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const onSuccess = () => {
    toast(t('registration.successToast'), 'success');
    navigate('/dashboard');
  };
  const onCancel = () => navigate('/');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { countries } = useActiveCountries();
  const [editName, setEditName] = useState(currentUser.name || '');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { activeCountry } = useAppContext();
  const [formData, setFormData] = useState<SellerDetails>({
    cni: '',
    phone: '',
    countryId: activeCountry || 'bi',
    province: '',
    commune: '',
    quartier: '',
    shopName: '',
    sellerType: 'shop',
    gps: undefined,
    categories: [],
    hasNif: false,
    hasRegistry: false,
    nif: '',
    registryNumber: '',
  });

  const [files, setFiles] = useState<{ cni?: File, nif?: File, reg?: File, shop?: File }>({});
  const [gpsLoading, setGpsLoading] = useState(false);

  // Validate formData country against active countries
  const regCountryIds = countries.map(c => c.id).join(',');
  useEffect(() => {
    if (countries.length > 0 && !countries.find(c => c.id === formData.countryId)) {
      setFormData(prev => ({ ...prev, countryId: countries[0].id }));
    }
  }, [regCountryIds]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleChange = (field: keyof SellerDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCountryChange = (countryId: string) => {
    const provinces = PROVINCES_BY_COUNTRY[countryId];
    setFormData(prev => ({
      ...prev,
      countryId,
      province: provinces?.[0] || '',
      commune: '',
      quartier: '',
    }));
  };

  const handleFileChange = (field: 'cni' | 'nif' | 'reg' | 'shop', file: File) => {
      setFiles(prev => ({ ...prev, [field]: file }));
  };

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
        const exists = prev.categories.includes(cat);
        return {
            ...prev,
            categories: exists ? prev.categories.filter(c => c !== cat) : [...prev.categories, cat]
        };
    });
  };

  const captureGPS = () => {
      if (!navigator.geolocation) {
          toast(t('registration.gpsNotSupported'), 'error');
          return;
      }

      // Check HTTPS (geolocation requires secure context except localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
          toast(t('registration.gpsNeedsHttps'), 'error');
          return;
      }

      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
          (position) => {
              setFormData(prev => ({
                  ...prev,
                  gps: {
                      lat: position.coords.latitude,
                      lng: position.coords.longitude
                  }
              }));
              toast(t('registration.gpsCapturedSuccess'), 'success');
              setGpsLoading(false);
          },
          (error) => {
              console.error('[GPS]', error.code, error.message);
              let msg = t('registration.gpsErrorGeneric');
              switch (error.code) {
                  case 1: // PERMISSION_DENIED
                      msg = t('registration.gpsErrorDenied');
                      break;
                  case 2: // POSITION_UNAVAILABLE
                      msg = t('registration.gpsErrorUnavailable');
                      break;
                  case 3: // TIMEOUT
                      msg = t('registration.gpsErrorTimeout');
                      break;
              }
              toast(msg, 'error');
              setGpsLoading(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
  };

  const handleSubmit = async () => {
    // Validate terms acceptance (tracked in React state for reliable cross-browser UX)
    if (!acceptedTerms) {
      toast(t('registration.termsRequired'), 'error');
      return;
    }

    setLoading(true);

    try {
        // reCAPTCHA v3 verification before registration
        const passed = await verifyRecaptcha('seller_registration');
        if (!passed) {
          toast(t('registration.securityFailed'), 'error');
          setLoading(false);
          return;
        }
        if (formData.sellerType === 'shop' && !formData.gps) {
            toast(t('registration.gpsRequired'), 'error');
            setStep(2);
            setLoading(false);
            return;
        }

        if (formData.sellerType === 'shop' && !files.shop) {
             toast(t('registration.shopPhotoRequired'), 'error');
             setStep(2);
             setLoading(false);
             return;
        }

        // Upload documents
        const documents: any = {};
        if (files.cni) documents.cniUrl = await uploadImage(files.cni, { folder: 'aurabuja-app-2026/documents' });
        if (files.nif) documents.nifUrl = await uploadImage(files.nif, { folder: 'aurabuja-app-2026/documents' });
        if (files.reg) documents.registryUrl = await uploadImage(files.reg, { folder: 'aurabuja-app-2026/documents' });

        let shopImageUrl = '';
        if (files.shop) shopImageUrl = await uploadImage(files.shop, { folder: 'aurabuja-app-2026/shops' });

        const finalData = { ...formData, documents, shopImage: shopImageUrl };

        // Update name if changed
        if (editName.trim() && editName.trim() !== currentUser.name) {
          await updateUserProfile(currentUser.id, { name: editName.trim() });
        }

        // Register via Service
        await registerSeller(currentUser.id, finalData);
        onSuccess();
    } catch (error: any) {
        console.error('Registration error:', error);
        toast(error?.message || t('registration.registrationError'), 'error');
    } finally {
        setLoading(false);
    }
  };

  const provinces = PROVINCES_BY_COUNTRY[formData.countryId];
  const hasProvinceList = !!provinces && provinces.length > 0;
  const selectedCountry = countries.find(c => c.id === formData.countryId);

  // --- RENDERING SECTIONS ---

  const renderProgress = () => (
      <div className="flex justify-between mb-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-800 -z-10"></div>
          {[1, 2, 3, 4].map(num => (
              <div key={num} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= num ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                  {num}
              </div>
          ))}
      </div>
  );

  const renderStep1_Personal = () => (
    <div className="space-y-4 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-4">{t('registration.step1Title')}</h2>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('registration.fullName')}</label>
            <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('registration.fullNamePlaceholder')}
                maxLength={100}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none"
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">{t('registration.countryLabel')}</label>
                <select
                    value={formData.countryId}
                    onChange={e => handleCountryChange(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                >
                    {countries.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">{t('registration.cniLabel')}</label>
                <input
                    value={formData.cni}
                    onChange={e => handleChange('cni', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
        </div>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('registration.phoneLabel')}</label>
            <input
                type="tel"
                value={formData.phone}
                onChange={e => handleChange('phone', e.target.value)}
                placeholder={formData.countryId === 'bi' ? t('registration.phoneCodeBi') : formData.countryId === 'cd' ? t('registration.phoneCodeCd') : t('registration.phoneCodeGeneric')}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
            />
        </div>

        {/* Province — dropdown for all countries with known provinces, free text otherwise */}
        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">
              {formData.countryId === 'bi' ? t('registration.provinceLabel') : t('registration.provinceCityLabel')} *
            </label>
            {hasProvinceList ? (
                <select
                    value={formData.province}
                    onChange={e => handleChange('province', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                >
                    {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            ) : (
                <input
                    value={formData.province}
                    onChange={e => handleChange('province', e.target.value)}
                    placeholder={t('registration.provincePlaceholder')}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            )}
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  {formData.countryId === 'bi' ? t('registration.communeLabel') : t('registration.communeCityLabel')} *
                </label>
                <input
                    value={formData.commune}
                    onChange={e => handleChange('commune', e.target.value)}
                    placeholder={formData.countryId === 'cd' ? t('registration.communePlaceholder') : ''}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  {formData.countryId === 'bi' ? t('registration.quarterLabel') : t('registration.quarterAddressLabel')} *
                </label>
                <input
                    value={formData.quartier}
                    onChange={e => handleChange('quartier', e.target.value)}
                    placeholder={formData.countryId !== 'bi' ? t('registration.quarterPlaceholder') : ''}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
        </div>

        <div className="pt-4 flex justify-end">
            <Button type="button" onClick={() => setStep(2)} disabled={!formData.cni || !formData.phone || !formData.province || !formData.commune}>{t('registration.next')}</Button>
        </div>
    </div>
  );

  const renderStep2_Activity = () => (
    <div className="space-y-4 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-4">{t('registration.step2Title')}</h2>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('registration.shopName')}</label>
            <input
                value={formData.shopName}
                onChange={e => handleChange('shopName', e.target.value)}
                placeholder={currentUser.name}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
            />
        </div>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">{t('registration.sellerTypeLabel')}</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[{ id: 'shop', label: t('registration.typeShop') }, { id: 'street', label: t('registration.typeStreet') }, { id: 'online', label: t('registration.typeOnline') }].map(type => (
                    <button
                        key={type.id}
                        type="button"
                        onClick={() => handleChange('sellerType', type.id)}
                        className={`p-3 rounded-xl border text-sm font-bold transition-all ${formData.sellerType === type.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-800 text-gray-400 border-gray-700'}`}
                    >
                        {type.label}
                    </button>
                ))}
            </div>
        </div>

        {/* GPS CAPTURE */}
        {formData.sellerType === 'shop' && (
             <div className="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl animate-fade-in space-y-4">
                <div>
                    <label className="block text-xs font-bold text-blue-300 mb-2">{t('registration.gpsLabel')}</label>
                    <Button
                        type="button"
                        onClick={captureGPS}
                        isLoading={gpsLoading}
                        className={`w-full ${formData.gps ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600'}`}
                        icon={<span>📍</span>}
                    >
                        {formData.gps ? t('registration.gpsCaptured', { lat: formData.gps.lat.toFixed(4), lng: formData.gps.lng.toFixed(4) }) : t('registration.gpsButton')}
                    </Button>
                    <p className="text-[10px] text-gray-500 mt-2">{t('registration.gpsHint')}</p>
                </div>

                <div className="border border-dashed border-gray-600 rounded-xl p-4 text-center">
                    <p className="text-sm font-bold text-gray-300 mb-2">{t('registration.shopPhotoLabel')}</p>
                    <input type="file" accept="image/*" onChange={e => e.target.files && handleFileChange('shop', e.target.files[0])} className="text-xs text-gray-500" />
                </div>
             </div>
        )}

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">{t('registration.categoriesLabel')}</label>
            <div className="flex flex-wrap gap-2">
                {firestoreCategories.map(c => c.name).map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${formData.categories.includes(cat) ? 'bg-white text-gray-900 border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>
        </div>

        <div className="pt-4 flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>{t('registration.back')}</Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              disabled={
                formData.categories.length === 0 ||
                (formData.sellerType === 'shop' && (!formData.gps || !files.shop))
              }
            >
              {t('registration.next')}
            </Button>
        </div>
    </div>
  );

  const renderStep3_Legal = () => (
    <div className="space-y-6 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-1">{t('registration.step3Title')}</h2>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
            <label className="block text-sm font-bold text-white mb-3">{t('registration.hasNifQuestion')}</label>
            <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={formData.hasNif} onChange={() => handleChange('hasNif', true)} className="accent-blue-500" />
                    <span className="text-sm text-gray-300">{t('registration.yes')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!formData.hasNif} onChange={() => handleChange('hasNif', false)} className="accent-blue-500" />
                    <span className="text-sm text-gray-300">{t('registration.no')}</span>
                </label>
            </div>
            {formData.hasNif && (
                <input
                    value={formData.nif}
                    onChange={e => handleChange('nif', e.target.value)}
                    placeholder={t('registration.nifPlaceholder')}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white text-sm"
                />
            )}
        </div>

        <div className={`p-4 rounded-xl border ${formData.hasNif ? 'bg-blue-900/20 border-blue-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
            <h4 className={`text-sm font-bold mb-1 ${formData.hasNif ? 'text-blue-400' : 'text-red-400'}`}>
                {formData.hasNif ? t('registration.nifUnlimited') : t('registration.nifLimited')}
            </h4>
            <p className="text-xs text-gray-400">
                {t('registration.nifExplanation')}
            </p>
        </div>

        <div className="pt-4 flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>{t('registration.back')}</Button>
            <Button type="button" onClick={() => setStep(4)}>{t('registration.next')}</Button>
        </div>
    </div>
  );

  const renderStep4_Final = () => (
      <div className="space-y-6 animate-fade-in">
          <h2 className="text-xl font-bold text-white mb-4">{t('registration.step4Title')}</h2>

          <div className="space-y-4">
              <div className="border border-dashed border-gray-700 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-gray-300 mb-2">{t('registration.cniPhotoLabel')}</p>
                  <input type="file" accept="image/*" onChange={e => e.target.files && handleFileChange('cni', e.target.files[0])} className="text-xs text-gray-500" />
              </div>

              {formData.hasNif && (
                  <div className="border border-dashed border-gray-700 rounded-xl p-4 text-center">
                      <p className="text-sm font-bold text-gray-300 mb-2">{t('registration.nifPhotoLabel')}</p>
                      <input type="file" accept="image/*" onChange={e => e.target.files && handleFileChange('nif', e.target.files[0])} className="text-xs text-gray-500" />
                  </div>
              )}
          </div>

          <div className={`bg-gray-800 p-4 rounded-xl border-l-4 ${acceptedTerms ? 'border-green-500' : 'border-blue-500'}`}>
              <label className="flex gap-3 cursor-pointer items-start">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="mt-1 accent-blue-500 w-5 h-5 shrink-0"
                  />
                  <span className="text-xs text-gray-300 leading-relaxed">
                      {t('registration.termsAccept')}
                  </span>
              </label>
          </div>

          <div className="pt-4 flex justify-between gap-4">
              <Button variant="ghost" type="button" onClick={() => setStep(3)}>{t('registration.back')}</Button>
              <Button
                type="button"
                className="flex-1"
                isLoading={loading}
                disabled={!acceptedTerms || loading}
                onClick={handleSubmit}
              >
                {t('registration.createShop')}
              </Button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center pt-20 pb-10 px-4 relative">
        <div className="absolute top-4 right-4 z-50">
          <LanguageSwitcher compact />
        </div>
        <div className="w-full max-w-lg">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600 mb-2">
                    {t('registration.title')}
                </h1>
                <p className="text-gray-400 text-sm">{t('registration.subtitle')}</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 shadow-2xl rounded-3xl p-6 md:p-8">
                {renderProgress()}

                {step === 1 && renderStep1_Personal()}
                {step === 2 && renderStep2_Activity()}
                {step === 3 && renderStep3_Legal()}
                {step === 4 && renderStep4_Final()}
            </div>

            <button onClick={onCancel} className="mt-6 text-sm text-gray-500 hover:text-white w-full text-center">
                {t('registration.cancel')}
            </button>
        </div>
    </div>
  );
};

export default SellerRegistration;
