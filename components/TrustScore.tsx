import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '../types';

interface TrustScoreProps {
  user: User;
  productCount?: number;
  children: React.ReactNode; // typically the avatar to wrap with the ring
}

interface ScoreBreakdown {
  seniority: number;
  activity: number;
  verification: number;
  subscription: number;
  total: number;
}

function computeScore(user: User, productCount: number): ScoreBreakdown {
  // Seniority: 2 pts per month active, max 20
  const monthsActive = user.joinDate
    ? Math.max(0, (Date.now() - user.joinDate) / (1000 * 60 * 60 * 24 * 30))
    : 0;
  const seniority = Math.min(20, Math.round(monthsActive * 2));

  // Activity: 1 pt per approved product, max 25
  const activity = Math.min(25, productCount);

  // Verification: none=0, phone=10, identity=25, shop=40
  const tier = user.verificationTier || 'none';
  const verification =
    tier === 'shop' ? 40 :
    tier === 'identity' ? 25 :
    tier === 'phone' ? 10 : 0;

  // Subscription: paid plan active = 15
  const hasPaidPlan = (user.sellerDetails?.tierLabel || '').toLowerCase().includes('gratuit') === false
    && !!user.sellerDetails?.subscriptionExpiresAt
    && user.sellerDetails.subscriptionExpiresAt > Date.now();
  const subscription = hasPaidPlan ? 15 : 0;

  return {
    seniority,
    activity,
    verification,
    subscription,
    total: Math.min(100, seniority + activity + verification + subscription),
  };
}

function scoreColor(score: number): { stroke: string; text: string; label: string } {
  if (score >= 80) return { stroke: '#10b981', text: 'text-emerald-400', label: 'excellent' };
  if (score >= 60) return { stroke: '#3b82f6', text: 'text-blue-400', label: 'good' };
  if (score >= 40) return { stroke: '#f59e0b', text: 'text-amber-400', label: 'average' };
  return { stroke: '#6b7280', text: 'text-gray-400', label: 'new' };
}

export const TrustScore: React.FC<TrustScoreProps> = ({ user, productCount = 0, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const breakdown = useMemo(
    () => computeScore(user, user.productCount ?? productCount),
    [user, productCount]
  );

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

  // Hide for buyers or brand-new accounts with zero data
  if (user.role !== 'seller') return <>{children}</>;

  const { total } = breakdown;
  const color = scoreColor(total);
  const circumference = 2 * Math.PI * 72;
  const dashOffset = circumference * (1 - total / 100);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {/* Avatar with donut ring */}
      <div className="relative">
        <svg
          className="absolute inset-0 -rotate-90 pointer-events-none"
          width="100%"
          height="100%"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="80"
            cy="80"
            r="72"
            fill="none"
            stroke={color.stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        {children}
      </div>

      {/* Score pill */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t('trust.scoreLabel', { score: total })}
        aria-expanded={open}
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full flex items-center gap-1 px-2.5 py-1 bg-gray-900 border border-gray-700 rounded-full text-xs font-bold shadow-lg hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 mt-3"
      >
        <span className={color.text}>●</span>
        <span className="text-white">{total}</span>
        <span className="text-gray-500 text-[10px]">/100</span>
      </button>

      {/* Popover */}
      {open && (
        <div
          role="dialog"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-16 w-72 z-50 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-white text-sm">{t('trust.title')}</h4>
            <span className={`font-black text-lg ${color.text}`}>{total}<span className="text-gray-500 text-xs font-normal">/100</span></span>
          </div>

          <div className="space-y-2 text-xs">
            <ScoreRow label={t('trust.seniority')} value={breakdown.seniority} max={20} />
            <ScoreRow label={t('trust.activity')} value={breakdown.activity} max={25} />
            <ScoreRow label={t('trust.verification')} value={breakdown.verification} max={40} />
            <ScoreRow label={t('trust.subscription')} value={breakdown.subscription} max={15} />
          </div>

          <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
            {t('trust.disclaimer')}
          </p>

          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-700"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
};

const ScoreRow: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{value}<span className="text-gray-500">/{max}</span></span>
      </div>
      <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full origin-left transition-transform duration-700"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
};
