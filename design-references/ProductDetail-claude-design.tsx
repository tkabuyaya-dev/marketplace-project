/**
 * ProductDetail.tsx
 * Nunulia — Page Détail Produit (mobile-first PWA)
 *
 * Usage :
 *   import ProductDetail from "@/screens/ProductDetail";
 *   <ProductDetail product={p} seller={s} similar={items} />
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (ArrowLeft, Share2, Heart, MapPin, Clock, Shield,
 *                    ShieldCheck, Star, ChevronRight, Package, MessageCircle,
 *                    Eye, Image as ImageIcon)
 *   - Tailwind CSS  (utilities uniquement, LIGHT-ONLY — pas de dark:)
 *
 * Tokens :
 *   bg app        #F7F8FA
 *   card bg       #FFFFFF
 *   text primary  #111318
 *   text secondary #5C6370
 *   text muted    #9EA5B0
 *   logo gold     #C47E00 → #B07410 (gradient)
 *   cta gold      #F5C842
 *   whatsapp      #25D366
 *   verified      #10B981 / #047857
 *   border        rgba(0,0,0,0.06)
 *   radius card   16px (rounded-2xl) — 20px overlap (rounded-t-[20px])
 *
 * Layout :
 *   Galerie 52vw → Carte info overlap (-16px) → Cards stacked (gap 10–12px)
 *   → CTA fixe bottom safe-area
 */

import React, { useState } from "react";
import {
  ArrowLeft,
  Share2,
  Heart,
  MapPin,
  Clock,
  Shield,
  ShieldCheck,
  Star,
  ChevronRight,
  Package,
  MessageCircle,
  Eye,
  Image as ImageIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ProductBadge = "sponsored" | "lowStock" | "new";

export interface SellerInfo {
  name: string;
  initials: string;            // ex: "TB" (avatar fallback)
  avatarUrl?: string;
  verified: boolean;
  rating: number;              // ex: 4.9
  reviewsCount: number;        // ex: 184
  salesCount: number;          // ex: 247
  shipsWithinHours: number;    // ex: 24
  respondsFast: boolean;
}

export interface ProductDetail {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  currency: "BIF" | "CDF" | "RWF" | "TZS" | "KES" | "UGX" | "USD";
  city: string;
  postedRelative: string;      // ex: "Il y a 2h"
  views: number;
  imageUrls: string[];         // peut être vide → placeholder
  badge?: ProductBadge;
  description: string;
  details: { label: string; value: string }[];
}

export interface SimilarProduct {
  id: string;
  title: string;
  priceLabel: string;          // pré-formaté
  imageUrl?: string;
  badge?: { label: string; tone: "success" | "danger" | "warning" };
}

export interface ProductDetailProps {
  product: ProductDetail;
  seller: SellerInfo;
  similar?: SimilarProduct[];
  initiallyLiked?: boolean;
  onBack?: () => void;
  onShare?: () => void;
  onLikeToggle?: (liked: boolean) => void;
  onSellerClick?: () => void;
  onWhatsAppClick?: () => void;
  onSimilarClick?: (id: string) => void;
  onSafetyTipsClick?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtPrice(n: number, currency: string): string {
  return n.toLocaleString("fr-FR") + " " + currency;
}

function discountPct(price: number, original?: number): number | null {
  if (!original || original <= price) return null;
  return Math.round(((original - price) / original) * 100);
}

const BADGE_STYLES: Record<ProductBadge, { label: string; className: string; shadow: string }> = {
  sponsored: {
    label: "SPONSORISÉ",
    className: "text-[#3D2800] bg-gradient-to-br from-[#F5C842] to-[#E8A920]",
    shadow: "shadow-[0_4px_12px_rgba(245,200,66,0.45)]",
  },
  lowStock: {
    label: "STOCK LIMITÉ",
    className: "text-white bg-[#EF4444]",
    shadow: "shadow-[0_4px_12px_rgba(239,68,68,0.4)]",
  },
  new: {
    label: "NOUVEAU",
    className: "text-white bg-[#10B981]",
    shadow: "shadow-[0_4px_12px_rgba(16,185,129,0.4)]",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SOUS-COMPOSANTS
// ─────────────────────────────────────────────────────────────────────────────

function ImagePlaceholder({ label }: { label?: string }) {
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-[#E2E5EB] to-[#CDD2DB] flex flex-col items-center justify-center gap-2 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(45deg, transparent, transparent 18px, rgba(255,255,255,0.18) 18px, rgba(255,255,255,0.18) 19px)",
        }}
      />
      <ImageIcon size={48} strokeWidth={1.4} className="text-black/20" />
      {label && (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-black/40">
          {label}
        </span>
      )}
    </div>
  );
}

function FloatingButton({
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
      className={
        "absolute z-[4] w-9 h-9 rounded-full bg-white flex items-center justify-center " +
        "shadow-[0_4px_12px_rgba(0,0,0,0.18),0_1px_3px_rgba(0,0,0,0.08)] " +
        "active:scale-90 transition-transform duration-150 " +
        className
      }
    >
      {children}
    </button>
  );
}

function ImageBadge({ kind }: { kind: ProductBadge }) {
  const cfg = BADGE_STYLES[kind];
  return (
    <div
      className={
        "inline-flex items-center px-[11px] py-[6px] rounded-full text-[10px] font-extrabold tracking-[0.06em] leading-none " +
        cfg.className +
        " " +
        cfg.shadow
      }
    >
      {cfg.label}
    </div>
  );
}

function DotIndicators({ count, active }: { count: number; active: number }) {
  return (
    <div className="absolute z-[4] bottom-3.5 left-1/2 -translate-x-1/2 flex gap-1.5 items-center">
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === active;
        return (
          <div
            key={i}
            className={
              "rounded-full transition-all duration-200 " +
              (isActive
                ? "w-2 h-2 bg-[#F5C842] shadow-[0_0_0_2px_rgba(245,200,66,0.25)]"
                : "w-1 h-1 bg-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.2)]")
            }
          />
        );
      })}
    </div>
  );
}

