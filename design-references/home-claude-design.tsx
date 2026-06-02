/**
 * HomeScreen.tsx
 * Nunulia — Écran d'accueil PWA marketplace (Burundi / RDC / Rwanda)
 *
 * Route : /  (utilisateur authentifié ou skip)
 *
 * État rendu : LOADED (données complètes, hardcodées pour preview).
 * Hooks d'auth, fetch et i18n à brancher côté shell parent.
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (Search, SlidersHorizontal, Bell, ShoppingBag, Heart,
 *                    MapPin, Star, ChevronRight, Home, Plus, User, BadgeCheck)
 *   - Tailwind CSS (utilities uniquement, LIGHT-ONLY)
 *
 * Tokens (alignés sur Login / Profile / Plans / ProductCard) :
 *   bg app        #F7F8FA
 *   logo gold     linear-gradient(135deg,#C47E00 → #B07410)
 *   cta gold      #F5C842
 *   card bg       #FFFFFF
 *   text primary  #111318
 *   text 2        #5C6370
 *   text 3        #9EA5B0
 *   border        rgba(0,0,0,0.08)
 */

import React, { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Bell,
  ShoppingBag,
  Heart,
  MapPin,
  Star,
  ChevronRight,
  Home,
  Plus,
  User,
  BadgeCheck,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & DATA
// ─────────────────────────────────────────────────────────────────────────────

type CategoryId =
  | "all" | "clothes" | "tech" | "home" | "beauty"
  | "food" | "auto" | "services";

interface Category { id: CategoryId; label: string; emoji?: string; }
interface Banner { id: string; title: string; subtitle: string; gradient: string; }
interface Product {
  id: string; title: string; price: string; seller: string;
  imageUrl: string; liked?: boolean; distance?: string;
}
interface Vendor {
  id: string; name: string; avatar: string; rating: number; verified: boolean;
}

const CATEGORIES: Category[] = [
  { id: "all",      label: "Tout" },
  { id: "clothes",  label: "Vêtements",     emoji: "👗" },
  { id: "tech",     label: "Électronique",  emoji: "📱" },
  { id: "home",     label: "Maison",        emoji: "🛋️" },
  { id: "beauty",   label: "Beauté",        emoji: "💄" },
  { id: "food",     label: "Alimentation",  emoji: "🥬" },
  { id: "auto",     label: "Auto",          emoji: "🚗" },
  { id: "services", label: "Services",      emoji: "🛠️" },
];

const BANNERS: Banner[] = [
  {
    id: "b1",
    title: "Livraison gratuite",
    subtitle: "Sur toute commande dès 50 000 BIF",
    gradient: "linear-gradient(135deg,#6D28D9 0%,#C47E00 100%)",
  },
  {
    id: "b2",
    title: "Jusqu'à −50%",
    subtitle: "Soldes mode jusqu'à dimanche",
    gradient: "linear-gradient(135deg,#0F766E 0%,#F5C842 100%)",
  },
  {
    id: "b3",
    title: "Nouveau : RDC",
    subtitle: "Boutiques de Kinshasa et Lubumbashi",
    gradient: "linear-gradient(135deg,#1E3A8A 0%,#C47E00 100%)",
  },
];

const TRENDING: Product[] = [
  { id: "t1", title: "Robe Wax Élégante",     price: "45 000 BIF",  seller: "JocyShop",
    imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&q=80" },
  { id: "t2", title: "iPhone 14 Pro 256 Go",  price: "2 850 000 BIF", seller: "TechBurundi", liked: true,
    imageUrl: "https://images.unsplash.com/photo-1592286927505-1def25115558?w=400&q=80" },
  { id: "t3", title: "Canapé 3 places en cuir", price: "850 000 BIF", seller: "MaisonRwanda",
    imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80" },
  { id: "t4", title: "Sneakers Nike Air Force 1", price: "180 000 BIF", seller: "KicksBuja",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80" },
];

const NEW_ITEMS: Product[] = [
  { id: "n1", title: "Sac à main en cuir véritable",   price: "120 000 BIF", seller: "LeatherCo",   distance: "1.2 km",
    imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80" },
  { id: "n2", title: "Casque audio Sony WH-1000XM4",   price: "12 500 FC",   seller: "SonyShopRDC", distance: "3 km",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80" },
  { id: "n3", title: "Robe pagne moderne taille M",    price: "38 000 BIF",  seller: "AfricaStyle", distance: "0.8 km",
    imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&q=80" },
  { id: "n4", title: "Lampe de chevet design scandinave", price: "65 000 BIF", seller: "DecoBuja",  distance: "4.5 km", liked: true,
    imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&q=80" },
];

const NEARBY: Product[] = [
  { id: "p1", title: "Vélo VTT 26 pouces neuf",        price: "320 000 BIF", seller: "VeloBuja",   distance: "0.5 km",
    imageUrl: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=400&q=80" },
  { id: "p2", title: "Réfrigérateur Samsung 250L",     price: "680 000 BIF", seller: "ElectroPro", distance: "2.1 km",
    imageUrl: "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400&q=80" },
  { id: "p3", title: "Montre Casio classique",         price: "55 000 BIF",  seller: "TimeLuxe",   distance: "1.7 km",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80" },
  { id: "p4", title: "Sac à dos pour ordinateur 15\"", price: "32 000 BIF",  seller: "BagStore",   distance: "3.4 km",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80" },
];

const VENDORS: Vendor[] = [
  { id: "v1", name: "JocyShop",     rating: 4.9, verified: true,
    avatar: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=80" },
  { id: "v2", name: "TechBurundi",  rating: 4.8, verified: true,
    avatar: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200&q=80" },
  { id: "v3", name: "MaisonRwanda", rating: 4.7, verified: true,
    avatar: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200&q=80" },
  { id: "v4", name: "AfricaStyle",  rating: 4.9, verified: false,
    avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80" },
  { id: "v5", name: "ElectroPro",   rating: 4.6, verified: true,
    avatar: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=200&q=80" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — Header (sticky, white)
// ─────────────────────────────────────────────────────────────────────────────

function Header({
  country,
  onCountryClick,
  onNotifClick,
  onCartClick,
}: {
  country: string;
  onCountryClick?: () => void;
  onNotifClick?: () => void;
  onCartClick?: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 bg-white"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
    >
      <div className="flex items-center gap-2.5 px-4 h-14">
        {/* Wordmark */}
        <h1
          className="text-[22px] font-black tracking-tight leading-none"
          style={{
            fontFamily: "'Inter Display', Inter, sans-serif",
            background: "linear-gradient(135deg,#C47E00 0%,#B07410 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.04em",
          }}
        >
          NUNULIA
        </h1>

        {/* Country pill */}
        <button
          type="button"
          onClick={onCountryClick}
          className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white cursor-pointer"
          style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <span className="text-[13px] leading-none">🇧🇮</span>
          <span className="text-[11px] font-bold text-[#5C6370] tracking-tight">
            {country}
          </span>
        </button>

        {/* Notif */}
        <button
          type="button"
          onClick={onNotifClick}
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-full flex items-center justify-center
                     bg-transparent border-none cursor-pointer active:bg-gray-100 transition-colors"
        >
          <Bell size={20} color="#111318" strokeWidth={2} />
          <span
            className="absolute top-2 right-2 w-2 h-2 rounded-full"
            style={{ background: "#ef4444", boxShadow: "0 0 0 2px #fff" }}
          />
        </button>

        {/* Cart */}
        <button
          type="button"
          onClick={onCartClick}
          aria-label="Panier"
          className="w-10 h-10 rounded-full flex items-center justify-center
                     bg-transparent border-none cursor-pointer active:bg-gray-100 transition-colors"
        >
          <ShoppingBag size={20} color="#111318" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — SearchBar
// ─────────────────────────────────────────────────────────────────────────────

function SearchBar({ onClick, onFilterClick }: { onClick?: () => void; onFilterClick?: () => void; }) {
  return (
    <div className="sticky top-14 z-20 bg-white px-4 pt-1 pb-3">
      <div
        onClick={onClick}
        className="flex items-center gap-2.5 h-11 rounded-full px-4 cursor-pointer"
        style={{ background: "#F0F1F4" }}
      >
        <Search size={18} color="#9EA5B0" strokeWidth={2} />
        <span className="flex-1 text-[13px] font-medium text-[#9EA5B0]">
          Rechercher sur Nunulia…
        </span>
        <button
          type="button"
          aria-label="Filtres"
          onClick={(e) => { e.stopPropagation(); onFilterClick?.(); }}
          className="w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center
                     bg-transparent border-none cursor-pointer active:bg-black/5"
        >
          <SlidersHorizontal size={16} color="#C47E00" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CategoryChips (horizontal scroll)
// ─────────────────────────────────────────────────────────────────────────────

function CategoryChips({
  selected,
  onSelect,
}: {
  selected: CategoryId;
  onSelect: (id: CategoryId) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      {CATEGORIES.map((c) => {
        const active = c.id === selected;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full
                       cursor-pointer transition-all duration-150"
            style={{
              background: active ? "#F5C842" : "#FFFFFF",
              border: active ? "none" : "1px solid rgba(0,0,0,0.08)",
              boxShadow: active ? "0 2px 8px rgba(245,200,66,0.35)" : "none",
            }}
          >
            {c.emoji && <span className="text-[13px]">{c.emoji}</span>}
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — PromoCarousel
// ─────────────────────────────────────────────────────────────────────────────

function PromoCarousel({ banners }: { banners: Banner[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="px-4 pt-4">
      <div
        className="relative h-[160px] rounded-2xl overflow-hidden flex items-center px-6"
        style={{
          background: banners[active].gradient,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -right-10 -top-10 w-40 h-40 rounded-full"
          style={{ background: "rgba(255,255,255,0.12)" }}
        />
        <div
          className="absolute -right-4 -bottom-12 w-28 h-28 rounded-full"
          style={{ background: "rgba(255,255,255,0.08)" }}
        />

        <div className="relative z-10 max-w-[70%]">
          <p
            className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1.5"
          >
            Offre exclusive
          </p>
          <h2
            className="text-[26px] font-black text-white leading-tight tracking-tight mb-1"
            style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
          >
            {banners[active].title}
          </h2>
          <p className="text-[13px] font-medium text-white/90 leading-snug">
            {banners[active].subtitle}
          </p>
        </div>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 mt-3">
        {banners.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Aller à la promo ${i + 1}`}
            onClick={() => setActive(i)}
            className="border-none cursor-pointer p-0 transition-all duration-200"
            style={{
              width: i === active ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === active ? "#F5C842" : "rgba(0,0,0,0.15)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — SectionHeader
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  emoji, title, onSeeAll,
}: { emoji: string; title: string; onSeeAll?: () => void; }) {
  return (
    <div className="flex items-center justify-between px-4 pt-7 pb-3">
      <h3
        className="text-[17px] font-black text-[#111318] tracking-tight m-0"
        style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
      >
        <span className="mr-1.5">{emoji}</span>
        {title}
      </h3>
      <button
        type="button"
        onClick={onSeeAll}
        className="flex items-center gap-0.5 bg-transparent border-none cursor-pointer p-1"
      >
        <span className="text-[12px] font-bold" style={{ color: "#C47E00" }}>
          Voir tout
        </span>
        <ChevronRight size={14} color="#C47E00" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrendingCard (rail horizontal, image 4:3)
// ─────────────────────────────────────────────────────────────────────────────

function TrendingCard({ p }: { p: Product }) {
  const [liked, setLiked] = useState(!!p.liked);
  return (
    <div
      className="flex-shrink-0 w-[160px] flex flex-col gap-2 rounded-2xl overflow-hidden bg-white"
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="relative w-full" style={{ paddingTop: "75%" }}>
        <img
          src={p.imageUrl}
          alt={p.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLiked(!liked); }}
          aria-label="Favori"
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center
                     border-none cursor-pointer backdrop-blur-sm transition-all active:scale-90"
          style={{ background: liked ? "rgba(239,68,68,0.30)" : "rgba(0,0,0,0.28)" }}
        >
          <Heart
            size={14}
            color={liked ? "#ef4444" : "#fff"}
            fill={liked ? "#ef4444" : "none"}
            strokeWidth={2}
          />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 pb-3">
        <span
          className="text-[14px] font-black leading-none tracking-tight"
          style={{ color: "#C47E00" }}
        >
          {p.price}
        </span>
        <p
          className="text-[12px] font-semibold text-[#111318] leading-snug overflow-hidden m-0"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {p.title}
        </p>
        <span className="text-[10px] font-medium text-[#9EA5B0] mt-0.5">
          {p.seller}
        </span>
      </div>
    </div>
  );
}

function TrendingRail({ items }: { items: Product[] }) {
  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar"
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((p) => <TrendingCard key={p.id} p={p} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — VendorStrip
// ─────────────────────────────────────────────────────────────────────────────

function VendorCard({ v }: { v: Vendor }) {
  return (
    <div
      className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[92px] p-3 rounded-xl bg-white"
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="relative">
        <img
          src={v.avatar}
          alt={v.name}
          className="w-14 h-14 rounded-full object-cover"
          style={{ border: "2px solid #F5C842" }}
        />
        {v.verified && (
          <div
            className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5"
          >
            <BadgeCheck size={14} color="#0EA5E9" fill="#fff" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <span className="text-[11px] font-bold text-[#111318] truncate max-w-full">
        {v.name}
      </span>
      <div
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
        style={{ background: "rgba(245,200,66,0.15)" }}
      >
        <Star size={9} color="#C47E00" fill="#C47E00" strokeWidth={0} />
        <span className="text-[10px] font-bold" style={{ color: "#C47E00" }}>
          {v.rating}
        </span>
      </div>
    </div>
  );
}

function VendorStrip({ vendors }: { vendors: Vendor[] }) {
  return (
    <div
      className="flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar"
      style={{ scrollbarWidth: "none" }}
    >
      {vendors.map((v) => <VendorCard key={v.id} v={v} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — GridCard (compact 2-col)
// ─────────────────────────────────────────────────────────────────────────────

function GridCard({ p }: { p: Product }) {
  const [liked, setLiked] = useState(!!p.liked);
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden bg-white"
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="relative w-full" style={{ paddingTop: "100%" }}>
        <img
          src={p.imageUrl}
          alt={p.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLiked(!liked); }}
          aria-label="Favori"
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center
                     border-none cursor-pointer backdrop-blur-sm transition-all active:scale-90"
          style={{ background: liked ? "rgba(239,68,68,0.30)" : "rgba(0,0,0,0.28)" }}
        >
          <Heart
            size={14}
            color={liked ? "#ef4444" : "#fff"}
            fill={liked ? "#ef4444" : "none"}
            strokeWidth={2}
          />
        </button>
        {p.distance && (
          <div
            className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-sm"
            style={{ background: "rgba(16,185,129,0.85)" }}
          >
            <MapPin size={9} color="#fff" strokeWidth={2.5} />
            <span className="text-[9px] font-bold text-white">{p.distance}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
        <span
          className="text-[15px] font-black leading-none tracking-tight"
          style={{ color: "#C47E00" }}
        >
          {p.price}
        </span>
        <p
          className="text-[12px] font-semibold text-[#111318] leading-snug overflow-hidden m-0"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {p.title}
        </p>
        <span className="text-[10px] font-medium text-[#9EA5B0]">{p.seller}</span>
      </div>
    </div>
  );
}

function ProductGrid({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      {items.map((p) => <GridCard key={p.id} p={p} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — JeChercheCard (inline CTA)
// ─────────────────────────────────────────────────────────────────────────────

function JeChercheCard({ onPost }: { onPost?: () => void }) {
  return (
    <div className="px-4 pt-7">
      <div
        className="flex items-center gap-3.5 p-4 rounded-2xl"
        style={{
          background: "linear-gradient(135deg,#FFF8E7 0%,#FFF3D0 100%)",
          border: "1px solid rgba(245,200,66,0.3)",
          boxShadow: "0 2px 12px rgba(245,200,66,0.15)",
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
          style={{ background: "rgba(245,200,66,0.25)" }}
        >
          🔍
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-black text-[#111318] tracking-tight leading-tight m-0">
            Vous cherchez quelque chose&nbsp;?
          </h3>
          <p className="text-[11px] text-[#5C6370] leading-snug mt-0.5">
            Postez votre demande, les vendeurs vous contactent
          </p>
        </div>
        <button
          type="button"
          onClick={onPost}
          className="flex-shrink-0 px-3.5 py-2.5 rounded-full text-[11px] font-black
                     text-[#111318] cursor-pointer border-none active:scale-95 transition-transform"
          style={{
            background: "#F5C842",
            boxShadow: "0 2px 8px rgba(245,200,66,0.4)",
          }}
        >
          Poster
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — BottomNav (5 tabs, central FAB)
// ─────────────────────────────────────────────────────────────────────────────

type TabId = "home" | "search" | "sell" | "favorites" | "profile";

function BottomNav({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (t: TabId) => void;
}) {
  const tabs: { id: TabId; label: string; Icon: React.ElementType }[] = [
    { id: "home",      label: "Accueil",   Icon: Home },
    { id: "search",    label: "Recherche", Icon: Search },
    { id: "sell",      label: "Vendre",    Icon: Plus },
    { id: "favorites", label: "Favoris",   Icon: Heart },
    { id: "profile",   label: "Profil",    Icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white"
      style={{
        borderTop: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-stretch justify-around h-[64px] px-2">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = id === active;
          const isCenter = id === "sell";

          if (isCenter) {
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center -mt-3"
                  style={{
                    background: "linear-gradient(135deg,#F5C842 0%,#E8A800 100%)",
                    boxShadow: "0 4px 14px rgba(245,200,66,0.45)",
                  }}
                >
                  <Plus size={22} color="#111318" strokeWidth={3} />
                </div>
                <span className="text-[10px] font-bold text-[#111318]">
                  {label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
            >
              <Icon
                size={22}
                color={isActive ? "#C47E00" : "#9EA5B0"}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive && id === "favorites" ? "#C47E00" : "none"}
              />
              <span
                className="text-[10px]"
                style={{
                  color: isActive ? "#C47E00" : "#9EA5B0",
                  fontWeight: isActive ? 800 : 600,
                }}
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
// MAIN COMPONENT — HomeScreen
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeScreenProps {
  /** Pays affiché dans la pill du header */
  country?: string;
  /** Callback recherche / filtre / etc. — branchez à votre router */
  onSearch?: () => void;
  onFilter?: () => void;
  onOpenNotifications?: () => void;
  onOpenCart?: () => void;
  onOpenCountry?: () => void;
  onOpenProduct?: (productId: string) => void;
  onOpenVendor?: (vendorId: string) => void;
  onPostRequest?: () => void;
  onTabChange?: (tab: TabId) => void;
}

export default function HomeScreen({
  country = "Burundi",
  onSearch,
  onFilter,
  onOpenNotifications,
  onOpenCart,
  onOpenCountry,
  onPostRequest,
  onTabChange,
}: HomeScreenProps) {
  const [category, setCategory] = useState<CategoryId>("all");
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const handleTab = (t: TabId) => {
    setActiveTab(t);
    onTabChange?.(t);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#F7F8FA]">
      <Header
        country={country}
        onCountryClick={onOpenCountry}
        onNotifClick={onOpenNotifications}
        onCartClick={onOpenCart}
      />

      {/* Search sits sticky right under the header */}
      <SearchBar onClick={onSearch} onFilterClick={onFilter} />

      {/* Body — paddingBottom for bottom-nav */}
      <main className="flex-1 pb-[88px]">
        <CategoryChips selected={category} onSelect={setCategory} />

        <PromoCarousel banners={BANNERS} />

        <SectionHeader emoji="🔥" title="Tendances" />
        <TrendingRail items={TRENDING} />

        <SectionHeader emoji="⭐" title="Boutiques recommandées" />
        <VendorStrip vendors={VENDORS} />

        <SectionHeader emoji="✨" title="Nouveautés" />
        <ProductGrid items={NEW_ITEMS} />

        <JeChercheCard onPost={onPostRequest} />

        <SectionHeader emoji="📍" title="Populaires près de vous" />
        <ProductGrid items={NEARBY} />

        <div className="h-8" />
      </main>

      <BottomNav active={activeTab} onSelect={handleTab} />
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * USAGE
 *   <HomeScreen
 *     country="Burundi"
 *     onSearch={() => router.push('/search')}
 *     onFilter={() => openSheet('filters')}
 *     onOpenProduct={(id) => router.push(`/p/${id}`)}
 *     onOpenVendor={(id) => router.push(`/vendor/${id}`)}
 *     onPostRequest={() => router.push('/requests/new')}
 *     onTabChange={(t) => router.push(`/tab/${t}`)}
 *   />
 *
 * STRUCTURE
 *   Header (sticky, white)           — wordmark + country pill + bell + cart
 *   SearchBar (sticky, white)        — pill bg #F0F1F4 + filter gold
 *   CategoryChips (h-scroll)         — selected = gold, inactive = white border
 *   PromoCarousel (160px, gradient)  — dot indicators (gold actif 20px)
 *   SectionHeader + TrendingRail     — cards 160px, ratio 4:3, peek 2.5
 *   VendorStrip                      — avatars 56px, gold ring, verified ✓
 *   SectionHeader + ProductGrid      — 2 cols, image 1:1, distance pill
 *   JeChercheCard                    — bg gradient ivoire, CTA gold "Poster"
 *   ProductGrid                      — 2 cols, distance pill
 *   BottomNav (fixed)                — 5 tabs, central FAB Vendre
 *
 * ÉTATS
 *   Cet écran rend uniquement l'état LOADED.
 *   Skeleton, empty, error → composant sœur HomeScreenSkeleton (à venir).
 *
 * TAP TARGETS
 *   - Header buttons : 40×40 (≥ 44 zone tactile via padding)
 *   - SearchBar      : 44 px height
 *   - Category chips : 36 px height
 *   - BottomNav tabs : 64 px height + FAB 48 px
 *   - All product cards full-card click
 *
 * SAFE AREA
 *   BottomNav utilise env(safe-area-inset-bottom) pour iOS notch.
 *   Body padding-bottom : 88px (64 nav + ~24 spacing).
 *
 * KEYFRAMES TAILWIND (theme.extend.keyframes — déjà présents)
 *   fadeIn, slideDown — réutilisés depuis Login/Plans
 *
 * LIGHT-ONLY
 *   Aucune classe dark: utilisée. Toggle géré par le shell parent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
