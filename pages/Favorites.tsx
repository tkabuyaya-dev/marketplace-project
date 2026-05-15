import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Heart, Star, ChevronRight, TrendingDown,
  Trash2, Share2, Compass, Search, Check, MessageCircle,
} from 'lucide-react';
import { Product } from '../types';
import { getProductsByIds, toggleLikeProduct } from '../services/firebase';
import { db, collection, getDocs, query, where, COLLECTIONS } from '../services/firebase/constants';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';

/* ─────────────────────── TYPES ──────────────────────── */

interface FavItem extends Product { likedAt: number }
type SortKey = 'Récents' | 'Prix ↑' | 'Prix ↓' | 'Boutique';

const SORT_PILLS: SortKey[] = ['Récents', 'Prix ↑', 'Prix ↓', 'Boutique'];

/* ─────────────────────── UTILS ──────────────────────── */

const fmtPrice = (n: number, currency?: string) =>
  n.toLocaleString('fr-FR') + ' ' + (currency || 'BIF');

const discountPct = (original: number, current: number) =>
  Math.round((1 - current / original) * 100);

const buildWhatsAppUrl = (phone?: string) => {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
};

const sellerCity = (item: FavItem) =>
  item.seller.sellerDetails?.commune || item.seller.sellerDetails?.province || '';

/* ─────────────────────── KEYFRAMES ──────────────────────── */

const KEYFRAMES = `
@keyframes favHeartPop {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes favSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes favHeartGlow {
  0%, 100% { box-shadow: 0 12px 32px rgba(245,200,66,0.25); }
  50%      { box-shadow: 0 12px 36px rgba(245,200,66,0.40); }
}
@keyframes favDotFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
`;

/* ─────────────────────── STICKY HEADER ──────────────────────── */

