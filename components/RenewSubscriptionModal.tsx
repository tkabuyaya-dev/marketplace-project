/**
 * NUNULIA — RenewSubscriptionModal
 *
 * Permet à un vendeur de renouveler son plan actuel directement depuis le
 * dashboard, sans navigation vers /plans.
 *
 * Flux en 3 états :
 *   payment  → affiche le montant + les méthodes de paiement du pays
 *   confirm  → saisie de la référence de transaction
 *   done     → confirmation d'envoi
 *
 * La sélection de plan (upgrade) reste sur /plans — ce modal gère uniquement
 * le renouvellement du plan courant.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  SubscriptionRequest, SubscriptionTier, SubscriptionPricing,
} from '../types';
import {
  PAYMENT_METHODS, DEFAULT_SUBSCRIPTION_PRICING,
  INITIAL_SUBSCRIPTION_TIERS, INITIAL_COUNTRIES, SUPPORT_WHATSAPP,
} from '../constants';
import {
  createSubscriptionRequest,
  confirmPayment,
  subscribeToSubscriptionTiers,
  subscribeToSubscriptionPricing,
} from '../services/firebase';
import { useToast } from './Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Tier label currently held by the seller (e.g. "Pro", "Elite") */
  currentTierLabel: string;
  sellerCountryId: string;
  userId: string;
  sellerName: string;
  /** Real-time list of seller's subscription requests (passed from dashboard) */
  existingRequests: SubscriptionRequest[];
}

type Step = 'payment' | 'confirm' | 'done';

// ─── Component ───────────────────────────────────────────────────────────────

