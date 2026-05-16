import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, SlidersHorizontal, Bell, Heart, ChevronRight, ChevronDown,
  Home as HomeIcon, Plus, User as UserIcon, BadgeCheck, X, Store,
} from 'lucide-react';
import { Product, User } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import { BannerCarousel, Banner } from '../components/BannerCarousel';
import { JeChercheInlineCard } from '../components/home/JeChercheInlineCard';
import { FeaturedVendorCard } from '../components/home/FeaturedVendorCard';
import {
  getProducts, getProductsFromCache, getBanners, checkIsLikedBatch,
  getBoostedProducts, getProductsByIds, getSellerAllProducts, toggleLikeProduct,
} from '../services/firebase';
import { getOptimizedUrl } from '../services/cloudinary';
import { getRecentlyViewedIds, getPopular, getPersonalizedRecommendations } from '../services/recommendations';
import { getFeedFromIDB, saveFeedToIDB, pruneStaleFeeds } from '../services/idb';
import { pruneStaleSearches } from '../services/searchIdb';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { prefetchProductImages } from '../utils/prefetch';
import { useAppContext } from '../contexts/AppContext';
import { useCategories } from '../hooks/useCategories';
import { useGeolocation, haversineDistance, formatDistance } from '../hooks/useGeolocation';
import { useActiveCountries } from '../hooks/useActiveCountries';

// ── Module-level cache ──────────────────────────────────────────────────────
interface HomeCache {
  key: string;
  products: Product[];
  lastDoc: any;
  hasMore: boolean;
  banners: Banner[];
  likedMap: Record<string, boolean>;
  boostedProducts: Product[];
  ts: number;
}
let _homeCache: HomeCache | null = null;
const CACHE_TTL = 2 * 60 * 1000;
let _lastCategory = 'all';
let _lastWholesale = false;

interface RailsCache {
  userId: string | null;
  recentlyViewed: Product[];
  popularProducts: Product[];
  recommended: Product[];
  sellerLatest: Product[];
  ts: number;
}
let _railsCache: RailsCache | null = null;
const RAILS_CACHE_TTL = 5 * 60 * 1000;

const JE_CHERCHE_AT = 6;
const VENDOR_EVERY = 10;

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CountrySheet
// ─────────────────────────────────────────────────────────────────────────────

