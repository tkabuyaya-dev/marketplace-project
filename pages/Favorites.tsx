import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TC } from '../constants';
import { Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { getProductsByIds } from '../services/firebase';
import { db, collection, getDocs, query, where, COLLECTIONS } from '../services/firebase/constants';
import { useAppContext } from '../contexts/AppContext';

export const Favorites: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tc = TC;

  const [products, setProducts] = useState<Product[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const likesQuery = query(
        collection(db, COLLECTIONS.LIKES),
        where('userId', '==', currentUser.id)
      );
      const likesSnap = await getDocs(likesQuery);
      const likedProductIds = likesSnap.docs.map(d => d.data().productId);

      if (likedProductIds.length === 0) {
        setProducts([]);
        setLikedMap({});
        setLoading(false);
        return;
      }

      const fetchedProducts = await getProductsByIds(likedProductIds);
      setProducts(fetchedProducts);

      // All products on this page are liked
      const map: Record<string, boolean> = {};
      fetchedProducts.forEach(p => { map[p.id] = true; });
      setLikedMap(map);
    } catch (error) {
      console.error('[Favorites] Error loading favorites:', error);
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  // Not logged in
  if (!currentUser) {
    return (
      <div className="pb-24 pt-safe-header md:pt-24 px-4 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('favorites.loginRequired')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
            {t('favorites.loginSubtitle')}
          </p>
          <button
            onClick={() => navigate('/login')}
            className={`px-6 py-3 ${tc.bg400} text-gray-900 rounded-full font-medium hover:opacity-90 transition-opacity`}
          >
            {t('favorites.loginBtn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-safe-header md:pt-24 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-xl ${tc.bg400_10} flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${tc.text400}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('favorites.title')}</h1>
          {!loading && products.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('favorites.productCount', { count: products.length })}</p>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-80 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('favorites.empty')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
            {t('favorites.emptySubtitle')}
          </p>
          <button
            onClick={() => navigate('/')}
            className={`px-6 py-3 ${tc.bg400} text-gray-900 rounded-full font-medium hover:opacity-90 transition-opacity`}
          >
            {t('favorites.explore')}
          </button>
        </div>
      ) : (
        /* Product grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div key={product.id} className="relative group">
              <ProductCard
                product={product}
                onClick={() => onProductClick(product)}
                currentUserId={currentUser.id}
                initialLiked={likedMap[product.id]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Favorites;
