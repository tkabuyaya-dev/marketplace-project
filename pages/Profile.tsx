import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/Button';
import { updateUserProfile } from '../services/firebase';

const Profile: React.FC = () => {
  const { currentUser, handleLogout, handleSellerAccess } = useAppContext();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

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
  const roleLabel = currentUser.role === 'admin' ? 'Administrateur' : currentUser.role === 'seller' ? 'Vendeur' : 'Acheteur';

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
              <label className="block text-xs font-bold text-gray-400 mb-1">Nom</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Bio</label>
              <textarea
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                placeholder="Quelques mots sur vous..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none min-h-[60px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">WhatsApp</label>
              <input
                value={editWhatsapp}
                onChange={e => setEditWhatsapp(e.target.value)}
                placeholder="+257..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleSave} isLoading={saving}>Enregistrer</Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl text-white font-bold">{currentUser.name}</h2>
            <p className="text-gray-400 text-sm mb-1">{currentUser.email}</p>
            {currentUser.bio && <p className="text-gray-500 text-xs mb-2 italic">"{currentUser.bio}"</p>}
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="inline-block px-3 py-1 bg-gray-700 rounded-full text-xs text-gray-300 uppercase tracking-wider">{roleLabel}</span>
              <span className="text-xs text-gray-500">Depuis {joinYear}</span>
            </div>
            <button onClick={startEdit} className="text-xs text-blue-400 hover:underline mb-4 block mx-auto">Modifier le profil</button>
          </>
        )}

        <div className="space-y-3">
          {currentUser.role === 'seller' && currentUser.slug && (
            <Button className="w-full" variant="secondary" onClick={() => navigate(`/shop/${currentUser.slug}`)}>
              Voir ma boutique publique
            </Button>
          )}
          {currentUser.role === 'buyer' && (
            <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 border-none text-white" onClick={() => navigate('/register-seller')}>
              Devenir Vendeur
            </Button>
          )}
          {(currentUser.role === 'seller' || currentUser.role === 'admin') && (
            <Button className="w-full" variant="secondary" onClick={handleSellerAccess}>
              {currentUser.role === 'admin' ? 'Admin Console' : 'Espace Vendeur'}
            </Button>
          )}
          <Button className="w-full" variant="secondary" onClick={() => navigate('/messenger')}>
            Mes Messages
          </Button>
          <Button className="w-full border-red-900/50 text-red-400 hover:bg-red-900/20" variant="outline" onClick={handleLogout}>Se déconnecter</Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
