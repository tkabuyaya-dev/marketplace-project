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
import { Camera, Image as ImageIcon, X as XIcon } from 'lucide-react';
import {
  SubscriptionRequest, SubscriptionPricing, SubscriptionPeriod,
} from '../types';
import {
  PAYMENT_METHODS, DEFAULT_SUBSCRIPTION_PRICING,
  INITIAL_SUBSCRIPTION_TIERS, INITIAL_COUNTRIES,
  getCountryFlag,
} from '../constants';
import { buildWaUrl } from '../config/whatsapp.config';
import {
  createSubscriptionRequest,
  confirmPayment,
  subscribeToSubscriptionPricing,
} from '../services/firebase';
import { uploadImage, UploadError } from '../services/cloudinary';
import { planIdFromLabel } from '../utils/planFeatures';
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
  const tiers = INITIAL_SUBSCRIPTION_TIERS;
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);

  // ── UI ──
  const [step, setStep] = useState<Step>('payment');
  const [loading, setLoading] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  // P2 (Lot 4) : sélecteur de période + preuve de paiement Cloudinary
  const [period, setPeriod] = useState<SubscriptionPeriod>('1m');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);

  // Subscribe to dynamic tiers & pricing only while the modal is open
  useEffect(() => {
    if (!isOpen) return;
    setTransactionRef('');
    setProofUrl(null);
    setPeriod('1m');

    // If vendor closed the modal before entering their ref, resume at confirm step
    const resumable = tier
      ? existingRequests.find(r => r.planId === tier.id && r.status === 'pending' && !r.transactionRef)
      : undefined;
    if (resumable) {
      setRequestId(resumable.id);
      setStep('confirm');
      // Restaure la période choisie à la création (fallback 1m si legacy)
      if (resumable.period) setPeriod(resumable.period);
    } else {
      setRequestId(null);
      setStep('payment');
    }

    const unsubPricing = subscribeToSubscriptionPricing(sellerCountryId, setPricing);
    return () => {
      unsubPricing();
    };
  }, [isOpen, sellerCountryId]);

  if (!isOpen) return null;

  // ── Derived values ──
  const country = INITIAL_COUNTRIES.find(c => c.id === sellerCountryId);
  const paymentMethods = PAYMENT_METHODS[sellerCountryId] || PAYMENT_METHODS['bi'];

  // Find the tier matching the seller's current plan.
  // Why: comptes legacy pré-refonte 2026-06 ont des libellés "Business Pro" /
  // "Élite" / "Starter" qui ne matchent plus les 4 tiers canoniques. On résout
  // via planIdFromLabel (mapping legacy → canonical) sinon ces vendeurs
  // tombent sur le fallback "Contactez l'admin" et ne peuvent plus renouveler
  // en self-service.
  const tierId = planIdFromLabel(currentTierLabel);
  const tier = tierId ? tiers.find(t => t.id === tierId) ?? null : null;

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

  const monthlyPrice = getPrice();
  const currency = getCurrency();

  // Cohérent avec PlansPage.getPeriodPrice : ×3×0.9 / ×12×0.75
  const getPeriodPrice = (p: SubscriptionPeriod): number => {
    if (p === '3m')  return Math.round(monthlyPrice * 3 * 0.9);
    if (p === '12m') return Math.round(monthlyPrice * 12 * 0.75);
    return monthlyPrice;
  };
  const price = getPeriodPrice(period);
  const formattedPrice = `${price.toLocaleString()} ${currency}`;
  const periodDiscount = (p: SubscriptionPeriod) => (p === '12m' ? '-25%' : p === '3m' ? '-10%' : null);

  // Lot C (I1) : une seule demande ouverte à la fois — TOUS plans confondus
  // (aligné sur PlansPage + garde service + garde serveur approveRenewal).
  const hasOpenRequest = existingRequests.some(
    r => r.status === 'pending' || r.status === 'pending_validation'
  );

  // ── Handlers ──

  const handleCreateRequest = async () => {
    if (!tier) return;
    if (hasOpenRequest) {
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
        period, // P2 (Lot 4) : transmet la période choisie
      });
      setRequestId(id);
      setStep('confirm');
      toast(t('plans.requestCreated'), 'success');
    } catch (err: any) {
      // CF createSubscriptionRequest : messages métier FR (demande unique,
      // rate-limit, downgrade bloqué) → affichés tels quels au vendeur
      const businessError = ['functions/failed-precondition', 'functions/resource-exhausted', 'functions/invalid-argument']
        .includes(err?.code || '');
      toast(businessError && err?.message ? err.message : t('plans.requestCreateError'), 'error');
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
      // P2 (Lot 4) : transmet proofUrl (était toujours undefined avant)
      await confirmPayment(requestId, transactionRef.trim(), proofUrl);
      setStep('done');
      toast(t('plans.paymentConfirmed'), 'success');
    } catch {
      toast(t('plans.paymentConfirmError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // P2 (Lot 4) : upload preuve Cloudinary
  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'aurabuja-app-2026/payment-proofs' });
      setProofUrl(url);
      toast(t('plans.proofUploaded', 'Preuve ajoutée'), 'success');
    } catch (err) {
      const msg = err instanceof UploadError ? err.message : t('plans.proofUploadError', 'Échec de l\'envoi de la preuve');
      toast(msg, 'error');
    } finally {
      setProofUploading(false);
    }
  };

  const handleProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProofUpload(file);
    e.target.value = '';
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
                href={buildWaUrl(`Bonjour, je souhaite renouveler mon abonnement ${currentTierLabel} sur NUNULIA.`)}
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
              {/* P2 (Lot 4) : Sélecteur de période 1m/3m/12m avec dégressivité */}
              <div className="flex items-center gap-1.5">
                {(['1m', '3m', '12m'] as SubscriptionPeriod[]).map(p => {
                  const isActive = period === p;
                  const discount = periodDiscount(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all"
                      style={{
                        background: isActive ? '#F5C842' : 'rgba(255,255,255,0.06)',
                        color: isActive ? '#111318' : '#9CA3AF',
                        border: isActive ? '1.5px solid #F5C842' : '1.5px solid transparent',
                      }}
                    >
                      {p === '1m' ? t('plans.period1m', 'Mensuel')
                        : p === '3m' ? t('plans.period3m', 'Trimestriel')
                        : t('plans.period12m', 'Annuel')}
                      {discount && (
                        <span className="text-[9px] font-black px-1 rounded" style={{ background: '#22c55e', color: '#fff' }}>
                          {discount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Plan + amount summary */}
              <div className="bg-gray-800/60 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">{tier.label}</p>
                  <p className="text-xs text-gray-400">
                    {tier.max === null ? t('plans.featureUnlimited') : t('plans.planSummary', { max: tier.max })}
                  </p>
                  {period !== '1m' && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      ≈ {monthlyPrice.toLocaleString()} {currency}{t('plans.perMonth', '/mois')}
                    </p>
                  )}
                </div>
                <p className="text-xl font-black text-gold-400">{formattedPrice}</p>
              </div>

              {/* Payment methods */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {t('plans.paymentMethods', { flag: country ? getCountryFlag(country) : '', country: country?.name ?? sellerCountryId })}
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
              {hasOpenRequest ? (
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
                  href={buildWaUrl(`Bonjour, je souhaite renouveler mon plan ${currentTierLabel} sur NUNULIA (${formattedPrice}/mois).`)}
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

              {/* P2 (Lot 4) : preuve de paiement Cloudinary (facultatif) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2">
                  {t('plans.proofTitle', 'Preuve de paiement (facultatif)')}
                </label>
                {proofUrl ? (
                  <div className="relative">
                    <img
                      src={proofUrl}
                      alt={t('plans.proofAlt', 'Preuve de paiement')}
                      className="w-full max-h-40 object-contain rounded-lg bg-black/30"
                    />
                    <button
                      type="button"
                      onClick={() => setProofUrl(null)}
                      aria-label={t('plans.proofRemove', 'Retirer')}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ) : proofUploading ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-blue-300 font-bold">
                    <span className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-300 rounded-full animate-spin" />
                    {t('plans.proofUploading', 'Envoi en cours…')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      htmlFor="renew-proof-camera"
                      className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer bg-blue-500/10 text-blue-300 border border-blue-500/30 select-none"
                    >
                      <Camera size={14} />
                      <span>{t('plans.proofCamera', 'Photo')}</span>
                    </label>
                    <label
                      htmlFor="renew-proof-gallery"
                      className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer bg-white/5 text-gray-300 border border-gray-700 select-none"
                    >
                      <ImageIcon size={14} />
                      <span>{t('plans.proofGallery', 'Galerie')}</span>
                    </label>
                  </div>
                )}
                <input
                  id="renew-proof-camera"
                  type="file" accept="image/*" capture="environment"
                  onChange={handleProofChange}
                  disabled={proofUploading}
                  className="hidden"
                />
                <input
                  id="renew-proof-gallery"
                  type="file" accept="image/*"
                  onChange={handleProofChange}
                  disabled={proofUploading}
                  className="hidden"
                />
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
