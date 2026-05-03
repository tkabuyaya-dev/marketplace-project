/**
 * PlansPage.tsx
 * Nunulia — Page tarifaire vendeur
 *
 * Route : /plans  (rôle seller | admin uniquement)
 *
 * Flow 4 étapes géré par useState local :
 *   'plans' → 'payment' → 'confirmation' → 'done'
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (ArrowLeft, Check, CheckCircle2, Clock, AlertTriangle,
 *                    Info, Phone, LayoutDashboard, MessageCircle)
 *   - Tailwind CSS (classe utilitaires)
 *
 * Notes d'implémentation :
 *   - Tokens identiques à ProfileScreen (gold #C47E00 / #F5C842, bg #F7F8FA)
 *   - Mobile-first, tap targets ≥ 44 px, typo plancher 11 px
 *   - Le plan "Découverte" (gratuit) ne s'affiche PAS dans la grille
 *   - La grille est 2 cols sur mobile, 4 cols à partir de lg
 *   - La card Business Pro a un badge "⭐ Plus choisi", scale 1.03, ombre dorée
 *   - NIF badge (jaune ambre) affiché si plan.nif === true
 *   - CTA désactivé si plan.id === currentPlanId  → badge "Plan actuel" vert
 *   - CTA remplacé par badge "En attente" si l'ID est dans pendingPlanIds
 *   - Les prix et méthodes de paiement varient selon userCountry
 */

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
  Phone,
  LayoutDashboard,
  MessageCircle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Step = "plans" | "payment" | "confirmation" | "done";
type CountryCode = "BI" | "CD" | "RW" | "US";
type PlanId = "starter" | "pro" | "elite" | "wholesale";

interface PaymentMethod {
  id: string;
  name: string;
  number: string;
  color: string;
}

interface CountryConfig {
  name: string;
  flag: string;
  currency: string;
  plans: Record<PlanId, string>;
  methods: PaymentMethod[];
}

interface Plan {
  id: PlanId;
  name: string;
  range: string;
  nif: boolean;
  featured?: boolean;
  features: string[];
}

