import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { addCategory, deleteCategory, syncCategoriesToFirestore } from '../../services/firebase';
import type { CategoriesProps } from './types';

export const Categories: React.FC<CategoriesProps> = ({ categories, refreshData }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newCat, setNewCat] = useState({ name: '', icon: '', slug: '', subCategories: '' });
  const [syncing, setSyncing] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = newCat.slug || newCat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const subCats = newCat.subCategories.split(',').map(s => s.trim()).filter(Boolean);
    await addCategory({ name: newCat.name, icon: newCat.icon, slug, subCategories: subCats });
    setNewCat({ name: '', icon: '', slug: '', subCategories: '' });
    refreshData();
  };

  const handleSync = async () => {
    const confirmed = window.confirm(t('admin.syncCategoriesConfirm'));
    if (!confirmed) return;

    setSyncing(true);
    try {
      const count = await syncCategoriesToFirestore();
      await refreshData();
      toast(t('admin.syncCategoriesSuccess', { count }), 'success');
    } catch (err) {
      console.error('syncCategoriesToFirestore error:', err);
      toast(t('admin.syncCategoriesError'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-white">
          {t('admin.categoriesTitle', { count: categories.length })}
        </h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gold-400/40 text-gold-400 text-sm font-semibold hover:bg-gold-400/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? (
            <>
              <span className="w-4 h-4 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
              {t('admin.syncCategoriesSyncing')}
            </>
          ) : (
            <>
              <span>🔄</span>
              {t('admin.syncCategories')}
            </>
          )}
        </button>
      </div>

      {/* Formulaire ajout manuel */}
      <form onSubmit={handleAddCategory} className="bg-gray-900 border border-gray-800 p-4 rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('admin.categoryName')}</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} placeholder="Ex: Auto & Moto" required />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-500 mb-1 block">{t('admin.categoryIcon')}</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm text-center" value={newCat.icon} onChange={e => setNewCat({...newCat, icon: e.target.value})} placeholder="🚗" required />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('admin.categorySlug')}</label>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.slug} onChange={e => setNewCat({...newCat, slug: e.target.value})} placeholder={t('admin.categorySlugHint')} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{t('admin.subCategories')}</label>
          <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm" value={newCat.subCategories} onChange={e => setNewCat({...newCat, subCategories: e.target.value})} placeholder={t('admin.subCategoriesPlaceholder')} />
        </div>
        <Button type="submit">{t('common.add')}</Button>
      </form>

      {/* Liste des catégories */}
      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat.id} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-white text-sm font-medium">{cat.icon} {cat.name}</span>
              <button onClick={() => deleteCategory(cat.id).then(refreshData)} className="text-red-500 hover:text-red-300 text-xs font-bold">{t('common.delete')}</button>
            </div>
            {cat.subCategories && cat.subCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {cat.subCategories.map(sub => (
                  <span key={sub} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{sub}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
