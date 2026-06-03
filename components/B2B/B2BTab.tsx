/**
 * B2BTab — conteneur principal du Réseau B2B.
 *
 * Responsable :
 *   - applique le marker data-b2b="true" pour scoper les CSS variables
 *   - charge les chips de filtre + compteurs par catégorie
 *   - tient le filtre actif (catégorie + pays implicite via préférences)
 *   - infinit-scroll cursor-based via fetchMoreB2BPosts
 *   - FAB "Publier un besoin" (Pro/Grossiste uniquement)
 *   - Banner upsell visible si non-abonné, avant le feed
 *
 * Note d'archi : on monte ce composant à l'intérieur d'une page (pas en
 * modal). C'est le brief qui parle de "B2BTab" — ici c'est notre conteneur,
 * pas un tab système.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencesContext } from '../../contexts/AppContext';
import { useB2BAccess } from '../../hooks/useB2BAccess';
import {
  subscribeToB2BPosts, fetchMoreB2BPosts, countOpenPostsByCategory,
} from '../../services/firebase/b2b';
import { B2BPostCard } from './B2BPostCard';
import { B2BPublishForm } from './B2BPublishForm';
import { B2BCategoryChips } from './B2BCategoryChips';
import { B2BUpsellOverlay } from './B2BUpsellOverlay';
import type { B2BPost, B2BCategory } from '../../types';
import './b2b.css';

const ALL_CATS: B2BCategory[] = ['fournisseur', 'revendeur', 'marche', 'transport'];

function emptyCounts(): Record<B2BCategory, number> {
  return { fournisseur: 0, revendeur: 0, marche: 0, transport: 0 };
}

export const B2BTab: React.FC = () => {
  const { t } = useTranslation();
  const access = useB2BAccess();
  const { activeCountry } = usePreferencesContext();
  const country = (activeCountry || '').toUpperCase();

  const [activeCat, setActiveCat] = useState<B2BCategory | null>(null);
  const [posts, setPosts] = useState<B2BPost[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [counts, setCounts] = useState<Record<B2BCategory, number>>(emptyCounts());
  const [publishOpen, setPublishOpen] = useState(false);

  const lastDocRef = useRef<any>(null);

  // ── Subscribe principal ───────────────────────────────────────────────
  useEffect(() => {
    setPosts([]);
    lastDocRef.current = null;
    setHasMore(true);
    const unsub = subscribeToB2BPosts(
      { country, category: activeCat ?? undefined },
      (list) => {
        setPosts(list);
        // Si la première page est inférieure à la limite, plus rien à fetch
        setHasMore(list.length >= 20);
      },
    );
    return () => unsub();
  }, [country, activeCat]);

  // ── Compteurs catégories (one-shot, reload au pays / après publish) ──
  const refreshCounts = useMemo(
    () => async () => {
      const c = await countOpenPostsByCategory(country);
      setCounts(c);
    },
    [country],
  );
  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const labels = useMemo<Record<B2BCategory | 'all', string>>(() => ({
    all:         t('b2b.cat.all'),
    fournisseur: t('b2b.cat.fournisseur'),
    revendeur:   t('b2b.cat.revendeur'),
    marche:      t('b2b.cat.marche'),
    transport:   t('b2b.cat.transport'),
  }), [t]);

  const handleLoadMore = async () => {
    if (moreLoading || !hasMore || !lastDocRef.current) return;
    setMoreLoading(true);
    try {
      const { posts: next, lastDoc } = await fetchMoreB2BPosts(
        { country, category: activeCat ?? undefined },
        lastDocRef.current,
      );
      setPosts((p) => [...p, ...next]);
      lastDocRef.current = lastDoc;
      if (!lastDoc) setHasMore(false);
    } finally {
      setMoreLoading(false);
    }
  };

  return (
    <div data-b2b="true" className="b2b-shell pb-24">
      {/* pt aligné avec la hauteur des navbars existantes : 14 (mobile) / 16 (desktop) */}
      <div className="max-w-2xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+72px)] md:pt-24">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[22px] font-black text-white tracking-tight">
              🌍 {t('b2b.title')}
            </h1>
            <p className="text-[12.5px] text-white/55 mt-0.5">
              {t('b2b.subtitle')}
            </p>
          </div>
        </div>

        <B2BCategoryChips
          active={activeCat}
          counts={counts}
          labels={labels}
          onChange={setActiveCat}
        />

        {!access.canInteract && <B2BUpsellOverlay variant="banner" />}

        <div className="mt-3">
          {posts.length === 0 && (
            <p className="text-center text-[13px] text-white/55 py-10">
              {t('b2b.emptyFeed')}
            </p>
          )}
          {posts.map((p) => (
            <B2BPostCard key={p.id} post={p} onPostUpdated={refreshCounts} />
          ))}
          {hasMore && posts.length > 0 && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={moreLoading}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white/80 border border-white/15 hover:bg-white/5 disabled:opacity-50"
              >
                {moreLoading ? t('b2b.loadingMore') : t('b2b.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FAB Publier — Pro/Grossiste uniquement */}
      {access.canPublish && (
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          className="fixed right-4 bottom-24 sm:bottom-6 z-40 px-4 h-12 rounded-2xl text-[14px] font-extrabold text-gray-900 inline-flex items-center gap-2 active:scale-95 transition-transform"
          style={{
            background: '#F59E0B',
            boxShadow: '0 8px 24px rgba(245,158,11,0.45)',
          }}
          aria-label={t('b2b.publishCta')}
        >
          ＋ {t('b2b.publishCta')}
        </button>
      )}

      <B2BPublishForm
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublished={refreshCounts}
      />
    </div>
  );
};
