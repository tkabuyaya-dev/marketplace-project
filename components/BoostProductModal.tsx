/**
 * NUNULIA — BoostProductModal
 *
 * Permet à un vendeur de booster un produit (7 jours).
 *
 * Flux en 3 étapes :
 *   payment  → affiche le montant + méthodes Mobile Money du pays
 *   confirm  → saisie de la référence de transaction
 *   done     → confirmation d'envoi
 *
 * Calqué sur RenewSubscriptionModal pour cohérence UX.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Product, BoostPricing, BoostRequest } from '../types';
import { PAYMENT_METHODS, SUPPORT_WHATSAPP } from '../constants';
import {
  createBoostRequest,
  confirmBoostPayment,
  subscribeToBoostPricing,
} from '../services/firebase';
import { useToast } from './Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  sellerCountryId: string;
  userId: string;
  sellerName: string;
  existingRequests: BoostRequest[];
}

type Step = 'payment' | 'confirm' | 'done';

const BOOST_DAYS = 7;

// ─── Component ───────────────────────────────────────────────────────────────

export const BoostProductModal: React.FC<Props> = ({
  isOpen, onClose,
  product, sellerCountryId,
  userId, sellerName,
  existingRequests,
}) => {
  const { t }     = useTranslation();
  const { toast } = useToast();

  const [pricing, setPricing]           = useState<BoostPricing | null>(null);
  const [step, setStep]                 = useState<Step>('payment');
  const [loading, setLoading]           = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [requestId, setRequestId]       = useState<string | null>(null);

  // Subscribe to real-time pricing while modal is open
  useEffect(() => {
    if (!isOpen) return;
    setTransactionRef('');

    // If vendor closed the modal before entering their ref, resume at confirm step
    const resumable = existingRequests.find(
      r => r.productId === product.id && r.status === 'pending' && !r.transactionRef
    );
    if (resumable) {
      setRequestId(resumable.id);
      setStep('confirm');
    } else {
      setRequestId(null);
      setStep('payment');
    }

    const unsub = subscribeToBoostPricing(sellerCountryId, setPricing);
    return unsub;
  }, [isOpen, sellerCountryId]);

  if (!isOpen || !pricing) return null;

  // ── Derived ──
  const paymentMethods  = PAYMENT_METHODS[sellerCountryId]  || PAYMENT_METHODS['bi'];
  const whatsappNumber  = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
  const formattedPrice  = `${pricing.amount.toLocaleString()} ${pricing.currency}`;

  const hasPendingBoost = existingRequests.some(
    r => r.productId === product.id && (r.status === 'pending' || r.status === 'pending_validation')
  );

  const isAlreadyBoosted = !!product.isBoosted && !!product.boostExpiresAt && product.boostExpiresAt > Date.now();

  // ── Handlers ──

  const handleCreateRequest = async () => {
    setLoading(true);
    try {
      const id = await createBoostRequest({
        userId,
        sellerName,
        countryId:    sellerCountryId,
        productId:    product.id,
        productTitle: product.title,
        amount:       pricing.amount,
        currency:     pricing.currency,
        status:       'pending',
        transactionRef: null,
      });
      setRequestId(id);
      setStep('confirm');
      toast(t('boost.requestCreated'), 'success');
    } catch {
      toast(t('boost.requestCreateError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!requestId || !transactionRef.trim()) {
      toast(t('boost.enterRef'), 'error');
      return;
    }
    setLoading(true);
    try {
      await confirmBoostPayment(requestId, transactionRef.trim());
      setStep('done');
      toast(t('boost.paymentConfirmed'), 'success');
    } catch {
      toast(t('boost.paymentConfirmError'), 'error');
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
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>⚡</span>
              {step === 'done' ? t('boost.requestSent') : t('boost.modalTitle')}
            </h3>
            {step === 'payment' && (
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[260px]">
                {product.title}
              </p>
            )}
          </div>
          {!loading && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={t('boost.close')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── Already boosted notice ── */}
          {isAlreadyBoosted && step === 'payment' && (
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
              {t('boost.alreadyBoosted', {
                date: new Date(product.boostExpiresAt!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
              })}
            </div>
          )}

          {/* ── Step: payment ── */}
          {step === 'payment' && (
            <>
              {/* Résumé boost */}
              <div className="bg-gray-800/60 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{t('boost.duration', { days: BOOST_DAYS })}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('boost.durationDesc')}</p>
                </div>
                <p className="text-xl font-black text-amber-400 whitespace-nowrap">{formattedPrice}</p>
              </div>

              {/* Méthodes de paiement */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {t('boost.paymentMethodsLabel')}
                </p>
                <div className="space-y-2">
                  {paymentMethods.map((method, i) => (
                    <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg px-4 py-3">
                      <span className="text-lg">{method.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold">{method.name}</p>
                        <p className="text-amber-400 text-xs font-mono">{method.number}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                <p className="font-bold mb-1">{t('boost.instructionsTitle')}</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>
                    <Trans
                      i18nKey="boost.instruction1"
                      values={{ amount: formattedPrice }}
                      components={{ strong: <strong /> }}
                    />
                  </li>
                  <li>{t('boost.instruction2')}</li>
                  <li>{t('boost.instruction3')}</li>
                </ol>
              </div>

              {/* CTA */}
              {hasPendingBoost ? (
                <button disabled className="w-full py-3 bg-yellow-600/20 text-yellow-400 text-sm font-bold rounded-xl border border-yellow-600/30">
                  {t('boost.pendingRequest')}
                </button>
              ) : (
                <button
                  onClick={handleCreateRequest}
                  disabled={loading}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <span className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />}
                  {loading ? t('boost.creating') : t('boost.createRequest')}
                </button>
              )}

              <p className="text-center">
                <a
                  href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(`Bonjour, je voudrais booster le produit "${product.title}" sur Nunulia (${formattedPrice}).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 text-xs hover:underline"
                >
                  {t('boost.needHelpWhatsapp')}
                </a>
              </p>
            </>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && (
            <>
              <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3 text-xs text-green-300">
                {t('boost.confirmHint')}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2">
                  {t('boost.transactionRefTitle')}
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={e => setTransactionRef(e.target.value)}
                  placeholder={t('boost.transactionRefPlaceholder')}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-amber-400 focus:outline-none text-sm"
                  autoFocus
                />
                <p className="text-gray-500 text-xs mt-1.5">{t('boost.transactionRefHint')}</p>
              </div>

              <button
                onClick={handleConfirmPayment}
                disabled={loading || !transactionRef.trim()}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading && <span className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />}
                {loading ? t('boost.sending') : t('boost.confirmPaymentBtn')}
              </button>

              <p className="text-center text-gray-500 text-xs">
                {t('boost.notPaidYet')}{' '}
                <button onClick={() => setStep('payment')} className="text-amber-400 hover:underline">
                  {t('boost.viewPaymentInstructions')}
                </button>
              </p>
            </>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="text-5xl">⚡</div>
              <div>
                <p className="text-base font-black text-white">{t('boost.successTitle')}</p>
                <p className="text-sm text-gray-400 mt-1">{t('boost.successMessage')}</p>
                <p className="text-xs text-gray-500 mt-2">{t('boost.notificationHint')}</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl border border-white/20 transition-colors"
              >
                {t('boost.backToDashboardBtn')}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
