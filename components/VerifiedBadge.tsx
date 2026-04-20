import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { VerificationTier } from '../types';

interface VerifiedBadgeProps {
  tier?: VerificationTier;
  verifiedAt?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

const SIZE_MAP = {
  xs: { icon: 'w-3 h-3', text: 'text-[10px]' },
  sm: { icon: 'w-3.5 h-3.5', text: 'text-xs' },
  md: { icon: 'w-4 h-4', text: 'text-sm' },
  lg: { icon: 'w-5 h-5', text: 'text-base' },
};

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function ShopIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l-1.5 4.5L6 7l3.25 3.2L8.5 15 12 12.75 15.5 15l-.75-4.8L18 7l-4.5-.5L12 2z" />
    </svg>
  );
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  tier,
  verifiedAt,
  size = 'sm',
  className = '',
  showLabel = false,
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!tier || tier === 'none' || tier === 'phone') return null;

  const sizes = SIZE_MAP[size];

  const config = tier === 'shop'
    ? {
        icon: <ShopIcon className={`${sizes.icon} text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]`} />,
        label: t('verification.tierShop'),
        desc: t('verification.tierShopDesc'),
        badgeClass: 'text-amber-400',
      }
    : {
        icon: <CheckIcon className={`${sizes.icon} text-blue-400`} />,
        label: t('verification.tierIdentity'),
        desc: t('verification.tierIdentityDesc'),
        badgeClass: 'text-blue-400',
      };

  const verifiedDate = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <span ref={wrapperRef} className={`relative inline-flex items-center gap-0.5 align-baseline ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-0.5 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full ${config.badgeClass}`}
        aria-label={config.label}
        aria-expanded={open}
      >
        {config.icon}
        {showLabel && <span className={`${sizes.text} font-semibold`}>{config.label}</span>}
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl text-left animate-fade-in pointer-events-none"
        >
          <span className="flex items-center gap-2 mb-1">
            {config.icon}
            <span className={`font-bold ${config.badgeClass} text-sm`}>{config.label}</span>
          </span>
          <span className="block text-xs text-gray-300 leading-relaxed">{config.desc}</span>
          {verifiedDate && (
            <span className="block text-[10px] text-gray-500 mt-1.5">
              {t('verification.verifiedOn', { date: verifiedDate })}
            </span>
          )}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-700"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
};
