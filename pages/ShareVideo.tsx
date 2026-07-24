/**
 * NUNULIA — Web Share Target : « Partager vers Nunulia » depuis TikTok & co.
 *
 * Le manifest déclare share_target → GET /share-video?title=&text=&url=.
 * Android place le lien partagé dans `url` ou (TikTok, très souvent) dans
 * `text` au milieu d'une phrase — on extrait la première URL whitelistée.
 *
 * Parcours : vendeur partage sa vidéo → choisit l'annonce à lier → 1 tap →
 * vidéo attachée + kit « lien en bio » prêt à coller. Zéro copier-coller.
 *
 * La page sert aussi de fallback manuel (champ Coller) pour iOS / PWA non
 * installée, et reste utilisable pour re-lier ou remplacer une vidéo.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ClipboardPaste, Copy, ExternalLink, Store, Video } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { getSellerAllProducts, attachProductVideo } from '../services/firebase';
import { getOptimizedUrl } from '../services/cloudinary';
import { getProductVideoInfo } from '../utils/productVideo';
import type { Product } from '../types';

/** Extrait la première URL https d'un texte partagé (TikTok met le lien dans `text`). */
function extractFirstUrl(...candidates: Array<string | null>): string {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/https:\/\/[^\s"'<>]+/);
    if (m) return m[0];
  }
  return '';
}

const PILL_BG: Record<string, string> = {
  tiktok: '#010101',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)',
};

const ShareVideoPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [params] = useSearchParams();

  const [rawUrl, setRawUrl] = useState(() =>
    extractFirstUrl(params.get('url'), params.get('text'), params.get('title')));
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachedTo, setAttachedTo] = useState<Product | null>(null);
  const [copied, setCopied] = useState(false);

  const info = useMemo(() => getProductVideoInfo(rawUrl), [rawUrl]);
  const isSeller = currentUser?.role === 'seller' || currentUser?.role === 'admin';

  // Charge les annonces du vendeur (approuvées + en attente) dès qu'un lien valide est là.
  useEffect(() => {
    if (!info || !currentUser?.id || !isSeller) return;
    let cancelled = false;
    setLoadingProducts(true);
    (async () => {
      try {
        const all = await getSellerAllProducts(currentUser.id);
        if (cancelled) return;
        setProducts(all
          .filter(p => p.status === 'approved' || p.status === 'pending')
          .sort((a, b) => b.createdAt - a.createdAt));
      } catch {
        if (!cancelled) toast(t('shareVideo.loadError'), 'error');
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [info?.platform, currentUser?.id, isSeller]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) setRawUrl(extractFirstUrl(txt) || txt.trim());
    } catch { /* permission refusée — saisie manuelle possible */ }
  };

  const handleAttach = async (product: Product) => {
    if (!info || attaching) return;
    setAttaching(product.id);
    try {
      await attachProductVideo(product.id, rawUrl.trim());
      setAttachedTo(product);
      toast(t('shareVideo.attached'), 'success');
    } catch {
      toast(t('shareVideo.attachError'), 'error');
    } finally {
      setAttaching(null);
    }
  };

  const shopPath = `/shop/${(currentUser as any)?.slug || currentUser?.id || ''}`;
  const shopUrl = `${window.location.origin}${shopPath}`;
  const bioText = t('shareVideo.bioSnippet', { url: shopUrl });

  const handleCopyBio = async () => {
    try {
      await navigator.clipboard.writeText(bioText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(t('shareVideo.copyError'), 'error');
    }
  };

  const inputCls = 'w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30 outline-none';

  return (
    <div className="min-h-screen bg-canvas pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm border-b border-black/[0.06]">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t('common.back', 'Retour')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-black/[0.07] active:scale-95 transition-transform"
          >
            <ArrowLeft size={16} className="text-ink" />
          </button>
          <div>
            <h1 className="text-[16px] font-black text-ink leading-tight">🎥 {t('shareVideo.title')}</h1>
            <p className="text-[11.5px] text-ink2">{t('shareVideo.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ── Cas 1 : pas connecté vendeur ── */}
        {!isSeller && (
          <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-6 text-center space-y-3">
            <div className="text-4xl">🏪</div>
            <p className="text-[14px] font-bold text-ink">{t('shareVideo.sellerOnly')}</p>
            <p className="text-[12.5px] text-ink2">{t('shareVideo.sellerOnlyHint')}</p>
            <button
              type="button"
              onClick={() => navigate(currentUser ? '/devenir-vendeur' : '/login')}
              className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-input bg-gold-400 text-ink font-semibold text-[14px] active:scale-[0.97] transition-transform hover:bg-goldHov"
            >
              {currentUser ? t('shareVideo.becomeSeller') : t('shareVideo.login')}
            </button>
          </div>
        )}

        {isSeller && !attachedTo && (
          <>
            {/* ── Lien vidéo reçu / à coller ── */}
            <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-4 space-y-3">
              {info ? (
                <div className="flex items-center gap-3">
                  {info.thumbnailUrl ? (
                    <img src={info.thumbnailUrl} alt="" className="w-16 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-10 rounded-lg shrink-0 flex items-center justify-center text-[18px]"
                      style={{ background: 'linear-gradient(160deg,#1a1c22,#2c2f38)' }}>
                      <span aria-hidden>{info.emoji}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <span
                      className="inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-extrabold text-white leading-none"
                      style={{ background: PILL_BG[info.platform] }}
                    >
                      {info.label}
                    </span>
                    <p className="text-[11.5px] text-ink2 truncate mt-1">{rawUrl}</p>
                  </div>
                  <Check size={18} className="ml-auto shrink-0 text-emerald-600" aria-hidden />
                </div>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-ink">
                    <Video size={14} className="inline mr-1 -mt-0.5 text-goldDeep" />
                    {rawUrl ? t('shareVideo.invalidLink') : t('shareVideo.noLink')}
                  </p>
                  <div className="relative">
                    <input
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={rawUrl}
                      onChange={e => setRawUrl(e.target.value)}
                      className={`${inputCls} pr-24`}
                      placeholder="https://www.tiktok.com/@…/video/…"
                    />
                    {'clipboard' in navigator && !!(navigator.clipboard as any)?.readText && (
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-[11.5px] font-bold text-goldDeep active:scale-[0.95] transition-transform"
                        style={{ background: 'rgba(245,200,66,0.15)' }}
                      >
                        <ClipboardPaste size={12} /> {t('shareVideo.paste')}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-ink2">{t('shareVideo.platformsHint')}</p>
                </>
              )}
            </div>

            {/* ── Choix de l'annonce ── */}
            {info && (
              <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-4">
                <h2 className="text-[13.5px] font-black text-ink mb-3">{t('shareVideo.pickProduct')}</h2>

                {loadingProducts && (
                  <div className="space-y-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-16 rounded-input bg-fieldRest animate-pulse" />
                    ))}
                  </div>
                )}

                {!loadingProducts && products.length === 0 && (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-[12.5px] text-ink2">{t('shareVideo.noProducts')}</p>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="inline-flex items-center gap-2 px-4 h-10 rounded-input bg-gold-400 text-ink font-semibold text-[13px] active:scale-[0.97] transition-transform"
                    >
                      <Store size={14} /> {t('shareVideo.goDashboard')}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {products.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!!attaching}
                      onClick={() => handleAttach(p)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-input border border-black/[0.07] bg-white text-left
                                 transition hover:border-gold-400 active:scale-[0.99] disabled:opacity-60"
                    >
                      {p.images?.[0] ? (
                        <img src={getOptimizedUrl(p.images[0], 120)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-fieldRest shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink truncate">{p.title}</p>
                        <p className="text-[11.5px] text-ink2">
                          {p.videoUrl
                            ? t('shareVideo.willReplace')
                            : p.status === 'pending' ? t('shareVideo.pendingNote') : t('shareVideo.tapToLink')}
                        </p>
                      </div>
                      {attaching === p.id ? (
                        <span className="w-5 h-5 shrink-0 border-2 border-goldDeep border-t-transparent rounded-full animate-spin" aria-hidden />
                      ) : (
                        <span
                          aria-hidden
                          className="shrink-0 block"
                          style={{
                            width: 0, height: 0,
                            borderLeft: '12px solid #F5C842',
                            borderTop: '7px solid transparent',
                            borderBottom: '7px solid transparent',
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Succès + kit lien-en-bio ── */}
        {isSeller && attachedTo && (
          <>
            <div className="rounded-card border p-5 text-center space-y-2"
              style={{ background: 'linear-gradient(135deg,#FFFDF0,#FEF9D3)', borderColor: 'rgba(245,200,66,0.5)' }}>
              <div className="text-4xl" aria-hidden>🎉</div>
              <p className="text-[15px] font-black text-ink">{t('shareVideo.successTitle')}</p>
              <p className="text-[12.5px] text-ink2">{t('shareVideo.successBody', { title: attachedTo.title })}</p>
              <button
                type="button"
                onClick={() => navigate(`/product/${attachedTo.slug || attachedTo.id}`)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-goldDeep"
              >
                {t('shareVideo.viewProduct')} <ExternalLink size={12} />
              </button>
            </div>

            {/* Kit lien-en-bio : le trafic TikTok revient vers la boutique Nunulia */}
            <div className="bg-white rounded-card border border-black/[0.07] shadow-card p-4 space-y-3">
              <h2 className="text-[13.5px] font-black text-ink">🚀 {t('shareVideo.bioKitTitle')}</h2>
              <p className="text-[12px] text-ink2">{t('shareVideo.bioKitHint')}</p>
              <pre className="rounded-input p-3 text-[12px] leading-relaxed whitespace-pre-wrap break-words font-mono text-white" style={{ background: '#111318' }}>
                {bioText}
              </pre>
              <button
                type="button"
                onClick={handleCopyBio}
                className="w-full h-11 rounded-input bg-gold-400 hover:bg-goldHov text-ink text-[13px] font-bold active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-2"
              >
                {copied ? <><Check size={15} /> {t('shareVideo.copied')}</> : <><Copy size={14} /> {t('shareVideo.copyBio')}</>}
              </button>
              <button
                type="button"
                onClick={() => { setAttachedTo(null); setRawUrl(''); }}
                className="w-full h-10 rounded-input bg-canvas text-ink2 text-[12.5px] font-bold active:scale-[0.97] transition-transform"
              >
                {t('shareVideo.linkAnother')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShareVideoPage;
