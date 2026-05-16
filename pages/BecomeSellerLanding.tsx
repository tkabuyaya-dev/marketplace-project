import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import type { SubscriptionTier } from '../types';
import {
  ArrowRight, ArrowDown, Check,
  Store, Camera, MessageCircle, Flame,
} from 'lucide-react';

/* ─────────────────────── KEYFRAMES ──────────────────────── */

const KEYFRAMES = `
@keyframes float {
  0%   { transform: translate(0,0) scale(1); }
  100% { transform: translate(8px,-6px) scale(1.05); }
}
@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes pulseScale {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.015); }
}
@keyframes tileShimmer {
  0%, 100% { background-position: 200% 0; }
  50%      { background-position: -100% 0; }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const POPULAR_TIER_ID = 'pro';

/* ─────────────────────── UTILS ──────────────────────── */

/** Carré arrondi gradient or avec lettre N */
function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: size, height: size,
        borderRadius: size * 0.28,
        background: 'linear-gradient(135deg,#F5C842 0%,#C47E00 100%)',
        color: '#111318',
        fontWeight: 900,
        fontSize: size * 0.55,
        letterSpacing: '-0.04em',
        boxShadow: '0 2px 8px rgba(245,200,66,0.4)',
        flexShrink: 0,
      }}
    >
      N
    </div>
  );
}

/* ─────────────────────── A. STICKY NAV ──────────────────────── */

function StickyNav({ onCreateShop }: { onCreateShop: () => void }) {
  return (
    <header
      className="sticky top-0 z-50 h-14 px-4 flex items-center justify-between bg-white border-b"
      style={{ borderColor: 'rgba(0,0,0,0.05)' }}
    >
      <Link to="/" className="flex items-center gap-[9px] no-underline">
        <LogoMark size={32} />
        <span className="font-black text-[17px] tracking-[-0.04em] text-[#111318]">
          NUNULIA
        </span>
      </Link>
      <button
        type="button"
        onClick={onCreateShop}
        className="h-8 px-4 rounded-full bg-[#F5C842] text-[#111318] text-[12px] font-black tracking-[-0.01em] active:scale-95 transition"
        style={{ boxShadow: '0 4px 12px rgba(245,200,66,0.4)' }}
      >
        Créer ma boutique
      </button>
    </header>
  );
}

/* ─────────────────────── B. HERO ──────────────────────── */

function PhoneMockCard() {
  return (
    <div className="mt-6 flex flex-col items-center">
      <div
        className="relative overflow-hidden bg-white border flex flex-col gap-2.5 p-3"
        style={{
          width: 340, height: 220,
          borderRadius: 18,
          borderColor: 'rgba(0,0,0,0.06)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
        }}
      >
        {/* mini top bar */}
        <div
          className="flex items-center justify-center gap-1.5 pb-2 border-b"
          style={{ borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <LogoMark size={14} />
          <span className="text-[11px] font-black tracking-[-0.03em] text-[#111318]">NUNULIA</span>
        </div>

        {/* 2×2 product grid */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-[9px]"
              style={{
                background: 'linear-gradient(110deg, #F0F1F4 8%, #E6E8EC 18%, #F0F1F4 33%)',
                backgroundSize: '200% 100%',
                animation: `tileShimmer 3.6s ease-in-out infinite ${i * 0.3}s`,
              }}
            >
              <div
                className="absolute rounded-md opacity-55"
                style={{
                  inset: '20% 25% 30% 25%',
                  background: i % 2 === 0
                    ? 'linear-gradient(160deg, #D7CFB8 0%, #B89A6B 100%)'
                    : 'linear-gradient(160deg, #C7CDD6 0%, #8A93A1 100%)',
                }}
              />
              <span
                className="absolute bottom-1.5 left-1.5 h-3.5 px-1.5 rounded text-[8px] font-black inline-flex items-center bg-[#F5C842] text-[#111318]"
                style={{ letterSpacing: '.04em', boxShadow: '0 1px 3px rgba(245,200,66,0.4)' }}
              >
                BIF
              </span>
            </div>
          ))}
        </div>

        {/* flags */}
        <div
          className="flex justify-center gap-2.5 pt-1.5 text-[14px] leading-none border-t"
          style={{ borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <span>🇧🇮</span><span>🇨🇩</span><span>🇷🇼</span>
        </div>
      </div>
      <p className="mt-2.5 text-[10px] text-[#9EA5B0] text-center">
        Plus de 1 200 vendeurs actifs · Burundi, RDC, Rwanda
      </p>
    </div>
  );
}

function HeroSection({
  onCreateShop,
  onViewPricing,
}: {
  onCreateShop: () => void;
  onViewPricing: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: '#FAFAF5', padding: '36px 20px 40px' }}
    >
      {/* glow blobs */}
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          top: -40, left: -40, width: 256, height: 256,
          background: 'rgba(245,200,66,0.20)',
          filter: 'blur(80px)',
          animation: 'float 6s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          bottom: -20, right: -30, width: 192, height: 192,
          background: 'rgba(196,126,0,0.10)',
          filter: 'blur(60px)',
          animation: 'float 7s ease-in-out infinite alternate-reverse',
        }}
      />

      <div className="relative z-10">
        {/* eyebrow */}
        <div
          className="inline-flex items-center gap-1 h-6 px-3 rounded-full text-[10px] font-black uppercase"
          style={{
            background: '#FEF9EC',
            border: '1px solid rgba(245,200,66,0.5)',
            color: '#C47E00',
            letterSpacing: '.06em',
          }}
        >
          🌍 Marketplace Afrique centrale
        </div>

        {/* H1 */}
        <h1
          className="font-black mt-3 text-[#111318]"
          style={{ fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.04em' }}
        >
          Vendez à des milliers
          <br />
          <span className="italic text-[#C47E00]">d'acheteurs</span>
          <br />
          via WhatsApp
        </h1>

        <p className="mt-3 text-[14px] text-[#5C6370]" style={{ lineHeight: 1.6, maxWidth: 300 }}>
          Créez votre boutique en 3 minutes, publiez vos produits, recevez des
          clients directement sur WhatsApp. Gratuit pour toujours.
        </p>

        {/* CTAs */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onCreateShop}
            className="h-[52px] rounded-2xl bg-[#F5C842] text-[#111318] font-black text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition"
            style={{ letterSpacing: '-0.01em', boxShadow: '0 8px 24px rgba(245,200,66,0.45)' }}
          >
            Créer ma boutique <ArrowRight size={16} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onViewPricing}
            className="h-11 rounded-2xl bg-white text-[#5C6370] font-bold text-[13px] border active:scale-[0.98] transition"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            Voir les tarifs
          </button>
        </div>

        {/* trust badges */}
        <div className="mt-4 flex flex-wrap justify-center gap-y-1 gap-x-5">
          {['Inscription gratuite', 'Zéro commission', 'Contact direct WhatsApp'].map((label) => (
            <div key={label} className="inline-flex items-center gap-1.5 text-[11px] text-[#5C6370] font-medium">
              <span
                className="w-4 h-4 rounded-full inline-flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.12)' }}
              >
                <Check size={10} strokeWidth={2.8} color="#10B981" />
              </span>
              {label}
            </div>
          ))}
        </div>

        <PhoneMockCard />
      </div>
    </section>
  );
}

/* ─────────────────────── D. STEPS ──────────────────────── */

function StepCard({ n, icon, iconBg, iconColor, title, desc }: {
  n: number; icon: React.ReactNode;
  iconBg: string; iconColor: string;
  title: string; desc: string;
}) {
  return (
    <div
      className="relative bg-[#F7F8FA] rounded-2xl"
      style={{ padding: '20px 16px 18px' }}
    >
      <div
        className="absolute flex items-center justify-center font-black text-[14px] text-[#111318]"
        style={{
          top: -10, left: -8,
          width: 36, height: 36,
          borderRadius: 12,
          background: 'linear-gradient(135deg,#F5C842 0%,#C47E00 100%)',
          boxShadow: '0 4px 12px rgba(245,200,66,0.4)',
        }}
      >
        {n}
      </div>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mt-1.5"
        style={{ background: iconBg, color: iconColor, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        {icon}
      </div>
      <div className="mt-3 text-[14px] font-black text-[#111318]" style={{ letterSpacing: '-0.02em' }}>
        {title}
      </div>
      <div className="mt-1 text-[12px] text-[#5C6370]" style={{ lineHeight: 1.5 }}>
        {desc}
      </div>
    </div>
  );
}

function StepsSection() {
  const steps = [
    {
      n: 1, icon: <Store size={26} strokeWidth={1.9} />,
      iconBg: '#FEF9EC', iconColor: '#C47E00',
      title: 'Créez votre boutique',
      desc: 'Remplissez votre profil vendeur, ajoutez votre numéro WhatsApp et une photo de boutique.',
    },
    {
      n: 2, icon: <Camera size={26} strokeWidth={1.9} />,
      iconBg: '#FEF9EC', iconColor: '#C47E00',
      title: 'Publiez vos produits',
      desc: 'Prenez des photos, ajoutez le prix, la description. En ligne en moins de 2 minutes.',
    },
    {
      n: 3, icon: <MessageCircle size={24} strokeWidth={1.9} />,
      iconBg: 'rgba(37,211,102,0.10)', iconColor: '#25D366',
      title: 'Recevez des clients',
      desc: 'Les acheteurs vous contactent directement sur WhatsApp. Vous gérez tout depuis votre téléphone.',
    },
  ];

  return (
    <section className="bg-white border-y" style={{ borderColor: 'rgba(0,0,0,0.05)', padding: '40px 16px' }}>
      <h2 className="text-center font-black text-[22px] text-[#111318]" style={{ letterSpacing: '-0.03em' }}>
        Vendez en 3 étapes
      </h2>
      <p className="mt-1 text-center text-[12px] text-[#9EA5B0]">
        Pas de complexité, pas de frais cachés.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <StepCard {...s} />
            {i < steps.length - 1 && (
              <div className="flex justify-center -my-0.5">
                <ArrowDown size={18} strokeWidth={2.4} color="rgba(245,200,66,0.6)" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── E. FOUNDERS ──────────────────────── */

function FoundersSection({ onJoin }: { onJoin: () => void }) {
  const taken = FOUNDERS_SPOTS_TOTAL - FOUNDERS_SPOTS_REMAINING;
  const pct = Math.round((taken / FOUNDERS_SPOTS_TOTAL) * 100);

  return (
    <section style={{ padding: '24px 16px' }}>
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #FEF9EC 0%, #FFF8DC 50%, #FFFAEE 100%)',
          border: '1px solid rgba(245,200,66,0.4)',
          borderRadius: 24,
          padding: 20,
          boxShadow: '0 4px 20px rgba(245,200,66,0.20)',
        }}
      >
        {/* decorative blob */}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            top: -30, right: -30, width: 160, height: 160,
            background: 'rgba(245,200,66,0.30)',
            filter: 'blur(40px)',
          }}
        />

        <div className="relative z-10">
          <div
            className="inline-flex items-center h-5 px-2.5 rounded-full bg-[#F5C842] text-[#111318] text-[9px] font-black uppercase"
            style={{ letterSpacing: '.12em' }}
          >
            Offre limitée
          </div>

          <h3
            className="mt-2.5 font-black text-[20px] text-[#111318]"
            style={{ lineHeight: 1.15, letterSpacing: '-0.03em' }}
          >
            Places Fondateurs — rejoignez les premiers
          </h3>

          <p className="mt-1.5 text-[12px] text-[#5C6370]" style={{ lineHeight: 1.6 }}>
            Les {FOUNDERS_SPOTS_TOTAL} premiers vendeurs obtiennent un accès à vie au plan Basique
            à prix réduit + badge Fondateur visible sur votre boutique.
          </p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between mb-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#C47E00]">
                <Flame size={11} fill="#C47E00" stroke="#C47E00" />
                {taken} places prises
              </span>
              <span className="text-[11px] text-[#5C6370] font-medium">
                {FOUNDERS_SPOTS_REMAINING} restantes
              </span>
            </div>
            <div
              className="relative h-3 rounded-full overflow-hidden"
              style={{ background: 'rgba(245,200,66,0.25)' }}
            >
              <div
                className="absolute top-0 left-0 bottom-0 rounded-full overflow-hidden"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg,#F5C842,#C47E00)',
                }}
              >
                <div
                  className="absolute top-0 left-0 bottom-0"
                  style={{
                    width: '40%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                    animation: 'shimmer 2.2s linear infinite',
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onJoin}
            className="mt-5 w-full h-12 rounded-2xl bg-[#111318] text-white font-black text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition"
            style={{ letterSpacing: '-0.01em', boxShadow: '0 4px 16px rgba(0,0,0,0.20)' }}
          >
            Rejoindre les Fondateurs <ArrowRight size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── F. PRICING ──────────────────────── */

type ButtonVariant = 'soft' | 'dark' | 'gold';

function buttonStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case 'soft': return { background: '#F0F1F4', color: '#111318', fontWeight: 700 };
    case 'dark': return { background: '#111318', color: '#FFFFFF', fontWeight: 800 };
    case 'gold': return { background: '#F5C842', color: '#111318', fontWeight: 900, boxShadow: '0 6px 18px rgba(245,200,66,0.45)' };
  }
}

function tierBonus(tierId: string): string | null {
  if (tierId === 'pro') return 'Accès Demandes clients (Je Cherche)';
  if (tierId === 'elite') return 'Badge Vendeur Élite visible';
  return null;
}

function tierButtonVariant(tierId: string): ButtonVariant {
  if (tierId === 'free') return 'soft';
  if (tierId === POPULAR_TIER_ID) return 'gold';
  return 'dark';
}

function tierButtonLabel(tierId: string, isFree: boolean): string {
  if (isFree) return 'Commencer gratuitement';
  if (tierId === POPULAR_TIER_ID) return 'Choisir Pro →';
  return `Choisir ${tierId.charAt(0).toUpperCase() + tierId.slice(1)}`;
}

function PricingCard({
  tier, price, currency, onSelect,
}: {
  tier: SubscriptionTier;
  price: string;
  currency: string;
  onSelect: () => void;
}) {
  const isFree = tier.id === 'free';
  const isPopular = tier.id === POPULAR_TIER_ID;
  const isUnlimited = tier.max === null;
  const bonus = tierBonus(tier.id);
  const variant = tierButtonVariant(tier.id);
  const label = tierButtonLabel(tier.id, isFree);

  return (
    <div
      className="relative rounded-2xl"
      style={{
        background: isPopular ? '#FFFFFF' : '#F7F8FA',
        border: isPopular ? '2px solid #F5C842' : '1px solid rgba(0,0,0,0.05)',
        padding: 16,
        boxShadow: isPopular ? '0 8px 24px rgba(245,200,66,0.25)' : undefined,
        animation: isPopular ? 'pulseScale 3s ease-in-out infinite' : undefined,
      }}
    >
      {isPopular && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 h-[22px] px-2.5 rounded-full bg-[#F5C842] text-[#111318] text-[10px] font-black uppercase flex items-center gap-1 whitespace-nowrap"
          style={{ letterSpacing: '.06em', boxShadow: '0 4px 12px rgba(245,200,66,0.45)' }}
        >
          ⭐ Populaire
        </div>
      )}

      <div className="text-[15px] font-black text-[#111318] tracking-[-0.02em]">{tier.label}</div>
      <div className="mt-0.5 text-[11px] text-[#5C6370]">
        {isUnlimited ? 'Produits illimités' : `Jusqu'à ${tier.max} produits`}
      </div>

      <div className="mt-2.5 flex items-baseline gap-1">
        <span
          className="font-black text-[26px] text-[#C47E00] leading-none"
          style={{ letterSpacing: '-0.04em' }}
        >
          {price}
        </span>
        {!isFree && (
          <span className="text-[11px] text-[#9EA5B0] font-medium">/mois</span>
        )}
      </div>

      {bonus && (
        <div className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[#10B981]">
          <Check size={11} strokeWidth={2.8} />
          {bonus}
        </div>
      )}

      <button
        type="button"
        onClick={onSelect}
        className="mt-3.5 w-full h-10 rounded-xl border-0 text-[13px] active:scale-[0.98] transition"
        style={buttonStyle(variant)}
      >
        {label}
      </button>
    </div>
  );
}

