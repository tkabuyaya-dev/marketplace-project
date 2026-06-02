/**
 * Favorites.tsx
 * Nunulia — Page Favoris / Wishlist (marketplace PWA mobile-first)
 *
 * Route : /favorites
 *
 * Public : Burundi 🇧🇮 / RDC 🇨🇩 / Rwanda 🇷🇼 — bilingue FR par défaut
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react   (ArrowLeft, Heart, Star, ChevronRight, TrendingDown,
 *                     Trash2, Share2, Compass, Search, Check, MessageCircle)
 *   - Tailwind CSS   (utilities uniquement, LIGHT-ONLY — zéro `dark:`)
 *
 * Tokens (alignés sur HomeScreen / ProductCard / SearchDiscovery / Login) :
 *   bg app           #F7F8FA
 *   cta gold         #F5C842
 *   logo gold text   #C47E00
 *   logo gold grad   linear-gradient(135deg,#C47E00 0%,#B07410 100%)
 *   card bg          #FFFFFF
 *   text primary     #111318
 *   text secondary   #5C6370
 *   text muted       #9EA5B0
 *   border           rgba(0,0,0,0.08)
 *   red heart        #EF4444
 *   green verified   #10B981
 *   whatsapp green   #25D366
 *
 * Trois états affichés :
 *   1. GRID          — 2-col grille de favoris + sort + chips catégories + bulk
 *   2. SELLER_GROUP  — favoris groupés par boutique, rail horizontal
 *   3. EMPTY         — illustration cœur doré + CTA Explorer / Je Cherche
 *
 * Export par défaut : <Favorites view="grid" | "grouped" | "empty" />
 */

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Heart,
  Star,
  ChevronRight,
  TrendingDown,
  Trash2,
  Share2,
  Compass,
  Search,
  Check,
  MessageCircle,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

type Category = "Tout" | "Vêtements" | "Électronique" | "Maison";
type SortKey = "Récents" | "Prix ↑" | "Prix ↓" | "Boutique";
type ViewMode = "grid" | "grouped" | "empty";

interface Seller {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  city: string;
}

interface Favorite {
  id: string;
  title: string;
  price: number;
  savedPrice?: number; // prix au moment du save → si > price, badge baisse
  currency: string;
  category: Exclude<Category, "Tout">;
  imageUrl: string;
  imageGradient: string;
  sellerId: string;
  rating: number;
  savedAt: string; // libellé relatif ("il y a 2j")
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOCK DATA
 * ──────────────────────────────────────────────────────────────────────────── */

const SELLERS: Record<string, Seller> = {
  kicks:   { id: "kicks",   name: "KicksBuja",   avatar: "https://i.pravatar.cc/80?u=kicks",   verified: true,  city: "Bujumbura" },
  jocy:    { id: "jocy",    name: "JocyShop",    avatar: "https://i.pravatar.cc/80?u=jocy",    verified: true,  city: "Kigali" },
  tech:    { id: "tech",    name: "TechBurundi", avatar: "https://i.pravatar.cc/80?u=tech",    verified: true,  city: "Bujumbura" },
  deco:    { id: "deco",    name: "DecoBuja",    avatar: "https://i.pravatar.cc/80?u=deco",    verified: true,  city: "Bujumbura" },
  leather: { id: "leather", name: "LeatherCo",   avatar: "https://i.pravatar.cc/80?u=leather", verified: false, city: "Goma" },
};

const FAVORITES: Favorite[] = [
  { id: "f1",  title: "Sneakers Nike Air Max 270 — édition Burundi",
    price: 145_000, savedPrice: 170_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#EF4444 0%,#F97316 100%)",
    sellerId: "kicks", rating: 4.8, savedAt: "il y a 2j" },

  { id: "f2",  title: "Robe pagne wax élégante taille S à L",
    price: 38_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)",
    sellerId: "jocy", rating: 4.9, savedAt: "il y a 5j" },

  { id: "f3",  title: "iPhone 14 Pro 256 Go — très bon état",
    price: 2_850_000, savedPrice: 3_100_000, currency: "BIF", category: "Électronique",
    imageUrl: "https://images.unsplash.com/photo-1592286927505-1def25115558?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#1F2937 0%,#4B5563 100%)",
    sellerId: "tech", rating: 4.7, savedAt: "il y a 1j" },