interface PlansPageProps {
  /** Code pays ISO-2 de l'utilisateur connecté */
  userCountry?: CountryCode;
  /** ID du plan actuel de l'utilisateur ("free" = Découverte gratuit) */
  currentPlanId?: string;
  /** IDs des plans ayant une demande en attente */
  pendingPlanIds?: PlanId[];
  /** Callback appelé quand l'utilisateur clique "Retour au dashboard" */
  onGoToDashboard?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const COUNTRY_DATA: Record<CountryCode, CountryConfig> = {
  BI: {
    name: "Burundi",
    flag: "🇧🇮",
    currency: "BIF",
    plans: {
      starter: "5 000",
      pro: "12 000",
      elite: "22 000",
      wholesale: "40 000",
    },
    methods: [
      { id: "lumicash", name: "Lumicash", number: "*144#", color: "#22c55e" },
      { id: "ecocash", name: "Ecocash", number: "*111#", color: "#f59e0b" },
    ],
  },
  CD: {
    name: "RDC",
    flag: "🇨🇩",
    currency: "FC",
    plans: {
      starter: "10 000",
      pro: "25 000",
      elite: "45 000",
      wholesale: "80 000",
    },
    methods: [
      { id: "mpesa", name: "M-Pesa", number: "*150#", color: "#16a34a" },
      { id: "airtel", name: "Airtel Money", number: "*185#", color: "#ef4444" },
      { id: "orange", name: "Orange Money", number: "*144#", color: "#f97316" },
    ],
  },
  RW: {
    name: "Rwanda",
    flag: "🇷🇼",
    currency: "FRw",
    plans: {
      starter: "6 000",
      pro: "14 000",
      elite: "26 000",
      wholesale: "48 000",
    },
    methods: [
      { id: "momo", name: "MTN MoMo", number: "*182#", color: "#eab308" },
    ],
  },
  US: {
    name: "International",
    flag: "🌐",
    currency: "USD",
    plans: { starter: "3", pro: "7", elite: "12", wholesale: "20" },
    methods: [
      {
        id: "western",
        name: "Western Union",
        number: "westernunion.com",
        color: "#facc15",
      },
      {
        id: "moneygram",
        name: "MoneyGram",
        number: "moneygram.com",
        color: "#3b82f6",
      },
    ],
  },
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    range: "6 – 15 produits",
    nif: false,
    features: [
      "Jusqu'à 15 annonces",
      "Photos HD",
      "Messagerie acheteurs",
      "Stats basiques",
    ],
  },
  {
    id: "pro",
    name: "Business Pro",
    range: "16 – 30 produits",
    nif: true,
    featured: true,
    features: [
      "Jusqu'à 30 annonces",
      "Photos HD + vidéos",
      "Mise en avant catégorie",
      "Stats avancées",
      "Badge vérifié",
      "Support prioritaire",
    ],
  },
  {
    id: "elite",
    name: "Élite",
    range: "31 – 50 produits",
    nif: true,
    features: [
      "Jusqu'à 50 annonces",
      "Tout Business Pro",
      "Bandeau boutique",
      "Export CSV",
      "API basique",
    ],
  },
  {
    id: "wholesale",
    name: "Grossiste",
    range: "51+ produits",
    nif: true,
    features: [
      "Annonces illimitées",
      "Tout Élite",
      "Gestionnaire dédié",
      "Intégration ERP",
      "SLA garanti",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Bouton WhatsApp vert réutilisé dans plusieurs étapes */
function WhatsAppBtn({ label = "Besoin d'aide ? WhatsApp" }: { label?: string }) {
  return (
    <a
      href="https://wa.me/25779000000"
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                 text-green-700 text-sm font-semibold no-underline
                 bg-green-50 border border-green-200
                 active:bg-green-100 transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      {label}
    </a>
  );
}

/** Indicateur de progression (4 pastilles) */
function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["plans", "payment", "confirmation", "done"];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center gap-1">
      {steps.map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{
            width: i === idx ? 18 : 6,
            background: i <= idx ? "#F5C842" : "rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — PLAN GRID
// ─────────────────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: Plan;
  countryConfig: CountryConfig;
  currentPlanId?: string;
  pendingPlanIds: PlanId[];
  onSelect: (plan: Plan) => void;
}

function PlanCard({
  plan,
  countryConfig,
  currentPlanId,
  pendingPlanIds,
  onSelect,
}: PlanCardProps) {
  const price = countryConfig.plans[plan.id];
  const currency = countryConfig.currency;
  const isPro = !!plan.featured;
  const isCurrent = plan.id === currentPlanId;
  const isPending = pendingPlanIds.includes(plan.id);
  const isDisabled = isCurrent || isPending;

  return (
    <div
      className="relative flex flex-col gap-2.5 rounded-2xl p-3.5 transition-transform duration-200"
      style={{
        background: isPro ? "#FFFDF0" : "#FFFFFF",
        border: isPro
          ? "1.5px solid rgba(245,200,66,0.45)"
          : isCurrent
          ? "1.5px solid rgba(16,185,129,0.4)"
          : "1px solid rgba(0,0,0,0.07)",
        boxShadow: isPro
          ? "0 6px 28px rgba(245,200,66,0.18), 0 2px 8px rgba(0,0,0,0.06)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transform: isPro ? "scale(1.03)" : "scale(1)",
      }}
    >
      {isPro && !isCurrent && (
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2
                     px-2.5 py-0.5 rounded-full whitespace-nowrap
                     text-[9px] font-black tracking-wider uppercase text-[#111318]"
          style={{
            background: "linear-gradient(90deg,#F5C842,#E8A800)",
            boxShadow: "0 2px 8px rgba(245,200,66,0.4)",
          }}
        >
          ⭐ Plus choisi
        </div>
      )}
      {isCurrent && (
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2
                     px-2.5 py-0.5 rounded-full whitespace-nowrap
                     text-[9px] font-black tracking-wider uppercase text-emerald-600
                     bg-emerald-50 border border-emerald-200"
        >
          Plan actuel
        </div>
      )}

      <div>
        <p
          className="text-[13px] font-black leading-tight tracking-tight"
          style={{ color: isPro ? "#B07410" : "#111318" }}
        >
          {plan.name}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{plan.range}</p>
      </div>

      <div className="flex items-baseline gap-1 -mt-0.5">
        <span
          className="text-lg font-black tracking-tight leading-none"
          style={{ color: isPro ? "#C47E00" : "#111318" }}
        >
          {price}
        </span>
        <span className="text-[9px] text-gray-400 font-medium">
          {currency}/mois
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{
                background: isPro
                  ? "rgba(245,200,66,0.15)"
                  : "rgba(16,185,129,0.1)",
              }}
            >
              <Check size={9} color={isPro ? "#C47E00" : "#059669"} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] text-gray-500 leading-snug font-medium">
              {f}
            </span>
          </li>
        ))}
      </ul>

      {plan.nif && (
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{
            background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.2)",
          }}
        >
          <AlertTriangle size={10} color="#ca8a04" />
          <span className="text-[9px] text-amber-600 font-semibold">NIF requis</span>
        </div>
      )}

      {isPending ? (
        <div
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold"
          style={{
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
            color: "#3b82f6",
          }}
        >
          <Clock size={11} />
          En attente
        </div>
      ) : (
        <button
          disabled={isDisabled}
          onClick={() => !isDisabled && onSelect(plan)}
          className="w-full py-2.5 rounded-xl text-[11px] font-black
                     transition-all duration-150 active:scale-95 disabled:cursor-default"
          style={{
            background: isDisabled ? "#F0F1F4" : isPro ? "#F5C842" : "#F0F1F4",
            color: isDisabled ? "#BCC1CA" : isPro ? "#111318" : "#5C6370",
            boxShadow: isPro && !isDisabled ? "0 2px 8px rgba(245,200,66,0.3)" : "none",
          }}
        >
          {isCurrent ? "Plan actuel" : "Choisir"}
        </button>
      )}
    </div>
  );
}

