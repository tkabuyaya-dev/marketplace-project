/**
 * ShopProfile.tsx
 * Nunulia — Page Profil Vendeur (mobile-first PWA)
 *
 * Route : /shop/:shopId
 *
 * Usage :
 *   import ShopProfile from "@/screens/ShopProfile";
 *   <ShopProfile shop={shop} products={items} reviews={reviews} />
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (ArrowLeft, Share2, MoreHorizontal, Heart, Search,
 *                    Star, Check, Phone, ChevronRight, ChevronDown,
 *                    MapPin, Clock, Package, Zap, ShieldCheck, Calendar,
 *                    Image as ImageIcon)
 *   - Tailwind CSS  (utilities uniquement, LIGHT-ONLY — pas de dark:)
 *
 * Tokens (alignés sur HomeScreen / ProductDetail / ProductCard) :
 *   bg app          #F7F8FA
 *   logo gold       linear-gradient(135deg,#C47E00 0%,#B07410 100%)
 *   cta gold        #F5C842
 *   card bg         #FFFFFF
 *   text primary    #111318
 *   text secondary  #5C6370
 *   text muted      #9EA5B0
 *   border          rgba(0,0,0,0.08)
 *   whatsapp        #25D366
 *   verified        #22c55e / #0c8a48
 *
 * Layout :
 *   Cover 180px (gradient + stripes)
 *   → Identity card (-32px overlap, avatar 72px ring)
 *   → Trust metrics 3-col → CTAs WhatsApp + localisation
 *   → Search + category chips → Products grid 2-col (gap 8px)
 *   → About (collapsible) → Reviews
 */

