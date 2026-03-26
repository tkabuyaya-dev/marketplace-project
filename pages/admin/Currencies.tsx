import React from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { updateCurrency, seedInitialData } from '../../services/firebase';
import type { CurrenciesProps } from './types';

export const Currencies: React.FC<CurrenciesProps> = ({
  currencies, countries, setCurrencies, refreshData,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const toggleCurrencyStatus = async (currency: typeof currencies[0]) => {
    await updateCurrency(currency.id, { isActive: !currency.isActive });
    setCurrencies(prev => prev.map(c => c.id === currency.id ? { ...c, isActive: !c.isActive } : c));
    toast(t('admin.currencyToggled', { code: currency.code, status: !currency.isActive ? t('admin.activated') : t('admin.deactivated') }), 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">{t('admin.currencyManagement', { count: currencies.length })}</h2>
      <p className="text-sm text-gray-400">{t('admin.currencyDescription')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {currencies.map(cur => (
          <div key={cur.id} className={`bg-gray-900 border rounded-xl p-4 flex items-center justify-between ${cur.isActive ? 'border-green-600/30' : 'border-gray-800 opacity-60'}`}>
            <div>
              <p className="text-white font-bold">{cur.symbol} <span className="text-gray-400 font-normal">({cur.code})</span></p>
              <p className="text-xs text-gray-500">{cur.name}</p>
              {cur.countryId !== 'intl' && (() => {
                const c = countries.find(cc => cc.id === cur.countryId);
                return c ? <p className="text-[10px] text-gray-600 mt-0.5">{c.flag} {c.name}</p> : null;
              })()}
              {cur.countryId === 'intl' && <p className="text-[10px] text-gray-600 mt-0.5">🌐 {t('admin.international')}</p>}
            </div>
            <button
              onClick={() => toggleCurrencyStatus(cur)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                cur.isActive
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600 hover:text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {cur.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
            </button>
          </div>
        ))}
      </div>
      {currencies.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
          <p className="text-3xl mb-3">💱</p>
          <p className="text-sm mb-4">{t('admin.noCurrencies')}</p>
          <button
            onClick={async () => {
              try {
                await seedInitialData();
                await refreshData();
                toast(t('admin.seedSuccess'), 'success');
              } catch (err) {
                console.error('Seed error:', err);
                toast(t('admin.seedError'), 'error');
              }
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {t('admin.seedCurrencies')}
          </button>
        </div>
      )}
    </div>
  );
};
