/**
 * NUNULIA — Search Page (redesign)
 *
 * Route: /search  (Navbar is hidden — this page owns its own header)
 *
 * Design tokens: light-only — zero dark: classes
 *   bg app       #F7F8FA
 *   cta gold     #F5C842
 *   gold text    #C47E00
 *   card         #FFFFFF
 *   primary      #111318
 *   secondary    #5C6370
 *   muted        #9EA5B0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Mic, X, SlidersHorizontal, ChevronDown,
  Heart, Star, Eye, BadgeCheck, Clock, Flame,
} from 'lucide-react';
import { useSearch, SearchFiltersState } from '../hooks/useSearch';
import { useActiveCountries } from '../hooks/useActiveCountries';
import { useCategories } from '../hooks/useCategories';
import { getOptimizedUrl } from '../services/cloudinary';
import { INITIAL_COUNTRIES } from '../constants';
import { Product, Category } from '../types';
import { Country } from '../types';
import {
  addToSearchHistory, getSearchHistory, getPopularSearches,
  removeFromSearchHistory, getLocalSuggestions,
} from '../services/popular-searches';
import { algoliaAutocompleteProducts } from '../services/algolia';
import { trackSearchClick } from '../services/algolia-insights';
import { useAppContext } from '../contexts/AppContext';
import { JeChercheBlock } from '../components/JeCherche/JeChercheBlock';

/* ─────────────────────────────────────────────────────────────────────────────
 * UTILS
 * ───────────────────────────────────────────────────────────────────────────── */

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
};
const decodeEntities = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, m => HTML_ENTITIES[m] ?? m);

function renderHighlight(html: string): React.ReactNode {
  const parts = html.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return parts.map((part, i) => {
    if (part.startsWith('<mark>') && part.endsWith('</mark>')) {
      return <mark key={i}>{decodeEntities(part.slice(6, -7))}</mark>;
    }
    return <React.Fragment key={i}>{decodeEntities(part)}</React.Fragment>;
  });
}

function getCountryFlag(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.flag || '';
}

function getCountryCurrency(countryId?: string): string {
  if (!countryId) return '';
  return INITIAL_COUNTRIES.find(c => c.id === countryId)?.currency || '';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ACTIVE FILTER CHIPS
 * ───────────────────────────────────────────────────────────────────────────── */

interface ActiveChip {
  id: string;
  label: string;
}

function buildActiveChips(
  filters: SearchFiltersState,
  categories: Category[],
  countries: Country[],
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (filters.category) {
    const cat = categories.find(c => c.id === filters.category);
    chips.push({ id: 'category', label: cat?.name || filters.category });
  }
  if (filters.country) {
    const c = countries.find(x => x.id === filters.country);
    const flag = getCountryFlag(filters.country);
    chips.push({ id: 'country', label: `${flag} ${c?.name || filters.country}` });
  }
  if (filters.province) {
    chips.push({ id: 'province', label: filters.province });
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const min = filters.minPrice?.toLocaleString('fr-FR') ?? '0';
    const max = filters.maxPrice?.toLocaleString('fr-FR') ?? '…';
    chips.push({ id: 'price', label: `${min} – ${max}` });
  }
  if (filters.isNew) {
    chips.push({ id: 'isNew', label: 'Nouveautés' });
  }
  return chips;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SKELETON CARD
 * ───────────────────────────────────────────────────────────────────────────── */

const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl overflow-hidden animate-pulse"
    style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ paddingTop: '75%', background: '#F0F1F4', position: 'relative' }} />
    <div className="p-2.5 space-y-2">
      <div className="h-3 rounded-full bg-[#F0F1F4] w-4/5" />
      <div className="h-3 rounded-full bg-[#F0F1F4] w-3/5" />
      <div className="h-3 rounded-full bg-[#E4E6EA] w-2/5 mt-1" />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * STICKY HEADER
 * ───────────────────────────────────────────────────────────────────────────── */

interface StickyHeaderProps {
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  activeChips: ActiveChip[];
  onRemoveChip: (id: string) => void;
}

