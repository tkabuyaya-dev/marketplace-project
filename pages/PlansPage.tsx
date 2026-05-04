import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Check, CheckCircle2, Clock, AlertTriangle, Info,
  Phone, LayoutDashboard, Camera, Image as ImageIcon, X as XIcon,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import {
  INITIAL_SUBSCRIPTION_TIERS, PAYMENT_METHODS, SUPPORT_WHATSAPP,
  DEFAULT_SUBSCRIPTION_PRICING, INITIAL_COUNTRIES,
} from '../constants';
import {
  SubscriptionRequest, SubscriptionTier, SubscriptionPricing, PaymentMethod, SubscriptionPeriod,
} from '../types';
import {
  createSubscriptionRequest, confirmPayment,
  subscribeToSubscriptionPricing, subscribeToSubscriptionTiers,
  subscribeToMyRequests,
} from '../services/firebase';
import { uploadImage, UploadError } from '../services/cloudinary';

type Step = 'plans' | 'payment' | 'confirmation' | 'done';

// Couleur d'accent par méthode de paiement (le type PaymentMethod n'a que name/number/icon)
function getMethodColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('lumicash')) return '#22c55e';
  if (n.includes('ecocash')) return '#f59e0b';
  if (n.includes('m-pesa') || n.includes('mpesa')) return '#16a34a';
  if (n.includes('airtel')) return '#ef4444';
  if (n.includes('orange')) return '#f97316';
  if (n.includes('momo') || n.includes('mtn')) return '#eab308';
  if (n.includes('banco') || n.includes('bcb')) return '#3b82f6';
  return '#5C6370';
}

// SVG WhatsApp inline (pas dans lucide)
const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function WhatsAppButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                 text-green-700 text-sm font-semibold no-underline
                 bg-green-50 border border-green-200
                 active:bg-green-100 transition-colors"
    >
      <WhatsAppIcon />
      {label}
    </a>
  );
}

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['plans', 'payment', 'confirmation', 'done'];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {steps.map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{
            width: i === idx ? 18 : 6,
            background: i <= idx ? '#F5C842' : 'rgba(0,0,0,0.12)',
          }}
        />
      ))}
    </div>
  );
}

