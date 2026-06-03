/**
 * B2BPublishForm — formulaire de publication d'un post B2B.
 *
 * - Sélection de catégorie visuelle (boutons radio stylés, pas un <select>)
 * - Compteur de caractères (max 280)
 * - Détection automatique de la langue saisie via Intl.Locale heuristique
 *   (sinon fallback navigator + b2bLang user)
 * - Preview avant submit
 * - Gated : si non-Pro → redirect /plans
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext';
import { useToast } from '../Toast';
import { useB2BAccess } from '../../hooks/useB2BAccess';
import { useUserLanguage } from '../../hooks/useUserLanguage';
import { publishB2BPost } from '../../services/firebase/b2b';
import type { B2BCategory, B2BLang } from '../../types';

const MAX_CHARS = 280;

const CATEGORIES: { id: B2BCategory; emoji: string; colorVar: string }[] = [
  { id: 'fournisseur', emoji: '🏭', colorVar: 'var(--b2b-cat-fournisseur)' },
  { id: 'revendeur',   emoji: '🛒', colorVar: 'var(--b2b-cat-revendeur)' },
  { id: 'marche',      emoji: '📣', colorVar: 'var(--b2b-cat-marche)' },
  { id: 'transport',   emoji: '🚚', colorVar: 'var(--b2b-cat-transport)' },
];

/**
 * Détection heuristique très simple — quelques stems FR/EN/SW/RN/RW.
 * Si rien ne matche on retombe sur la préférence utilisateur.
 * Pas besoin de précision parfaite : Claude détecte aussi côté CF.
 */
function guessLang(text: string, fallback: B2BLang): B2BLang {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(je|nous|cherche|fournisseur|stock|livraison|besoin|disponible|svp|merci|bonjour)\b/.test(t)) return 'fr';
  if (/\b(i|we|need|looking|supplier|stock|please|thanks|hello|available)\b/.test(t)) return 'en';
  if (/\b(natafuta|wauzaji|bidhaa|asante|samahani|tafadhali|naomba|tunatafuta)\b/.test(t)) return 'sw';
  if (/\b(ndashaka|umugozi|murakoze|mwaramutse|umufasha|ndarondera)\b/.test(t)) return 'rw';
  if (/\b(ndashaka|ndarondera|murakoze|mwaramutse|umufasha|isoko)\b/.test(t)) return 'rn';
  return fallback;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: () => void;
}

