import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import {
  INITIAL_COUNTRIES,
  INITIAL_SUBSCRIPTION_TIERS,
  DEFAULT_SUBSCRIPTION_PRICING,
  FOUNDERS_SPOTS_REMAINING,
  FOUNDERS_SPOTS_TOTAL,
} from '../constants';
import {
  subscribeToSubscriptionPricing,
  subscribeToSubscriptionTiers,
} from '../services/firebase';
import type { SubscriptionPricing, SubscriptionTier } from '../types';

const POPULAR_TIER_ID = 'pro';

const BecomeSellerLanding: React.FC = () => {
  const { t } = useTranslation();
  const { activeCountry, currentUser } = useAppContext();
  const navigate = useNavigate();
  const pricingRef = useRef<HTMLDivElement>(null);

  const previewCountryId = activeCountry || 'bi';
  const previewCountry =
    INITIAL_COUNTRIES.find(c => c.id === previewCountryId) || INITIAL_COUNTRIES[0];

  const [tiers, setTiers] = useState<SubscriptionTier[]>(INITIAL_SUBSCRIPTION_TIERS);
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);

  useEffect(() => {
    const unsubTiers = subscribeToSubscriptionTiers(setTiers);
    const unsubPricing = subscribeToSubscriptionPricing(previewCountryId, setPricing);
    return () => {
      unsubTiers();
      unsubPricing();
    };
  }, [previewCountryId]);

  const goRegister = () => {
    if (currentUser) {
      navigate(currentUser.role === 'buyer' ? '/register-seller' : '/dashboard');
    } else {
      navigate('/login', { state: { redirectTo: '/register-seller' } });
    }
  };

  const scrollToPricing = () => {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getPrice = (tierId: string): number => {
    if (pricing?.prices?.[tierId] !== undefined) return pricing.prices[tierId];
    const defaults =
      DEFAULT_SUBSCRIPTION_PRICING[previewCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.prices[tierId] || 0;
  };

  const currency = pricing?.currency
    || DEFAULT_SUBSCRIPTION_PRICING[previewCountryId]?.currency
    || DEFAULT_SUBSCRIPTION_PRICING['bi'].currency;

  const formatPrice = (amount: number) =>
    amount > 0 ? `${amount.toLocaleString()} ${currency}` : t('becomeSellerLanding.pricingFreeBadge');

  const orderedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.min - b.min),
    [tiers],
  );

  const foundersPct = Math.round((FOUNDERS_SPOTS_REMAINING / FOUNDERS_SPOTS_TOTAL) * 100);

  return (
    <div className="min-h-screen bg-[#FDFBF4] dark:bg-gray-950 text-gray-900 dark:text-gray-100 pb-32 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#FDFBF4]/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-200/70 dark:border-gray-800/60">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-sm shadow-gold-400/30 group-hover:scale-105 transition-transform">
              <span className="text-base font-black text-gray-900">N</span>
            </div>
            <span className="font-black text-lg tracking-tight">NUNULIA</span>
          </Link>
          <button
            onClick={goRegister}
            className="hidden md:inline-flex items-center px-4 h-9 rounded-full bg-gold-500 hover:bg-gold-600 text-gray-900 text-sm font-bold transition-colors"
          >
            {t('becomeSellerLanding.navCTA')}
          </button>
          <Link
            to="/"
            className="md:hidden text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← {t('becomeSellerLanding.back')}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-gold-400/15 blur-[120px]" />
          <div className="absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full bg-amber-300/10 blur-[120px]" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 pt-12 pb-14 md:pt-20 md:pb-24 text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-gold-100 dark:bg-gold-400/10 border border-gold-200 dark:border-gold-400/30 text-gold-700 dark:text-gold-300 text-xs font-bold tracking-wide uppercase mb-5">
            {t('becomeSellerLanding.heroEyebrow')}
          </span>
          <h1 className="text-[34px] leading-[1.05] md:text-6xl font-black tracking-tight mb-5">
            {t('becomeSellerLanding.heroTitle')}
          </h1>
          <p className="max-w-2xl mx-auto text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-7">
            {t('becomeSellerLanding.heroSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <button
              onClick={goRegister}
              className="h-12 px-6 rounded-2xl bg-gold-500 hover:bg-gold-600 text-gray-900 font-extrabold text-base shadow-[0_8px_24px_rgba(245,200,66,0.35)] active:scale-[0.98] transition-all"
            >
              {t('becomeSellerLanding.heroCTAPrimary')}
            </button>
            <button
              onClick={scrollToPricing}
              className="h-12 px-6 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gold-400 dark:hover:border-gold-400 text-gray-900 dark:text-gray-100 font-bold text-base transition-colors"
            >
              {t('becomeSellerLanding.heroCTASecondary')}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-7 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              {t('becomeSellerLanding.heroBadgeFree')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              {t('becomeSellerLanding.heroBadgeNoFee')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              {t('becomeSellerLanding.heroBadgeWhatsApp')}
            </span>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="bg-white dark:bg-gray-900/40 border-y border-gray-200 dark:border-gray-800/60">
        <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-3">
              {t('becomeSellerLanding.stepsTitle')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('becomeSellerLanding.stepsSubtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: '📝', title: 'step1Title', desc: 'step1Desc' },
              { n: 2, icon: '📸', title: 'step2Title', desc: 'step2Desc' },
              { n: 3, icon: '💬', title: 'step3Title', desc: 'step3Desc' },
            ].map((step) => (
              <div
                key={step.n}
                className="relative bg-[#FDFBF4] dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-2xl p-6 shadow-sm dark:shadow-none"
              >
                <div className="absolute -top-3 -left-3 w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-gray-900 font-black text-sm shadow-md">
                  {step.n}
                </div>
                <div className="text-3xl mb-3" aria-hidden="true">{step.icon}</div>
                <h3 className="text-lg font-bold mb-2">
                  {t(`becomeSellerLanding.${step.title}`)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t(`becomeSellerLanding.${step.desc}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founders Offer */}
      <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
        <div className="relative overflow-hidden bg-gradient-to-br from-gold-50 via-amber-50 to-white dark:from-gold-400/10 dark:via-amber-500/5 dark:to-gray-900/40 border border-gold-200 dark:border-gold-400/30 rounded-3xl p-6 md:p-10 shadow-sm dark:shadow-none">
          <div className="absolute -top-16 -right-16 w-60 h-60 rounded-full bg-gold-300/30 dark:bg-gold-400/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <span className="inline-block px-3 py-1 rounded-full bg-gold-500 text-gray-900 text-xs font-black tracking-wider mb-4">
              {t('becomeSellerLanding.foundersBadge')}
            </span>
            <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-3">
              {t('becomeSellerLanding.foundersTitle')}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 text-base md:text-lg max-w-2xl mb-6 leading-relaxed">
              {t('becomeSellerLanding.foundersDesc')}
            </p>

            <div className="max-w-md mb-6">
              <div className="flex items-center justify-between text-xs font-bold text-gold-800 dark:text-gold-300 mb-2">
                <span>
                  {t('becomeSellerLanding.foundersCounter', {
                    remaining: FOUNDERS_SPOTS_REMAINING,
                    total: FOUNDERS_SPOTS_TOTAL,
                  })}
                </span>
                <span>{foundersPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-gold-200/60 dark:bg-gold-400/15 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold-500 to-amber-500 rounded-full transition-all"
                  style={{ width: `${foundersPct}%` }}
                />
              </div>
            </div>

            <button
              onClick={goRegister}
              className="inline-flex items-center justify-center h-12 px-7 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-extrabold text-base hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] transition-all"
            >
              {t('becomeSellerLanding.foundersCTA')} →
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        ref={pricingRef}
        id="tarifs"
        className="bg-white dark:bg-gray-900/40 border-y border-gray-200 dark:border-gray-800/60"
      >
        <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-3">
              {t('becomeSellerLanding.pricingTitle')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-1">
              {t('becomeSellerLanding.pricingSubtitle')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {t('becomeSellerLanding.pricingCountryHint')}
              <span className="font-bold text-gray-700 dark:text-gray-300">
                {previewCountry.flag} {previewCountry.name}
              </span>
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedTiers.map((tier) => {
              const price = getPrice(tier.id);
              const isFree = tier.id === 'free';
              const isPopular = tier.id === POPULAR_TIER_ID;
              const isUnlimited = tier.max === null;

              return (
                <div
                  key={tier.id}
                  className={`relative flex flex-col bg-[#FDFBF4] dark:bg-gray-800/50 rounded-2xl p-6 border shadow-sm dark:shadow-none transition-colors ${
                    isPopular
                      ? 'border-gold-400 dark:border-gold-400/60 ring-1 ring-gold-400/40'
                      : 'border-gray-200 dark:border-gray-700/50'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gold-500 text-gray-900 text-[10px] font-black tracking-wider">
                      {t('becomeSellerLanding.pricingPopular')}
                    </span>
                  )}
                  <h3 className="text-lg font-bold mb-1">{tier.label}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                    {isUnlimited
                      ? t('becomeSellerLanding.pricingProductsUnlimited')
                      : t('becomeSellerLanding.pricingProductsRange', {
                          min: tier.min,
                          max: tier.max,
                        })}
                  </p>

                  <div className="mb-5">
                    {isFree ? (
                      <span className="text-3xl font-black text-gold-600 dark:text-gold-400">
                        {t('becomeSellerLanding.pricingFreeBadge')}
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-black text-gold-600 dark:text-gold-400">
                          {formatPrice(price)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-500 ml-1">
                          {t('becomeSellerLanding.pricingPerMonth')}
                        </span>
                      </>
                    )}
                  </div>

                  {tier.requiresNif && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-4">
                      ⚠ {t('becomeSellerLanding.pricingNifRequired')}
                    </p>
                  )}

                  <button
                    onClick={goRegister}
                    className={`mt-auto h-11 rounded-xl font-bold text-sm transition-colors ${
                      isPopular
                        ? 'bg-gold-500 hover:bg-gold-600 text-gray-900'
                        : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                    }`}
                  >
                    {isFree
                      ? t('becomeSellerLanding.pricingCTAFree')
                      : t('becomeSellerLanding.pricingCTAPaid')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why NUNULIA */}
      <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-3">
            {t('becomeSellerLanding.whyTitle')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('becomeSellerLanding.whySubtitle')}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: '🌍', title: 'whyLocalTitle', desc: 'whyLocalDesc' },
            { icon: '💬', title: 'whyWhatsAppTitle', desc: 'whyWhatsAppDesc' },
            { icon: '📱', title: 'whyMomoTitle', desc: 'whyMomoDesc' },
            { icon: '💸', title: 'whyZeroFeeTitle', desc: 'whyZeroFeeDesc' },
            { icon: '⚡', title: 'whyMobileFirstTitle', desc: 'whyMobileFirstDesc' },
            { icon: '✅', title: 'whyVerifiedTitle', desc: 'whyVerifiedDesc' },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-2xl p-5 shadow-sm dark:shadow-none"
            >
              <div className="text-2xl mb-3" aria-hidden="true">{f.icon}</div>
              <h3 className="text-base font-bold mb-1.5">
                {t(`becomeSellerLanding.${f.title}`)}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {t(`becomeSellerLanding.${f.desc}`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-14 md:pb-20">
        <div className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-gold-400 to-gold-600 p-8 md:p-12 text-center shadow-[0_12px_40px_rgba(212,148,26,0.25)]">
          <h2 className="text-2xl md:text-4xl font-black text-gray-900 mb-3">
            {t('becomeSellerLanding.finalCTATitle')}
          </h2>
          <p className="text-gray-900/80 mb-6 max-w-xl mx-auto">
            {t('becomeSellerLanding.finalCTASubtitle')}
          </p>
          <button
            onClick={goRegister}
            className="inline-flex items-center justify-center h-12 px-8 rounded-2xl bg-gray-900 text-white font-extrabold text-base hover:bg-gray-800 active:scale-[0.98] transition-all"
          >
            {t('becomeSellerLanding.finalCTAButton')} →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/40">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <span className="text-sm font-black text-gray-900">N</span>
            </div>
            <div>
              <p className="font-black text-sm leading-none">NUNULIA</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">
                {t('becomeSellerLanding.footerTagline')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            <Link to="/cgu" className="hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
              {t('becomeSellerLanding.footerTerms')}
            </Link>
            <Link to="/politique-confidentialite" className="hover:text-gold-600 dark:hover:text-gold-400 transition-colors">
              {t('becomeSellerLanding.footerPrivacy')}
            </Link>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-600">
            {t('becomeSellerLanding.footerCopyright')}
          </p>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 pt-3 pb-3 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <button
          onClick={goRegister}
          className="w-full h-[52px] rounded-2xl bg-gold-500 hover:bg-gold-600 text-gray-900 font-extrabold text-base flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(245,200,66,0.35)] active:scale-[0.98] transition-all"
        >
          {t('becomeSellerLanding.stickyCTA')} →
        </button>
      </div>
    </div>
  );
};

export default BecomeSellerLanding;
