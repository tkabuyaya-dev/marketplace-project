/**
 * B2BPostCard — carte d'un post B2B.
 *
 * Affichage :
 *   - Bande latérale gauche colorée selon la catégorie
 *   - Auteur + ville + pays + anneaux de réputation
 *   - Texte dans la langue du lecteur (translations[userLang] ?? originalText)
 *   - Badge "🌍 SW → FR traduit par Nunulia IA" si translation utilisée
 *   - Badge "✅ Signal Validé" (avec glow doré) si isVerified
 *   - Bouton "💪 Je peux aider · N" — héros visuel, gold + glow
 *   - Bouton WhatsApp secondaire avec message pré-rempli
 *
 * Pour les Gratuits :
 *   - Le contenu est blur via .b2b-upsell-blur
 *   - Overlay B2BUpsellOverlay par-dessus
 *
 * Optimistic UI : le clic "Je peux aider" incrémente immédiatement helpCount
 * localement. En cas d'échec côté Firestore (rule denied, offline), on
 * rollback et on toast.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext';
import { useToast } from '../Toast';
import { useB2BAccess } from '../../hooks/useB2BAccess';
import { useUserLanguage } from '../../hooks/useUserLanguage';
import {
  offerHelp, confirmPost, getMyHelpForPost, getMyConfirmationForPost,
  closeMyPost, deleteMyPost,
} from '../../services/firebase/b2b';
import { buildWaUrl } from '../../config/whatsapp.config';
import { B2BReputationRings } from './B2BReputationRings';
import { B2BUpsellOverlay } from './B2BUpsellOverlay';
import { detectSocialPlatform, SOCIAL_PLATFORM_META } from '../../utils/socialLinks';
import type { B2BPost, B2BCategory, B2BLang } from '../../types';

const CATEGORY_COLOR: Record<B2BCategory, string> = {
  fournisseur: 'var(--b2b-cat-fournisseur)',
  revendeur:   'var(--b2b-cat-revendeur)',
  marche:      'var(--b2b-cat-marche)',
  transport:   'var(--b2b-cat-transport)',
};

const LANG_LABEL: Record<B2BLang, string> = {
  fr: 'FR', en: 'EN', sw: 'SW', rn: 'RN', rw: 'RW',
};

function localStorageKey(postId: string, helperId: string): string {
  return `b2b_help_${postId}_${helperId}`;
}

interface Props {
  post: B2BPost;
  onPostUpdated?: () => void;
}

export const B2BPostCard: React.FC<Props> = ({ post, onPostUpdated }) => {
  const { t } = useTranslation();
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = useB2BAccess();
  const { language: userLang } = useUserLanguage();

  const isAuthor = currentUser?.id === post.authorId;

  // ── État local optimistic ─────────────────────────────────────────────
  const [hasHelped, setHasHelped] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !currentUser) return false;
    return Boolean(window.localStorage.getItem(localStorageKey(post.id, currentUser.id)));
  });
  const [helpCount, setHelpCount] = useState<number>(post.helpCount);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Réconciliation : prend le serveur si > optimistic (peut diverger sur
  // recharge après un help qui a été commité côté CF).
  useEffect(() => {
    setHelpCount((c) => Math.max(c, post.helpCount));
  }, [post.helpCount]);

  // Au premier rendu côté user authentifié, vérifie l'état réel (utile si
  // localStorage a été nettoyé mais que l'aide est en base).
  useEffect(() => {
    if (!currentUser || isAuthor) return;
    let cancelled = false;
    (async () => {
      try {
        const [help, confirmed] = await Promise.all([
          getMyHelpForPost(post.id, currentUser.id),
          getMyConfirmationForPost(post.id, currentUser.id),
        ]);
        if (cancelled) return;
        if (help) setHasHelped(true);
        if (confirmed) setHasConfirmed(true);
      } catch { /* lecture best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, post.id, isAuthor]);

  // ── Média social (re-validé à l'affichage : la whitelist prime) ────────
  const mediaPlatform = post.mediaUrl ? detectSocialPlatform(post.mediaUrl) : null;

  // ── Affichage texte traduit ───────────────────────────────────────────
  const displayedText = post.translations?.[userLang] || post.originalText;
  const isTranslated =
    userLang !== post.originalLang &&
    Boolean(post.translations?.[userLang]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleHelp = useCallback(async () => {
    if (!currentUser) { navigate('/login'); return; }
    if (!access.canInteract) { navigate('/plans'); return; }
    if (hasHelped || busy) return;

    const helperWhatsApp = currentUser.whatsapp || currentUser.sellerDetails?.phone || '';
    if (!helperWhatsApp) {
      toast(t('toast.noWhatsapp'), 'error');
      return;
    }

    setBusy(true);
    setHasHelped(true);
    setHelpCount((c) => c + 1);
    setPulse(true);
    window.setTimeout(() => mounted.current && setPulse(false), 350);

    try {
      await offerHelp({
        postId: post.id,
        helperId: currentUser.id,
        helperName: currentUser.sellerDetails?.shopName || currentUser.name,
        helperCity: currentUser.sellerDetails?.commune || '',
        helperCountry: (currentUser.sellerDetails?.countryId || '').toUpperCase(),
        helperWhatsApp,
        helperTier: access.tier,
      });
      try { window.localStorage.setItem(localStorageKey(post.id, currentUser.id), '1'); } catch { /* quota */ }
    } catch (err: any) {
      // Rollback optimistic
      if (mounted.current) {
        setHasHelped(false);
        setHelpCount((c) => Math.max(0, c - 1));
      }
      const code = err?.code || '';
      if (code === 'permission-denied') toast(t('b2b.errors.cantHelp'), 'error');
      else toast(t('b2b.errors.network'), 'error');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [access.canInteract, access.tier, busy, currentUser, hasHelped, navigate, post.id, t, toast]);

  const handleConfirm = useCallback(async () => {
    if (!currentUser) { navigate('/login'); return; }
    if (!access.canInteract) { navigate('/plans'); return; }
    if (hasConfirmed) return;
    setHasConfirmed(true);
    try {
      await confirmPost({
        postId: post.id,
        confirmerId: currentUser.id,
        confirmerCity: currentUser.sellerDetails?.commune || '',
        confirmerCountry: (currentUser.sellerDetails?.countryId || '').toUpperCase(),
      });
    } catch (err: any) {
      setHasConfirmed(false);
      const code = err?.code || '';
      if (code === 'permission-denied') toast(t('b2b.errors.cantConfirm'), 'error');
      else toast(t('b2b.errors.network'), 'error');
    }
  }, [access.canInteract, currentUser, hasConfirmed, navigate, post.id, t, toast]);

  const handleWa = useCallback(() => {
    const msg = t('b2b.waMessage', { name: post.authorName, text: displayedText.slice(0, 80) });
    window.open(buildWaUrl(msg, { phone: post.authorWhatsApp }), '_blank', 'noopener,noreferrer');
  }, [displayedText, post.authorName, post.authorWhatsApp, t]);

  const handleClose = useCallback(async () => {
    if (!isAuthor) return;
    if (!window.confirm(t('b2b.confirmClose'))) return;
    try {
      await closeMyPost(post.id);
      onPostUpdated?.();
    } catch {
      toast(t('b2b.errors.network'), 'error');
    }
  }, [isAuthor, onPostUpdated, post.id, t, toast]);

  const handleDelete = useCallback(async () => {
    if (!isAuthor) return;
    if (!window.confirm(t('b2b.confirmDelete'))) return;
    try {
      await deleteMyPost(post.id);
      onPostUpdated?.();
    } catch {
      toast(t('b2b.errors.network'), 'error');
    }
  }, [isAuthor, onPostUpdated, post.id, t, toast]);

  // ── Render ────────────────────────────────────────────────────────────
  const showUpsell = !access.canInteract && !isAuthor;

  const ContentInner = (
    <>
      <div className="flex items-start gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[14px] font-bold text-white truncate">{post.authorName}</span>
            <span
              className="text-white/60 inline-flex items-center"
              aria-label={t('b2b.reputationOf', { name: post.authorName })}
            >
              <B2BReputationRings score={post.authorReputationAtPost} size={14} />
            </span>
          </div>
          <p className="text-[11.5px] text-white/55">
            {post.authorCity ? `${post.authorCity} · ` : ''}{post.authorCountry}
          </p>
        </div>
        {post.isVerified && (
          <span
            className="b2b-verified-glow shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              background: 'rgba(245,158,11,0.18)',
              color: '#FCD34D',
              border: '1px solid rgba(245,158,11,0.45)',
            }}
            aria-label={t('b2b.verifiedAria')}
          >
            ✅ {t('b2b.verified')}
          </span>
        )}
      </div>

      <p className="text-[14.5px] leading-snug text-white/95 mb-2 whitespace-pre-wrap break-words">
        {displayedText}
      </p>

      {isTranslated && (
        <p className="text-[10.5px] text-white/50 mb-2.5 inline-flex items-center gap-1.5">
          🌍 {LANG_LABEL[post.originalLang]} → {LANG_LABEL[userLang]} ·{' '}
          {t('b2b.translatedBy')}
        </p>
      )}

      {mediaPlatform && post.mediaUrl && (
        <a
          href={post.mediaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="b2b-media-link mb-1 inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-white/10 hover:bg-white/15 text-white/90 transition-colors"
          aria-label={t('b2b.viewMedia', { platform: SOCIAL_PLATFORM_META[mediaPlatform].label })}
        >
          {SOCIAL_PLATFORM_META[mediaPlatform].emoji} {t('b2b.viewMedia', { platform: SOCIAL_PLATFORM_META[mediaPlatform].label })}
          <span className="opacity-60">↗</span>
        </a>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <button
          type="button"
          onClick={handleHelp}
          disabled={busy || hasHelped || isAuthor || post.status === 'closed'}
          className={`b2b-help-btn px-3.5 h-9 rounded-xl text-[13px] font-extrabold inline-flex items-center gap-1.5 transition-transform active:scale-95 ${
            pulse ? 'b2b-help-pulse' : ''
          }`}
          aria-label={hasHelped ? t('b2b.alreadyHelpingAria') : t('b2b.helpAria')}
        >
          {hasHelped ? `✅ ${t('b2b.alreadyHelping')}` : `💪 ${t('b2b.help')}`}
          <span className="opacity-80 text-[12px]">· {helpCount}</span>
        </button>

        <button
          type="button"
          onClick={handleWa}
          disabled={isAuthor}
          className="b2b-wa-btn px-3 h-9 rounded-xl text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          aria-label={t('b2b.waAria', { name: post.authorName })}
        >
          {t('b2b.contactWa')}
        </button>

        {!isAuthor && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={hasConfirmed || !access.canInteract}
            className="px-3 h-9 rounded-xl text-[12.5px] font-semibold text-white/85 hover:text-white border border-white/15 hover:border-white/30 transition-colors disabled:opacity-50"
            aria-label={t('b2b.confirmAria')}
          >
            {hasConfirmed ? `✓ ${t('b2b.confirmed')}` : t('b2b.confirmSignal')}
          </button>
        )}

        {isAuthor && post.status === 'open' && (
          <button
            type="button"
            onClick={handleClose}
            className="px-3 h-9 rounded-xl text-[12.5px] font-semibold text-white/85 hover:text-white border border-white/15 hover:border-white/30 transition-colors"
          >
            {t('b2b.closePost')}
          </button>
        )}

        {isAuthor && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-3 h-9 rounded-xl text-[12.5px] font-semibold text-red-300 hover:text-red-200 border border-red-400/30 hover:border-red-400/50 transition-colors"
          >
            {t('b2b.delete')}
          </button>
        )}
      </div>
    </>
  );

  return (
    <article
      className="b2b-card relative rounded-2xl pl-4 pr-4 py-3.5 mb-3 overflow-hidden"
      style={{ borderLeft: `4px solid ${CATEGORY_COLOR[post.category]}` }}
      aria-label={t('b2b.postAria', { name: post.authorName, category: t(`b2b.cat.${post.category}`) })}
    >
      <div className={showUpsell ? 'b2b-upsell-blur' : ''} aria-hidden={showUpsell || undefined}>
        {ContentInner}
      </div>
      {showUpsell && <B2BUpsellOverlay />}
    </article>
  );
};
