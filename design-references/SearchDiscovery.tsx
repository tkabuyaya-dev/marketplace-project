/**
 * SearchDiscovery.tsx
 * Nunulia — Page recherche & découverte (marketplace PWA mobile-first)
 *
 * Route : /search ou /search?q=…
 *
 * Public : Burundi 🇧🇮 / RDC 🇨🇩 / Rwanda 🇷🇼 — bilingue FR par défaut
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (ArrowLeft, Search, Mic, X, SlidersHorizontal, ChevronDown,
 *                    Heart, Star, Eye, BadgeCheck, Clock, Flame, MapPin, Check)
 *   - Tailwind CSS  (utilities uniquement, LIGHT-ONLY — zéro `dark:`)
 *
 * Tokens (alignés sur HomeScreen / ProductCard / Login / Plans) :
 *   bg app           #F7F8FA
 *   cta gold         #F5C842
 *   logo gold        linear-gradient(135deg,#C47E00 0%,#B07410 100%)
 *   card bg          #FFFFFF
 *   text primary     #111318
 *   text secondary   #5C6370
 *   text muted       #9EA5B0
 *   border           rgba(0,0,0,0.08)
 *   green promo      #10B981
 *   red promo        #EF4444
 *   verified         #10B981
 *
 * Trois états affichés :
 *   1. RESULTS      — grille produits + barre tri/filtres + chips actifs
 *   2. FILTER_SHEET — bottom-sheet filtres overlay sur résultats
 *   3. SUGGESTIONS  — input focus, recherches récentes + tendances
 *   (4. EMPTY       — exporté séparément, rendu si results.length === 0)
 */

import React, { useState } from "react";
import {
  ArrowLeft,
  Search,
  Mic,
  X,
  SlidersHorizontal,
  ChevronDown,
  Heart,
  Star,
  Eye,
  BadgeCheck,
  Clock,
  Flame,
  Check,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

type BadgeKind = "promo" | "new" | "top";
type CountryCode = "BI" | "CD" | "RW";
type ConditionType = "neuf" | "occasion" | "grossiste";

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrl: string;
  imageGradient: string; // fallback gradient placeholder
  badge?: BadgeKind;
  badgeValue?: string; // ex: "-20%" for PROMO
  liked?: boolean;
  seller: {
    name: string;
    avatar: string;
    verified: boolean;
  };
  rating: number;
  views: number;
}

