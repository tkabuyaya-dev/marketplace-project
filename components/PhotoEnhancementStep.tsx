/**
 * NUNULIA — PhotoEnhancementStep
 *
 * Étape facultative entre la sélection des photos et la soumission du
 * formulaire "Ajouter produit" (SellerDashboard, onglet add_product).
 *
 * UX :
 *   - Par défaut : "Non merci, garder mes photos originales" est sélectionné
 *   - Le vendeur peut activement choisir "Oui, améliorer" + style (blanc/flou/branded)
 *   - Après amélioration, vue avant/après par photo, possibilité de revert
 *   - Si offline : bandeau passif, option "améliorer" indisponible
 *   - Fail-open systématique (échec PhotoRoom → toast discret, on continue)
 *
 * Le composant délègue toute la logique réseau au hook usePhotoEnhancement.
 * Le parent (SellerDashboard) possède l'instance du hook pour pouvoir lire
 * `getFinalUrls()` et `hasUploadedUrls()` au moment du submit.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles, RotateCcw, AlertCircle, Loader2, WifiOff } from 'lucide-react';
import {
  UsePhotoEnhancementApi,
  EnhancementStyle,
} from '../hooks/usePhotoEnhancement';

interface Props {
  files: File[];
  previews: string[];
  enhancement: UsePhotoEnhancementApi;
  /** Affichage en lecture seule pendant le submit (loading global du formulaire) */
  disabled?: boolean;
}

type Choice = 'original' | 'enhanced';

const STYLES: ReadonlyArray<{ id: EnhancementStyle; emoji: string; tokenKey: string }> = [
  { id: 'white',   emoji: '⬜', tokenKey: 'enhancement.style.white' },
  { id: 'branded', emoji: '🎨', tokenKey: 'enhancement.style.branded' },
];

