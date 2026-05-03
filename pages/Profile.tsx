import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User as UserIcon, Globe, Bell, Shield, HelpCircle, LogOut,
  ChevronRight, Check, Camera, CreditCard, Store, Zap, FileText,
  Trash2, Sun, Moon, Languages,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { updateUserProfile } from '../services/firebase';
import { useNotificationConsent } from '../hooks/useNotificationConsent';
import { useToast } from '../components/Toast';
import { getOptimizedUrl } from '../services/cloudinary';
import { INITIAL_COUNTRIES, SUPPORT_WHATSAPP } from '../constants';
import type { VerificationTier, User } from '../types';

// ─────────────────────────────────────────────────────────────
// PLAN BADGE — maps the 5 real tiers to a visual style
// ─────────────────────────────────────────────────────────────
type DisplayTier = 'free' | 'starter' | 'pro' | 'elite' | 'unlimited';

function tierFromLabel(label?: string): DisplayTier {
  const l = (label || '').toLowerCase();
  if (l.includes('illimité') || l.includes('unlimited')) return 'unlimited';
  if (l.includes('élite') || l.includes('elite')) return 'elite';
  if (l.includes('pro')) return 'pro';
  if (l.includes('starter')) return 'starter';
  return 'free';
}

const PlanBadge: React.FC<{ tier: DisplayTier }> = ({ tier }) => {
  const { t } = useTranslation();
  const cfg: Record<DisplayTier, { label: string; cls: string; dot: string }> = {
    free:      { label: t('profile.tierFree'),      cls: 'bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-700/40 dark:border-gray-600/50 dark:text-gray-400', dot: 'bg-gray-400 dark:bg-gray-500' },
    starter:   { label: t('profile.tierStarter'),   cls: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-400/25 dark:text-blue-400', dot: 'bg-blue-500' },
    pro:       { label: t('profile.tierPro'),       cls: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-400/10 dark:border-amber-400/35 dark:text-amber-400', dot: 'bg-amber-500' },
    elite:     { label: t('profile.tierElite'),     cls: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300', dot: 'bg-amber-600' },
    unlimited: { label: t('profile.tierUnlimited'), cls: 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-400/30 dark:text-indigo-400', dot: 'bg-indigo-500' },
  };
  const c = cfg[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// VERIFIED BADGE — maps VerificationTier from types.ts
// ─────────────────────────────────────────────────────────────
const VerifiedPill: React.FC<{ user: Pick<User, 'isVerified' | 'verificationTier'> }> = ({ user }) => {
  const { t } = useTranslation();
  if (!user.isVerified) return null;
  const tier: VerificationTier = user.verificationTier || 'identity';
  const cfg: Record<VerificationTier, { label: string; cls: string }> = {
    none:     { label: '',                           cls: '' },
    phone:    { label: t('profile.verifiedPhone'),   cls: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-400/25' },
    identity: { label: t('profile.verifiedId'),      cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-400/25' },
    shop:     { label: t('profile.verifiedShop'),    cls: 'text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/25' },
  };
  if (tier === 'none') return null;
  const c = cfg[tier];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.cls}`}>
      <Check size={9} strokeWidth={2.5} />
      {c.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// MENU ITEM — clickable list row with leading icon, label, sub, optional right slot
// ─────────────────────────────────────────────────────────────
interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
  rightContent?: React.ReactNode;
  onClick?: () => void;
  href?: string;
}
const MenuItem: React.FC<MenuItemProps> = ({ icon, label, sub, danger = false, rightContent, onClick, href }) => {
  const content = (
    <>
      <span className={`w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center ${
        danger
          ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400'
      }`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[14px] font-medium leading-snug truncate ${
          danger ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
        }`}>
          {label}
        </span>
        {sub && (
          <span className="block text-[11px] mt-0.5 truncate text-gray-500 dark:text-gray-500">
            {sub}
          </span>
        )}
      </span>
      {rightContent
        ? <span className="shrink-0">{rightContent}</span>
        : !danger && <ChevronRight size={15} className="text-gray-300 dark:text-gray-700 shrink-0" />}
    </>
  );

  const baseCls = 'flex items-center gap-3.5 w-full px-4 py-[11px] text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 active:scale-[0.99] hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-700/40 dark:active:bg-gray-700/60';

  if (href) {
    return <Link to={href} className={baseCls}>{content}</Link>;
  }
  return <button onClick={onClick} className={baseCls}>{content}</button>;
};

// ─────────────────────────────────────────────────────────────
// MENU SECTION — grouped card with optional uppercase title + dividers
// ─────────────────────────────────────────────────────────────
const MenuSection: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-[.07em] px-1 pb-1.5 text-gray-500 dark:text-gray-600">
          {title}
        </p>
      )}
      <div className="rounded-2xl overflow-hidden border bg-white border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-700/50 dark:shadow-none">
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="h-px ml-16 bg-gray-100 dark:bg-gray-700/35" />}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// AVATAR — photo or initials fallback, with edit overlay
// ─────────────────────────────────────────────────────────────
const Avatar: React.FC<{ user: User; size?: number; onEdit?: () => void }> = ({ user, size = 72, onEdit }) => {
  const [hover, setHover] = useState(false);
  const initials = (user.name?.charAt(0) || '?').toUpperCase();
  return (
    <button
      type="button"
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Modifier la photo de profil"
      className="relative inline-flex cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-full"
      style={{ width: size, height: size }}
    >
      {user.avatar ? (
        <img
          src={getOptimizedUrl(user.avatar, size * 2)}
          alt={user.name}
          className="w-full h-full rounded-full object-cover border-[2.5px] border-amber-300/50 shadow-[0_0_0_3px_rgba(245,200,66,0.12),0_4px_16px_rgba(0,0,0,0.10)]"
        />
      ) : (
        <span
          className="w-full h-full rounded-full flex items-center justify-center font-extrabold select-none border-[2.5px] border-amber-300/50 shadow-[0_0_0_3px_rgba(245,200,66,0.12),0_4px_16px_rgba(0,0,0,0.10)] bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800"
          style={{ fontSize: size * 0.30, letterSpacing: '-0.02em' }}
        >
          {initials}
        </span>
      )}
      <span
        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 transition-opacity duration-200"
        style={{ opacity: hover ? 1 : 0 }}
      >
        <Camera size={18} color="#fff" />
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// UPGRADE BANNER — visible only for sellers on free / starter tier
// ─────────────────────────────────────────────────────────────
const UpgradeBanner: React.FC<{ currentTier: DisplayTier; onUpgrade: () => void }> = ({ currentTier, onUpgrade }) => {
  const { t } = useTranslation();
  if (currentTier === 'pro' || currentTier === 'elite' || currentTier === 'unlimited') return null;
  const next = currentTier === 'free' ? t('profile.tierStarter') : t('profile.tierPro');
  return (
    <div className="rounded-2xl p-3 flex items-center gap-3 border bg-amber-50 border-amber-200 dark:bg-amber-400/[.07] dark:border-amber-400/20">
      <span className="w-[34px] h-[34px] rounded-[9px] shrink-0 bg-amber-400/20 flex items-center justify-center">
        <Zap size={16} className="text-amber-700 dark:text-amber-400" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-gray-900 dark:text-gray-100">
          {t('profile.upgradeTo', { tier: next })}
        </span>
        <span className="block text-[11px] mt-0.5 text-gray-600 dark:text-gray-500">
          {t('profile.upgradeBenefits')}
        </span>
      </span>
      <button
        onClick={onUpgrade}
        className="shrink-0 px-3 py-1.5 rounded-[9px] text-[12px] font-extrabold text-gray-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-all duration-150 shadow-[0_2px_8px_rgba(245,200,66,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
      >
        {t('profile.upgradeViewBtn')}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BECOME SELLER BANNER — visible only for buyers (conversion CTA)
// ─────────────────────────────────────────────────────────────
const BecomeSellerBanner: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl p-3 flex items-center gap-3 border bg-gradient-to-br from-amber-50 to-white border-amber-300 dark:from-amber-400/[.08] dark:to-transparent dark:border-amber-400/25">
      <span className="w-[34px] h-[34px] rounded-[9px] shrink-0 bg-amber-400/20 flex items-center justify-center">
        <Store size={16} className="text-amber-700 dark:text-amber-400" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-gray-900 dark:text-gray-100">
          {t('profile.becomeSeller')}
        </span>
        <span className="block text-[11px] mt-0.5 text-gray-600 dark:text-gray-500">
          {t('profile.becomeSellerHint')}
        </span>
      </span>
      <button
        onClick={onStart}
        className="shrink-0 px-3 py-1.5 rounded-[9px] text-[12px] font-extrabold text-gray-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-all duration-150 shadow-[0_2px_8px_rgba(245,200,66,0.35)]"
      >
        {t('profile.becomeSellerCta')}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LOGOUT CONFIRMATION SHEET (mobile bottom sheet pattern)
// ─────────────────────────────────────────────────────────────
const LogoutSheet: React.FC<{ open: boolean; onConfirm: () => void; onCancel: () => void }> = ({ open, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-700/60 animate-slide-up"
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5 bg-gray-200 dark:bg-gray-700" />
        <p className="text-[17px] font-bold mb-1.5 text-gray-900 dark:text-gray-100">
          {t('profile.logoutTitle')}
        </p>
        <p className="text-[13px] mb-6 leading-relaxed text-gray-600 dark:text-gray-400">
          {t('profile.logoutSubtitle')}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 rounded-xl bg-red-500 hover:bg-red-400 active:bg-red-600 text-white text-[15px] font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            {t('profile.logoutConfirmBtn')}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 rounded-xl text-[15px] font-medium transition-colors duration-150 border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {t('profile.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SELECTOR SHEET — reusable bottom sheet for single-choice options
// ─────────────────────────────────────────────────────────────
interface SelectorOption {
  value: string;
  label: string;
  flag?: string;
}

const SelectorSheet: React.FC<{
  open: boolean;
  title: string;
  options: SelectorOption[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}> = ({ open, title, options, value, onSelect, onClose }) => {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-700/60 animate-slide-up max-h-[80vh] overflow-y-auto"
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5 bg-gray-200 dark:bg-gray-700" />
        <p className="text-[17px] font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</p>
        <div className="flex flex-col gap-1">
          {options.map(opt => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); onClose(); }}
                className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors duration-150 ${
                  active
                    ? 'bg-amber-50 border border-amber-300 dark:bg-amber-400/10 dark:border-amber-400/30'
                    : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                {opt.flag && <span className="text-[18px] shrink-0" aria-hidden>{opt.flag}</span>}
                <span className="flex-1 text-[14px] font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                {active && <Check size={16} className="text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 py-3 rounded-xl text-[14px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {t('profile.cancel')}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT INFO SHEET — bottom sheet replacing the old inline edit
// ─────────────────────────────────────────────────────────────
const EditInfoSheet: React.FC<{ open: boolean; user: User; onClose: () => void }> = ({ open, user, onClose }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState(user.name || '');
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [bio, setBio] = useState(user.bio || '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateUserProfile(user.id, {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        bio: bio.trim(),
      });
      toast(t('profile.profileSaved'), 'success');
      onClose();
    } catch (err) {
      console.error('Erreur sauvegarde profil:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-700/60 animate-slide-up"
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5 bg-gray-200 dark:bg-gray-700" />
        <p className="text-[17px] font-bold mb-4 text-gray-900 dark:text-gray-100">
          {t('profile.editPersonalInfoTitle')}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{t('profile.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-amber-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{t('profile.bio')}</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder={t('profile.bioPlaceholder')}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-amber-400 outline-none min-h-[60px]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{t('profile.whatsapp')}</label>
            <input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="+257..."
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-amber-400 outline-none"
            />
          </div>
          <div className="flex gap-2 pt-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-[15px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {t('profile.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-[15px] font-bold bg-amber-400 text-gray-900 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-60"
            >
              {saving ? '...' : t('profile.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const Profile: React.FC = () => {
  const { currentUser, handleLogout, handleSellerAccess, activeCountry, setActiveCountry } = useAppContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { permission, requestPermission } = useNotificationConsent();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Capture "now" once at mount via the lazy initializer — keeps render pure
  // (Date.now() in useMemo body would still be flagged as impure by the React
  // purity rule). Slight staleness on long-lived sessions is acceptable here.
  const [mountedAt] = useState(() => Date.now());

  if (!currentUser) return <Navigate to="/login" replace />;

  const tier = tierFromLabel(currentUser.sellerDetails?.tierLabel);
  const isSeller = currentUser.role === 'seller';
  const isAdmin = currentUser.role === 'admin';
  const isBuyer = currentUser.role === 'buyer';

  const country = INITIAL_COUNTRIES.find(c => c.id === activeCountry);
  const currentLang = (i18n.language || 'fr').slice(0, 2).toLowerCase();
  const langLabel = currentLang === 'en' ? 'English' : 'Français';
  const countryLabel = country ? `${country.flag} ${country.name}` : t('profile.allCountries');

  const joinYear = currentUser.joinDate
    ? new Date(currentUser.joinDate).getFullYear()
    : null;
  const expiresAt = currentUser.sellerDetails?.subscriptionExpiresAt;
  const hasActiveSubscription = !!(expiresAt && expiresAt > mountedAt);

  const supportPhone = SUPPORT_WHATSAPP[activeCountry] || SUPPORT_WHATSAPP['bi'];
  const supportHref = `https://wa.me/${supportPhone.replace(/\D/g, '')}`;

  // TODO(stats): re-enable a "stats row" (annonces / vues / favoris / contacts)
  // once we have a real analytics aggregator. Currently only `productCount` is
  // available on the User document, the other 3 KPIs would be fake values.

  const handleNotifications = async () => {
    if (permission === 'granted') return;
    if (permission === 'denied') {
      toast(t('profile.notifsBlocked'), 'info');
      return;
    }
    const result = await requestPermission();
    if (result === 'granted') toast(t('profile.notifsEnabled'), 'success');
    else toast(t('profile.notifsBlocked'), 'error');
  };

  const notifSub =
    permission === 'granted' ? t('profile.notifsActive')
    : permission === 'denied' ? t('profile.notifsBlockedHint')
    : t('profile.enableNotifs');

  const planSub =
    tier === 'free' ? t('profile.upgradeFromFree')
    : t('profile.activePlan', { tier: t(`profile.tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as any) });

  return (
    <div className="pt-safe-header md:pt-24 px-4 pb-24 max-w-2xl mx-auto bg-[#F7F8FA] dark:bg-gray-950 min-h-screen">
      {/* ── HERO IDENTITY ── */}
      <div className="flex flex-col items-center gap-2.5 pt-5 pb-5">
        <Avatar user={currentUser} onEdit={() => setEditOpen(true)} />

        <div className="text-center">
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em] leading-tight mb-1.5 text-gray-900 dark:text-gray-100">
            {currentUser.name || '—'}
          </h1>
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <PlanBadge tier={tier} />
            <VerifiedPill user={currentUser} />
          </div>
        </div>

        <div className="flex items-center gap-2 text-center">
          <span className="text-[12px] text-gray-600 dark:text-gray-500">{currentUser.email}</span>
          {joinYear && (
            <>
              <span className="text-[10px] text-gray-300 dark:text-gray-700">·</span>
              <span className="text-[12px] text-gray-600 dark:text-gray-500">
                {t('profile.since', { year: joinYear })}
              </span>
            </>
          )}
        </div>

        {currentUser.bio && (
          <p className="text-[12px] italic text-gray-500 dark:text-gray-500 max-w-xs text-center mt-1">
            "{currentUser.bio}"
          </p>
        )}
      </div>

      {/* ── CONTEXTUAL BANNERS ── */}
      <div className="mb-3 space-y-2">
        {isBuyer && <BecomeSellerBanner onStart={() => navigate('/devenir-vendeur')} />}
        {(isSeller || isAdmin) && <UpgradeBanner currentTier={tier} onUpgrade={() => navigate('/plans')} />}
      </div>

      {/* ── ACCOUNT ── */}
      <MenuSection title={t('profile.title')}>
        <MenuItem
          icon={<UserIcon size={17} />}
          label={t('profile.personalInfo')}
          sub={`${currentUser.name}${currentUser.whatsapp ? ` · ${currentUser.whatsapp}` : ''}`}
          onClick={() => setEditOpen(true)}
        />
        <MenuItem
          icon={<Globe size={17} />}
          label={t('profile.country')}
          sub={countryLabel}
          onClick={() => setCountrySheetOpen(true)}
        />
        <MenuItem
          icon={<Languages size={17} />}
          label={t('profile.language')}
          sub={langLabel}
          onClick={() => setLangSheetOpen(true)}
        />
        {(isSeller || isAdmin) && (
          <MenuItem
            icon={<CreditCard size={17} />}
            label={t('profile.mySubscription')}
            sub={planSub}
            rightContent={tier !== 'free'
              ? <PlanBadge tier={tier} />
              : <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{t('profile.upgradeArrow')}</span>}
            onClick={() => navigate('/plans')}
          />
        )}
        {(isSeller || isAdmin) && (
          <MenuItem
            icon={<Store size={17} />}
            label={t('profile.myShop')}
            sub={t('profile.shopWithCount', {
              shopName: currentUser.sellerDetails?.shopName || currentUser.name,
              count: currentUser.productCount ?? 0,
            })}
            onClick={() => handleSellerAccess()}
          />
        )}
      </MenuSection>

      {/* ── PREFERENCES ── */}
      <MenuSection title={t('profile.preferences')}>
        <MenuItem
          icon={<Bell size={17} />}
          label={t('profile.notifications')}
          sub={notifSub}
          onClick={handleNotifications}
        />
        <MenuItem
          icon={theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          label={t('profile.appearance')}
          sub={theme === 'dark' ? t('profile.appearanceDark') : t('profile.appearanceLight')}
          onClick={toggleTheme}
        />
      </MenuSection>

      {/* ── HELP & LEGAL ── */}
      <MenuSection title={t('profile.about')}>
        <MenuItem
          icon={<HelpCircle size={17} />}
          label={t('profile.support')}
          sub={t('profile.supportHint')}
          onClick={() => window.open(supportHref, '_blank', 'noopener,noreferrer')}
        />
        <MenuItem
          icon={<FileText size={17} />}
          label={t('profile.terms')}
          href="/cgu"
        />
        <MenuItem
          icon={<Shield size={17} />}
          label={t('profile.privacy')}
          href="/politique-confidentialite"
        />
      </MenuSection>

      {/* ── LOGOUT ── */}
      <MenuSection>
        <MenuItem
          icon={<LogOut size={17} />}
          label={t('profile.logout')}
          danger
          onClick={() => setLogoutOpen(true)}
        />
      </MenuSection>

      {/* ── DANGER ZONE — delete account ── */}
      <MenuSection title={t('profile.dangerZone')}>
        <MenuItem
          icon={<Trash2 size={17} />}
          label={t('profile.deleteAccountTitle')}
          sub={t('profile.dangerZoneHint')}
          danger
          onClick={() => setShowDeleteModal(true)}
        />
      </MenuSection>

      <p className="text-center text-[10px] tracking-[.04em] pt-2 text-gray-400 dark:text-gray-700">
        {t('profile.versionFooter')}
      </p>

      {/* ── SHEETS / MODALS ── */}
      <EditInfoSheet open={editOpen} user={currentUser} onClose={() => setEditOpen(false)} />
      <SelectorSheet
        open={countrySheetOpen}
        title={t('profile.country')}
        options={[
          { value: '', label: t('profile.allCountries'), flag: '🌍' },
          ...INITIAL_COUNTRIES
            .filter(c => c.isActive)
            .map(c => ({ value: c.id, label: c.name, flag: c.flag })),
        ]}
        value={activeCountry}
        onSelect={setActiveCountry}
        onClose={() => setCountrySheetOpen(false)}
      />
      <SelectorSheet
        open={langSheetOpen}
        title={t('profile.language')}
        options={[
          { value: 'fr', label: 'Français', flag: '🇫🇷' },
          { value: 'en', label: 'English', flag: '🇬🇧' },
        ]}
        value={currentLang}
        onSelect={(v) => i18n.changeLanguage(v)}
        onClose={() => setLangSheetOpen(false)}
      />
      <LogoutSheet
        open={logoutOpen}
        onConfirm={() => { setLogoutOpen(false); handleLogout(); }}
        onCancel={() => setLogoutOpen(false)}
      />
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onLogout={handleLogout}
        hasActiveSubscription={hasActiveSubscription}
        subscriptionExpiresAt={currentUser.sellerDetails?.subscriptionExpiresAt ?? null}
        tierLabel={currentUser.sellerDetails?.tierLabel ?? null}
        isVendor={isSeller}
      />
    </div>
  );
};

export default Profile;