interface ActiveFilter {
  id: string;
  label: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOCK DATA
 * ──────────────────────────────────────────────────────────────────────────── */

const PRODUCTS: Product[] = [
  {
    id: "p1",
    title: "Sneakers Nike Air Max 270 — Édition Burundi",
    price: 145000,
    originalPrice: 180000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#EF4444 0%,#F97316 100%)",
    badge: "promo",
    badgeValue: "-20%",
    seller: { name: "KicksBuja", avatar: "https://i.pravatar.cc/40?u=kicks", verified: true },
    rating: 4.8,
    views: 1240,
  },
  {
    id: "p2",
    title: "Robe pagne wax élégante taille S à L",
    price: 38000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)",
    badge: "new",
    liked: true,
    seller: { name: "JocyShop", avatar: "https://i.pravatar.cc/40?u=jocy", verified: true },
    rating: 4.9,
    views: 892,
  },
  {
    id: "p3",
    title: "iPhone 14 Pro 256 Go — Très bon état",
    price: 2850000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1592286927505-1def25115558?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#1F2937 0%,#4B5563 100%)",
    badge: "top",
    seller: { name: "TechBurundi", avatar: "https://i.pravatar.cc/40?u=tech", verified: true },
    rating: 4.7,
    views: 3104,
  },
  {
    id: "p4",
    title: "Casque audio Sony WH-1000XM5 noir mat",
    price: 12500,
    currency: "FC",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#0EA5E9 0%,#6366F1 100%)",
    badge: "promo",
    badgeValue: "-15%",
    originalPrice: 14700,
    seller: { name: "SonyShopRDC", avatar: "https://i.pravatar.cc/40?u=sony", verified: false },
    rating: 4.6,
    views: 567,
  },
  {
    id: "p5",
    title: "Sac à main cuir véritable couleur caramel",
    price: 120000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#A16207 0%,#78350F 100%)",
    seller: { name: "LeatherCo", avatar: "https://i.pravatar.cc/40?u=leather", verified: true },
    rating: 4.5,
    views: 412,
  },
  {
    id: "p6",
    title: "Montre Casio classique acier inoxydable",
    price: 55000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#374151 0%,#1F2937 100%)",
    badge: "new",
    seller: { name: "TimeLuxe", avatar: "https://i.pravatar.cc/40?u=time", verified: false },
    rating: 4.4,
    views: 198,
  },
  {
    id: "p7",
    title: "Lampe scandinave bois clair pour bureau",
    price: 65000,
    originalPrice: 85000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)",
    badge: "promo",
    badgeValue: "-23%",
    liked: true,
    seller: { name: "DecoBuja", avatar: "https://i.pravatar.cc/40?u=deco", verified: true },
    rating: 4.9,
    views: 745,
  },
  {
    id: "p8",
    title: "Vélo VTT 26 pouces neuf — Garantie 1 an",
    price: 320000,
    currency: "BIF",
    imageUrl: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#059669 0%,#065F46 100%)",
    badge: "top",
    seller: { name: "VeloBuja", avatar: "https://i.pravatar.cc/40?u=velo", verified: true },
    rating: 4.7,
    views: 2210,
  },
];

const INITIAL_FILTERS: ActiveFilter[] = [
  { id: "cat", label: "Vêtements" },
  { id: "country", label: "🇧🇮 Burundi" },
  { id: "price", label: "< 200 000 BIF" },
  { id: "verified", label: "Vendeur vérifié" },
];

const RECENT_SEARCHES = [
  "Sneakers Nike",
  "Robe pagne wax",
  "iPhone 13",
  "Canapé cuir",
  "Moto Bajaj",
];

const TRENDING_TAGS = [
  "Wax 2026",
  "iPhone 15",
  "VTT électrique",
  "Toyota Hilux",
  "Sapeur",
  "Mariage",
  "Rentrée",
  "Studio Kigali",
];

/* ────────────────────────────────────────────────────────────────────────────
 * UTILS
 * ──────────────────────────────────────────────────────────────────────────── */

function formatPrice(n: number, currency: string): string {
  return n.toLocaleString("fr-FR") + "\u00A0" + currency;
}

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".0", "") + "k";
  return String(n);
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — StickyHeader (search + chips)
 * ──────────────────────────────────────────────────────────────────────────── */

interface StickyHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onBack?: () => void;
  onMic?: () => void;
  onFocus?: () => void;
  focused?: boolean;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (id: string) => void;
}