function CountrySheet({
  open, onClose, countries, activeCountry, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  countries: Array<{ id: string; name: string; flag?: string; isActive: boolean }>;
  activeCountry: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl overflow-hidden"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '75vh',
        }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div
          className="flex items-center justify-between px-5 pb-4"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <h2 className="text-[17px] font-black text-[#111318]">Choisir un pays</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{ background: '#F0F1F4' }}
          >
            <X size={15} color="#5C6370" strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(75vh - 90px)' }}>
          <button
            onClick={() => { onSelect(''); onClose(); }}
            className="w-full flex items-center gap-3 px-5 py-3.5 border-none cursor-pointer text-left transition-colors active:bg-gray-50"
            style={{ background: activeCountry === '' ? 'rgba(245,200,66,0.08)' : 'transparent' }}
          >
            <span className="text-2xl">🌍</span>
            <span className="flex-1 text-[15px] font-semibold text-[#111318]">Tous les pays</span>
            {activeCountry === '' && (
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#F5C842' }}>
                <span className="text-[9px] font-black text-[#111318]">✓</span>
              </div>
            )}
          </button>
          {countries.filter(c => c.isActive).map(c => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.id); onClose(); }}
              className="w-full flex items-center gap-3 px-5 py-3.5 border-none cursor-pointer text-left transition-colors active:bg-gray-50"
              style={{ background: activeCountry === c.id ? 'rgba(245,200,66,0.08)' : 'transparent' }}
            >
              <span className="text-2xl">{c.flag || '🏳️'}</span>
              <span className="flex-1 text-[15px] font-semibold text-[#111318]">{c.name}</span>
              {activeCountry === c.id && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#F5C842' }}>
                  <span className="text-[9px] font-black text-[#111318]">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — StickyHeader
// ─────────────────────────────────────────────────────────────────────────────

function StickyHeader({
  countryFlag, countryName, onCountryClick,
}: {
  countryFlag: string;
  countryName: string;
  onCountryClick: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 bg-white"
      style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center gap-2 px-4 h-14">
        <h1
          className="text-[23px] font-black tracking-tight leading-none"
          style={{
            fontFamily: "'Inter Display', Inter, sans-serif",
            background: 'linear-gradient(135deg,#C47E00 0%,#B07410 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.04em',
          }}
        >
          NUNULIA
        </h1>

        <button
          type="button"
          onClick={onCountryClick}
          className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white cursor-pointer active:bg-gray-50 transition-colors"
          style={{ border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        >
          <span className="text-[13px] leading-none">{countryFlag}</span>
          <span className="text-[11px] font-bold text-[#5C6370] tracking-tight">{countryName}</span>
          <ChevronDown size={10} color="#9EA5B0" strokeWidth={2.5} />
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer active:bg-gray-100 transition-colors"
        >
          <Bell size={20} color="#111318" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — StickySearchBar
// ─────────────────────────────────────────────────────────────────────────────

function StickySearchBar({ onClick }: { onClick: () => void }) {
  return (
    <div className="sticky top-14 z-20 bg-white px-4 pt-1.5 pb-3">
      <div
        className="flex items-center gap-2.5 h-11 rounded-full px-4 cursor-pointer active:scale-[0.99] transition-transform"
        style={{ background: '#F0F1F4' }}
        onClick={onClick}
      >
        <Search size={17} color="#9EA5B0" strokeWidth={2} />
        <span className="flex-1 text-[13px] font-medium text-[#9EA5B0] select-none">
          Rechercher sur Nunulia…
        </span>
        <div
          className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(196,126,0,0.12)' }}
        >
          <SlidersHorizontal size={14} color="#C47E00" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CategoryChips
// ─────────────────────────────────────────────────────────────────────────────

function CategoryChips({
  categories, activeCategory, setActiveCategory,
  nearbyMode, setNearbyMode, geoLoading, requestLocation,
  wholesaleMode, setWholesaleMode, t,
}: {
  categories: Array<{ id: string; name: string; icon?: string }>;
  activeCategory: string;
  setActiveCategory: (id: string) => void;
  nearbyMode: boolean;
  setNearbyMode: (v: boolean) => void;
  geoLoading: boolean;
  requestLocation: () => void;
  wholesaleMode: boolean;
  setWholesaleMode: (v: boolean) => void;
  t: (key: string) => string;
}) {
  const chip = (
    active: boolean,
    bg: string,
    shadow: string,
  ) => ({
    background: active ? bg : '#FFFFFF',
    border: active ? 'none' : '1px solid rgba(0,0,0,0.08)',
    boxShadow: active ? shadow : '0 1px 3px rgba(0,0,0,0.05)',
    color: active ? (bg === '#F5C842' ? '#111318' : '#FFFFFF') : '#5C6370',
  });

  return (
    <div className="overflow-x-auto pt-3 pb-2 px-4" style={{ scrollbarWidth: 'none' }}>
      <style>{`.nu-chips::-webkit-scrollbar { display: none }`}</style>
      <div className="nu-chips flex gap-2">
        <button
          onClick={() => {
            if (!nearbyMode) { requestLocation(); setNearbyMode(true); setActiveCategory('all'); }
            else setNearbyMode(false);
          }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold border-none"
          style={chip(nearbyMode, '#10B981', '0 2px 8px rgba(16,185,129,0.35)')}
        >
          {geoLoading
            ? <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
            : <span className="text-[13px]">📍</span>}
          {t('home.nearMe')}
        </button>

        <button
          onClick={() => { setWholesaleMode(!wholesaleMode); if (!wholesaleMode) setActiveCategory('all'); }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold border-none"
          style={chip(wholesaleMode, '#6366F1', '0 2px 8px rgba(99,102,241,0.35)')}
        >
          <span className="text-[13px]">🏭</span>
          {t('home.wholesale')}
        </button>

        <button
          onClick={() => { setActiveCategory('all'); setNearbyMode(false); }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold border-none"
          style={chip(activeCategory === 'all' && !nearbyMode, '#F5C842', '0 2px 8px rgba(245,200,66,0.35)')}
        >
          <span className="text-[13px]">🛍️</span>
          {t('home.all')}
        </button>

        {categories.map(cat => {
          const active = activeCategory === cat.id && !nearbyMode;
          return (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setNearbyMode(false); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full cursor-pointer transition-all duration-150 whitespace-nowrap text-[12px] font-extrabold border-none"
              style={chip(active, '#F5C842', '0 2px 8px rgba(245,200,66,0.35)')}
            >
              {cat.icon && <span className="text-[13px]">{cat.icon}</span>}
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — SectionHeader
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  emoji, title, cta, onCta,
}: { emoji: string; title: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-6 pb-3">
      <h3
        className="text-[17px] font-black text-[#111318] tracking-tight"
        style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
      >
        <span className="mr-1.5">{emoji}</span>{title}
      </h3>
      {cta && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="flex items-center gap-0.5 bg-transparent border-none cursor-pointer p-1"
        >
          <span className="text-[12px] font-bold" style={{ color: '#C47E00' }}>{cta}</span>
          <ChevronRight size={13} color="#C47E00" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrendingCard (horizontal rail — real Product data)
// ─────────────────────────────────────────────────────────────────────────────

function TrendingCard({
  product, liked, onToggleLike, onClick,
}: {
  product: Product;
  liked: boolean;
  onToggleLike: () => void;
  onClick: () => void;
}) {
  const imgUrl = product.images?.[0]
    ? getOptimizedUrl(product.images[0], 320, 'auto', 'auto', true)
    : '';
  const sellerName = product.seller?.sellerDetails?.shopName || product.seller?.name || '';
  const priceStr = typeof product.price === 'number'
    ? product.price.toLocaleString('fr-FR')
    : String(product.price ?? '');
  const currency = product.currency || '';

  return (
    <div
      className="flex-shrink-0 w-[152px] flex flex-col rounded-2xl overflow-hidden bg-white cursor-pointer active:scale-[0.98] transition-transform"
      style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      onClick={onClick}
    >
      <div className="relative w-full" style={{ paddingTop: '75%' }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={product.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#F0F1F4' }}>
            <Store size={26} color="#9EA5B0" strokeWidth={1.5} />
          </div>
        )}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleLike(); }}
          aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center border-none cursor-pointer backdrop-blur-sm transition-all active:scale-90"
          style={{ background: liked ? 'rgba(239,68,68,0.30)' : 'rgba(0,0,0,0.28)' }}
        >
          <Heart size={13} color={liked ? '#ef4444' : '#fff'} fill={liked ? '#ef4444' : 'none'} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
        <span className="text-[14px] font-black leading-none tracking-tight" style={{ color: '#C47E00' }}>
          {priceStr}{currency ? ` ${currency}` : ''}
        </span>
        <p
          className="text-[12px] font-semibold text-[#111318] leading-snug m-0 overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}
        >
          {product.title}
        </p>
        {sellerName && (
          <span className="text-[10px] font-medium text-[#9EA5B0] mt-0.5 truncate">{sellerName}</span>
        )}
      </div>
    </div>
  );
}

function TrendingRail({
  products, likedMap, onProductClick, onToggleLike, loading,
}: {
  products: Product[];
  likedMap: Record<string, boolean>;
  onProductClick: (p: Product) => void;
  onToggleLike: (productId: string, currentlyLiked: boolean) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[152px] h-[192px] rounded-2xl animate-pulse" style={{ background: '#EAECF0' }} />
        ))}
      </div>
    );
  }
  if (products.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
      {products.map(p => (
        <TrendingCard
          key={p.id}
          product={p}
          liked={!!likedMap[p.id]}
          onClick={() => onProductClick(p)}
          onToggleLike={() => onToggleLike(p.id, !!likedMap[p.id])}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — VendorCard + VendorStrip (real User data)
// ─────────────────────────────────────────────────────────────────────────────

function VendorCard({ seller, onClick }: { seller: User; onClick: () => void }) {
  const name = seller.sellerDetails?.shopName || seller.name || '';
  const imgUrl = seller.avatar ? getOptimizedUrl(seller.avatar, 112, 'auto', 'auto', true) : '';
  const isVerified = seller.isVerified;

  return (
    <div
      className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[88px] p-3 rounded-xl bg-white cursor-pointer active:scale-[0.97] transition-transform"
      style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      onClick={onClick}
    >
      <div className="relative">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={name}
            className="w-14 h-14 rounded-full object-cover"
            style={{ border: '2.5px solid #F5C842' }}
            loading="lazy"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ border: '2.5px solid #F5C842', background: 'rgba(245,200,66,0.15)' }}
          >
            <Store size={22} color="#C47E00" strokeWidth={1.5} />
          </div>
        )}
        {isVerified && (
          <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
            <BadgeCheck size={14} color="#0EA5E9" fill="#fff" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <span className="text-[11px] font-bold text-[#111318] truncate max-w-full text-center leading-snug">{name}</span>
    </div>
  );
}

function VendorStrip({ vendors, navigate }: { vendors: User[]; navigate: (p: string) => void }) {
  if (vendors.length === 0) return null;
  return (
    <div className="flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
      {vendors.map(v => (
        <VendorCard
          key={v.id}
          seller={v}
          onClick={() => v.slug ? navigate(`/shop/${v.slug}`) : undefined}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — JeChercheCard
// ─────────────────────────────────────────────────────────────────────────────

function JeChercheCard({ onPost }: { onPost: () => void }) {
  return (
    <div className="px-4 pt-5">
      <div
        className="flex items-center gap-3.5 p-4 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg,#FFF8E7 0%,#FFF3D0 100%)',
          border: '1px solid rgba(245,200,66,0.3)',
          boxShadow: '0 4px 16px rgba(245,200,66,0.15)',
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(245,200,66,0.25)' }}
        >
          🔍
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-black text-[#111318] tracking-tight leading-tight m-0">
            Vous cherchez quelque chose&nbsp;?
          </h3>
          <p className="text-[11px] text-[#5C6370] leading-snug mt-0.5 m-0">
            Postez votre demande, les vendeurs vous contactent
          </p>
        </div>
        <button
          type="button"
          onClick={onPost}
          className="flex-shrink-0 px-3.5 py-2.5 rounded-full text-[11px] font-black text-[#111318] cursor-pointer border-none active:scale-95 transition-transform"
          style={{ background: '#F5C842', boxShadow: '0 2px 8px rgba(245,200,66,0.4)' }}
        >
          Poster
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ModeBanner (wholesale / nearby active)
// ─────────────────────────────────────────────────────────────────────────────

function ModeBanner({ mode, onDisable, t }: { mode: 'wholesale' | 'nearby'; onDisable: () => void; t: (k: string) => string }) {
  const n = mode === 'nearby';
  return (
    <div className="px-4 pt-2">
      <div
        className="rounded-xl p-3 flex items-center gap-2"
        style={{
          background: n ? 'rgba(16,185,129,0.07)' : 'rgba(99,102,241,0.07)',
          border: `1px solid ${n ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
        }}
      >
        <span className="text-base">{n ? '📍' : '🏭'}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-xs leading-tight ${n ? 'text-green-700' : 'text-indigo-700'}`}>
            {n ? t('home.nearbyActive') : t('home.wholesaleActive')}
          </p>
          <p className={`text-[10px] leading-tight ${n ? 'text-green-600/70' : 'text-indigo-600/70'}`}>
            {n ? t('home.nearbyHint') : t('home.wholesaleHint')}
          </p>
        </div>
        <button
          onClick={onDisable}
          className={`text-[10px] px-2 py-0.5 border rounded-lg flex-shrink-0 bg-transparent cursor-pointer ${n ? 'text-green-600/70 border-green-200' : 'text-indigo-600/70 border-indigo-200'}`}
        >
          {t('home.nearbyDisable')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — BottomNav (fixed, real routing)
// ─────────────────────────────────────────────────────────────────────────────

function BottomNav({ navigate, onSell }: { navigate: (p: string) => void; onSell: () => void }) {
  const tabs = [
    { id: 'home',      label: 'Accueil',  Icon: HomeIcon,  path: '/' },
    { id: 'search',    label: 'Chercher', Icon: Search,    path: '/search' },
    { id: 'sell',      label: 'Vendre',   Icon: Plus,      path: '' },
    { id: 'favorites', label: 'Favoris',  Icon: Heart,     path: '/favorites' },
    { id: 'profile',   label: 'Profil',   Icon: UserIcon,  path: '/profile' },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white"
      style={{
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch justify-around h-16 px-1">
        {tabs.map(({ id, label, Icon, path }) => {
          const isActive = id === 'home';
          const isCenter = id === 'sell';

          if (isCenter) {
            return (
              <button
                key={id}
                type="button"
                onClick={onSell}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center -mt-3.5"
                  style={{
                    background: 'linear-gradient(135deg,#F5C842 0%,#E8A800 100%)',
                    boxShadow: '0 4px 16px rgba(245,200,66,0.5)',
                  }}
                >
                  <Plus size={22} color="#111318" strokeWidth={3} />
                </div>
                <span className="text-[10px] font-bold text-[#111318]">{label}</span>
              </button>
            );
          }

          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
            >
              <Icon
                size={22}
                color={isActive ? '#C47E00' : '#9EA5B0'}
                strokeWidth={isActive ? 2.5 : 2}
                fill={(id as string) === 'favorites' && isActive ? '#C47E00' : 'none'}
              />
              <span
                className="text-[10px]"
                style={{ color: isActive ? '#C47E00' : '#9EA5B0', fontWeight: isActive ? 800 : 600 }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — Home
// ─────────────────────────────────────────────────────────────────────────────

export const Home: React.FC = () => {
  const { currentUser, activeCountry, setActiveCountry, handleSellerAccess } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  const cacheKey = (cat: string, country: string, wholesale: boolean) =>
    `${cat}|${country}|${wholesale}`;

  const [activeCategory, _setActiveCategory] = useState(_lastCategory);
  const [wholesaleMode, _setWholesaleMode] = useState(_lastWholesale);
  const setActiveCategory = (cat: string) => { _lastCategory = cat; _setActiveCategory(cat); };
  const setWholesaleMode = (v: boolean) => { _lastWholesale = v; _setWholesaleMode(v); };

  const currentKey = cacheKey(activeCategory, activeCountry, wholesaleMode);
  const cached = _homeCache?.key === currentKey ? _homeCache : null;
  const anyCached = _homeCache;

  const [products, setProducts] = useState<Product[]>(cached?.products || anyCached?.products || []);
  const { categories } = useCategories();
  const networkQuality = useNetworkQuality();
  const [loading, setLoading] = useState(!(cached || anyCached?.products?.length));
  const [lastDoc, setLastDoc] = useState<any>(cached?.lastDoc || null);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(cached?.banners || anyCached?.banners || []);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(cached?.likedMap || anyCached?.likedMap || {});
  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);

  const { countries } = useActiveCountries();

  const railsHydrate = _railsCache && _railsCache.userId === (currentUser?.id ?? null) ? _railsCache : null;
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(railsHydrate?.recentlyViewed ?? []);
  const [popularProducts, setPopularProducts] = useState<Product[]>(railsHydrate?.popularProducts ?? []);
  const [recommended, setRecommended] = useState<Product[]>(railsHydrate?.recommended ?? []);
  const [sellerLatest, setSellerLatest] = useState<Product[]>(railsHydrate?.sellerLatest ?? []);

  const [nearbyMode, setNearbyMode] = useState(false);
  const { position, loading: geoLoading, requestLocation } = useGeolocation();

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Country info for header
  const activeCountryData = countries.find(c => c.id === activeCountry);
  const countryFlag = activeCountryData?.flag || '🌍';
  const countryName = activeCountryData?.name || (activeCountry ? activeCountry : 'Tous pays');

  // Validate active country when countries list changes
  const countryIds = countries.map(c => c.id).join(',');
  useEffect(() => {
    if (countries.length > 0 && activeCountry && !countries.find(c => c.id === activeCountry)) {
      setActiveCountry('');
    }
  }, [countryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCountryReady = activeCountry === '' || (countries.length > 0 && !!countries.find(c => c.id === activeCountry));

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => { pruneStaleFeeds(); pruneStaleSearches(); }, { timeout: 10000 });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Three-phase loading: IDB → Firestore cache → Network ─────────────────
  useEffect(() => {
    if (!isCountryReady) return;
    const key = cacheKey(activeCategory, activeCountry, wholesaleMode);
    const hit = _homeCache?.key === key ? _homeCache : null;
    const isStale = hit && (Date.now() - hit.ts > CACHE_TTL);

    if (hit && !isStale) {
      setProducts(hit.products); setLastDoc(hit.lastDoc); setHasMore(hit.hasMore);
      setBanners(hit.banners); setLikedMap(hit.likedMap); setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
      return;
    }
    if (hit && isStale) {
      setProducts(hit.products); setLastDoc(hit.lastDoc); setHasMore(hit.hasMore);
      setBanners(hit.banners); setLikedMap(hit.likedMap); setBoostedProducts(hit.boostedProducts || []);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const loadData = async () => {
      if (!hit) {
        const idbSnap = await getFeedFromIDB(key);
        if (idbSnap && mountedRef.current) {
          setProducts(idbSnap.products); setBanners(idbSnap.banners);
          setBoostedProducts(idbSnap.boostedProducts || []);
          setLoading(false);
          prefetchProductImages(idbSnap.products.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []), networkQuality === 'slow');
        }
        if (!idbSnap) {
          try {
            const cachedProds = await getProductsFromCache(activeCategory, activeCountry || undefined, wholesaleMode || undefined);
            if (cachedProds.length > 0 && mountedRef.current) { setProducts(cachedProds); setLoading(false); }
          } catch { /* skeleton stays */ }
        }
      }

      const NETWORK_TIMEOUT_MS = 8000;
      const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
        Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error('network-timeout')), NETWORK_TIMEOUT_MS))]);

      try {
        const [{ products: fetchedProducts, lastDoc: newLastDoc }, fetchedBanners, fetchedBoosted] = await Promise.all([
          withTimeout(getProducts(activeCategory, undefined, undefined, undefined, activeCountry, wholesaleMode || undefined)),
          withTimeout(getBanners()),
          withTimeout(getBoostedProducts(activeCountry || undefined)),
        ]);
        if (!mountedRef.current) return;

        let newLikedMap: Record<string, boolean> = {};
        if (currentUser && fetchedProducts.length > 0) {
          try { newLikedMap = await checkIsLikedBatch(fetchedProducts.map(p => p.id), currentUser.id); } catch {}
        }
        if (!mountedRef.current) return;

        _homeCache = {
          key, products: fetchedProducts, lastDoc: newLastDoc, hasMore: newLastDoc !== null,
          banners: fetchedBanners as Banner[], likedMap: newLikedMap, boostedProducts: fetchedBoosted, ts: Date.now(),
        };
        saveFeedToIDB({ key, products: fetchedProducts, banners: fetchedBanners as Banner[], boostedProducts: fetchedBoosted, ts: Date.now() });
        setBoostedProducts(fetchedBoosted); setProducts(fetchedProducts); setBanners(fetchedBanners as Banner[]);
        setLastDoc(newLastDoc); setHasMore(newLastDoc !== null); setLikedMap(newLikedMap); setLoading(false);
        prefetchProductImages(fetchedProducts.slice(6).flatMap(p => p.images?.slice(0, 1) ?? []), networkQuality === 'slow');
      } catch {
        if (mountedRef.current) setLoading(false);
      }
    };
    loadData();
  }, [activeCategory, activeCountry, wholesaleMode, isCountryReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRailsCache = useCallback((patch: Partial<Omit<RailsCache, 'userId' | 'ts'>>) => {
    const uid = currentUser?.id ?? null;
    const base: RailsCache = _railsCache && _railsCache.userId === uid
      ? _railsCache
      : { userId: uid, recentlyViewed: [], popularProducts: [], recommended: [], sellerLatest: [], ts: Date.now() };
    _railsCache = { ...base, ...patch, userId: uid, ts: Date.now() };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isCountryReady) return;
    const isFresh = _railsCache && _railsCache.userId === (currentUser?.id ?? null) && Date.now() - _railsCache.ts < RAILS_CACHE_TTL && _railsCache.recentlyViewed.length > 0;
    if (isFresh) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await getRecentlyViewedIds(currentUser?.id ?? null, 12);
        if (cancelled || ids.length === 0) return;
        const prods = await getProductsByIds(ids);
        if (cancelled) return;
        const indexById = new Map(ids.map((id, i) => [id, i]));
        const ordered = [...prods].sort((a, b) => (indexById.get(a.id) ?? 99) - (indexById.get(b.id) ?? 99));
        setRecentlyViewed(ordered);
        updateRailsCache({ recentlyViewed: ordered });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, isCountryReady, updateRailsCache]);

  useEffect(() => {
    if (!isCountryReady) return;
    const isFresh = _railsCache && Date.now() - _railsCache.ts < RAILS_CACHE_TTL && _railsCache.popularProducts.length > 0;
    if (isFresh) return;
    let cancelled = false;
    (async () => {
      try {
        const prods = await getPopular(12);
        if (cancelled) return;
        setPopularProducts(prods);
        updateRailsCache({ popularProducts: prods });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isCountryReady, updateRailsCache]);

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'seller') { setSellerLatest([]); return; }
    const isFresh = _railsCache && _railsCache.userId === currentUser.id && Date.now() - _railsCache.ts < RAILS_CACHE_TTL && _railsCache.sellerLatest.length > 0;
    if (isFresh) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await getSellerAllProducts(currentUser.id);
        if (cancelled) return;
        const visible = all.filter(p => p.status === 'pending' || p.status === 'approved').sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
        setSellerLatest(visible);
        updateRailsCache({ sellerLatest: visible });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.role, updateRailsCache]);

  useEffect(() => {
    if (!isCountryReady || !currentUser?.id) { setRecommended([]); return; }
    const isFresh = _railsCache && _railsCache.userId === currentUser.id && Date.now() - _railsCache.ts < RAILS_CACHE_TTL && _railsCache.recommended.length > 0;
    if (isFresh) return;
    let cancelled = false;
    (async () => {
      try {
        const excludeIds = recentlyViewed.map(p => p.id);
        const prods = await getPersonalizedRecommendations(currentUser.id, excludeIds, 12);
        if (cancelled) return;
        setRecommended(prods);
        updateRailsCache({ recommended: prods });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, isCountryReady, recentlyViewed, updateRailsCache]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) return;
    setLoadingMore(true);
    const { products: more, lastDoc: newDoc } = await getProducts(activeCategory, lastDoc, undefined, undefined, activeCountry, wholesaleMode || undefined);
    setProducts(prev => [...prev, ...more]);
    setLastDoc(newDoc);
    setHasMore(newDoc !== null);
    setLoadingMore(false);
  }, [hasMore, loadingMore, lastDoc, activeCategory, activeCountry, wholesaleMode]);

  // Like toggle with optimistic update
  const handleToggleLike = useCallback(async (productId: string, currentlyLiked: boolean) => {
    if (!currentUser) { navigate('/login'); return; }
    const next = !currentlyLiked;
    setLikedMap(prev => ({ ...prev, [productId]: next }));
    if (_homeCache) _homeCache = { ..._homeCache, likedMap: { ..._homeCache.likedMap, [productId]: next } };
    try {
      await toggleLikeProduct(productId, currentUser.id);
    } catch {
      setLikedMap(prev => ({ ...prev, [productId]: currentlyLiked }));
      if (_homeCache) _homeCache = { ..._homeCache, likedMap: { ..._homeCache.likedMap, [productId]: currentlyLiked } };
    }
  }, [currentUser, navigate]);

  // Nearby distance sort
  const displayProducts = React.useMemo(() => {
    if (nearbyMode && position) {
      return [...products].map(p => {
        const gps = p.seller?.sellerDetails?.gps;
        const dist = gps ? haversineDistance(position.lat, position.lng, gps.lat, gps.lng) : 9999;
        return { ...p, _distance: dist };
      }).sort((a, b) => a._distance - b._distance);
    }
    return products;
  }, [products, nearbyMode, position]);

  // Featured vendors from feed
  const featuredVendors = React.useMemo(() => {
    const groups = new Map<string, { seller: User; products: Product[] }>();
    for (const p of displayProducts) {
      const s = p.seller;
      if (!s?.id || !s.slug || !s.isVerified) continue;
      const tier = s.verificationTier;
      if (tier !== 'identity' && tier !== 'shop') continue;
      const g = groups.get(s.id) || { seller: s, products: [] };
      g.products.push(p);
      groups.set(s.id, g);
    }
    return Array.from(groups.values()).filter(g => g.products.length >= 3).sort((a, b) => b.products.length - a.products.length);
  }, [displayProducts]);

  const trendingProducts = popularProducts.length > 0 ? popularProducts.slice(0, 8) : displayProducts.slice(0, 8);

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F8FA]">
      <CountrySheet
        open={countrySheetOpen}
        onClose={() => setCountrySheetOpen(false)}
        countries={countries}
        activeCountry={activeCountry}
        onSelect={id => { setActiveCountry(id); }}
      />

      <StickyHeader
        countryFlag={countryFlag}
        countryName={countryName}
        onCountryClick={() => setCountrySheetOpen(true)}
      />

      <StickySearchBar onClick={() => navigate('/search')} />

      <main className="flex-1 pb-24">
        <CategoryChips
          categories={categories}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          nearbyMode={nearbyMode}
          setNearbyMode={setNearbyMode}
          geoLoading={geoLoading}
          requestLocation={requestLocation}
          wholesaleMode={wholesaleMode}
          setWholesaleMode={setWholesaleMode}
          t={t}
        />

        {/* Banner Carousel */}
        <div className="px-4 pt-4">
          <BannerCarousel banners={banners.length > 0 ? banners : undefined} />
        </div>

        {/* Seller: mes derniers produits */}
        {currentUser?.role === 'seller' && sellerLatest.length > 0 && (
          <>
            <SectionHeader emoji="🏪" title={t('home.sections.yourLatest')} cta="Voir tout" onCta={() => navigate('/dashboard')} />
            <TrendingRail products={sellerLatest} likedMap={likedMap} onProductClick={onProductClick} onToggleLike={handleToggleLike} />
          </>
        )}

        {/* Boostés / Sponsorisés */}
        {boostedProducts.length > 0 && (
          <>
            <SectionHeader emoji="⚡" title={t('home.sections.sponsored')} />
            <TrendingRail products={boostedProducts} likedMap={likedMap} onProductClick={onProductClick} onToggleLike={handleToggleLike} />
          </>
        )}

        {/* Tendances */}
        {(popularProducts.length > 0 || (!loading && displayProducts.length > 0)) && (
          <>
            <SectionHeader emoji="🔥" title="Tendances" />
            <TrendingRail
              products={trendingProducts}
              likedMap={likedMap}
              onProductClick={onProductClick}
              onToggleLike={handleToggleLike}
              loading={loading && popularProducts.length === 0}
            />
          </>
        )}

        {/* Boutiques recommandées */}
        {featuredVendors.length > 0 && (
          <>
            <SectionHeader emoji="⭐" title="Boutiques recommandées" />
            <VendorStrip vendors={featuredVendors.map(g => g.seller)} navigate={navigate} />
          </>
        )}

        {/* Recommandé pour vous */}
        {currentUser && recommended.length >= 4 && (
          <>
            <SectionHeader emoji="✨" title={t('home.sections.recommended')} />
            <TrendingRail products={recommended.slice(0, 8)} likedMap={likedMap} onProductClick={onProductClick} onToggleLike={handleToggleLike} />
          </>
        )}

        {/* Vus récemment */}
        {recentlyViewed.length > 0 && (
          <>
            <SectionHeader emoji="🕐" title={t('home.sections.recentlyViewed')} />
            <TrendingRail products={recentlyViewed.slice(0, 8)} likedMap={likedMap} onProductClick={onProductClick} onToggleLike={handleToggleLike} />
          </>
        )}

        {/* Je Cherche CTA */}
        <JeChercheCard onPost={() => window.dispatchEvent(new CustomEvent('open-je-cherche'))} />

        {/* Mode banners */}
        {wholesaleMode && <ModeBanner mode="wholesale" onDisable={() => setWholesaleMode(false)} t={t} />}
        {nearbyMode && <ModeBanner mode="nearby" onDisable={() => setNearbyMode(false)} t={t} />}

        {/* Grille principale */}
        <SectionHeader
          emoji={wholesaleMode ? '🏭' : nearbyMode ? '📍' : '🛒'}
          title={wholesaleMode ? t('home.wholesale') : nearbyMode ? t('home.nearMe') : t('home.latestListings')}
        />
        <div className="px-3">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Array.from({ length: 10 }).map((_, n) => <ProductCardSkeleton key={n} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(() => {
                const items: React.ReactNode[] = [];
                let vendorCursor = 0;
                const usedSellerIds = new Set<string>();
                displayProducts.forEach((product: any, idx: number) => {
                  items.push(
                    <ProductCard
                      key={product.id}
                      product={product}
                      onClick={() => onProductClick(product)}
                      currentUserId={currentUser?.id || null}
                      initialLiked={likedMap[product.id]}
                      index={idx}
                      distanceLabel={nearbyMode && position && product._distance < 9999
                        ? `📍 ${formatDistance(product._distance)}` : undefined}
                    />
                  );
                  const pos = idx + 1;
                  if (pos === JE_CHERCHE_AT) items.push(<JeChercheInlineCard key="je-cherche-inline" />);
                  if (pos % VENDOR_EVERY === 0) {
                    while (vendorCursor < featuredVendors.length && usedSellerIds.has(featuredVendors[vendorCursor].seller.id)) vendorCursor++;
                    if (vendorCursor < featuredVendors.length) {
                      const v = featuredVendors[vendorCursor];
                      usedSellerIds.add(v.seller.id);
                      vendorCursor++;
                      items.push(<FeaturedVendorCard key={`fv-${v.seller.id}-${pos}`} seller={v.seller} products={v.products} />);
                    }
                  }
                });
                if (displayProducts.length === 0) {
                  items.push(
                    <div key="empty" className="col-span-full flex flex-col items-center justify-center py-14 gap-3">
                      <span className="text-5xl">📦</span>
                      <p className="text-[14px] font-semibold text-center" style={{ color: '#9EA5B0' }}>
                        {t('home.noProductsInCategory')}
                      </p>
                    </div>
                  );
                }
                return items;
              })()}
            </div>
          )}
        </div>

        {/* Charger plus */}
        {hasMore && !loading && (
          <div className="text-center pt-5 px-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full max-w-xs h-12 rounded-2xl text-[13px] font-bold text-[#5C6370] transition-colors disabled:opacity-50 bg-white cursor-pointer active:bg-gray-50"
              style={{ border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              {loadingMore ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-gray-200 border-t-[#C47E00] rounded-full animate-spin" />
                  Chargement…
                </span>
              ) : t('home.loadMore')}
            </button>
          </div>
        )}

        {/* Footer légal */}
        <div className="text-center py-6 mt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex items-center justify-center gap-3 text-xs" style={{ color: '#9EA5B0' }}>
            <Link to="/cgu" className="hover:underline transition-colors" style={{ color: 'inherit' }}>
              Conditions d'utilisation
            </Link>
            <span style={{ color: '#BCC1CA' }}>&middot;</span>
            <Link to="/politique-confidentialite" className="hover:underline transition-colors" style={{ color: 'inherit' }}>
              Confidentialité
            </Link>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: '#BCC1CA' }}>&copy; 2026 NUNULIA</p>
        </div>
      </main>

      <BottomNav navigate={navigate} onSell={handleSellerAccess} />
    </div>
  );
};

export default Home;