export const PhotoEnhancementStep: React.FC<Props> = ({
  files,
  previews,
  enhancement,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<Choice>('original');
  const [pickedStyle, setPickedStyle] = useState<EnhancementStyle>('white');
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Synchronise online/offline via les events navigateur
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Quand le vendeur change de choix radio, sync l'état du hook
  useEffect(() => {
    if (choice === 'original' && enhancement.mode !== 'idle' && enhancement.mode !== 'declined') {
      enhancement.decline();
    }
    if (choice === 'original' && enhancement.mode === 'idle') {
      enhancement.decline();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice]);

  // Cleanup : quand les fichiers changent (sélection re-faite), reset le hook
  useEffect(() => {
    enhancement.reset();
    setChoice('original');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]);

  const isBusy = enhancement.mode === 'uploading' || enhancement.mode === 'enhancing';

  const handleStartEnhance = async () => {
    if (!online || disabled || isBusy || files.length === 0) return;
    await enhancement.enhance(files, pickedStyle);
  };

  if (files.length === 0) return null;

  // ── Bandeau offline ─────────────────────────────────────────────────────
  if (!online) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 flex items-start gap-3">
        <WifiOff className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">{t('enhancement.offlineTitle')}</p>
          <p className="mt-1">{t('enhancement.offlineSubtitle')}</p>
        </div>
      </div>
    );
  }

  // ── Loader (upload originaux + appels PhotoRoom) ────────────────────────
  if (isBusy) {
    const okCount = enhancement.results.filter((r) => r.status === 'ok').length;
    return (
      <div className="rounded-lg border border-gold-300 bg-amber-50 p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-gold-600 animate-spin" aria-hidden />
        <div className="text-sm text-ink">
          <p className="font-semibold">
            {enhancement.mode === 'uploading'
              ? t('enhancement.preparing')
              : t('enhancement.processing', { current: okCount + 1, total: files.length })}
          </p>
          <p className="text-ink2 mt-0.5">{t('enhancement.processingHint')}</p>
        </div>
      </div>
    );
  }

  // ── Preview avant/après ─────────────────────────────────────────────────
  if (enhancement.mode === 'preview' && enhancement.results.length > 0) {
    return (
      <div className="rounded-lg border border-gold-300 bg-amber-50 p-3 sm:p-4">
        <div className="flex items-start gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-gold-600 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold text-ink">{t('enhancement.previewTitle')}</p>
            <p className="text-sm text-ink2">{t('enhancement.previewSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {enhancement.results.map((r, i) => {
            const isReverted = r.status === 'reverted';
            const isFailed = r.status === 'failed';
            const hasEnhanced = r.status === 'ok' || r.status === 'reverted';
            const displayUrl =
              isReverted || isFailed ? previews[i] || r.originalUrl : r.enhancedUrl || previews[i] || r.originalUrl;

            return (
              <div
                key={i}
                className="bg-white rounded-md border border-black/[0.08] overflow-hidden flex flex-col"
              >
                <div className="aspect-square bg-gray-50 overflow-hidden">
                  <img
                    src={displayUrl}
                    alt={t('enhancement.photoAlt', { n: i + 1 })}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="p-2 flex items-center justify-between text-xs">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      isFailed
                        ? 'text-amber-700'
                        : isReverted
                        ? 'text-ink2'
                        : 'text-emerald-700'
                    }`}
                  >
                    {isFailed && <AlertCircle className="w-3.5 h-3.5" aria-hidden />}
                    {!isFailed && !isReverted && <Check className="w-3.5 h-3.5" aria-hidden />}
                    {isFailed
                      ? t('enhancement.photoFailed')
                      : isReverted
                      ? t('enhancement.photoOriginal')
                      : t('enhancement.photoEnhanced')}
                  </span>
                  {hasEnhanced && (
                    <button
                      type="button"
                      onClick={() => enhancement.revertOne(i)}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 text-ink2 hover:text-ink font-medium min-h-[44px] px-2 -mx-2 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                      {isReverted ? t('enhancement.useEnhanced') : t('enhancement.useOriginal')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {enhancement.quotaUsed != null && enhancement.quotaLimit != null && enhancement.quotaLimit > 0 && (
          <p className="mt-3 text-xs text-ink2">
            {t('enhancement.quotaRemaining', {
              used: enhancement.quotaUsed,
              limit: enhancement.quotaLimit,
            })}
          </p>
        )}
      </div>
    );
  }

  // ── Échec total : message discret + photos originales conservées ────────
  if (enhancement.mode === 'failed') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="text-sm text-ink">
          <p className="font-semibold">{t('enhancement.failedTitle')}</p>
          <p className="text-ink2 mt-0.5">
            {enhancement.errorMessage || t('enhancement.failedFallback')}
          </p>
          <button
            type="button"
            onClick={() => {
              enhancement.reset();
              setChoice('original');
            }}
            className="mt-2 text-sm font-semibold text-goldText hover:text-goldDeep min-h-[44px]"
          >
            {t('enhancement.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  // ── État idle / declined : radio + sélection style ──────────────────────
  return (
    <div className="rounded-lg border border-gold-300 bg-amber-50 p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-gold-600 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold text-ink">{t('enhancement.title')}</p>
          <p className="text-sm text-ink2">{t('enhancement.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 p-3 rounded-md bg-white border border-black/[0.08] cursor-pointer min-h-[48px]">
          <input
            type="radio"
            name="enhancement-choice"
            value="original"
            checked={choice === 'original'}
            onChange={() => setChoice('original')}
            disabled={disabled}
            className="mt-1 w-4 h-4 accent-gold-600"
          />
          <div className="text-sm">
            <p className="font-semibold text-ink">{t('enhancement.keepOriginal')}</p>
            <p className="text-ink2 text-xs">{t('enhancement.keepOriginalHint')}</p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-md bg-white border border-black/[0.08] cursor-pointer min-h-[48px]">
          <input
            type="radio"
            name="enhancement-choice"
            value="enhanced"
            checked={choice === 'enhanced'}
            onChange={() => setChoice('enhanced')}
            disabled={disabled}
            className="mt-1 w-4 h-4 accent-gold-600"
          />
          <div className="text-sm flex-1">
            <p className="font-semibold text-ink">{t('enhancement.enhance')}</p>
            <p className="text-ink2 text-xs">{t('enhancement.enhanceHint')}</p>
          </div>
        </label>
      </div>

      {choice === 'enhanced' && (
        <div className="mt-3 pt-3 border-t border-gold-200">
          <p className="text-sm font-semibold text-ink mb-2">{t('enhancement.chooseStyle')}</p>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPickedStyle(s.id)}
                disabled={disabled}
                className={`min-h-[64px] rounded-md border-2 flex flex-col items-center justify-center gap-1 px-2 py-2 transition ${
                  pickedStyle === s.id
                    ? 'border-gold-500 bg-amber-100'
                    : 'border-black/[0.08] bg-white hover:border-gold-300'
                }`}
                aria-pressed={pickedStyle === s.id}
              >
                <span className="text-xl" aria-hidden>{s.emoji}</span>
                <span className="text-xs font-semibold text-ink">{t(s.tokenKey)}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleStartEnhance}
            disabled={disabled || files.length === 0}
            className="mt-3 w-full bg-gold-400 hover:bg-goldHov disabled:opacity-50 text-ink font-semibold rounded-input py-3 min-h-[48px] inline-flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          >
            <Sparkles className="w-4 h-4" aria-hidden />
            {t('enhancement.startEnhance')}
          </button>
        </div>
      )}
    </div>
  );
};