export const PlansPage: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, authReady } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('plans');
  const [tiers, setTiers] = useState<SubscriptionTier[]>(INITIAL_SUBSCRIPTION_TIERS);
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionTier | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [refTouched, setRefTouched] = useState(false);
  const [refFocused, setRefFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<SubscriptionRequest[]>([]);
  // Optional payment proof (Cloudinary URL after upload). Sellers can attach a
  // screenshot of the operator SMS to speed up admin validation.
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [period, setPeriod] = useState<SubscriptionPeriod>('1m');

  const sellerCountryId = currentUser?.sellerDetails?.countryId || 'bi';
  const country = INITIAL_COUNTRIES.find(c => c.id === sellerCountryId);
  const paymentMethods = PAYMENT_METHODS[sellerCountryId] || PAYMENT_METHODS['bi'];
  const whatsappNumber = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
  const currentTierLabel = currentUser?.sellerDetails?.tierLabel || 'Gratuit';

  const paidTiers = useMemo(() => tiers.filter(t => t.id !== 'free'), [tiers]);

  // Resolve the seller's currently-held paid tier (matched by label, since admin
  // can override with custom labels — see RenewSubscriptionModal for same logic)
  const currentPaidTier = useMemo(
    () => paidTiers.find(t => t.label === currentTierLabel) ?? null,
    [paidTiers, currentTierLabel]
  );

  // Days remaining on the active paid plan (null = no paid plan / no expiration set)
  const subscriptionExpiresAt = currentUser?.sellerDetails?.subscriptionExpiresAt;
  const daysRemaining = useMemo(() => {
    if (!subscriptionExpiresAt) return null;
    const diffMs = subscriptionExpiresAt - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }, [subscriptionExpiresAt]);
  const isExpiringSoon = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 7;
  const isExpired = daysRemaining === 0;

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser || currentUser.role === 'buyer') {
      navigate('/');
      return;
    }
    const unsubTiers = subscribeToSubscriptionTiers(setTiers);
    const unsubPricing = subscribeToSubscriptionPricing(sellerCountryId, setPricing);
    const unsubRequests = subscribeToMyRequests(currentUser.id, setMyRequests);
    return () => {
      unsubTiers();
      unsubPricing();
      unsubRequests();
    };
  }, [authReady, currentUser, sellerCountryId, navigate]);

  const getPrice = (tierId: string): number => {
    if (pricing?.prices[tierId] !== undefined) return pricing.prices[tierId];
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.prices[tierId] || 0;
  };

  const getCurrency = (): string => {
    if (pricing?.currency) return pricing.currency;
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[sellerCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.currency;
  };

  const formatPrice = (amount: number) => `${amount.toLocaleString()} ${getCurrency()}`;

  // Returns the total price for a given plan + period (with discount applied)
  const getPeriodPrice = (tierId: string, p: SubscriptionPeriod): number => {
    const base = getPrice(tierId);
    if (p === '3m')  return Math.round(base * 3 * 0.9);
    if (p === '12m') return Math.round(base * 12 * 0.75);
    return base; // 1m — no discount
  };

  const periodMultiplier = (p: SubscriptionPeriod) => (p === '12m' ? 12 : p === '3m' ? 3 : 1);
  const periodDiscount   = (p: SubscriptionPeriod) => (p === '12m' ? '-25%' : p === '3m' ? '-10%' : null);
  const periodSuffix     = (p: SubscriptionPeriod) => (p === '12m' ? '/an' : p === '3m' ? '/trim.' : '/mois');

  const getMaxProducts = (tier: SubscriptionTier): number => {
    if (tier.max === null) return 99999;
    return tier.max;
  };

  const hasPendingRequest = (planId: string) =>
    myRequests.some(r => r.planId === planId && (r.status === 'pending' || r.status === 'pending_validation'));

  const handleSelectPlan = (tier: SubscriptionTier) => {
    // Reset payment-proof state when switching plans (avoids cross-contamination)
    setProofUrl(null);
    setTransactionRef('');
    setRefTouched(false);

    // Request submitted but vendor closed page before entering ref → resume at confirmation
    const resumable = myRequests.find(
      r => r.planId === tier.id && r.status === 'pending' && !r.transactionRef
    );
    if (resumable) {
      setSelectedPlan(tier);
      setCurrentRequestId(resumable.id);
      setStep('confirmation');
      return;
    }
    if (hasPendingRequest(tier.id)) {
      toast(t('plans.alreadyPending'), 'error');
      return;
    }
    setSelectedPlan(tier);
    setStep('payment');
  };

  const handleCreateRequest = async () => {
    if (!currentUser || !selectedPlan) return;
    setLoading(true);
    try {
      const requestId = await createSubscriptionRequest({
        userId: currentUser.id,
        sellerName: currentUser.sellerDetails?.shopName || currentUser.name,
        countryId: sellerCountryId,
        planId: selectedPlan.id,
        planLabel: selectedPlan.label,
        amount: getPeriodPrice(selectedPlan.id, period),
        currency: getCurrency(),
        status: 'pending',
        transactionRef: null,
        proofUrl: null,
        maxProducts: getMaxProducts(selectedPlan),
        period,
      });
      setCurrentRequestId(requestId);
      setStep('confirmation');
      toast(t('plans.requestCreated'), 'success');
    } catch {
      toast(t('plans.requestCreateError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    const trimmed = transactionRef.trim();
    if (!currentRequestId || trimmed.length < 4) {
      toast(t('plans.enterRef'), 'error');
      return;
    }
    setLoading(true);
    try {
      await confirmPayment(currentRequestId, trimmed, proofUrl);
      setStep('done');
      toast(t('plans.paymentConfirmed'), 'success');
    } catch {
      toast(t('plans.paymentConfirmError'), 'error');
    } finally {
      setLoading(false);
    }
  };

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
    // Reset so the same file can be re-selected after a remove
    e.target.value = '';
  };

  const whatsappMessage = selectedPlan
    ? encodeURIComponent(t('plans.whatsappSubscribe', {
        plan: selectedPlan.label,
        country: country?.name || sellerCountryId,
        amount: formatPrice(getPrice(selectedPlan.id)),
        name: currentUser?.sellerDetails?.shopName || currentUser?.name,
      }))
    : encodeURIComponent(t('plans.whatsappGeneric'));
  const whatsappHref = `https://wa.me/${whatsappNumber.replace('+', '')}?text=${whatsappMessage}`;

  if (!currentUser) return null;

  const stepTitles: Record<Step, string> = {
    plans: t('plans.choosePlan'),
    payment: t('plans.headerPayment'),
    confirmation: t('plans.confirmPayment'),
    done: t('plans.requestSent'),
  };
  const showBackButton = step !== 'plans' && step !== 'done';
  const handleBack = () => {
    if (step === 'payment') setStep('plans');
    else if (step === 'confirmation') setStep('payment');
  };

  // Validation ref pour étape confirmation
  const refValid = transactionRef.trim().length >= 4;
  const refShowError = refTouched && !refValid && transactionRef.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA] pb-20">
      {/* Header sticky-like (top of page, not fixed) */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 bg-[#F7F8FA]"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
      >
        {showBackButton ? (
          <button
            onClick={handleBack}
            aria-label={t('plans.back')}
            className="w-11 h-11 rounded-xl flex items-center justify-center
                       bg-[#F0F1F4] border-none cursor-pointer flex-shrink-0
                       active:bg-[#EAECF0] transition-colors"
          >
            <ArrowLeft size={18} color="#5C6370" />
          </button>
        ) : (
          <button
            onClick={() => navigate('/dashboard')}
            aria-label={t('plans.backToDashboard')}
            className="w-11 h-11 rounded-xl flex items-center justify-center
                       bg-[#F0F1F4] border-none cursor-pointer flex-shrink-0
                       active:bg-[#EAECF0] transition-colors"
          >
            <ArrowLeft size={18} color="#5C6370" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-black tracking-tight leading-tight text-gray-900">
            {stepTitles[step]}
          </h1>
          {step === 'plans' && (
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              <span>
                {t('plans.currentBadge')} :{' '}
                <strong className="text-emerald-600 font-bold">{currentTierLabel}</strong>
              </span>
              <span className="text-gray-300">·</span>
              <span>{country?.flag} {country?.name}</span>
            </p>
          )}
          {step !== 'plans' && selectedPlan && (
            <p className="text-[11px] text-gray-400 mt-0.5">{selectedPlan.label}</p>
          )}
        </div>

        <StepDots step={step} />
      </div>

      <div className="flex-1">

        {/* ─── STEP 1: Plans grid ─── */}
        {step === 'plans' && (
          <div className="animate-fade-in">
            {/* One-click renewal card — visible only when a paid plan is active and resolvable */}
            {currentPaidTier && (
              <div className="px-4 pt-4">
                <button
                  type="button"
                  onClick={() => handleSelectPlan(currentPaidTier)}
                  disabled={hasPendingRequest(currentPaidTier.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl
                             text-left transition-all duration-150 active:scale-[0.99]
                             disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(90deg,#FFFDF0 0%,#FFF6D6 100%)',
                    border: '1.5px solid rgba(245,200,66,0.45)',
                    boxShadow: '0 4px 18px rgba(245,200,66,0.18)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(245,200,66,0.2)' }}
                    aria-hidden
                  >
                    <Clock size={18} color="#C47E00" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                      {t('plans.renewNowLabel', 'Renouveler en 1 clic')}
                    </p>
                    <p className="text-[14px] font-black text-gray-900 leading-tight">
                      {currentPaidTier.label}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {hasPendingRequest(currentPaidTier.id)
                        ? t('plans.alreadyPending')
                        : t('plans.tapToRenew', 'Touchez pour renouveler 30 jours')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[16px] font-black tracking-tight" style={{ color: '#C47E00' }}>
                      {getPrice(currentPaidTier.id).toLocaleString()}
                    </p>
                    <p className="text-[9px] text-gray-500">{getCurrency()}{t('plans.perMonth')}</p>
                  </div>
                </button>
              </div>
            )}

            {/* Days-remaining banner — visible only when a paid plan is active or just expired */}
            {daysRemaining !== null && (
              <div className="px-4 pt-4">
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
                  style={{
                    background: isExpired
                      ? 'rgba(239,68,68,0.07)'
                      : isExpiringSoon
                      ? 'rgba(249,115,22,0.07)'
                      : 'rgba(16,185,129,0.06)',
                    border: `1px solid ${
                      isExpired
                        ? 'rgba(239,68,68,0.25)'
                        : isExpiringSoon
                        ? 'rgba(249,115,22,0.25)'
                        : 'rgba(16,185,129,0.2)'
                    }`,
                  }}
                >
                  <Clock
                    size={14}
                    color={isExpired ? '#ef4444' : isExpiringSoon ? '#f97316' : '#10b981'}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[12px] font-bold leading-tight"
                      style={{
                        color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#059669',
                      }}
                    >
                      {isExpired
                        ? t('plans.expiredToday', 'Votre abonnement a expiré')
                        : t('plans.daysRemaining', '{{count}} jour(s) restant(s)', { count: daysRemaining })}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {isExpired
                        ? t('plans.renewToReactivate', 'Renouvelez pour réactiver vos produits')
                        : isExpiringSoon
                        ? t('plans.renewBeforeExpiry', 'Renouvelez avant la date d\'expiration')
                        : t('plans.activeUntil', 'Plan actif — {{date}}', {
                            date: new Date(subscriptionExpiresAt!).toLocaleDateString('fr-FR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            }),
                          })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sélecteur de période */}
            <div className="flex items-center gap-1.5 px-4 pt-5 pb-1">
              {(['1m', '3m', '12m'] as SubscriptionPeriod[]).map(p => {
                const discount = periodDiscount(p);
                const isActive = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                    style={{
                      background: isActive ? '#111318' : 'rgba(0,0,0,0.04)',
                      color: isActive ? '#fff' : '#5C6370',
                      border: isActive ? '1px solid #111318' : '1px solid transparent',
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-4 pt-3">
              {paidTiers.map((tier) => {
                const price = getPeriodPrice(tier.id, period);
                const isCurrentPlan = currentTierLabel === tier.label;
                const isPending = hasPendingRequest(tier.id);
                const isResumable = myRequests.some(
                  r => r.planId === tier.id && r.status === 'pending' && !r.transactionRef
                );
                const isPopular = tier.id === 'pro';
                const isDisabled = isCurrentPlan || (isPending && !isResumable);

                return (
                  <div
                    key={tier.id}
                    className="relative flex flex-col gap-2.5 rounded-2xl p-3.5 transition-transform duration-200"
                    style={{
                      background: isPopular ? '#FFFDF0' : '#FFFFFF',
                      border: isPopular
                        ? '1.5px solid rgba(245,200,66,0.45)'
                        : isCurrentPlan
                        ? '1.5px solid rgba(16,185,129,0.4)'
                        : '1px solid rgba(0,0,0,0.07)',
                      boxShadow: isPopular
                        ? '0 6px 28px rgba(245,200,66,0.18), 0 2px 8px rgba(0,0,0,0.06)'
                        : '0 1px 4px rgba(0,0,0,0.05)',
                      transform: isPopular ? 'scale(1.03)' : 'scale(1)',
                    }}
                  >
                    {isPopular && !isCurrentPlan && (
                      <div
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2
                                   px-2.5 py-0.5 rounded-full whitespace-nowrap
                                   text-[9px] font-black tracking-wider uppercase text-[#111318]"
                        style={{
                          background: 'linear-gradient(90deg,#F5C842,#E8A800)',
                          boxShadow: '0 2px 8px rgba(245,200,66,0.4)',
                        }}
                      >
                        {t('plans.popularBadge')}
                      </div>
                    )}
                    {isCurrentPlan && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2
                                      px-2.5 py-0.5 rounded-full whitespace-nowrap
                                      text-[9px] font-black tracking-wider uppercase text-emerald-600
                                      bg-emerald-50 border border-emerald-200">
                        {t('plans.currentBadge')}
                      </div>
                    )}

                    <div>
                      <p
                        className="text-[13px] font-black leading-tight tracking-tight"
                        style={{ color: isPopular ? '#B07410' : '#111318' }}
                      >
                        {tier.label}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {tier.max === null
                          ? t('plans.unlimitedProducts')
                          : t('plans.productRange', { min: tier.min, max: tier.max })}
                      </p>
                    </div>

                    <div className="flex flex-col gap-0.5 -mt-0.5">
                      <div className="flex items-baseline gap-1">
                        <span
                          className="text-lg font-black tracking-tight leading-none"
                          style={{ color: isPopular ? '#C47E00' : '#111318' }}
                        >
                          {price.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">
                          {getCurrency()}{periodSuffix(period)}
                        </span>
                      </div>
                      {period !== '1m' && (
                        <p className="text-[9px] text-gray-400">
                          ≈ {getPrice(tier.id).toLocaleString()} {getCurrency()}{t('plans.perMonth')}
                        </p>
                      )}
                    </div>

                    <ul className="flex flex-col gap-1.5">
                      <li className="flex items-start gap-1.5">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ background: isPopular ? 'rgba(245,200,66,0.15)' : 'rgba(16,185,129,0.1)' }}
                        >
                          <Check size={9} color={isPopular ? '#C47E00' : '#059669'} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] text-gray-500 leading-snug font-medium">
                          {tier.max === null ? t('plans.featureUnlimited') : t('plans.featureUpTo', { max: tier.max })}
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ background: isPopular ? 'rgba(245,200,66,0.15)' : 'rgba(16,185,129,0.1)' }}
                        >
                          <Check size={9} color={isPopular ? '#C47E00' : '#059669'} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] text-gray-500 leading-snug font-medium">
                          {t('plans.featureVerified')}
                        </span>
                      </li>
                      {tier.id === 'pro' && (
                        <li className="flex items-start gap-1.5">
                          <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                               style={{ background: 'rgba(245,200,66,0.15)' }}>
                            <Check size={9} color="#C47E00" strokeWidth={2.5} />
                          </div>
                          <span className="text-[10px] text-gray-500 leading-snug font-medium">
                            {t('plans.featureProBadge')}
                          </span>
                        </li>
                      )}
                      {(tier.id === 'elite' || tier.id === 'unlimited') && (
                        <>
                          <li className="flex items-start gap-1.5">
                            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                                 style={{ background: 'rgba(16,185,129,0.1)' }}>
                              <Check size={9} color="#059669" strokeWidth={2.5} />
                            </div>
                            <span className="text-[10px] text-gray-500 leading-snug font-medium">
                              {t('plans.featureSearchPriority')}
                            </span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                                 style={{ background: 'rgba(16,185,129,0.1)' }}>
                              <Check size={9} color="#059669" strokeWidth={2.5} />
                            </div>
                            <span className="text-[10px] text-gray-500 leading-snug font-medium">
                              {t('plans.featurePrioritySupport')}
                            </span>
                          </li>
                        </>
                      )}
                    </ul>

                    {tier.requiresNif && (
                      <div
                        className="flex items-center gap-1 px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}
                      >
                        <AlertTriangle size={10} color="#ca8a04" />
                        <span className="text-[9px] text-amber-600 font-semibold">
                          {t('plans.nifRequired')}
                        </span>
                      </div>
                    )}

                    {isResumable ? (
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(tier)}
                        className="w-full py-2.5 rounded-xl text-[11px] font-black
                                   transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5"
                        style={{
                          background: 'rgba(249,115,22,0.1)',
                          border: '1px solid rgba(249,115,22,0.3)',
                          color: '#ea580c',
                        }}
                      >
                        <Clock size={11} />
                        {t('plans.resumeShort', 'Reprendre')}
                      </button>
                    ) : isPending ? (
                      <div
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold"
                        style={{
                          background: 'rgba(59,130,246,0.08)',
                          border: '1px solid rgba(59,130,246,0.2)',
                          color: '#3b82f6',
                        }}
                      >
                        <Clock size={11} />
                        {t('plans.pendingShort')}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && handleSelectPlan(tier)}
                        className="w-full py-2.5 rounded-xl text-[11px] font-black
                                   transition-all duration-150 active:scale-95 disabled:cursor-default"
                        style={{
                          background: isDisabled ? '#F0F1F4' : isPopular ? '#F5C842' : '#F0F1F4',
                          color: isDisabled ? '#BCC1CA' : isPopular ? '#111318' : '#5C6370',
                          boxShadow: isPopular && !isDisabled ? '0 2px 8px rgba(245,200,66,0.3)' : 'none',
                        }}
                      >
                        {isCurrentPlan ? t('plans.currentPlan') : t('plans.chooseShort')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Demandes en attente (sous la grille) */}
            {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').length > 0 && (
              <div className="px-4 mt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  {t('plans.pendingRequestsTitle')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').map(req => {
                    const isPaymentPending = req.status === 'pending';
                    const canResume = isPaymentPending && !req.transactionRef;
                    const reqTier = canResume ? tiers.find(tt => tt.id === req.planId) : undefined;
                    const handleResume = () => {
                      if (!reqTier) return;
                      setSelectedPlan(reqTier);
                      setCurrentRequestId(req.id);
                      setStep('confirmation');
                    };
                    const Wrapper = (canResume && reqTier ? 'button' : 'div') as React.ElementType;
                    return (
                      <Wrapper
                        key={req.id}
                        type={canResume && reqTier ? 'button' : undefined}
                        onClick={canResume && reqTier ? handleResume : undefined}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl ${
                          canResume && reqTier ? 'hover:brightness-95 active:scale-[0.99] transition-all' : ''
                        }`}
                        style={{
                          background: isPaymentPending ? 'rgba(249,115,22,0.07)' : 'rgba(59,130,246,0.07)',
                          border: `1px solid ${isPaymentPending ? 'rgba(249,115,22,0.2)' : 'rgba(59,130,246,0.2)'}`,
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: isPaymentPending ? '#f97316' : '#3b82f6',
                            boxShadow: `0 0 6px ${isPaymentPending ? 'rgba(249,115,22,0.5)' : 'rgba(59,130,246,0.5)'}`,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800">{req.planLabel}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {canResume
                              ? t('plans.tapToEnterRef', 'Touchez pour saisir votre référence')
                              : isPaymentPending ? t('plans.paymentPending') : t('plans.paymentVerification')}
                          </p>
                        </div>
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            color: isPaymentPending ? '#f97316' : '#3b82f6',
                            background: isPaymentPending ? 'rgba(249,115,22,0.1)' : 'rgba(59,130,246,0.1)',
                          }}
                        >
                          {isPaymentPending ? t('plans.pendingBadgePayment') : t('plans.pendingBadgeVerif')}
                        </span>
                      </Wrapper>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dernier reçu approuvé */}
            {(() => {
              const lastApproved = myRequests.find(r => r.status === 'approved' && r.receiptUrl);
              if (!lastApproved?.receiptUrl) return null;
              return (
                <div className="px-4 mt-4">
                  <a
                    href={lastApproved.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white border border-black/[0.07] shadow-sm hover:brightness-95 active:scale-[0.99] transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800">{t('plans.receiptReady', 'Reçu disponible')}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{lastApproved.planLabel}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="8 17 12 21 16 17"/>
                      <line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                  </a>
                </div>
              );
            })()}

            {/* WhatsApp help card */}
            <div className="px-4 mt-4">
              <div className="p-3.5 rounded-2xl bg-white border border-black/[0.07] shadow-sm">
                <p className="text-xs font-bold text-gray-800 mb-1">{t('plans.needHelp')}</p>
                <p className="text-[11px] text-gray-400 mb-2.5 leading-snug">
                  {t('plans.responseTime')}
                </p>
                <WhatsAppButton href={whatsappHref} label={t('plans.contactWhatsapp')} />
              </div>
            </div>
            <div className="h-5" />
          </div>
        )}

        {/* ─── STEP 2: Payment instructions ─── */}
        {step === 'payment' && selectedPlan && (
          <div className="flex flex-col gap-3 p-4 animate-fade-in">
            {/* Selected plan summary */}
            <div
              className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{ background: 'rgba(245,200,66,0.07)', border: '1.5px solid rgba(245,200,66,0.3)' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl"
                style={{ background: 'rgba(245,200,66,0.15)' }}
                aria-hidden
              >
                📦
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  {t('plans.selectedPlanLabel')}
                </p>
                <p className="text-[15px] font-black text-gray-900 tracking-tight leading-tight">
                  {selectedPlan.label}
                </p>
                <p className="text-[11px] text-gray-400">
                  {selectedPlan.max === null
                    ? t('plans.unlimitedProducts')
                    : t('plans.productRange', { min: selectedPlan.min, max: selectedPlan.max })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-black tracking-tight leading-none" style={{ color: '#C47E00' }}>
                  {getPrice(selectedPlan.id).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400">{getCurrency()}{t('plans.perMonth')}</p>
              </div>
            </div>

            {/* Payment methods */}
            <div className="rounded-2xl overflow-hidden bg-white border border-black/[0.07] shadow-sm">
              <div className="px-3.5 py-3 border-b border-black/[0.05]">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                  {t('plans.paymentMethods', { flag: country?.flag, country: country?.name })}
                </p>
              </div>
              {paymentMethods.map((m: PaymentMethod, i: number) => {
                const color = getMethodColor(m.name);
                return (
                  <React.Fragment key={`${m.name}-${i}`}>
                    {i > 0 && <div className="h-px ml-14" style={{ background: 'rgba(0,0,0,0.05)' }} />}
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <div
                        className="w-[34px] h-[34px] rounded-[9px] flex-shrink-0 flex items-center justify-center"
                        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                        aria-hidden
                      >
                        <Phone size={14} color={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-800">{m.name}</p>
                        <p className="text-xs font-bold font-mono tracking-wider mt-0.5 break-all" style={{ color }}>
                          {m.number}
                        </p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Instructions */}
            <div
              className="p-3.5 rounded-2xl"
              style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}
            >
              <div className="flex items-center gap-1.5 mb-2.5">
                <Info size={12} color="#3b82f6" />
                <p className="text-[11px] font-bold text-blue-500">{t('plans.instructions')}</p>
              </div>
              {[
                t('plans.instructionDial'),
                t('plans.instructionTransfer', { amount: formatPrice(getPrice(selectedPlan.id)) }),
                t('plans.instructionKeepReceipt'),
                t('plans.instructionClickCreate'),
              ].map((s, i, arr) => (
                <div key={i} className={`flex items-start gap-2.5 ${i < arr.length - 1 ? 'mb-2' : ''}`}>
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white"
                    style={{ background: '#3b82f6' }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-[11px] text-blue-500 leading-snug font-medium pt-0.5">{s}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCreateRequest}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-black text-[#111318] active:scale-[0.98]
                         transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#F5C842', boxShadow: '0 3px 12px rgba(245,200,66,0.35)' }}
            >
              {loading ? t('plans.creating') : t('plans.createRequestShort')}
            </button>
            <WhatsAppButton href={whatsappHref} label={t('plans.needHelpWhatsapp')} />
          </div>
        )}

        {/* ─── STEP 3: Confirm transaction ref ─── */}
        {step === 'confirmation' && selectedPlan && (
          <div className="flex flex-col gap-3 p-4 animate-fade-in">
            <div
              className="flex items-center gap-2.5 p-3 rounded-xl"
              style={{ background: 'rgba(245,200,66,0.06)', border: '1px solid rgba(245,200,66,0.2)' }}
            >
              <span className="text-xl flex-shrink-0" aria-hidden>🧾</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800">
                  {selectedPlan.label} · {formatPrice(getPrice(selectedPlan.id))}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t('plans.confirmHint')}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-black/[0.07] shadow-sm">
              <label htmlFor="tx-ref" className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {t('plans.transactionRefTitle')}
              </label>
              <input
                id="tx-ref"
                type="text"
                value={transactionRef}
                onChange={(e) => { setTransactionRef(e.target.value); setRefTouched(true); }}
                onFocus={() => setRefFocused(true)}
                onBlur={() => setRefFocused(false)}
                placeholder={t('plans.transactionRefPlaceholder')}
                className="w-full px-3.5 py-3 rounded-xl text-sm font-semibold font-mono
                           tracking-wider outline-none transition-all duration-200
                           text-gray-900 placeholder-gray-300"
                style={{
                  background: '#FFFFFF',
                  border: `1.5px solid ${refFocused ? '#F5C842' : refShowError ? '#ef4444' : 'rgba(0,0,0,0.12)'}`,
                  boxShadow: refFocused ? '0 0 0 3px rgba(245,200,66,0.12)' : 'none',
                }}
              />
              {refShowError && (
                <div className="flex items-center gap-1 mt-1.5">
                  <AlertTriangle size={11} color="#ef4444" />
                  <p className="text-[11px] text-red-500">{t('plans.refTooShort')}</p>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                {t('plans.transactionRefHint')}
              </p>
            </div>

            {/* Optional payment proof — accelerates admin validation */}
            <div className="bg-white rounded-2xl p-4 border border-black/[0.07] shadow-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {t('plans.proofTitle', 'Preuve de paiement (facultatif)')}
              </p>

              {proofUrl ? (
                <div className="relative">
                  <img
                    src={proofUrl}
                    alt={t('plans.proofAlt', 'Preuve de paiement')}
                    className="w-full max-h-48 object-contain rounded-xl bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={() => setProofUrl(null)}
                    aria-label={t('plans.proofRemove', 'Retirer')}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:bg-black/80"
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ) : proofUploading ? (
                <div className="flex items-center justify-center gap-2 py-3.5 text-xs text-blue-500 font-bold">
                  <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                  {t('plans.proofUploading', 'Envoi en cours…')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label
                    htmlFor="proof-camera"
                    className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl text-xs font-bold cursor-pointer bg-blue-50 text-blue-600 border border-blue-200 active:bg-blue-100 transition-colors select-none"
                  >
                    <Camera size={18} />
                    <span>{t('plans.proofCamera', 'Prendre une photo')}</span>
                  </label>
                  <label
                    htmlFor="proof-gallery"
                    className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl text-xs font-bold cursor-pointer bg-gray-50 text-gray-600 border border-gray-200 active:bg-gray-100 transition-colors select-none"
                  >
                    <ImageIcon size={18} />
                    <span>{t('plans.proofGallery', 'Depuis la galerie')}</span>
                  </label>
                </div>
              )}
              {/* Camera: ouvre directement l'appareil photo */}
              <input
                id="proof-camera"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleProofChange}
                disabled={proofUploading}
                className="hidden"
              />
              {/* Gallery: ouvre le sélecteur de fichiers / photos existantes */}
              <input
                id="proof-gallery"
                type="file"
                accept="image/*"
                onChange={handleProofChange}
                disabled={proofUploading}
                className="hidden"
              />
              <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                {t('plans.proofHint', 'Prenez une photo du SMS ou choisissez une capture déjà dans votre galerie. Cela accélère la validation.')}
              </p>
            </div>

            <button
              type="button"
              disabled={!refValid || loading}
              onClick={handleConfirmPayment}
              className="w-full py-3.5 rounded-xl text-sm font-black transition-all duration-150
                         active:scale-[0.98] disabled:cursor-not-allowed"
              style={{
                background: refValid && !loading ? '#F5C842' : '#D0D3DA',
                color: refValid && !loading ? '#111318' : '#9EA5B0',
                boxShadow: refValid && !loading ? '0 3px 12px rgba(245,200,66,0.35)' : 'none',
              }}
            >
              {loading ? t('plans.sending') : t('plans.confirmPaymentBtn')}
            </button>
            <button
              type="button"
              onClick={() => setStep('payment')}
              className="text-xs text-gray-400 underline underline-offset-2 py-1.5 bg-transparent border-none cursor-pointer"
            >
              {t('plans.notPaidYet')} {t('plans.viewPaymentInstructions')}
            </button>
          </div>
        )}

        {/* ─── STEP 4: Done ─── */}
        {step === 'done' && selectedPlan && (
          <div className="flex flex-col gap-3.5 p-4 animate-fade-in">
            <div
              className="flex flex-col items-center text-center gap-3.5 px-5 py-8 rounded-2xl"
              style={{
                background: 'rgba(16,185,129,0.06)',
                border: '1.5px solid rgba(16,185,129,0.25)',
                boxShadow: '0 4px 24px rgba(16,185,129,0.08)',
              }}
            >
              <div className="animate-check-pop">
                <CheckCircle2 size={56} color="#10b981" strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-tight mb-1.5">
                  {t('plans.successTitle')}
                </h2>
                <p className="text-[13px] text-gray-500 leading-relaxed max-w-[260px] mx-auto">
                  {t('plans.successMessage', { plan: selectedPlan.label })}
                </p>
              </div>

              {transactionRef && (
                <div
                  className="flex flex-col gap-0.5 w-full px-4 py-2.5 rounded-xl"
                  style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)' }}
                >
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                    {t('plans.refLabel')}
                  </p>
                  <p className="text-[13px] font-black font-mono tracking-wider break-all" style={{ color: '#C47E00' }}>
                    {transactionRef}
                  </p>
                </div>
              )}

              <div
                className="flex items-start gap-2 w-full px-3 py-2.5 rounded-xl text-left"
                style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}
              >
                <Info size={13} color="#3b82f6" className="flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-500 leading-snug font-medium">
                  {t('plans.notificationHint')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl
                           text-sm font-semibold text-gray-500 bg-white border border-black/[0.07]
                           active:bg-gray-50 transition-colors"
              >
                <LayoutDashboard size={15} />
                {t('plans.dashboardShort')}
              </button>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl
                           text-sm font-bold text-green-700 no-underline transition-colors"
                style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)' }}
              >
                <WhatsAppIcon />
                {t('plans.whatsappShort')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlansPage;