const StickyHeader: React.FC<StickyHeaderProps> = ({
  inputValue, onInputChange, onSubmit, onBack,
  focused, onFocus, onBlur, inputRef,
  activeChips, onRemoveChip,
}) => (
  <header
    className="sticky top-0 z-30 bg-white"
    style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
  >
    <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 pt-3 pb-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour"
        className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full active:bg-black/5 transition-colors"
      >
        <ArrowLeft size={22} color="#111318" strokeWidth={2.25} />
      </button>

      <div
        className="flex-1 flex items-center gap-2 h-11 rounded-full px-4"
        style={{
          background: focused ? '#FFFFFF' : '#F0F1F4',
          border: focused ? '1.5px solid #F5C842' : '1.5px solid transparent',
          boxShadow: focused ? '0 0 0 4px rgba(245,200,66,0.18)' : 'none',
          transition: 'all 180ms ease-out',
        }}
      >
        <Search size={18} color={focused ? '#C47E00' : '#9EA5B0'} strokeWidth={2.25} />
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Rechercher sur Nunulia…"
          className="flex-1 bg-transparent border-none outline-none text-[14px] font-medium text-[#111318] placeholder:text-[#9EA5B0] min-w-0"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => onInputChange('')}
            aria-label="Effacer"
            className="w-6 h-6 rounded-full flex items-center justify-center bg-[#E4E6EA] flex-shrink-0"
          >
            <X size={12} color="#5C6370" strokeWidth={2.5} />
          </button>
        )}
        <button
          type="button"
          aria-label="Recherche vocale"
          className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 active:bg-black/5"
        >
          <Mic size={17} color="#C47E00" strokeWidth={2.25} />
        </button>
      </div>
    </form>

    {activeChips.length > 0 && (
      <div
        className="flex gap-1.5 overflow-x-auto pl-3 pr-3 pb-2.5"
        style={{ scrollbarWidth: 'none' }}
      >
        {activeChips.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onRemoveChip(chip.id)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full cursor-pointer transition-colors"
            style={{ background: '#FEF3C2', border: '1px solid rgba(245,200,66,0.45)' }}
          >
            <span className="text-[12px] font-bold text-[#7A4F00] tracking-tight">{chip.label}</span>
            <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#F5C842' }}>
              <X size={9} color="#111318" strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
    )}
  </header>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * SORT / FILTER BAR
 * ───────────────────────────────────────────────────────────────────────────── */

const SORT_LABELS: Record<SearchFiltersState['sortBy'], string> = {
  relevance: 'Pertinence',
  newest: 'Plus récent',
  price_asc: 'Prix ↑',
  price_desc: 'Prix ↓',
};

interface SortFilterBarProps {
  count: number;
  filterCount: number;
  sortBy: SearchFiltersState['sortBy'];
  onOpenFilters: () => void;
  onCycleSort: () => void;
}

const SortFilterBar: React.FC<SortFilterBarProps> = ({
  count, filterCount, sortBy, onOpenFilters, onCycleSort,
}) => (
  <div className="flex items-center justify-between px-3 pt-3 pb-2.5">
    <p className="text-[14px] font-black text-[#111318] tracking-tight m-0">
      <span style={{ color: '#C47E00' }}>{count.toLocaleString('fr-FR')}</span>
      <span className="text-[#5C6370] font-bold ml-1">résultats</span>
    </p>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCycleSort}
        className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-white cursor-pointer active:scale-95 transition-transform"
        style={{ border: '1px solid rgba(0,0,0,0.08)' }}
      >
        <span className="text-[12px] font-bold text-[#111318] tracking-tight">
          {SORT_LABELS[sortBy]}
        </span>
        <ChevronDown size={14} color="#5C6370" strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={onOpenFilters}
        className="relative flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white cursor-pointer active:scale-95 transition-transform"
        style={{ border: '1px solid rgba(0,0,0,0.08)' }}
      >
        <SlidersHorizontal size={14} color="#C47E00" strokeWidth={2.5} />
        <span className="text-[12px] font-bold text-[#111318] tracking-tight">Filtres</span>
        {filterCount > 0 && (
          <span
            className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center text-[10px] font-black text-[#111318]"
            style={{ background: '#F5C842' }}
          >
            {filterCount}
          </span>
        )}
      </button>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * SEARCH RESULT CARD
 * ───────────────────────────────────────────────────────────────────────────── */

const SearchResultCard: React.FC<{
  product: Product;
  highlight?: Record<string, string>;
  onClick: () => void;
  index?: number;
}> = ({ product, highlight, onClick, index = 0 }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [liked, setLiked] = useState(false);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isNew = product.createdAt > thirtyDaysAgo;
  const currency = product.currency || getCountryCurrency(product.countryId);
  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;
  const animDelay = Math.min((index % 20) * 45, 450);
  const stars = Math.min(5, Math.max(0, Math.round(product.rating || 0)));
  const views = product.views || 0;

  // Badge: promo > sponsored/boosted > new
  let badgeBg = '';
  let badgeColor = '';
  let badgeLabel = '';
  if (discount) {
    badgeBg = '#EF4444'; badgeColor = '#FFFFFF'; badgeLabel = `-${discount}%`;
  } else if (product.isSponsored || product.isBoosted) {
    badgeBg = '#F5C842'; badgeColor = '#111318'; badgeLabel = 'TOP';
  } else if (isNew) {
    badgeBg = '#10B981'; badgeColor = '#FFFFFF'; badgeLabel = 'NOUVEAU';
  }

  const sellerInitial = (product.seller?.name?.[0] || '?').toUpperCase();

  return (
    <article
      onClick={onClick}
      className="flex flex-col bg-white overflow-hidden cursor-pointer transition-transform active:scale-[0.98]"
      style={{
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        animationDelay: `${animDelay}ms`,
      }}
    >
      {/* Image — 4:3 */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          paddingTop: '75%',
          background: 'linear-gradient(135deg, #F0F1F4 0%, #E4E6EA 100%)',
          borderRadius: '16px 16px 0 0',
        }}
      >
        {product.images?.[0] ? (
          <img
            src={getOptimizedUrl(product.images[0], 320)}
            alt={product.title}
            onLoad={() => setImgLoaded(true)}
            loading={index < 6 ? 'eager' : 'lazy'}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style={{ opacity: imgLoaded ? 1 : 0 }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#9EA5B0] text-3xl">
            📦
          </div>
        )}

        {/* Badge TL */}
        {badgeLabel && (
          <span
            className="absolute top-2 left-2 px-2 py-1 rounded-md text-[9px] font-black tracking-wider leading-none"
            style={{ background: badgeBg, color: badgeColor, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
          >
            {badgeLabel}
          </span>
        )}

        {/* Heart TR */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setLiked(l => !l); }}
          aria-label="Favori"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center border-none transition-transform active:scale-90"
          style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
        >
          <Heart
            size={15}
            color={liked ? '#EF4444' : '#5C6370'}
            fill={liked ? '#EF4444' : 'none'}
            strokeWidth={2}
          />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col px-2.5 py-2.5 gap-1.5">
        {/* Price */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15px] font-black tracking-tight leading-none" style={{ color: '#C47E00' }}>
            {product.price?.toLocaleString('fr-FR')}&nbsp;{currency}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] font-medium text-[#9EA5B0] line-through leading-none">
              {product.originalPrice.toLocaleString('fr-FR')}&nbsp;{currency}
            </span>
          )}
        </div>

        {/* Title */}
        <p
          className="text-[12px] font-semibold text-[#111318] leading-snug overflow-hidden m-0 [&>mark]:bg-amber-200/60 [&>mark]:text-amber-900 [&>mark]:rounded-sm"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: 32,
          }}
        >
          {highlight?.title ? renderHighlight(highlight.title) : product.title}
        </p>

        {/* Seller */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {product.seller?.avatar ? (
            <img
              src={product.seller.avatar}
              alt=""
              className="w-4 h-4 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
              style={{ background: '#C47E00' }}>
              {sellerInitial}
            </div>
          )}
          <span className="text-[10px] font-medium text-[#5C6370] truncate min-w-0 flex-1">
            {product.seller?.name || '—'}
          </span>
          {product.seller?.isVerified && (
            <BadgeCheck size={11} color="#10B981" fill="#10B981" strokeWidth={2.5} />
          )}
        </div>

        {/* Footer — rating + views */}
        <div
          className="flex items-center justify-between mt-1 pt-1.5"
          style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-center gap-0.5">
            <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={0} />
            <span className="text-[10px] font-bold text-[#111318]">{stars > 0 ? stars : '—'}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Eye size={11} color="#9EA5B0" strokeWidth={2} />
            <span className="text-[10px] font-medium text-[#9EA5B0]">{formatViews(views)}</span>
          </div>
        </div>
      </div>
    </article>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * SHEET SECTION + TOGGLE + DUAL RANGE SLIDER
 * ───────────────────────────────────────────────────────────────────────────── */

const SheetSection: React.FC<{ title?: string; badge?: string; children: React.ReactNode }> = ({
  title, badge, children,
}) => (
  <section className="py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
    {title && (
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-black text-[#111318] tracking-tight m-0">{title}</h4>
        {badge && <span className="text-[11px] font-bold" style={{ color: '#C47E00' }}>{badge}</span>}
      </div>
    )}
    {children}
  </section>
);

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className="relative w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200"
    style={{ background: value ? '#F5C842' : '#D8DBE0' }}
  >
    <span
      className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200"
      style={{ left: value ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
    />
  </button>
);

const DualRangeSlider: React.FC<{
  min: number; max: number; step: number;
  minValue: number; maxValue: number;
  onChange: (lo: number, hi: number) => void;
}> = ({ min, max, step, minValue, maxValue, onChange }) => {
  const lowPct = ((minValue - min) / (max - min)) * 100;
  const highPct = ((maxValue - min) / (max - min)) * 100;

  return (
    <div className="relative pt-3 pb-2">
      <div className="relative h-1.5 rounded-full" style={{ background: '#E4E6EA' }}>
        <div
          className="absolute h-full rounded-full"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%`, background: '#F5C842' }}
        />
      </div>

      <input
        type="range" min={min} max={max} step={step} value={minValue}
        onChange={e => onChange(Math.min(Number(e.target.value), maxValue - step), maxValue)}
        className="dual-range-input" style={{ zIndex: 2 }}
      />
      <input
        type="range" min={min} max={max} step={step} value={maxValue}
        onChange={e => onChange(minValue, Math.max(Number(e.target.value), minValue + step))}
        className="dual-range-input" style={{ zIndex: 3 }}
      />

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] font-bold text-[#5C6370]">{minValue.toLocaleString('fr-FR')}</span>
        <span className="text-[11px] font-bold text-[#5C6370]">{maxValue.toLocaleString('fr-FR')}+</span>
      </div>

      <style>{`
        .dual-range-input {
          position: absolute; top: 6px; left: 0; right: 0;
          width: 100%; height: 24px;
          background: transparent;
          -webkit-appearance: none; appearance: none;
          pointer-events: none;
        }
        .dual-range-input::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 20px; height: 20px; border-radius: 50%;
          background: #F5C842; border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          cursor: pointer; pointer-events: auto;
        }
        .dual-range-input::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #F5C842; border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          cursor: pointer; pointer-events: auto;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * FILTER SHEET
 * ───────────────────────────────────────────────────────────────────────────── */

interface FilterSheetProps {
  open: boolean;
  filters: SearchFiltersState;
  onFilterChange: <K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => void;
  onReset: () => void;
  onClose: () => void;
  resultsCount: number;
  countries: Country[];
  categories: Category[];
  verifiedOnly: boolean;
  onVerifiedChange: (v: boolean) => void;
}

const FilterSheet: React.FC<FilterSheetProps> = ({
  open, filters, onFilterChange, onReset, onClose,
  resultsCount, countries, categories, verifiedOnly, onVerifiedChange,
}) => {
  if (!open) return null;

  // Local price state so slider doesn't fire Algolia on every drag
  const [localMin, setLocalMin] = useState(filters.minPrice ?? 0);
  const [localMax, setLocalMax] = useState(filters.maxPrice ?? 500000);

  const handleApply = () => {
    onFilterChange('minPrice', localMin === 0 ? null : localMin);
    onFilterChange('maxPrice', localMax === 500000 ? null : localMax);
    onClose();
  };

  const handleReset = () => {
    setLocalMin(0);
    setLocalMax(500000);
    onReset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'rgba(17,19,24,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white flex flex-col"
        style={{
          borderRadius: '20px 20px 0 0',
          maxHeight: '88%',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
          animation: 'slideUp 280ms cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {/* Handle */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(0,0,0,0.15)' }} />
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-[18px] font-black text-[#111318] tracking-tight m-0">Filtres</h3>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F0F1F4] border-none cursor-pointer active:scale-90 transition-transform"
          >
            <X size={16} color="#111318" strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ scrollbarWidth: 'thin' }}>
          {/* Catégorie */}
          <SheetSection title="Catégorie">
            <div className="flex flex-wrap gap-1.5">
              {[{ id: null, name: 'Tout' }, ...categories].map(cat => {
                const active = filters.category === (cat.id ?? null);
                return (
                  <button
                    key={cat.id ?? '__all__'}
                    type="button"
                    onClick={() => onFilterChange('category', cat.id ?? null)}
                    className="h-8 px-3 rounded-full border-none cursor-pointer transition-all"
                    style={{
                      background: active ? '#F5C842' : '#FFFFFF',
                      border: active ? 'none' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: active ? '0 2px 6px rgba(245,200,66,0.35)' : 'none',
                    }}
                  >
                    <span
                      className="text-[12px] tracking-tight"
                      style={{ color: active ? '#111318' : '#5C6370', fontWeight: active ? 800 : 600 }}
                    >
                      {('icon' in cat && cat.icon) ? `${cat.icon} ` : ''}{cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetSection>

          {/* Prix */}
          <SheetSection
            title="Prix"
            badge={`${localMin.toLocaleString('fr-FR')} – ${localMax.toLocaleString('fr-FR')}`}
          >
            <DualRangeSlider
              min={0} max={500000} step={5000}
              minValue={localMin} maxValue={localMax}
              onChange={(lo, hi) => { setLocalMin(lo); setLocalMax(hi); }}
            />
          </SheetSection>

          {/* Localisation */}
          <SheetSection title="Localisation">
            <div className="flex gap-2 flex-wrap">
              {countries.map(c => {
                const active = filters.country === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onFilterChange('country', active ? null : c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl border-none cursor-pointer transition-all min-w-[80px]"
                    style={{
                      background: active ? '#FFF8E0' : '#FFFFFF',
                      border: active ? '1.5px solid #F5C842' : '1.5px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    <span className="text-[18px]">{c.flag}</span>
                    <span
                      className="text-[12px] tracking-tight"
                      style={{ color: active ? '#111318' : '#5C6370', fontWeight: active ? 800 : 600 }}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetSection>

          {/* Vendeur vérifié */}
          <SheetSection>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-[#111318] tracking-tight">Vendeur vérifié uniquement</span>
                <span className="text-[11px] text-[#9EA5B0] mt-0.5">Boutiques authentifiées par Nunulia</span>
              </div>
              <Toggle value={verifiedOnly} onChange={onVerifiedChange} />
            </div>
          </SheetSection>

          {/* Type / condition */}
          <SheetSection title="Type">
            <div className="flex p-1 rounded-full" style={{ background: '#F0F1F4' }}>
              {(['Tout', 'Nouveau'] as const).map(opt => {
                const isNewOpt = opt === 'Nouveau';
                const active = isNewOpt ? filters.isNew : !filters.isNew;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onFilterChange('isNew', isNewOpt)}
                    className="flex-1 h-9 rounded-full border-none cursor-pointer transition-all"
                    style={{
                      background: active ? '#FFFFFF' : 'transparent',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                    }}
                  >
                    <span
                      className="text-[12px] tracking-tight"
                      style={{ color: active ? '#111318' : '#5C6370', fontWeight: active ? 800 : 600 }}
                    >
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetSection>

          <div className="h-2" />
        </div>

        {/* Fixed bottom */}
        <div
          className="flex gap-2 px-4 py-3"
          style={{
            background: '#FFFFFF',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button" onClick={handleReset}
            className="h-12 px-5 rounded-full bg-transparent cursor-pointer active:scale-95 transition-transform"
            style={{ border: '1.5px solid rgba(0,0,0,0.10)' }}
          >
            <span className="text-[14px] font-bold text-[#111318] tracking-tight">Réinitialiser</span>
          </button>
          <button
            type="button" onClick={handleApply}
            className="flex-1 h-12 rounded-full border-none cursor-pointer active:scale-[0.98] transition-transform"
            style={{ background: '#F5C842', boxShadow: '0 4px 14px rgba(245,200,66,0.45)' }}
          >
            <span className="text-[14px] font-black text-[#111318] tracking-tight">
              Voir {resultsCount.toLocaleString('fr-FR')} résultats
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * SUGGESTIONS PANEL
 * ───────────────────────────────────────────────────────────────────────────── */

interface SuggestionsPanelProps {
  recent: string[];
  trending: string[];
  onSelect: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearAll: () => void;
  // Autocomplete list (typed suggestions)
  typedSuggestions?: string[];
  autoProducts?: Product[];
  inputValue?: string;
}

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  recent, trending, onSelect, onRemoveRecent, onClearAll,
  typedSuggestions = [], autoProducts = [], inputValue = '',
}) => {
  // If user has typed something, show autocomplete list
  if (inputValue.trim().length >= 1 && (typedSuggestions.length > 0 || autoProducts.length > 0)) {
    return (
      <div className="px-4 pt-2 pb-12 bg-white">
        {typedSuggestions.map(term => (
          <button
            key={term}
            type="button"
            onClick={() => onSelect(term)}
            className="flex items-center gap-3 w-full py-3 px-1 rounded-lg active:bg-black/5 transition-colors text-left"
          >
            <Search size={15} color="#9EA5B0" strokeWidth={2} />
            <span className="flex-1 text-[14px] font-medium text-[#111318]">{term}</span>
          </button>
        ))}
        {autoProducts.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.title)}
            className="flex items-center gap-3 w-full py-2.5 px-1 rounded-lg active:bg-black/5 transition-colors text-left"
          >
            {p.images?.[0] ? (
              <img
                src={getOptimizedUrl(p.images[0], 48)}
                alt=""
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#F0F1F4] flex-shrink-0" />
            )}
            <span className="flex-1 text-[13px] font-medium text-[#111318] line-clamp-1">{p.title}</span>
            <span className="text-[12px] font-bold flex-shrink-0" style={{ color: '#C47E00' }}>
              {p.price?.toLocaleString('fr-FR')}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Otherwise show recent + trending
  return (
    <div className="px-4 pt-4 pb-12">
      {recent.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-black uppercase tracking-[.08em] m-0" style={{ color: '#9EA5B0' }}>
              Recherches récentes
            </h4>
            <button
              type="button" onClick={onClearAll}
              className="bg-transparent border-none cursor-pointer p-1 -mr-1"
            >
              <span className="text-[11px] font-bold" style={{ color: '#C47E00' }}>Tout effacer</span>
            </button>
          </div>

          <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
            {recent.map(term => (
              <li
                key={term}
                className="flex items-center gap-3 py-2.5 px-1 cursor-pointer rounded-lg active:bg-black/5 transition-colors"
                onClick={() => onSelect(term)}
              >
                <Clock size={16} color="#9EA5B0" strokeWidth={2} />
                <span className="flex-1 text-[14px] font-medium text-[#111318]">{term}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onRemoveRecent(term); }}
                  aria-label={`Supprimer ${term}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer active:bg-black/5"
                >
                  <X size={14} color="#9EA5B0" strokeWidth={2.25} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Flame size={14} color="#EF4444" fill="#EF4444" strokeWidth={0} />
            <h4 className="text-[10px] font-black uppercase tracking-[.08em] m-0" style={{ color: '#9EA5B0' }}>
              Tendances
            </h4>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {trending.map((tag, i) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelect(tag)}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white cursor-pointer transition-transform active:scale-95"
                style={{ border: '1px solid rgba(0,0,0,0.08)' }}
              >
                {i < 3 && <span className="text-[11px]">🔥</span>}
                <span className="text-[12px] font-semibold text-[#111318] tracking-tight">{tag}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * EMPTY STATE
 * ───────────────────────────────────────────────────────────────────────────── */

const EmptyState: React.FC<{ query: string; onPostRequest?: () => void }> = ({ query, onPostRequest }) => (
  <div className="flex flex-col items-center text-center px-6 pt-12 pb-8">
    <div
      className="relative w-32 h-32 rounded-full flex items-center justify-center mb-6"
      style={{
        background: 'radial-gradient(circle at 30% 30%, #FEF3C2 0%, #FCE7A6 45%, #F5C842 100%)',
        boxShadow: '0 12px 32px rgba(245,200,66,0.30)',
      }}
    >
      <span className="absolute w-2 h-2 rounded-full" style={{ top: 8, right: 16, background: '#F5C842', boxShadow: '0 0 0 4px rgba(245,200,66,0.18)' }} />
      <span className="absolute w-1.5 h-1.5 rounded-full" style={{ bottom: 12, left: 14, background: '#C47E00' }} />
      <Search size={48} color="#7A4F00" strokeWidth={2.25} />
    </div>

    <h2 className="text-[20px] font-black text-[#111318] tracking-tight m-0 mb-2">
      Aucun résultat pour<br />
      <span style={{ color: '#C47E00' }}>«&nbsp;{query}&nbsp;»</span>
    </h2>
    <p className="text-[13px] font-medium text-[#5C6370] leading-relaxed max-w-[260px] m-0 mb-7">
      Essayez avec d'autres mots ou postez une demande — les vendeurs vous contacteront.
    </p>

    <button
      type="button"
      onClick={onPostRequest}
      className="flex items-center gap-2 h-12 px-6 rounded-full border-none cursor-pointer active:scale-[0.97] transition-transform"
      style={{ background: '#F5C842', boxShadow: '0 6px 18px rgba(245,200,66,0.50)' }}
    >
      <span className="text-[16px]">🔍</span>
      <span className="text-[14px] font-black text-[#111318] tracking-tight">Poster une demande Je Cherche</span>
    </button>

    <p className="text-[11px] font-medium text-[#9EA5B0] mt-5 max-w-[260px]">
      Plus de <span className="font-bold text-[#5C6370]">4 200 vendeurs</span> reçoivent votre demande sur WhatsApp.
    </p>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * MAIN SEARCH PAGE
 * ───────────────────────────────────────────────────────────────────────────── */

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { countries } = useActiveCountries();
  const { categories } = useCategories();
  const { activeCountry } = useAppContext();

  const {
    query, filters, results, isLoading, hasMore,
    totalCount, highlightResults, queryID,
    setQuery, setFilter, resetFilters, loadMore,
  } = useSearch();

  // Local input state — decoupled from Algolia
  const [inputValue, setInputValue] = useState(query);
  const [focused, setFocused] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Suggestions
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getSearchHistory().slice(0, 5));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [autoProducts, setAutoProducts] = useState<Product[]>([]);
  const autocompleteAbort = useRef(0);
  const activeCountryRef = useRef(activeCountry);
  const hasUserTyped = useRef(false);

  useEffect(() => { activeCountryRef.current = activeCountry; }, [activeCountry]);

  // Focus input on mount only if no pre-filled query (avoid mobile keyboard pop on nav)
  useEffect(() => {
    if (!query) {
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autocomplete
  useEffect(() => {
    const requestId = ++autocompleteAbort.current;
    if (inputValue.length < 1) {
      setSuggestions([]);
      setAutoProducts([]);
      return;
    }
    const local = getLocalSuggestions(inputValue);
    setSuggestions(local);

    if (inputValue.length >= 2 && hasUserTyped.current) {
      const timer = setTimeout(async () => {
        try {
          const products = await algoliaAutocompleteProducts(inputValue, activeCountryRef.current || undefined);
          if (autocompleteAbort.current !== requestId) return;
          setAutoProducts(products);
        } catch { /* silent */ }
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setAutoProducts([]);
    }
  }, [inputValue]);

  const handleSelectSuggestion = useCallback((term: string) => {
    setInputValue(term);
    setQuery(term);
    setFocused(false);
    addToSearchHistory(term);
    setRecentSearches(getSearchHistory().slice(0, 5));
    setSuggestions([]);
    setAutoProducts([]);
  }, [setQuery]);

  const handleRemoveRecent = useCallback((term: string) => {
    removeFromSearchHistory(term);
    setRecentSearches(prev => prev.filter(t => t !== term));
  }, []);

  const handleClearAllRecent = useCallback(() => {
    recentSearches.forEach(t => removeFromSearchHistory(t));
    setRecentSearches([]);
  }, [recentSearches]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isLoading) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const handleProductClick = useCallback((product: Product, position: number) => {
    if (query.trim()) addToSearchHistory(query.trim());
    trackSearchClick(product.id, queryID, position);
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  }, [navigate, query, queryID]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const term = inputValue.trim();
    if (term) {
      addToSearchHistory(term);
      setRecentSearches(getSearchHistory().slice(0, 5));
      setQuery(term);
    }
    setFocused(false);
    setSuggestions([]);
    setAutoProducts([]);
  }, [inputValue, setQuery]);

  // Active filter chips
  const activeChips = buildActiveChips(filters, categories, countries);
  const activeFilterCount = activeChips.length;

  const handleRemoveChip = useCallback((id: string) => {
    if (id === 'category') setFilter('category', null);
    else if (id === 'country') { setFilter('country', null); setFilter('province', null); }
    else if (id === 'province') setFilter('province', null);
    else if (id === 'price') { setFilter('minPrice', null); setFilter('maxPrice', null); }
    else if (id === 'isNew') setFilter('isNew', false);
  }, [setFilter]);

  // Sort cycle
  const SORT_CYCLE: SearchFiltersState['sortBy'][] = ['relevance', 'newest', 'price_asc', 'price_desc'];
  const handleCycleSort = useCallback(() => {
    const idx = SORT_CYCLE.indexOf(filters.sortBy);
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    setFilter('sortBy', next);
  }, [filters.sortBy, setFilter]);

  const openJeChercheForm = () => window.dispatchEvent(new CustomEvent('open-je-cherche'));

  // Show suggestions panel when: focused with no typed text, OR typing suggestions exist
  const showSuggestionsPanel = focused && (
    inputValue.trim().length === 0 ||
    suggestions.length > 0 ||
    autoProducts.length > 0
  );

  return (
    <div className="relative flex flex-col min-h-screen bg-[#F7F8FA]">
      <StickyHeader
        inputValue={inputValue}
        onInputChange={v => { setInputValue(v); hasUserTyped.current = true; }}
        onSubmit={handleSearch}
        onBack={() => navigate(-1)}
        focused={focused}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay to allow click events on suggestions to fire first
          setTimeout(() => setFocused(false), 150);
        }}
        inputRef={inputRef}
        activeChips={focused ? [] : activeChips}
        onRemoveChip={handleRemoveChip}
      />

      <main className="flex-1">
        {showSuggestionsPanel ? (
          <SuggestionsPanel
            recent={recentSearches}
            trending={getPopularSearches()}
            onSelect={handleSelectSuggestion}
            onRemoveRecent={handleRemoveRecent}
            onClearAll={handleClearAllRecent}
            typedSuggestions={suggestions}
            autoProducts={autoProducts}
            inputValue={inputValue}
          />
        ) : isLoading && results.length === 0 ? (
          <div className="grid grid-cols-2 gap-2 px-3 pt-3 pb-6">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : results.length > 0 ? (
          <>
            <SortFilterBar
              count={totalCount}
              filterCount={activeFilterCount}
              sortBy={filters.sortBy}
              onOpenFilters={() => setShowFilterSheet(true)}
              onCycleSort={handleCycleSort}
            />
            <div className="grid grid-cols-2 gap-2 px-3 pb-6">
              {results.map((product, index) => (
                <SearchResultCard
                  key={product.id}
                  product={product}
                  highlight={highlightResults.get(product.id)}
                  onClick={() => handleProductClick(product, index)}
                  index={index}
                />
              ))}
            </div>

            {/* Je Cherche — few results */}
            {!isLoading && results.length < 4 && query.trim() && (
              <JeChercheBlock query={query.trim()} mode="few_results" onOpen={openJeChercheForm} />
            )}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-8">
                {isLoading && (
                  <div className="w-6 h-6 border-2 border-[#F5C842] border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            )}
          </>
        ) : query.trim() ? (
          <>
            <EmptyState
              query={query}
              onPostRequest={() => window.dispatchEvent(new CustomEvent('open-je-cherche'))}
            />
            <JeChercheBlock query={query.trim()} mode="no_results" onOpen={openJeChercheForm} />
          </>
        ) : (
          /* Empty query — show recent/popular */
          <SuggestionsPanel
            recent={recentSearches}
            trending={getPopularSearches()}
            onSelect={handleSelectSuggestion}
            onRemoveRecent={handleRemoveRecent}
            onClearAll={handleClearAllRecent}
          />
        )}
      </main>

      <FilterSheet
        open={showFilterSheet}
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        onClose={() => setShowFilterSheet(false)}
        resultsCount={totalCount}
        countries={countries}
        categories={categories}
        verifiedOnly={verifiedOnly}
        onVerifiedChange={setVerifiedOnly}
      />
    </div>
  );
};

export default SearchPage;
