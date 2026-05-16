import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User as UserIcon, Globe, Bell, Shield, HelpCircle, LogOut,
  ChevronRight, ChevronLeft, Check, Camera, CreditCard, Store, Zap, FileText,
  Trash2, Sun, Moon, Languages, Home as HomeIcon, Search, Heart, Plus,
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
// PLAN BADGE
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
  const cfg: Record<DisplayTier, { label: string; bg: string; text: string; dot: string }> = {
    free:      { label: t('profile.tierFree'),      bg: '#F4F5F7', text: '#5C6370', dot: '#9EA5B0' },
    starter:   { label: t('profile.tierStarter'),   bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
    pro:       { label: t('profile.tierPro'),       bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
    elite:     { label: t('profile.tierElite'),     bg: '#FEF3C7', text: '#78350F', dot: '#D97706' },
    unlimited: { label: t('profile.tierUnlimited'), bg: '#EEF2FF', text: '#3730A3', dot: '#6366F1' },
  };
  const c = cfg[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.dot}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// VERIFIED BADGE
// ─────────────────────────────────────────────────────────────
const VerifiedPill: React.FC<{ user: Pick<User, 'isVerified' | 'verificationTier'> }> = ({ user }) => {
  const { t } = useTranslation();
  if (!user.isVerified) return null;
  const tier: VerificationTier = user.verificationTier || 'identity';
  const cfg: Record<VerificationTier, { label: string; bg: string; text: string }> = {
    none:     { label: '',                         bg: '', text: '' },
    phone:    { label: t('profile.verifiedPhone'), bg: '#EFF6FF', text: '#1D4ED8' },
    identity: { label: t('profile.verifiedId'),    bg: '#ECFDF5', text: '#065F46' },
    shop:     { label: t('profile.verifiedShop'),  bg: '#FFFBEB', text: '#92400E' },
  };
  if (tier === 'none') return null;
  const c = cfg[tier];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.text}25` }}
    >
      <Check size={9} strokeWidth={2.5} />
      {c.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────────
const Avatar: React.FC<{ user: User; size?: number; onEdit?: () => void }> = ({ user, size = 76, onEdit }) => {
  const [hover, setHover] = useState(false);
  const initials = (user.name?.charAt(0) || '?').toUpperCase();
  return (
    <button
      type="button"
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Modifier la photo de profil"
      className="relative inline-flex cursor-pointer focus:outline-none rounded-full"
      style={{ width: size, height: size }}
    >
      {user.avatar ? (
        <img
          src={getOptimizedUrl(user.avatar, size * 2)}
          alt={user.name}
          className="w-full h-full rounded-full object-cover"
          style={{
            border: '2.5px solid #F5C842',
            boxShadow: '0 0 0 3px rgba(245,200,66,0.15), 0 4px 16px rgba(0,0,0,0.10)',
          }}
        />
      ) : (
        <span
          className="w-full h-full rounded-full flex items-center justify-center font-extrabold select-none"
          style={{
            background: 'linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%)',
            border: '2.5px solid #F5C842',
            boxShadow: '0 0 0 3px rgba(245,200,66,0.15), 0 4px 16px rgba(0,0,0,0.10)',
            fontSize: size * 0.30,
            color: '#B07410',
            letterSpacing: '-0.02em',
          }}
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
      <span
        className="absolute bottom-0.5 right-0.5 w-[11px] h-[11px] rounded-full"
        style={{ background: '#10B981', border: '2px solid #F7F8FA', boxShadow: '0 0 5px rgba(16,185,129,0.4)' }}
      />
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// MENU ITEM
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
      <span
        className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center"
        style={{
          background: danger ? 'rgba(239,68,68,0.08)' : '#F4F5F7',
          color: danger ? '#EF4444' : '#5C6370',
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block text-[14px] font-medium leading-snug truncate"
          style={{ color: danger ? '#EF4444' : '#111318' }}
        >
          {label}
        </span>
        {sub && (
          <span className="block text-[11px] mt-0.5 truncate" style={{ color: '#9EA5B0' }}>
            {sub}
          </span>
        )}
      </span>
      {rightContent
        ? <span className="shrink-0">{rightContent}</span>
        : !danger && <ChevronRight size={15} style={{ color: '#D1D5DB', flexShrink: 0 }} />}
    </>
  );
  const baseCls = 'flex items-center gap-3.5 w-full px-4 py-[11px] text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 active:scale-[0.99] active:bg-gray-50';
  if (href) return <Link to={href} className={baseCls}>{content}</Link>;
  return <button onClick={onClick} className={baseCls}>{content}</button>;
};

// ─────────────────────────────────────────────────────────────
// MENU SECTION
// ─────────────────────────────────────────────────────────────
const MenuSection: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-[.07em] px-1 pb-1.5" style={{ color: '#9EA5B0' }}>
          {title}
        </p>
      )}
      <div
        className="rounded-2xl overflow-hidden bg-white"
        style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
      >
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="h-px ml-[62px]" style={{ background: 'rgba(0,0,0,0.05)' }} />}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// UPGRADE BANNER
// ─────────────────────────────────────────────────────────────
const UpgradeBanner: React.FC<{ currentTier: DisplayTier; onUpgrade: () => void }> = ({ currentTier, onUpgrade }) => {
  const { t } = useTranslation();
  if (currentTier === 'pro' || currentTier === 'elite' || currentTier === 'unlimited') return null;
  const next = currentTier === 'free' ? t('profile.tierStarter') : t('profile.tierPro');
  return (
    <div
      className="rounded-2xl p-3 flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg,#FFFBEB 0%,#FEF9EC 100%)',
        border: '1px solid rgba(245,200,66,0.3)',
        boxShadow: '0 2px 8px rgba(245,200,66,0.12)',
      }}
    >
      <span
        className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(245,200,66,0.2)' }}
      >
        <Zap size={16} color="#C47E00" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold leading-tight" style={{ color: '#111318' }}>
          {t('profile.upgradeTo', { tier: next })}
        </span>
        <span className="block text-[11px] mt-0.5" style={{ color: '#5C6370' }}>
          {t('profile.upgradeBenefits')}
        </span>
      </span>
      <button
        onClick={onUpgrade}
        className="shrink-0 px-3 py-1.5 rounded-[9px] text-[12px] font-extrabold cursor-pointer border-none active:scale-[0.97] transition-all duration-150"
        style={{ background: '#F5C842', color: '#111318', boxShadow: '0 2px 8px rgba(245,200,66,0.35)' }}
      >
        {t('profile.upgradeViewBtn')}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BECOME SELLER BANNER
// ─────────────────────────────────────────────────────────────
const BecomeSellerBanner: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-2xl p-3 flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg,#FFFBEB 0%,#FFFFFF 100%)',
        border: '1px solid rgba(245,200,66,0.3)',
        boxShadow: '0 2px 8px rgba(245,200,66,0.10)',
      }}
    >
      <span
        className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(245,200,66,0.2)' }}
      >
        <Store size={16} color="#C47E00" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold leading-tight" style={{ color: '#111318' }}>
          {t('profile.becomeSeller')}
        </span>
        <span className="block text-[11px] mt-0.5" style={{ color: '#5C6370' }}>
          {t('profile.becomeSellerHint')}
        </span>
      </span>
      <button
        onClick={onStart}
        className="shrink-0 px-3 py-1.5 rounded-[9px] text-[12px] font-extrabold cursor-pointer border-none active:scale-[0.97] transition-all"
        style={{ background: '#F5C842', color: '#111318', boxShadow: '0 2px 8px rgba(245,200,66,0.35)' }}
      >
        {t('profile.becomeSellerCta')}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LOGOUT SHEET
// ─────────────────────────────────────────────────────────────
const LogoutSheet: React.FC<{ open: boolean; onConfirm: () => void; onCancel: () => void }> = ({ open, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 bg-white"
        style={{
          borderTop: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
          paddingBottom: 'max(2.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />
        <p className="text-[17px] font-bold mb-1.5" style={{ color: '#111318' }}>
          {t('profile.logoutTitle')}
        </p>
        <p className="text-[13px] mb-6 leading-relaxed" style={{ color: '#5C6370' }}>
          {t('profile.logoutSubtitle')}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 rounded-xl text-white text-[15px] font-bold transition-colors duration-150 border-none cursor-pointer"
            style={{ background: '#EF4444' }}
          >
            {t('profile.logoutConfirmBtn')}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 rounded-xl text-[15px] font-medium transition-colors duration-150 bg-white cursor-pointer"
            style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5C6370' }}
          >
            {t('profile.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SELECTOR SHEET
// ─────────────────────────────────────────────────────────────
interface SelectorOption { value: string; label: string; flag?: string; }
const SelectorSheet: React.FC<{
  open: boolean; title: string; options: SelectorOption[]; value: string;
  onSelect: (v: string) => void; onClose: () => void;
}> = ({ open, title, options, value, onSelect, onClose }) => {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 bg-white overflow-y-auto"
        style={{
          borderTop: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
          maxHeight: '80vh',
          paddingBottom: 'max(2.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />
        <p className="text-[17px] font-bold mb-4" style={{ color: '#111318' }}>{title}</p>
        <div className="flex flex-col gap-1">
          {options.map(opt => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); onClose(); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-colors duration-150 border cursor-pointer"
                style={{
                  background: active ? 'rgba(245,200,66,0.08)' : 'transparent',
                  borderColor: active ? 'rgba(245,200,66,0.4)' : 'transparent',
                }}
              >
                {opt.flag && <span className="text-[18px] shrink-0">{opt.flag}</span>}
                <span className="flex-1 text-[14px] font-medium" style={{ color: '#111318' }}>{opt.label}</span>
                {active && <Check size={16} strokeWidth={2.5} style={{ color: '#C47E00', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 py-3 rounded-xl text-[14px] font-medium cursor-pointer bg-white"
          style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5C6370' }}
        >
          {t('profile.cancel')}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT INFO SHEET
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
      await updateUserProfile(user.id, { name: name.trim(), whatsapp: whatsapp.trim(), bio: bio.trim() });
      toast(t('profile.profileSaved'), 'success');
      onClose();
    } catch (err) {
      console.error('Erreur sauvegarde profil:', err);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-xl p-3 text-[14px] outline-none transition-all';
  const inputStyle = { background: '#F4F5F7', border: '1px solid rgba(0,0,0,0.08)', color: '#111318' };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-5 pb-9 bg-white"
        style={{
          borderTop: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.10)',
          paddingBottom: 'max(2.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />
        <p className="text-[17px] font-bold mb-4" style={{ color: '#111318' }}>
          {t('profile.editPersonalInfoTitle')}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: '#9EA5B0' }}>
              {t('profile.name')}
            </label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: '#9EA5B0' }}>
              {t('profile.bio')}
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder={t('profile.bioPlaceholder')}
              className={inputCls + ' min-h-[60px] resize-none'}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: '#9EA5B0' }}>
              {t('profile.whatsapp')}
            </label>
            <input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="+257..."
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-[14px] font-medium cursor-pointer"
              style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5C6370', background: 'white' }}
            >
              {t('profile.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-[14px] font-bold cursor-pointer border-none disabled:opacity-60 transition-all"
              style={{ background: '#F5C842', color: '#111318' }}
            >
              {saving ? '…' : t('profile.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BOTTOM NAV (profile active)
// ─────────────────────────────────────────────────────────────
function BottomNav({ navigate, onSell }: { navigate: (p: string) => void; onSell: () => void }) {
  const tabs = [
    { id: 'home',      label: 'Accueil',  Icon: HomeIcon, path: '/' },
    { id: 'search',    label: 'Chercher', Icon: Search,   path: '/search' },
    { id: 'sell',      label: 'Vendre',   Icon: Plus,     path: '' },
    { id: 'favorites', label: 'Favoris',  Icon: Heart,    path: '/favorites' },
    { id: 'profile',   label: 'Profil',   Icon: UserIcon, path: '/profile' },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white"
      style={{
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch justify-around h-16 px-1">
        {tabs.map(({ id, label, Icon, path }) => {
          const isActive = id === 'profile';
          if (id === 'sell') {
            return (
              <button
                key={id}
                type="button"
                onClick={onSell}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center -mt-3.5"
                  style={{ background: 'linear-gradient(135deg,#F5C842 0%,#E8A800 100%)', boxShadow: '0 4px 16px rgba(245,200,66,0.5)' }}
                >
                  <Plus size={22} color="#111318" strokeWidth={3} />
                </div>
                <span className="text-[10px] font-bold text-[#111318]">{label}</span>
              </button>
            );
          }
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
            >
              <Icon size={22} color={isActive ? '#C47E00' : '#9EA5B0'} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px]" style={{ color: isActive ? '#C47E00' : '#9EA5B0', fontWeight: isActive ? 800 : 600 }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

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

  const joinYear = currentUser.joinDate ? new Date(currentUser.joinDate).getFullYear() : null;
  const expiresAt = currentUser.sellerDetails?.subscriptionExpiresAt;
  const hasActiveSubscription = !!(expiresAt && expiresAt > mountedAt);

  const supportPhone = SUPPORT_WHATSAPP[activeCountry] || SUPPORT_WHATSAPP['bi'];
  const supportHref = `https://wa.me/${supportPhone.replace(/\D/g, '')}`;

  const handleNotifications = async () => {
    if (permission === 'granted') return;
    if (permission === 'denied') { toast(t('profile.notifsBlocked'), 'info'); return; }
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
    <div className="flex flex-col min-h-screen" style={{ background: '#F7F8FA' }}>
      {/* ── HEADER ── */}
      <header
        className="sticky top-0 z-30 bg-white flex items-center gap-3 px-4 h-14"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1 as any)}
          className="w-9 h-9 rounded-xl flex items-center justify-center border-none cursor-pointer active:bg-gray-100 transition-colors"
          style={{ background: '#F4F5F7' }}
          aria-label="Retour"
        >
          <ChevronLeft size={18} color="#5C6370" strokeWidth={2.5} />
        </button>
        <h1
          className="flex-1 text-[17px] font-black tracking-tight"
          style={{ color: '#111318' }}
        >
          Mon profil
        </h1>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-[13px] font-bold cursor-pointer border-none bg-transparent"
          style={{ color: '#C47E00' }}
        >
          Modifier
        </button>
      </header>

      {/* ── SCROLLABLE CONTENT ── */}
      <main className="flex-1 pb-24">
        {/* Hero identity */}
        <div className="flex flex-col items-center gap-2.5 px-4 pt-6 pb-5">
          <Avatar user={currentUser} onEdit={() => setEditOpen(true)} />
          <div className="text-center">
            <h2
              className="text-[22px] font-extrabold tracking-[-0.03em] leading-tight mb-1.5"
              style={{ color: '#111318' }}
            >
              {currentUser.name || '—'}
            </h2>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <PlanBadge tier={tier} />
              <VerifiedPill user={currentUser} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px]" style={{ color: '#9EA5B0' }}>{currentUser.email}</span>
            {joinYear && (
              <>
                <span className="text-[10px]" style={{ color: '#E5E7EB' }}>·</span>
                <span className="text-[12px]" style={{ color: '#9EA5B0' }}>{t('profile.since', { year: joinYear })}</span>
              </>
            )}
          </div>
          {currentUser.bio && (
            <p className="text-[12px] italic max-w-xs text-center mt-0.5" style={{ color: '#9EA5B0' }}>
              "{currentUser.bio}"
            </p>
          )}
        </div>

        {/* Contextual banners */}
        <div className="px-4 mb-4 space-y-2">
          {isBuyer && <BecomeSellerBanner onStart={() => navigate('/devenir-vendeur')} />}
          {(isSeller || isAdmin) && <UpgradeBanner currentTier={tier} onUpgrade={() => navigate('/plans')} />}
        </div>

        {/* Menu sections */}
        <div className="px-4 space-y-0">
          {/* Compte */}
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
                  : <span className="text-[11px] font-bold" style={{ color: '#C47E00' }}>{t('profile.upgradeArrow')}</span>}
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

          {/* Préférences */}
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

          {/* Aide & Légal */}
          <MenuSection title={t('profile.about')}>
            <MenuItem
              icon={<HelpCircle size={17} />}
              label={t('profile.support')}
              sub={t('profile.supportHint')}
              onClick={() => window.open(supportHref, '_blank', 'noopener,noreferrer')}
            />
            <MenuItem icon={<FileText size={17} />} label={t('profile.terms')} href="/cgu" />
            <MenuItem icon={<Shield size={17} />} label={t('profile.privacy')} href="/politique-confidentialite" />
          </MenuSection>

          {/* Déconnexion */}
          <MenuSection>
            <MenuItem icon={<LogOut size={17} />} label={t('profile.logout')} danger onClick={() => setLogoutOpen(true)} />
          </MenuSection>

          {/* Danger zone */}
          <MenuSection title={t('profile.dangerZone')}>
            <MenuItem
              icon={<Trash2 size={17} />}
              label={t('profile.deleteAccountTitle')}
              sub={t('profile.dangerZoneHint')}
              danger
              onClick={() => setShowDeleteModal(true)}
            />
          </MenuSection>

          <p className="text-center text-[10px] tracking-[.04em] pt-2 pb-1" style={{ color: '#D1D5DB' }}>
            {t('profile.versionFooter')}
          </p>
        </div>
      </main>

      <BottomNav navigate={navigate} onSell={handleSellerAccess} />

      {/* Sheets & Modals */}
      <EditInfoSheet open={editOpen} user={currentUser} onClose={() => setEditOpen(false)} />
      <SelectorSheet
        open={countrySheetOpen}
        title={t('profile.country')}
        options={[
          { value: '', label: t('profile.allCountries'), flag: '🌍' },
          ...INITIAL_COUNTRIES.filter(c => c.isActive).map(c => ({ value: c.id, label: c.name, flag: c.flag })),
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
        onSelect={v => i18n.changeLanguage(v)}
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
