/**
 * NUNULIA — Demandes clients (vue vendeur)
 * Route : /demandes
 *
 * Tous les vendeurs voient toutes les demandes actives.
 * Le contact WhatsApp est plan-gated : FREE → numéro masqué + CTA upgrade.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Search, SlidersHorizontal,
  MessageCircle, Lock, Zap, X, RefreshCw, ChevronDown,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import {
  getBuyerRequests, trackWhatsAppContact, canContactBuyer,
  BuyerRequestFilters, PAGE_SIZE,
} from '../services/firebase/buyer-requests';
import { BuyerRequest } from '../types';
import { INITIAL_COUNTRIES, INITIAL_CATEGORIES } from '../constants';
import { CITIES_BY_COUNTRY } from '../data/locations';

/* ─────────────────────── KEYFRAMES ──────────────────────── */

const KEYFRAMES = `
@keyframes nu-card-in {
  0%   { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes nu-slide-down {
  0%   { opacity: 0; transform: translateY(-10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes nu-sheet-up {
  0%   { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
@keyframes nu-ping {
  0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
  70%  { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
  100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
@keyframes nu-soft-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.04); opacity: 0.92; }
}
@keyframes nu-float-dot {
  0%, 100% { transform: translateY(0); opacity: 1; }
  50%      { transform: translateY(-6px); opacity: 0.6; }
}
`;

/* ─────────────────────── UTILS ──────────────────────── */

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
}

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000));
}

function fmtBudget(budget?: number, currency?: string): string | null {
  if (!budget) return null;
  return budget.toLocaleString('fr-FR') + ' ' + (currency || 'BIF');
}

function countryFlag(countryId: string): string {
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '🌍';
}

function countryName(countryId: string): string {
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.name || countryId;
}

/* ─────────────────────── STICKY HEADER ──────────────────────── */

function PageHeader({ count, onBack }: { count: number; onBack?: () => void }) {
  return (
    <header
      className="sticky top-0 z-30 bg-white border-b border-black/5 px-3.5 pb-3"
      style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-2.5">
        <button
          onClick={onBack}
          aria-label="Retour"
          className="-ml-1.5 w-9 h-9 rounded-[10px] inline-flex items-center justify-center text-[#111318] hover:bg-black/5 active:scale-[0.96] transition"
        >
          <ArrowLeft size={22} strokeWidth={2.25} />
        </button>

        <h1 className="text-[18px] font-black tracking-tight text-[#111318] leading-tight">
          Demandes clients
        </h1>

        {count > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 h-[22px] px-2.5 rounded-full bg-[#F5C842] text-[#111318] text-[11px] font-black"
            style={{ boxShadow: '0 2px 6px rgba(245,200,66,0.45)' }}
          >
            <Search size={11} strokeWidth={2.5} />
            {count}
          </span>
        )}
      </div>
      <p className="mt-1 ml-7 text-[11px] font-medium text-[#9EA5B0]">
        Trouvez vos clients avant vos concurrents
      </p>
    </header>
  );
}

/* ─────────────────────── FILTER CHIPS BAR ──────────────────────── */

interface ActiveChip { label: string; onRemove: () => void }

function FilterChipsBar({
  chips, activeCount, onOpenSheet,
}: {
  chips: ActiveChip[];
  activeCount: number;
  onOpenSheet: () => void;
}) {
  return (
    <div
      className="flex gap-1.5 px-3 py-2.5 bg-white border-b border-black/5 overflow-x-auto"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={c.onRemove}
          className="shrink-0 h-9 pl-3 pr-2 rounded-full inline-flex items-center gap-1.5 text-[12px] font-extrabold whitespace-nowrap bg-[#F5C842] text-[#111318] active:scale-[0.95] transition-all duration-150"
          style={{ boxShadow: '0 4px 10px rgba(245,200,66,0.4)' }}
        >
          {c.label}
          <span className="w-4 h-4 rounded-full bg-[#111318]/10 inline-flex items-center justify-center">
            <X size={9} strokeWidth={3} />
          </span>
        </button>
      ))}

      <button
        onClick={onOpenSheet}
        className="relative shrink-0 h-9 px-3 rounded-full inline-flex items-center gap-1.5 bg-white border border-black/[0.08] text-[#111318] text-[12px] font-bold whitespace-nowrap active:scale-[0.95] transition"
      >
        <SlidersHorizontal size={13} strokeWidth={2.25} className="text-[#5C6370]" />
        Filtres
        {activeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-black inline-flex items-center justify-center"
            style={{ boxShadow: '0 0 0 2px #fff' }}
          >
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}