import React, { useState } from "react";
import {
  ArrowLeft,
  Share2,
  MoreHorizontal,
  Heart,
  Search,
  Star,
  Check,
  Phone,
  ChevronRight,
  ChevronDown,
  MapPin,
  Package,
  Zap,
  ShieldCheck,
  Calendar,
  Image as ImageIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CoverVariant = "gold" | "sunset" | "earth";

export interface ShopInfo {
  name: string;                 // "JOCYSHOP"
  tagline: string;              // "La boutique où vos rêves se réalisent 👗"
  initials: string;             // "J" (avatar fallback)
  avatarUrl?: string;
  identityVerified: boolean;
  shopVerified: boolean;
  phoneVerified: boolean;
  rating: number;               // 4.9
  reviewsCount: number;         // 48
  productsCount: number;        // 127
  memberSinceLabel: string;     // "Janvier 2024"
  memberSinceYear: number;      // 2024
  city: string;                 // "Bujumbura"
  country: string;              // "Burundi"
  description: string;
  respondsWithin: string;       // "< 1 heure"
  shipsWithin: string;          // "Sous 24h"
  salesCount: number;           // 247
  whatsappNumber?: string;
}

export interface ShopProduct {
  id: string;
  title: string;
  price: string;                // "45 000 BIF"
  imageUrl?: string;
  liked?: boolean;
  badge?: { label: string; tone: "new" | "discount" | "top" };
}

export interface ShopReview {
  id: string;
  initials: string;
  name: string;
  date: string;                 // "il y a 3 j"
  rating: number;               // 1..5
  comment: string;
  accent?: string;              // hex for avatar fallback
}

export interface Category {
  id: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA (hardcoded preview)
// ─────────────────────────────────────────────────────────────────────────────

const SHOP: ShopInfo = {
  name: "JOCYSHOP",
  tagline: "La boutique où vos rêves se réalisent 👗",
  initials: "J",
  identityVerified: true,
  shopVerified: true,
  phoneVerified: true,
  rating: 4.9,
  reviewsCount: 48,
  productsCount: 127,
  memberSinceLabel: "Janvier 2024",
  memberSinceYear: 2024,
  city: "Bujumbura",
  country: "Burundi",
  description:
    "JOCYSHOP est une boutique artisanale dédiée à la mode féminine africaine. Nous proposons des robes en wax, accessoires faits-main et créations exclusives, cousues localement à Bujumbura par des artisans passionnés.",
  respondsWithin: "< 1 heure",
  shipsWithin: "Sous 24h",
  salesCount: 247,
};

const CATEGORIES: Category[] = [
  { id: "all", label: "Tout" },
  { id: "dresses", label: "Robes" },
  { id: "accessories", label: "Accessoires" },
  { id: "shoes", label: "Chaussures" },
  { id: "bags", label: "Sacs" },
];

const PRODUCTS: ShopProduct[] = [
  { id: "p1", title: "Robe wax élégante longue, motif fleur",          price: "45 000 BIF", badge: { label: "NOUVEAU", tone: "new" } },
  { id: "p2", title: "Sac à main cuir tressé fait-main",               price: "85 000 BIF", liked: true },
  { id: "p3", title: "Boucles d'oreilles dorées artisanales",          price: "15 000 BIF", badge: { label: "−10%", tone: "discount" } },
  { id: "p4", title: "Sandales cuir tressé motif traditionnel",        price: "52 000 BIF" },
  { id: "p5", title: "Robe pagne kitenge taille M, manches courtes",   price: "38 000 BIF" },
  { id: "p6", title: "Pochette wax doublée coton premium",             price: "22 000 BIF", badge: { label: "TOP", tone: "top" } },
];

const REVIEWS: ShopReview[] = [
  {
    id: "r1",
    initials: "MC",
    name: "Marie C.",
    date: "il y a 3 j",
    rating: 5,
    comment:
      "Service au top ! Robe magnifique, exactement comme sur la photo. Livraison rapide à Bujumbura, j'ai déjà recommandé à mes amies.",
    accent: "#D97757",
  },
  {
    id: "r2",
    initials: "GA",
    name: "Grâce A.",
    date: "il y a 1 sem",
    rating: 5,
    comment:
      "Tissu de qualité et finitions impeccables. Jocy est très réactive sur WhatsApp et patiente pour les retouches.",
    accent: "#9B6B8E",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HERO COVER
// ─────────────────────────────────────────────────────────────────────────────

const COVER_GRADIENTS: Record<CoverVariant, string> = {
  gold:   "linear-gradient(135deg,#C47E00 0%,#E8A920 50%,#F5C842 100%)",
  sunset: "linear-gradient(135deg,#B07410 0%,#D97757 60%,#F5C842 100%)",
  earth:  "linear-gradient(135deg,#7A5D3B 0%,#C47E00 60%,#F5C842 100%)",
};

function HeroCover({
  variant,
  onBack,
  onShare,
  onMenu,
}: {
  variant: CoverVariant;
  onBack?: () => void;
  onShare?: () => void;
  onMenu?: () => void;
}) {
  return (
    <div className="relative w-full h-[180px] overflow-hidden"
         style={{ background: COVER_GRADIENTS[variant] }}>
      {/* diagonal stripes */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(60deg, transparent, transparent 22px, rgba(255,255,255,0.07) 22px, rgba(255,255,255,0.07) 24px)",
        }}
      />
      {/* radial glows */}
      <div
        className="absolute -top-10 -right-10 w-[200px] h-[200px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)" }}
      />
      <div
        className="absolute -bottom-16 -left-8 w-[240px] h-[240px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(180,116,16,0.3) 0%, rgba(0,0,0,0) 70%)" }}
      />
      {/* bottom fade */}
      <div
        className="absolute left-0 right-0 bottom-0 h-12 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.10) 100%)" }}
      />

      {/* Floating buttons */}
      <FloatingCircle ariaLabel="Retour" onClick={onBack} className="top-10 left-3.5">
        <ArrowLeft size={17} color="#111318" strokeWidth={2.2} />
      </FloatingCircle>
      <FloatingCircle ariaLabel="Partager" onClick={onShare} className="top-10 right-14">
        <Share2 size={14} color="#111318" strokeWidth={2} />
      </FloatingCircle>
      <FloatingCircle ariaLabel="Plus" onClick={onMenu} className="top-10 right-3.5">
        <MoreHorizontal size={15} color="#111318" strokeWidth={2.2} />
      </FloatingCircle>
    </div>
  );
}

