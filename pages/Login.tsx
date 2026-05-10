import React, { useState, useMemo } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, ArrowRight } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { usePreferencesContext } from '../contexts/PreferencesContext';
import { SUPPORTED_LANGUAGES, loadLanguage } from '../i18n';
import { trackLanguageChange } from '../services/analytics';

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 22, color = '#9EA5B0' }: { size?: number; color?: string }) {
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

// ── Google SVG logo officiel 4 couleurs ──────────────────────────────────────

function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="flex-shrink-0">
      <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.4 5.6-5 7.3v6h8.1c4.8-4.4 7.2-10.9 7.2-17.4z" />
      <path fill="#34A853" d="M24 48c6.5 0 12-2.2 16-5.9l-8.1-6c-2.1 1.4-4.8 2.2-7.9 2.2-6.1 0-11.3-4.1-13.1-9.7H2.5v6.2C6.5 42.8 14.7 48 24 48z" />
      <path fill="#FBBC05" d="M10.9 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-6.2H2.5C.9 16.6 0 20.2 0 24s.9 7.4 2.5 10.8l8.4-6.2z" />
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.5 5.2 2.5 13.2l8.4 6.2c1.8-5.6 7-9.9 13.1-9.9z" />
    </svg>
  );
}

// ── LoginPage ─────────────────────────────────────────────────────────────────

const Login: React.FC = () => {
  const { handleLogin, loginLoading, currentUser } = useAuthContext();
  const { enabledLanguages } = usePreferencesContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [showLangSheet, setShowLangSheet] = useState(false);

  const visibleLanguages = useMemo(
    () => SUPPORTED_LANGUAGES.filter(l => enabledLanguages.includes(l.code)),
    [enabledLanguages],
  );
  const currentLang = visibleLanguages.find(l => l.code === i18n.language) ?? visibleLanguages[0];

  const switchLang = async (code: string) => {
    const prev = i18n.language;
    await loadLanguage(code);
    i18n.changeLanguage(code);
    trackLanguageChange(prev, code, '');
    setShowLangSheet(false);
  };

  if (currentUser) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-[#F7F8FA] animate-fade-in">

      {/* ── Pill langue (top-right) ── */}
      {visibleLanguages.length > 1 && (
        <div className="absolute top-4 right-4 z-10">
          <button
            type="button"
            onClick={() => !loginLoading && setShowLangSheet(true)}
            disabled={loginLoading}
            aria-label="Changer la langue"
            className="flex items-center gap-1.5 px-2.5 py-[7px] rounded-full bg-white border
                       cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'rgba(0,0,0,0.09)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <Globe size={13} color="#5C6370" strokeWidth={2} />
            <span className="text-[11px] font-bold text-[#5C6370] uppercase tracking-wide">
              {currentLang?.code ?? i18n.language}
            </span>
            <ChevronDown size={11} color="#9EA5B0" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8"
        style={{ paddingTop: 64, paddingBottom: 20 }}
      >
        {/* Logo wordmark */}
        <h1
          className="text-[44px] font-black leading-none mb-1.5"
          style={{
            fontFamily: "'Inter Display', Inter, sans-serif",
            letterSpacing: '-0.06em',
            background: 'linear-gradient(135deg,#C47E00 0%,#B07410 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          NUNULIA
        </h1>

        <p className="text-[15px] font-semibold text-[#5C6370] tracking-tight m-0">
          {t('auth.loginSubtitle')}
        </p>
        <p className="text-xs text-[#9EA5B0] m-0">Achetez et vendez en toute confiance</p>

        {/* Pills pays */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
          {['🇧🇮 Burundi', '🇨🇩 RDC', '🇷🇼 Rwanda'].map((c) => (
            <span
              key={c}
              className="px-2.5 py-1 rounded-full bg-white text-[11px] font-semibold text-[#5C6370]"
              style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col gap-3 px-6 pb-3">

        {/* Bouton Google */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loginLoading}
          aria-label={t('auth.loginWithGoogle')}
          className="w-full h-14 flex items-center justify-center rounded-xl bg-white
                     cursor-pointer disabled:cursor-not-allowed transition-all duration-150"
          style={{
            gap: loginLoading ? 0 : 12,
            border: '1.5px solid rgba(0,0,0,0.12)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          {loginLoading ? (
            <Spinner size={22} color="#9EA5B0" />
          ) : (
            <>
              <GoogleLogo size={22} />
              <span className="text-[15px] font-bold text-[#111318] tracking-tight">
                {t('auth.loginWithGoogle')}
              </span>
            </>
          )}
        </button>

        {/* Mentions légales */}
        <p className="text-[11px] text-[#9EA5B0] text-center leading-relaxed mx-2 m-0">
          En continuant, vous acceptez nos{' '}
          <Link to="/cgu" className="text-[#C47E00] underline underline-offset-2">
            Conditions d'utilisation
          </Link>{' '}
          et notre{' '}
          <Link to="/politique-confidentialite" className="text-[#C47E00] underline underline-offset-2">
            Politique de confidentialité
          </Link>
        </p>

        {/* Continuer sans compte */}
        <button
          type="button"
          onClick={() => !loginLoading && navigate('/')}
          disabled={loginLoading}
          aria-label={t('auth.continueWithout')}
          className="flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-[10px]
                     bg-transparent border-none cursor-pointer transition-opacity duration-150
                     disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-[13px] font-semibold text-[#5C6370]">
            {t('auth.continueWithout')}
          </span>
          <ArrowRight size={14} color="#9EA5B0" strokeWidth={2} />
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="text-center pb-6">
        <span className="text-[10px] text-[#BCC1CA] tracking-wide">v1.0 · © 2026 Nunulia</span>
      </div>

      {/* ── Bottom-sheet langue ── */}
      {showLangSheet && (
        <div
          onClick={() => setShowLangSheet(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Sélection de la langue"
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white px-5 pt-5 pb-9 animate-slide-up"
            style={{
              borderRadius: '24px 24px 0 0',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div className="w-9 h-1 rounded-full bg-[#F0F1F4] mx-auto mb-5" />
            <p className="text-sm font-extrabold text-[#111318] mb-3.5 tracking-tight">
              Langue / Language
            </p>

            {visibleLanguages.map((l) => {
              const selected = i18n.language === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => switchLang(l.code)}
                  className="flex items-center gap-3 w-full px-3.5 py-3 rounded-xl mb-2
                             cursor-pointer transition-colors active:bg-gray-50"
                  style={{
                    background: selected ? 'rgba(245,200,66,0.07)' : '#FFFFFF',
                    border: selected ? '1.5px solid rgba(245,200,66,0.5)' : '1px solid rgba(0,0,0,0.07)',
                  }}
                >
                  <span className="text-xl">{l.flag}</span>
                  <span className="text-sm font-semibold text-[#111318]">{l.label}</span>
                  {selected && (
                    <div
                      className="ml-auto w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ background: '#F5C842' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="#111318" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
