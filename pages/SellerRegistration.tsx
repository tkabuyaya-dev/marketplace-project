import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { User, SellerDetails, Country, Marketplace } from '../types';
import { PROVINCES_BY_COUNTRY } from '../constants';
import { registerSeller, getCountries, updateUserProfile, getMarketplacesByCountry } from '../services/firebase';
import { uploadImage } from '../services/cloudinary';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { verifyRecaptcha } from '../services/recaptcha';

export const SellerRegistration: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const onSuccess = () => {
    toast("Inscription vendeur réussie !", 'success');
    navigate('/dashboard');
  };
  const onCancel = () => navigate('/');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [editName, setEditName] = useState(currentUser.name || '');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);

  const [formData, setFormData] = useState<SellerDetails>({
    cni: '',
    phone: '',
    countryId: 'bi',
    province: 'Bujumbura Mairie',
    commune: '',
    quartier: '',
    shopName: '',
    marketplace: undefined,
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

  useEffect(() => {
      getCountries().then(all => {
          const activeCountries = all.filter(c => c.isActive);
          setCountries(activeCountries);
          if (!activeCountries.find(c => c.id === formData.countryId) && activeCountries.length > 0) {
              setFormData(prev => ({...prev, countryId: activeCountries[0].id}));
          }
      });
  }, []);

  // Load marketplaces when country changes
  useEffect(() => {
    getMarketplacesByCountry(formData.countryId).then(mps => {
      setMarketplaces(mps);
      // Reset marketplace if switching to a country without markets
      if (mps.length === 0) {
        setFormData(prev => ({ ...prev, marketplace: undefined }));
      } else if (!mps.find(m => m.id === formData.marketplace)) {
        // Default to first marketplace or 'autres'
        const autres = mps.find(m => m.id === 'autres');
        setFormData(prev => ({ ...prev, marketplace: autres?.id || mps[0].id }));
      }
    });
  }, [formData.countryId]);

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
          toast("La géolocalisation n'est pas supportée par votre navigateur.", 'error');
          return;
      }

      // Check HTTPS (geolocation requires secure context except localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
          toast("La géolocalisation nécessite une connexion HTTPS sécurisée.", 'error');
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
              toast("Position GPS capturée avec succès !", 'success');
              setGpsLoading(false);
          },
          (error) => {
              console.error('[GPS]', error.code, error.message);
              let msg = "Impossible de récupérer la position.";
              switch (error.code) {
                  case 1: // PERMISSION_DENIED
                      msg = "Accès à la localisation refusé. Allez dans les paramètres de votre navigateur → Autorisations du site → Localisation → Autoriser.";
                      break;
                  case 2: // POSITION_UNAVAILABLE
                      msg = "Position indisponible. Assurez-vous que le GPS est activé sur votre appareil et réessayez.";
                      break;
                  case 3: // TIMEOUT
                      msg = "Délai dépassé. Sortez à l'extérieur pour un meilleur signal GPS et réessayez.";
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
      toast("Veuillez accepter les conditions d'utilisation.", 'error');
      return;
    }

    setLoading(true);

    try {
        // reCAPTCHA v3 verification before registration
        const passed = await verifyRecaptcha('seller_registration');
        if (!passed) {
          toast("Vérification de sécurité échouée. Réessayez.", 'error');
          setLoading(false);
          return;
        }
        if (formData.sellerType === 'shop' && !formData.gps) {
            toast("La localisation GPS est obligatoire pour un magasin fixe.", 'error');
            setStep(2);
            setLoading(false);
            return;
        }

        if (formData.sellerType === 'shop' && !files.shop) {
             toast("Une photo de la boutique est requise.", 'error');
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
        toast(error?.message || "Une erreur est survenue lors de l'inscription.", 'error');
    } finally {
        setLoading(false);
    }
  };

  const provinces = PROVINCES_BY_COUNTRY[formData.countryId];
  const hasProvinceList = !!provinces && provinces.length > 0;
  const hasMarketplaces = marketplaces.length > 0;
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
        <h2 className="text-xl font-bold text-white mb-4">Informations Personnelles</h2>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Nom complet</label>
            <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Votre nom complet"
                maxLength={100}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none"
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Pays *</label>
                <select
                    value={formData.countryId}
                    onChange={e => handleCountryChange(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                >
                    {countries.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">CNI / Passeport *</label>
                <input
                    value={formData.cni}
                    onChange={e => handleChange('cni', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
        </div>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Téléphone Principal (WhatsApp) *</label>
            <input
                type="tel"
                value={formData.phone}
                onChange={e => handleChange('phone', e.target.value)}
                placeholder={formData.countryId === 'bi' ? "+257..." : formData.countryId === 'cd' ? "+243..." : "Code pays + Numéro"}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
            />
        </div>

        {/* Province — dropdown for all countries with known provinces, free text otherwise */}
        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">
              {formData.countryId === 'bi' ? 'Province' : 'Province / Ville'} *
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
                    placeholder="Votre province ou région"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            )}
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  {formData.countryId === 'bi' ? 'Commune' : 'Ville / Cité'} *
                </label>
                <input
                    value={formData.commune}
                    onChange={e => handleChange('commune', e.target.value)}
                    placeholder={formData.countryId === 'cd' ? 'Ex: Goma, Bukavu...' : ''}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  {formData.countryId === 'bi' ? 'Quartier' : 'Adresse / Quartier'} *
                </label>
                <input
                    value={formData.quartier}
                    onChange={e => handleChange('quartier', e.target.value)}
                    placeholder={formData.countryId !== 'bi' ? 'Avenue, Rue...' : ''}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                />
            </div>
        </div>

        <div className="pt-4 flex justify-end">
            <Button type="button" onClick={() => setStep(2)} disabled={!formData.cni || !formData.phone || !formData.province || !formData.commune}>Suivant</Button>
        </div>
    </div>
  );

  const renderStep2_Activity = () => (
    <div className="space-y-4 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-4">Votre Boutique</h2>

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Nom du commerce</label>
            <input
                value={formData.shopName}
                onChange={e => handleChange('shopName', e.target.value)}
                placeholder={currentUser.name}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
            />
        </div>

        {/* Marketplace picker — ONLY for countries with physical markets (e.g. Burundi) */}
        {hasMarketplaces && (
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">Votre marché physique *</label>
            <div className="grid grid-cols-1 gap-2">
                {marketplaces.map(mp => (
                    <button
                        key={mp.id}
                        type="button"
                        onClick={() => handleChange('marketplace', mp.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold transition-all text-left ${
                            formData.marketplace === mp.id
                                ? `${mp.color} text-white border-transparent shadow-lg`
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                        }`}
                    >
                        <span className="text-lg">{mp.icon}</span>
                        <span>{mp.name}</span>
                    </button>
                ))}
            </div>
          </div>
        )}

        {/* Info for countries without physical markets */}
        {!hasMarketplaces && selectedCountry && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <p className="text-sm text-gray-400">
              {selectedCountry.flag} Pour {selectedCountry.name}, le marché physique n'est pas requis. Votre boutique sera visible dans la section {selectedCountry.name}.
            </p>
          </div>
        )}

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">Type de vendeur</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[{ id: 'shop', label: '🏪 Magasin Fixe' }, { id: 'street', label: '🚶 Ambulant' }, { id: 'online', label: '🌐 En Ligne' }].map(type => (
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
                    <label className="block text-xs font-bold text-blue-300 mb-2">Localisation GPS Exacte *</label>
                    <Button
                        type="button"
                        onClick={captureGPS}
                        isLoading={gpsLoading}
                        className={`w-full ${formData.gps ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600'}`}
                        icon={<span>📍</span>}
                    >
                        {formData.gps ? `Position capturée (${formData.gps.lat.toFixed(4)}, ${formData.gps.lng.toFixed(4)})` : "Obtenir ma position GPS"}
                    </Button>
                    <p className="text-[10px] text-gray-500 mt-2">Activez la localisation sur votre téléphone. Indispensable pour que les clients vous trouvent.</p>
                </div>

                <div className="border border-dashed border-gray-600 rounded-xl p-4 text-center">
                    <p className="text-sm font-bold text-gray-300 mb-2">Photo de la devanture/Logo *</p>
                    <input type="file" accept="image/*" onChange={e => e.target.files && handleFileChange('shop', e.target.files[0])} className="text-xs text-gray-500" />
                </div>
             </div>
        )}

        <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">Catégories Principales</label>
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
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>Retour</Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              disabled={
                (hasMarketplaces && !formData.marketplace) ||
                formData.categories.length === 0 ||
                (formData.sellerType === 'shop' && (!formData.gps || !files.shop))
              }
            >
              Suivant
            </Button>
        </div>
    </div>
  );

  const renderStep3_Legal = () => (
    <div className="space-y-6 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-1">Fiscalité & NIF</h2>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
            <label className="block text-sm font-bold text-white mb-3">Avez-vous un NIF ?</label>
            <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={formData.hasNif} onChange={() => handleChange('hasNif', true)} className="accent-blue-500" />
                    <span className="text-sm text-gray-300">Oui</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!formData.hasNif} onChange={() => handleChange('hasNif', false)} className="accent-blue-500" />
                    <span className="text-sm text-gray-300">Non</span>
                </label>
            </div>
            {formData.hasNif && (
                <input
                    value={formData.nif}
                    onChange={e => handleChange('nif', e.target.value)}
                    placeholder="Numéro NIF"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white text-sm"
                />
            )}
        </div>

        <div className={`p-4 rounded-xl border ${formData.hasNif ? 'bg-blue-900/20 border-blue-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
            <h4 className={`text-sm font-bold mb-1 ${formData.hasNif ? 'text-blue-400' : 'text-red-400'}`}>
                {formData.hasNif ? '✅ Compte illimité (selon forfait)' : '⚠️ Limite: 1 à 3 Produits Max'}
            </h4>
            <p className="text-xs text-gray-400">
                Sans NIF, vous êtes restreint au forfait gratuit. Avec NIF, vous pouvez souscrire aux forfaits Pro.
            </p>
        </div>

        <div className="pt-4 flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>Retour</Button>
            <Button type="button" onClick={() => setStep(4)}>Suivant</Button>
        </div>
    </div>
  );

  const renderStep4_Final = () => (
      <div className="space-y-6 animate-fade-in">
          <h2 className="text-xl font-bold text-white mb-4">Justificatifs</h2>

          <div className="space-y-4">
              <div className="border border-dashed border-gray-700 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-gray-300 mb-2">Photo CNI/Passeport (Recto/Verso)</p>
                  <input type="file" accept="image/*" onChange={e => e.target.files && handleFileChange('cni', e.target.files[0])} className="text-xs text-gray-500" />
              </div>

              {formData.hasNif && (
                  <div className="border border-dashed border-gray-700 rounded-xl p-4 text-center">
                      <p className="text-sm font-bold text-gray-300 mb-2">Photo du document NIF</p>
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
                      Je certifie l'exactitude des informations. AuraBuja se réserve le droit de suspendre tout compte frauduleux.
                  </span>
              </label>
          </div>

          <div className="pt-4 flex justify-between gap-4">
              <Button variant="ghost" type="button" onClick={() => setStep(3)}>Retour</Button>
              <Button
                type="button"
                className="flex-1"
                isLoading={loading}
                disabled={!acceptedTerms || loading}
                onClick={handleSubmit}
              >
                Créer ma boutique
              </Button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center pt-20 pb-10 px-4">
        <div className="w-full max-w-lg">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600 mb-2">
                    Devenir Vendeur
                </h1>
                <p className="text-gray-400 text-sm">Créez votre boutique professionnelle sur AuraBuja.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 shadow-2xl rounded-3xl p-6 md:p-8">
                {renderProgress()}

                {step === 1 && renderStep1_Personal()}
                {step === 2 && renderStep2_Activity()}
                {step === 3 && renderStep3_Legal()}
                {step === 4 && renderStep4_Final()}
            </div>

            <button onClick={onCancel} className="mt-6 text-sm text-gray-500 hover:text-white w-full text-center">
                Annuler
            </button>
        </div>
    </div>
  );
};

export default SellerRegistration;
