// ProfileScreen.tsx
// Nunulia — Écran Profil · Light-first · WCAG AA
// Stack : React + TypeScript + Tailwind CSS
// Dépendances icônes : lucide-react (yarn add lucide-react)
// SOURCE : Claude Design (référence design — pas le composant intégré).
// Le composant intégré dans pages/Profile.tsx s'inspire de ce fichier
// mais utilise le theme système (Tailwind dark:) au lieu du prop darkMode,
// et est wired sur le contexte (currentUser, handleLogout, useNotificationConsent).

import React, { useState } from 'react'
import {
  User, Globe, Bell, Shield, HelpCircle, LogOut,
  ChevronRight, Check, Camera, Package, TrendingUp,
  Heart, MessageSquare, Zap, CreditCard, Store,
} from 'lucide-react'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type PlanTier = 'free' | 'starter' | 'plus' | 'business'
type VerifiedLevel = 'none' | 'telephone' | 'identite' | 'boutique'

interface UserProfile {
  name: string
  email: string
  phone: string
  country: string
  flag: string
  lang: string
  initials: string
  since: string
  // Stats — affichées uniquement si role === 'seller' ou 'admin'
  stats?: {
    listings: number
    views: string
    favorites: number
    contacts: number
  }
}

interface ProfileScreenProps {
  user: UserProfile
  planTier: PlanTier
  verifiedLevel: VerifiedLevel
  role: 'buyer' | 'seller' | 'admin'   // conditionne le stats row
  darkMode?: boolean
  onEditAvatar?: () => void
  onEditInfo?: () => void
  onEditCountry?: () => void
  onEditPlan?: () => void
  onEditShop?: () => void
  onEditPrivacy?: () => void
  onHelp?: () => void
  onLogout?: () => void
}

