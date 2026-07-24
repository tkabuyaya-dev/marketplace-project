/**
 * NUNULIA - Photo Studio Magic Page (/studio/:sessionId)
 *
 * Phase 5 du Photo Studio. Le vendeur arrive ici via deep-link WhatsApp/notif
 * push après que l'admin a uploadé les photos retouchées. La page :
 *   - vérifie auth (redirect /login + retour automatique via sessionStorage)
 *   - charge la session realtime via subscribeToPhotoSession
 *   - affiche carrousel avant/après + form pré-rempli par Vision IA
 *   - publie via publishFromStudio CF puis affiche écran de succès inline
 *   - gère proprement waiting_photos / processing / expired / already_published
 *     / not_yours / not_found
 *
 * Fichier monolithique aligné avec le pattern BuyerRequestsAdmin /
 * PhotoStudio (admin). Sous-composants internes, zéro dépendance neuve.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { isValidSessionId, normalizeSessionId } from '../utils/sessionId';
import { getWatermarkedUrl } from '../utils/watermark';
import {
  subscribeToPhotoSession,
  publishFromStudio,
} from '../services/firebase/photo-sessions';
import { generateAIDescription } from '../services/firebase/ai-description';
import { addBreadcrumb, captureError } from '../services/sentry';
import { PhotoSession, PlanId } from '../types';

// ─── Hook session ────────────────────────────────────────────────────────

type SessionFetchStatus = 'loading' | 'hydrated' | 'not_found';

function useStudioSession(sessionId: string | null): {
  session: PhotoSession | null;
  status: SessionFetchStatus;
} {
  const [session, setSession] = useState<PhotoSession | null>(null);
  const [status, setStatus] = useState<SessionFetchStatus>('loading');

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setStatus('not_found');
      return;
    }
    setStatus('loading');
    const unsub = subscribeToPhotoSession(sessionId, (s) => {
      if (s) {
        setSession(s);
        setStatus('hydrated');
      } else {
        // Soit le doc n'existe pas, soit permissions refusées (autre vendor).
        // Dans les 2 cas → on rend "not_found" (UI claire pour le visiteur).
        setSession(null);
        setStatus('not_found');
      }
    });
    return unsub;
  }, [sessionId]);

  return { session, status };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const isFR = () => !i18n.language?.startsWith('en');

function formatTtlRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h${minutes < 10 ? '0' : ''}${minutes}`;
  return `${minutes} min`;
}

// ─── Shell layout ────────────────────────────────────────────────────────

const StudioShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-950 text-white pb-12">
    <div className="max-w-3xl mx-auto px-4 pt-6 sm:pt-10">{children}</div>
  </div>
);

// ─── Loading view ────────────────────────────────────────────────────────

const StudioLoadingView: React.FC = () => (
  <StudioShell>
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-[3px] border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  </StudioShell>
);

// ─── State/error views (waiting, processing, expired, etc.) ──────────────

type StateKind =
  | 'not_found'
  | 'not_yours'
  | 'expired'
  | 'already_published'
  | 'waiting_photos'
  | 'processing';

interface StudioStateViewProps {
  kind: StateKind;
  session?: PhotoSession | null;
}

const StudioStateView: React.FC<StudioStateViewProps> = ({ kind, session }) => {
  const { t } = useTranslation();

  let icon = '⚠️';
  let title = '';
  let body = '';

  switch (kind) {
    case 'not_found':
      icon = '🔍';
      title = t('studio.pageLoadError');
      body = isFR()
        ? "Le lien n'est pas valide ou la session est introuvable."
        : 'The link is invalid or the session cannot be found.';
      break;
    case 'not_yours':
      icon = '🚫';
      title = t('studio.pageNotYours');
      body = '';
      break;
    case 'expired':
      icon = '⌛';
      title = t('studio.pageTitleExpired');
      body = t('studio.pageBodyExpired');
      break;
    case 'already_published':
      icon = '✅';
      title = t('studio.pageTitleAlreadyPublished');
      body = t('studio.pageBodyAlreadyPublished');
      break;
    case 'waiting_photos':
      icon = '📸';
      title = t('studio.stepWaiting');
      body = t('studio.whatsappOpenHint');
      break;
    case 'processing':
      icon = '🔄';
      title = t('studio.stepProcessing');
      body = t('studio.ttlNotice');
      break;
  }

  const ttl =
    session && (kind === 'waiting_photos' || kind === 'processing')
      ? formatTtlRemaining(session.expiresAt)
      : '';

  return (
    <StudioShell>
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-6 sm:p-8 text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h1 className="text-xl sm:text-2xl font-bold mb-3">{title}</h1>
        {body && <p className="text-gray-400 mb-6 whitespace-pre-line">{body}</p>}
        {ttl && (
          <p className="text-amber-300/80 text-sm mb-6">
            {t('studio.cardExpiringIn', { hours: ttl })}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link
            to="/dashboard"
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-lg transition"
          >
            {isFR() ? 'Tableau de bord' : 'Dashboard'}
          </Link>
        </div>
      </div>
    </StudioShell>
  );
};

// ─── Carousel avant/après ───────────────────────────────────────────────

interface StudioCarouselProps {
  urls: string[];
  plan: PlanId;
}

const StudioCarousel: React.FC<StudioCarouselProps> = ({ urls, plan }) => {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const total = urls.length;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 80) {
      if (dx < 0 && index < total - 1) setIndex(index + 1);
      else if (dx > 0 && index > 0) setIndex(index - 1);
    }
    startX.current = null;
  };

  if (total === 0) return null;

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-2xl bg-gray-900 aspect-square"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out h-full"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {urls.map((url, i) => (
            <div key={i} className="w-full h-full flex-shrink-0">
              <ProgressiveImage
                src={getWatermarkedUrl(url, plan)}
                originalUrl={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      </div>

      {total > 1 && index > 0 && (
        <button
          type="button"
          onClick={() => setIndex(index - 1)}
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 items-center justify-center text-white text-xl"
          aria-label={isFR() ? 'Précédente' : 'Previous'}
        >
          ‹
        </button>
      )}
      {total > 1 && index < total - 1 && (
        <button
          type="button"
          onClick={() => setIndex(index + 1)}
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 items-center justify-center text-white text-xl"
          aria-label={isFR() ? 'Suivante' : 'Next'}
        >
          ›
        </button>
      )}

      {total > 1 && (
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full">
          {index + 1}/{total}
        </div>
      )}

      {total > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-amber-400' : 'w-1.5 bg-gray-600 hover:bg-gray-500'
              }`}
              aria-label={`Photo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Form publication ───────────────────────────────────────────────────

interface StudioFormProps {
  session: PhotoSession;
  onPublished: (productSlug: string) => void;
}

const StudioForm: React.FC<StudioFormProps> = ({ session, onPublished }) => {
  const { t } = useTranslation();
  const { currentUser } = useAuthContext();
  const { toast } = useToast();
  const { categories } = useCategories();
  const sug = session.visionSuggestions;

  const [title, setTitle] = useState(sug?.title ?? '');
  const [description, setDescription] = useState(
    sug?.characteristics?.length
      ? sug.characteristics.map((c) => `• ${c}`).join('\n')
      : ''
  );
  const [price, setPrice] = useState('');
  const [categorySlug, setCategorySlug] = useState(sug?.category ?? '');
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | ''>(
    sug?.condition ?? ''
  );

  // Indicateurs "Suggéré par IA" disparaissent dès édition
  const [titleEdited, setTitleEdited] = useState(false);
  const [categoryEdited, setCategoryEdited] = useState(false);
  const [conditionEdited, setConditionEdited] = useState(false);

  const [aiBusy, setAiBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const aiButtonLabel = isFR() ? '✨ Description IA' : '✨ AI Description';
  const aiBusyLabel = isFR() ? '✨ Génération...' : '✨ Generating...';

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.slug, label: c.name })),
    [categories]
  );

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    const titleTrim = title.trim();
    if (titleTrim.length < 3) {
      errs.title = isFR() ? 'Titre trop court (3 caractères min)' : 'Title too short (3+ chars)';
    } else if (titleTrim.length > 200) {
      errs.title = isFR() ? 'Titre trop long (200 max)' : 'Title too long (200 max)';
    }
    const descTrim = description.trim();
    if (descTrim.length < 10) {
      errs.description = isFR()
        ? 'Description trop courte (10 caractères min)'
        : 'Description too short (10+ chars)';
    } else if (descTrim.length > 5000) {
      errs.description = isFR() ? 'Description trop longue' : 'Description too long';
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      errs.price = isFR() ? 'Prix invalide' : 'Invalid price';
    } else if (priceNum > 999_000_000) {
      errs.price = isFR() ? 'Prix trop élevé' : 'Price too high';
    }
    if (!categorySlug) {
      errs.category = isFR() ? 'Choisissez une catégorie' : 'Pick a category';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [title, description, price, categorySlug]);

  const handleAiDescription = async () => {
    if (title.trim().length < 3 || !categorySlug || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await generateAIDescription({
        title: title.trim(),
        categorySlug,
        countryId: currentUser?.sellerDetails?.countryId,
        shopName: currentUser?.sellerDetails?.shopName || currentUser?.name,
      });
      if (res.ok === false) {
        setDescription(res.fallback);
        if (res.error.kind === 'quota_exceeded') {
          toast(
            isFR()
              ? 'Quota IA atteint - modèle simple utilisé'
              : 'AI quota reached - using a simple template',
            'info'
          );
        }
        return;
      }
      setDescription(res.data.description);
    } catch (e) {
      console.warn('[Studio] AI description error', e);
    } finally {
      setAiBusy(false);
    }
  };

  const handlePublish = async () => {
    if (publishBusy) return;
    if (!validate()) return;
    setPublishBusy(true);
    addBreadcrumb('studio', 'Publish attempt', {
      sessionId: session.id,
      titleLen: title.trim().length,
      hasCondition: !!condition,
    });
    try {
      const res = await publishFromStudio({
        sessionId: session.id,
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        category: categorySlug,
        condition: condition || undefined,
      });
      if (res.ok) {
        addBreadcrumb('studio', 'Publish success', {
          sessionId: session.id,
          productSlug: res.productSlug,
        });
        onPublished(res.productSlug);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      let msg = t('studio.errorPublishFailed');
      if (code === 'functions/resource-exhausted') msg = t('studio.errorQuotaExceeded');
      else if (code === 'functions/failed-precondition') msg = t('studio.errorSessionExpired');
      else if (code === 'functions/permission-denied') msg = t('studio.pageNotYours');
      else if (code === 'functions/unauthenticated') {
        msg = isFR() ? 'Veuillez vous reconnecter.' : 'Please log in again.';
      }
      // Erreur typée connue → breadcrumb (info, pas d'alerte).
      // Erreur INATTENDUE (pas de code functions/*) → captureError pour
      // alerter Sentry (vraisemblablement bug front, réseau, race condition).
      if (code && code.startsWith('functions/')) {
        addBreadcrumb('studio', 'Publish error (typed)', {
          sessionId: session.id,
          code,
        });
      } else {
        captureError(err, {
          context: 'studio.publish',
          sessionId: session.id,
        });
      }
      toast(msg, 'error');
    } finally {
      setPublishBusy(false);
    }
  };

  const conditionLabel = (c: 'new' | 'good' | 'fair') => {
    if (c === 'new') return t('studio.conditionNew');
    if (c === 'good') return t('studio.conditionGood');
    return t('studio.conditionFair');
  };

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 sm:p-6 space-y-5">
      <h2 className="text-lg font-bold">{t('studio.formTitle')}</h2>

      {sug && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-amber-200">
          {t('studio.aiSuggestedHint')}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          {t('studio.fieldTitle')}
          {sug?.title && !titleEdited && (
            <span className="ml-2 text-xs text-amber-300/80">ⓘ IA</span>
          )}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
          maxLength={200}
        />
        {fieldErrors.title && <p className="text-red-400 text-xs mt-1">{fieldErrors.title}</p>}
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-medium mb-1.5">{t('studio.fieldPrice')}</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
          min={0}
          placeholder="0"
        />
        {fieldErrors.price && <p className="text-red-400 text-xs mt-1">{fieldErrors.price}</p>}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          {t('studio.fieldCategory')}
          {sug?.category && !categoryEdited && (
            <span className="ml-2 text-xs text-amber-300/80">ⓘ IA</span>
          )}
        </label>
        <select
          value={categorySlug}
          onChange={(e) => {
            setCategorySlug(e.target.value);
            setCategoryEdited(true);
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-amber-400"
        >
          <option value="">—</option>
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {fieldErrors.category && (
          <p className="text-red-400 text-xs mt-1">{fieldErrors.category}</p>
        )}
      </div>

      {/* Condition */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          {t('studio.fieldCondition')}
          {sug?.condition && !conditionEdited && (
            <span className="ml-2 text-xs text-amber-300/80">ⓘ IA</span>
          )}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['new', 'good', 'fair'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCondition(c);
                setConditionEdited(true);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                condition === c
                  ? 'bg-amber-500 border-amber-500 text-gray-900'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-400/50'
              }`}
            >
              {conditionLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {/* Description + AI button */}
      <div>
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <label className="block text-sm font-medium">{t('studio.fieldDescription')}</label>
          <button
            type="button"
            onClick={handleAiDescription}
            disabled={aiBusy || title.trim().length < 3 || !categorySlug}
            className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            {aiBusy ? aiBusyLabel : aiButtonLabel}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 resize-none"
          rows={6}
          maxLength={5000}
        />
        <div className="text-xs text-gray-500 mt-1 text-right">{description.length}/5000</div>
        {fieldErrors.description && (
          <p className="text-red-400 text-xs mt-1">{fieldErrors.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={handlePublish}
        disabled={publishBusy}
        className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-bold transition"
      >
        {publishBusy ? t('studio.publishing') : t('studio.publishButton')}
      </button>

      <p className="text-xs text-gray-500 text-center">{t('studio.ttlNotice')}</p>
    </div>
  );
};

// ─── Success view ───────────────────────────────────────────────────────

interface PublishSuccessViewProps {
  productSlug: string;
  shareCardUrl?: string;
  shareCaption?: string;
}

const PublishSuccessView: React.FC<PublishSuccessViewProps> = ({
  productSlug,
  shareCardUrl,
  shareCaption,
}) => {
  const { t } = useTranslation();
  const shareUrl = `https://nunulia.com/product/${productSlug}`;
  const fallbackText = `${t('studio.successTitle')} ${shareUrl}`;
  const cardReady = !!shareCardUrl;

  const generatingLabel = isFR()
    ? 'Génération de votre carte…'
    : 'Generating your card…';
  const downloadLabel = isFR() ? '⬇ Télécharger la carte' : '⬇ Download the card';

  const handleShare = async () => {
    const text = shareCaption
      ? `${shareCaption}\n${shareUrl}`
      : fallbackText;

    // navigator.share avec fichier image - meilleure UX mobile (WhatsApp Status, etc.)
    if (cardReady && shareCardUrl && typeof navigator !== 'undefined' && navigator.share) {
      try {
        const response = await fetch(shareCardUrl);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], 'studio-nunulia.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ text, files: [file] });
            return;
          }
        }
        // navigator.share sans fichier
        await navigator.share({ text, url: shareUrl });
        return;
      } catch {
        /* fall through to WhatsApp fallback */
      }
    }
    // Fallback : ouvrir WhatsApp avec text+URL
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleDownload = () => {
    if (!shareCardUrl) return;
    const a = document.createElement('a');
    a.href = shareCardUrl;
    a.download = 'studio-nunulia.png';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <StudioShell>
      <div className="bg-gray-900/60 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-3">{t('studio.successTitle')}</h1>
        <p className="text-gray-400 mb-6">{t('studio.successBody')}</p>

        {/* Preview de la carte virale (skeleton si pas encore prête) */}
        <div className="mx-auto mb-6 max-w-[260px] aspect-[9/16] rounded-xl overflow-hidden bg-gray-800/60 border border-amber-500/20 flex items-center justify-center">
          {cardReady && shareCardUrl ? (
            <img
              src={shareCardUrl}
              alt="Studio Nunulia"
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4">
              <div className="w-8 h-8 border-[3px] border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-amber-300/80 text-center leading-tight">
                {generatingLabel}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <Link
            to={`/product/${productSlug}`}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold rounded-lg transition"
          >
            {t('studio.viewProductCta')}
          </Link>
          <button
            type="button"
            onClick={handleShare}
            className="px-5 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition"
          >
            {t('studio.shareCtaSecondary')}
          </button>
          {cardReady && (
            <button
              type="button"
              onClick={handleDownload}
              className="px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition"
            >
              {downloadLabel}
            </button>
          )}
        </div>
      </div>
    </StudioShell>
  );
};

// ─── Orchestrator ───────────────────────────────────────────────────────

const StudioPage: React.FC = () => {
  const { t } = useTranslation();
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();

  const sessionId = useMemo(
    () => (rawSessionId ? normalizeSessionId(rawSessionId) : null),
    [rawSessionId]
  );

  const { currentUser, authReady } = useAuthContext();
  const { session, status } = useStudioSession(sessionId);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  // Stash deep-link cible avant redirect /login. handleLogin (AuthContext)
  // lit cette clé après succès et navigate ici directement.
  useEffect(() => {
    if (authReady && !currentUser && rawSessionId && isValidSessionId(rawSessionId.toUpperCase())) {
      sessionStorage.setItem('redirectAfterLogin', `/studio/${rawSessionId}`);
    }
  }, [authReady, currentUser, rawSessionId]);

  // Sentry breadcrumb au mount + transitions clés (Phase 8 observabilité)
  useEffect(() => {
    if (!sessionId) return;
    addBreadcrumb('studio', 'Studio page opened', {
      sessionId,
      hasAuth: !!currentUser,
    });
  }, [sessionId, currentUser]);

  useEffect(() => {
    if (session?.status === 'ready' && currentUser && session.vendorId === currentUser.id) {
      addBreadcrumb('studio', 'Session ready, form displayed', {
        sessionId: session.id,
        hasVisionSuggestions: !!session.visionSuggestions,
        photosCount: session.processedUrls.length,
      });
    }
  }, [session?.id, session?.status, session?.vendorId, currentUser]);

  // ID invalide
  if (rawSessionId && !sessionId) {
    return <StudioStateView kind="not_found" />;
  }
  // Auth pas encore prête
  if (!authReady) {
    return <StudioLoadingView />;
  }
  // Pas connecté → /login (puis retour automatique via redirectAfterLogin)
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  // Chargement session
  if (status === 'loading') {
    return <StudioLoadingView />;
  }
  // Pas trouvée (ou permissions refusées)
  if (status === 'not_found' || !session) {
    return <StudioStateView kind="not_found" />;
  }
  // Session d'un autre vendeur (admin qui ouvre par erreur)
  if (session.vendorId !== currentUser.id) {
    return <StudioStateView kind="not_yours" />;
  }
  // Publication réussie cet écran → success view AVANT le check status==='published'
  // (le subscription realtime va flipper en 'published' juste après).
  // Phase 7 : shareCardUrl + shareCaption arrivent ~3-5s plus tard via le
  // trigger Firestore onPhotoSessionPublished. La subscription continue de
  // tourner → le composant re-render avec la carte dès qu'elle est prête.
  if (publishedSlug) {
    return (
      <PublishSuccessView
        productSlug={publishedSlug}
        shareCardUrl={session.shareCardUrl}
        shareCaption={session.shareCaption}
      />
    );
  }
  // États non-publiables
  if (session.status === 'waiting_photos') {
    return <StudioStateView kind="waiting_photos" session={session} />;
  }
  if (session.status === 'processing') {
    return <StudioStateView kind="processing" session={session} />;
  }
  if (session.status === 'expired') {
    return <StudioStateView kind="expired" session={session} />;
  }
  if (session.status === 'published') {
    return <StudioStateView kind="already_published" session={session} />;
  }

  // status === 'ready' → vue cœur Phase 5
  return (
    <StudioShell>
      <div className="space-y-5">
        <div className="text-center pt-2">
          <h1 className="text-2xl sm:text-3xl font-bold">{t('studio.pageTitleReady')}</h1>
          <p className="text-gray-400 mt-1.5">{t('studio.pageSubtitleReady')}</p>
        </div>
        <StudioCarousel urls={session.processedUrls} plan={session.plan} />
        <StudioForm session={session} onPublished={setPublishedSlug} />
      </div>
    </StudioShell>
  );
};

export default StudioPage;
