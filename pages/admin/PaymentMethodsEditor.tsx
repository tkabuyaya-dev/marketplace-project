/**
 * NUNULIA — Admin : éditeur des méthodes Mobile Money par pays
 *
 * Écrit `paymentMethods/{countryId}` (Firestore) — consommé en temps réel par
 * PlansPage, RenewSubscriptionModal, BoostProductModal et les modals
 * d'approbation admin. Une modification est visible par les vendeurs en
 * quelques secondes, sans redéploiement.
 *
 * Les constantes PAYMENT_METHODS (constants.ts) ne servent plus que de
 * seed/fallback offline.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentMethod } from '../../types';
import { INITIAL_COUNTRIES, PAYMENT_METHODS, getCountryFlag } from '../../constants';
import { subscribeToAllPaymentMethods, updatePaymentMethods } from '../../services/firebase';
import { useToast } from '../../components/Toast';

export const PaymentMethodsEditor: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [byCountry, setByCountry] = useState<Record<string, PaymentMethod[]>>(PAYMENT_METHODS);
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [draft, setDraft] = useState<PaymentMethod[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAllPaymentMethods(setByCountry);
    return () => unsub();
  }, []);

  const openEditor = (countryId: string) => {
    setOpenCountry(countryId);
    setDraft((byCountry[countryId] || []).map(m => ({ ...m })));
  };

  const setField = (i: number, field: 'name' | 'number', value: string) => {
    setDraft(prev => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  };

  const handleSave = async () => {
    if (!openCountry) return;
    const cleaned = draft
      .map(m => ({ name: m.name.trim(), number: m.number.trim(), icon: m.icon || '📱' }))
      .filter(m => m.name && m.number);
    if (cleaned.length === 0) {
      toast(t('admin.pmNeedOne', 'Au moins une méthode avec nom et numéro est requise.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await updatePaymentMethods(openCountry, cleaned);
      toast(t('admin.pmSaved', 'Méthodes de paiement mises à jour — visibles par les vendeurs immédiatement.'), 'success');
      setOpenCountry(null);
    } catch (err) {
      console.error('[PaymentMethodsEditor] save error:', err);
      toast(t('admin.pmSaveError', 'Échec de la sauvegarde.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">
        {t('admin.pmTitle', 'Méthodes de paiement par pays')}
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        {t('admin.pmSubtitle', 'Numéros Mobile Money affichés aux vendeurs (abonnements et boosts). Modification appliquée en temps réel.')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {INITIAL_COUNTRIES.map(country => {
          const methods = byCountry[country.id] || [];
          const isOpen = openCountry === country.id;
          return (
            <div key={country.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-white">{getCountryFlag(country)} {country.name}</p>
                <button
                  onClick={() => (isOpen ? setOpenCountry(null) : openEditor(country.id))}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
                >
                  {isOpen ? t('admin.pmClose', 'Fermer') : t('admin.pmEdit', 'Modifier')}
                </button>
              </div>

              {!isOpen && methods.map((m, i) => (
                <p key={i} className="text-xs text-gray-400 truncate">
                  {m.icon} <span className="text-gray-300 font-semibold">{m.name}</span> — {m.number}
                </p>
              ))}

              {isOpen && (
                <div className="space-y-1.5">
                  {draft.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        value={m.name}
                        onChange={e => setField(i, 'name', e.target.value)}
                        placeholder={t('admin.pmNamePh', 'Opérateur')}
                        className="w-2/5 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 outline-none"
                      />
                      <input
                        value={m.number}
                        onChange={e => setField(i, 'number', e.target.value)}
                        placeholder={t('admin.pmNumberPh', 'Numéro ou consigne')}
                        className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 outline-none"
                      />
                      <button
                        onClick={() => setDraft(prev => prev.filter((_, idx) => idx !== i))}
                        aria-label={t('admin.pmRemove', 'Retirer')}
                        className="w-7 h-7 flex-shrink-0 rounded-lg bg-red-600/15 text-red-400 text-xs font-bold hover:bg-red-600/30 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => setDraft(prev => [...prev, { name: '', number: '', icon: '📱' }])}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      + {t('admin.pmAdd', 'Ajouter')}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-black bg-gold-400 text-gray-900 hover:bg-gold-300 disabled:opacity-50 transition-colors"
                    >
                      {saving ? t('admin.pmSaving', 'Sauvegarde…') : t('admin.pmSave', 'Sauvegarder')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
