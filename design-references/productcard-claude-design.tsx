/**
 * ProductCard.tsx
 * Nunulia — Card produit marketplace
 *
 * Usage :
 *   import ProductCard from "@/components/ProductCard";
 *   <ProductCard price={12000} currency="BIF" title="Montre Samsung" sellerName="TechShop" />
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (Heart, MapPin, ShieldCheck, Image as ImageIcon)
 *   - Tailwind CSS  (utilities uniquement, LIGHT-ONLY — pas de dark:)
 *
 * Tokens (identiques à ProfileScreen / PlansPage) :
 *   price gold    #C47E00
 *   cta gold      #F5C842
 *   whatsapp      #25D366
 *   verified      #059669
 *   bg card       #FFFFFF
 *   bg app        #F7F8FA
 *   border        rgba(0,0,0,0.06)
 *
 * Grille recommandée :
 *   mobile  : grid-cols-2
 *   tablet  : grid-cols-3
 *   desktop : grid-cols-4
 *
 * Keyframes Tailwind à ajouter dans tailwind.config.js :
 *   shimmer: {
 *     '0%':   { backgroundPosition: '-400px 0' },
 *     '100%': { backgroundPosition:  '400px 0' },
 *   }
 *   Et dans theme.extend.animation :
 *   shimmer: 'shimmer 1.4s infinite linear',
 */

import React, { useState } from "react";
import { Heart, MapPin, ShieldCheck } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeType = "sponsored" | "lowStock" | "b2b" | "new";

