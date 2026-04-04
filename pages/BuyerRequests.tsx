/**
 * NUNULIA — Demandes Clients (Seller View)
 *
 * All sellers can browse ALL buyer requests.
 * Filters: country, province, city, category.
 * WhatsApp contact gated by subscription plan.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import {
  getBuyerRequests,
  trackWhatsAppContact,
  canContactBuyer,
  BuyerRequestFilters,
  PAGE_SIZE,
} from '../services/firebase/buyer-requests';
import { BuyerRequest } from '../types';
import { INITIAL_COUNTRIES, PROVINCES_BY_COUNTRY, INITIAL_CATEGORIES } from '../constants';
import { COMMUNES_BY_PROVINCE } from '../data/locations';

// ─── Request Card ─────────────────────────────────────────────────────────────

const RequestCard: React.FC<{
  request: BuyerRequest;
  canContact: boolean;
  sellerTierId: string;
  onContact: (r: BuyerRequest) => void;
  onUpgrade: () => void;
}> = ({ request, canContact, sellerTierId, onContact, onUpgrade }) => {
  const { t } = useTranslation();
  const timeAgo = formatTimeAgo(request.createdAt);
  const country = INITIAL_COUNTRIES.find(c => c.id === request.countryId);
  const normalizedPhone = request.whatsapp.replace(/[^\d+]/g, '').replace(/^\+?/, '+');
  const maskedPhone = normalizedPhone.replace(/(\+\d{3})\d+(\d{2})$/, '$1 ██ ██ ██ $2');
  const daysLeft = Math.ceil((request.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 hover:border-gray-600 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs bg-gold-400/10 text-gold-400 border border-gold-400/20 px-2 py-0.5 rounded-full font-bold">
              🔍 {t('requests.card.seeking')}
            </span>
            {request.category && (
              <span className="text-xs bg-gray-700/60 text-gray-400 px-2 py-0.5 rounded-full">
                {request.category}
              </span>
            )}
          </div>
          <h3 className="font-bold text-white text-base leading-tight">{request.title}</h3>
          {request.description && (
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{request.description}</p>
          )}
        </div>
        {request.imageUrl && (
          <img
            src={request.imageUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-700"
          />
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
        <span>📍 {country?.flag} {request.city}, {request.province}</span>
        {request.budget && (
          <span>💰 {request.budget.toLocaleString()} {request.budgetCurrency}</span>
        )}
        <span>⏱ {timeAgo}</span>
        {daysLeft <= 2 && (
          <span className="text-orange-400 font-bold">⚠ {t('requests.card.expiresIn', { days: daysLeft })}</span>
        )}
      </div>

      {/* Contact button */}
      {canContact ? (
        <button
          onClick={() => onContact(request)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
        >
          <span>📱</span>
          {t('requests.card.contactWhatsApp')}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="w-full py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-center text-gray-500 font-mono tracking-widest select-none">
            {maskedPhone}
          </div>
          <button
            onClick={onUpgrade}
            className="w-full flex items-center justify-center gap-2 py-2 border border-gold-400/30 text-gold-400 text-xs font-bold rounded-xl hover:bg-gold-400/10 transition-colors"
          >
            🔒 {t('requests.card.upgradeToPro')}
          </button>
        </div>
      )}
    </div>
  );
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export const BuyerRequestsPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Redirect non-sellers
  if (!currentUser || (currentUser.role !== 'seller' && currentUser.role !== 'admin')) {
    navigate('/login');
    return null;
  }

  const sellerTierId = currentUser.sellerDetails?.tierLabel || 'free';
  const eligible = canContactBuyer(currentUser.sellerDetails);

  // Filters
  const [filterCountry, setFilterCountry] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Data
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<any>(null);

  const provinces = filterCountry ? (PROVINCES_BY_COUNTRY[filterCountry] || []) : [];
  const communes: string[] = (filterCountry && filterProvince && COMMUNES_BY_PROVINCE[filterCountry]?.[filterProvince]) ? COMMUNES_BY_PROVINCE[filterCountry][filterProvince] : [];

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const filters: BuyerRequestFilters = { status: 'active' };
      if (filterCountry)  filters.countryId = filterCountry;
      if (filterProvince) filters.province = filterProvince;
      if (filterCity)     filters.city = filterCity;
      if (filterCategory) filters.category = filterCategory;

      const lastDoc = reset ? undefined : (lastDocRef.current ?? undefined);
      const { requests: newReqs, lastDoc: newLast } = await getBuyerRequests(filters, lastDoc);

      setRequests(prev => reset ? newReqs : [...prev, ...newReqs]);
      lastDocRef.current = newLast;
      setHasMore(newReqs.length === PAGE_SIZE);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [filterCountry, filterProvince, filterCity, filterCategory]);

  // Reset on filter change
  useEffect(() => {
    lastDocRef.current = null;
    load(true);
  }, [filterCountry, filterProvince, filterCity, filterCategory]);

  const handleContact = async (request: BuyerRequest) => {
    await trackWhatsAppContact(request.id, currentUser.id, sellerTierId);
    const message = encodeURIComponent(
      t('requests.whatsappMessage', { title: request.title, city: request.city })
    );
    const phone = request.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleUpgrade = () => navigate('/plans');

  return (
    <div className="min-h-screen bg-gray-950 pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-black text-white">{t('requests.pageTitle')}</h1>
            {!eligible && (
              <button
                onClick={handleUpgrade}
                className="text-xs px-3 py-1.5 bg-gold-400/10 border border-gold-400/30 text-gold-400 rounded-xl font-bold hover:bg-gold-400/20 transition-colors"
              >
                🔓 {t('requests.unlockContact')}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">{t('requests.pageSubtitle')}</p>

          {/* Plan info banner for non-eligible */}
          {!eligible && (
            <div className="mt-3 bg-gray-800/50 border border-gold-400/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="text-sm font-bold text-white">{t('requests.planGate.title')}</p>
                <p className="text-xs text-gray-400">{t('requests.planGate.subtitle')}</p>
              </div>
              <button
                onClick={handleUpgrade}
                className="ml-auto shrink-0 px-3 py-1.5 bg-gold-400 text-gray-900 font-black rounded-lg text-xs hover:bg-gold-300 transition-colors"
              >
                {t('requests.planGate.cta')}
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <select
            value={filterCountry}
            onChange={e => { setFilterCountry(e.target.value); setFilterProvince(''); setFilterCity(''); }}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300 outline-none cursor-pointer col-span-2 md:col-span-1"
          >
            <option value="">{t('requests.filters.allCountries')}</option>
            {INITIAL_COUNTRIES.filter(c => c.isActive).map(c => (
              <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
            ))}
          </select>

          <select
            value={filterProvince}
            onChange={e => { setFilterProvince(e.target.value); setFilterCity(''); }}
            disabled={!filterCountry}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300 outline-none cursor-pointer disabled:opacity-40"
          >
            <option value="">{t('requests.filters.allProvinces')}</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            disabled={!filterProvince}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300 outline-none cursor-pointer disabled:opacity-40"
          >
            <option value="">{t('requests.filters.allCities')}</option>
            {communes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300 outline-none cursor-pointer"
          >
            <option value="">{t('requests.filters.allCategories')}</option>
            {INITIAL_CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {/* Results */}
        {loading && requests.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 animate-pulse h-44" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg font-bold text-white mb-2">{t('requests.empty.title')}</p>
            <p className="text-sm text-gray-500">{t('requests.empty.subtitle')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map(r => (
              <RequestCard
                key={r.id}
                request={r}
                canContact={eligible}
                sellerTierId={sellerTierId}
                onContact={handleContact}
                onUpgrade={handleUpgrade}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && requests.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={() => load(false)}
              disabled={loading}
              className="px-6 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
              ) : t('requests.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyerRequestsPage;