export const RenewSubscriptionModal: React.FC<Props> = ({
  isOpen, onClose,
  currentTierLabel, sellerCountryId,
  userId, sellerName,
  existingRequests,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // ── Data ──
  const [tiers, setTiers] = useState<SubscriptionTier[]>(INITIAL_SUBSCRIPTION_TIERS);
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);

  // ── UI ──
  const [step, setStep] = useState<Step>('payment');
  const [loading, setLoading] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);

  // Subscribe to dynamic tiers & pricing only while the modal is open
  useEffect(() => {
    if (!isOpen) return;
    setTransactionRef('');

    // If vendor closed the modal before entering their ref, resume at confirm step
    const resumable = tier
      ? existingRequests.find(r => r.planId === tier.id && r.status === 'pending' && !r.transactionRef)
      : undefined;
    if (resumable) {
      setRequestId(resumable.id);
      setStep('confirm');
    } else {
      setRequestId(null);
      setStep('payment');
    }

    const unsubTiers = subscribeToSubscriptionTiers(setTiers);
    const unsubPricing = subscribeToSubscriptionPricing(sellerCountryId, setPricing);
    return () => {
      unsubTiers();
      unsubPricing();
    };
  }, [isOpen, sellerCountryId]);

  if (!isOpen) return null;

  // ── Derived values ──
  const country = INITIAL_COUNTRIES.find(c => c.id === sellerCountryId);
  const paymentMethods = PAYMENT_METHODS[sellerCountryId] || PAYMENT_METHODS['bi'];
  const whatsappNumber = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];

  // Find the tier matching the seller's current plan
  const tier = tiers.find(t => t.label === currentTierLabel) ?? null;

  const getPrice = (): number => {
    if (!tier) return 0;
    if (pricing?.prices[tier.id] !== undefined) return pricing.prices[tier.id];
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.prices[tier.id] || 0;
  };

  const getCurrency = (): string => {
    if (pricing?.currency) return pricing.currency;
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.currency;
  };

  const price = getPrice();
  const currency = getCurrency();
  const formattedPrice = `${price.toLocaleString()} ${currency}`;

  const hasPendingForPlan = tier
    ? existingRequests.some(
        r => r.planId === tier.id && (r.status === 'pending' || r.status === 'pending_validation')
      )
    : false;

  // ── Handlers ──

  const handleCreateRequest = async () => {
    if (!tier) return;
    if (hasPendingForPlan) {
      toast(t('plans.alreadyPending'), 'error');
      return;
    }
    setLoading(true);
    try {
      const id = await createSubscriptionRequest({
        userId,
        sellerName,
        countryId: sellerCountryId,
        planId: tier.id,
        planLabel: tier.label,
        amount: price,
        currency,
        status: 'pending',
        transactionRef: null,
        proofUrl: null,
        maxProducts: tier.max === null ? 99999 : tier.max,
      });
      setRequestId(id);
      setStep('confirm');
      toast(t('plans.requestCreated'), 'success');
    } catch {
      toast(t('plans.requestCreateError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!requestId || !transactionRef.trim()) {
      toast(t('plans.enterRef'), 'error');
      return;
    }
    setLoading(true);
    try {
      await confirmPayment(requestId, transactionRef.trim());
      setStep('done');
      toast(t('plans.paymentConfirmed'), 'success');
    } catch {
      toast(t('plans.paymentConfirmError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800">
          <div>
            <h3 className="text-base font-black text-white">
              {step === 'done' ? t('plans.requestSent') : t('dashboard.renewModalTitle', { plan: currentTierLabel })}
            </h3>
            {step === 'payment' && tier && (
              <p className="text-xs text-gray-400 mt-0.5">
                {t('dashboard.renewModalSubtitle', { amount: formattedPrice })}
              </p>
            )}
          </div>
          {!loading && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-xl leading-none p-1"
              aria-label="Fermer"
            >
              ✕
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── No matching tier (edge case: plan set by admin with custom label) ── */}
          {!tier && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-gray-400">
                {t('dashboard.renewModalContactAdmin')}
              </p>
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(`Bonjour, je souhaite renouveler mon abonnement ${currentTierLabel} sur Nunulia.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl transition-colors"
              >
                WhatsApp
              </a>
            </div>
          )}

          {/* ── Step: payment ── */}
          {tier && step === 'payment' && (
            <>
              {/* Plan + amount summary */}
              <div className="bg-gray-800/60 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">{tier.label}</p>
                  <p className="text-xs text-gray-400">
                    {tier.max === null ? t('plans.featureUnlimited') : t('plans.planSummary', { max: tier.max })}
                  </p>
                </div>
                <p className="text-xl font-black text-gold-400">{formattedPrice}</p>
              </div>

              {/* Payment methods */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {t('plans.paymentMethods', { flag: country?.flag ?? '', country: country?.name ?? sellerCountryId })}
                </p>
                <div className="space-y-2">
                  {paymentMethods.map((method, i) => (
                    <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg px-4 py-3">
                      <span className="text-lg">{method.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold">{method.name}</p>
                        <p className="text-gold-400 text-xs font-mono">{method.number}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                <p className="font-bold mb-1">{t('plans.instructions')}</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>
                    <Trans
                      i18nKey="plans.instruction1"
                      values={{ amount: formattedPrice }}
                      components={{ strong: <strong /> }}
                    />
                  </li>
                  <li>{t('plans.instruction2')}</li>
                  <li>{t('plans.instruction3')}</li>
                </ol>
              </div>

              {/* Pending guard */}
              {hasPendingForPlan ? (
                <button disabled className="w-full py-3 bg-yellow-600/20 text-yellow-400 text-sm font-bold rounded-xl border border-yellow-600/30">
                  {t('plans.pendingRequest')}
                </button>
              ) : (
                <button
                  onClick={handleCreateRequest}
                  disabled={loading}
                  className="w-full py-3 bg-gold-400 hover:bg-gold-300 disabled:opacity-50 text-gray-900 text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <span className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />}
                  {loading ? t('plans.creating') : t('plans.createRequest')}
                </button>
              )}

              <p className="text-center">
                <a
                  href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(`Bonjour, je souhaite renouveler mon plan ${currentTierLabel} sur Nunulia (${formattedPrice}/mois).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 text-xs hover:underline"
                >
                  {t('plans.needHelpWhatsapp')}
                </a>
              </p>
            </>
          )}

          {/* ── Step: confirm ── */}
          {tier && step === 'confirm' && (
            <>
              <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3 text-xs text-green-300">
                {t('plans.confirmHint')}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2">
                  {t('plans.transactionRefTitle')}
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={e => setTransactionRef(e.target.value)}
                  placeholder={t('plans.transactionRefPlaceholder')}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:outline-none text-sm"
                  autoFocus
                />
                <p className="text-gray-500 text-xs mt-1.5">{t('plans.transactionRefHint')}</p>
              </div>

              <button
                onClick={handleConfirmPayment}
                disabled={loading || !transactionRef.trim()}
                className="w-full py-3 bg-gold-400 hover:bg-gold-300 disabled:opacity-50 text-gray-900 text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading && <span className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />}
                {loading ? t('plans.sending') : t('plans.confirmPaymentBtn')}
              </button>

              <p className="text-center text-gray-500 text-xs">
                {t('plans.notPaidYet')}{' '}
                <button onClick={() => setStep('payment')} className="text-gold-400 hover:underline">
                  {t('plans.viewPaymentInstructions')}
                </button>
              </p>
            </>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="text-5xl">✅</div>
              <div>
                <p className="text-base font-black text-white">{t('plans.successTitle')}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {t('plans.successMessage', { plan: tier?.label ?? currentTierLabel })}
                </p>
                <p className="text-xs text-gray-500 mt-2">{t('plans.notificationHint')}</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl border border-white/20 transition-colors"
              >
                {t('plans.backToDashboardBtn')}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