export interface ProductCardProps {
  /** URL de l'image principale (cover, ratio 1:1) */
  imageUrl?: string;
  /** Nombre total de photos — affiche "1/N" si > 1 */
  imageCount?: number;
  /** Badges à afficher en haut-gauche (max 2 rendus) */
  badges?: BadgeType[];
  /** Label de distance ex "📍 2.3 km" — affiché si fourni */
  distanceLabel?: string;
  /** État liked (contrôlé par le parent) */
  liked?: boolean;
  /** Prix actuel (obligatoire) */
  price: number;
  /** Prix barré original — affiché seulement si > price */
  originalPrice?: number;
  /** Code devise : "BIF", "FC", "FRw", "USD" */
  currency: string;
  /** Titre produit (2 lignes max, line-clamp) */
  title: string;
  /** Nom du vendeur */
  sellerName: string;
  /** Affiche l'icône ✓ ShieldCheck si true */
  sellerVerified?: boolean;
  /** Emoji drapeau pays ex "🇧🇮" */
  countryFlag?: string;
  /** Commune / ville du vendeur */
  city?: string;
  /**
   * Si false → le bouton WhatsApp est totalement absent
   * (pas désactivé — simplement non rendu)
   */
  hasWhatsApp?: boolean;
  onCardClick?: () => void;
  onLikeClick?: () => void;
  onWhatsAppClick?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Formate un prix avec séparateur de milliers français */
function formatPrice(n: number, currency: string): string {
  return n.toLocaleString("fr-FR") + "\u00A0" + currency;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — BADGE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeConfig {
  label: string;
  className: string;
}

const BADGE_CONFIGS: Record<BadgeType, BadgeConfig> = {
  sponsored: {
    label: "Sponsorisé",
    className:
      "bg-amber-100/80 border border-amber-300/60 text-amber-700",
  },
  lowStock: {
    label: "Stock limité",
    className:
      "bg-orange-100/80 border border-orange-300/60 text-orange-700",
  },
  b2b: {
    label: "B2B",
    className:
      "bg-indigo-100/80 border border-indigo-300/50 text-indigo-700",
  },
  new: {
    label: "Nouveau",
    className:
      "bg-emerald-100/80 border border-emerald-300/50 text-emerald-700",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — BadgePill
// ─────────────────────────────────────────────────────────────────────────────

function BadgePill({ type }: { type: BadgeType }) {
  const cfg = BADGE_CONFIGS[type];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full
                  text-[9px] font-black tracking-wide leading-none
                  backdrop-blur-sm ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — LikeButton
// ─────────────────────────────────────────────────────────────────────────────

function LikeButton({
  liked,
  onClick,
}: {
  liked: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`
        absolute top-2 right-2 z-10
        w-8 h-8 rounded-full flex items-center justify-center
        border-none outline-none cursor-pointer
        transition-all duration-150 active:scale-[0.88]
        backdrop-blur-sm
        ${liked
          ? "bg-red-500/30"
          : "bg-black/28 hover:bg-black/40"
        }
      `}
    >
      <Heart
        size={15}
        color={liked ? "#ef4444" : "#ffffff"}
        fill={liked ? "#ef4444" : "none"}
        strokeWidth={2}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ImageZone
// ─────────────────────────────────────────────────────────────────────────────

function ImageZone({
  imageUrl,
  imageCount,
  badges,
  distanceLabel,
  liked,
  onLikeClick,
  title,
  hovered,
}: {
  imageUrl?: string;
  imageCount: number;
  badges: BadgeType[];
  distanceLabel?: string;
  liked: boolean;
  onLikeClick?: () => void;
  title: string;
  hovered: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const visibleBadges = badges.slice(0, 2);
  const showCounter = imageCount > 1;

  return (
    /* Wrapper carré 1:1 */
    <div className="relative w-full overflow-hidden" style={{ paddingTop: "100%" }}>

      {/* Shimmer — visible tant que l'image n'est pas chargée */}
      {imageUrl && !imgLoaded && !imgError && (
        <div
          className="absolute inset-0 animate-[shimmer_1.4s_infinite_linear]"
          style={{
            background:
              "linear-gradient(90deg,#F0F1F4 25%,#E4E6EA 50%,#F0F1F4 75%)",
            backgroundSize: "800px 100%",
          }}
        />
      )}

      {/* Placeholder sans image */}
      {(!imageUrl || imgError) && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#F0F1F4] to-[#E4E6EA] flex items-center justify-center">
          {/* Image placeholder icon */}
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#BCC1CA"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}

      {/* Image principale */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
          style={{
            opacity: imgLoaded ? 1 : 0,
            transform: hovered ? "scale(1.05)" : "scale(1)",
          }}
        />
      )}

      {/* Badges top-left (max 2) */}
      {visibleBadges.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {visibleBadges.map((b) => (
            <BadgePill key={b} type={b} />
          ))}
        </div>
      )}

      {/* Like button top-right */}
      <LikeButton liked={liked} onClick={onLikeClick} />

      {/* Compteur photos bottom-right */}
      {showCounter && (
        <div
          className="absolute bottom-1.5 right-2 z-10
                     px-1.5 py-0.5 rounded-full
                     text-[9px] font-bold text-white
                     backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          1/{imageCount}
        </div>
      )}

      {/* Distance bottom-left */}
      {distanceLabel && (
        <div
          className="absolute bottom-1.5 left-2 z-10
                     flex items-center gap-1
                     px-1.5 py-0.5 rounded-full
                     text-[9px] font-bold text-white
                     backdrop-blur-sm"
          style={{ background: "rgba(16,185,129,0.82)" }}
        >
          {distanceLabel}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — InfoZone
// ─────────────────────────────────────────────────────────────────────────────

function InfoZone({
  price,
  originalPrice,
  currency,
  title,
  sellerName,
  sellerVerified,
  countryFlag,
  city,
}: Pick<
  ProductCardProps,
  | "price"
  | "originalPrice"
  | "currency"
  | "title"
  | "sellerName"
  | "sellerVerified"
  | "countryFlag"
  | "city"
>) {
  const hasPromo = !!originalPrice && originalPrice > price;

  return (
    <div className="flex flex-col gap-1 px-2.5 pt-2.5 pb-1.5">

      {/* Prix */}
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span
          className="text-[15px] font-black leading-none tracking-tight"
          style={{ color: "#C47E00" }}
        >
          {formatPrice(price, currency)}
        </span>
        {hasPromo && (
          <span className="text-[11px] font-medium text-gray-400 line-through leading-none">
            {formatPrice(originalPrice!, currency)}
          </span>
        )}
      </div>

      {/* Titre — 2 lignes max */}
      <p
        className="text-[12px] font-semibold text-[#111318] leading-snug
                   overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {title}
      </p>

      {/* Vendeur */}
      <div className="flex items-center gap-1 mt-0.5">
        <span
          className="text-[11px] font-medium text-[#5C6370] flex-1 min-w-0
                     overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {sellerName}
        </span>
        {sellerVerified && (
          <ShieldCheck
            size={11}
            color="#059669"
            strokeWidth={2}
            className="flex-shrink-0"
          />
        )}
        {countryFlag && (
          <span className="text-[12px] flex-shrink-0">{countryFlag}</span>
        )}
      </div>

      {/* Ville */}
      {city && (
        <div className="flex items-center gap-1">
          <MapPin size={10} color="#9EA5B0" strokeWidth={2} />
          <span className="text-[10px] font-medium text-gray-400">{city}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WhatsAppPill
// ─────────────────────────────────────────────────────────────────────────────

function WhatsAppPill({ onClick }: { onClick?: () => void }) {
  return (
    <div className="px-2.5 pb-2.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="w-full flex items-center justify-center gap-1.5
                   py-2 rounded-[9px] border-none cursor-pointer
                   text-white text-[12px] font-bold tracking-[-0.01em]
                   active:brightness-90 transition-[filter] duration-150"
        style={{ background: "#25D366" }}
      >
        {/* WhatsApp SVG inline — pas disponible dans lucide */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Contacter
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — ProductCard
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductCard({
  imageUrl,
  imageCount = 1,
  badges = [],
  distanceLabel,
  liked = false,
  price,
  originalPrice,
  currency,
  title,
  sellerName,
  sellerVerified = false,
  countryFlag,
  city,
  hasWhatsApp = true,
  onCardClick,
  onLikeClick,
  onWhatsAppClick,
}: ProductCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role={onCardClick ? "button" : undefined}
      tabIndex={onCardClick ? 0 : undefined}
      onClick={onCardClick}
      onKeyDown={(e) => e.key === "Enter" && onCardClick?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative flex flex-col rounded-xl overflow-hidden
        bg-white border border-black/[0.06]
        transition-all duration-200
        ${onCardClick ? "cursor-pointer" : ""}
      `}
      style={{
        boxShadow: hovered
          ? "0 8px 24px rgba(0,0,0,0.13)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      {/* Image zone */}
      <ImageZone
        imageUrl={imageUrl}
        imageCount={imageCount}
        badges={badges}
        distanceLabel={distanceLabel}
        liked={liked}
        onLikeClick={onLikeClick}
        title={title}
        hovered={hovered}
      />

      {/* Info zone */}
      <InfoZone
        price={price}
        originalPrice={originalPrice}
        currency={currency}
        title={title}
        sellerName={sellerName}
        sellerVerified={sellerVerified}
        countryFlag={countryFlag}
        city={city}
      />

      {/* WhatsApp CTA — totalement absent si hasWhatsApp === false */}
      {hasWhatsApp && (
        <WhatsAppPill onClick={onWhatsAppClick} />
      )}
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * GRILLE RECOMMANDÉE
 *   <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
 *     {products.map(p => <ProductCard key={p.id} {...p} />)}
 *   </div>
 *
 * SHIMMER KEYFRAME (tailwind.config.js)
 *   theme.extend.keyframes:
 *     shimmer: {
 *       '0%':   { backgroundPosition: '-400px 0' },
 *       '100%': { backgroundPosition:  '400px 0' },
 *     }
 *   theme.extend.animation:
 *     shimmer: 'shimmer 1.4s infinite linear',
 *
 * ÉTATS GÉRÉS
 *   imageUrl absent / erreur  → placeholder gris + icône image
 *   imageUrl en cours         → shimmer animé (opacity 0 → 1 au onLoad)
 *   liked = true              → fond rouge 30%, cœur rouge filled
 *   badges max 2              → slice(0,2) côté rendu
 *   hasWhatsApp = false       → WhatsAppPill non rendu (pas disabled)
 *   originalPrice > price     → prix barré visible
 *   imageCount > 1            → compteur "1/N" bas-droite
 *   distanceLabel             → badge vert bas-gauche
 *   sellerVerified            → icône ShieldCheck vert #059669
 *
 * TAP TARGETS
 *   LikeButton  : 32×32 px  (w-8 h-8)
 *   WhatsAppPill: 32 px height min (py-2 + text-[12px])
 *   Card entière: onCardClick → role="button" + tabIndex pour a11y
 *
 * LIGHT-ONLY
 *   Aucune classe dark: utilisée.
 *   Le toggle dark mode est géré par le shell applicatif parent.
 *
 * PERFORMANCES 2G/3G
 *   - Shimmer affiché immédiatement (CSS only, pas de JS)
 *   - Image à opacity:0 jusqu'au onLoad → pas de flash
 *   - Pas de lazy-load intégré : ajoutez loading="lazy" via imageUrl
 *     ou wrappez dans un IntersectionObserver au niveau grille
 * ─────────────────────────────────────────────────────────────────────────────
 */
