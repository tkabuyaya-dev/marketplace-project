import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import type { VerificationTier } from '../types';

interface UnverifiedSellerNoticeProps {
  tier?: VerificationTier;
  variant?: 'inline' | 'banner';
  className?: string;
}

export const UnverifiedSellerNotice: React.FC<UnverifiedSellerNoticeProps> = ({
  tier,
  variant = 'inline',
  className = '',
}) => {
  const { t } = useTranslation();

  // Hide for verified tiers
  if (tier === 'identity' || tier === 'shop') return null;

  if (variant === 'banner') {
    return (
      <div
        className={`relative overflow-hidden rounded-card bg-red-50 border border-red-300 shadow-card ${className}`}
        role="alert"
      >
        {/* Left accent bar — codes "attention" visually */}
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />

        <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-red-500 text-white"
            style={{ boxShadow: '0 2px 6px rgba(239,68,68,0.35)' }}
            aria-hidden="true"
          >
            <ShieldAlert size={18} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] sm:text-[14px] font-extrabold text-red-900 tracking-[-0.01em] leading-tight">
              {t('unverifiedSeller.bannerTitle', 'Vendeur non vérifié')}
            </div>
            <p className="mt-1 text-[12.5px] sm:text-[13px] font-medium text-red-800 leading-relaxed">
              {t('unverifiedSeller.banner')}
            </p>
            <Link
              to="/securite"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-extrabold text-red-700 hover:text-red-900 underline underline-offset-2 transition-colors"
            >
              {t('unverifiedSeller.safetyTips')}
              <ArrowRight size={12} strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 border border-red-300 text-[11px] text-red-800 font-semibold ${className}`}
      role="status"
    >
      <ShieldAlert size={11} strokeWidth={2.4} className="text-red-600" aria-hidden="true" />
      <span>{t('unverifiedSeller.inline')}</span>
    </div>
  );
};
