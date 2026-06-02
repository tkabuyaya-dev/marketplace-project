/**
 * NUNULIA — Photo Studio Card (dashboard vendeur, vue Overview)
 *
 * Phase 6 du Photo Studio rollout. Carte d'entrée côté vendeur qui :
 *   - Affiche l'état temps réel de la dernière session (8 états via usePhotoSession)
 *   - Permet de démarrer une nouvelle session (CTA → WhatsApp avec message pré-tapé)
 *   - Affiche le tracker mini-stepper (Ouverte → En attente → Traitement → Prêtes)
 *   - Redirige vers /studio/:id quand session ready (CTA pulsant doré)
 *
 * Insertion : pages/SellerDashboard.tsx, vue activeTab === 'overview', ligne
 * 1310 (après Stats Grid, avant Buyer Requests Feature Banner).
 *
 * Le hook usePhotoSession() fait 100 % du data work (Firestore realtime +
 * quota + startSession callable). Ce composant est pur vue + UX.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Sparkles, Check } from 'lucide-react';
import i18n from '../../i18n';
import { useAppContext } from '../../contexts/AppContext';
import { useToast } from '../Toast';
import { usePhotoSession, StudioCardState } from '../../hooks/usePhotoSession';

const isFR = () => !i18n.language?.startsWith('en');

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatCountdown(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h${minutes < 10 ? '0' : ''}${minutes}`;
  return `${minutes} min`;
}

// Map cardState → step actif (0..3) ou -1 si pas de session active
function stepIndexFor(state: StudioCardState): number {
  switch (state) {
    case 'session_waiting':    return 1; // step "En attente" actif (Ouverte passé)
    case 'session_processing': return 2; // step "Traitement" actif
    case 'session_ready':      return 3; // step "Prêtes" actif (toutes passées sauf elle)
    default:                   return -1;
  }
}

// ─── Mini-stepper inline ─────────────────────────────────────────────────

interface MiniStepperProps {
  activeIndex: number;
}

const MiniStepper: React.FC<MiniStepperProps> = ({ activeIndex }) => {
  const { t } = useTranslation();
  const labels = [
    t('studio.stepOpened'),
    t('studio.stepWaiting'),
    t('studio.stepProcessing'),
    t('studio.stepReady'),
  ];

  return (
    <div className="flex items-start gap-1">
      {labels.map((label, i) => {
        const isPassed = i < activeIndex;
        const isActive = i === activeIndex;
        const dotClass = isActive
          ? 'bg-gold-400 text-ink ring-2 ring-amber-400/40 ring-offset-2 ring-offset-[#FFF3D0]'
          : isPassed
          ? 'bg-gold-400 text-ink'
          : 'bg-white/60 text-ink2 border border-black/[0.08]';
        const labelClass =
          isActive || isPassed ? 'font-bold text-ink' : 'text-ink2';

        return (
          <React.Fragment key={i}>
            <div className="flex-1 flex flex-col items-center min-w-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-bold transition ${dotClass}`}
              >
                {isPassed ? <Check size={12} strokeWidth={3} /> : i + 1}
              </div>
              <p
                className={`text-[10.5px] mt-1 leading-tight text-center truncate w-full px-0.5 ${labelClass}`}
                title={label}
              >
                {label}
              </p>
            </div>
            {i < labels.length - 1 && (
              <div
                className={`h-0.5 flex-shrink-0 w-3 sm:w-6 mt-3 ${
                  isPassed ? 'bg-gold-400' : 'bg-white/60'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Skeleton de chargement ──────────────────────────────────────────────

const StudioCardSkeleton: React.FC = () => (
  <div
    className="rounded-card border shadow-card overflow-hidden h-[160px] animate-pulse"
    style={{
      background: 'linear-gradient(135deg, #FFFDF4 0%, #FFF3D0 100%)',
      borderColor: 'rgba(245, 200, 66, 0.20)',
    }}
  />
);

// ─── Carte ──────────────────────────────────────────────────────────────

export const PhotoStudioCard: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    cardState,
    session,
    quota,
    startSession,
    starting,
    startError,
  } = usePhotoSession();

  // Tick TTL chaque minute quand session active (waiting/processing/ready)
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (
      !session ||
      session.status === 'published' ||
      session.status === 'expired'
    ) {
      return;
    }
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [session?.id, session?.status]);

  // Surface startError via toast (une fois par changement)
  useEffect(() => {
    if (!startError) return;
    let msg = startError.message;
    if (startError.kind === 'quota_exhausted') msg = t('studio.errorQuotaExceeded');
    else if (startError.kind === 'permission') msg = t('studio.pageNotYours');
    else if (startError.kind === 'network') msg = t('studio.errorOffline');
    else if (startError.kind === 'unauthenticated') {
      msg = startError.message || 'Reconnectez-vous.';
    }
    toast(msg, 'error');
  }, [startError, t, toast]);

  const handleStart = useCallback(async () => {
    const res = await startSession();
    if (res?.whatsappLink) {
      window.location.href = res.whatsappLink;
    }
  }, [startSession]);

  const handleViewReady = useCallback(() => {
    if (session) navigate(`/studio/${session.id}`);
  }, [navigate, session]);

  // Garde : seulement pour vendeurs (l'admin voit aussi le dashboard via la
  // condition du SellerDashboard, mais la carte Studio n'a pas de sens pour
  // un admin — il opère plutôt depuis /admin > onglet Photo Studio).
  if (!currentUser || currentUser.role !== 'seller') return null;

  if (cardState === 'loading') return <StudioCardSkeleton />;

  const tierLabel = currentUser.sellerDetails?.tierLabel || '';
  const countdown = session?.expiresAt ? formatCountdown(session.expiresAt) : '';
  const stepIdx = stepIndexFor(cardState);
  const showStepper = stepIdx >= 0;

  // Configuration par état
  let title = '';
  let tagline = '';
  let ctaLabel = '';
  let ctaAction: (() => void) | null = null;
  let ctaPulse = false;
  let ctaDisabled = false;
  let ctaIcon: React.ReactNode = null;

  switch (cardState) {
    case 'idle_can_start':
      title = t('studio.cardTitle');
      tagline = t('studio.cardTagline');
      ctaLabel = starting ? '...' : t('studio.cardCtaStart');
      ctaAction = handleStart;
      ctaDisabled = starting;
      break;

    case 'idle_quota_exhausted':
      title = t('studio.cardTitle');
      tagline = t('studio.cardQuotaExhausted');
      ctaLabel = t('studio.cardQuotaExhausted');
      ctaDisabled = true;
      break;

    case 'session_waiting':
      title = t('studio.stepWaiting');
      tagline = t('studio.whatsappOpenHint');
      break;

    case 'session_processing':
      title = t('studio.stepProcessing');
      tagline = t('studio.ttlNotice');
      break;

    case 'session_ready':
      title = `${t('studio.stepReady')} ✨`;
      tagline = t('studio.pageSubtitleReady');
      ctaLabel = t('studio.cardCtaViewReady');
      ctaAction = handleViewReady;
      ctaPulse = true;
      ctaIcon = <Sparkles size={15} />;
      break;

    case 'session_expired':
      title = t('studio.cardExpired');
      tagline = t('studio.pageBodyExpired');
      ctaLabel = starting ? '...' : t('studio.cardCtaRetry');
      ctaAction = handleStart;
      ctaDisabled = starting;
      break;

    case 'service_disabled':
      // Kill switch admin actif (Phase 8) — appSettings/studio.enabled === false.
      // Pas de CTA, pas de tracker, pas de quota affiché — message neutre.
      title = isFR()
        ? 'Service temporairement indisponible'
        : 'Service temporarily unavailable';
      tagline = isFR()
        ? 'Le Photo Studio reviendra très bientôt.'
        : 'Photo Studio will be back very soon.';
      break;

    default:
      // session_published est rendu impossible par le hook (retombe sur idle).
      return null;
  }

  const ctaBaseClass =
    'inline-flex items-center justify-center gap-2 px-5 h-11 rounded-input font-semibold text-[14px] transition-transform';
  const ctaEnabledClass = `bg-gold-400 text-ink hover:bg-goldHov active:scale-[0.97] ${
    ctaPulse ? 'animate-pulse' : ''
  }`;
  const ctaDisabledClass = 'bg-black/[0.06] text-ink2 cursor-not-allowed';

  return (
    <div
      className="rounded-card border shadow-card overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FFFDF4 0%, #FFF3D0 100%)',
        borderColor: 'rgba(245, 200, 66, 0.30)',
      }}
    >
      <div className="p-5 sm:p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(245,200,66,0.20)', color: '#92400E' }}
            >
              <Camera size={11} /> {t('studio.cardTitle')}
            </div>
            <h3 className="mt-2 text-[20px] sm:text-[22px] font-black tracking-tight leading-snug text-ink">
              {title}
            </h3>
            {tagline && (
              <p className="mt-1.5 text-[13.5px] text-ink2 max-w-[56ch]">{tagline}</p>
            )}
          </div>
          {cardState !== 'service_disabled' && (
            <div className="text-right shrink-0">
              {tierLabel && (
                <>
                  <p className="text-[10.5px] uppercase tracking-wider text-ink2 leading-tight">
                    Plan
                  </p>
                  <p className="text-[14px] font-bold text-goldDeep leading-tight">
                    {tierLabel}
                  </p>
                </>
              )}
              <p className="text-[11.5px] text-ink2 mt-1 leading-tight whitespace-nowrap">
                {t('studio.cardQuotaUsed', {
                  used: quota.used,
                  limit: quota.dailyLimit,
                })}
              </p>
            </div>
          )}
        </div>

        {/* Mini-stepper (session active uniquement) */}
        {showStepper && <MiniStepper activeIndex={stepIdx} />}

        {/* CTA + countdown */}
        {ctaLabel && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <button
              type="button"
              onClick={ctaAction || undefined}
              disabled={ctaDisabled}
              className={`${ctaBaseClass} ${
                ctaDisabled ? ctaDisabledClass : ctaEnabledClass
              }`}
              style={
                !ctaDisabled
                  ? {
                      boxShadow:
                        '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)',
                    }
                  : undefined
              }
            >
              {ctaIcon}
              {ctaLabel}
            </button>
            {countdown && cardState !== 'session_ready' && (
              <p className="text-[12.5px] text-ink2">
                {t('studio.cardExpiringIn', { hours: countdown })}
              </p>
            )}
          </div>
        )}

        {/* Hint pour les états sans CTA (waiting/processing) avec countdown */}
        {!ctaLabel && countdown && (
          <p className="text-[12.5px] text-ink2">
            {t('studio.cardExpiringIn', { hours: countdown })}
          </p>
        )}
      </div>
    </div>
  );
};
