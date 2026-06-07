import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { updateCountry } from '../../services/firebase';
import { getCountryFlag } from '../../constants';
import type { CountriesProps } from './types';

export const Countries: React.FC<CountriesProps> = ({
  countries, setCountries, currentUser,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleCountryStatus = async (country: typeof countries[0]) => {
    const next = !country.isActive;
    // Désactiver masque aussi tous les produits du pays (cascade côté serveur)
    // → confirmation pour éviter une coupure accidentelle d'un marché actif.
    if (!next && !window.confirm(t('admin.confirmDeactivateCountry', { name: country.name }))) {
      return;
    }
    setBusyId(country.id);
    try {
      await updateCountry(country.id, { isActive: next }, currentUser.id, currentUser.email);
      setCountries(prev => prev.map(c => (c.id === country.id ? { ...c, isActive: next } : c)));
      toast(
        t('admin.countryToggled', {
          name: country.name,
          status: next ? t('admin.activated') : t('admin.deactivated'),
        }),
        'success',
      );
    } catch (err) {
      console.error('Country toggle error:', err);
      toast(t('admin.seedError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">{t('admin.countryManagement', { count: countries.length })}</h2>
      <p className="text-sm text-gray-400">{t('admin.countryDescription')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(country => (
          <div
            key={country.id}
            className={`bg-gray-900 border rounded-xl p-4 flex items-center justify-between ${
              country.isActive ? 'border-green-600/30' : 'border-gray-800 opacity-60'
            }`}
          >
            <div>
              <p className="text-white font-bold">{getCountryFlag(country)} {country.name}</p>
              <p className="text-xs text-gray-500">{country.code} · {country.currency}</p>
            </div>
            <button
              onClick={() => toggleCountryStatus(country)}
              disabled={busyId === country.id}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 ${
                country.isActive
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600 hover:text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {country.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