  { id: "f4",  title: "Casque Sony WH-1000XM5 noir mat",
    price: 425_000, savedPrice: 500_000, currency: "BIF", category: "Électronique",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#0EA5E9 0%,#6366F1 100%)",
    sellerId: "tech", rating: 4.6, savedAt: "il y a 3j" },

  { id: "f5",  title: "Sac à main cuir véritable caramel",
    price: 120_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#A16207 0%,#78350F 100%)",
    sellerId: "leather", rating: 4.5, savedAt: "il y a 1 sem" },

  { id: "f6",  title: "Lampe scandinave bois clair de bureau",
    price: 65_000, savedPrice: 85_000, currency: "BIF", category: "Maison",
    imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)",
    sellerId: "deco", rating: 4.9, savedAt: "il y a 4j" },

  { id: "f7",  title: "Vase céramique fait main artisanal",
    price: 28_000, currency: "BIF", category: "Maison",
    imageUrl: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#E11D48 0%,#9F1239 100%)",
    sellerId: "deco", rating: 4.8, savedAt: "il y a 6j" },

  { id: "f8",  title: "Veste en jean oversize unisexe",
    price: 52_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#1E40AF 0%,#1E3A8A 100%)",
    sellerId: "jocy", rating: 4.7, savedAt: "il y a 2j" },

  { id: "f9",  title: "Sneakers Adidas Stan Smith blanches",
    price: 98_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#10B981 0%,#047857 100%)",
    sellerId: "kicks", rating: 4.6, savedAt: "il y a 1 sem" },

  { id: "f10", title: "Boucles d’oreilles or 18k traditionnelles",
    price: 185_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#F5C842 0%,#C47E00 100%)",
    sellerId: "jocy", rating: 5.0, savedAt: "aujourd’hui" },

  { id: "f11", title: "Galaxy Watch 6 Classic 43mm",
    price: 380_000, savedPrice: 420_000, currency: "BIF", category: "Électronique",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#374151 0%,#1F2937 100%)",
    sellerId: "tech", rating: 4.5, savedAt: "il y a 2 sem" },

  { id: "f12", title: "Foulard soie motif géométrique",
    price: 24_000, currency: "BIF", category: "Vêtements",
    imageUrl: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600&q=80",
    imageGradient: "linear-gradient(135deg,#DB2777 0%,#9D174D 100%)",
    sellerId: "jocy", rating: 4.7, savedAt: "il y a 3 sem" },
];

const SORT_PILLS: SortKey[] = ["Récents", "Prix ↑", "Prix ↓", "Boutique"];
const CATEGORIES: Category[] = ["Tout", "Vêtements", "Électronique", "Maison"];

/* ────────────────────────────────────────────────────────────────────────────
 * UTILS
 * ──────────────────────────────────────────────────────────────────────────── */

const fmtPrice = (n: number, currency: string) =>
  n.toLocaleString("fr-FR") + "\u00A0" + currency;

const discountPct = (saved: number, current: number) =>
  Math.round((1 - current / saved) * 100);

/* ────────────────────────────────────────────────────────────────────────────
 * STICKY HEADER — back · "Mes Favoris" · count pill · sort row
 * ──────────────────────────────────────────────────────────────────────────── */

interface FavHeaderProps {
  count: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onBack?: () => void;
}