function FloatingCircle({
  children,
  onClick,
  ariaLabel,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`absolute w-9 h-9 rounded-full bg-white border-none cursor-pointer
                  flex items-center justify-center z-[4] active:scale-95 transition-transform ${className}`}
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08)" }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY CARD
// ─────────────────────────────────────────────────────────────────────────────

function IdentityCard({ shop }: { shop: ShopInfo }) {
  return (
    <div
      className="relative z-[2] mx-3 -mt-8 px-4 pb-[18px] bg-white rounded-2xl"
      style={{
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.04)",
      }}
    >
      {/* Avatar overlap */}
      <div className="flex justify-center -mt-8">
        {shop.avatarUrl ? (
          <img
            src={shop.avatarUrl}
            alt={shop.name}
            className="w-[72px] h-[72px] rounded-full object-cover"
            style={{
              border: "3px solid #fff",
              boxShadow: "0 8px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
            }}
          />
        ) : (
          <div
            className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-white font-black"
            style={{
              fontSize: 22,
              letterSpacing: "-0.02em",
              border: "3px solid #fff",
              background: "linear-gradient(135deg,#D97757 0%,#B05B3D 60%,#7A3D29 100%)",
              boxShadow: "0 8px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            {shop.initials}
            <div
              className="absolute inset-[3px] rounded-full pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.06) 6px, rgba(255,255,255,0.06) 7px)",
              }}
            />
          </div>
        )}
      </div>

      {/* Shop name */}
      <h1
        className="mt-2.5 text-center text-[#111318] font-black leading-[1.1]"
        style={{ fontSize: 22, fontFamily: "'Inter', sans-serif", letterSpacing: "-0.035em" }}
      >
        {shop.name}
      </h1>

      {/* Tagline */}
      <p className="mt-1 text-center text-[13px] font-medium leading-[1.4]" style={{ color: "#5C6370" }}>
        {shop.tagline}
      </p>

      {/* Verified pills */}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {shop.identityVerified && <VerifiedPill kind="check" label="Identité" />}
        {shop.shopVerified && <VerifiedPill kind="check" label="Boutique" />}
        {shop.phoneVerified && <VerifiedPill kind="phone" label="Téléphone" />}
      </div>

      {/* Trust score row */}
      <div
        className="mt-3.5 pt-3 flex justify-center items-center gap-2.5"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <span className="flex items-center gap-1">
          <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={2} />
          <span className="text-[11px] font-extrabold text-[#111318]" style={{ letterSpacing: "0.02em" }}>
            {shop.rating.toFixed(1)}
          </span>
          <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: ".06em" }}>
            Note
          </span>
        </span>
        <Dot />
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-extrabold text-[#111318]" style={{ letterSpacing: "0.02em" }}>
            {shop.productsCount}
          </span>
          <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: ".06em" }}>
            Produits
          </span>
        </span>
        <Dot />
        <span className="flex items-center gap-1">
          <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: ".06em" }}>
            Depuis
          </span>
          <span className="text-[11px] font-extrabold text-[#111318]" style={{ letterSpacing: "0.02em" }}>
            {shop.memberSinceYear}
          </span>
        </span>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="w-[3px] h-[3px] rounded-full" style={{ background: "#D0D2D8" }} />;
}