function PricingSection({
  tiers, getPrice, currency, onSelectPlan, previewFlag, previewName,
}: {
  tiers: SubscriptionTier[];
  getPrice: (tierId: string) => number;
  currency: string;
  onSelectPlan: () => void;
  previewFlag: string;
  previewName: string;
}) {
  return (
    <section
      id="tarifs"
      className="bg-white border-y"
      style={{ borderColor: 'rgba(0,0,0,0.05)', padding: '40px 16px' }}
    >
      <h2 className="text-center font-black text-[22px] text-[#111318]" style={{ letterSpacing: '-0.03em' }}>
        Tarifs simples et transparents
      </h2>
      <p className="mt-1 text-center text-[12px] text-[#9EA5B0]">
        {previewFlag} {previewName} · {currency}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {tiers.map((tier) => {
          const amount = getPrice(tier.id);
          const price = tier.id === 'free'
            ? 'Gratuit'
            : `${amount.toLocaleString('fr-FR')} ${currency}`;

          return (
            <div key={tier.id} style={{ paddingTop: tier.id === POPULAR_TIER_ID ? 6 : 0 }}>
              <PricingCard
                tier={tier}
                price={price}
                currency={currency}
                onSelect={onSelectPlan}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────── G. WHY ──────────────────────── */

const WHY_ITEMS = [
  { emoji: '🌍', title: 'Marché local',    desc: 'Clients au Burundi, RDC et Rwanda' },
  { emoji: '💬', title: 'WhatsApp direct', desc: 'Aucune commission, contact immédiat' },
  { emoji: '📱', title: 'Mobile Money',    desc: 'Paiements MoMo, Airtel, Lumicash' },
  { emoji: '💸', title: '0 % commission',  desc: 'Gardez 100 % de vos ventes' },
  { emoji: '⚡', title: 'Approuvé en 24h', desc: 'Votre boutique live en moins d\'un jour' },
  { emoji: '✅', title: 'Badge vérifié',   desc: 'Gagnez la confiance des acheteurs' },
];

function WhySection() {
  return (
    <section style={{ padding: '40px 16px' }}>
      <h2 className="text-center font-black text-[20px] text-[#111318]" style={{ letterSpacing: '-0.03em' }}>
        Pourquoi choisir NUNULIA ?
      </h2>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {WHY_ITEMS.map((item) => (
          <div
            key={item.title}
            className="bg-white rounded-2xl"
            style={{
              border: '1px solid rgba(0,0,0,0.05)',
              padding: '14px 12px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[18px]"
              style={{ background: '#FEF9EC' }}
            >
              {item.emoji}
            </div>
            <div className="mt-2.5 text-[12px] font-black text-[#111318] tracking-[-0.01em]">
              {item.title}
            </div>
            <div className="mt-0.5 text-[10px] text-[#5C6370]" style={{ lineHeight: 1.5 }}>
              {item.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── H. FINAL CTA ──────────────────────── */

function FinalCtaSection({ onCreateShop }: { onCreateShop: () => void }) {
  return (
    <section style={{ padding: '0 16px 24px' }}>
      <div
        className="text-center"
        style={{
          background: 'linear-gradient(135deg,#F5C842 0%,#C47E00 100%)',
          borderRadius: 24,
          padding: '28px 24px',
          boxShadow: '0 12px 40px rgba(212,148,26,0.30)',
        }}
      >
        <h2 className="font-black text-[22px] text-[#111318]" style={{ letterSpacing: '-0.03em' }}>
          Prêt à vendre ?
        </h2>
        <p className="mt-1.5 text-[13px]" style={{ color: 'rgba(17,19,24,0.78)', lineHeight: 1.55 }}>
          Rejoignez +1 200 vendeurs qui développent leur business avec NUNULIA.
        </p>
        <button
          type="button"
          onClick={onCreateShop}
          className="h-12 px-7 rounded-2xl bg-[#111318] text-white font-black text-[14px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
          style={{ letterSpacing: '-0.01em', marginTop: 18 }}
        >
          Créer ma boutique <ArrowRight size={15} strokeWidth={2.4} />
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────── I. FOOTER ──────────────────────── */

function PageFooter() {
  return (
    <footer
      className="bg-white border-t"
      style={{ borderColor: 'rgba(0,0,0,0.05)', padding: '24px 16px 28px' }}
    >
      <div className="flex items-center gap-2.5">
        <LogoMark size={28} />
        <div>
          <div className="font-black text-[14px] text-[#111318] tracking-[-0.04em]">NUNULIA</div>
          <div className="text-[10px] text-[#9EA5B0] mt-px">Le marché africain dans votre poche</div>
        </div>
      </div>
      <nav className="mt-4 flex gap-4 text-[11px] text-[#5C6370]">
        <Link to="/cgu" className="underline underline-offset-2 text-[#5C6370]">CGU</Link>
        <Link to="/politique-confidentialite" className="underline underline-offset-2 text-[#5C6370]">Confidentialité</Link>
      </nav>
      <div className="mt-3 text-[10px] text-[#9EA5B0]">© 2025 NUNULIA · Bujumbura, Burundi</div>
    </footer>
  );
}

/* ─────────────────────── C. STICKY BAR ──────────────────────── */

function StickyBar({ onCreateShop }: { onCreateShop: () => void }) {
  return (
    <div
      className="sticky bottom-0 z-40 bg-white border-t"
      style={{
        borderColor: 'rgba(0,0,0,0.06)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
        padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
      }}
    >
      <button
        type="button"
        onClick={onCreateShop}
        className="w-full h-[52px] rounded-2xl bg-[#F5C842] text-[#111318] font-black text-[15px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
        style={{ letterSpacing: '-0.01em', boxShadow: '0 6px 20px rgba(245,200,66,0.45)' }}
      >
        Créer ma boutique gratuitement <ArrowRight size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ─────────────────────── MAIN ──────────────────────── */

const BecomeSellerLanding: React.FC = () => {
  const { activeCountry, currentUser } = useAppContext();
  const navigate = useNavigate();
  const pricingRef = useRef<HTMLDivElement>(null);

  const previewCountryId = activeCountry || 'bi';
  const previewCountry = INITIAL_COUNTRIES.find(c => c.id === previewCountryId) || INITIAL_COUNTRIES[0];

  const [tiers, setTiers] = useState<SubscriptionTier[]>(INITIAL_SUBSCRIPTION_TIERS);
  const [pricingData, setPricingData] = useState<{ prices: Record<string, number>; currency: string } | null>(null);

  useEffect(() => {
    const unsubTiers = subscribeToSubscriptionTiers(setTiers);
    const unsubPricing = subscribeToSubscriptionPricing(previewCountryId, setPricingData);
    return () => { unsubTiers(); unsubPricing(); };
  }, [previewCountryId]);

  const currency = pricingData?.currency
    || DEFAULT_SUBSCRIPTION_PRICING[previewCountryId]?.currency
    || DEFAULT_SUBSCRIPTION_PRICING['bi'].currency;

  const getPrice = (tierId: string): number => {
    if (pricingData?.prices?.[tierId] !== undefined) return pricingData.prices[tierId];
    const defaults = DEFAULT_SUBSCRIPTION_PRICING[previewCountryId] || DEFAULT_SUBSCRIPTION_PRICING['bi'];
    return defaults.prices[tierId] || 0;
  };

  const orderedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.min - b.min),
    [tiers],
  );

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

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="min-h-screen flex flex-col bg-[#F7F8FA]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <StickyNav onCreateShop={goRegister} />
        <HeroSection onCreateShop={goRegister} onViewPricing={scrollToPricing} />
        <StepsSection />
        <FoundersSection onJoin={goRegister} />

        <div ref={pricingRef}>
          <PricingSection
            tiers={orderedTiers}
            getPrice={getPrice}
            currency={currency}
            onSelectPlan={goRegister}
            previewFlag={previewCountry.flag}
            previewName={previewCountry.name}
          />
        </div>

        <WhySection />
        <FinalCtaSection onCreateShop={goRegister} />
        <PageFooter />
        <StickyBar onCreateShop={goRegister} />
      </div>
    </>
  );
};

export default BecomeSellerLanding;
