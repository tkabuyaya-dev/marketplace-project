/**
 * LoginPage.tsx
 * Nunulia — Écran de connexion (Google OAuth + skip)
 *
 * Route : /login  (utilisateur non authentifié)
 *
 * 3 états gérés via prop `state` :
 *   'idle'     → bouton Google actif
 *   'loading'  → spinner centré dans le bouton, autres actions off
 *   'error'    → banner rouge dismissible + bouton réactif (retry)
 *
 * Dépendances :
 *   - React 18+
 *   - lucide-react  (Globe, ChevronDown, AlertCircle, X, ArrowRight)
 *   - Tailwind CSS  (utilities uniquement, LIGHT-ONLY)
 *
 * Tokens (identiques à ProfileScreen / PlansPage / ProductCard) :
 *   logo gold     #C47E00 → #B07410 (gradient)
 *   cta gold      #F5C842
 *   bg app        #F7F8FA
 *   error         #ef4444
 *   text primary  #111318
 *   text 2        #5C6370
 *   text 3        #9EA5B0
 *   border        rgba(0,0,0,0.08–0.12)
 */

import React, { useState } from "react";
import {
  Globe,
  ChevronDown,
  AlertCircle,
  X,
  ArrowRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LoginState = "idle" | "loading" | "error";
export type LangCode = "fr" | "en";

export interface LoginPageProps {
  /** État courant (contrôlé par le parent / hook auth) */
  state?: LoginState;
  /** Message d'erreur affiché dans le banner (state='error') */
  errorMsg?: string;
  /** Langue courante */
  lang?: LangCode;
  /** Callback au clic "Continuer avec Google" */
  onGoogleSignIn?: () => void;
  /** Callback au clic "Continuer sans compte" */
  onSkip?: () => void;
  /** Callback de changement de langue */
  onLangChange?: (lang: LangCode) => void;
  /** Callback ouverture conditions d'utilisation */
  onOpenTerms?: () => void;
  /** Callback ouverture politique de confidentialité */
  onOpenPrivacy?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — Spinner
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({
  size = 22,
  color = "#9EA5B0",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <div
      className="rounded-full animate-spin flex-shrink-0"
      style={{
        width: size,
        height: size,
        border: `2.5px solid ${color}30`,
        borderTopColor: color,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — GoogleLogo (4-color SVG officiel)
// ─────────────────────────────────────────────────────────────────────────────

function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="flex-shrink-0"
    >
      <path
        fill="#4285F4"
        d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.4 5.6-5 7.3v6h8.1c4.8-4.4 7.2-10.9 7.2-17.4z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 12-2.2 16-5.9l-8.1-6c-2.1 1.4-4.8 2.2-7.9 2.2-6.1 0-11.3-4.1-13.1-9.7H2.5v6.2C6.5 42.8 14.7 48 24 48z"
      />
      <path
        fill="#FBBC05"
        d="M10.9 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-6.2H2.5C.9 16.6 0 20.2 0 24s.9 7.4 2.5 10.8l8.4-6.2z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.5 5.2 2.5 13.2l8.4 6.2c1.8-5.6 7-9.9 13.1-9.9z"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — LangSheet (bottom-sheet)
// ─────────────────────────────────────────────────────────────────────────────

interface LangSheetProps {
  visible: boolean;
  current: LangCode;
  onSelect: (lang: LangCode) => void;
  onClose: () => void;
}

const LANGUAGES: { code: LangCode; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

function LangSheet({ visible, current, onSelect, onClose }: LangSheetProps) {
  if (!visible) return null;
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sélection de la langue"
      className="absolute inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white px-5 pt-5 pb-9
                   animate-[fadeIn_240ms_ease-out]"
        style={{
          borderRadius: "24px 24px 0 0",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.12)",
        }}
      >
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full bg-[#F0F1F4] mx-auto mb-5" />

        <p className="text-sm font-extrabold text-[#111318] mb-3.5 tracking-tight">
          Langue / Language
        </p>

        {LANGUAGES.map((l) => {
          const selected = current === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onSelect(l.code);
                onClose();
              }}
              className="flex items-center gap-3 w-full px-3.5 py-3 rounded-xl mb-2
                         cursor-pointer transition-colors active:bg-gray-50"
              style={{
                background: selected
                  ? "rgba(245,200,66,0.07)"
                  : "#FFFFFF",
                border: selected
                  ? "1.5px solid rgba(245,200,66,0.5)"
                  : "1px solid rgba(0,0,0,0.07)",
              }}
            >
              <span className="text-xl">{l.flag}</span>
              <span className="text-sm font-semibold text-[#111318]">
                {l.label}
              </span>
              {selected && (
                <div
                  className="ml-auto w-[18px] h-[18px] rounded-full flex items-center justify-center"
                  style={{ background: "#F5C842" }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#111318"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — StatusBar (mock iOS — à retirer en prod si vrai SafeArea)
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div className="flex justify-between items-center px-[22px] pt-2.5 pb-1.5
                    text-[11px] font-semibold text-[#111318]">
      <span>9:41</span>
      <div className="flex gap-1.5 items-center">
        <svg width="15" height="11" fill="#111318" viewBox="0 0 15 11">
          <rect x="0" y="7" width="3" height="4" rx="0.5" />
          <rect x="4" y="5" width="3" height="6" rx="0.5" />
          <rect x="8" y="3" width="3" height="8" rx="0.5" />
          <rect x="12" y="0" width="3" height="11" rx="0.5" />
        </svg>
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <rect
            x="0.5"
            y="0.5"
            width="18"
            height="11"
            rx="2"
            stroke="#111318"
            strokeWidth="1"
          />
          <rect x="2" y="2" width="13" height="8" rx="1" fill="#111318" />
          <path d="M19.5 4v4a2 2 0 000-4z" fill="#111318" />
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — LoginPage
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage({
  state = "idle",
  errorMsg = "Connexion échouée. Réessayez.",
  lang = "fr",
  onGoogleSignIn,
  onSkip,
  onLangChange,
  onOpenTerms,
  onOpenPrivacy,
}: LoginPageProps) {
  const [showLangSheet, setShowLangSheet] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const isLoading = state === "loading";
  const hasError = state === "error" && !errorDismissed;

  const handleLangSelect = (l: LangCode) => {
    onLangChange?.(l);
  };

  return (
    <div
      className="relative flex flex-col min-h-full bg-[#F7F8FA]
                 animate-[fadeIn_280ms_ease-out]"
    >
      {/* ── Status bar (mock) ── */}
      <StatusBar />

      {/* ── Language pill (top-right, absolute) ── */}
      <div className="absolute top-[42px] right-4 z-10">
        <button
          type="button"
          onClick={() => !isLoading && setShowLangSheet(true)}
          disabled={isLoading}
          aria-label="Changer la langue"
          className="flex items-center gap-1.5 px-2.5 py-[7px] rounded-full
                     bg-white border cursor-pointer
                     disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "rgba(0,0,0,0.09)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <Globe size={13} color="#5C6370" strokeWidth={2} />
          <span className="text-[11px] font-bold text-[#5C6370] uppercase tracking-wide">
            {lang}
          </span>
          <ChevronDown size={11} color="#9EA5B0" strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Error banner (slide-down) ── */}
      {hasError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 mx-4 mt-14 px-3.5 py-3 rounded-xl
                     animate-[slideDown_260ms_ease-out]"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <AlertCircle size={16} color="#ef4444" strokeWidth={2} />
          <span className="flex-1 text-[13px] font-semibold text-red-600 leading-snug">
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={() => setErrorDismissed(true)}
            aria-label="Fermer"
            className="bg-transparent border-none cursor-pointer p-1 text-red-500"
          >
            <X size={14} color="#ef4444" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8"
        style={{
          paddingTop: hasError ? 24 : 64,
          paddingBottom: 20,
        }}
      >
        {/* Logo wordmark */}
        <h1
          className="text-[44px] font-black leading-none mb-1.5"
          style={{
            fontFamily: "'Inter Display', Inter, sans-serif",
            letterSpacing: "-0.06em",
            background: "linear-gradient(135deg,#C47E00 0%,#B07410 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          NUNULIA
        </h1>

        {/* Tagline */}
        <p className="text-[15px] font-semibold text-[#5C6370] tracking-tight m-0">
          Le marketplace des Grands Lacs
        </p>
        <p className="text-xs text-[#9EA5B0] m-0">
          Achetez et vendez en toute confiance
        </p>

        {/* Country pills */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
          {["🇧🇮 Burundi", "🇨🇩 RDC", "🇷🇼 Rwanda"].map((c) => (
            <span
              key={c}
              className="px-2.5 py-1 rounded-full bg-white text-[11px]
                         font-semibold text-[#5C6370]"
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col gap-3 px-6 pb-3">
        {/* Google sign-in */}
        <button
          type="button"
          onClick={() => !isLoading && onGoogleSignIn?.()}
          disabled={isLoading}
          aria-label="Continuer avec Google"
          className="w-full h-14 flex items-center justify-center
                     rounded-xl bg-white cursor-pointer
                     disabled:cursor-not-allowed transition-all duration-150"
          style={{
            gap: isLoading ? 0 : 12,
            border: "1.5px solid rgba(0,0,0,0.12)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          }}
        >
          {isLoading ? (
            <Spinner size={22} color="#9EA5B0" />
          ) : (
            <>
              <GoogleLogo size={22} />
              <span className="text-[15px] font-bold text-[#111318] tracking-tight">
                Continuer avec Google
              </span>
            </>
          )}
        </button>

        {/* Legal notice */}
        <p className="text-[11px] text-[#9EA5B0] text-center leading-relaxed mx-2 m-0">
          En continuant, vous acceptez nos{" "}
          <button
            type="button"
            onClick={onOpenTerms}
            className="text-[#C47E00] underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 text-[11px]"
          >
            Conditions d'utilisation
          </button>{" "}
          et notre{" "}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-[#C47E00] underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 text-[11px]"
          >
            Politique de confidentialité
          </button>
        </p>

        {/* Skip */}
        <button
          type="button"
          onClick={() => !isLoading && onSkip?.()}
          disabled={isLoading}
          aria-label="Continuer sans compte"
          className="flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-[10px]
                     bg-transparent border-none cursor-pointer
                     transition-opacity duration-150
                     disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-[13px] font-semibold text-[#5C6370]">
            Continuer sans compte
          </span>
          <ArrowRight size={14} color="#9EA5B0" strokeWidth={2} />
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="text-center pb-6">
        <span className="text-[10px] text-[#BCC1CA] tracking-wide">
          v1.0 · © 2026 Nunulia
        </span>
      </div>

      {/* ── Lang sheet ── */}
      <LangSheet
        visible={showLangSheet}
        current={lang}
        onSelect={handleLangSelect}
        onClose={() => setShowLangSheet(false)}
      />
    </div>
  );
}

/*
 * ─── NOTES D'INTÉGRATION ─────────────────────────────────────────────────────
 *
 * USAGE
 *   const [authState, setAuthState] = useState<LoginState>('idle');
 *   const [err, setErr] = useState('');
 *
 *   const handleGoogle = async () => {
 *     setAuthState('loading');
 *     try {
 *       await signInWithGoogle();
 *       router.push('/dashboard');
 *     } catch (e) {
 *       setErr(e.message);
 *       setAuthState('error');
 *     }
 *   };
 *
 *   <LoginPage
 *     state={authState}
 *     errorMsg={err}
 *     lang={i18n.language as LangCode}
 *     onGoogleSignIn={handleGoogle}
 *     onSkip={() => router.push('/')}
 *     onLangChange={(l) => i18n.changeLanguage(l)}
 *     onOpenTerms={() => router.push('/terms')}
 *     onOpenPrivacy={() => router.push('/privacy')}
 *   />
 *
 * KEYFRAMES TAILWIND (theme.extend.keyframes)
 *   fadeIn:    { from:{opacity:'0',transform:'translateY(8px)'},
 *                to:  {opacity:'1',transform:'translateY(0)'} }
 *   slideDown: { from:{opacity:'0',transform:'translateY(-6px)'},
 *                to:  {opacity:'1',transform:'translateY(0)'} }
 *
 * ÉTATS GÉRÉS
 *   idle      → Google btn actif, lang pill actif, skip actif
 *   loading   → Spinner dans Google btn, tous les autres boutons disabled
 *   error     → Banner rouge slide-down + dismiss X, btn Google reste actif
 *
 * ACCESSIBILITÉ
 *   - aria-label sur chaque bouton
 *   - role="dialog" + aria-modal sur le bottom-sheet langue
 *   - role="alert" sur le banner d'erreur (annoncé par le screen reader)
 *   - Tap targets ≥ 44px (h-14 Google btn, py-2.5 skip)
 *
 * STATUS BAR
 *   StatusBar() est un MOCK iOS pour le preview. En production, retirer
 *   le composant et laisser le SafeAreaView du shell prendre le relais.
 *
 * LIGHT-ONLY
 *   Aucune classe dark: utilisée. Toggle géré par le shell parent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