function FavHeader({ count, sort, onSort, onBack }: {
  count: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onBack?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-black/5">
      <div
        className="flex items-center gap-2 pl-2 pr-3 pb-2.5"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
      >
        <button
          onClick={onBack}
          aria-label="Retour"
          className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-95 transition"
        >
          <ArrowLeft size={22} strokeWidth={2.25} className="text-[#111318]" />
        </button>

        <h1 className="flex-1 m-0 text-[18px] font-black text-[#111318] tracking-tight">
          Mes Favoris
        </h1>

        {count > 0 && (
          <span
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#F5C842]"
            style={{ boxShadow: '0 2px 6px rgba(245,200,66,0.40)' }}
          >
            <Heart size={12} fill="#111318" stroke="#111318" strokeWidth={0} />
            <span className="text-[13px] font-black text-[#111318] tracking-tight">{count}</span>
          </span>
        )}
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto px-3 pb-2.5"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {SORT_PILLS.map((s) => {
          const active = sort === s;
          return (
            <button
              key={s}
              onClick={() => onSort(s)}
              className={[
                'shrink-0 h-8 px-3.5 rounded-full transition-all duration-150',
                active
                  ? 'bg-[#F5C842] text-[#111318] font-extrabold'
                  : 'bg-white border border-black/[0.08] text-[#5C6370] font-semibold',
              ].join(' ')}
              style={{ boxShadow: active ? '0 2px 6px rgba(245,200,66,0.35)' : 'none' }}
            >
              <span className="text-[12px] tracking-tight">{s}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

/* ─────────────────────── CATEGORY CHIPS ──────────────────────── */

function CategoryChips({ active, categories, counts, onChange }: {
  active: string;
  categories: string[];
  counts: Record<string, number>;
  onChange: (c: string) => void;
}) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-3"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
      {['Tout', ...categories].map((c) => {
        const isActive = active === c;
        const count = counts[c];
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={[
              'shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full transition-all duration-150',
              isActive
                ? 'bg-[#F5C842] font-extrabold'
                : 'bg-white border border-black/[0.08] font-semibold',
            ].join(' ')}
            style={{ boxShadow: isActive ? '0 2px 6px rgba(245,200,66,0.35)' : 'none' }}
          >
            <span className="text-[12px] tracking-tight text-[#111318]">{c}</span>
            {typeof count === 'number' && (
              <span className={['text-[10px] font-bold', isActive ? 'text-[#7A4F00]' : 'text-[#9EA5B0]'].join(' ')}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────── FAV CARD ──────────────────────── */

interface FavCardProps {
  item: FavItem;
  onUnlike?: (id: string) => void;
  onContact?: (item: FavItem) => void;
  onCardClick?: (item: FavItem) => void;
  onEnterSelectionMode?: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function FavCard({
  item, onUnlike, onContact, onCardClick, onEnterSelectionMode,
  selectable = false, selected = false, onToggleSelect,
}: FavCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [popping, setPopping] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const image = item.images?.[0];
  const hasDiscount = item.originalPrice && item.originalPrice > item.price;
  const dropPct = hasDiscount ? discountPct(item.originalPrice!, item.price) : 0;

  const handleUnlike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopping(true);
    window.setTimeout(() => onUnlike?.(item.id), 250);
  };

  const handlePressStart = () => {
    if (selectable) return;
    pressTimer.current = setTimeout(() => {
      onEnterSelectionMode?.(item.id);
    }, 500);
  };

  const handlePressEnd = () => clearTimeout(pressTimer.current);

  return (
    <article
      onClick={selectable ? () => onToggleSelect?.(item.id) : () => onCardClick?.(item)}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchMove={handlePressEnd}
      className={[
        'relative flex flex-col bg-white rounded-2xl overflow-hidden cursor-pointer transition-shadow duration-150',
        selected ? 'border-2 border-[#F5C842]' : 'border border-black/[0.06]',
      ].join(' ')}
      style={{
        boxShadow: selected
          ? '0 4px 14px rgba(245,200,66,0.35)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Image — 4:3 */}
      <div className="relative w-full overflow-hidden bg-[#F0F1F4]" style={{ paddingTop: '75%' }}>
        {image && (
          <img
            src={image}
            alt={item.title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style={{ opacity: loaded ? 1 : 0 }}
          />
        )}

        {/* Price drop badge */}
        {hasDiscount && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-[#EF4444] text-white"
            style={{ boxShadow: '0 2px 6px rgba(239,68,68,0.40)', fontSize: 10, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1 }}
          >
            <TrendingDown size={10} strokeWidth={3} className="text-white" />
            −{dropPct}%
          </span>
        )}

        {/* Heart / selection check */}
        {selectable ? (
          <span
            className={[
              'absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center',
              selected ? 'bg-[#F5C842]' : 'bg-white/95 border-[1.5px] border-black/[0.08]',
            ].join(' ')}
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
          >
            {selected && <Check size={14} strokeWidth={3} className="text-[#111318]" />}
          </span>
        ) : (
          <button
            onClick={handleUnlike}
            aria-label="Retirer des favoris"
            className="absolute top-2 right-2 w-[30px] h-[30px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform"
            style={{
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              animation: popping ? 'favHeartPop 250ms ease-out' : undefined,
            }}
          >
            <Heart size={15} fill="#EF4444" stroke="#EF4444" strokeWidth={0} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col px-2.5 pt-2.5 pb-2.5 gap-1.5">
        {/* Price */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className="text-[15px] font-black text-[#C47E00] leading-none"
            style={{ letterSpacing: '-0.02em' }}
          >
            {fmtPrice(item.price, item.currency)}
          </span>
          {hasDiscount && (
            <span className="text-[10px] font-medium text-[#9EA5B0] line-through leading-none">
              {fmtPrice(item.originalPrice!, item.currency)}
            </span>
          )}
        </div>

        {/* Title */}
        <p
          className="text-[12px] font-semibold text-[#111318] m-0"
          style={{
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 32,
          }}
        >
          {item.title}
        </p>

        {/* Seller row */}
        <div className="flex items-center gap-1.5 mt-px">
          <img
            src={item.seller.avatar}
            alt=""
            className="w-4 h-4 rounded-full object-cover shrink-0"
          />
          <span className="text-[10px] font-medium text-[#5C6370] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {item.seller.sellerDetails?.shopName || item.seller.name}
          </span>
          {item.seller.isVerified && (
            <span className="flex items-center justify-center w-3 h-3 rounded-full bg-[#10B981] shrink-0">
              <Check size={8} strokeWidth={3.5} className="text-white" />
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-black/[0.05]">
          <div className="flex items-center gap-0.5">
            <Star size={11} fill="#F5C842" stroke="#F5C842" strokeWidth={0} />
            <span className="text-[10px] font-extrabold text-[#111318]">
              {item.rating.toFixed(1)}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onContact?.(item); }}
            aria-label="Contacter sur WhatsApp"
            className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[#25D366] active:scale-95 transition-transform"
            style={{ boxShadow: '0 1px 3px rgba(37,211,102,0.40)' }}
          >
            <MessageCircle size={10} fill="#fff" stroke="#fff" strokeWidth={0} />
            <span className="text-white font-extrabold" style={{ fontSize: 10, letterSpacing: '-0.01em' }}>
              Contacter
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────── BULK BAR ──────────────────────── */

function BulkBar({ count, onShare, onDelete, onCancel }: {
  count: number;
  onShare?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[35] px-3.5 pt-3 pb-[18px] bg-white flex items-center gap-2.5"
      style={{
        borderTop: '1.5px solid #F5C842',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.10)',
        animation: 'favSlideUp 280ms cubic-bezier(0.32,0.72,0,1) both',
        paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[14px] font-black text-[#111318] tracking-tight">
          {count} sélectionné{count > 1 ? 's' : ''}
        </span>
        <button
          onClick={onCancel}
          className="bg-transparent border-0 p-0 text-left mt-px cursor-pointer"
        >
          <span className="text-[11px] font-semibold text-[#5C6370]">Annuler</span>
        </button>
      </div>

      <button
        onClick={onShare}
        aria-label="Partager"
        className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white border-[1.5px] border-black/10 active:scale-95 transition-transform"
      >
        <Share2 size={15} strokeWidth={2.25} className="text-[#111318]" />
        <span className="text-[13px] font-extrabold text-[#111318] tracking-tight">Partager</span>
      </button>

      <button
        onClick={onDelete}
        aria-label="Supprimer"
        className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[#EF4444] active:scale-95 transition-transform"
        style={{ boxShadow: '0 4px 12px rgba(239,68,68,0.40)' }}
      >
        <Trash2 size={14} strokeWidth={2.5} className="text-white" />
        <span className="text-[13px] font-black text-white tracking-tight">Supprimer</span>
      </button>
    </div>
  );
}

/* ─────────────────────── SELLER GROUP ──────────────────────── */

function SellerGroup({ seller, items, onContact, onCardClick }: {
  seller: Product['seller'];
  items: FavItem[];
  onContact: (item: FavItem) => void;
  onCardClick: (item: FavItem) => void;
}) {
  const navigate = useNavigate();
  return (
    <section className="mb-[18px]">
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5">
        <div
          className="relative w-11 h-11 rounded-full shrink-0"
          style={{ padding: 2, background: 'linear-gradient(135deg,#F5C842 0%,#C47E00 100%)' }}
        >
          <img
            src={seller.avatar}
            alt=""
            className="w-full h-full rounded-full object-cover"
            style={{ border: '2px solid #FFFFFF' }}
          />
          {seller.isVerified && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#10B981] flex items-center justify-center"
              style={{ border: '2px solid #F7F8FA' }}
            >
              <Check size={8} strokeWidth={3.5} className="text-white" />
            </span>
          )}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[14px] font-black text-[#111318] tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
            {seller.sellerDetails?.shopName || seller.name}
          </span>
          <span className="text-[11px] font-medium text-[#5C6370]">
            {items.length} article{items.length > 1 ? 's' : ''}{sellerCity(items[0]) ? ` · ${sellerCity(items[0])}` : ''}
          </span>
        </div>

        <button
          aria-label={`Voir la boutique ${seller.name}`}
          onClick={() => navigate(`/shop/${seller.slug || seller.id}`)}
          className="inline-flex items-center gap-0.5 h-8 pl-2.5 pr-1.5 rounded-full bg-[#F0F1F4] active:scale-95 transition-transform"
        >
          <span className="text-[11px] font-bold text-[#111318]">Voir</span>
          <ChevronRight size={14} strokeWidth={2.5} className="text-[#111318]" />
        </button>
      </div>

      <div
        className="flex gap-2 overflow-x-auto px-3.5 pb-1"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {items.map((it) => (
          <div key={it.id} className="shrink-0 w-[170px]">
            <FavCard item={it} onContact={onContact} onCardClick={onCardClick} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── GROUPED VIEW ──────────────────────── */

function GroupedView({ items, onContact, onCardClick }: {
  items: FavItem[];
  onContact: (item: FavItem) => void;
  onCardClick: (item: FavItem) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, FavItem[]>();
    items.forEach((it) => {
      const key = it.seller.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <div className="pt-3.5 pb-24">
      {groups.map(([, list]) => (
        <SellerGroup
          key={list[0].seller.id}
          seller={list[0].seller}
          items={list}
          onContact={onContact}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}

/* ─────────────────────── EMPTY STATE ──────────────────────── */

function EmptyState({ onExplore, onJeCherche }: {
  onExplore?: () => void;
  onJeCherche?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center px-7 pt-14 pb-8">
      {/* Golden heart illustration */}
      <div className="relative w-[200px] h-[200px] flex items-center justify-center mb-7">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(245,200,66,0.32) 0%, rgba(245,200,66,0.10) 45%, rgba(245,200,66,0) 70%)',
          }}
        />
        <div
          className="absolute w-[148px] h-[148px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #FFF6D6 0%, #FCE7A6 45%, #F5C842 100%)',
            animation: 'favHeartGlow 3s ease-in-out infinite',
          }}
        />
        <svg
          width="78"
          height="78"
          viewBox="0 0 24 24"
          className="relative z-[2]"
          style={{ filter: 'drop-shadow(0 6px 14px rgba(196,126,0,0.45))' }}
        >
          <defs>
            <linearGradient id="favHeartGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FBDA6E" />
              <stop offset="55%" stopColor="#C47E00" />
              <stop offset="100%" stopColor="#8E5A00" />
            </linearGradient>
            <linearGradient id="favHeartHi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="url(#favHeartGrad)"
          />
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="url(#favHeartHi)"
          />
        </svg>

        {/* Floating dots */}
        <span className="absolute w-2.5 h-2.5 rounded-full bg-[#F5C842]"
          style={{ top: 18, right: 22, boxShadow: '0 0 0 6px rgba(245,200,66,0.18)', animation: 'favDotFloat 2.6s ease-in-out infinite' }} />
        <span className="absolute rounded-full bg-[#C47E00]"
          style={{ bottom: 30, left: 14, width: 7, height: 7, animation: 'favDotFloat 2.6s ease-in-out 0.6s infinite' }} />
        <span className="absolute rounded-full bg-[#F5C842]"
          style={{ top: 46, left: 8, width: 5, height: 5, animation: 'favDotFloat 2.6s ease-in-out 1.2s infinite' }} />
        <span className="absolute rounded-full"
          style={{ bottom: 18, right: 30, width: 6, height: 6, background: 'rgba(245,200,66,0.70)', animation: 'favDotFloat 2.6s ease-in-out 1.8s infinite' }} />
        <svg width="14" height="14" viewBox="0 0 24 24" className="absolute" style={{ top: 8, left: 60 }}>
          <path d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z" fill="#F5C842" />
        </svg>
      </div>

      <h2 className="text-[22px] font-black text-[#111318] m-0 mb-2" style={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        Aucun favori pour l'instant
      </h2>
      <p className="text-[13px] font-medium text-[#5C6370] m-0 mb-7" style={{ lineHeight: 1.55, maxWidth: 280 }}>
        Appuyez sur{' '}
        <span
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#FFE4E4] mx-0.5"
          style={{ verticalAlign: -4 }}
        >
          <Heart size={10} fill="#EF4444" stroke="#EF4444" strokeWidth={0} />
        </span>{' '}
        pour sauvegarder vos coups de cœur et les retrouver ici.
      </p>

      <button
        onClick={onExplore}
        className="flex items-center justify-center gap-2 w-full h-[50px] rounded-full bg-[#F5C842] active:scale-[0.98] transition-transform"
        style={{ maxWidth: 280, boxShadow: '0 6px 18px rgba(245,200,66,0.50)' }}
      >
        <Compass size={17} strokeWidth={2.5} className="text-[#111318]" />
        <span className="text-[15px] font-black text-[#111318] tracking-tight">Explorer le marché</span>
      </button>

      <button
        onClick={onJeCherche}
        className="mt-[18px] py-2 px-1 bg-transparent inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Search size={13} strokeWidth={2.5} className="text-[#C47E00]" />
        <span
          className="text-[13px] font-extrabold text-[#C47E00] tracking-tight underline"
          style={{ textUnderlineOffset: 3, textDecorationThickness: 1.5 }}
        >
          Poster une demande Je Cherche
        </span>
      </button>
    </div>
  );
}

/* ─────────────────────── LOADING SKELETON ──────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden border border-black/[0.06]">
          <div className="bg-[#F0F1F4] animate-pulse" style={{ paddingTop: '75%' }} />
          <div className="p-2.5 flex flex-col gap-2">
            <div className="h-3 bg-[#F0F1F4] rounded-full w-3/4 animate-pulse" />
            <div className="h-3 bg-[#F0F1F4] rounded-full w-full animate-pulse" />
            <div className="h-3 bg-[#F0F1F4] rounded-full w-1/2 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── MAIN ──────────────────────── */

export const Favorites: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [favItems, setFavItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('Récents');
  const [category, setCategory] = useState('Tout');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, COLLECTIONS.LIKES), where('userId', '==', currentUser.id))
        );
        if (cancelled) return;

        const entries = snap.docs.map((d) => ({
          productId: d.data().productId as string,
          likedAt: (d.data().createdAt?.toMillis?.() ?? Date.now()) as number,
        }));

        if (entries.length === 0) {
          setFavItems([]);
          setLoading(false);
          return;
        }

        const products = await getProductsByIds(entries.map((e) => e.productId));
        if (cancelled) return;

        const likedAtMap: Record<string, number> = {};
        entries.forEach((e) => { likedAtMap[e.productId] = e.likedAt; });

        setFavItems(products.map((p) => ({ ...p, likedAt: likedAtMap[p.id] ?? Date.now() })));
      } catch (err) {
        if (!cancelled) {
          console.error('[Favorites] load error:', err);
          toast(t('favorites.loadError'), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser, t, toast]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    favItems.forEach((p) => { if (p.category) seen.add(p.category); });
    return Array.from(seen).sort();
  }, [favItems]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Tout: favItems.length };
    favItems.forEach((p) => { c[p.category] = (c[p.category] || 0) + 1; });
    return c;
  }, [favItems]);

  const visible = useMemo(() => {
    let list = category === 'Tout' ? favItems : favItems.filter((p) => p.category === category);
    switch (sort) {
      case 'Prix ↑': return [...list].sort((a, b) => a.price - b.price);
      case 'Prix ↓': return [...list].sort((a, b) => b.price - a.price);
      case 'Boutique': return [...list].sort((a, b) => a.seller.name.localeCompare(b.seller.name));
      default: return [...list].sort((a, b) => b.likedAt - a.likedAt);
    }
  }, [favItems, category, sort]);

  const handleUnlike = useCallback(async (id: string) => {
    if (!currentUser) return;
    setFavItems((prev) => prev.filter((p) => p.id !== id));
    try {
      await toggleLikeProduct(id, currentUser.id);
    } catch (err) {
      console.error('[Favorites] unlike error:', err);
    }
  }, [currentUser]);

  const handleContact = useCallback((item: FavItem) => {
    const url = buildWhatsAppUrl(item.seller.whatsapp);
    if (url) window.open(url, '_blank', 'noopener');
  }, []);

  const handleCardClick = useCallback((item: FavItem) => {
    navigate(`/product/${item.slug || item.id}`, { state: { product: item } });
  }, [navigate]);

  const enterSelectionMode = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds([id]);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const bulkDelete = useCallback(async () => {
    if (!currentUser) return;
    const toDelete = [...selectedIds];
    setFavItems((prev) => prev.filter((p) => !toDelete.includes(p.id)));
    cancelSelection();
    await Promise.allSettled(toDelete.map((id) => toggleLikeProduct(id, currentUser.id)));
  }, [currentUser, selectedIds, cancelSelection]);

  const handleSort = useCallback((s: SortKey) => {
    setSort(s);
    if (s === 'Boutique') cancelSelection();
  }, [cancelSelection]);

  // Not logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-20 h-20 rounded-full bg-white border border-black/[0.08] flex items-center justify-center mb-6"
          style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
        >
          <Heart size={32} className="text-[#EF4444]" />
        </div>
        <h2 className="text-[20px] font-black text-[#111318] mb-2 tracking-tight">
          {t('favorites.loginRequired')}
        </h2>
        <p className="text-[14px] text-[#5C6370] mb-6 max-w-[280px]">
          {t('favorites.loginSubtitle')}
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-8 py-3 rounded-full bg-[#F5C842] text-[#111318] font-black text-[15px] tracking-tight active:scale-95 transition-transform"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          {t('favorites.loginBtn')}
        </button>
      </div>
    );
  }

  const isGrouped = sort === 'Boutique';

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="relative w-full min-h-screen bg-[#F7F8FA] flex flex-col">
        <FavHeader
          count={favItems.length}
          sort={sort}
          onSort={handleSort}
          onBack={() => navigate(-1)}
        />

        {loading ? (
          <LoadingSkeleton />
        ) : favItems.length === 0 ? (
          <EmptyState
            onExplore={() => navigate('/')}
            onJeCherche={() => window.dispatchEvent(new CustomEvent('open-je-cherche'))}
          />
        ) : (
          <>
            {!isGrouped && (
              <CategoryChips
                active={category}
                categories={categories}
                counts={counts}
                onChange={setCategory}
              />
            )}

            {isGrouped ? (
              <GroupedView
                items={visible}
                onContact={handleContact}
                onCardClick={handleCardClick}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 px-3 pb-24">
                {visible.map((item) => (
                  <FavCard
                    key={item.id}
                    item={item}
                    onUnlike={handleUnlike}
                    onContact={handleContact}
                    onCardClick={handleCardClick}
                    onEnterSelectionMode={enterSelectionMode}
                    selectable={selectionMode}
                    selected={selectedIds.includes(item.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {selectionMode && selectedIds.length > 0 && (
          <BulkBar
            count={selectedIds.length}
            onCancel={cancelSelection}
            onShare={() => {
              if (navigator.share) {
                navigator.share({ title: 'Mes favoris NUNULIA', url: window.location.href });
              }
            }}
            onDelete={bulkDelete}
          />
        )}
      </div>
    </>
  );
};

export default Favorites;
