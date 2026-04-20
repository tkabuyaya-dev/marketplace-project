import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { addBanner, updateBanner, deleteBanner, BannerData, BannerActionType } from '../../services/firebase';
import { uploadImage, getOptimizedUrl } from '../../services/cloudinary';
import type { BannersProps } from './types';

export const Banners: React.FC<BannersProps> = ({
  banners, categories, setBanners, refreshData, loading,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [bannerForm, setBannerForm] = useState<Partial<BannerData>>({
    title: '', subtitle: '', ctaText: '', ctaActionType: 'none', ctaAction: '', isActive: true, order: 0, imageUrl: ''
  });
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetBannerForm = () => {
    setBannerForm({ title: '', subtitle: '', ctaText: '', ctaActionType: 'none', ctaAction: '', isActive: true, order: 0, imageUrl: '' });
    setBannerFile(null);
    setBannerPreview('');
    setEditingBannerId(null);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let imageUrl = bannerForm.imageUrl || '';
      if (bannerFile) {
        imageUrl = await uploadImage(bannerFile);
      }
      if (!imageUrl) {
        toast(t('admin.bannerAddImage'), 'error');
        setSaving(false);
        return;
      }
      const data: Omit<BannerData, 'id'> = {
        imageUrl,
        title: bannerForm.title || '',
        subtitle: bannerForm.subtitle || '',
        ctaText: bannerForm.ctaText || '',
        ctaActionType: bannerForm.ctaActionType || 'none',
        ctaAction: (bannerForm.ctaActionType && bannerForm.ctaActionType !== 'none') ? (bannerForm.ctaAction || '') : '',
        isActive: bannerForm.isActive ?? true,
        order: bannerForm.order ?? 0,
      };
      if (editingBannerId) {
        await updateBanner(editingBannerId, data);
      } else {
        await addBanner(data);
      }
      resetBannerForm();
      refreshData();
    } catch (err: any) {
      toast('Erreur: ' + (err?.message || 'Réessayez'), 'error');
    }
    setSaving(false);
  };

  const handleDeleteBanner = async (id: string) => {
    if (window.confirm(t('admin.confirmDeleteBanner'))) {
      await deleteBanner(id);
      setBanners(prev => prev.filter(b => b.id !== id));
    }
  };

  const handleToggleBanner = async (banner: BannerData) => {
    if (!banner.id) return;
    await updateBanner(banner.id, { isActive: !banner.isActive });
    setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, isActive: !b.isActive } : b));
  };

  const startEditBanner = (banner: BannerData) => {
    setEditingBannerId(banner.id || null);
    setBannerForm(banner);
    setBannerPreview(banner.imageUrl);
    setBannerFile(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">{t('admin.bannerManagement')}</h2>

      {/* Banner Form */}
      <form onSubmit={handleSaveBanner} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-white text-sm">
          {editingBannerId ? t('admin.editBanner') : t('admin.addBanner')}
        </h3>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2">{t('admin.bannerImage')}</label>
          {bannerPreview && (
            <div className="relative rounded-xl overflow-hidden h-40 mb-3 bg-gray-800">
              <img src={bannerPreview} alt="Preview" className="w-full h-full object-cover" />
              <button type="button" onClick={() => { setBannerPreview(''); setBannerFile(null); setBannerForm(f => ({...f, imageUrl: ''})); }}
                className="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
                ✕
              </button>
            </div>
          )}
          <input ref={bannerFileRef} type="file" accept="image/*" onChange={handleBannerFileChange} className="hidden" />
          {!bannerPreview && (
            <button type="button" onClick={() => bannerFileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-blue-500/50 transition-colors text-gray-400 text-sm">
              📸 {t('admin.bannerImageHint')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.bannerTitle')}</label>
            <input value={bannerForm.title || ''} onChange={e => setBannerForm(f => ({...f, title: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder={t('admin.bannerTitlePlaceholder')} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.bannerSubtitle')}</label>
            <input value={bannerForm.subtitle || ''} onChange={e => setBannerForm(f => ({...f, subtitle: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder={t('admin.bannerSubtitlePlaceholder')} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.bannerCtaText')}</label>
            <input value={bannerForm.ctaText || ''} onChange={e => setBannerForm(f => ({...f, ctaText: e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
              placeholder={t('admin.bannerCtaPlaceholder')} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.bannerAction')}</label>
            <select value={bannerForm.ctaActionType || 'none'} onChange={e => setBannerForm(f => ({...f, ctaActionType: e.target.value as BannerActionType, ctaAction: ''}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500">
              <option value="none">{t('admin.bannerActionNone')}</option>
              <option value="external">{t('admin.bannerActionExternal')}</option>
              <option value="category">{t('admin.bannerActionCategory')}</option>
              <option value="product">{t('admin.bannerActionProduct')}</option>
              <option value="page">{t('admin.bannerActionPage')}</option>
            </select>
          </div>
          {bannerForm.ctaActionType && bannerForm.ctaActionType !== 'none' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-400 mb-1">
                {bannerForm.ctaActionType === 'external' && t('admin.bannerExternalUrl')}
                {bannerForm.ctaActionType === 'category' && t('admin.bannerCategoryId')}
                {bannerForm.ctaActionType === 'product' && t('admin.bannerProductSlug')}
                {bannerForm.ctaActionType === 'page' && t('admin.bannerPagePath')}
              </label>
              {bannerForm.ctaActionType === 'category' ? (
                <select value={bannerForm.ctaAction || ''} onChange={e => setBannerForm(f => ({...f, ctaAction: e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500">
                  <option value="">{t('admin.bannerChooseCategory')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              ) : (
                <input value={bannerForm.ctaAction || ''} onChange={e => setBannerForm(f => ({...f, ctaAction: e.target.value}))}
                  placeholder={
                    bannerForm.ctaActionType === 'external' ? 'https://example.com' :
                    bannerForm.ctaActionType === 'product' ? 'ex: samsung-galaxy-s24-a1b2' :
                    'ex: /register-seller'
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" />
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.bannerDisplayOrder')}</label>
            <input type="number" min={0} value={bannerForm.order ?? 0} onChange={e => setBannerForm(f => ({...f, order: Number(e.target.value)}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={bannerForm.isActive ?? true} onChange={e => setBannerForm(f => ({...f, isActive: e.target.checked}))}
                className="accent-blue-500 w-4 h-4" />
              <span className="text-sm text-gray-300">{t('admin.bannerActive')}</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" isLoading={saving}>
            {editingBannerId ? t('admin.bannerUpdate') : t('admin.bannerAdd')}
          </Button>
          {editingBannerId && (
            <Button type="button" variant="ghost" onClick={resetBannerForm}>{t('common.cancel')}</Button>
          )}
        </div>
      </form>

      {/* Existing Banners List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('admin.existingBanners', { count: banners.length })}</h3>
        {banners.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
            {t('admin.noBanners')}
          </div>
        ) : (
          banners.map(banner => (
            <div key={banner.id} className={`bg-gray-900 border rounded-xl overflow-hidden flex flex-col sm:flex-row ${banner.isActive ? 'border-green-600/30' : 'border-gray-800 opacity-60'}`}>
              <div className="w-full sm:w-48 h-28 flex-shrink-0 bg-gray-800 relative">
                <img src={getOptimizedUrl(banner.imageUrl, 300)} alt={banner.title} loading="lazy" className="w-full h-full object-cover" />
                {!banner.isActive && (
                  <div className="absolute inset-0 bg-gray-950/60 flex items-center justify-center">
                    <span className="text-xs font-bold text-red-400 bg-gray-900 px-2 py-1 rounded">{t('admin.bannerDisabled')}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 p-4 flex flex-col sm:flex-row justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-white font-bold text-sm truncate">{banner.title || t('admin.bannerNoTitle')}</h4>
                  <p className="text-gray-500 text-xs truncate">{banner.subtitle}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>{t('admin.bannerOrder', { order: banner.order })}</span>
                    {banner.ctaActionType && banner.ctaActionType !== 'none' && (
                      <span className="text-blue-400">
                        {banner.ctaActionType === 'external' && `Lien: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'category' && `Catégorie: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'product' && `Produit: ${banner.ctaAction}`}
                        {banner.ctaActionType === 'page' && `Page: ${banner.ctaAction}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggleBanner(banner)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${banner.isActive ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600 hover:text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {banner.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
                  </button>
                  <button onClick={() => startEditBanner(banner)}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => banner.id && handleDeleteBanner(banner.id)}
                    className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors">
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