export const B2BPublishForm: React.FC<Props> = ({ isOpen, onClose, onPublished }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const access = useB2BAccess();
  const { language: userLang } = useUserLanguage();

  const [category, setCategory] = useState<B2BCategory | null>(null);
  const [text, setText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset à la fermeture
  useEffect(() => {
    if (!isOpen) {
      setCategory(null);
      setText('');
      setPreviewing(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  const guessedLang = useMemo<B2BLang>(() => guessLang(text, userLang), [text, userLang]);

  if (!isOpen) return null;

  // ── Gate ──────────────────────────────────────────────────────────────
  if (!access.canPublish) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="b2b-card rounded-2xl p-5 max-w-sm w-full">
          <p className="text-[15px] font-bold text-white mb-2">
            🔒 {t('b2b.upsell.publishGateTitle')}
          </p>
          <p className="text-[13px] text-white/75 mb-4">
            {t('b2b.upsell.publishGateBody')}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-[13px] font-semibold text-white/70 hover:text-white"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={() => { onClose(); navigate('/plans'); }}
              className="px-4 py-2 rounded-xl text-[13px] font-extrabold text-gray-900"
              style={{ background: '#F59E0B' }}
            >
              {t('b2b.upsell.cta')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentUser || !category) return;
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      toast(t('b2b.errors.textTooShort'), 'error');
      return;
    }
    const whatsapp = currentUser.whatsapp || currentUser.sellerDetails?.phone || '';
    if (!whatsapp) {
      toast(t('b2b.errors.noWhatsApp'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await publishB2BPost({
        authorId:                currentUser.id,
        authorName:              currentUser.sellerDetails?.shopName || currentUser.name,
        authorCity:              currentUser.sellerDetails?.commune || '',
        authorProvince:          currentUser.sellerDetails?.province || '',
        authorCountry:           (currentUser.sellerDetails?.countryId || 'BI').toUpperCase(),
        authorWhatsApp:          whatsapp,
        authorTier:              (access.tier === 'grossiste' ? 'grossiste' : 'pro'),
        authorReputationAtPost:  currentUser.b2bReputation ?? 0,
        category,
        originalText:            trimmed,
        originalLang:            guessedLang,
      });
      toast(t('b2b.publishSuccess'), 'success');
      onPublished?.();
      onClose();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'permission-denied') toast(t('b2b.errors.cantPublish'), 'error');
      else toast(t('b2b.errors.network'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="b2b-publish-title"
    >
      <div className="b2b-card w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id="b2b-publish-title" className="text-[18px] font-extrabold text-white">
            {previewing ? t('b2b.previewTitle') : t('b2b.publishTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {!previewing && (
          <>
            <p className="text-[11px] uppercase tracking-wider text-white/55 font-bold mb-2">
              {t('b2b.categoryLabel')}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    aria-pressed={active}
                    className={`text-left px-3 py-3 rounded-xl border-2 transition-colors ${
                      active
                        ? 'bg-white/12 text-white'
                        : 'bg-white/4 text-white/75 hover:bg-white/8'
                    }`}
                    style={{ borderColor: active ? c.colorVar : 'transparent' }}
                  >
                    <span className="text-lg mr-1.5">{c.emoji}</span>
                    <span className="text-[13.5px] font-semibold">{t(`b2b.cat.${c.id}`)}</span>
                  </button>
                );
              })}
            </div>

            <label htmlFor="b2b-text" className="text-[11px] uppercase tracking-wider text-white/55 font-bold mb-2 block">
              {t('b2b.textLabel')}
            </label>
            <textarea
              id="b2b-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              placeholder={t('b2b.textPlaceholder')}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/15 focus:border-amber-400/60 focus:outline-none text-white text-[14.5px] resize-none mb-1.5"
            />
            <p className="text-[11px] text-white/45 flex justify-between mb-4">
              <span>{t('b2b.detectedLang', { lang: guessedLang.toUpperCase() })}</span>
              <span>{text.length}/{MAX_CHARS}</span>
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl text-[13px] font-semibold text-white/70 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => setPreviewing(true)}
                disabled={!category || text.trim().length < 5}
                className="px-4 py-2 rounded-xl text-[13px] font-extrabold text-gray-900 disabled:opacity-50"
                style={{ background: '#F59E0B' }}
              >
                {t('b2b.preview')}
              </button>
            </div>
          </>
        )}

        {previewing && category && (
          <>
            <article
              className="b2b-card relative rounded-2xl pl-4 pr-4 py-3.5 mb-4 overflow-hidden"
              style={{ borderLeft: `4px solid ${CATEGORIES.find((c) => c.id === category)?.colorVar}` }}
            >
              <p className="text-[14px] font-bold text-white mb-0.5">
                {currentUser?.sellerDetails?.shopName || currentUser?.name}
              </p>
              <p className="text-[11.5px] text-white/55 mb-2">
                {(currentUser?.sellerDetails?.commune || '') + ' · ' + (currentUser?.sellerDetails?.countryId || '').toUpperCase()}
              </p>
              <p className="text-[14.5px] leading-snug text-white/95 whitespace-pre-wrap">
                {text.trim()}
              </p>
              <p className="text-[10.5px] text-white/45 mt-2">
                🌍 {t('b2b.willBeTranslated', { lang: guessedLang.toUpperCase() })}
              </p>
            </article>

            <div className="flex gap-2 justify-between">
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                disabled={submitting}
                className="px-3 py-2 rounded-xl text-[13px] font-semibold text-white/70 hover:text-white"
              >
                ← {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-[13px] font-extrabold text-gray-900 disabled:opacity-60"
                style={{ background: '#F59E0B' }}
              >
                {submitting ? t('b2b.publishing') : t('b2b.publishNow')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
