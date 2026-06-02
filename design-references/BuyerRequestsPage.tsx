// BuyerRequestsPage.tsx
// NUNULIA — Page « Demandes clients » (Je Cherche, vue vendeur)
// Mobile 390×812, LIGHT-ONLY (zéro classe `dark:`).
//
// Sous-composants exportés : FilterChipsBar, RequestCard, PlanGateBanner, EmptyStateView
// Composant par défaut    : BuyerRequestsPage
//
// Stack supposée : React 18 + TypeScript + Tailwind CSS + lucide-react.
// Couleurs custom (à déclarer dans tailwind.config.ts si pas déjà fait) :
//   gold      : "#F5C842"
//   goldText  : "#C47E00"
//   goldBg    : "#FEF9EC"
//   ink       : "#111318"
//   ink2      : "#5C6370"
//   ink3      : "#9EA5B0"
//   appBg     : "#F7F8FA"
//   waGreen   : "#25D366"
// (les classes ci-dessous utilisent surtout l'arbitrary syntax `[#xxxxxx]`
//  donc aucune config Tailwind n'est strictement requise.)

import React from "react";
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  MessageCircle,
  Lock,
  Zap,
  X,
  RefreshCw,
} from "lucide-react";

/* ============================================================ */
/* Types                                                         */
/* ============================================================ */

export type RequestImage = "iphone" | "casque" | null;

export interface BuyerRequest {
  id: string;
  title: string;
  description: string;
  category: string;
  country: string;       // emoji drapeau
  city: string;          // "Bujumbura, Mukaza"
  budget: string;        // "850 000 BIF"
  posted: string;        // "il y a 3h"
  expiresInDays: number; // 1..N
  image: RequestImage;
}

export interface FilterChip {
  label: string;
  active: boolean;
  onClick?: () => void;
}

/* ============================================================ */
/* iOS-style status bar                                          */
/* ============================================================ */