// ─────────────────────────────────────────────
// PLAN BADGE
// ─────────────────────────────────────────────
function PlanBadge({ tier, dark }: { tier: PlanTier; dark: boolean }) {
  const cfg = {
    free:     { label: 'Gratuit',  cls: dark ? 'bg-gray-700/40 border-gray-600/50 text-gray-400'        : 'bg-gray-100 border-gray-200 text-gray-500',         dot: dark ? 'bg-gray-500' : 'bg-gray-400' },
    starter:  { label: 'Starter', cls: 'bg-blue-500/10 border-blue-400/25 text-blue-500',               dot: 'bg-blue-500' },
    plus:     { label: 'Plus',    cls: dark ? 'bg-amber-400/10 border-amber-400/35 text-amber-500'      : 'bg-amber-50 border-amber-300/50 text-amber-700',     dot: dark ? 'bg-amber-400' : 'bg-amber-600' },
    business: { label: 'Business',cls: 'bg-indigo-500/10 border-indigo-400/30 text-indigo-500',         dot: 'bg-indigo-500' },
  }
  const c = cfg[tier]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ─────────────────────────────────────────────
// VERIFIED BADGE
// ─────────────────────────────────────────────
function VerifiedBadge({ level }: { level: VerifiedLevel }) {
  if (level === 'none') return null
  const cfg = {
    telephone: { label: 'Tél. vérifié', color: 'text-blue-500 bg-blue-500/8 border-blue-400/20' },
    identite:  { label: 'ID vérifiée',  color: 'text-emerald-600 bg-emerald-500/8 border-emerald-400/20' },
    boutique:  { label: 'Boutique',     color: 'text-amber-700 bg-amber-400/8 border-amber-400/20' },
  }
  const c = cfg[level]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.color}`}>
      <Check size={9} strokeWidth={2.5} />
      {c.label}
    </span>
  )
}

// ─────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────
function StatCard({
  icon, value, label, accent = false, dark,
}: {
  icon: React.ReactNode; value: string | number
  label: string; accent?: boolean; dark: boolean
}) {
  return (
    <div className={`
      flex-1 flex flex-col items-center py-2.5 px-1.5 rounded-xl min-w-0
      border gap-0.5
      ${dark
        ? accent ? 'bg-gray-800/50 border-amber-400/15' : 'bg-gray-800/50 border-gray-700/40'
        : accent ? 'bg-white border-amber-300/25 shadow-sm' : 'bg-white border-black/[.06] shadow-sm'}
    `}>
      <span className={accent ? (dark ? 'text-amber-400' : 'text-amber-700') : (dark ? 'text-gray-400' : 'text-gray-400')}>
        {icon}
      </span>
      <span className={`text-base font-extrabold tracking-tight leading-tight
        ${accent ? (dark ? 'text-amber-400' : 'text-amber-700') : (dark ? 'text-gray-100' : 'text-gray-900')}`}>
        {value}
      </span>
      <span className={`text-[10px] font-medium text-center leading-tight
        ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// TOGGLE
// ─────────────────────────────────────────────
function Toggle({
  checked, onChange, dark,
}: {
  checked: boolean; onChange: (v: boolean) => void; dark: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative w-10 h-[22px] rounded-full shrink-0 transition-colors duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60
        ${checked ? 'bg-amber-400' : dark ? 'bg-gray-600' : 'bg-gray-300'}
      `}
    >
      <span className={`
        absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white
        shadow-sm transition-all duration-200
        ${checked ? 'left-5' : 'left-0.5'}
      `} />
    </button>
  )
}

// ─────────────────────────────────────────────
// MENU ITEM
// ─────────────────────────────────────────────
function MenuItem({
  icon, label, sub, danger = false, rightContent, onClick, dark,
}: {
  icon: React.ReactNode; label: string; sub?: string
  danger?: boolean; rightContent?: React.ReactNode
  onClick?: () => void; dark: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3.5 w-full px-4 py-[11px] text-left
        transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40
        active:scale-[0.99]
        ${dark
          ? 'hover:bg-gray-700/40 active:bg-gray-700/60'
          : 'hover:bg-gray-50 active:bg-gray-100'}
      `}
    >
      {/* Icon container — min 44×44 tap target via padding */}
      <span className={`
        w-[34px] h-[34px] rounded-[9px] shrink-0
        flex items-center justify-center
        ${danger
          ? 'bg-red-500/8 text-red-500'
          : dark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-100 text-gray-500'}
      `}>
        {icon}
      </span>

      {/* Labels */}
      <span className="flex-1 min-w-0">
        <span className={`block text-[14px] font-medium leading-snug truncate
          ${danger ? 'text-red-500' : dark ? 'text-gray-100' : 'text-gray-900'}`}>
          {label}
        </span>
        {sub && (
          <span className={`block text-[11px] mt-0.5 truncate
            ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            {sub}
          </span>
        )}
      </span>

      {/* Right slot */}
      {rightContent
        ? <span className="shrink-0">{rightContent}</span>
        : !danger && <ChevronRight size={15} className={dark ? 'text-gray-700' : 'text-gray-300'} />
      }
    </button>
  )
}

// ─────────────────────────────────────────────
// MENU SECTION
// ─────────────────────────────────────────────
function MenuSection({
  title, children, dark,
}: {
  title?: string; children: React.ReactNode; dark: boolean
}) {
  const items = React.Children.toArray(children)
  return (
    <div className="mb-1.5">
      {title && (
        <p className={`text-[10px] font-bold uppercase tracking-[.07em] px-1 pb-1.5
          ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
          {title}
        </p>
      )}
      <div className={`rounded-2xl overflow-hidden border
        ${dark ? 'bg-gray-900 border-gray-700/50 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
               : 'bg-white border-black/[.07] shadow-[0_2px_12px_rgba(0,0,0,0.07)]'}`}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className={`h-px ml-16 ${dark ? 'bg-gray-700/35' : 'bg-black/[.05]'}`} />
            )}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────
function Avatar({
  initials, size = 72, bgApp, onEdit,
}: {
  initials: string; size?: number; bgApp: string; onEdit?: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Modifier la photo de profil"
      className="relative inline-flex cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-full"
      style={{ width: size, height: size }}
    >
      {/* Avatar circle */}
      <span
        className="w-full h-full rounded-full flex items-center justify-center font-extrabold select-none"
        style={{
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
          border: '2.5px solid rgba(245,200,66,0.5)',
          boxShadow: '0 0 0 3px rgba(245,200,66,0.12), 0 4px 16px rgba(0,0,0,0.10)',
          fontSize: size * 0.30,
          color: '#B07410',
          letterSpacing: '-0.02em',
        }}
      >
        {initials}
      </span>
      {/* Hover overlay */}
      <span
        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/35 transition-opacity duration-200"
        style={{ opacity: hover ? 1 : 0 }}
      >
        <Camera size={18} color="#fff" />
      </span>
      {/* Online dot */}
      <span
        className="absolute bottom-0.5 right-0.5 w-[11px] h-[11px] rounded-full bg-emerald-500"
        style={{
          border: `2px solid ${bgApp}`,
          boxShadow: '0 0 5px rgba(16,185,129,0.4)',
        }}
      />
    </button>
  )
}

// ─────────────────────────────────────────────
// UPGRADE BANNER
// Affiché uniquement pour tier free et starter
// ─────────────────────────────────────────────
function UpgradeBanner({
  currentTier, dark, onUpgrade,
}: {
  currentTier: PlanTier; dark: boolean; onUpgrade?: () => void
}) {
  if (currentTier === 'business' || currentTier === 'plus') return null
  const next = currentTier === 'free' ? 'Starter' : 'Plus'
  return (
    <div className={`
      mx-4 mb-3 rounded-2xl p-3 flex items-center gap-3 border
      ${dark
        ? 'bg-amber-400/[.07] border-amber-400/[.18]'
        : 'bg-amber-50/60 border-amber-300/25'}
    `}>
      <span className="w-[34px] h-[34px] rounded-[9px] shrink-0 bg-amber-400/12 flex items-center justify-center">
        <Zap size={16} className="text-amber-700" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-bold leading-tight ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
          Passer à {next}
        </span>
        <span className={`block text-[11px] mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
          Plus de visibilité, annonces illimitées
        </span>
      </span>
      <button
        onClick={onUpgrade}
        className="shrink-0 px-3 py-1.5 rounded-[9px] text-[12px] font-extrabold text-gray-900
          bg-amber-400 hover:bg-amber-300 active:bg-amber-500 active:scale-[0.97]
          transition-all duration-150 shadow-[0_2px_8px_rgba(245,200,66,0.35)]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
      >
        Voir
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// LOGOUT BOTTOM SHEET
// ─────────────────────────────────────────────
function LogoutSheet({
  visible, onConfirm, onCancel, dark,
}: {
  visible: boolean; onConfirm: () => void; onCancel: () => void; dark: boolean
}) {
  if (!visible) return null
  return (
    <div
      className="absolute inset-0 z-[60] flex items-end"
      style={{ background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full rounded-t-3xl px-5 pt-5 pb-9 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]
          animate-[slideUp_260ms_ease-out]
          ${dark ? 'bg-gray-900 border-t border-gray-700/60' : 'bg-white border-t border-black/[.08]'}`}
      >
        <div className={`w-9 h-1 rounded-full mx-auto mb-5 ${dark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        <p className={`text-[17px] font-bold mb-1.5 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
          Se déconnecter ?
        </p>
        <p className={`text-[13px] mb-6 leading-relaxed ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
          Votre session sera fermée sur cet appareil.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 rounded-xl bg-red-500 hover:bg-red-400 active:bg-red-600
              text-white text-[15px] font-bold transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            Déconnecter
          </button>
          <button
            onClick={onCancel}
            className={`w-full py-3.5 rounded-xl text-[15px] font-medium transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40
              ${dark
                ? 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                : 'border border-gray-200 text-gray-400 hover:bg-gray-50'}`}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PROFILE SCREEN — composant principal
// ─────────────────────────────────────────────
export default function ProfileScreen({
  user, planTier, verifiedLevel, role,
  darkMode = false,
  onEditAvatar, onEditInfo, onEditCountry,
  onEditPlan, onEditShop, onEditPrivacy,
  onHelp, onLogout,
}: ProfileScreenProps) {
  const [notifs, setNotifs] = useState(true)
  const [showLogout, setShowLogout] = useState(false)
  const dark = darkMode

  // Stats : uniquement pour vendeurs et admins
  const showStats = (role === 'seller' || role === 'admin') && !!user.stats

  const bgApp     = dark ? '#111318' : '#F7F8FA'
  const navBorder = dark ? 'rgba(61,40,0,0.3)' : 'rgba(228,230,234,1)'

  return (
    <div
      className="flex flex-col min-h-full pb-20"
      style={{ background: bgApp }}
    >
      {/* ── TOP BAR ── */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b
          ${dark ? 'border-gray-800' : 'border-black/[.07]'}`}
        style={{ background: bgApp }}
      >
        <span
          className="text-[18px] font-black tracking-[-0.04em]"
          style={{
            background: 'linear-gradient(to right, #f59e0b, #F5C842)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}
        >
          NUNULIA
        </span>
        <div className="flex gap-2">
          {[user.lang, user.flag].map((lbl, i) => (
            <button key={i}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium
                transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40
                ${dark ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                       : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 shadow-sm'}`}
            >
              <span className={i === 1 ? 'text-[13px]' : ''}>{lbl}</span>
              <span className="text-[8px] opacity-50">▼</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── HERO IDENTITY ── */}
      <div className="flex flex-col items-center gap-2.5 px-4 pt-5 pb-4">
        <Avatar
          initials={user.initials}
          size={72}
          bgApp={bgApp}
          onEdit={onEditAvatar}
        />

        <div className="text-center">
          <h1 className={`text-[22px] font-extrabold tracking-[-0.03em] leading-tight mb-1.5
            ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
            {user.name}
          </h1>
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <PlanBadge tier={planTier} dark={dark} />
            <VerifiedBadge level={verifiedLevel} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[12px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            {user.email}
          </span>
          <span className={`text-[10px] ${dark ? 'text-gray-700' : 'text-gray-300'}`}>·</span>
          <span className={`text-[12px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            Depuis {user.since}
          </span>
        </div>

        {/* ── STATS ROW — vendeur / admin uniquement ── */}
        {showStats && user.stats && (
          <div className="flex gap-2 w-full mt-0.5">
            <StatCard icon={<Package size={14} />}     value={user.stats.listings}  label="Annonces"    dark={dark} />
            <StatCard icon={<TrendingUp size={14} />}  value={user.stats.views}     label="Vues / mois" accent dark={dark} />
            <StatCard icon={<Heart size={14} />}       value={user.stats.favorites} label="Favoris"     dark={dark} />
            <StatCard icon={<MessageSquare size={14} />} value={user.stats.contacts} label="Contacts"   dark={dark} />
          </div>
        )}
      </div>

      {/* ── UPGRADE BANNER — free + starter uniquement ── */}
      <UpgradeBanner currentTier={planTier} dark={dark} />

      {/* ── MENU ── */}
      <div className="px-4 pt-1 flex flex-col gap-0">

        <MenuSection title="Compte" dark={dark}>
          <MenuItem dark={dark} icon={<User size={17} />}       label="Informations personnelles" sub={`${user.name} · ${user.phone}`}          onClick={onEditInfo} />
          <MenuItem dark={dark} icon={<Globe size={17} />}      label="Pays et langue"            sub={`${user.flag} ${user.country} · ${user.lang}`} onClick={onEditCountry} />
          <MenuItem dark={dark} icon={<CreditCard size={17} />} label="Mon abonnement"
            sub={planTier === 'free' ? 'Gratuit — Passer à Starter' : `Plan ${planTier.charAt(0).toUpperCase()+planTier.slice(1)} actif`}
            rightContent={planTier !== 'free'
              ? <PlanBadge tier={planTier} dark={dark} />
              : <span className="text-[11px] font-bold text-amber-700">Upgrader →</span>}
            onClick={onEditPlan}
          />
          {/* Boutique — vendeurs et admins uniquement */}
          {(role === 'seller' || role === 'admin') && (
            <MenuItem dark={dark} icon={<Store size={17} />} label="Ma boutique" sub="NjayShop · 12 annonces actives" onClick={onEditShop} />
          )}
        </MenuSection>

        <MenuSection title="Préférences" dark={dark}>
          <MenuItem dark={dark} icon={<Bell size={17} />}
            label="Notifications"
            sub={notifs ? 'Activées — messages, favoris, prix' : 'Désactivées'}
            rightContent={<Toggle checked={notifs} onChange={setNotifs} dark={dark} />}
          />
          <MenuItem dark={dark} icon={<Shield size={17} />} label="Confidentialité" sub="Données, visibilité du profil" onClick={onEditPrivacy} />
        </MenuSection>

        <MenuSection title="Aide" dark={dark}>
          <MenuItem dark={dark} icon={<HelpCircle size={17} />} label="Aide et support" sub="FAQ, signaler un problème" onClick={onHelp} />
        </MenuSection>

        <MenuSection dark={dark}>
          <MenuItem dark={dark} icon={<LogOut size={17} />} label="Se déconnecter" danger onClick={() => setShowLogout(true)} />
        </MenuSection>

        <p className={`text-center text-[10px] tracking-[.04em] pt-2.5 pb-1
          ${dark ? 'text-gray-800' : 'text-gray-300'}`}>
          NUNULIA v2.4.1 · Burundi, RDC, Rwanda
        </p>
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav
        aria-label="Navigation principale"
        className="fixed bottom-0 left-0 right-0 flex justify-around
          pt-2 pb-[18px] backdrop-blur-lg z-50
          shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        style={{
          background: dark ? 'rgba(17,24,39,0.97)' : 'rgba(255,255,255,0.97)',
          borderTop: `1px solid ${navBorder}`,
        }}
      >
        {([
          { id: 'home',      icon: '🏠', label: 'Accueil' },
          { id: 'favorites', icon: '❤️',  label: 'Favoris' },
          { id: 'dashboard', icon: '📊', label: 'Boutique' },
          { id: 'profile',   icon: '⚙️',  label: 'Compte'  },
        ] as const).map(tab => (
          <button key={tab.id}
            aria-label={tab.label}
            className="flex flex-col items-center gap-0.5 flex-1 py-1 relative
              bg-transparent border-none cursor-pointer
              [-webkit-tap-highlight-color:transparent] focus:outline-none
              focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <span className={`text-[19px] transition-transform duration-200
              ${tab.id === 'profile' ? 'scale-110' : 'scale-100'}`}>
              {tab.icon}
            </span>
            <span className={`text-[10px] font-medium transition-colors duration-200
              ${tab.id === 'profile'
                ? 'text-amber-700 font-bold'
                : dark ? 'text-gray-500' : 'text-gray-400'}`}>
              {tab.label}
            </span>
            {tab.id === 'profile' && (
              <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-amber-400
                shadow-[0_0_5px_rgba(245,200,66,0.6)]" />
            )}
          </button>
        ))}
      </nav>

      {/* ── LOGOUT SHEET ── */}
      <LogoutSheet
        visible={showLogout}
        onConfirm={() => { setShowLogout(false); onLogout?.() }}
        onCancel={() => setShowLogout(false)}
        dark={dark}
      />

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