/* ─────────────────────── FILTER BOTTOM SHEET ──────────────────────── */

function FilterSheet({
  open, country, city, category,
  onCountry, onCity, onCategory,
  onApply, onClose,
}: {
  open: boolean;
  country: string; city: string; category: string;
  onCountry: (v: string) => void;
  onCity: (v: string) => void;
  onCategory: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const cities = country ? (CITIES_BY_COUNTRY[country] || []) : [];
  const activeCountries = INITIAL_COUNTRIES.filter(c => c.isActive);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div
        className="relative bg-white rounded-t-[24px] px-4 pt-4 pb-8 flex flex-col gap-5"
        style={{
          animation: 'nu-sheet-up 320ms cubic-bezier(.2,.7,.2,1) both',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-9 h-1 rounded-full bg-black/10 self-center mb-1" />

        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#111318] tracking-tight">Filtres</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F0F1F4] inline-flex items-center justify-center active:scale-95 transition"
          >
            <X size={16} strokeWidth={2.5} className="text-[#111318]" />
          </button>
        </div>

        {/* Country */}
        <div>
          <p className="text-[11px] font-extrabold text-[#9EA5B0] uppercase tracking-wider mb-2">Pays</p>
          <div className="flex flex-wrap gap-2">
            {activeCountries.map(c => {
              const active = country === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { onCountry(active ? '' : c.id); onCity(''); }}
                  className={[
                    'h-9 px-3.5 rounded-full text-[12px] font-semibold transition-all duration-150 active:scale-95',
                    active
                      ? 'bg-[#F5C842] text-[#111318] font-extrabold'
                      : 'bg-[#F0F1F4] text-[#5C6370]',
                  ].join(' ')}
                  style={active ? { boxShadow: '0 4px 10px rgba(245,200,66,0.35)' } : undefined}
                >
                  {c.flag} {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* City */}
        {country && cities.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold text-[#9EA5B0] uppercase tracking-wider mb-2">Ville</p>
            <div className="relative">
              <select
                value={city}
                onChange={e => onCity(e.target.value)}
                className="w-full h-11 pl-4 pr-10 rounded-2xl border border-black/[0.08] bg-[#F7F8FA] text-[#111318] text-[13px] font-semibold appearance-none outline-none"
              >
                <option value="">Toutes les villes</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={16} strokeWidth={2} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9EA5B0] pointer-events-none" />
            </div>
          </div>
        )}

        {/* Category */}
        <div>
          <p className="text-[11px] font-extrabold text-[#9EA5B0] uppercase tracking-wider mb-2">Catégorie</p>
          <div className="flex flex-wrap gap-2">
            {INITIAL_CATEGORIES.map(c => {
              const active = category === c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => onCategory(active ? '' : c.name)}
                  className={[
                    'h-8 px-3 rounded-full text-[12px] font-semibold transition-all duration-150 active:scale-95',
                    active
                      ? 'bg-[#F5C842] text-[#111318] font-extrabold'
                      : 'bg-[#F0F1F4] text-[#5C6370]',
                  ].join(' ')}
                  style={active ? { boxShadow: '0 4px 10px rgba(245,200,66,0.35)' } : undefined}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Apply */}
        <button
          onClick={onApply}
          className="w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[15px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          Appliquer les filtres
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── PLAN GATE BANNER ──────────────────────── */

function PlanGateBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div
      className="mx-3 mt-3 mb-0 bg-white rounded-2xl flex items-center gap-3 py-3 px-3.5"
      style={{
        borderLeft: '4px solid #F5C842',
        boxShadow: '0 2px 8px rgba(245,200,66,0.15)',
        animation: 'nu-slide-down 320ms cubic-bezier(.2,.7,.2,1) both',
      }}
    >
      <div className="w-9 h-9 rounded-full bg-[#FEF9EC] inline-flex items-center justify-center shrink-0 text-[#C47E00]">
        <Lock size={18} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-black tracking-tight text-[#111318] leading-tight">
          Débloquez les contacts acheteurs
        </p>
        <p className="text-[11px] text-[#5C6370] mt-0.5">Plan Basique dès 4 900 BIF/mois</p>
      </div>
      <button
        onClick={onUpgrade}
        className="shrink-0 h-8 px-3.5 rounded-full bg-[#F5C842] text-[#111318] text-[11px] font-black active:scale-[0.96] transition"
        style={{ boxShadow: '0 2px 8px rgba(245,200,66,0.4)' }}
      >
        Voir les plans
      </button>
    </div>
  );
}

/* ─────────────────────── EXPIRY PILL ──────────────────────── */

function ExpiryPill({ days }: { days: number }) {
  const urgent = days <= 2;
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[10px] font-bold whitespace-nowrap border',
        urgent
          ? 'bg-[#FEF2F2] border-[#EF4444]/30 text-[#DC2626]'
          : 'bg-[#FFF7ED] border-[#F97316]/30 text-[#EA580C]',
      ].join(' ')}
    >
      {urgent && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#EF4444] inline-block shrink-0"
          style={{ animation: 'nu-ping 1.6s ease-out infinite' }}
        />
      )}
      {urgent ? `⚠ Expire dans ${days}j` : `⏳ Expire dans ${days}j`}
    </span>
  );
}

/* ─────────────────────── REQUEST CARD ──────────────────────── */

function RequestCard({
  request, locked, index, eligible, onContact, onUpgrade,
}: {
  request: BuyerRequest;
  locked: boolean;
  index: number;
  eligible: boolean;
  onContact: (r: BuyerRequest) => void;
  onUpgrade: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const remaining = daysLeft(request.expiresAt);
  const budget = fmtBudget(request.budget, request.budgetCurrency);
  const flag = countryFlag(request.countryId);
  const location = `${request.city}, ${request.province}`;
  const showUrgencyBadge = locked && request.contactCount >= 3;

  return (
    <article
      className="bg-white rounded-2xl border border-black/[0.06] p-3.5"
      style={{
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        animation: `nu-card-in 420ms ${index * 50}ms cubic-bezier(.2,.7,.2,1) both`,
      }}
    >
      {/* Top row */}
      <div className="flex gap-2.5 items-start">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#FEF9EC] border border-[#F5C842]/50 text-[#C47E00] text-[10px] font-bold">
              <Search size={9} strokeWidth={3} />
              Recherche
            </span>
            {request.category && (
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold">
                {request.category}
              </span>
            )}
            {showUrgencyBadge && (
              <span
                className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#FEF9EC] text-[#C47E00] text-[10px] font-bold"
                style={{ animation: 'nu-soft-pulse 4s ease-in-out infinite' }}
              >
                🔥 {request.contactCount} vendeurs ont déjà contacté
              </span>
            )}
          </div>

          <h3 className="text-[15px] font-black tracking-tight text-[#111318] leading-tight line-clamp-1">
            {request.title}
          </h3>
          {request.description && (
            <p className="mt-1 text-[12px] text-[#5C6370] leading-snug line-clamp-2">
              {request.description}
            </p>
          )}
        </div>

        {/* Thumbnail */}
        {request.imageUrl && (
          <div
            className="w-14 h-14 rounded-xl shrink-0 overflow-hidden border border-black/[0.06] bg-[#F0F1F4]"
          >
            <img
              src={request.imageUrl}
              alt=""
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className="w-full h-full object-cover transition-opacity duration-300"
              style={{ opacity: imgLoaded ? 1 : 0 }}
            />
          </div>
        )}
      </div>

      {/* Meta pills */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2.5 mb-3">
        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold whitespace-nowrap">
          📍 {flag} {location}
        </span>
        {budget && (
          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold whitespace-nowrap">
            💰 {budget}
          </span>
        )}
        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold whitespace-nowrap">
          ⏱ {formatTimeAgo(request.createdAt)}
        </span>
        <ExpiryPill days={remaining} />
      </div>

      {/* Contact zone */}
      {locked ? (
        <div>
          <div className="h-10 px-3 rounded-xl bg-[#F7F8FA] border border-black/[0.06] flex items-center gap-2">
            <Lock size={14} strokeWidth={2} className="text-[#9EA5B0] shrink-0" />
            <span
              className="text-[13px] text-[#9EA5B0] tracking-[0.18em] select-none"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', filter: 'blur(0.4px)' }}
            >
              +257 ██ ██ ██ ██
            </span>
          </div>
          <button
            onClick={onUpgrade}
            className="mt-2 w-full h-9 rounded-xl inline-flex items-center justify-center gap-1.5 text-[#C47E00] text-[12px] font-extrabold active:scale-[0.98] transition"
            style={{ border: '1.5px solid rgba(245,200,66,0.6)', background: 'transparent' }}
          >
            <Zap size={13} strokeWidth={2.5} />
            Passer au plan PRO
          </button>
        </div>
      ) : (
        <button
          onClick={() => onContact(request)}
          className="w-full h-11 rounded-xl border-0 inline-flex items-center justify-center gap-2 bg-[#25D366] text-white text-[14px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: '0 4px 12px rgba(37,211,102,0.35)' }}
        >
          <MessageCircle size={16} strokeWidth={2.25} fill="#fff" />
          Contacter sur WhatsApp
        </button>
      )}
    </article>
  );
}

/* ─────────────────────── LOADING SKELETON ──────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 pt-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-black/[0.06] p-3.5 animate-pulse">
          <div className="flex gap-2.5 mb-3">
            <div className="flex-1">
              <div className="flex gap-1.5 mb-2">
                <div className="h-5 w-20 bg-[#F0F1F4] rounded-full" />
                <div className="h-5 w-16 bg-[#F0F1F4] rounded-full" />
              </div>
              <div className="h-4 bg-[#F0F1F4] rounded-full w-3/4 mb-2" />
              <div className="h-3 bg-[#F0F1F4] rounded-full w-full mb-1" />
              <div className="h-3 bg-[#F0F1F4] rounded-full w-4/5" />
            </div>
            <div className="w-14 h-14 bg-[#F0F1F4] rounded-xl shrink-0" />
          </div>
          <div className="flex gap-2 mb-3">
            {[28, 22, 18, 20].map((w, j) => (
              <div key={j} className={`h-5 w-${w} bg-[#F0F1F4] rounded-full`} />
            ))}
          </div>
          <div className="h-11 bg-[#F0F1F4] rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── EMPTY STATE ──────────────────────── */

function EmptyState({
  onClearFilters, onRefresh, hasFilters,
}: {
  onClearFilters: () => void;
  onRefresh: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="pt-16 pb-10 px-6 flex flex-col items-center text-center">
      <div
        className="relative w-40 h-40 rounded-full bg-[#FEF9EC] flex items-center justify-center"
        style={{ boxShadow: '0 0 0 24px rgba(245,200,66,0.08)' }}
      >
        <Search size={64} strokeWidth={1.5} className="text-[#F5C842]" />
        <span
          className="absolute top-7 right-8 w-[26px] h-[26px] rounded-full bg-[#F5C842] text-[#111318] inline-flex items-center justify-center text-[15px] font-black"
          style={{ boxShadow: '0 2px 8px rgba(245,200,66,0.5)', border: '2.5px solid #F7F8FA' }}
        >
          ?
        </span>
        {/* floating dots */}
        <span className="absolute -top-1.5 left-4 w-2 h-2 rounded-full bg-[#F5C842]"
          style={{ animation: 'nu-float-dot 2.4s ease-in-out 0s infinite' }} />
        <span className="absolute top-3.5 -right-1 w-1.5 h-1.5 rounded-full bg-[#B07410]"
          style={{ animation: 'nu-float-dot 2.4s ease-in-out 0.4s infinite' }} />
        <span className="absolute bottom-1.5 -left-1.5 w-[7px] h-[7px] rounded-full bg-[#F5C842]"
          style={{ animation: 'nu-float-dot 2.4s ease-in-out 0.8s infinite' }} />
      </div>

      <h2 className="mt-6 text-[20px] font-black tracking-tight text-[#111318] leading-tight">
        {hasFilters ? 'Aucune demande pour ce filtre' : 'Aucune demande active'}
      </h2>
      <p className="mt-2 text-[13px] text-[#5C6370] leading-relaxed max-w-[280px]">
        {hasFilters
          ? 'Essayez un autre pays ou une autre catégorie. Les nouvelles demandes arrivent chaque heure.'
          : 'Revenez bientôt — de nouveaux acheteurs postent des demandes chaque heure.'}
      </p>

      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="mt-6 w-full max-w-[280px] h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          <X size={16} strokeWidth={2.5} />
          Effacer les filtres
        </button>
      )}

      <button
        onClick={onRefresh}
        className="mt-3.5 inline-flex items-center gap-1.5 text-[#C47E00] text-[12px] font-extrabold underline underline-offset-[3px] bg-transparent border-0 cursor-pointer"
      >
        <RefreshCw size={12} strokeWidth={2.5} />
        Actualiser
      </button>
    </div>
  );
}

/* ─────────────────────── MAIN ──────────────────────── */

export const BuyerRequestsPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Access guard
  if (!currentUser || (currentUser.role !== 'seller' && currentUser.role !== 'admin')) {
    navigate('/login');
    return null;
  }

  const eligible = canContactBuyer(currentUser.sellerDetails);

  // Filters state
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Draft state inside filter sheet (applied on tap "Appliquer")
  const [draftCountry, setDraftCountry] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Data state
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<unknown>(null);

  const openSheet = () => {
    setDraftCountry(filterCountry);
    setDraftCity(filterCity);
    setDraftCategory(filterCategory);
    setSheetOpen(true);
  };

  const applySheet = () => {
    setFilterCountry(draftCountry);
    setFilterCity(draftCity);
    setFilterCategory(draftCategory);
    setSheetOpen(false);
  };

  const clearFilters = () => {
    setFilterCountry('');
    setFilterCity('');
    setFilterCategory('');
  };

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const filters: BuyerRequestFilters = { status: 'active' };
      if (filterCountry)  filters.countryId  = filterCountry;
      if (filterCity)     filters.city        = filterCity;
      if (filterCategory) filters.category    = filterCategory;

      const lastDoc = reset ? undefined : (lastDocRef.current as Parameters<typeof getBuyerRequests>[1] ?? undefined);
      const { requests: newReqs, lastDoc: newLast } = await getBuyerRequests(filters, lastDoc);

      setRequests(prev => reset ? newReqs : [...prev, ...newReqs]);
      lastDocRef.current = newLast;
      setHasMore(newReqs.length === PAGE_SIZE);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [filterCountry, filterCity, filterCategory]);

  useEffect(() => {
    lastDocRef.current = null;
    load(true);
  }, [filterCountry, filterCity, filterCategory]);

  const handleContact = async (request: BuyerRequest) => {
    await trackWhatsAppContact(request.id, currentUser.id, currentUser.sellerDetails?.tierLabel || 'free');
    const msg = encodeURIComponent(
      t('requests.whatsappMessage', { title: request.title, city: request.city })
    );
    const phone = request.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  // Active chips for the filter bar
  const activeChips: Array<{ label: string; onRemove: () => void }> = [];
  if (filterCountry) activeChips.push({
    label: `${countryFlag(filterCountry)} ${countryName(filterCountry)}`,
    onRemove: () => { setFilterCountry(''); setFilterCity(''); },
  });
  if (filterCity) activeChips.push({
    label: filterCity,
    onRemove: () => setFilterCity(''),
  });
  if (filterCategory) activeChips.push({
    label: filterCategory,
    onRemove: () => setFilterCategory(''),
  });

  const activeFilterCount = activeChips.length;
  const hasFilters = activeFilterCount > 0;
  const activeRequests = requests.filter(r => r.expiresAt > Date.now());

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="relative min-h-screen bg-[#F7F8FA] flex flex-col">
        <PageHeader count={activeRequests.length} onBack={() => navigate(-1)} />

        <FilterChipsBar
          chips={activeChips}
          activeCount={activeFilterCount}
          onOpenSheet={openSheet}
        />

        {/* Plan gate banner — vendeurs non éligibles */}
        {!eligible && activeRequests.length > 0 && (
          <PlanGateBanner onUpgrade={() => navigate('/plans')} />
        )}

        {/* Results count */}
        {!loading && activeRequests.length > 0 && (
          <div className="px-3.5 py-2 text-[12px] font-medium text-[#9EA5B0]">
            {activeRequests.length} demande{activeRequests.length > 1 ? 's' : ''} active{activeRequests.length > 1 ? 's' : ''} · triées par date
          </div>
        )}

        {/* Body */}
        {loading && requests.length === 0 ? (
          <LoadingSkeleton />
        ) : activeRequests.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
            onRefresh={() => load(true)}
          />
        ) : (
          <div className="flex flex-col gap-3 px-3 py-3 pb-8">
            {activeRequests.map((r, i) => (
              <RequestCard
                key={r.id}
                request={r}
                locked={!eligible}
                index={i}
                eligible={eligible}
                onContact={handleContact}
                onUpgrade={() => navigate('/plans')}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="mt-2 self-center h-10 px-6 rounded-full bg-white border border-black/[0.08] text-[#5C6370] text-[13px] font-semibold active:scale-95 transition disabled:opacity-50"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-[#9EA5B0] border-t-transparent rounded-full animate-spin inline-block" />
                  : 'Charger plus'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter bottom sheet */}
      <FilterSheet
        open={sheetOpen}
        country={draftCountry}
        city={draftCity}
        category={draftCategory}
        onCountry={setDraftCountry}
        onCity={setDraftCity}
        onCategory={setDraftCategory}
        onApply={applySheet}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
};

export default BuyerRequestsPage;