function StatusBar() {
  return (
    <div className="h-11 px-7 flex items-center justify-between bg-white text-[14px] font-bold text-[#111318] relative z-10">
      <span>9:41</span>
      <div className="inline-flex items-center gap-1.5">
        {/* signal */}
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none" aria-hidden>
          <rect x="0" y="7" width="3" height="4" rx="0.5" fill="#111318" />
          <rect x="5" y="5" width="3" height="6" rx="0.5" fill="#111318" />
          <rect x="10" y="3" width="3" height="8" rx="0.5" fill="#111318" />
          <rect x="15" y="1" width="3" height="10" rx="0.5" fill="#111318" />
        </svg>
        {/* wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="#111318" aria-hidden>
          <path d="M8 2.5C5.4 2.5 3.05 3.5 1.3 5.2L0 3.85C2.1 1.85 4.95.7 8 .7s5.9 1.15 8 3.15L14.7 5.2C12.95 3.5 10.6 2.5 8 2.5zm0 3c-1.85 0-3.5.7-4.75 1.85L2 6c1.7-1.55 3.7-2.5 6-2.5s4.3.95 6 2.5L12.75 7.35C11.5 6.2 9.85 5.5 8 5.5zm0 3c-1.1 0-2.05.4-2.8 1.1L4 8.25c1.05-.95 2.45-1.55 4-1.55s2.95.6 4 1.55L10.8 9.6C10.05 8.9 9.1 8.5 8 8.5z" />
        </svg>
        {/* battery */}
        <svg width="26" height="11" viewBox="0 0 26 11" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="22" height="10" rx="2.5" stroke="#111318" opacity="0.4" />
          <rect x="2" y="2" width="19" height="7" rx="1.2" fill="#111318" />
          <rect x="23.5" y="3.5" width="1.5" height="4" rx="0.6" fill="#111318" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Header                                                        */
/* ============================================================ */

function PageHeader({ count, onBack }: { count: number; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-black/5 px-3.5 pt-2.5 pb-3">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onBack}
          aria-label="Retour"
          className="-ml-1.5 w-8 h-8 rounded-[10px] inline-flex items-center justify-center text-[#111318] hover:bg-black/5 active:scale-[0.96] transition"
        >
          <ArrowLeft size={22} strokeWidth={2.25} />
        </button>
        <h1 className="text-[18px] font-black tracking-tight text-[#111318] leading-tight">
          Demandes clients
        </h1>
        {count > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 h-[22px] px-2.5 rounded-full bg-[#F5C842] text-[#111318] text-[11px] font-black"
            style={{ boxShadow: "0 2px 6px rgba(245,200,66,0.45)" }}
          >
            <Search size={12} strokeWidth={2.5} />
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

/* ============================================================ */
/* FilterChipsBar                                                */
/* ============================================================ */

export function FilterChipsBar({
  chips,
  activeFilters = 0,
  onOpenFilters,
}: {
  chips: FilterChip[];
  activeFilters?: number;
  onOpenFilters?: () => void;
}) {
  return (
    <div
      className="flex gap-1.5 px-3 py-2.5 bg-white border-b border-black/5 overflow-x-auto"
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={c.onClick}
          className={[
            "shrink-0 h-9 px-3.5 rounded-full inline-flex items-center gap-1.5",
            "text-[12px] whitespace-nowrap transition-all duration-150",
            "active:scale-[0.95]",
            c.active
              ? "bg-[#F5C842] text-[#111318] font-extrabold border-0"
              : "bg-white text-[#5C6370] font-medium border border-black/[0.08]",
          ].join(" ")}
          style={c.active ? { boxShadow: "0 4px 10px rgba(245,200,66,0.4)" } : undefined}
        >
          {c.label}
        </button>
      ))}

      <button
        onClick={onOpenFilters}
        className="relative shrink-0 h-9 px-3 rounded-full inline-flex items-center gap-1.5 bg-white border border-black/[0.08] text-[#111318] text-[12px] font-bold whitespace-nowrap active:scale-[0.95] transition"
      >
        <SlidersHorizontal size={13} strokeWidth={2.25} className="text-[#5C6370]" />
        Filtres
        {activeFilters > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-black inline-flex items-center justify-center"
            style={{ boxShadow: "0 0 0 2px #fff" }}
          >
            {activeFilters}
          </span>
        )}
      </button>
    </div>
  );
}

/* ============================================================ */
/* Image placeholder                                             */
/* ============================================================ */

function ImagePlaceholder({ kind }: { kind: Exclude<RequestImage, null> }) {
  const bgs: Record<Exclude<RequestImage, null>, string> = {
    iphone: "linear-gradient(140deg,#2d3a52 0%,#4a5670 60%,#6b7a92 100%)",
    casque: "linear-gradient(140deg,#1a1a1a 0%,#2a2a2a 50%,#404040 100%)",
  };
  return (
    <div
      className="w-14 h-14 rounded-xl shrink-0 overflow-hidden border border-black/[0.06] flex items-center justify-center"
      style={{ background: bgs[kind] }}
      aria-hidden
    >
      {kind === "iphone" && (
        <div className="relative w-[26px] h-[38px] rounded-[5px] border-[1.5px] border-white/25"
             style={{ background: "linear-gradient(160deg,#0c1220,#1a2238)" }}>
          <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-[2.5px] rounded-full bg-white/40" />
          <span className="absolute top-[7px] right-[3px] w-[5px] h-[5px] rounded-full bg-white/30 border border-white/40" />
        </div>
      )}
      {kind === "casque" && (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4zM3 19a2 2 0 0 0 2 2h1v-6H3v4z" />
        </svg>
      )}
    </div>
  );
}

/* ============================================================ */
/* Meta + Expiry pills                                           */
/* ============================================================ */

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

function ExpiryPill({ days }: { days: number }) {
  const urgent = days <= 2;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[10px] font-bold whitespace-nowrap border",
        urgent
          ? "bg-[#FEF2F2] border-[#EF4444]/30 text-[#DC2626]"
          : "bg-[#FFF7ED] border-[#F97316]/30 text-[#EA580C]",
      ].join(" ")}
    >
      {urgent && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#EF4444] inline-block"
          style={{ animation: "nu-ping 1.6s ease-out infinite" }}
        />
      )}
      {urgent ? `⚠ Expire dans ${days}j` : `⏳ Expire dans ${days}j`}
    </span>
  );
}