function VerifiedPill({ kind, label }: { kind: "check" | "phone"; label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-[10.5px] font-bold"
      style={{
        background: "rgba(34,197,94,0.10)",
        border: "1px solid rgba(34,197,94,0.28)",
        color: "#0c8a48",
        letterSpacing: "-0.005em",
      }}
    >
      {kind === "check" ? (
        <span
          className="w-3 h-3 rounded-full flex items-center justify-center"
          style={{ background: "#22c55e" }}
        >
          <Check size={7} color="#fff" strokeWidth={4} />
        </span>
      ) : (
        <Phone size={10} color="#0c8a48" strokeWidth={2.4} />
      )}
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUST METRICS
// ─────────────────────────────────────────────────────────────────────────────

function TrustMetrics({ shop }: { shop: ShopInfo }) {
  return (
    <div
      className="mx-3 mt-2.5 px-2 py-3 bg-white rounded-2xl flex items-stretch"
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <Metric icon={<Zap size={14} color="#C47E00" fill="#C47E00" strokeWidth={0} />}
              big={shop.respondsWithin} small="Répond en" />
      <Divider />
      <Metric icon={<Package size={14} color="#C47E00" strokeWidth={2.2} />}
              big={shop.shipsWithin} small="Expédie" />
      <Divider />
      <Metric icon={<ShieldCheck size={14} color="#C47E00" strokeWidth={2.2} />}
              big={`${shop.salesCount} ventes`} small="Confirmées" />
    </div>
  );
}

function Metric({ icon, big, small }: { icon: React.ReactNode; big: string; small: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5 px-1 py-0.5">
      <div
        className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center"
        style={{ background: "rgba(245,200,66,0.12)" }}
      >
        {icon}
      </div>
      <div
        className="text-center text-[#111318] font-extrabold leading-[1.1]"
        style={{ fontSize: 12.5, letterSpacing: "-0.015em" }}
      >
        {big}
      </div>
      <div
        className="text-center text-[#9EA5B0] uppercase font-semibold leading-[1.1]"
        style={{ fontSize: 10, letterSpacing: "0.02em" }}
      >
        {small}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px my-1.5" style={{ background: "rgba(0,0,0,0.06)" }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT CTAs
// ─────────────────────────────────────────────────────────────────────────────

function ContactCTAs({ onWhatsApp, onLocation }: { onWhatsApp?: () => void; onLocation?: () => void }) {
  return (
    <div className="mx-3 mt-2.5 flex flex-col gap-2">
      <button
        type="button"
        onClick={onWhatsApp}
        className="h-12 w-full rounded-2xl border-none cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99] transition-transform"
        style={{
          background: "#25D366",
          boxShadow: "0 6px 16px rgba(37,211,102,0.35), 0 2px 4px rgba(37,211,102,0.18)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <WhatsAppGlyph size={18} color="#fff" />
        <span className="text-white font-extrabold" style={{ fontSize: 14.5, letterSpacing: "-0.01em" }}>
          Contacter sur WhatsApp
        </span>
      </button>

      <button
        type="button"
        onClick={onLocation}
        className="h-[42px] w-full rounded-2xl bg-white cursor-pointer flex items-center justify-center gap-1.5 active:bg-[#FFFBEC] transition-colors"
        style={{ border: "1.5px solid #F5C842", fontFamily: "'Inter', sans-serif" }}
      >
        <MapPin size={13} color="#C47E00" strokeWidth={2.2} />
        <span className="font-extrabold" style={{ fontSize: 13, color: "#C47E00", letterSpacing: "-0.01em" }}>
          Voir localisation
        </span>
      </button>
    </div>
  );
}

function WhatsAppGlyph({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP SEARCH + CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

function ShopSearch({ onClick }: { onClick?: () => void }) {
  return (
    <div className="mx-3 mt-3.5">
      <div
        onClick={onClick}
        className="flex items-center gap-2.5 h-[42px] rounded-full px-4 cursor-pointer"
        style={{ background: "#F0F1F4" }}
      >
        <Search size={16} color="#9EA5B0" strokeWidth={2} />
        <span className="flex-1 text-[13px] font-medium" style={{ color: "#9EA5B0" }}>
          Rechercher dans cette boutique…
        </span>
      </div>
    </div>
  );
}

function CategoryChips({
  categories, selected, onSelect,
}: { categories: Category[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div
      className="mt-3 flex gap-1.5 px-3 pb-1 overflow-x-auto no-scrollbar"
      style={{ scrollbarWidth: "none" }}
    >
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      {categories.map((c) => {
        const active = c.id === selected;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="flex-shrink-0 inline-flex items-center px-3.5 h-8 rounded-full cursor-pointer transition-all duration-150"
            style={{
              background: active ? "#F5C842" : "#FFFFFF",
              border: active ? "none" : "1px solid rgba(0,0,0,0.08)",
              boxShadow: active ? "0 2px 8px rgba(245,200,66,0.35)" : "none",
              color: active ? "#111318" : "#5C6370",
              fontWeight: active ? 800 : 600,
              fontSize: 12,
              letterSpacing: "-0.01em",
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS GRID (2 col, gap 8)
// ─────────────────────────────────────────────────────────────────────────────

const PALETTES: [string, string][] = [
  ["#F5C842", "#E8A920"],
  ["#D97757", "#A85B3D"],
  ["#5B7C99", "#3F5670"],
  ["#7A5D3B", "#54402A"],
  ["#9B6B8E", "#6F4866"],
  ["#3F7A6F", "#2A5249"],
];

function ProductsGrid({ products }: { products: ShopProduct[] }) {
  return (
    <div className="mt-3 px-3 grid grid-cols-2 gap-2">
      {products.map((p, i) => (
        <ProductCard key={p.id} idx={i} p={p} />
      ))}
    </div>
  );
}

function ProductCard({ p, idx }: { p: ShopProduct; idx: number }) {
  const [liked, setLiked] = useState(!!p.liked);
  const badgeStyle: Record<string, { bg: string; color: string }> = {
    new:      { bg: "#10b981", color: "#fff" },
    discount: { bg: "#ef4444", color: "#fff" },
    top:      { bg: "linear-gradient(135deg,#F5C842,#E8A920)", color: "#3D2800" },
  };
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden flex flex-col"
      style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <ProductImg idx={idx} />
        )}
        {p.badge && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full"
            style={{
              background: badgeStyle[p.badge.tone].bg,
              color: badgeStyle[p.badge.tone].color,
              fontSize: 9, fontWeight: 800, letterSpacing: ".05em",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            {p.badge.label}
          </div>
        )}
        <button
          type="button"
          aria-label={liked ? "Retirer favori" : "Ajouter favori"}
          onClick={(e) => { e.stopPropagation(); setLiked(!liked); }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full border-none cursor-pointer flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}
        >
          <Heart size={13} color={liked ? "#ef4444" : "#5C6370"} fill={liked ? "#ef4444" : "none"} strokeWidth={2} />
        </button>
      </div>
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-0.5">
        <span className="font-black leading-none" style={{ fontSize: 13.5, color: "#C47E00", letterSpacing: "-0.02em" }}>
          {p.price}
        </span>
        <p
          className="m-0 font-semibold leading-[1.32] overflow-hidden"
          style={{
            fontSize: 11.5, color: "#111318", minHeight: 30,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}
        >
          {p.title}
        </p>
      </div>
    </div>
  );
}

function ProductImg({ idx, label = "product" }: { idx: number; label?: string }) {
  const [a, b] = PALETTES[idx % PALETTES.length];
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(45deg, transparent, transparent 16px, rgba(255,255,255,0.10) 16px, rgba(255,255,255,0.10) 17px)",
        }}
      />
      <ImageIcon size={36} color="rgba(255,255,255,0.55)" strokeWidth={1.4} />
      <span
        className="font-mono uppercase font-bold"
        style={{ fontSize: 9, color: "rgba(255,255,255,0.78)", letterSpacing: ".06em" }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT (collapsible)
// ─────────────────────────────────────────────────────────────────────────────

function AboutSection({ shop, defaultOpen = false }: { shop: ShopInfo; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="mx-3 mt-3.5 px-4 py-3.5 bg-white rounded-2xl"
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <span className="text-[14px] font-extrabold text-[#111318]" style={{ letterSpacing: "-0.01em" }}>
          À propos de la boutique
        </span>
        <span
          className="inline-flex transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "#9EA5B0" }}
        >
          <ChevronDown size={14} color="#9EA5B0" strokeWidth={2.4} />
        </span>
      </button>

      {open && (
        <div className="mt-2.5">
          <p
            className="font-medium leading-[1.55]"
            style={{ fontSize: 13, color: "#5C6370", textWrap: "pretty" as React.CSSProperties["textWrap"] }}
          >
            {shop.description}
          </p>
          <div
            className="mt-3 pt-2.5 flex flex-col gap-1.5"
            style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "#5C6370" }}>
              <Calendar size={11} color="#9EA5B0" strokeWidth={2} />
              Membre depuis {shop.memberSinceLabel}
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "#5C6370" }}>
              <MapPin size={11} color="#9EA5B0" strokeWidth={2} />
              {shop.city}, {shop.country}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────────────────────

function ReviewsSection({
  rating, reviewsCount, reviews, onSeeAll,
}: { rating: number; reviewsCount: number; reviews: ShopReview[]; onSeeAll?: () => void }) {
  return (
    <div
      className="mx-3 mt-2.5 px-4 pt-3.5 pb-1 bg-white rounded-2xl"
      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[14px] font-extrabold text-[#111318]" style={{ letterSpacing: "-0.01em" }}>
          Avis clients
        </span>
        <span className="flex items-center gap-1">
          <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={2} />
          <span className="text-[12.5px] font-extrabold text-[#111318]">{rating.toFixed(1)}</span>
          <span className="text-[11px] font-semibold" style={{ color: "#9EA5B0" }}>
            ({reviewsCount} avis)
          </span>
        </span>
      </div>

      {reviews.map((r) => (
        <ReviewItem key={r.id} r={r} />
      ))}

      <button
        type="button"
        onClick={onSeeAll}
        className="w-full pt-3 pb-1 bg-transparent border-none cursor-pointer inline-flex items-center justify-center gap-1"
        style={{ color: "#C47E00", fontSize: 12.5, fontWeight: 800, letterSpacing: "-0.01em", fontFamily: "'Inter', sans-serif" }}
      >
        Voir tous les avis
        <ChevronRight size={11} color="#C47E00" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function ReviewItem({ r }: { r: ShopReview }) {
  const accent = r.accent || "#D97757";
  return (
    <div className="py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-extrabold flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
            fontSize: 11, letterSpacing: "-0.01em",
          }}
        >
          {r.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-extrabold text-[#111318]" style={{ letterSpacing: "-0.01em" }}>
            {r.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex gap-px">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={10}
                  color={i < r.rating ? "#F5C842" : "#E4E6EA"}
                  fill={i < r.rating ? "#F5C842" : "#E4E6EA"}
                  strokeWidth={2}
                />
              ))}
            </div>
            <span className="text-[10.5px] font-semibold" style={{ color: "#9EA5B0" }}>
              {r.date}
            </span>
          </div>
        </div>
      </div>
      <p
        className="mt-1.5 font-medium leading-[1.5]"
        style={{ fontSize: 12.5, color: "#5C6370", textWrap: "pretty" as React.CSSProperties["textWrap"] }}
      >
        {r.comment}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — ShopProfile
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopProfileProps {
  shop?: ShopInfo;
  categories?: Category[];
  products?: ShopProduct[];
  reviews?: ShopReview[];
  defaultCategory?: string;
  defaultAboutOpen?: boolean;
  coverVariant?: CoverVariant;

  /* Callbacks — branchez à votre router */
  onBack?: () => void;
  onShare?: () => void;
  onMenu?: () => void;
  onSearch?: () => void;
  onWhatsApp?: () => void;
  onLocation?: () => void;
  onSelectCategory?: (id: string) => void;
  onOpenProduct?: (id: string) => void;
  onSeeAllReviews?: () => void;
}

export default function ShopProfile({
  shop = SHOP,
  categories = CATEGORIES,
  products = PRODUCTS,
  reviews = REVIEWS,
  defaultCategory = "all",
  defaultAboutOpen = false,
  coverVariant = "gold",
  onBack,
  onShare,
  onMenu,
  onSearch,
  onWhatsApp,
  onLocation,
  onSelectCategory,
  onSeeAllReviews,
}: ShopProfileProps) {
  const [category, setCategory] = useState<string>(defaultCategory);

  const handleSelectCategory = (id: string) => {
    setCategory(id);
    onSelectCategory?.(id);
  };

  return (
    <div className="relative min-h-full pb-7 bg-[#F7F8FA]">
      <HeroCover variant={coverVariant} onBack={onBack} onShare={onShare} onMenu={onMenu} />

      <IdentityCard shop={shop} />

      <TrustMetrics shop={shop} />

      <ContactCTAs onWhatsApp={onWhatsApp} onLocation={onLocation} />

      <ShopSearch onClick={onSearch} />

      <CategoryChips categories={categories} selected={category} onSelect={handleSelectCategory} />

      <ProductsGrid products={products} />

      <AboutSection shop={shop} defaultOpen={defaultAboutOpen} />

      <ReviewsSection
        rating={shop.rating}
        reviewsCount={shop.reviewsCount}
        reviews={reviews}
        onSeeAll={onSeeAllReviews}
      />
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * USAGE
 *   <ShopProfile
 *     shop={shopData}
 *     products={catalog}
 *     reviews={reviewList}
 *     coverVariant="gold"
 *     onBack={() => router.back()}
 *     onShare={() => share(shopData)}
 *     onWhatsApp={() => openWhatsApp(shopData.whatsappNumber)}
 *     onLocation={() => router.push(`/map?lat=${lat}&lng=${lng}`)}
 *     onOpenProduct={(id) => router.push(`/p/${id}`)}
 *     onSelectCategory={(id) => trackEvent('shop_filter', { id })}
 *   />
 *
 * STRUCTURE
 *   HeroCover (180px gold gradient + diagonal stripes + 3 floating buttons)
 *   IdentityCard (-32px overlap, avatar 72px ring 3px, name 22/900, tagline,
 *                 verified pills × 3, trust score row ★/produits/depuis)
 *   TrustMetrics (white card, 3 cols : répond / expédie / ventes)
 *   ContactCTAs (WhatsApp #25D366 + Localisation gold-border secondary)
 *   ShopSearch (pill #F0F1F4, identique à HomeScreen)
 *   CategoryChips (h-scroll, identique à HomeScreen)
 *   ProductsGrid (grid-cols-2 gap-2, ratio 4:3)
 *   AboutSection (collapsible, description + member since + location)
 *   ReviewsSection (header rating + 2 reviews + see-all link)
 *
 * TAP TARGETS
 *   - Floating buttons    : 36×36 (zone tactile élargie via shadow halo)
 *   - WhatsApp CTA        : 48 px height
 *   - Localisation CTA    : 42 px height
 *   - Category chips      : 32 px height
 *   - Product cards       : full-card click
 *
 * LIGHT-ONLY
 *   Aucune classe dark: utilisée. Toggle géré par le shell parent.
 *
 * KEYFRAMES
 *   fadeIn — réutilisé depuis Login/Plans/HomeScreen/ProductDetail.
 * ─────────────────────────────────────────────────────────────────────────────
 */
