import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/Button';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { updateUserProfile } from '../services/firebase';
import { useNotificationConsent } from '../hooks/useNotificationConsent';
import { useToast } from '../components/Toast';

const Profile: React.FC = () => {
  const { currentUser, handleLogout, handleSellerAccess } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { permission, requestPermission } = useNotificationConsent();
  const { toast } = useToast();

  if (!currentUser) return <Navigate to="/login" replace />;

  const startEdit = () => {
    setEditName(currentUser.name || '');
    setEditWhatsapp(currentUser.whatsapp || '');
    setEditBio(currentUser.bio || '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile(currentUser.id, {
        name: editName.trim(),
        whatsapp: editWhatsapp.trim(),
        bio: editBio.trim(),
      });
      setEditing(false);
    } catch (err) {
      console.error('Erreur sauvegarde profil:', err);
    } finally {
      setSaving(false);
    }
  };

  const joinYear = new Date(currentUser.joinDate || Date.now()).getFullYear();
  const roleLabel = currentUser.role === 'admin' ? t('profile.roleAdmin') : currentUser.role === 'seller' ? t('profile.roleSeller') : t('profile.roleBuyer');

  return (
    <div className="pt-20 md:pt-24 px-4 pb-24">
      <div className="bg-gray-800 rounded-3xl p-6 text-center border border-gray-700 max-w-md mx-auto">
        {currentUser.avatar ? (
          <img src={currentUser.avatar} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-900 object-cover" alt="Profile" />
        ) : (
          <div className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-900 bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
            {currentUser.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}

        {editing ? (
          <div className="space-y-3 text-left mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t('profile.name')}</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t('profile.bio')}</label>
              <textarea
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                placeholder={t('profile.bioPlaceholder')}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none min-h-[60px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t('profile.whatsapp')}</label>
              <input
                value={editWhatsapp}
                onChange={e => setEditWhatsapp(e.target.value)}
                placeholder="+257..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>{t('profile.cancel')}</Button>
              <Button className="flex-1" onClick={handleSave} isLoading={saving}>{t('profile.save')}</Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl text-white font-bold">{currentUser.name}</h2>
            <p className="text-gray-400 text-sm mb-1">{currentUser.email}</p>
            {currentUser.bio && <p className="text-gray-500 text-xs mb-2 italic">"{currentUser.bio}"</p>}
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="inline-block px-3 py-1 bg-gray-700 rounded-full text-xs text-gray-300 uppercase tracking-wider">{roleLabel}</span>
              <span className="text-xs text-gray-500">{t('profile.since', { year: joinYear })}</span>
            </div>
            <button onClick={startEdit} className="text-xs text-blue-400 hover:underline mb-4 block mx-auto">{t('profile.editProfile')}</button>
          </>
        )}

        <div className="space-y-3">
          {currentUser.role === 'seller' && currentUser.slug && (
            <Button className="w-full" variant="secondary" onClick={() => navigate(`/shop/${currentUser.slug}`)}>
              {t('profile.viewMyShop')}
            </Button>
          )}
          {currentUser.role === 'buyer' && (
            <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 border-none text-white" onClick={() => navigate('/register-seller')}>
              {t('profile.becomeSeller')}
            </Button>
          )}
          {(currentUser.role === 'seller' || currentUser.role === 'admin') && (
            <Button className="w-full" variant="secondary" onClick={handleSellerAccess}>
              {currentUser.role === 'admin' ? t('profile.adminConsole') : t('profile.sellerArea')}
            </Button>
          )}
          <Button className="w-full border-red-900/50 text-red-400 hover:bg-red-900/20" variant="outline" onClick={handleLogout}>{t('profile.logout')}</Button>
        </div>

        {/* Notification consent */}
        <div className="border-t border-gray-700/50 mt-6 pt-4">
          {permission === 'granted' && (
            <p className="text-xs text-green-400/70 text-center">🔔 Notifications activées</p>
          )}
          {permission === 'denied' && (
            <p className="text-xs text-gray-500 text-center">🔕 Notifications désactivées dans le navigateur</p>
          )}
          {permission === 'default' && (
            <button
              onClick={async () => {
                const result = await requestPermission();
                if (result === 'granted') toast(t('profile.notifsEnabled'), 'success');
                else toast(t('profile.notifsBlocked'), 'error');
              }}
              className="w-full py-2.5 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-xl hover:bg-amber-500/10 transition-colors"
            >
              🔔 {t('profile.enableNotifs')}
            </button>
          )}
        </div>

        {/* Legal links */}
        <div className="border-t border-gray-700/50 mt-6 pt-4 pb-2 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Link to="/cgu" className="hover:text-amber-400 hover:underline transition-colors">
              {t('profile.terms')}
            </Link>
            <span className="text-gray-600">&middot;</span>
            <Link to="/politique-confidentialite" className="hover:text-amber-400 hover:underline transition-colors">
              {t('profile.privacy')}
            </Link>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">&copy; 2026 NUNULIA. Tous droits réservés.</p>
        </div>

        {/* Danger zone */}
        <div className="border-t border-gray-700 mt-4 pt-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{t('profile.dangerZone')}</p>
          <p className="text-xs text-gray-600 mb-3">{t('profile.dangerZoneHint')}</p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-2.5 border border-red-600/30 text-red-400 text-sm font-bold rounded-xl hover:bg-red-600/10 transition-colors"
          >
            {t('profile.deleteAccountTitle')}
          </button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onLogout={handleLogout}
        hasActiveSubscription={!!(currentUser.sellerDetails?.subscriptionExpiresAt && currentUser.sellerDetails.subscriptionExpiresAt > Date.now())}
        subscriptionExpiresAt={currentUser.sellerDetails?.subscriptionExpiresAt ?? null}
        tierLabel={currentUser.sellerDetails?.tierLabel ?? null}
        isVendor={currentUser.role === 'seller'}
      />
    </div>
  );
};

export default Profile;
