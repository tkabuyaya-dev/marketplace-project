import React, { useMemo } from 'react';
import { CURRENCY, TC } from '../constants';

interface PreviewData {
  title: string;
  price: string;
  originalPrice: string;
  currency: string;
  imagePreviews: string[];
  sellerName: string;
  sellerAvatar: string;
  isVerified: boolean;
}

/**
 * Live preview of the product card as the seller fills the form.
 * Reuses the same visual language as ProductCard but with form data.
 * Lightweight — no Firebase calls, pure rendering.
 */
export const ProductPreview: React.FC<{ data: PreviewData; visible: boolean; onToggle: () => void }> = ({ data, visible, onToggle }) => {
  const tc = TC;
  const cur = data.currency || CURRENCY;
  const priceNum = Number(data.price) || 0;
  const origNum = Number(data.originalPrice) || 0;
  const discount = origNum > priceNum && priceNum > 0
    ? Math.round(((origNum - priceNum) / origNum) * 100)
    : null;

  const previewProduct = useMemo(() => ({
    title: data.title || 'Titre du produit',
    price: priceNum,
    originalPrice: origNum,
    image: data.imagePreviews[0] || '',
    currency: cur,
    discount,
    sellerName: data.sellerName,
    sellerAvatar: data.sellerAvatar,
    isVerified: data.isVerified,
  }), [data.title, priceNum, origNum, cur, discount, data.imagePreviews[0], data.sellerName, data.sellerAvatar, data.isVerified]);

  return (
    <div className="space-y-2">
      {/* Toggle button (mobile) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full md:hidden flex items-center justify-center gap-2 py-2 text-xs text-gray-400 hover:text-white border border-gray-700/50 rounded-xl transition-colors"
      >
        <span>👁</span>
        {visible ? 'Masquer l\'apercu' : 'Voir l\'apercu en direct'}
      </button>

      {/* Preview card */}
      {visible && (
        <div className="animate-fade-in">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 text-center">
            Apercu en direct
          </p>
          <div className={`bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden max-w-[280px] mx-auto shadow-lg ${tc.hoverShadow}`}>
            {/* Image */}
            <div className="aspect-[4/3] w-full overflow-hidden relative bg-gray-800">
              {previewProduct.image ? (
                <img
                  src={previewProduct.image}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <div className="text-center">
                    <span className="text-4xl block mb-1">📸</span>
                    <span className="text-xs">Ajoutez une photo</span>
                  </div>
                </div>
              )}

              {/* Discount badge */}
              {discount && discount > 5 && (
                <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                  -{discount}%
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-3 space-y-2">
              <h3 className={`font-semibold truncate text-sm leading-tight ${
                previewProduct.title === 'Titre du produit' ? 'text-gray-500 italic' : 'text-gray-100'
              }`}>
                {previewProduct.title}
              </h3>

              <div className="flex items-end justify-between">
                <div>
                  {priceNum > 0 ? (
                    <>
                      <p className={`${tc.text400} font-bold text-base`}>
                        {priceNum.toLocaleString('fr-FR')} <span className="text-xs font-normal text-gray-400">{cur}</span>
                      </p>
                      {origNum > priceNum && (
                        <p className="text-gray-500 text-xs line-through">
                          {origNum.toLocaleString('fr-FR')} {cur}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm italic">Prix...</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-gray-400 text-xs">-</span>
                </div>
              </div>

              {/* Seller */}
              <div className="flex items-center gap-2 pt-1.5 border-t border-gray-700/50">
                {previewProduct.sellerAvatar ? (
                  <img src={previewProduct.sellerAvatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-600 flex-shrink-0" />
                )}
                <span className="text-gray-400 text-xs truncate flex-1">
                  {previewProduct.sellerName}
                  {previewProduct.isVerified && (
                    <svg className="inline-block w-3.5 h-3.5 ml-0.5 text-blue-500 -mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                    </svg>
                  )}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">👁 0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
