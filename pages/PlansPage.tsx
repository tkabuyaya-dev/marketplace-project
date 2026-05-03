import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import {
  INITIAL_SUBSCRIPTION_TIERS, PAYMENT_METHODS, SUPPORT_WHATSAPP,
  DEFAULT_SUBSCRIPTION_PRICING, INITIAL_COUNTRIES,
} from '../constants';
import { TC } from '../constants';
import {
  SubscriptionRequest, SubscriptionTier, SubscriptionPricing, PaymentMethod,
} from '../types';
import {
  createSubscriptionRequest, confirmPayment,
  subscribeToSubscriptionPricing, subscribeToSubscriptionTiers,
  subscribeToMyRequests,
} from '../services/firebase';

type Step = 'plans' | 'payment' | 'confirmation' | 'done';

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
  const [loading, setLoading] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<SubscriptionRequest[]>([]);

  const sellerCountryId = currentUser?.sellerDetails?.countryId || 'bi';
  const country = INITIAL_COUNTRIES.find(c => c.id === sellerCountryId);
  const paymentMethods = PAYMENT_METHODS[sellerCountryId] || PAYMENT_METHODS['bi'];
  const whatsappNumber = SUPPORT_WHATSAPP[sellerCountryId] || SUPPORT_WHATSAPP['bi'];
  const currentTierLabel = currentUser?.sellerDetails?.tierLabel || 'Gratuit';

  // Paid tiers only (exclude free)
  const paidTiers = useMemo(() => tiers.filter(t => t.id !== 'free'), [tiers]);

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser || currentUser.role === 'buyer') {
      navigate('/');
      return;
    }

    // Real-time listeners — always get fresh data, bypass persistentLocalCache
    const unsubTiers = subscribeToSubscriptionTiers(setTiers);
    const unsubPricing = subscribeToSubscriptionPricing(sellerCountryId, setPricing);
    const unsubRequests = subscribeToMyRequests(currentUser.id, setMyRequests);

    return () => {
      unsubTiers();
      unsubPricing();
      unsubRequests();
    };
  }, [authReady, currentUser, sellerCountryId]);

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

  const formatPrice = (amount: number) => {
    return amount.toLocaleString() + ' ' + getCurrency();
  };

  const getMaxProducts = (tier: SubscriptionTier): number => {
    if (tier.max === null) return 99999;
    return tier.max;
  };

  // Check if user has a pending request for this plan
  const hasPendingRequest = (planId: string) =>
    myRequests.some(r => r.planId === planId && (r.status === 'pending' || r.status === 'pending_validation'));

  const handleSelectPlan = (tier: SubscriptionTier) => {
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
        amount: getPrice(selectedPlan.id),
        currency: getCurrency(),
        status: 'pending',
        transactionRef: null,
        proofUrl: null,
        maxProducts: getMaxProducts(selectedPlan),
      });
      setCurrentRequestId(requestId);
      setStep('confirmation');
      toast(t('plans.requestCreated'), 'success');
    } catch (err) {
      toast(t('plans.requestCreateError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!currentRequestId || !transactionRef.trim()) {
      toast(t('plans.enterRef'), 'error');
      return;
    }
    setLoading(true);
    try {
      await confirmPayment(currentRequestId, transactionRef.trim());
      setStep('done');
      toast(t('plans.paymentConfirmed'), 'success');
    } catch (err) {
      toast(t('plans.paymentConfirmError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const whatsappMessage = selectedPlan
    ? encodeURIComponent(t('plans.whatsappSubscribe', { plan: selectedPlan.label, country: country?.name || sellerCountryId, amount: formatPrice(getPrice(selectedPlan.id)), name: currentUser?.sellerDetails?.shopName || currentUser?.name }))
    : encodeURIComponent(t('plans.whatsappGeneric'));

  if (!currentUser) return null;

  // ─── RENDER ───

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-gray-900 dark:bg-gray-950 dark:text-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-gold-50 via-white to-gold-50 dark:from-gray-900 dark:via-gold-950 dark:to-gray-900 border-b border-gold-300 dark:border-gold-400/20">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button onClick={() => step === 'plans' ? navigate('/dashboard') : setStep('plans')} className="text-gold-700 dark:text-gold-400 text-sm mb-4 hover:underline">
            &larr; {step === 'plans' ? t('plans.backToDashboard') : t('plans.backToPlans')}
          </button>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">
            {step === 'plans' && t('plans.choosePlan')}
            {step === 'payment' && t('plans.paymentTitle', { plan: selectedPlan?.label })}
            {step === 'confirmation' && t('plans.confirmPayment')}
            {step === 'done' && t('plans.requestSent')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {step === 'plans' && t('plans.currentPlanInfo', { plan: currentTierLabel, flag: country?.flag, country: country?.name })}
            {step === 'payment' && t('plans.amountInfo', { amount: selectedPlan ? formatPrice(getPrice(selectedPlan.id)) : '' })}
            {step === 'confirmation' && t('plans.confirmHint')}
            {step === 'done' && t('plans.requestProcessed')}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ─── STEP 1: Plan Selection ─── */}
        {step === 'plans' && (
          <div className="space-y-6">
            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {paidTiers.map((tier) => {
                const price = getPrice(tier.id);
                const isCurrentPlan = currentTierLabel === tier.label;
                const isPending = hasPendingRequest(tier.id);
                const isPopular = tier.id === 'pro';

                return (
                  <div
                    key={tier.id}
                    className={`relative bg-white dark:bg-gray-900 border rounded-2xl p-6 flex flex-col transition-all hover:scale-[1.02] shadow-sm dark:shadow-none ${
                      isPopular ? 'border-gold-400 shadow-lg shadow-gold-400/30 dark:shadow-gold-400/20' : 'border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${isCurrentPlan ? 'ring-2 ring-green-500/50' : ''}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold-400 text-gray-900 text-xs font-black px-3 py-1 rounded-full">
                        {t('plans.popularBadge')}
                      </div>
                    )}

                    {isCurrentPlan && (
                      <div className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {t('plans.currentBadge')}
                      </div>
                    )}

                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{tier.label}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mb-4">
                      {tier.max === null ? t('plans.unlimitedProducts') : t('plans.productRange', { min: tier.min, max: tier.max })}
                    </p>

                    <div className="mb-4">
                      <span className="text-3xl font-black text-gold-700 dark:text-gold-400">{price.toLocaleString()}</span>
                      <span className="text-gray-600 dark:text-gray-400 text-sm ml-1">{getCurrency()}{t('plans.perMonth')}</span>
                    </div>

                    <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-700 dark:text-gray-300">
                      <li className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400">&#10003;</span>
                        {tier.max === null ? t('plans.featureUnlimited') : t('plans.featureUpTo', { max: tier.max })}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400">&#10003;</span>
                        {t('plans.featureVerified')}
                      </li>
                      {tier.id === 'pro' && (
                        <li className="flex items-center gap-2">
                          <span className="text-green-600 dark:text-green-400">&#10003;</span>
                          {t('plans.featureProBadge')}
                        </li>
                      )}
                      {(tier.id === 'elite' || tier.id === 'unlimited') && (
                        <>
                          <li className="flex items-center gap-2">
                            <span className="text-green-600 dark:text-green-400">&#10003;</span>
                            {t('plans.featureSearchPriority')}
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-600 dark:text-green-400">&#10003;</span>
                            {t('plans.featurePrioritySupport')}
                          </li>
                        </>
                      )}
                      {tier.requiresNif && (
                        <li className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-xs">
                          {t('plans.nifRequired')}
                        </li>
                      )}
                    </ul>

                    {isPending ? (
                      <button disabled className="w-full py-2.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-600/20 dark:text-yellow-400 text-sm font-bold rounded-xl border border-yellow-300 dark:border-yellow-600/30">
                        {t('plans.pendingRequest')}
                      </button>
                    ) : isCurrentPlan ? (
                      <button disabled className="w-full py-2.5 bg-green-100 text-green-700 dark:bg-green-600/20 dark:text-green-400 text-sm font-bold rounded-xl border border-green-300 dark:border-green-600/30">
                        {t('plans.currentPlan')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectPlan(tier)}
                        className={`w-full py-2.5 text-sm font-bold rounded-xl transition-all ${
                          isPopular
                            ? 'bg-gold-400 text-gray-900 hover:bg-gold-300'
                            : 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:border-white/20 dark:hover:bg-white/20'
                        }`}
                      >
                        {t('plans.choosePlanBtn')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pending Requests */}
            {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-500/30 rounded-xl p-4">
                <h3 className="text-sm font-bold text-yellow-700 dark:text-yellow-400 mb-3">{t('plans.pendingRequestsTitle')}</h3>
                <div className="space-y-2">
                  {myRequests.filter(r => r.status !== 'approved' && r.status !== 'rejected').map(req => (
                    <div key={req.id} className="flex items-center justify-between bg-white dark:bg-black/20 border border-yellow-200 dark:border-transparent rounded-lg px-4 py-2 text-sm">
                      <div>
                        <span className="text-gray-900 dark:text-white font-bold">{req.planLabel}</span>
                        <span className="text-gray-600 dark:text-gray-400 ml-2">{req.amount.toLocaleString()} {req.currency}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        req.status === 'pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                      }`}>
                        {req.status === 'pending' ? t('plans.paymentPending') : t('plans.paymentVerification')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp Fallback */}
            <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-700/50 rounded-xl p-4 text-center shadow-sm dark:shadow-none">
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">{t('plans.needHelp')}</p>
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-500 transition-colors"
              >
                {t('plans.contactWhatsapp')}
              </a>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Payment Instructions ─── */}
        {step === 'payment' && selectedPlan && (
          <div className="max-w-lg mx-auto space-y-6">
            {/* Selected Plan Summary */}
            <div className="bg-white border border-gold-400 dark:bg-gray-900 dark:border-gold-400/30 rounded-xl p-5 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedPlan.label}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {selectedPlan.max === null ? t('plans.featureUnlimited') : t('plans.planSummary', { max: selectedPlan.max })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gold-700 dark:text-gold-400">{formatPrice(getPrice(selectedPlan.id))}</p>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-700/50 rounded-xl p-5 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
                {t('plans.paymentMethods', { flag: country?.flag, country: country?.name })}
              </h3>
              <div className="space-y-3">
                {paymentMethods.map((method, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-black/30 rounded-lg px-4 py-3">
                    <span className="text-xl">{method.icon}</span>
                    <div className="flex-1">
                      <p className="text-gray-900 dark:text-white font-bold text-sm">{method.name}</p>
                      <p className="text-gold-700 dark:text-gold-400 text-xs font-mono">{method.number}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-500/20 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300">
                <p className="font-bold mb-1">{t('plans.instructions')}</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>
                    <Trans
                      i18nKey="plans.instruction1"
                      values={{ amount: formatPrice(getPrice(selectedPlan.id)) }}
                      components={{ strong: <strong /> }}
                    />
                  </li>
                  <li>{t('plans.instruction2')}</li>
                  <li>{t('plans.instruction3')}</li>
                </ol>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCreateRequest}
                disabled={loading}
                className="flex-1 py-3 bg-gold-400 text-gray-900 font-bold rounded-xl hover:bg-gold-300 transition-colors disabled:opacity-50"
              >
                {loading ? t('plans.creating') : t('plans.createRequest')}
              </button>
            </div>

            <div className="text-center">
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 dark:text-green-400 text-sm hover:underline"
              >
                {t('plans.needHelpWhatsapp')}
              </a>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Confirm Transaction Ref ─── */}
        {step === 'confirmation' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-700/50 rounded-xl p-5 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t('plans.transactionRefTitle')}</h3>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder={t('plans.transactionRefPlaceholder')}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 dark:bg-black/50 dark:border-gray-600 dark:text-white dark:placeholder-gray-500 rounded-xl focus:border-gold-400 focus:outline-none"
              />
              <p className="text-gray-500 dark:text-gray-500 text-xs mt-2">
                {t('plans.transactionRefHint')}
              </p>
            </div>

            <button
              onClick={handleConfirmPayment}
              disabled={loading || !transactionRef.trim()}
              className="w-full py-3 bg-gold-400 text-gray-900 font-bold rounded-xl hover:bg-gold-300 transition-colors disabled:opacity-50"
            >
              {loading ? t('plans.sending') : t('plans.confirmPaymentBtn')}
            </button>

            <p className="text-center text-gray-600 dark:text-gray-500 text-xs">
              {t('plans.notPaidYet')}{' '}
              <button onClick={() => setStep('payment')} className="text-gold-700 dark:text-gold-400 hover:underline">
                {t('plans.viewPaymentInstructions')}
              </button>
            </p>
          </div>
        )}

        {/* ─── STEP 4: Done ─── */}
        {step === 'done' && (
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="bg-green-50 border border-green-300 dark:bg-green-900/20 dark:border-green-500/30 rounded-2xl p-8">
              <div className="text-5xl mb-4">&#9989;</div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t('plans.successTitle')}</h2>
              <p className="text-gray-700 dark:text-gray-400">
                {t('plans.successMessage', { plan: selectedPlan?.label })}
              </p>
              <p className="text-gray-600 dark:text-gray-500 text-sm mt-3">
                {t('plans.notificationHint')}
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-2.5 bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:border-white/20 dark:hover:bg-white/20 font-bold rounded-xl"
              >
                {t('plans.backToDashboardBtn')}
              </button>
              <a
                href={`https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(`${t('plans.whatsappGeneric')} ${selectedPlan?.label} - Ref: ${transactionRef}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500"
              >
                {t('plans.contactViaWhatsapp')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlansPage;
