import React from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { updateProductStatus, deleteProduct, createNotification } from '../../services/firebase';
import { getOptimizedUrl } from '../../services/cloudinary';
import { CURRENCY } from '../../constants';
import type { ProductsProps } from './types';

export const Products: React.FC<ProductsProps> = ({
  products, allProducts, categories, pendingCount, productFilter, setProductFilter,
  productSellerSearch, setProductSellerSearch,
  productCategoryFilter, setProductCategoryFilter,
  productDateSort, setProductDateSort,
  productResubmittedOnly, setProductResubmittedOnly,
  setProducts, setAllProducts, currentUser,
  rejectingProductId, setRejectingProductId, rejectReason, setRejectReason,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleApprove = async (id: string) => {
    await updateProductStatus(id, 'approved');
    const product = allProducts.find(p => p.id === id);
    if (product?.seller?.id) {
      await createNotification({
        userId: product.seller.id,
        type: 'product_approved',
        title: t('admin.productApprovedNotif'),
        body: t('admin.productApprovedBody', { title: product.title }),
        read: false,
        createdAt: Date.now(),
        data: { productSlug: product.slug || product.id },
      });
    }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
  };

  const handleReject = (id: string) => {
    setRejectingProductId(id);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingProductId || !rejectReason.trim()) return;
    const reason = rejectReason.trim();
    await updateProductStatus(rejectingProductId, 'rejected', reason);
    const product = allProducts.find(p => p.id === rejectingProductId);
    if (product?.seller?.id) {
      await createNotification({
        userId: product.seller.id,
        type: 'product_rejected',
        title: t('admin.productRejectedNotif'),
        body: t('admin.productRejectedBody', { title: product.title, reason }),
        read: false,
        createdAt: Date.now(),
        data: { productSlug: product.slug || product.id },
      });
    }
    setProducts(prev => prev.map(p => p.id === rejectingProductId ? { ...p, status: 'rejected', rejectionReason: reason } : p));
    setAllProducts(prev => prev.map(p => p.id === rejectingProductId ? { ...p, status: 'rejected', rejectionReason: reason } : p));
    setRejectingProductId(null);
    setRejectReason('');
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm(t('admin.confirmDeleteProduct'))) {
      await deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-white">
            {t('admin.productModeration')}
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-600 text-white text-xs font-bold rounded-full">{t('admin.pendingBadge', { count: pendingCount })}</span>
            )}
          </h2>
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setProductFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  productFilter === f
                    ? f === 'pending' ? 'bg-yellow-600 text-white'
                      : f === 'approved' ? 'bg-green-600 text-white'
                      : f === 'rejected' ? 'bg-red-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f === 'pending' ? t('admin.filterPending') : f === 'approved' ? t('admin.filterApproved') : f === 'rejected' ? t('admin.filterRejected') : t('admin.filterAll')}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced filters row */}
        <div className="flex flex-wrap gap-3 items-center p-3 bg-gray-900/60 border border-gray-800 rounded-xl">
          {/* Seller search */}
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
            <input
              type="text"
              value={productSellerSearch}
              onChange={e => setProductSellerSearch(e.target.value)}
              placeholder={t('admin.filterSellerPlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Category dropdown */}
          <select
            value={productCategoryFilter}
            onChange={e => setProductCategoryFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
          >
            <option value="all">{t('admin.filterAllCategories')}</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Date sort */}
          <button
            onClick={() => setProductDateSort(productDateSort === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 bg-gray-800 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
          >
            {productDateSort === 'newest' ? '↓' : '↑'}
            {productDateSort === 'newest' ? t('admin.filterNewest') : t('admin.filterOldest')}
          </button>

          {/* Resubmitted only toggle */}
          <button
            onClick={() => setProductResubmittedOnly(!productResubmittedOnly)}
            className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap ${
              productResubmittedOnly
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🔁 {t('admin.filterResubmitted')}
          </button>

          {/* Clear all filters */}
          {(productSellerSearch || productCategoryFilter !== 'all' || productDateSort !== 'newest' || productResubmittedOnly) && (
            <button
              onClick={() => {
                setProductSellerSearch('');
                setProductCategoryFilter('all');
                setProductDateSort('newest');
                setProductResubmittedOnly(false);
              }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors underline ml-auto"
            >
              {t('admin.filterClearAll')}
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-xs text-gray-500">
          {t('admin.filterResultCount', { count: products.length })}
        </p>

        {products.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500">
            <div className="text-4xl mb-3">
              {productFilter === 'pending' ? '✅' : '📦'}
            </div>
            <p>{productFilter === 'pending' ? t('admin.noProductsPending') : t('admin.noProductsFound')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map(product => (
              <div key={product.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-gray-800">
                  {product.images[0] ? (
                    <img src={getOptimizedUrl(product.images[0], 200)} alt={product.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">📷</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-white font-bold truncate">{product.title}</h3>
                      <p className="text-sm text-gray-400">{product.price.toLocaleString('fr-FR')} {CURRENCY}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                      product.status === 'pending' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-600/30' :
                      product.status === 'approved' ? 'bg-green-900/40 text-green-400 border border-green-600/30' :
                      'bg-red-900/40 text-red-400 border border-red-600/30'
                    }`}>
                      {product.status === 'pending' ? t('admin.statusPending') : product.status === 'approved' ? t('admin.statusApproved') : t('admin.statusRejected')}
                    </span>
                    {product.resubmittedAt && product.status === 'pending' && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-900/40 text-blue-400 border border-blue-600/30">
                        {t('admin.statusResubmitted')}
                      </span>
                    )}
                  </div>
                  {product.status === 'rejected' && product.rejectionReason && (
                    <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-1.5 mb-2">
                      {t('admin.reason', { reason: product.rejectionReason })}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mb-2 line-clamp-2">{product.description}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1">
                      {product.seller?.avatar && <img src={getOptimizedUrl(product.seller.avatar, 20)} className="w-4 h-4 rounded-full" alt="" loading="lazy" />}
                      {product.seller?.name || 'Vendeur'}
                    </span>
                    <span>📂 {categories.find(c => c.id === product.category || c.slug === product.category)?.name || product.category}</span>
                    <span>👁 {product.views}</span>
                    <span>❤️ {product.likesCount || 0}</span>
                    {product.images.length > 1 && <span>📸 {product.images.length} photos</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.status !== 'approved' && (
                      <button onClick={() => handleApprove(product.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors">
                        {t('admin.approve')}
                      </button>
                    )}
                    {product.status !== 'rejected' && (
                      <button onClick={() => handleReject(product.id)} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-lg transition-colors">
                        {t('admin.reject')}
                      </button>
                    )}
                    <button onClick={() => handleDeleteProduct(product.id)} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold rounded-lg border border-red-600/30 transition-colors">
                      {t('admin.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject reason modal */}
      {rejectingProductId && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRejectingProductId(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">{t('admin.rejectReasonTitle')}</h3>
            <p className="text-sm text-gray-400">{t('admin.rejectReasonHint')}</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={t('admin.rejectReasonPlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm resize-none h-24 outline-none focus:border-red-500"
            />
            <div className="flex gap-3">
              <button onClick={confirmReject} disabled={!rejectReason.trim()}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 hover:bg-red-500 transition-colors">
                {t('admin.confirmReject')}
              </button>
              <button onClick={() => setRejectingProductId(null)}
                className="px-4 py-2.5 bg-gray-800 text-gray-400 rounded-xl text-sm hover:text-white border border-gray-700">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
