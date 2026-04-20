import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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

  // Do not show for verified tiers
  if (tier === 'identity' || tier === 'shop') return null;

  if (variant === 'banner') {
    return (
      <div className={`rounded-xl bg-blue-500/10 border border-blue-500/25 px-4 py-3 flex items-start gap-3 ${className}`}>
        <span className="flex-shrink-0 text-blue-300 text-lg leading-none" aria-hidden="true">ℹ</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
            {t('unverifiedSeller.banner')}{' '}
            <Link to="/securite" className="underline text-blue-300 hover:text-blue-200 font-medium">
              {t('unverifiedSeller.safetyTips')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-300 ${className}`}>
      <span aria-hidden="true">ℹ</span>
      <span className="font-medium">{t('unverifiedSeller.inline')}</span>
    </div>
  );
};