function StickyHeader({
  query,
  onQueryChange,
  onBack,
  onMic,
  onFocus,
  focused = false,
  activeFilters,
  onRemoveFilter,
}: StickyHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 bg-white"
      style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
    >
      {/* Row 1 — back + input + mic */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full
                     bg-transparent border-none cursor-pointer active:bg-black/5 transition-colors"
        >
          <ArrowLeft size={22} color="#111318" strokeWidth={2.25} />
        </button>

        <div
          className="flex-1 flex items-center gap-2 h-11 rounded-full px-4"
          style={{
            background: focused ? "#FFFFFF" : "#F0F1F4",
            border: focused ? "1.5px solid #F5C842" : "1.5px solid transparent",
            boxShadow: focused ? "0 0 0 4px rgba(245,200,66,0.18)" : "none",
            transition: "all 180ms ease-out",
          }}
        >
          <Search size={18} color={focused ? "#C47E00" : "#9EA5B0"} strokeWidth={2.25} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onFocus}
            placeholder="Rechercher sur Nunulia…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] font-medium
                       text-[#111318] placeholder:text-[#9EA5B0] min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Effacer"
              className="w-6 h-6 rounded-full flex items-center justify-center bg-[#E4E6EA]
                         border-none cursor-pointer flex-shrink-0"
            >
              <X size={12} color="#5C6370" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            onClick={onMic}
            aria-label="Recherche vocale"
            className="w-7 h-7 flex items-center justify-center rounded-full
                       bg-transparent border-none cursor-pointer flex-shrink-0
                       active:bg-black/5"
          >
            <Mic size={17} color="#C47E00" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Row 2 — Active filter chips (h-scroll) */}
      {activeFilters.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto pl-3 pr-3 pb-2.5 no-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {activeFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onRemoveFilter(f.id)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5
                         rounded-full border-none cursor-pointer transition-colors"
              style={{
                background: "#FEF3C2",
                border: "1px solid rgba(245,200,66,0.45)",
              }}
            >
              <span className="text-[12px] font-bold text-[#7A4F00] tracking-tight">
                {f.label}
              </span>
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: "#F5C842" }}
              >
                <X size={9} color="#111318" strokeWidth={3} />
              </span>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — SortFilterBar
 * ──────────────────────────────────────────────────────────────────────────── */

function SortFilterBar({
  count,
  filterCount,
  sort,
  onOpenFilters,
  onOpenSort,
}: {
  count: number;
  filterCount: number;
  sort: string;
  onOpenFilters: () => void;
  onOpenSort: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-2.5">
      <p className="text-[14px] font-black text-[#111318] tracking-tight m-0">
        <span className="text-[#C47E00]">{count}</span>
        <span className="text-[#5C6370] font-bold ml-1">résultats</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSort}
          className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-white cursor-pointer
                     active:scale-95 transition-transform"
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <span className="text-[12px] font-bold text-[#111318] tracking-tight">
            {sort}
          </span>
          <ChevronDown size={14} color="#5C6370" strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={onOpenFilters}
          className="relative flex items-center gap-1.5 h-9 px-3.5 rounded-full
                     bg-white cursor-pointer active:scale-95 transition-transform"
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <SlidersHorizontal size={14} color="#C47E00" strokeWidth={2.5} />
          <span className="text-[12px] font-bold text-[#111318] tracking-tight">
            Filtres
          </span>
          {filterCount > 0 && (
            <span
              className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full inline-flex
                         items-center justify-center text-[10px] font-black text-[#111318]"
              style={{ background: "#F5C842" }}
            >
              {filterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — SearchResultCard
 * ──────────────────────────────────────────────────────────────────────────── */

const BADGE_STYLES: Record<BadgeKind, { bg: string; color: string; label: string }> = {
  promo: { bg: "#EF4444", color: "#FFFFFF", label: "PROMO" },
  new: { bg: "#10B981", color: "#FFFFFF", label: "NOUVEAU" },
  top: { bg: "#F5C842", color: "#111318", label: "TOP" },
};

function SearchResultCard({
  p,
  onToggleLike,
}: {
  p: Product;
  onToggleLike?: (id: string) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const hasPromo = !!p.originalPrice && p.originalPrice > p.price;
  const badge = p.badge ? BADGE_STYLES[p.badge] : null;
  const badgeLabel = p.badge === "promo" && p.badgeValue ? `${badge!.label} ${p.badgeValue}` : badge?.label;

  return (
    <article
      className="flex flex-col bg-white overflow-hidden cursor-pointer transition-transform
                 active:scale-[0.98]"
      style={{
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Image — 4:3 */}
      <div
        className="relative w-full overflow-hidden"
        style={{ paddingTop: "75%", background: p.imageGradient, borderRadius: "16px 16px 0 0" }}
      >
        <img
          src={p.imageUrl}
          alt={p.title}
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: imgLoaded ? 1 : 0 }}
          loading="lazy"
        />

        {/* TL badge */}
        {badge && (
          <span
            className="absolute top-2 left-2 px-2 py-1 rounded-md text-[9px] font-black
                       tracking-wider leading-none"
            style={{
              background: badge.bg,
              color: badge.color,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            {badgeLabel}
          </span>
        )}

        {/* TR heart */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike?.(p.id);
          }}
          aria-label="Favori"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white cursor-pointer
                     flex items-center justify-center border-none transition-transform
                     active:scale-90"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}
        >
          <Heart
            size={15}
            color={p.liked ? "#EF4444" : "#5C6370"}
            fill={p.liked ? "#EF4444" : "none"}
            strokeWidth={2}
          />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col px-2.5 py-2.5 gap-1.5">
        {/* Price */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className="text-[15px] font-black tracking-tight leading-none"
            style={{ color: "#C47E00" }}
          >
            {formatPrice(p.price, p.currency)}
          </span>
          {hasPromo && (
            <span className="text-[10px] font-medium text-[#9EA5B0] line-through leading-none">
              {formatPrice(p.originalPrice!, p.currency)}
            </span>
          )}
        </div>

        {/* Title */}
        <p
          className="text-[12px] font-semibold text-[#111318] leading-snug overflow-hidden m-0"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: 32,
          }}
        >
          {p.title}
        </p>

        {/* Seller */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <img
            src={p.seller.avatar}
            alt=""
            className="w-4 h-4 rounded-full object-cover flex-shrink-0"
          />
          <span className="text-[10px] font-medium text-[#5C6370] truncate min-w-0 flex-1">
            {p.seller.name}
          </span>
          {p.seller.verified && (
            <BadgeCheck size={11} color="#10B981" fill="#10B981" stroke="#fff" strokeWidth={2.5} />
          )}
        </div>

        {/* Footer — rating + views */}
        <div
          className="flex items-center justify-between mt-1 pt-1.5"
          style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center gap-0.5">
            <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={0} />
            <span className="text-[10px] font-bold text-[#111318]">{p.rating}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Eye size={11} color="#9EA5B0" strokeWidth={2} />
            <span className="text-[10px] font-medium text-[#9EA5B0]">
              {formatViews(p.views)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — ResultsGrid
 * ──────────────────────────────────────────────────────────────────────────── */

function ResultsGrid({
  items,
  onToggleLike,
}: {
  items: Product[];
  onToggleLike?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-6">
      {items.map((p) => (
        <SearchResultCard key={p.id} p={p} onToggleLike={onToggleLike} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — FilterSheet (bottom sheet)
 * ──────────────────────────────────────────────────────────────────────────── */

interface FilterState {
  category: string;
  priceMin: number;
  priceMax: number;
  countries: CountryCode[];
  verifiedOnly: boolean;
  condition: ConditionType;
}

const COUNTRY_PILLS: { code: CountryCode; flag: string; label: string }[] = [
  { code: "BI", flag: "🇧🇮", label: "Burundi" },
  { code: "CD", flag: "🇨🇩", label: "RD Congo" },
  { code: "RW", flag: "🇷🇼", label: "Rwanda" },
];

const CATEGORY_OPTIONS = [
  "Tout", "Vêtements", "Électronique", "Maison", "Beauté", "Auto", "Services",
];

const CONDITION_OPTIONS: { id: ConditionType; label: string }[] = [
  { id: "neuf", label: "Neuf" },
  { id: "occasion", label: "Occasion" },
  { id: "grossiste", label: "Grossiste" },
];

function FilterSheet({
  open,
  filters,
  onChange,
  onApply,
  onReset,
  onClose,
  resultsCount,
}: {
  open: boolean;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  resultsCount: number;
}) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      style={{ background: "rgba(17,19,24,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white flex flex-col"
        style={{
          borderRadius: "20px 20px 0 0",
          maxHeight: "88%",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
          animation: "slideUp 280ms cubic-bezier(0.32,0.72,0,1) both",
        }}
      >
        {/* Handle */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.15)" }}
          />
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3
            className="text-[18px] font-black text-[#111318] tracking-tight m-0"
            style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
          >
            Filtres
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F0F1F4]
                       border-none cursor-pointer active:scale-90 transition-transform"
          >
            <X size={16} color="#111318" strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-5 pb-5"
          style={{ scrollbarWidth: "thin" }}
        >
          {/* Catégorie */}
          <SheetSection title="Catégorie">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((c) => {
                const active = filters.category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange({ ...filters, category: c })}
                    className="h-8 px-3 rounded-full border-none cursor-pointer
                               transition-all"
                    style={{
                      background: active ? "#F5C842" : "#FFFFFF",
                      border: active ? "none" : "1px solid rgba(0,0,0,0.08)",
                      boxShadow: active ? "0 2px 6px rgba(245,200,66,0.35)" : "none",
                    }}
                  >
                    <span
                      className="text-[12px] tracking-tight"
                      style={{
                        color: active ? "#111318" : "#5C6370",
                        fontWeight: active ? 800 : 600,
                      }}
                    >
                      {c}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetSection>

          {/* Prix */}
          <SheetSection
            title="Prix"
            badge={`${filters.priceMin.toLocaleString("fr-FR")} – ${filters.priceMax.toLocaleString("fr-FR")} BIF`}
          >
            <DualRangeSlider
              min={0}
              max={500000}
              step={5000}
              minValue={filters.priceMin}
              maxValue={filters.priceMax}
              onChange={(lo, hi) =>
                onChange({ ...filters, priceMin: lo, priceMax: hi })
              }
            />
          </SheetSection>

          {/* Localisation */}
          <SheetSection title="Localisation">
            <div className="flex gap-2">
              {COUNTRY_PILLS.map((c) => {
                const active = filters.countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.countries.filter((x) => x !== c.code)
                        : [...filters.countries, c.code];
                      onChange({ ...filters, countries: next });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl
                               border-none cursor-pointer transition-all"
                    style={{
                      background: active ? "#FFF8E0" : "#FFFFFF",
                      border: active
                        ? "1.5px solid #F5C842"
                        : "1.5px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <span className="text-[18px]">{c.flag}</span>
                    <span
                      className="text-[12px] tracking-tight"
                      style={{
                        color: active ? "#111318" : "#5C6370",
                        fontWeight: active ? 800 : 600,
                      }}
                    >
                      {c.label}
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
                <span className="text-[14px] font-bold text-[#111318] tracking-tight">
                  Vendeur vérifié uniquement
                </span>
                <span className="text-[11px] text-[#9EA5B0] mt-0.5">
                  Boutiques authentifiées par Nunulia
                </span>
              </div>
              <Toggle
                value={filters.verifiedOnly}
                onChange={(v) => onChange({ ...filters, verifiedOnly: v })}
              />
            </div>
          </SheetSection>

          {/* Type */}
          <SheetSection title="Type">
            <div
              className="flex p-1 rounded-full"
              style={{ background: "#F0F1F4" }}
            >
              {CONDITION_OPTIONS.map((opt) => {
                const active = filters.condition === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...filters, condition: opt.id })}
                    className="flex-1 h-9 rounded-full border-none cursor-pointer transition-all"
                    style={{
                      background: active ? "#FFFFFF" : "transparent",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
                    }}
                  >
                    <span
                      className="text-[12px] tracking-tight"
                      style={{
                        color: active ? "#111318" : "#5C6370",
                        fontWeight: active ? 800 : 600,
                      }}
                    >
                      {opt.label}
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
            background: "#FFFFFF",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            onClick={onReset}
            className="h-12 px-5 rounded-full bg-transparent cursor-pointer active:scale-95
                       transition-transform"
            style={{ border: "1.5px solid rgba(0,0,0,0.10)" }}
          >
            <span className="text-[14px] font-bold text-[#111318] tracking-tight">
              Réinitialiser
            </span>
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 h-12 rounded-full border-none cursor-pointer
                       active:scale-[0.98] transition-transform"
            style={{
              background: "#F5C842",
              boxShadow: "0 4px 14px rgba(245,200,66,0.45)",
            }}
          >
            <span className="text-[14px] font-black text-[#111318] tracking-tight">
              Voir {resultsCount} résultats
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetSection({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="py-4"
      style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
    >
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-black text-[#111318] tracking-tight m-0">
            {title}
          </h4>
          {badge && (
            <span className="text-[11px] font-bold" style={{ color: "#C47E00" }}>
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — Toggle
 * ──────────────────────────────────────────────────────────────────────────── */

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200"
      style={{ background: value ? "#F5C842" : "#D8DBE0" }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200"
        style={{
          left: value ? 22 : 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — DualRangeSlider
 * ──────────────────────────────────────────────────────────────────────────── */

function DualRangeSlider({
  min,
  max,
  step,
  minValue,
  maxValue,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  minValue: number;
  maxValue: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const lowPct = ((minValue - min) / (max - min)) * 100;
  const highPct = ((maxValue - min) / (max - min)) * 100;

  return (
    <div className="relative pt-3 pb-2">
      {/* Track */}
      <div
        className="relative h-1.5 rounded-full"
        style={{ background: "#E4E6EA" }}
      >
        <div
          className="absolute h-full rounded-full"
          style={{
            left: `${lowPct}%`,
            right: `${100 - highPct}%`,
            background: "#F5C842",
          }}
        />
      </div>

      {/* Two native range inputs stacked, pointer-events tricks */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={minValue}
        onChange={(e) =>
          onChange(Math.min(Number(e.target.value), maxValue - step), maxValue)
        }
        className="dual-range-input"
        style={{ zIndex: 2 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={maxValue}
        onChange={(e) =>
          onChange(minValue, Math.max(Number(e.target.value), minValue + step))
        }
        className="dual-range-input"
        style={{ zIndex: 3 }}
      />

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] font-bold text-[#5C6370]">
          {minValue.toLocaleString("fr-FR")}
        </span>
        <span className="text-[11px] font-bold text-[#5C6370]">
          {maxValue.toLocaleString("fr-FR")}+
        </span>
      </div>

      <style>{`
        .dual-range-input {
          position: absolute;
          top: 6px;
          left: 0;
          right: 0;
          width: 100%;
          height: 24px;
          background: transparent;
          -webkit-appearance: none;
          appearance: none;
          pointer-events: none;
        }
        .dual-range-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #F5C842;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          cursor: pointer;
          pointer-events: auto;
        }
        .dual-range-input::-moz-range-thumb {
          width: 20px; height: 20px;
          border-radius: 50%;
          background: #F5C842;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          cursor: pointer;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — SuggestionsPanel (focused, before typing)
 * ──────────────────────────────────────────────────────────────────────────── */

function SuggestionsPanel({
  recent,
  trending,
  onSelect,
  onRemoveRecent,
  onClearAll,
}: {
  recent: string[];
  trending: string[];
  onSelect: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="px-4 pt-4 pb-12">
      {/* Recent */}
      {recent.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h4
              className="text-[10px] font-black uppercase tracking-[.08em] m-0"
              style={{ color: "#9EA5B0" }}
            >
              Recherches récentes
            </h4>
            <button
              type="button"
              onClick={onClearAll}
              className="bg-transparent border-none cursor-pointer p-1 -mr-1"
            >
              <span
                className="text-[11px] font-bold"
                style={{ color: "#C47E00" }}
              >
                Tout effacer
              </span>
            </button>
          </div>

          <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
            {recent.map((term) => (
              <li
                key={term}
                className="flex items-center gap-3 py-2.5 px-1 cursor-pointer
                           rounded-lg active:bg-black/5 transition-colors"
                onClick={() => onSelect(term)}
              >
                <Clock size={16} color="#9EA5B0" strokeWidth={2} />
                <span className="flex-1 text-[14px] font-medium text-[#111318]">
                  {term}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(term);
                  }}
                  aria-label={`Supprimer ${term}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center
                             bg-transparent border-none cursor-pointer active:bg-black/5"
                >
                  <X size={14} color="#9EA5B0" strokeWidth={2.25} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Trending */}
      <section>
        <div className="flex items-center gap-1.5 mb-3">
          <Flame size={14} color="#EF4444" fill="#EF4444" strokeWidth={0} />
          <h4
            className="text-[10px] font-black uppercase tracking-[.08em] m-0"
            style={{ color: "#9EA5B0" }}
          >
            Tendances
          </h4>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {trending.map((tag, i) => (
            <button
              key={tag}
              type="button"
              onClick={() => onSelect(tag)}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white
                         cursor-pointer transition-transform active:scale-95"
              style={{ border: "1px solid rgba(0,0,0,0.08)" }}
            >
              {i < 3 && <span className="text-[11px]">🔥</span>}
              <span className="text-[12px] font-semibold text-[#111318] tracking-tight">
                {tag}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENT — EmptyState
 * ──────────────────────────────────────────────────────────────────────────── */

export function EmptyState({
  query,
  onPostRequest,
}: {
  query: string;
  onPostRequest?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 pt-12 pb-8">
      <div
        className="relative w-32 h-32 rounded-full flex items-center justify-center mb-6"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #FEF3C2 0%, #FCE7A6 45%, #F5C842 100%)",
          boxShadow: "0 12px 32px rgba(245,200,66,0.30)",
        }}
      >
        {/* Decorative orbital dots */}
        <span
          className="absolute w-2 h-2 rounded-full"
          style={{ top: 8, right: 16, background: "#F5C842", boxShadow: "0 0 0 4px rgba(245,200,66,0.18)" }}
        />
        <span
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ bottom: 12, left: 14, background: "#C47E00" }}
        />
        <Search size={48} color="#7A4F00" strokeWidth={2.25} />
      </div>

      <h2
        className="text-[20px] font-black text-[#111318] tracking-tight m-0 mb-2"
        style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
      >
        Aucun résultat pour
        <br />
        <span style={{ color: "#C47E00" }}>«&nbsp;{query}&nbsp;»</span>
      </h2>
      <p
        className="text-[13px] font-medium text-[#5C6370] leading-relaxed max-w-[260px] m-0 mb-7"
      >
        Essayez avec d'autres mots ou postez une demande — les vendeurs vous contacteront.
      </p>

      <button
        type="button"
        onClick={onPostRequest}
        className="flex items-center gap-2 h-12 px-6 rounded-full border-none cursor-pointer
                   active:scale-[0.97] transition-transform"
        style={{
          background: "#F5C842",
          boxShadow: "0 6px 18px rgba(245,200,66,0.50)",
        }}
      >
        <span className="text-[16px]">🔍</span>
        <span className="text-[14px] font-black text-[#111318] tracking-tight">
          Poster une demande Je Cherche
        </span>
      </button>

      <p className="text-[11px] font-medium text-[#9EA5B0] mt-5 max-w-[260px]">
        Plus de <span className="font-bold text-[#5C6370]">4 200 vendeurs</span> reçoivent
        votre demande sur WhatsApp.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * MAIN — SearchDiscovery
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SearchDiscoveryProps {
  initialQuery?: string;
  onBack?: () => void;
  onOpenProduct?: (id: string) => void;
  onPostRequest?: () => void;
}

const DEFAULT_FILTERS: FilterState = {
  category: "Vêtements",
  priceMin: 0,
  priceMax: 200000,
  countries: ["BI"],
  verifiedOnly: true,
  condition: "neuf",
};

export default function SearchDiscovery({
  initialQuery = "sneakers nike",
  onBack,
  onPostRequest,
}: SearchDiscoveryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>(INITIAL_FILTERS);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recent, setRecent] = useState(RECENT_SEARCHES);

  const handleToggleLike = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, liked: !p.liked } : p))
    );
  };

  const removeFilter = (id: string) =>
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));

  const resultsCount = 247;
  const hasResults = products.length > 0;

  return (
    <div className="relative flex flex-col min-h-full bg-[#F7F8FA]">
      <StickyHeader
        query={focused ? query : query}
        onQueryChange={setQuery}
        onBack={onBack}
        onFocus={() => setFocused(true)}
        focused={focused}
        activeFilters={focused ? [] : activeFilters}
        onRemoveFilter={removeFilter}
      />

      <main className="flex-1">
        {focused ? (
          <SuggestionsPanel
            recent={recent}
            trending={TRENDING_TAGS}
            onSelect={(t) => {
              setQuery(t);
              setFocused(false);
            }}
            onRemoveRecent={(t) =>
              setRecent((prev) => prev.filter((x) => x !== t))
            }
            onClearAll={() => setRecent([])}
          />
        ) : hasResults ? (
          <>
            <SortFilterBar
              count={resultsCount}
              filterCount={activeFilters.length}
              sort="Pertinence"
              onOpenFilters={() => setSheetOpen(true)}
              onOpenSort={() => {}}
            />
            <ResultsGrid items={products} onToggleLike={handleToggleLike} />
          </>
        ) : (
          <EmptyState query={query} onPostRequest={onPostRequest} />
        )}
      </main>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        onChange={setFilters}
        onApply={() => setSheetOpen(false)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        onClose={() => setSheetOpen(false)}
        resultsCount={resultsCount}
      />
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * USAGE
 *   <SearchDiscovery
 *     initialQuery="sneakers nike"
 *     onBack={() => router.back()}
 *     onOpenProduct={(id) => router.push(`/p/${id}`)}
 *     onPostRequest={() => router.push('/requests/new')}
 *   />
 *
 * STRUCTURE
 *   StickyHeader         — back + input pill + mic + chips actifs (h-scroll)
 *   SortFilterBar        — "247 résultats" + Trier pill + Filtres pill (badge)
 *   ResultsGrid          — 2-col, gap 8px, cards 4:3
 *   FilterSheet          — overlay bottom-sheet 88vh max
 *   SuggestionsPanel     — récentes + tendances (focus state)
 *   EmptyState           — exporté indépendamment, fallback no-results
 *
 * COMPORTEMENTS
 *   focus input          → SuggestionsPanel, chips cachés
 *   click filter chip    → retire le filtre (X)
 *   tap heart            → toggle liked (optimiste)
 *   tap card             → onOpenProduct
 *   ouvrir sheet         → overlay rgba(17,19,24,0.45) + slideUp anim
 *   tap backdrop sheet   → close
 *   Apply / Reset        → bottom row sticky avec safe-area
 *
 * KEYFRAME REQUISE
 *   @keyframes slideUp {
 *     from { transform: translateY(100%); }
 *     to   { transform: translateY(0); }
 *   }
 *
 * TAP TARGETS
 *   back / mic / heart    : 40 / 28 / 32 px (zone tactile ≥ 44 via padding)
 *   chips actifs          : 28 px height (h-7), facile à toucher
 *   sort/filter pills     : 36 px height
 *   sheet country pills   : 44 px height
 *   sheet apply CTA       : 48 px (h-12), gold full-width
 *
 * LIGHT-ONLY
 *   Zéro classe `dark:`. Le toggle thème est géré par le shell parent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