/* ============================================================ */
/* RequestCard                                                   */
/* ============================================================ */

export function RequestCard({
  request,
  locked = false,
  urgencyBadge,
  index = 0,
  onContact,
  onUpgrade,
}: {
  request: BuyerRequest;
  locked?: boolean;
  urgencyBadge?: string;
  index?: number;
  onContact?: (r: BuyerRequest) => void;
  onUpgrade?: () => void;
}) {
  const { title, description, category, city, country, budget, posted, expiresInDays, image } = request;

  return (
    <article
      className="bg-white rounded-2xl border border-black/[0.06] p-3.5"
      style={{
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        animation: `nu-card-in 420ms ${index * 50}ms cubic-bezier(.2,.7,.2,1) both`,
      }}
    >
      {/* Top row */}
      <div className="flex gap-2.5 items-start">
        <div className="flex-1 min-w-0">
          {/* badges */}
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#FEF9EC] border border-[#F5C842]/50 text-[#C47E00] text-[10px] font-bold">
              <Search size={9} strokeWidth={3} />
              Recherche
            </span>
            <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#F0F1F4] text-[#5C6370] text-[10px] font-semibold">
              {category}
            </span>
            {urgencyBadge && (
              <span
                className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#FEF9EC] text-[#C47E00] text-[10px] font-bold"
                style={{ animation: "nu-soft-pulse 4s ease-in-out infinite" }}
              >
                🔥 {urgencyBadge}
              </span>
            )}
          </div>

          {/* title */}
          <h3 className="text-[15px] font-black tracking-tight text-[#111318] leading-tight line-clamp-1">
            {title}
          </h3>
          {/* description */}
          <p className="mt-1 text-[12px] text-[#5C6370] leading-snug line-clamp-2">
            {description}
          </p>
        </div>
        {image && <ImagePlaceholder kind={image} />}
      </div>

      {/* meta pills */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2.5 mb-3">
        <MetaPill>📍 {country} {city}</MetaPill>
        <MetaPill>💰 {budget}</MetaPill>
        <MetaPill>⏱ {posted}</MetaPill>
        <ExpiryPill days={expiresInDays} />
      </div>

      {/* Contact zone */}
      {locked ? (
        <div>
          <div className="h-10 px-3 rounded-xl bg-[#F7F8FA] border border-black/[0.06] flex items-center gap-2">
            <Lock size={14} strokeWidth={2} className="text-[#9EA5B0]" />
            <span
              className="text-[13px] text-[#9EA5B0] tracking-[0.18em]"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", filter: "blur(0.4px)" }}
            >
              +257 ██ ██ ██ ██
            </span>
          </div>
          <button
            onClick={onUpgrade}
            className="mt-2 w-full h-9 rounded-xl inline-flex items-center justify-center gap-1.5 bg-transparent text-[#C47E00] text-[12px] font-extrabold active:scale-[0.98] transition"
            style={{ border: "1.5px solid rgba(245,200,66,0.6)" }}
          >
            <Zap size={13} strokeWidth={2.5} />
            Passer au plan PRO
          </button>
        </div>
      ) : (
        <button
          onClick={() => onContact?.(request)}
          className="w-full h-11 rounded-xl border-0 inline-flex items-center justify-center gap-2 bg-[#25D366] text-white text-[14px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: "0 4px 12px rgba(37,211,102,0.35)" }}
        >
          <MessageCircle size={16} strokeWidth={2.25} fill="#fff" />
          Contacter sur WhatsApp
        </button>
      )}
    </article>
  );
}

/* ============================================================ */
/* PlanGateBanner                                                */
/* ============================================================ */

export function PlanGateBanner({
  title = "Débloquez les contacts acheteurs",
  subtitle = "Plan Basique dès 4 900 BIF/mois",
  cta = "Voir les plans",
  onCta,
}: {
  title?: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div
      className="mx-3 mb-3 mt-3 bg-white rounded-2xl flex items-center gap-3 py-3 px-3.5"
      style={{
        borderLeft: "4px solid #F5C842",
        boxShadow: "0 2px 8px rgba(245,200,66,0.15)",
        animation: "nu-slide-down 320ms cubic-bezier(.2,.7,.2,1) both",
      }}
    >
      <div className="w-9 h-9 rounded-full bg-[#FEF9EC] inline-flex items-center justify-center shrink-0 text-[#C47E00]">
        <Lock size={18} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-black tracking-tight text-[#111318] leading-tight">{title}</p>
        <p className="text-[11px] text-[#5C6370] mt-0.5 leading-snug">{subtitle}</p>
      </div>
      <button
        onClick={onCta}
        className="shrink-0 h-8 px-3.5 rounded-full bg-[#F5C842] border-0 text-[#111318] text-[11px] font-black active:scale-[0.96] transition"
        style={{ boxShadow: "0 2px 8px rgba(245,200,66,0.4)" }}
      >
        {cta}
      </button>
    </div>
  );
}

/* ============================================================ */
/* EmptyStateView                                                */
/* ============================================================ */

export function EmptyStateView({
  onClearFilters,
  onRefresh,
}: {
  onClearFilters?: () => void;
  onRefresh?: () => void;
}) {
  return (
    <div className="pt-16 pb-10 px-6 flex flex-col items-center text-center">
      <div
        className="relative w-40 h-40 rounded-full bg-[#FEF9EC] flex items-center justify-center"
        style={{ boxShadow: "0 0 0 24px rgba(245,200,66,0.08)" }}
      >
        <Search size={64} strokeWidth={1.5} className="text-[#F5C842]" />
        <span
          className="absolute top-7 right-8 w-[26px] h-[26px] rounded-full bg-[#F5C842] text-[#111318] inline-flex items-center justify-center text-[15px] font-black"
          style={{ boxShadow: "0 2px 8px rgba(245,200,66,0.5)", border: "2.5px solid #F7F8FA" }}
        >
          ?
        </span>
        {/* dots flottants */}
        <span className="nu-float-dot absolute -top-1.5 left-4 w-2 h-2 rounded-full bg-[#F5C842]" style={{ animationDelay: "0s" }} />
        <span className="nu-float-dot absolute top-3.5 -right-1 w-1.5 h-1.5 rounded-full bg-[#B07410]" style={{ animationDelay: "0.4s" }} />
        <span className="nu-float-dot absolute bottom-1.5 -left-1.5 w-[7px] h-[7px] rounded-full bg-[#F5C842]" style={{ animationDelay: "0.8s" }} />
      </div>

      <h2 className="mt-6 text-[20px] font-black tracking-tight text-[#111318] leading-tight">
        Aucune demande pour ce filtre
      </h2>
      <p className="mt-2 text-[13px] text-[#5C6370] leading-relaxed max-w-[280px]">
        Essayez un autre pays ou une autre catégorie. Les nouvelles demandes arrivent chaque heure.
      </p>

      <button
        onClick={onClearFilters}
        className="mt-6 w-full max-w-[280px] h-12 rounded-full border-0 bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
        style={{ boxShadow: "0 6px 18px rgba(245,200,66,0.45)" }}
      >
        <X size={16} strokeWidth={2.5} />
        Effacer les filtres
      </button>

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

/* ============================================================ */
/* BuyerRequestsPage — composant racine                          */
/* ============================================================ */

type SellerPlan = "free" | "pro" | "premium";

export interface BuyerRequestsPageProps {
  /** "free" = numéros masqués + plan gate banner. "pro" | "premium" = WhatsApp direct. */
  sellerPlan?: SellerPlan;
  /** Demandes à afficher. Si tableau vide → EmptyStateView. */
  requests?: BuyerRequest[];
  /** Total de demandes actives pour le badge header + meta count. */
  totalActive?: number;
  /** Chips du rail filtres. */
  filterChips?: FilterChip[];
  /** Compteur badge rouge "Filtres". */
  activeFilters?: number;
  /** Callbacks */
  onBack?: () => void;
  onContact?: (r: BuyerRequest) => void;
  onUpgrade?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
  onOpenFilters?: () => void;
}

const DEFAULT_REQUESTS: BuyerRequest[] = [
  {
    id: "r1",
    title: "Cherche iPhone 14 Pro bon état",
    description:
      "Préférence 256 Go, couleur indifférente. Livraison possible Bujumbura centre. Budget négociable si modèle parfait.",
    category: "Électronique",
    country: "🇧🇮",
    city: "Bujumbura, Mukaza",
    budget: "850 000 BIF",
    posted: "il y a 3h",
    expiresInDays: 4,
    image: "iphone",
  },
  {
    id: "r2",
    title: "Cherche robe pagne XL rouge",
    description:
      "Pour mariage civil dans 10 jours. Motif wax classique, coupe ajustée. Disponible essayage Buja.",
    category: "Vêtements",
    country: "🇧🇮",
    city: "Bujumbura, Rohero",
    budget: "45 000 BIF",
    posted: "il y a 2h",
    expiresInDays: 2,
    image: null,
  },
  {
    id: "r3",
    title: "Cherche casque Bluetooth qualité",
    description:
      "Sony WH-1000XM4 ou équivalent. Boîte + accessoires bienvenus. Paiement comptant à la remise.",
    category: "Électronique",
    country: "🇧🇮",
    city: "Bujumbura, Ngagara",
    budget: "120 000 BIF",
    posted: "il y a 5h",
    expiresInDays: 6,
    image: "casque",
  },
];

const DEFAULT_CHIPS: FilterChip[] = [
  { label: "🇧🇮 Burundi", active: true },
  { label: "Bujumbura", active: true },
  { label: "Électronique", active: false },
];

export default function BuyerRequestsPage({
  sellerPlan = "pro",
  requests = DEFAULT_REQUESTS,
  totalActive,
  filterChips = DEFAULT_CHIPS,
  activeFilters = 2,
  onBack,
  onContact,
  onUpgrade,
  onClearFilters,
  onRefresh,
  onOpenFilters,
}: BuyerRequestsPageProps) {
  const isLocked = sellerPlan === "free";
  const count = totalActive ?? requests.length;
  const isEmpty = requests.length === 0;

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col">
      {/* Local keyframes (no Tailwind plugin needed) */}
      <style>{`
        @keyframes nu-card-in {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nu-slide-down {
          0%   { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
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
        .nu-float-dot { animation: nu-float-dot 2.4s ease-in-out infinite; }
      `}</style>

      <StatusBar />
      <PageHeader count={isEmpty ? 0 : count} onBack={onBack} />
      <FilterChipsBar chips={filterChips} activeFilters={activeFilters} onOpenFilters={onOpenFilters} />

      {/* Plan gate banner (FREE uniquement, hors empty state) */}
      {isLocked && !isEmpty && <PlanGateBanner onCta={onUpgrade} />}

      {/* Results count bar */}
      {!isLocked && (
        <div className="px-3.5 py-2 text-[12px] font-medium text-[#9EA5B0]">
          {isEmpty
            ? "0 demandes actives"
            : `${count} demandes actives · triées par date`}
        </div>
      )}

      {/* Body */}
      {isEmpty ? (
        <EmptyStateView onClearFilters={onClearFilters} onRefresh={onRefresh} />
      ) : (
        <div className="flex flex-col gap-3 px-3 pb-6">
          {requests.map((r, i) => (
            <RequestCard
              key={r.id}
              request={r}
              locked={isLocked}
              index={i}
              onContact={onContact}
              onUpgrade={onUpgrade}
              // Sur la 2e carte locked → micro-badge social proof (cf. brief)
              urgencyBadge={isLocked && i === 1 ? "3 vendeurs ont déjà contacté" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