function StepPlans({
  countryConfig,
  currentPlanId,
  pendingPlanIds,
  onSelectPlan,
}: {
  countryConfig: CountryConfig;
  currentPlanId?: string;
  pendingPlanIds: PlanId[];
  onSelectPlan: (plan: Plan) => void;
}) {
  return (
    <div className="animate-[fadeIn_280ms_ease-out]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-4 pt-5">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            countryConfig={countryConfig}
            currentPlanId={currentPlanId}
            pendingPlanIds={pendingPlanIds}
            onSelect={onSelectPlan}
          />
        ))}
      </div>

      {pendingPlanIds.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Demandes en attente
          </p>
          <div className="flex flex-col gap-1.5">
            {pendingPlanIds.map((pid, i) => {
              const plan = PLANS.find((p) => p.id === pid);
              const isPaymentPending = i === 0;
              return (
                <div
                  key={pid}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{
                    background: isPaymentPending ? "rgba(249,115,22,0.07)" : "rgba(59,130,246,0.07)",
                    border: `1px solid ${isPaymentPending ? "rgba(249,115,22,0.2)" : "rgba(59,130,246,0.2)"}`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: isPaymentPending ? "#f97316" : "#3b82f6",
                      boxShadow: `0 0 6px ${isPaymentPending ? "rgba(249,115,22,0.5)" : "rgba(59,130,246,0.5)"}`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800">{plan?.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isPaymentPending
                        ? "Paiement en attente de vérification"
                        : "Vérification en cours par l'équipe"}
                    </p>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color: isPaymentPending ? "#f97316" : "#3b82f6",
                      background: isPaymentPending ? "rgba(249,115,22,0.1)" : "rgba(59,130,246,0.1)",
                    }}
                  >
                    {isPaymentPending ? "Paiement" : "Vérif."}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.07] shadow-sm">
          <p className="text-xs font-bold text-gray-800 mb-1">Besoin d'aide pour choisir ?</p>
          <p className="text-[11px] text-gray-400 mb-2.5 leading-snug">
            Notre équipe répond sous 2h en semaine.
          </p>
          <WhatsAppBtn />
        </div>
      </div>
      <div className="h-5" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — PAYMENT
// ─────────────────────────────────────────────────────────────────────────────

function StepPayment({
  plan,
  countryConfig,
  onConfirm,
}: {
  plan: Plan;
  countryConfig: CountryConfig;
  onConfirm: () => void;
}) {
  const price = countryConfig.plans[plan.id];

  return (
    <div className="flex flex-col gap-3 p-4 animate-[fadeIn_280ms_ease-out]">
      <div
        className="flex items-center gap-3 p-3.5 rounded-2xl"
        style={{ background: "rgba(245,200,66,0.07)", border: "1.5px solid rgba(245,200,66,0.3)" }}
      >
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl"
          style={{ background: "rgba(245,200,66,0.15)" }}
        >
          📦
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Plan sélectionné</p>
          <p className="text-[15px] font-black text-gray-900 tracking-tight leading-tight">{plan.name}</p>
          <p className="text-[11px] text-gray-400">{plan.range}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-black tracking-tight leading-none" style={{ color: "#C47E00" }}>{price}</p>
          <p className="text-[10px] text-gray-400">{countryConfig.currency}/mois</p>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden bg-white border border-black/[0.07] shadow-sm">
        <div className="px-3.5 py-3 border-b border-black/[0.05]">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Méthodes disponibles — {countryConfig.flag} {countryConfig.name}
          </p>
        </div>
        {countryConfig.methods.map((m, i) => (
          <React.Fragment key={m.id}>
            {i > 0 && <div className="h-px ml-14" style={{ background: "rgba(0,0,0,0.05)" }} />}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <div
                className="w-[34px] h-[34px] rounded-[9px] flex-shrink-0 flex items-center justify-center"
                style={{ background: `${m.color}18`, border: `1px solid ${m.color}30` }}
              >
                <Phone size={14} color={m.color} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-gray-800">{m.name}</p>
                <p className="text-xs font-bold font-mono tracking-wider mt-0.5" style={{ color: m.color }}>
                  {m.number}
                </p>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div
        className="p-3.5 rounded-2xl"
        style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}
      >
        <div className="flex items-center gap-1.5 mb-2.5">
          <Info size={12} color="#3b82f6" />
          <p className="text-[11px] font-bold text-blue-500">Instructions de paiement</p>
        </div>
        {[
          "Composez le code de votre méthode préférée",
          `Transférez ${price} ${countryConfig.currency} vers le numéro NUNULIA`,
          "Conservez votre reçu ou le code de transaction",
          'Cliquez "Créer ma demande" et saisissez la référence',
        ].map((s, i) => (
          <div key={i} className={`flex items-start gap-2.5 ${i < 3 ? "mb-2" : ""}`}>
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white"
              style={{ background: "#3b82f6" }}
            >
              {i + 1}
            </div>
            <p className="text-[11px] text-blue-500 leading-snug font-medium pt-0.5">{s}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onConfirm}
        className="w-full py-3.5 rounded-xl text-sm font-black text-[#111318] active:scale-[0.98] transition-all duration-150"
        style={{ background: "#F5C842", boxShadow: "0 3px 12px rgba(245,200,66,0.35)" }}
      >
        Créer ma demande
      </button>
      <WhatsAppBtn label="Besoin d'aide ? WhatsApp" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — CONFIRMATION
// ─────────────────────────────────────────────────────────────────────────────

function StepConfirmation({
  plan,
  countryConfig,
  onDone,
  onBackToInstructions,
}: {
  plan: Plan;
  countryConfig: CountryConfig;
  onDone: (txRef: string) => void;
  onBackToInstructions: () => void;
}) {
  const [ref, setRef] = useState("");
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const valid = ref.trim().length >= 4;
  const showError = touched && !valid && ref.length > 0;

  return (
    <div className="flex flex-col gap-3 p-4 animate-[fadeIn_280ms_ease-out]">
      <div
        className="flex items-center gap-2.5 p-3 rounded-xl"
        style={{ background: "rgba(245,200,66,0.06)", border: "1px solid rgba(245,200,66,0.2)" }}
      >
        <span className="text-xl flex-shrink-0">🧾</span>
        <div>
          <p className="text-xs font-bold text-gray-800">
            {plan.name} · {countryConfig.plans[plan.id]} {countryConfig.currency}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Saisissez la référence reçue après paiement
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-black/[0.07] shadow-sm">
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Référence de transaction
        </label>
        <input
          type="text"
          value={ref}
          onChange={(e) => { setRef(e.target.value); setTouched(true); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="ex : TRX-20240501-XXXX"
          className="w-full px-3.5 py-3 rounded-xl text-sm font-semibold font-mono
                     tracking-wider outline-none transition-all duration-200
                     text-gray-900 placeholder-gray-300"
          style={{
            background: "#FFFFFF",
            border: `1.5px solid ${focused ? "#F5C842" : showError ? "#ef4444" : "rgba(0,0,0,0.12)"}`,
            boxShadow: focused ? "0 0 0 3px rgba(245,200,66,0.12)" : "none",
          }}
        />
        {showError && (
          <div className="flex items-center gap-1 mt-1.5">
            <AlertTriangle size={11} color="#ef4444" />
            <p className="text-[11px] text-red-500">Référence trop courte (min 4 caractères)</p>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2 leading-snug">
          La référence figure sur le SMS ou le reçu de votre opérateur mobile.
        </p>
      </div>

      <button
        disabled={!valid}
        onClick={() => valid && onDone(ref)}
        className="w-full py-3.5 rounded-xl text-sm font-black transition-all duration-150
                   active:scale-[0.98] disabled:cursor-not-allowed"
        style={{
          background: valid ? "#F5C842" : "#D0D3DA",
          color: valid ? "#111318" : "#9EA5B0",
          boxShadow: valid ? "0 3px 12px rgba(245,200,66,0.35)" : "none",
        }}
      >
        Confirmer le paiement
      </button>
      <button
        onClick={onBackToInstructions}
        className="text-xs text-gray-400 underline underline-offset-2 py-1.5 bg-transparent border-none cursor-pointer"
      >
        Pas encore payé ? Voir les instructions
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — DONE
// ─────────────────────────────────────────────────────────────────────────────

function StepDone({
  plan,
  txRef,
  onGoToDashboard,
}: {
  plan: Plan;
  txRef: string;
  onGoToDashboard: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5 p-4 animate-[fadeIn_280ms_ease-out]">
      <div
        className="flex flex-col items-center text-center gap-3.5 px-5 py-8 rounded-2xl"
        style={{
          background: "rgba(16,185,129,0.06)",
          border: "1.5px solid rgba(16,185,129,0.25)",
          boxShadow: "0 4px 24px rgba(16,185,129,0.08)",
        }}
      >
        <div className="animate-[checkPop_500ms_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]">
          <CheckCircle2 size={56} color="#10b981" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight leading-tight mb-1.5">
            Demande envoyée !
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-[260px] mx-auto">
            Votre demande de passage au plan{" "}
            <strong className="text-gray-800">{plan.name}</strong> est en cours de vérification.
          </p>
        </div>
        <div
          className="flex flex-col gap-0.5 w-full px-4 py-2.5 rounded-xl"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)" }}
        >
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Référence</p>
          <p className="text-[13px] font-black font-mono tracking-wider" style={{ color: "#C47E00" }}>
            {txRef}
          </p>
        </div>
        <div
          className="flex items-start gap-2 w-full px-3 py-2.5 rounded-xl text-left"
          style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}
        >
          <Info size={13} color="#3b82f6" className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-500 leading-snug font-medium">
            Vous recevrez une notification dès que notre équipe aura validé votre paiement (en général sous 24h).
          </p>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={onGoToDashboard}
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl
                     text-sm font-semibold text-gray-500 bg-white border border-black/[0.07]
                     active:bg-gray-50 transition-colors"
        >
          <LayoutDashboard size={15} />
          Dashboard
        </button>
        <a
          href="https://wa.me/25779000000"
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl
                     text-sm font-bold text-green-700 no-underline transition-colors"
          style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          WhatsApp
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

export default function PlansPage({
  userCountry = "BI",
  currentPlanId = "free",
  pendingPlanIds = [],
  onGoToDashboard,
}: PlansPageProps) {
  const [step, setStep] = useState<Step>("plans");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [txRef, setTxRef] = useState("");

  const countryConfig = COUNTRY_DATA[userCountry] ?? COUNTRY_DATA.BI;

  useEffect(() => {
    setStep("plans");
    setSelectedPlan(null);
    setTxRef("");
  }, [userCountry, currentPlanId]);

  const handleSelectPlan = (plan: Plan) => { setSelectedPlan(plan); setStep("payment"); };
  const handlePaymentConfirm = () => setStep("confirmation");
  const handleConfirmationDone = (ref: string) => { setTxRef(ref); setStep("done"); };
  const handleBackToInstructions = () => setStep("payment");
  const handleGoHome = () => { setStep("plans"); setSelectedPlan(null); setTxRef(""); onGoToDashboard?.(); };

  const stepTitles: Record<Step, string> = {
    plans: "Choisir un plan",
    payment: "Paiement",
    confirmation: "Confirmer le paiement",
    done: "Demande envoyée",
  };

  const showBackButton = step !== "plans" && step !== "done";
  const handleBack = () => {
    if (step === "payment") setStep("plans");
    else if (step === "confirmation") setStep("payment");
  };

  return (
    <div className="flex flex-col min-h-full bg-[#F7F8FA]">
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 bg-[#F7F8FA]"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}
      >
        {showBackButton ? (
          <button
            onClick={handleBack}
            aria-label="Retour"
            className="w-11 h-11 rounded-xl flex items-center justify-center
                       bg-[#F0F1F4] border-none cursor-pointer flex-shrink-0
                       active:bg-[#EAECF0] transition-colors"
          >
            <ArrowLeft size={18} color="#5C6370" />
          </button>
        ) : (
          <div className="w-11 h-11 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <h1
            className="text-[17px] font-black tracking-tight leading-tight text-gray-900"
            style={{ fontFamily: "'Inter Display', Inter, sans-serif" }}
          >
            {stepTitles[step]}
          </h1>
          {step === "plans" && (
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              <span>Plan actuel : <strong className="text-emerald-600 font-bold">Gratuit</strong></span>
              <span className="text-gray-300">·</span>
              <span>{countryConfig.flag} {countryConfig.name}</span>
            </p>
          )}
          {step !== "plans" && selectedPlan && (
            <p className="text-[11px] text-gray-400 mt-0.5">{selectedPlan.name}</p>
          )}
        </div>

        <StepDots step={step} />
      </div>

      {/* Body */}
      <div className="flex-1">
        {step === "plans" && (
          <StepPlans
            countryConfig={countryConfig}
            currentPlanId={currentPlanId}
            pendingPlanIds={pendingPlanIds}
            onSelectPlan={handleSelectPlan}
          />
        )}
        {step === "payment" && selectedPlan && (
          <StepPayment
            plan={selectedPlan}
            countryConfig={countryConfig}
            onConfirm={handlePaymentConfirm}
          />
        )}
        {step === "confirmation" && selectedPlan && (
          <StepConfirmation
            plan={selectedPlan}
            countryConfig={countryConfig}
            onDone={handleConfirmationDone}
            onBackToInstructions={handleBackToInstructions}
          />
        )}
        {step === "done" && selectedPlan && (
          <StepDone
            plan={selectedPlan}
            txRef={txRef}
            onGoToDashboard={handleGoHome}
          />
        )}
      </div>
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * tailwind.config.js — theme.extend.keyframes :
 *   fadeIn:   { from: { opacity:'0', transform:'translateY(8px)' },
 *               to:   { opacity:'1', transform:'translateY(0)' } }
 *   checkPop: { '0%':  { transform:'scale(0)',   opacity:'0' },
 *               '60%': { transform:'scale(1.2)', opacity:'1' },
 *               '100%':{ transform:'scale(1)',   opacity:'1' } }
 *
 * Usage :
 *   <PlansPage
 *     userCountry="BI"
 *     currentPlanId="free"
 *     pendingPlanIds={["starter"]}
 *     onGoToDashboard={() => router.push("/dashboard")}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */
