import React, { useState, useEffect } from 'react';
import { Review } from '../types';
import { getProductReviews, addReview } from '../services/firebase';
import { uploadImage, getOptimizedUrl } from '../services/cloudinary';
import { useToast } from './Toast';

interface ReviewSectionProps {
  productId: string;
  currentUserId?: string | null;
  productRating: number;
  reviewCount: number;
}

export const ReviewSection: React.FC<ReviewSectionProps> = ({
  productId,
  currentUserId,
  productRating,
  reviewCount,
}) => {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form state
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState('');
  const [formImages, setFormImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await getProductReviews(productId);
      setReviews(data);
      setLoading(false);
    };
    load();
  }, [productId]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + formImages.length > 3) {
      toast('Maximum 3 photos par avis.', 'info');
      return;
    }
    setFormImages(prev => [...prev, ...files].slice(0, 3));
  };

  const removeImage = (index: number) => {
    setFormImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      toast('Connectez-vous pour laisser un avis.', 'info');
      return;
    }
    if (!formComment.trim()) {
      toast('Veuillez ajouter un commentaire.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      // Upload images if any
      const imageUrls: string[] = [];
      for (const file of formImages) {
        const url = await uploadImage(file);
        imageUrls.push(url);
      }

      const review = await addReview(productId, formRating, formComment, imageUrls);
      setReviews(prev => [review, ...prev]);
      setFormRating(5);
      setFormComment('');
      setFormImages([]);
      setShowForm(false);
      toast('Merci pour votre avis !', 'success');
    } catch (err: any) {
      toast(err.message || 'Erreur lors de la soumission.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const hasUserReviewed = reviews.some(r => r.userId === currentUserId);

  return (
    <div className="space-y-4">
      {/* Header with rating summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          Avis clients
          <span className="text-sm font-normal text-gray-400">({reviewCount})</span>
        </h3>
        {currentUserId && !hasUserReviewed && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            + Laisser un avis
          </button>
        )}
      </div>

      {/* Rating summary */}
      <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{productRating.toFixed(1)}</div>
          <div className="flex gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map(star => (
              <span key={star} className={`text-sm ${star <= Math.round(productRating) ? 'text-yellow-400' : 'text-gray-600'}`}>
                &#9733;
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{reviewCount} avis</p>
        </div>
        <div className="flex-1 space-y-1 ml-4">
          {[5, 4, 3, 2, 1].map(star => {
            const count = reviews.filter(r => r.rating === star).length;
            const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-3">{star}</span>
                <span className="text-yellow-400">&#9733;</span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full origin-left transition-transform duration-500"
                    style={{ transform: `scaleX(${pct / 100})` }}
                  />
                </div>
                <span className="text-gray-500 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 space-y-3">
          <p className="text-sm font-medium text-white">Votre avis</p>

          {/* Star rating selector */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setFormRating(star)}
                className={`text-2xl transition-transform hover:scale-110 ${
                  star <= formRating ? 'text-yellow-400' : 'text-gray-600'
                }`}
              >
                &#9733;
              </button>
            ))}
          </div>

          {/* Comment */}
          <textarea
            value={formComment}
            onChange={e => setFormComment(e.target.value)}
            placeholder="Partagez votre experience..."
            maxLength={1000}
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
          />

          {/* Image upload */}
          <div className="flex items-center gap-2 flex-wrap">
            {formImages.map((file, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-600 group">
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity"
                >
                  &#x2715;
                </button>
              </div>
            ))}
            {formImages.length < 3 && (
              <label className="w-16 h-16 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-500 hover:border-blue-500 hover:text-blue-400 cursor-pointer transition-colors">
                <span className="text-xl">+</span>
                <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </label>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormImages([]); }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !formComment.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Envoi...' : 'Publier'}
            </button>
          </div>
        </form>
      )}

      {/* Review list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(n => (
            <div key={n} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review.id} className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
              {/* User info + rating */}
              <div className="flex items-center gap-3">
                <img
                  src={getOptimizedUrl(review.userAvatar, 40)}
                  alt={review.userName}
                  className="w-8 h-8 rounded-full object-cover border border-gray-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{review.userName}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <span key={star} className={`text-xs ${star <= review.rating ? 'text-yellow-400' : 'text-gray-600'}`}>
                          &#9733;
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Comment */}
              <p className="text-sm text-gray-300 leading-relaxed">{review.comment}</p>

              {/* Review photos */}
              {review.images && review.images.length > 0 && (
                <div className="flex gap-2 pt-1">
                  {review.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewImage(img)}
                      className="w-20 h-20 rounded-lg overflow-hidden border border-gray-600 hover:border-blue-500 transition-colors"
                    >
                      <img src={getOptimizedUrl(img, 100)} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 py-2">Aucun avis pour le moment. Soyez le premier !</p>
      )}

      {/* Full-screen image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white text-2xl p-2 hover:bg-white/10 rounded-full"
          >
            &#x2715;
          </button>
          <img
            src={getOptimizedUrl(previewImage, 1200)}
            alt="Preview"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
};
