/**
 * AURABUJA — Delete Account Confirmation Modal
 *
 * Re-authenticates via Google popup, then calls the
 * deleteUserAccount Cloud Function.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase-config';
import { reauthenticateWithGoogle, clearCachedUser } from '../services/firebase';
import { useToast } from './Toast';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => Promise<void>;
  hasActiveSubscription: boolean;
  subscriptionExpiresAt: number | null;
  tierLabel: string | null;
  isVendor: boolean;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen, onClose, onLogout,
  hasActiveSubscription, subscriptionExpiresAt, tierLabel, isVendor,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const formattedDate = subscriptionExpiresAt
    ? new Date(subscriptionExpiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      // Step 1: Re-authenticate with Google
      await reauthenticateWithGoogle();
    } catch (err: any) {
      setDeleting(false);
      // User closed the popup
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        toast(t('profile.deleteAccountCancelled'), 'info');
        return;
      }
      toast(t('profile.deleteAccountAuthError'), 'error');
      return;
    }

    try {
      // Step 2: Call Cloud Function
      const deleteAccount = httpsCallable(functions, 'deleteUserAccount');
      await deleteAccount();

      // Step 3: Clean up client state
      clearCachedUser();
      onClose();
      await onLogout();
      navigate('/');
      toast(t('profile.deleteAccountSuccess'), 'success');
    } catch (err: any) {
      console.error('Delete account error:', err);
      toast(t('profile.deleteAccountError'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !deleting && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>

        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-red-400 text-lg">!</span>
          </div>
          <h3 className="text-lg font-bold text-white">{t('profile.deleteAccountTitle')}</h3>
        </div>

        {/* What will be removed */}
        <div>
          <p className="text-sm text-gray-400 mb-3">{t('profile.deleteAccountWillRemove')}</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2 text-red-400">
              <span className="mt-0.5 flex-shrink-0">&#10005;</span>
              <span>{t('profile.deleteAccountProfile')}</span>
            </li>
            {isVendor && (
              <li className="flex items-start gap-2 text-red-400">
                <span className="mt-0.5 flex-shrink-0">&#10005;</span>
                <span>{t('profile.deleteAccountProducts')}</span>
              </li>
            )}
            <li className="flex items-start gap-2 text-red-400">
              <span className="mt-0.5 flex-shrink-0">&#10005;</span>
              <span>{t('profile.deleteAccountNotifications')}</span>
            </li>
            <li className="flex items-start gap-2 text-red-400">
              <span className="mt-0.5 flex-shrink-0">&#10005;</span>
              <span>{t('profile.deleteAccountAccess')}</span>
            </li>
          </ul>
        </div>

        {/* Active subscription warning */}
        {hasActiveSubscription && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
            <p className="text-sm text-orange-400">
              {t('profile.deleteAccountSubWarning', { tier: tierLabel || 'Seller', date: formattedDate })}
            </p>
          </div>
        )}

        {/* Confirmation hint */}
        <p className="text-xs text-gray-500">{t('profile.deleteAccountConfirmHint')}</p>

        {/* Buttons */}
        <div className="flex flex-col gap-3 pt-1">
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('profile.deleteAccountDeleting')}
              </>
            ) : (
              t('profile.deleteAccountConfirmBtn')
            )}
          </button>
          <button
            onClick={onClose}
            disabled={deleting}
            className="w-full py-2.5 bg-gray-800 text-gray-400 rounded-xl text-sm hover:text-white border border-gray-700 disabled:opacity-50 transition-colors"
          >
            {t('profile.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
