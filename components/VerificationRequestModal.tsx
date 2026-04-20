import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface VerificationRequestModalProps {
  open: boolean;
  onClose: () => void;
}

export const VerificationRequestModal: React.FC<VerificationRequestModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-gray-900 border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up sm:animate-card-in overflow-hidden"
      >
        {/* Top gradient band */}
        <div className="relative h-24 bg-gradient-to-br from-amber-400/20 via-yellow-500/10 to-transparent flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(245,200,66,0.15),transparent_60%)]" />
          <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <svg className="w-9 h-9 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 pt-4 pb-6 space-y-5">
          <div className="text-center">
            <h2 id="verification-modal-title" className="text-xl sm:text-2xl font-black text-white mb-1">
              {t('verification.modalTitle')}
            </h2>
            <p className="text-sm text-gray-400">{t('verification.modalSubtitle')}</p>
          </div>

          {/* Timeline */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-base">⏱</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('verification.modalStep1Title')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('verification.modalStep1Desc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-base">📞</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('verification.modalStep2Title')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('verification.modalStep2Desc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-base">🚶</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('verification.modalStep3Title')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('verification.modalStep3Desc')}</p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-500/20">
            <p className="text-xs text-amber-300/90 leading-relaxed">
              {t('verification.modalTrust')}
            </p>
          </div>

          <Button onClick={onClose} className="w-full">{t('verification.modalCta')}</Button>

          <p className="text-[10px] text-gray-500 text-center italic">
            {t('verification.modalSignature')}
          </p>
        </div>
      </div>
    </div>
  );
};