function FavHeader({ count, sort, onSort, onBack }: FavHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-black/5">
      {/* Title row */}
      <div className="flex items-center gap-2 pl-2 pr-3 pt-2 pb-2.5">
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
            style={{ boxShadow: "0 2px 6px rgba(245,200,66,0.40)" }}
          >
            <Heart size={12} fill="#111318" stroke="#111318" strokeWidth={0} />
            <span className="text-[13px] font-black text-[#111318] tracking-tight">
              {count}
            </span>
          </span>
        )}
      </div>

      {/* Sort pills */}
      <div
        className="flex gap-1.5 overflow-x-auto px-3 pb-2.5"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        {SORT_PILLS.map((s) => {
          const active = sort === s;
          return (
            <button
              key={s}
              onClick={() => onSort(s)}
              className={[
                "shrink-0 h-8 px-3.5 rounded-full transition-all duration-150",
                active
                  ? "bg-[#F5C842] text-[#111318] font-extrabold"
                  : "bg-white border border-black/[0.08] text-[#5C6370] font-semibold",
              ].join(" ")}
              style={{
                boxShadow: active ? "0 2px 6px rgba(245,200,66,0.35)" : "none",
              }}
            >
              <span className="text-[12px] tracking-tight">{s}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CATEGORY CHIPS — Tout · Vêtements · Électronique · Maison
 * ──────────────────────────────────────────────────────────────────────────── */

interface CategoryChipsProps {
  active: Category;
  counts: Record<string, number>;
  onChange: (c: Category) => void;
}

function CategoryChips({ active, counts, onChange }: CategoryChipsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-3"
      style={{ scrollbarWidth: "none" } as React.CSSProperties}
    >
      {CATEGORIES.map((c) => {
        const isActive = active === c;
        const count = counts[c];
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={[
              "shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full transition-all duration-150",
              isActive
                ? "bg-[#F5C842] font-extrabold"
                : "bg-white border border-black/[0.08] font-semibold",
            ].join(" ")}
            style={{
              boxShadow: isActive ? "0 2px 6px rgba(245,200,66,0.35)" : "none",
            }}
          >
            <span className="text-[12px] tracking-tight text-[#111318]">{c}</span>
            {typeof count === "number" && (
              <span
                className={[
                  "text-[10px] font-bold",
                  isActive ? "text-[#7A4F00]" : "text-[#9EA5B0]",
                ].join(" ")}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * FAVORITE CARD
 * ──────────────────────────────────────────────────────────────────────────── */

interface FavCardProps {
  item: Favorite;
  onUnlike?: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function FavCard({
  item,
  onUnlike,
  selectable = false,
  selected = false,
  onToggleSelect,
}: FavCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [popping, setPopping] = useState(false);
  const seller = SELLERS[item.sellerId];
  const drop = item.savedPrice && item.savedPrice > item.price;
  const dropPct = drop ? discountPct(item.savedPrice!, item.price) : 0;

  const handleUnlike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopping(true);
    window.setTimeout(() => onUnlike?.(item.id), 250);
  };

  return (
    <article
      onClick={selectable ? () => onToggleSelect?.(item.id) : undefined}
      className={[
        "relative flex flex-col bg-white rounded-2xl overflow-hidden cursor-pointer",
        "transition-shadow duration-150",
        selected
          ? "border-2 border-[#F5C842]"
          : "border border-black/[0.06]",
      ].join(" ")}
      style={{
        boxShadow: selected
          ? "0 4px 14px rgba(245,200,66,0.35)"
          : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Image — 4:3 */}
      <div
        className="relative w-full overflow-hidden"
        style={{ paddingTop: "75%", background: item.imageGradient }}
      >
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />

        {/* TL — price drop badge */}
        {drop && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-[#EF4444] text-white"
            style={{
              boxShadow: "0 2px 6px rgba(239,68,68,0.40)",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            <TrendingDown size={10} strokeWidth={3} className="text-white" />
            −{dropPct}%
          </span>
        )}

        {/* TR — heart (always liked, tap to remove) OR selection check */}
        {selectable ? (
          <span
            className={[
              "absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center",
              selected ? "bg-[#F5C842]" : "bg-white/95 border-[1.5px] border-black/[0.08]",
            ].join(" ")}
            style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
          >
            {selected && <Check size={14} strokeWidth={3} className="text-[#111318]" />}
          </span>
        ) : (
          <button
            onClick={handleUnlike}
            aria-label="Retirer des favoris"
            className="absolute top-2 right-2 w-[30px] h-[30px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform"
            style={{
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              animation: popping ? "favHeartPop 250ms ease-out" : undefined,
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
            style={{ letterSpacing: "-0.02em" }}
          >
            {fmtPrice(item.price, item.currency)}
          </span>
          {drop && (
            <span className="text-[10px] font-medium text-[#9EA5B0] line-through leading-none">
              {fmtPrice(item.savedPrice!, item.currency)}
            </span>
          )}
        </div>

        {/* Title — 2-line clamp */}
        <p
          className="text-[12px] font-semibold text-[#111318] m-0"
          style={{
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 32,
          }}
        >
          {item.title}
        </p>

        {/* Seller row */}
        <div className="flex items-center gap-1.5 mt-px">
          <img
            src={seller.avatar}
            alt=""
            className="w-4 h-4 rounded-full object-cover shrink-0"
          />
          <span className="text-[10px] font-medium text-[#5C6370] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {seller.name}
          </span>
          {seller.verified && (
            <span className="flex items-center justify-center w-3 h-3 rounded-full bg-[#10B981] shrink-0">
              <Check size={8} strokeWidth={3.5} className="text-white" />
            </span>
          )}
        </div>

        {/* Footer — rating + WhatsApp */}
        <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-black/[0.05]">
          <div className="flex items-center gap-0.5">
            <Star size={11} fill="#F5C842" stroke="#F5C842" strokeWidth={0} />
            <span className="text-[10px] font-extrabold text-[#111318]">
              {item.rating}
            </span>
          </div>
          <button
            onClick={(e) => e.stopPropagation()}
            aria-label="Contacter sur WhatsApp"
            className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[#25D366] active:scale-95 transition-transform"
            style={{ boxShadow: "0 1px 3px rgba(37,211,102,0.40)" }}
          >
            <MessageCircle size={10} fill="#fff" stroke="#fff" strokeWidth={0} />
            <span
              className="text-white font-extrabold"
              style={{ fontSize: 10, letterSpacing: "-0.01em" }}
            >
              Contacter
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * BULK ACTIONS BAR
 * ──────────────────────────────────────────────────────────────────────────── */

interface BulkBarProps {
  count: number;
  onShare?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

function BulkBar({ count, onShare, onDelete, onCancel }: BulkBarProps) {
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-[35] px-3.5 pt-3 pb-[18px] bg-white flex items-center gap-2.5"
      style={{
        borderTop: "1.5px solid #F5C842",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.10)",
        animation: "favSlideUp 280ms cubic-bezier(0.32,0.72,0,1) both",
      }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[14px] font-black text-[#111318] tracking-tight">
          {count} sélectionné{count > 1 ? "s" : ""}
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
        <span className="text-[13px] font-extrabold text-[#111318] tracking-tight">
          Partager
        </span>
      </button>

      <button
        onClick={onDelete}
        aria-label="Supprimer"
        className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[#EF4444] active:scale-95 transition-transform"
        style={{ boxShadow: "0 4px 12px rgba(239,68,68,0.40)" }}
      >
        <Trash2 size={14} strokeWidth={2.5} className="text-white" />
        <span className="text-[13px] font-black text-white tracking-tight">
          Supprimer
        </span>
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SELLER GROUP — header + horizontal rail
 * ──────────────────────────────────────────────────────────────────────────── */

interface SellerGroupProps {
  seller: Seller;
  items: Favorite[];
}

function SellerGroup({ seller, items }: SellerGroupProps) {
  return (
    <section className="mb-[18px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5">
        {/* Avatar with gold ring */}
        <div
          className="relative w-11 h-11 rounded-full shrink-0"
          style={{
            padding: 2,
            background: "linear-gradient(135deg,#F5C842 0%,#C47E00 100%)",
          }}
        >
          <img
            src={seller.avatar}
            alt=""
            className="w-full h-full rounded-full object-cover"
            style={{ border: "2px solid #FFFFFF" }}
          />
          {seller.verified && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#10B981] flex items-center justify-center"
              style={{ border: "2px solid #F7F8FA" }}
            >
              <Check size={8} strokeWidth={3.5} className="text-white" />
            </span>
          )}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[14px] font-black text-[#111318] tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
            {seller.name}
          </span>
          <span className="text-[11px] font-medium text-[#5C6370]">
            {items.length} article{items.length > 1 ? "s" : ""} · {seller.city}
          </span>
        </div>

        <button
          aria-label={`Voir la boutique ${seller.name}`}
          className="inline-flex items-center gap-0.5 h-8 pl-2.5 pr-1.5 rounded-full bg-[#F0F1F4] active:scale-95 transition-transform"
        >
          <span className="text-[11px] font-bold text-[#111318]">Voir</span>
          <ChevronRight size={14} strokeWidth={2.5} className="text-[#111318]" />
        </button>
      </div>

      {/* Horizontal rail */}
      <div
        className="flex gap-2 overflow-x-auto px-3.5 pb-1"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        {items.map((it) => (
          <div key={it.id} className="shrink-0 w-[170px]">
            <FavCard item={it} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * EMPTY STATE
 * ──────────────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  onExplore?: () => void;
  onJeCherche?: () => void;
}

function EmptyState({ onExplore, onJeCherche }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-7 pt-14 pb-8">
      {/* Illustration — heart with radial glow + decorative dots */}
      <div className="relative w-[200px] h-[200px] flex items-center justify-center mb-7">
        {/* outer radial glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(245,200,66,0.32) 0%, rgba(245,200,66,0.10) 45%, rgba(245,200,66,0) 70%)",
          }}
        />

        {/* inner glow disc */}
        <div
          className="absolute w-[148px] h-[148px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #FFF6D6 0%, #FCE7A6 45%, #F5C842 100%)",
            animation: "favHeartGlow 3s ease-in-out infinite",
          }}
        />

        {/* heart */}
        <svg
          width="78"
          height="78"
          viewBox="0 0 24 24"
          className="relative z-[2]"
          style={{ filter: "drop-shadow(0 6px 14px rgba(196,126,0,0.45))" }}
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

        {/* decorative floating dots */}
        <span
          className="absolute w-2.5 h-2.5 rounded-full bg-[#F5C842]"
          style={{
            top: 18,
            right: 22,
            boxShadow: "0 0 0 6px rgba(245,200,66,0.18)",
            animation: "favDotFloat 2.6s ease-in-out infinite",
          }}
        />
        <span
          className="absolute rounded-full bg-[#C47E00]"
          style={{
            bottom: 30, left: 14, width: 7, height: 7,
            animation: "favDotFloat 2.6s ease-in-out 0.6s infinite",
          }}
        />
        <span
          className="absolute rounded-full bg-[#F5C842]"
          style={{
            top: 46, left: 8, width: 5, height: 5,
            animation: "favDotFloat 2.6s ease-in-out 1.2s infinite",
          }}
        />
        <span
          className="absolute rounded-full bg-[#F5C842]/70"
          style={{
            bottom: 18, right: 30, width: 6, height: 6,
            animation: "favDotFloat 2.6s ease-in-out 1.8s infinite",
          }}
        />
        {/* sparkle */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          className="absolute"
          style={{ top: 8, left: 60 }}
        >
          <path
            d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
            fill="#F5C842"
          />
        </svg>
      </div>

      {/* Title */}
      <h2
        className="text-[22px] font-black text-[#111318] m-0 mb-2"
        style={{ letterSpacing: "-0.02em", lineHeight: 1.2 }}
      >
        Aucun favori pour l'instant
      </h2>
      <p
        className="text-[13px] font-medium text-[#5C6370] m-0 mb-7"
        style={{ lineHeight: 1.55, maxWidth: 280 }}
      >
        Appuyez sur{" "}
        <span
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#FFE4E4] mx-0.5"
          style={{ verticalAlign: -4 }}
        >
          <Heart size={10} fill="#EF4444" stroke="#EF4444" strokeWidth={0} />
        </span>{" "}
        pour sauvegarder vos coups de cœur et les retrouver ici.
      </p>

      {/* Primary CTA */}
      <button
        onClick={onExplore}
        className="flex items-center justify-center gap-2 w-full h-[50px] rounded-full bg-[#F5C842] active:scale-[0.98] transition-transform"
        style={{
          maxWidth: 280,
          boxShadow: "0 6px 18px rgba(245,200,66,0.50)",
        }}
      >
        <Compass size={17} strokeWidth={2.5} className="text-[#111318]" />
        <span className="text-[15px] font-black text-[#111318] tracking-tight">
          Explorer le marché
        </span>
      </button>

      {/* Secondary link */}
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

/* ────────────────────────────────────────────────────────────────────────────
 * GRID + GROUPED RENDERERS
 * ──────────────────────────────────────────────────────────────────────────── */

interface FavGridProps {
  items: Favorite[];
  onUnlike?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

function FavGrid({
  items,
  onUnlike,
  selectable,
  selectedIds,
  onToggleSelect,
}: FavGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-24">
      {items.map((it) => (
        <FavCard
          key={it.id}
          item={it}
          onUnlike={onUnlike}
          selectable={selectable}
          selected={selectedIds?.includes(it.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

function GroupedView({ items }: { items: Favorite[] }) {
  const groups: Record<string, Favorite[]> = {};
  items.forEach((it) => {
    (groups[it.sellerId] ||= []).push(it);
  });
  const ordered = Object.entries(groups).sort(
    (a, b) => b[1].length - a[1].length
  );

  return (
    <div className="pt-3.5 pb-8">
      {ordered.map(([sellerId, list]) => (
        <SellerGroup key={sellerId} seller={SELLERS[sellerId]} items={list} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * INLINE KEYFRAMES — heart pop, slide up, glow, dot float
 * ──────────────────────────────────────────────────────────────────────────── */

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
  0%, 100% { box-shadow: 0 12px 32px rgba(245,200,66,0.25), 0 0 0 0 rgba(239,68,68,0.0); }
  50%      { box-shadow: 0 12px 36px rgba(245,200,66,0.40), 0 0 0 12px rgba(239,68,68,0.06); }
}
@keyframes favDotFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
`;

/* ────────────────────────────────────────────────────────────────────────────
 * MAIN — <Favorites />
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FavoritesProps {
  /** Initial view — "grid" (default), "grouped", or "empty" */
  view?: ViewMode;
  /** Pre-populate selection mode for bulk actions */
  initialSelectionMode?: boolean;
  onBack?: () => void;
  onExplore?: () => void;
  onJeCherche?: () => void;
}

export default function Favorites({
  view = "grid",
  initialSelectionMode = false,
  onBack,
  onExplore,
  onJeCherche,
}: FavoritesProps) {
  const [favs, setFavs] = useState<Favorite[]>(FAVORITES);
  const [category, setCategory] = useState<Category>("Tout");
  const [sort, setSort] = useState<SortKey>("Récents");
  const [selectionMode, setSelectionMode] = useState(initialSelectionMode);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Counts per category for chips
  const counts = useMemo(() => {
    const c: Record<string, number> = { Tout: favs.length };
    favs.forEach((f) => {
      c[f.category] = (c[f.category] || 0) + 1;
    });
    return c;
  }, [favs]);

  // Filtered + sorted view
  const visible = useMemo(() => {
    let list =
      category === "Tout" ? favs : favs.filter((f) => f.category === category);
    switch (sort) {
      case "Prix ↑":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "Prix ↓":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case "Boutique":
        list = [...list].sort((a, b) =>
          SELLERS[a.sellerId].name.localeCompare(SELLERS[b.sellerId].name)
        );
        break;
      // "Récents" → keep insertion order (newest first by convention)
    }
    return list;
  }, [favs, category, sort]);

  // Actions
  const unlike = (id: string) =>
    setFavs((prev) => prev.filter((f) => f.id !== id));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const bulkDelete = () => {
    setFavs((prev) => prev.filter((f) => !selectedIds.includes(f.id)));
    cancelSelection();
  };

  // EMPTY view — short-circuit
  if (view === "empty" || favs.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="relative w-full min-h-screen bg-[#F7F8FA] flex flex-col">
          <FavHeader count={0} sort={sort} onSort={setSort} onBack={onBack} />
          <EmptyState onExplore={onExplore} onJeCherche={onJeCherche} />
        </div>
      </>
    );
  }

  // GROUPED view
  if (view === "grouped") {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="relative w-full min-h-screen bg-[#F7F8FA] flex flex-col">
          <FavHeader
            count={favs.length}
            sort="Boutique"
            onSort={setSort}
            onBack={onBack}
          />
          <CategoryChips active="Tout" onChange={() => {}} counts={counts} />
          <GroupedView items={favs} />
        </div>
      </>
    );
  }

  // GRID view (default) — with optional bulk actions
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="relative w-full min-h-screen bg-[#F7F8FA] flex flex-col">
        <FavHeader
          count={favs.length}
          sort={sort}
          onSort={setSort}
          onBack={onBack}
        />
        <CategoryChips
          active={category}
          counts={counts}
          onChange={setCategory}
        />
        <FavGrid
          items={visible}
          onUnlike={unlike}
          selectable={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />

        {selectionMode && selectedIds.length > 0 && (
          <BulkBar
            count={selectedIds.length}
            onCancel={cancelSelection}
            onShare={() => {
              /* hook: share via WhatsApp / native share */
            }}
            onDelete={bulkDelete}
          />
        )}
      </div>
    </>
  );
}

/* Named exports — for reuse in storybook / unit tests / route-level composition */
export {
  FavHeader,
  CategoryChips,
  FavCard,
  BulkBar,
  SellerGroup,
  EmptyState,
  FavGrid,
  GroupedView,
  FAVORITES,
  SELLERS,
};
export type { Favorite, Seller, Category, SortKey, ViewMode };