function TrustPill({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full bg-[#F2F4F7] text-[#5C6370] text-[10.5px] font-semibold whitespace-nowrap shrink-0">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#9EA5B0]">
        {label}
      </span>
      <span className="text-[13.5px] font-bold text-[#111318]">{value}</span>
    </div>
  );
}

function MiniCard({
  item,
  onClick,
}: {
  item: SimilarProduct;
  onClick?: () => void;
}) {
  const toneMap: Record<string, string> = {
    success: "bg-[#10B981] text-white",
    danger: "bg-[#EF4444] text-white",
    warning: "bg-[#F59E0B] text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 w-[140px] rounded-2xl bg-white border border-black/5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col text-left active:scale-[0.98] transition-transform"
    >
      <div className="relative w-full h-[100px]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <ImagePlaceholder label="photo" />
        )}
        {item.badge && (
          <div className="absolute top-1.5 left-1.5">
            <div
              className={
                "px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold tracking-[0.05em] shadow-[0_2px_6px_rgba(0,0,0,0.12)] " +
                (toneMap[item.badge.tone] || toneMap.success)
              }
            >
              {item.badge.label}
            </div>
          </div>
        )}
      </div>
      <div className="px-2.5 py-2.5 flex flex-col gap-1">
        <span className="text-[13px] font-black text-[#C47E00] tracking-[-0.02em] leading-none">
          {item.priceLabel}
        </span>
        <span className="text-[11px] font-semibold text-[#111318] leading-[1.35] line-clamp-2">
          {item.title}
        </span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductDetailScreen({
  product,
  seller,
  similar = [],
  initiallyLiked = false,
  onBack,
  onShare,
  onLikeToggle,
  onSellerClick,
  onWhatsAppClick,
  onSimilarClick,
  onSafetyTipsClick,
}: ProductDetailProps) {
  const [liked, setLiked] = useState(initiallyLiked);
  const [activeIdx, setActiveIdx] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    onLikeToggle?.(next);
  };

  const pct = discountPct(product.price, product.originalPrice);
  const imgs = product.imageUrls.length > 0 ? product.imageUrls : [undefined];

  return (
    <div className="relative min-h-full bg-[#F7F8FA] pb-[92px] font-sans">

      {/* ── 1. GALERIE ── */}
      <div className="relative w-full">
        <div className="relative w-full h-[52vw] min-h-[240px] max-h-[280px]">
          {imgs[activeIdx] ? (
            <img
              src={imgs[activeIdx]}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImagePlaceholder label={product.title} />
          )}

          {/* Floating actions */}
          <FloatingButton ariaLabel="Retour" onClick={onBack} className="top-[42px] left-3.5">
            <ArrowLeft size={17} strokeWidth={2.2} className="text-[#111318]" />
          </FloatingButton>
          <FloatingButton ariaLabel="Partager" onClick={onShare} className="top-[42px] right-3.5">
            <Share2 size={14} strokeWidth={2} className="text-[#111318]" />
          </FloatingButton>
          <FloatingButton
            ariaLabel={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
            onClick={toggleLike}
            className="top-[86px] right-3.5"
          >
            <Heart
              size={14}
              strokeWidth={2}
              className={liked ? "text-[#EF4444] fill-[#EF4444]" : "text-[#111318]"}
            />
          </FloatingButton>

          {/* Badge top-left */}
          {product.badge && (
            <div className="absolute z-[3] top-[90px] left-3.5">
              <ImageBadge kind={product.badge} />
            </div>
          )}

          {/* Counter bottom-right */}
          {imgs.length > 1 && (
            <div className="absolute z-[4] bottom-3.5 right-3.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] font-bold tracking-[0.03em]">
              {activeIdx + 1} / {imgs.length}
            </div>
          )}

          {/* Dots */}
          {imgs.length > 1 && <DotIndicators count={imgs.length} active={activeIdx} />}
        </div>
      </div>

      {/* ── 2. CARTE INFO PRINCIPALE (overlap -16px) ── */}
      <div className="relative z-[2] -mt-4 bg-white rounded-t-[20px] px-[18px] pt-5 pb-4 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        {/* Prix */}
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-[28px] font-black text-[#111318] tracking-[-0.035em] leading-none">
            {product.price.toLocaleString("fr-FR")}{" "}
            <span className="text-[18px] font-extrabold text-[#5C6370] tracking-[-0.02em]">
              {product.currency}
            </span>
          </span>
          {product.originalPrice && (
            <span className="text-[13px] text-[#9EA5B0] font-medium line-through">
              {fmtPrice(product.originalPrice, product.currency)}
            </span>
          )}
          {pct !== null && (
            <div className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 text-[11px] font-extrabold tracking-[-0.01em]">
              −{pct}%
            </div>
          )}
        </div>

        {/* Titre */}
        <p className="mt-2.5 text-[18px] font-bold text-[#111318] leading-[1.32] tracking-[-0.015em] line-clamp-2 [text-wrap:pretty]">
          {product.title}
        </p>

        {/* Lieu + heure + vues */}
        <div className="mt-2 flex items-center gap-2.5 text-[#9EA5B0]">
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
            <MapPin size={11} strokeWidth={2} />
            {product.city}
          </span>
          <span className="w-[3px] h-[3px] rounded-full bg-[#D0D2D8]" />
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
            <Clock size={11} strokeWidth={2} />
            {product.postedRelative}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold">
            <Eye size={11} strokeWidth={2} />
            {product.views}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-black/[0.06] my-3.5" />

        {/* Vendeur */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full p-0.5 shrink-0 shadow-[0_2px_8px_rgba(245,200,66,0.35)]"
            style={{ background: "linear-gradient(135deg, #F5C842 0%, #C47E00 100%)" }}
          >
            <div className="w-full h-full rounded-full border-2 border-white bg-gradient-to-br from-[#4F5159] to-[#2A2C32] flex items-center justify-center text-[#F5C842] text-[15px] font-black tracking-[-0.02em]">
              {seller.avatarUrl ? (
                <img src={seller.avatarUrl} alt={seller.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                seller.initials
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-extrabold text-[#111318] tracking-[-0.01em] truncate">
                {seller.name}
              </span>
              {seller.verified && (
                <div className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck size={11} strokeWidth={2.4} className="text-emerald-700" />
                  <span className="text-[9.5px] font-extrabold text-emerald-700 tracking-[0.02em]">VÉRIFIÉE</span>
                </div>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <Star size={11} strokeWidth={2} className="text-[#F5C842] fill-[#F5C842]" />
              <span className="text-[12px] font-bold text-[#111318]">{seller.rating.toFixed(1)}</span>
              <span className="text-[11px] font-medium text-[#9EA5B0]">
                ({seller.reviewsCount} avis)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSellerClick}
            className="inline-flex items-center gap-0.5 text-[#C47E00] text-[12px] font-extrabold tracking-[-0.01em] py-1.5"
          >
            Boutique
            <ChevronRight size={11} strokeWidth={2.4} />
          </button>
        </div>

        {/* Trust pills */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TrustPill icon={<Shield size={11} strokeWidth={2} />}>
            {seller.salesCount} ventes
          </TrustPill>
          <TrustPill icon={<Package size={11} strokeWidth={2} />}>
            Expédie en {seller.shipsWithinHours}h
          </TrustPill>
          {seller.respondsFast && (
            <TrustPill icon={<MessageCircle size={11} strokeWidth={2} />}>
              Répond vite
            </TrustPill>
          )}
        </div>
      </div>

      {/* ── 4. DESCRIPTION ── */}
      <div className="mx-3 mt-2.5 bg-white rounded-2xl border border-black/[0.06] px-4 pt-4 pb-3.5">
        <div className="text-[14px] font-bold text-[#111318] mb-2 tracking-[-0.01em]">
          Description
        </div>
        <p
          className={
            "text-[13.5px] font-medium text-[#5C6370] leading-[1.55] [text-wrap:pretty] " +
            (descExpanded ? "" : "line-clamp-4")
          }
        >
          {product.description}
        </p>
        <button
          type="button"
          onClick={() => setDescExpanded(!descExpanded)}
          className="mt-1.5 inline-flex items-center gap-0.5 text-[#C47E00] text-[12.5px] font-extrabold tracking-[-0.01em]"
        >
          {descExpanded ? "Voir moins" : "Voir plus"}
          <ChevronRight
            size={11}
            strokeWidth={2.4}
            className={"transition-transform duration-200 " + (descExpanded ? "-rotate-90" : "rotate-90")}
          />
        </button>
      </div>

      {/* ── 5. CARACTÉRISTIQUES ── */}
      <div className="mx-3 mt-2.5 bg-white rounded-2xl border border-black/[0.06] px-4 pt-4 pb-3.5">
        <div className="text-[14px] font-bold text-[#111318] mb-3 tracking-[-0.01em]">
          Caractéristiques
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          {product.details.map((d) => (
            <DetailItem key={d.label} label={d.label} value={d.value} />
          ))}
        </div>
      </div>

      {/* ── 6. SAFETY TIP ── */}
      <div
        className="mx-3 mt-2.5 rounded-2xl px-4 py-3.5"
        style={{
          background: "rgba(245,200,66,0.08)",
          border: "1px solid rgba(245,200,66,0.32)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#F5C842] to-[#E8A920] shadow-[0_2px_6px_rgba(245,200,66,0.4)] flex items-center justify-center shrink-0">
            <Shield size={16} strokeWidth={2} className="text-[#3D2800]" />
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-extrabold text-[#3D2800] tracking-[-0.01em]">
              Achetez en toute sécurité
            </div>
            <p className="mt-0.5 text-[12px] font-medium leading-[1.5] [text-wrap:pretty]" style={{ color: "#6B5318" }}>
              Ne payez jamais à l'avance sans voir le produit. Privilégiez les rencontres en lieux publics.
            </p>
            <button
              type="button"
              onClick={onSafetyTipsClick}
              className="mt-2 inline-flex items-center gap-0.5 text-[#C47E00] text-[11.5px] font-extrabold tracking-[-0.01em]"
            >
              Voir les conseils de sécurité
              <ChevronRight size={11} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 7. SIMILAIRES ── */}
      {similar.length > 0 && (
        <div className="mt-[18px] pb-2">
          <div className="px-3.5 flex justify-between items-baseline mb-2.5">
            <div className="text-[14px] font-extrabold text-[#111318] tracking-[-0.015em]">
              Vous aimerez aussi
            </div>
            <button type="button" className="text-[#C47E00] text-[11.5px] font-bold">
              Tout voir
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {similar.map((it) => (
              <MiniCard key={it.id} item={it} onClick={() => onSimilarClick?.(it.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── 8. CTA FIXE BOTTOM ── */}
      <div
        className="absolute left-0 right-0 bottom-0 z-10 bg-white border-t border-black/[0.06] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] flex items-center gap-2.5"
        style={{ padding: "12px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={toggleLike}
          aria-label={liked ? "Retirer des favoris" : "Sauvegarder"}
          className={
            "w-[52px] h-[52px] rounded-2xl bg-white flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95 " +
            (liked ? "border-[1.5px] border-[#EF4444]" : "border-[1.5px] border-[#F5C842]")
          }
        >
          <Heart
            size={20}
            strokeWidth={2}
            className={liked ? "text-[#EF4444] fill-[#EF4444]" : "text-[#C47E00]"}
          />
        </button>

        <button
          type="button"
          onClick={onWhatsAppClick}
          className="flex-1 h-[52px] rounded-2xl bg-[#25D366] flex items-center justify-center gap-2.5 shadow-[0_6px_16px_rgba(37,211,102,0.40),0_2px_4px_rgba(37,211,102,0.20)] active:translate-y-px transition-transform"
        >
          <MessageCircle size={19} strokeWidth={2.2} className="text-white" />
          <span className="text-[15px] font-extrabold text-white tracking-[-0.01em]">
            Contacter sur WhatsApp
          </span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXEMPLE / DONNÉES DEMO (à supprimer en prod)
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_PRODUCT: ProductDetail = {
  id: "NUN-4829",
  title: "iPhone 14 Pro 256Go — Comme neuf",
  price: 850_000,
  originalPrice: 1_000_000,
  currency: "BIF",
  city: "Bujumbura",
  postedRelative: "Il y a 2h",
  views: 142,
  imageUrls: [],
  badge: "sponsored",
  description:
    "iPhone 14 Pro 256Go en parfait état, comme neuf. Acheté il y a 8 mois, toujours utilisé avec coque + verre trempé. Aucune rayure, batterie à 96%. Couleur Deep Purple. Vendu avec boîte d'origine, câble USB-C Lightning et facture officielle Apple. Idéal pour photographes — triple capteur 48MP, mode cinéma 4K. Possibilité de tester sur place avant achat à Bujumbura centre.",
  details: [
    { label: "État", value: "Neuf" },
    { label: "Catégorie", value: "Électronique" },
    { label: "Marque", value: "Apple" },
    { label: "Référence", value: "#NUN-4829" },
    { label: "Stockage", value: "256 Go" },
    { label: "Garantie", value: "3 mois" },
  ],
};

export const DEMO_SELLER: SellerInfo = {
  name: "TechBurundi",
  initials: "TB",
  verified: true,
  rating: 4.9,
  reviewsCount: 184,
  salesCount: 247,
  shipsWithinHours: 24,
  respondsFast: true,
};

export const DEMO_SIMILAR: SimilarProduct[] = [
  {
    id: "1",
    title: "iPhone 13 Pro 128Go — Excellent état",
    priceLabel: "620 000 BIF",
    badge: { label: "NEUF", tone: "success" },
  },
  { id: "2", title: "AirPods Pro 2ème génération", priceLabel: "180 000 BIF" },
  {
    id: "3",
    title: "Coque cuir iPhone 14 Pro",
    priceLabel: "35 000 BIF",
    badge: { label: "−20%", tone: "danger" },
  },
];
