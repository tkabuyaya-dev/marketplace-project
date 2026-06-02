// SellerDashboard-claude-design.tsx
// NUNULIA — Seller Dashboard (Espace Vendeur)
// Single-file React component. Tailwind CSS required (with the config snippet shown
// at the bottom of this file). Drop-in usable as a Next.js page or any React route.
//
// Default export: <SellerDashboard /> — renders the Overview tab.

// @ts-nocheck
/* eslint-disable */
import React from 'react';

// ───────── src/data.jsx ─────────
// Mock state — single source of truth for the prototype.
const currentUser = {
  name: 'Aline Niyibizi',
  avatar: 'AN',
  bio: 'Bijouterie artisanale faite main · Pièces uniques en cuivre, perles et tissus locaux. Livraison Kigali + Bujumbura.',
  whatsapp: '+257 79 412 887',
  role: 'seller',
  isVerified: true,
  sellerDetails: {
    shopName: 'Bijoux Kigali',
    sellerType: 'Boutique',
    nif: 'BI-NIF-0044812',
    phone: '+257 79 412 887',
    locationUrl: 'maps.google.com/?q=-3.3614,29.3599',
    gps: { lat: -3.3614, lng: 29.3599 },
    province: 'Bujumbura Mairie',
    commune: 'Mukaza',
    quartier: 'Rohero II',
    shopImage: null,
    categories: ['Bijoux', 'Mode & Accessoires', 'Artisanat'],
    countryId: 'BI',
  },
};

const myProducts = [
  { id: 'p1', title: 'Collier en cuivre tressé — pièce unique', price: 38000, currency: 'BIF', images: ['#FFE8B0'], status: 'active',  category: 'Bijoux',  subCategory: 'Colliers', views: 142 },
  { id: 'p2', title: 'Bracelets en perles imigongo (lot de 3)',    price: 22000, currency: 'BIF', images: ['#FAD2C8'], status: 'active',  category: 'Bijoux',  subCategory: 'Bracelets', views: 98 },
  { id: 'p3', title: 'Boucles d\'oreilles en laiton martelé',       price: 15000, currency: 'BIF', images: ['#D9E8D2'], status: 'pending', category: 'Bijoux',  subCategory: 'Boucles', views: 0 },
  { id: 'p4', title: 'Sac à main en wax bleu nuit',                  price: 65000, currency: 'BIF', images: ['#C9D8F0'], status: 'active',  category: 'Mode',    subCategory: 'Sacs', views: 211 },
  { id: 'p5', title: 'Bague en cuivre — modèle « Tanganyika »',     price: 28000, currency: 'BIF', images: ['#F2D8B6'], status: 'rejected',category: 'Bijoux',  subCategory: 'Bagues', views: 4, rejectReason: 'Photos floues — merci de re-téléverser avec un fond clair.' },
  { id: 'p6', title: 'Pendentif goutte d\'eau cuivre & jade',       price: 42000, currency: 'BIF', images: ['#D6E4DD'], status: 'active',  category: 'Bijoux',  subCategory: 'Pendentifs', views: 76 },
  { id: 'p7', title: 'Brouillon — Parure mariage 4 pièces',         price: 120000,currency: 'BIF', images: ['#EEEEF1'], status: 'draft',   category: 'Bijoux',  subCategory: 'Parures', views: 0 },
  { id: 'p8', title: 'Ceinture en wax tressé, ajustable',            price: 18000, currency: 'BIF', images: ['#F4DCC9'], status: 'active',  category: 'Mode',    subCategory: 'Ceintures', views: 54 },
  { id: 'p9', title: 'Foulard imprimé motifs Bujumbura',             price: 12000, currency: 'BIF', images: ['#E8DCEC'], status: 'active',  category: 'Mode',    subCategory: 'Foulards', views: 31 },
  { id: 'p10',title: 'Boucles « Lune de Kivu » plaqué or',           price: 33000, currency: 'BIF', images: ['#FBEFC4'], status: 'active',  category: 'Bijoux',  subCategory: 'Boucles', views: 88 },
  { id: 'p11',title: 'Collier perles & graines — naturel',           price: 19500, currency: 'BIF', images: ['#E4D8C4'], status: 'active',  category: 'Bijoux',  subCategory: 'Colliers', views: 47 },
  { id: 'p12',title: 'Sac pochette cuir teint à la main',            price: 48000, currency: 'BIF', images: ['#D2C6B8'], status: 'active',  category: 'Mode',    subCategory: 'Sacs', views: 65 },
];

const buyerRequests = [
  { id: 'r1', initials: 'JB', category: 'Bijoux', budget: '20 000 – 40 000 BIF', location: 'Bujumbura · Rohero', timeAgo: 'il y a 2 h', text: 'Je cherche un collier en cuivre fait main pour un cadeau d\'anniversaire. De préférence pièce unique, livraison sous 3 jours.', locked: false, replies: 3 },
  { id: 'r2', initials: 'MK', category: 'Mode',   budget: '50 000 – 80 000 BIF', location: 'Kigali · Kimihurura', timeAgo: 'il y a 4 h', text: 'Sac à main en wax bleu ou vert, taille moyenne, doublure intérieure. Prêt à acheter cette semaine.', locked: false, replies: 1 },
  { id: 'r3', initials: 'AC', category: 'Bijoux', budget: '10 000 – 20 000 BIF', location: 'Goma · Himbi',         timeAgo: 'il y a 6 h', text: 'Bracelets en perles imigongo — lot de 3 minimum, couleurs chaudes (rouge, ocre, or).', locked: false, replies: 0 },
  { id: 'r4', initials: '??', category: 'Bijoux', budget: '80 000 – 150 000 BIF',location: 'Bujumbura · Kinindo', timeAgo: 'il y a 9 h', text: 'Parure mariage complète (collier + boucles + bracelet). Budget flexible si pièce de qualité.', locked: true, replies: 5 },
  { id: 'r5', initials: 'EN', category: 'Mode',   budget: '15 000 – 25 000 BIF', location: 'Bujumbura · Mutanga',  timeAgo: 'il y a 1 j', text: 'Foulards imprimés, motifs locaux, plusieurs pièces pour boutique de revente.', locked: false, replies: 2 },
];

// 30 days of view data
const analyticsData = (() => {
  const arr = [];
  const base = [22,18,26,31,29,24,35,42,38,28,33,45,52,48,41,37,44,55,61,49,58,67,72,63,68,74,81,76,89,94];
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    arr.push({ date: d, views: base[i] });
  }
  return arr;
})();

const topProducts = [
  { id: 'p4', title: 'Sac à main en wax bleu nuit', views: 211, color: '#C9D8F0' },
  { id: 'p1', title: 'Collier en cuivre tressé — pièce unique', views: 142, color: '#FFE8B0' },
  { id: 'p2', title: 'Bracelets en perles imigongo (lot de 3)', views: 98, color: '#FAD2C8' },
  { id: 'p10', title: 'Boucles « Lune de Kivu » plaqué or', views: 88, color: '#FBEFC4' },
  { id: 'p6', title: 'Pendentif goutte d\'eau cuivre & jade', views: 76, color: '#D6E4DD' },
];

const boostRequests = [
  { id: 'b1', productId: 'p4', title: 'Sac à main en wax bleu nuit', expires: '4 j 12 h', uplift: '+312%', impressions: 1840, status: 'active', color: '#C9D8F0' },
  { id: 'b2', productId: 'p1', title: 'Collier en cuivre tressé — pièce unique', expires: '11 h 22 m', uplift: '+128%', impressions: 612, status: 'active', color: '#FFE8B0' },
];

const subscriptionState = {
  tier: 'Pro',
  tierMax: 25,
  used: 12,
  daysRemaining: 18,
  isExpired: false,
  isInGrace: false,
  downgradePhase: 0,
  graceDaysLeft: 0,
  isPaidTier: true,
};

const offlineQueue = {
  count: 2,
  syncing: false,
  drafts: [
    { id: 'd1', title: 'Bague feuille de bananier — laiton', progress: 64 },
    { id: 'd2', title: 'Pendentif perles & cuir', progress: 22 },
  ],
};

const requestStats = { todayCount: 3, fulfilledCount: 14 };

const networkQuality = 'slow'; // 'fast' | 'slow' | 'offline'

const productScore = {
  score: 72,
  tips: [
    'Ajoutez au moins 4 photos en lumière naturelle.',
    'Précisez le poids et les dimensions dans la description.',
    'Indiquez un prix grossiste pour attirer les revendeurs.',
  ],
};

const categories = [
  { id: 'bijoux', label: 'Bijoux', sub: ['Colliers', 'Bracelets', 'Boucles', 'Bagues', 'Pendentifs', 'Parures'] },
  { id: 'mode',   label: 'Mode & Accessoires', sub: ['Sacs', 'Foulards', 'Ceintures', 'Chapeaux'] },
  { id: 'maison', label: 'Maison',  sub: ['Décoration', 'Vaisselle', 'Textile'] },
  { id: 'beaute', label: 'Beauté',  sub: ['Soins', 'Parfums', 'Maquillage'] },
];

const fmtPrice = (n, cur='BIF') => new Intl.NumberFormat('fr-FR').format(n) + ' ' + cur;
const fmtNum = (n) => new Intl.NumberFormat('fr-FR').format(n);

// ───────── src/icons.jsx ─────────
// Lightweight inline SVG icon set. Stroke 1.75, currentColor.
const I = ({ d, size = 18, fill = 'none', stroke = 'currentColor', sw = 1.75, viewBox = '0 0 24 24', children, ...rest }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icon = {
  Grid:      (p) => <I {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></I>,
  Box:       (p) => <I {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></I>,
  Chart:     (p) => <I {...p}><path d="M4 20h16"/><rect x="6" y="11" width="3" height="7" rx="1"/><rect x="11" y="7" width="3" height="11" rx="1"/><rect x="16" y="14" width="3" height="4" rx="1"/></I>,
  Bolt:      (p) => <I {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></I>,
  Cart:      (p) => <I {...p}><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.6 11.2a2 2 0 002 1.6h7.6a2 2 0 002-1.6L21 8H6"/></I>,
  Palette:   (p) => <I {...p}><path d="M12 22a10 10 0 110-20 10 10 0 015 18.6c-1.4.8-3 0-3-1.6V18a2 2 0 00-2-2H10a2 2 0 01-2-2V13a3 3 0 013-3h1a2 2 0 002-2V6"/><circle cx="7.5" cy="11" r="1"/><circle cx="9.5" cy="7" r="1"/><circle cx="14.5" cy="6.5" r="1"/></I>,
  Shield:    (p) => <I {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></I>,
  Plus:      (p) => <I {...p}><path d="M12 5v14M5 12h14"/></I>,
  Check:     (p) => <I {...p}><path d="M5 12l4 4 10-10"/></I>,
  Star:      (p) => <I {...p} fill="currentColor" stroke="none"><path d="M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7z"/></I>,
  Crown:     (p) => <I {...p}><path d="M3 7l4 4 5-6 5 6 4-4-2 11H5L3 7z"/></I>,
  ArrowRight:(p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6"/></I>,
  ArrowUp:   (p) => <I {...p}><path d="M12 19V5M6 11l6-6 6 6"/></I>,
  ArrowDown: (p) => <I {...p}><path d="M12 5v14M6 13l6 6 6-6"/></I>,
  Trash:     (p) => <I {...p}><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></I>,
  Edit:      (p) => <I {...p}><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></I>,
  Dots:      (p) => <I {...p}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></I>,
  Camera:    (p) => <I {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/></I>,
  WhatsApp:  (p) => <I {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.5 3.5A11 11 0 003.4 17l-1.4 5 5.1-1.3A11 11 0 1020.5 3.5zm-8.5 18a9.4 9.4 0 01-4.8-1.3l-.3-.2-3 .8.8-2.9-.2-.3a9.5 9.5 0 1115.5-7.4 9.5 9.5 0 01-8 11.3zm5.4-7.1c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7 0a7.8 7.8 0 01-2.3-1.4 8.7 8.7 0 01-1.6-2c-.2-.3 0-.5.1-.6l.5-.6.3-.5a.5.5 0 000-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 00-.9.4 3.7 3.7 0 00-1.1 2.7 6.4 6.4 0 001.3 3.4 14.7 14.7 0 005.7 5 19 19 0 001.9.7 4.6 4.6 0 002.1.1 3.4 3.4 0 002.2-1.5 2.8 2.8 0 00.2-1.5c-.1-.1-.3-.2-.6-.4z"/></I>,
  Refresh:   (p) => <I {...p}><path d="M3 12a9 9 0 0115.5-6.4L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.4L3 16M3 21v-5h5"/></I>,
  Wifi:      (p) => <I {...p}><path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/></I>,
  Lock:      (p) => <I {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></I>,
  Sparkle:   (p) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8"/></I>,
  Pin:       (p) => <I {...p}><path d="M12 22s-7-7.5-7-13a7 7 0 0114 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/></I>,
  Eye:       (p) => <I {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></I>,
  Search:    (p) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></I>,
  Menu:      (p) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16"/></I>,
  X:         (p) => <I {...p}><path d="M6 6l12 12M18 6L6 18"/></I>,
  Chevron:   (p) => <I {...p}><path d="M9 6l6 6-6 6"/></I>,
  ChevronDn: (p) => <I {...p}><path d="M6 9l6 6 6-6"/></I>,
  Clock:     (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>,
  Filter:    (p) => <I {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></I>,
  Upload:    (p) => <I {...p}><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></I>,
  Badge:     (p) => <I {...p} fill="currentColor" stroke="none"><path d="M12 2l2.5 2 3.4-.4L19 7l2.5 1.7L20 12l1.5 3.3L19 17l-1.1 3.4-3.4-.4L12 22l-2.5-2-3.4.4L5 17l-2.5-1.7L4 12 2.5 8.7 5 7l1.1-3.4 3.4.4L12 2zm-1 13l5-5-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z"/></I>,
};

// ───────── src/atoms.jsx ─────────
// Small shared building blocks.
const Card = ({ className = '', children, hover = false, style }) => (
  <div className={`bg-white rounded-card border border-black/[0.07] shadow-card ${hover ? 'lift' : ''} ${className}`} style={style}>
    {children}
  </div>
);

const SectionTitle = ({ children, sub, right }) => (
  <div className="flex items-end justify-between gap-4 mb-3">
    <div>
      <h2 className="text-[15px] font-black tracking-tight">{children}</h2>
      {sub && <div className="text-[12.5px] text-ink2 mt-0.5">{sub}</div>}
    </div>
    {right}
  </div>
);

const Badge = ({ children, bg = '#F4F5F7', color = '#5C6370', dot, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold leading-none ${className}`}
    style={{ background: bg, color }}
  >
    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
    {children}
  </span>
);

const tierBadge = (tier) => {
  const map = {
    Free:      { bg: '#F4F5F7', fg: '#5C6370' },
    Starter:   { bg: '#EFF6FF', fg: '#1D4ED8' },
    Pro:       { bg: '#FFFBEB', fg: '#92400E' },
    Elite:     { bg: '#FEF3C7', fg: '#78350F' },
    Unlimited: { bg: '#EEF2FF', fg: '#3730A3' },
  };
  const c = map[tier] || map.Free;
  return <Badge bg={c.bg} color={c.fg}>{tier}</Badge>;
};

const statusBadge = (status) => {
  const map = {
    active:   { bg: 'rgba(16,185,129,0.10)', fg: '#10B981', dot: true, label: 'Actif' },
    pending:  { bg: 'rgba(245,158,11,0.10)', fg: '#D97706', dot: true, label: 'En attente' },
    rejected: { bg: 'rgba(239,68,68,0.10)',  fg: '#EF4444', dot: true, label: 'Refusé' },
    draft:    { bg: '#F4F5F7',               fg: '#5C6370', dot: false,label: 'Brouillon' },
  };
  const c = map[status] || map.draft;
  return <Badge bg={c.bg} color={c.fg} dot={c.dot}>{c.label}</Badge>;
};

const GoldButton = ({ children, className = '', icon, ...rest }) => (
  <button
    className={`inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-gold text-ink font-semibold text-[14px] press transition hover:bg-goldHov hover:brightness-[1.02] ${className}`}
    style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(245,200,66,0.35)' }}
    {...rest}
  >
    {icon}{children}
  </button>
);

const GhostButton = ({ children, className = '', icon, ...rest }) => (
  <button
    className={`inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input bg-white text-ink font-semibold text-[14px] border border-black/[0.08] press hover:bg-canvas transition ${className}`}
    {...rest}
  >
    {icon}{children}
  </button>
);

const WhatsAppButton = ({ children, className = '', ...rest }) => (
  <button
    className={`inline-flex items-center justify-center gap-2 px-4 h-11 rounded-input text-white font-semibold text-[14px] press transition ${className}`}
    style={{ background: '#25D366', boxShadow: '0 6px 16px rgba(37,211,102,0.30)' }}
    {...rest}
  >
    <Icon.WhatsApp size={16} />
    {children}
  </button>
);

// Progress bar with auto color thresholds.
const Progress = ({ value, height = 6, className = '' }) => {
  const v = Math.max(0, Math.min(100, value));
  let color = '#10B981';
  if (v >= 95) color = '#EF4444';
  else if (v >= 80) color = '#F97316';
  else if (v >= 50) color = '#F5C842';
  return (
    <div className={`w-full rounded-full bg-black/[0.06] overflow-hidden ${className}`} style={{ height }}>
      <div className="h-full rounded-full" style={{ width: v + '%', background: color, transition: 'width 700ms ease-out' }} />
    </div>
  );
};

const Avatar = ({ initials, size = 40, ring = false, color = '#FFE8B0', textColor = '#7A4B00' }) => (
  <div
    className={`relative inline-flex items-center justify-center font-black select-none ${ring ? '' : ''}`}
    style={{
      width: size, height: size, borderRadius: 999, background: color, color: textColor, fontSize: size * 0.4,
      boxShadow: ring ? '0 0 0 2.5px #F5C842, 0 2px 8px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.06)',
    }}
  >
    {initials}
  </div>
);

// Striped placeholder block (no fake imagery). Use for product / banner images.
const ImageSlot = ({ tint = '#F5E9C8', label, className = '', children, style }) => (
  <div
    className={`relative overflow-hidden ${className}`}
    style={{
      background: `repeating-linear-gradient(135deg, rgba(0,0,0,0.05) 0 8px, rgba(0,0,0,0) 8px 16px), ${tint}`,
      ...style,
    }}
  >
    {children}
    {label && (
      <div className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md bg-white/85 backdrop-blur text-[10px] font-mono uppercase tracking-wide text-ink2">
        {label}
      </div>
    )}
  </div>
);

const StatCard = ({ label, value, sub, trend, accent, gold }) => (
  <Card
    className={`p-4 sm:p-5 ${gold ? 'border-gold/40' : ''}`}
    hover
    style={gold ? { background: 'linear-gradient(135deg,#FFFDF4,#FFF3D0)', borderColor: 'rgba(245,200,66,0.35)' } : null}
  >
    <div className="text-[12px] font-semibold text-ink2 uppercase tracking-wide">{label}</div>
    <div className="mt-2 flex items-end gap-2">
      <div className={`text-[28px] sm:text-[32px] font-black leading-none ${gold ? 'text-gold-grad' : ''}`}>{value}</div>
      {trend && (
        <div className={`flex items-center gap-0.5 text-[12px] font-semibold mb-0.5 ${trend.dir === 'up' ? 'text-green' : 'text-danger'}`}>
          {trend.dir === 'up' ? <Icon.ArrowUp size={12} /> : <Icon.ArrowDown size={12} />}
          {trend.value}
        </div>
      )}
    </div>
    {sub && <div className="mt-1 text-[12.5px] text-ink2">{sub}</div>}
    {accent}
  </Card>
);

// Sticky chip rail (mobile)
const Chip = ({ active, children, onClick, gold, count }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap transition press ${
      active
        ? (gold ? 'bg-gold text-ink shadow-gold' : 'bg-ink text-white')
        : 'bg-white text-ink2 border border-black/[0.08] hover:bg-canvas'
    }`}
  >
    {children}
    {typeof count === 'number' && count > 0 && (
      <span className={`px-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold inline-flex items-center justify-center ${active ? 'bg-black/15 text-ink' : 'bg-ink/10 text-ink'}`}>
        {count}
      </span>
    )}
  </button>
);

const Field = ({ label, hint, children, right }) => (
  <label className="block">
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[12.5px] font-semibold text-ink2">{label}</span>
      {right}
    </div>
    {children}
    {hint && <div className="mt-1 text-[11.5px] text-muted">{hint}</div>}
  </label>
);

const Input = React.forwardRef(({ className = '', ...rest }, ref) => (
  <input
    ref={ref}
    className={`w-full h-11 px-3.5 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted focus-gold transition ${className}`}
    {...rest}
  />
));

const Textarea = ({ className = '', ...rest }) => (
  <textarea
    className={`w-full px-3.5 py-3 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink placeholder:text-muted focus-gold transition resize-y ${className}`}
    {...rest}
  />
);

const Select = ({ className = '', children, ...rest }) => (
  <div className="relative">
    <select
      className={`w-full h-11 pl-3.5 pr-9 rounded-input bg-white border border-black/[0.10] text-[14px] text-ink focus-gold appearance-none transition ${className}`}
      {...rest}
    >{children}</select>
    <Icon.ChevronDn size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink2" />
  </div>
);

const Toggle = ({ on, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    aria-pressed={on}
    className={`relative w-10 h-6 rounded-full transition press ${on ? 'bg-gold' : 'bg-black/[0.15]'}`}
  >
    <span
      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition"
      style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
    />
  </button>
);

// ───────── src/sidebar.jsx ─────────
const NAV = [
  { id: 'overview',    label: 'Vue d\'ensemble',  icon: 'Grid' },
  { id: 'products',    label: 'Inventaire',       icon: 'Box',    badgeKey: 'products' },
  { id: 'analytics',   label: 'Analytiques',      icon: 'Chart' },
  { id: 'boost',       label: 'Booster',          icon: 'Bolt',   accent: 'purple' },
  { id: 'requests',    label: 'Demandes clients', icon: 'Cart',   gold: true, badgeKey: 'requests' },
  { id: 'shop',        label: 'Ma boutique',      icon: 'Palette' },
  { id: 'verification',label: 'Vérification',     icon: 'Shield' },
];

const Logomark = () => (
  <div className="flex items-center gap-2.5">
    <div
      className="w-9 h-9 rounded-[10px] flex items-center justify-center font-black text-[18px] text-white"
      style={{
        background: 'linear-gradient(135deg,#F5C842 0%, #E8A800 55%, #B07410 100%)',
        boxShadow: '0 4px 14px rgba(245,200,66,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
        letterSpacing: '-0.04em',
      }}
    >N</div>
    <div className="leading-tight">
      <div className="text-[15px] font-black tracking-tight">NUNULIA</div>
      <div className="text-[10.5px] font-semibold text-ink2 -mt-0.5 tracking-[0.14em] uppercase">Espace Vendeur</div>
    </div>
  </div>
);

const NavItem = ({ item, active, onClick, badges }) => {
  const IconCmp = Icon[item.icon] || Icon.Grid;
  const isCTA = item.id === 'add_product';
  const isGold = !!item.gold;
  const isPurple = item.accent === 'purple';
  const badge = item.badgeKey ? badges[item.badgeKey] : null;

  let cls = 'group flex items-center gap-3 px-3 h-11 rounded-[12px] text-[13.5px] font-semibold transition press w-full text-left ';
  let style = null;
  if (active) {
    if (isPurple) { cls += 'bg-purple/10 text-purple'; }
    else {
      cls += 'text-ink';
      style = { background: '#F5C842', boxShadow: '0 4px 14px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.4)' };
    }
  } else if (isGold) {
    cls += 'text-goldDeep';
    style = { background: 'linear-gradient(135deg, rgba(245,200,66,0.10), rgba(245,200,66,0.04))', border: '1px solid rgba(245,200,66,0.25)' };
  } else if (isPurple) {
    cls += 'text-purple hover:bg-purple/10';
  } else {
    cls += 'text-ink2 hover:bg-[rgba(245,200,66,0.08)] hover:text-ink';
  }

  return (
    <button onClick={onClick} className={cls} style={style}>
      <span className={`shrink-0 ${active && !isPurple ? 'text-ink' : ''}`}>
        <IconCmp size={18} />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span
          className={`px-1.5 min-w-[20px] h-[20px] rounded-full text-[11px] font-bold inline-flex items-center justify-center ${
            active ? 'bg-black/15 text-ink' : (isGold ? 'bg-gold text-ink' : 'bg-ink/10 text-ink')
          }`}
        >{badge}</span>
      )}
    </button>
  );
};

const Sidebar = ({ activeTab, setActiveTab }) => {
  const badges = {
    products: myProducts.length,
    requests: requestStats.todayCount,
  };
  const { tier, tierMax, used, daysRemaining } = subscriptionState;
  const pct = (used / tierMax) * 100;

  return (
    <aside className="hidden md:flex flex-col w-[256px] shrink-0 h-screen sticky top-0 bg-white border-r border-black/[0.06]">
      <div className="px-5 pt-5 pb-4">
        <Logomark />
      </div>

      <nav className="px-3 flex-1 overflow-y-auto sidebar-scroll">
        <div className="flex flex-col gap-1">
          {NAV.map((it) => (
            <NavItem key={it.id} item={it} active={activeTab === it.id} onClick={() => setActiveTab(it.id)} badges={badges} />
          ))}
        </div>

        <div className="mt-4 mb-3 px-3 text-[10.5px] font-bold text-muted uppercase tracking-[0.14em]">Action</div>
        <button
          onClick={() => setActiveTab('add_product')}
          className="w-full flex items-center gap-2.5 px-3 h-11 rounded-[12px] text-[13.5px] font-semibold press transition"
          style={{
            background: activeTab === 'add_product' ? '#E8A800' : '#F5C842',
            color: '#111318',
            boxShadow: '0 6px 16px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          <Icon.Plus size={18} />
          Ajouter un article
        </button>
      </nav>

      <div className="p-3 border-t border-black/[0.06]">
        <Card className="p-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              {tierBadge(tier)}
              <span className="text-[11px] text-ink2 font-semibold">{daysRemaining} j restants</span>
            </div>
            <span className="text-[12px] font-black tabular-nums">{used}<span className="text-ink2 font-semibold">/{tierMax}</span></span>
          </div>
          <Progress value={pct} />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] text-ink2 font-medium">{tierMax - used} produits libres</span>
            <button className="text-[11.5px] font-bold text-gold-grad press">Améliorer</button>
          </div>
        </Card>
        <button className="mt-3 w-full h-10 rounded-input text-[13px] font-semibold text-ink2 hover:bg-canvas press inline-flex items-center justify-center gap-1.5">
          <Icon.ArrowRight size={14} className="rotate-180" />
          Retour au site
        </button>
      </div>
    </aside>
  );
};

// ───────── src/tab-overview.jsx ─────────
const OverviewTab = ({ setActiveTab }) => {
  const u = currentUser;
  const s = u.sellerDetails;
  const sub = subscriptionState;
  const subPct = (sub.used / sub.tierMax) * 100;

  return (
    <div className="space-y-5 animate-fadein">
      {/* HERO */}
      <Card
        className="overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,#FFFDF4 0%, #FFF8E1 50%, #FFFFFF 100%)',
          borderColor: 'rgba(245,200,66,0.25)',
        }}
      >
        <div className="p-5 sm:p-7">
          <div className="flex flex-col md:flex-row md:items-start gap-5 md:gap-6">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <Avatar initials="BK" size={56} ring color="#FFE8B0" textColor="#7A4B00" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight leading-tight">{s.shopName}</h1>
                  {u.isVerified && (
                    <span className="inline-flex items-center gap-1 px-1.5 h-[22px] rounded-full bg-green/10 text-green text-[11.5px] font-semibold">
                      <Icon.Check size={11} /> Vérifié
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <Badge bg="#FFFFFF" color="#5C6370" className="border border-black/[0.07]">🏪 Boutique</Badge>
                  <span className="text-[12.5px] text-ink2 inline-flex items-center gap-1">
                    <Icon.Pin size={12} /> {s.commune}, {s.province}
                  </span>
                </div>
                <p className="mt-2 text-[13.5px] text-ink2 leading-relaxed max-w-[48ch]">
                  Bonjour <span className="font-semibold text-ink">{u.name.split(' ')[0]}</span> — voici l'état de votre boutique aujourd'hui.
                </p>
              </div>
            </div>

            {/* Subscription mini card */}
            <Card className="p-4 w-full md:w-[300px] shrink-0" style={{ background: 'rgba(255,255,255,0.85)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {tierBadge(sub.tier)}
                  <span className="text-[12px] font-semibold text-ink2">Plan actuel</span>
                </div>
                <span className="text-[11.5px] font-bold text-ink2">{sub.daysRemaining} j</span>
              </div>
              <div className="flex items-end gap-2">
                <div className="text-[22px] font-black tabular-nums leading-none">{sub.used}<span className="text-ink2 font-semibold">/{sub.tierMax}</span></div>
                <div className="text-[11.5px] text-ink2 mb-0.5">produits</div>
              </div>
              <div className="mt-2"><Progress value={subPct} /></div>
              <button className="mt-3 w-full h-9 rounded-input bg-ink text-white text-[12.5px] font-semibold press hover:bg-black inline-flex items-center justify-center gap-1.5">
                Renouveler <Icon.ArrowRight size={12} />
              </button>
            </Card>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <GoldButton icon={<Icon.Plus size={16} />} onClick={() => setActiveTab('add_product')}>Ajouter un article</GoldButton>
            <GhostButton icon={<Icon.Palette size={16} />} onClick={() => setActiveTab('shop')}>Modifier ma boutique</GhostButton>
          </div>
        </div>
      </Card>

      {/* OFFLINE QUEUE ALERT */}
      {offlineQueue.count > 0 && (
        <Card
          className="overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,#FFF7E6 0%, #FFEFD2 100%)',
            borderColor: 'rgba(217,119,6,0.25)',
          }}
        >
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0" style={{ color: '#B45309' }}>
                <Icon.Upload size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[14px] font-black text-amber-900">{offlineQueue.count} brouillons en file d'attente</div>
                    <div className="text-[12.5px] text-amber-800/80 mt-0.5">Ils seront publiés automatiquement dès que la connexion sera stable.</div>
                  </div>
                  <GoldButton icon={<Icon.Refresh size={14} />}>Synchroniser</GoldButton>
                </div>
                <div className="mt-3 space-y-2.5">
                  {offlineQueue.drafts.map((d) => (
                    <div key={d.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12.5px] font-semibold text-amber-900 truncate">{d.title}</span>
                        <span className="text-[11.5px] font-bold text-amber-800 tabular-nums">{d.progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-200/70 overflow-hidden">
                        <div className="h-full" style={{ width: d.progress + '%', background: '#D97706', transition: 'width 700ms ease-out' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* STAT GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard label="Produits actifs" value="9" sub="sur 12 publiés" trend={{ dir: 'up', value: '+2' }} />
        <StatCard label="Vues ce mois" value="847" sub="30 derniers jours" trend={{ dir: 'up', value: '+34%' }} />
        <StatCard
          label="Plan actuel"
          value="Pro"
          sub={`${sub.daysRemaining} jours restants`}
          accent={<div className="mt-3"><Progress value={subPct} /></div>}
        />
        <StatCard label="Demandes clients" value="3" sub="aujourd'hui" trend={{ dir: 'up', value: '+1' }} gold />
      </div>

      {/* DEMANDES CLIENTS feature card */}
      <Card
        className="overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,#FFFDF4 0%, #FFF3D0 100%)',
          borderColor: 'rgba(245,200,66,0.30)',
        }}
      >
        <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                 style={{ background: 'rgba(245,200,66,0.20)', color: '#92400E' }}>
              <Icon.Star size={11} /> Opportunité
            </div>
            <h3 className="mt-2 text-[20px] sm:text-[22px] font-black tracking-tight leading-snug">
              <span className="text-gold-grad">3 nouvelles demandes</span> clients aujourd'hui
            </h3>
            <p className="mt-1.5 text-[13.5px] text-ink2 max-w-[56ch]">
              Des acheteurs cherchent exactement ce que vous vendez. Répondez avant la concurrence.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex -space-x-2">
                {['#FFE8B0','#FAD2C8','#D9E8D2'].map((c, i) => (
                  <div key={i} className="w-7 h-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-black text-ink2 backdrop-blur"
                       style={{ background: c, filter: 'blur(0.3px)' }}>
                    {['JB','MK','AC'][i]}
                  </div>
                ))}
              </div>
              <span className="text-[12px] text-ink2 font-medium">+ 14 demandes satisfaites ce mois</span>
            </div>
          </div>
          <GoldButton icon={<Icon.ArrowRight size={16} />} onClick={() => setActiveTab('requests')} className="w-full md:w-auto md:px-5">
            Voir les demandes
          </GoldButton>
        </div>
      </Card>

      {/* QUICK ACTIONS strip */}
      <div>
        <SectionTitle sub="Raccourcis vers les actions les plus fréquentes">Actions rapides</SectionTitle>
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {[
            { id: 'a1', label: 'Ajouter un article', sub: 'Mettre en ligne', tone: 'gold', icon: 'Plus', onClick: () => setActiveTab('add_product') },
            { id: 'a2', label: 'Booster un produit',  sub: 'Visibilité ×3', tone: 'purple', icon: 'Bolt', onClick: () => setActiveTab('boost') },
            { id: 'a3', label: 'Voir ma boutique',    sub: 'Aperçu public', tone: 'green', icon: 'Eye', onClick: () => setActiveTab('shop') },
            { id: 'a4', label: 'Support WhatsApp',    sub: 'Réponse < 1 h', tone: 'wa', icon: 'WhatsApp', onClick: () => {} },
          ].map((a) => {
            const I = Icon[a.icon];
            const palette = {
              gold:   { bg: 'linear-gradient(135deg,#FFF8E1,#FFFDF4)', border: 'rgba(245,200,66,0.3)', dot: '#F5C842', ico: '#92400E' },
              purple: { bg: 'linear-gradient(135deg,rgba(139,92,246,0.10),#FFFFFF)', border: 'rgba(139,92,246,0.25)', dot: '#8B5CF6', ico: '#5B21B6' },
              green:  { bg: 'linear-gradient(135deg,rgba(16,185,129,0.08),#FFFFFF)', border: 'rgba(16,185,129,0.22)', dot: '#10B981', ico: '#065F46' },
              wa:     { bg: 'linear-gradient(135deg,rgba(37,211,102,0.10),#FFFFFF)', border: 'rgba(37,211,102,0.30)', dot: '#25D366', ico: '#065F46' },
            }[a.tone];
            return (
              <button
                key={a.id}
                onClick={a.onClick}
                className="lift shrink-0 w-[240px] text-left rounded-card border p-4 press"
                style={{ background: palette.bg, borderColor: palette.border }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/85 shadow-sm" style={{ color: palette.ico }}>
                    <I size={16} />
                  </div>
                  <Icon.ArrowRight size={16} className="ml-auto text-ink2" />
                </div>
                <div className="mt-3 text-[14.5px] font-black text-ink">{a.label}</div>
                <div className="text-[12px] text-ink2 font-medium mt-0.5">{a.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RECENT ACTIVITY split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <Card className="p-5 md:col-span-2" hover>
          <SectionTitle sub="Les pics de vues correspondent aux articles boostés.">Activité — 7 derniers jours</SectionTitle>
          <div className="h-[140px] flex items-end gap-1.5">
            {analyticsData.slice(-14).map((d, i) => {
              const max = 100;
              const h = (d.views / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                  <div className="w-full rounded-t-[6px] bar" style={{ height: h + '%', background: 'linear-gradient(180deg,#F5C842,#E8A800)' }} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted font-medium">
            <span>il y a 14 j</span>
            <span>aujourd'hui</span>
          </div>
        </Card>
        <Card className="p-5" hover>
          <SectionTitle sub="Vos plus performants ce mois">Top produits</SectionTitle>
          <div className="space-y-2.5">
            {topProducts.slice(0, 4).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <ImageSlot tint={p.color} className="w-10 h-10 rounded-[10px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">{p.title}</div>
                  <div className="text-[11.5px] text-ink2">{fmtNum(p.views)} vues</div>
                </div>
                {i === 0 ? <Icon.Crown size={16} className="text-gold" /> : <span className="text-[11px] font-bold text-muted">#{i+1}</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Network footer */}
      <div className="flex items-center justify-center gap-2 text-[11.5px] text-muted pt-1 pb-2">
        <span className="inline-flex items-center gap-1.5">
          <Icon.Wifi size={12} />
          {networkQuality === 'slow' ? 'Réseau lent — compression d\'image activée' : 'Connecté'}
        </span>
        <span>·</span>
        <span>Mise à jour il y a 4 min</span>
      </div>
    </div>
  );
};

// ───────── src/tab-products.jsx ─────────
const ProductsTab = ({ setActiveTab }) => {
  const [filter, setFilter] = React.useState('all');
  const [bulkMode, setBulkMode] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const [openMenu, setOpenMenu] = React.useState(null);
  const [editingId, setEditingId] = React.useState('p5'); // rejected card pre-opens for demo

  const filters = [
    { id: 'all', label: 'Tous', count: myProducts.length },
    { id: 'active', label: 'Actifs', count: myProducts.filter(p => p.status === 'active').length },
    { id: 'pending', label: 'En attente', count: myProducts.filter(p => p.status === 'pending').length },
    { id: 'rejected', label: 'Refusés', count: myProducts.filter(p => p.status === 'rejected').length },
    { id: 'draft', label: 'Brouillons', count: myProducts.filter(p => p.status === 'draft').length },
  ];

  const filtered = filter === 'all' ? myProducts : myProducts.filter(p => p.status === filter);

  const toggleSel = (id) => {
    const ns = new Set(selected);
    ns.has(id) ? ns.delete(id) : ns.add(id);
    setSelected(ns);
  };

  return (
    <div className="space-y-4 animate-fadein">
      {/* Sticky sub-header */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-canvas/85 backdrop-blur border-b border-black/[0.05]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-black tracking-tight">Mes produits <span className="text-ink2 font-bold">({myProducts.length})</span></h1>
            <div className="text-[12px] text-muted mt-0.5">Données du 22/05 14:32 · Cache local</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-input text-[12.5px] font-semibold border transition press ${
                bulkMode ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-black/[0.08] hover:bg-canvas'
              }`}
            >
              <Icon.Check size={14} /> Sélection multiple
            </button>
            {bulkMode && selected.size > 0 && (
              <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-input bg-danger text-white text-[12.5px] font-bold press hover:brightness-110">
                <Icon.Trash size={14} /> Supprimer ({selected.size})
              </button>
            )}
            <GoldButton icon={<Icon.Plus size={16} />} onClick={() => setActiveTab('add_product')} className="hidden sm:inline-flex">
              Ajouter
            </GoldButton>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {filters.map(f => (
            <Chip key={f.id} active={filter === f.id} count={f.count} onClick={() => setFilter(f.id)}>{f.label}</Chip>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-canvas flex items-center justify-center text-ink2 mb-3"><Icon.Box size={28} /></div>
            <div className="text-[16px] font-black">Votre inventaire est vide</div>
            <div className="text-[13px] text-ink2 mt-1">Ajoutez votre premier produit pour commencer à vendre.</div>
            <GoldButton icon={<Icon.Plus size={16} />} className="mt-4 mx-auto" onClick={() => setActiveTab('add_product')}>Ajouter votre premier produit</GoldButton>
          </Card>
        ) : filtered.map((p) => {
          const isEditing = editingId === p.id && p.status === 'rejected';
          return (
            <Card key={p.id} className="overflow-hidden" hover>
              <div className="p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
                {bulkMode && (
                  <button onClick={() => toggleSel(p.id)} className={`mt-2 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${selected.has(p.id) ? 'bg-gold border-gold' : 'border-black/20 bg-white'}`}>
                    {selected.has(p.id) && <Icon.Check size={12} />}
                  </button>
                )}
                <ImageSlot tint={p.images[0]} className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-[12px] shrink-0" label={p.subCategory.slice(0,4).toUpperCase()} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-ink leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.title}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[16px] font-black text-gold-grad tabular-nums">{fmtPrice(p.price, p.currency)}</span>
                        <span className="inline-flex items-center px-2 h-[20px] rounded-full bg-canvas text-[11px] font-semibold text-ink2">{p.category}</span>
                        {p.status === 'active' && <span className="text-[11.5px] text-ink2 inline-flex items-center gap-1"><Icon.Eye size={11} /> {fmtNum(p.views)} vues</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(p.status)}
                      <div className="relative">
                        <button onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)} className="w-8 h-8 rounded-full hover:bg-canvas inline-flex items-center justify-center text-ink2 press">
                          <Icon.Dots size={18} />
                        </button>
                        {openMenu === p.id && (
                          <div className="absolute right-0 top-9 z-20 w-48 bg-white rounded-input border border-black/[0.08] shadow-cardHover py-1">
                            {[
                              { l: 'Modifier', i: 'Edit' },
                              { l: 'Booster', i: 'Bolt' },
                              { l: 'Voir public', i: 'Eye' },
                              { l: 'Supprimer', i: 'Trash', danger: true },
                            ].map(o => {
                              const I = Icon[o.i];
                              return (
                                <button key={o.l} className={`w-full text-left px-3 py-2 text-[13px] font-medium flex items-center gap-2 hover:bg-canvas ${o.danger ? 'text-danger' : 'text-ink'}`}>
                                  <I size={14} /> {o.l}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {p.status === 'rejected' && !isEditing && (
                    <div className="mt-2.5 flex items-center justify-between gap-3 px-3 py-2 rounded-[10px]" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <div className="text-[12.5px] text-danger">
                        <span className="font-bold">Refusé:</span> {p.rejectReason}
                      </div>
                      <button onClick={() => setEditingId(p.id)} className="shrink-0 inline-flex items-center gap-1 px-2.5 h-8 rounded-input bg-gold text-ink text-[12px] font-bold press">
                        Modifier & Renvoyer <Icon.ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline rejected edit form */}
              {isEditing && (
                <div className="border-t border-black/[0.06] bg-canvas/50 p-4 sm:p-5 animate-fadein">
                  <div className="text-[12.5px] font-bold text-danger uppercase tracking-wider mb-3">⚠ Refusé — corrigez et renvoyez</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Titre"><Input defaultValue={p.title} /></Field>
                    <Field label="Prix"><Input defaultValue={p.price} /></Field>
                    <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} defaultValue="Bague artisanale en cuivre poli, anneau ajustable." /></Field></div>
                    <div className="sm:col-span-2">
                      <Field label="Photos (4 minimum)">
                        <div className="grid grid-cols-4 gap-2">
                          {[0,1,2,3].map(i => <ImageSlot key={i} tint={i < 2 ? p.images[0] : '#F4F5F7'} className="aspect-square rounded-[10px]" />)}
                        </div>
                      </Field>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <GhostButton onClick={() => setEditingId(null)}>Annuler</GhostButton>
                    <GoldButton icon={<Icon.Upload size={14} />}>Renvoyer pour examen</GoldButton>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ───────── src/tab-add-product.jsx ─────────
const AddProductTab = () => {
  const [title, setTitle] = React.useState('Collier en cuivre tressé — pièce unique');
  const [price, setPrice] = React.useState('38000');
  const [origPrice, setOrigPrice] = React.useState('45000');
  const [currency, setCurrency] = React.useState('BIF');
  const [category, setCategory] = React.useState('bijoux');
  const [subCategory, setSubCategory] = React.useState('Colliers');
  const [desc, setDesc] = React.useState('Collier artisanal en cuivre tressé à la main, pièce unique. Anneau ajustable, fermoir mousqueton plaqué or. Idéal cadeau.');
  const [wholesale, setWholesale] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  const cat = categories.find(c => c.id === category);
  const discount = origPrice && price ? Math.round(((+origPrice - +price) / +origPrice) * 100) : 0;
  const score = productScore;
  const scoreColor = score.score >= 80 ? '#10B981' : score.score >= 60 ? '#F5C842' : '#F97316';

  const photos = ['#FFE8B0','#FAD2C8','#D6E4DD', null, null];

  return (
    <div className="animate-fadein">
      <div className="mb-4">
        <h1 className="text-[24px] font-black tracking-tight">Ajouter un article</h1>
        <div className="text-[13px] text-ink2 mt-1">Renseignez votre annonce. Elle sera publiée dès validation.</div>
      </div>

      {networkQuality === 'slow' && (
        <Card className="mb-4 p-3.5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FFF7E6,#FFFFFF)', borderColor: 'rgba(217,119,6,0.25)' }}>
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
            <Icon.Wifi size={16} />
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-bold text-amber-900">Réseau lent détecté</div>
            <div className="text-[12px] text-amber-800/80">Compression d'image automatique activée — vos photos seront optimisées pour 2G/3G.</div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* LEFT — FORM */}
        <div className="space-y-4">
          {/* PHOTOS */}
          <Card className="p-5">
            <SectionTitle sub="4 photos minimum · Premier plan = miniature">Photos</SectionTitle>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
              className={`rounded-card p-4 transition ${dragOver ? 'animate-pulseRing' : ''}`}
              style={{ border: `2px dashed ${dragOver ? '#F5C842' : 'rgba(245,200,66,0.4)'}`, background: dragOver ? 'rgba(245,200,66,0.06)' : 'rgba(245,200,66,0.03)' }}
            >
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                {photos.map((p, i) => p ? (
                  <div key={i} className="relative group">
                    <ImageSlot tint={p} className={`aspect-square rounded-[12px] ${i === 0 ? 'ring-2 ring-gold' : ''}`} label={i === 0 ? 'PRINCIPAL' : null} />
                    <button className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-ink2 hover:text-danger press">
                      <Icon.X size={12} />
                    </button>
                  </div>
                ) : (
                  <button key={i} className="aspect-square rounded-[12px] flex flex-col items-center justify-center gap-1 text-ink2 hover:text-gold hover:bg-white press transition" style={{ border: '2px dashed rgba(0,0,0,0.10)' }}>
                    <Icon.Plus size={18} />
                    <span className="text-[10.5px] font-semibold">Ajouter</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink2">
                  <Icon.Sparkle size={12} className="text-gold" />
                  Compression intelligente — économise jusqu'à 70% de data
                </span>
                <span className="text-[11.5px] font-bold text-ink">3 / 10 photos</span>
              </div>
            </div>
          </Card>

          {/* INFOS */}
          <Card className="p-5 space-y-4">
            <SectionTitle>Informations produit</SectionTitle>

            <Field
              label="Titre de l'annonce"
              right={
                <button className="inline-flex items-center gap-1 text-[11.5px] font-bold text-gold-grad press">
                  <Icon.Sparkle size={11} /> Suggérer avec IA
                </button>
              }
            >
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Collier en cuivre tressé" maxLength={80} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted"><span>Soyez descriptif et précis</span><span className="tabular-nums">{title.length}/80</span></div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Prix" hint={discount > 0 ? `${discount}% de remise affichée` : null}>
                <div className="flex gap-2">
                  <Input value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1" placeholder="0" inputMode="numeric" />
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-[120px]">
                    <option value="BIF">🇧🇮 BIF</option>
                    <option value="RWF">🇷🇼 RWF</option>
                    <option value="CDF">🇨🇩 CDF</option>
                    <option value="USD">🇺🇸 USD</option>
                  </Select>
                </div>
              </Field>
              <Field label="Prix d'origine (optionnel)" hint="Pour afficher une remise">
                <Input value={origPrice} onChange={(e) => setOrigPrice(e.target.value)} placeholder="0" inputMode="numeric" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Catégorie">
                <Select value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory(categories.find(c => c.id === e.target.value).sub[0]); }}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label="Sous-catégorie">
                <Select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
                  {cat.sub.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          {/* DESC */}
          <Card className="p-5">
            <SectionTitle
              right={
                <button className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-[11.5px] font-bold text-goldDeep press" style={{ background: 'rgba(245,200,66,0.15)' }}>
                  <Icon.Sparkle size={12} /> Générer avec IA
                </button>
              }
            >Description</SectionTitle>
            <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Matière, taille, couleurs, état..." />
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted"><span>Conseil: mentionnez matière, dimensions, état.</span><span className="tabular-nums">{desc.length} caractères</span></div>
          </Card>

          {/* ADVANCED */}
          <Card className="overflow-hidden">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between p-5 press">
              <div className="text-left">
                <div className="text-[15px] font-black">Options avancées</div>
                <div className="text-[12px] text-ink2">Vente en gros, lots, livraison</div>
              </div>
              <Icon.ChevronDn size={18} className={`transition ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && (
              <div className="px-5 pb-5 space-y-4 animate-fadein">
                <div className="flex items-center justify-between p-3 rounded-input bg-canvas">
                  <div>
                    <div className="text-[13.5px] font-semibold">Vente grossiste</div>
                    <div className="text-[12px] text-ink2">Activez si vous vendez en lots</div>
                  </div>
                  <Toggle on={wholesale} onChange={setWholesale} />
                </div>
                {wholesale && (
                  <div className="grid grid-cols-2 gap-3 animate-fadein">
                    <Field label="Quantité minimum"><Input placeholder="10" inputMode="numeric" /></Field>
                    <Field label="Prix grossiste / pièce"><Input placeholder="30000" inputMode="numeric" /></Field>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* QUALITY SCORE */}
          <Card className="p-5">
            <SectionTitle sub="Plus le score est haut, plus votre annonce est mise en avant.">Score qualité</SectionTitle>
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[40px] font-black leading-none tabular-nums" style={{ color: scoreColor }}>{score.score}</div>
                <div className="text-[11.5px] text-ink2 mt-1 font-semibold">sur 100</div>
              </div>
              <div className="text-right">
                <div className="text-[12.5px] font-bold text-ink">Améliorez votre annonce</div>
                <div className="text-[11.5px] text-ink2">{score.tips.length} conseils</div>
              </div>
            </div>
            <div className="flex gap-1.5 mb-4">
              {[0,1,2,3,4].map(i => {
                const segVal = (i+1) * 20;
                const filled = score.score >= segVal - 10;
                return <div key={i} className="flex-1 h-2 rounded-full" style={{ background: filled ? scoreColor : '#EEF0F4', transition: 'background 700ms ease' }} />;
              })}
            </div>
            <ul className="space-y-2">
              {score.tips.map((t, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-canvas text-ink2 inline-flex items-center justify-center text-[11px] font-bold shrink-0">{i+1}</span>
                  <span className="text-[12.5px] text-ink2 leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* SUBMIT */}
          <div className="hidden lg:flex items-center justify-end gap-3 pt-2">
            <GhostButton>Sauvegarder brouillon</GhostButton>
            <GoldButton icon={<Icon.Upload size={16} />} className="px-6">Publier l'article</GoldButton>
          </div>
          <div className="hidden lg:block text-right text-[11.5px] text-muted">Sauvegardé localement — sera publié dès connexion rétablie</div>
        </div>

        {/* RIGHT — LIVE PREVIEW */}
        <div className="hidden lg:block">
          <div className="sticky top-5">
            <div className="text-[11px] font-bold text-muted uppercase tracking-[0.14em] mb-2 px-1">Aperçu en direct</div>
            <div className="mx-auto" style={{ width: 320 }}>
              <div className="rounded-[36px] p-3 bg-ink shadow-cardHover" style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.25), 0 0 0 8px rgba(0,0,0,0.04)' }}>
                <div className="bg-canvas rounded-[26px] overflow-hidden">
                  <div className="h-7 flex items-center justify-center">
                    <div className="w-20 h-1.5 rounded-full bg-black/60" />
                  </div>
                  <div className="px-3 pb-4">
                    <ImageSlot tint={photos[0]} className="w-full aspect-square rounded-[16px]" label="PHOTO 1/3" />
                    <div className="mt-3 flex items-center gap-1.5">
                      {photos.slice(1,4).map((p,i) => p ? <ImageSlot key={i} tint={p} className="w-12 h-12 rounded-[8px]" /> : <div key={i} className="w-12 h-12 rounded-[8px] bg-black/[0.05]" />)}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Badge bg="#FFF" color="#5C6370" className="border border-black/[0.06]">{cat.label} · {subCategory}</Badge>
                      {discount > 0 && <Badge bg="rgba(239,68,68,0.10)" color="#EF4444">-{discount}%</Badge>}
                    </div>
                    <div className="mt-2 text-[15px] font-black leading-snug text-ink" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title || 'Titre du produit'}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[18px] font-black text-gold-grad tabular-nums">{fmtPrice(+price || 0, currency)}</span>
                      {discount > 0 && <span className="text-[12px] text-muted line-through tabular-nums">{fmtPrice(+origPrice || 0, currency)}</span>}
                    </div>
                    <div className="mt-2 text-[11.5px] text-ink2 leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc}</div>
                    <div className="mt-3 flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                      <Avatar initials="BK" size={28} color="#FFE8B0" textColor="#7A4B00" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold truncate">Bijoux Kigali</div>
                        <div className="text-[10.5px] text-ink2 inline-flex items-center gap-1"><Icon.Check size={10} className="text-green" /> Vérifié</div>
                      </div>
                      <button className="h-8 px-3 rounded-input text-white text-[11.5px] font-bold inline-flex items-center gap-1" style={{ background: '#25D366' }}>
                        <Icon.WhatsApp size={12} /> Contacter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-center text-[11px] text-muted">Aperçu acheteur</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky submit */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0">
        <div className="bg-white rounded-card border border-black/[0.07] shadow-cardHover p-2.5">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="text-[11.5px] font-bold text-ink2">Score: <span style={{ color: scoreColor }}>{score.score}/100</span></div>
            <div className="text-[11.5px] text-muted">Brouillon auto-enregistré</div>
          </div>
          <GoldButton icon={<Icon.Upload size={16} />} className="w-full h-12">Publier l'article</GoldButton>
        </div>
      </div>
    </div>
  );
};

// ───────── src/tab-analytics.jsx ─────────
const AnalyticsTab = () => {
  const [range, setRange] = React.useState('30j');
  const [hover, setHover] = React.useState(null);

  const maxView = Math.max(...analyticsData.map(d => d.views));
  const total = analyticsData.reduce((a, d) => a + d.views, 0);
  const peak = analyticsData.reduce((a, d) => d.views > a.views ? d : a, analyticsData[0]);
  const fmtDate = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-5 animate-fadein">
      <div>
        <h1 className="text-[24px] font-black tracking-tight">Analytiques</h1>
        <div className="text-[13px] text-ink2 mt-1">Performance de votre boutique sur les 30 derniers jours.</div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
        <StatCard label="Total vues (30 j)" value={fmtNum(total)} sub="Tous produits confondus" trend={{ dir: 'up', value: '+34%' }} />
        <StatCard label="Pic de vues" value={fmtNum(peak.views)} sub={`le ${fmtDate(peak.date)}`} />
        <StatCard label="Produit le plus vu" value="Sac wax bleu" sub={`${fmtNum(211)} vues`} />
      </div>

      {/* Chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-black tracking-tight">Vues — 30 derniers jours</h2>
            <div className="text-[12px] text-ink2 mt-0.5">Survolez les barres pour le détail journalier</div>
          </div>
          <div className="inline-flex items-center bg-canvas rounded-input p-0.5">
            {['7j', '30j', '90j'].map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 h-8 rounded-[10px] text-[12px] font-bold transition ${range === r ? 'bg-white shadow-sm text-ink' : 'text-ink2'}`}>{r}</button>
            ))}
          </div>
        </div>

        <div className="relative h-[260px] pl-10">
          {/* Y-axis grid */}
          {[0, 25, 50, 75, 100].map((p, i) => (
            <div key={i} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${(p / 100) * 220 + 28}px` }}>
              <span className="w-9 text-right pr-2 text-[10.5px] text-muted font-medium tabular-nums">{Math.round((maxView * p) / 100)}</span>
              <div className="flex-1 h-px bg-black/[0.05]" />
            </div>
          ))}

          <div className="absolute left-10 right-0 bottom-7 top-0 flex items-end gap-[3px]">
            {analyticsData.map((d, i) => {
              const h = (d.views / maxView) * 100;
              const isHover = hover === i;
              return (
                <div
                  key={i}
                  className="flex-1 relative flex items-end justify-center group cursor-pointer h-full"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="w-full rounded-t-[5px] bar"
                    style={{
                      height: h + '%',
                      background: isHover
                        ? 'linear-gradient(180deg,#E8A800,#B07410)'
                        : 'linear-gradient(180deg,#F5C842,#E8A800)',
                      boxShadow: isHover ? '0 4px 12px rgba(245,200,66,0.45)' : 'none',
                    }}
                  />
                  {isHover && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-[8px] bg-ink text-white text-[11px] font-semibold whitespace-nowrap shadow-cardHover z-10">
                      <div className="text-gold font-black tabular-nums">{d.views} vues</div>
                      <div className="text-white/70">le {fmtDate(d.date)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* X-axis labels (every 5 days) */}
          <div className="absolute left-10 right-0 bottom-0 flex justify-between text-[10px] text-muted font-medium">
            {[0, 6, 13, 20, 27, 29].map(i => (
              <span key={i} className="tabular-nums">{fmtDate(analyticsData[i].date)}</span>
            ))}
          </div>
        </div>
      </Card>

      {/* Top products + Insight split */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-5 md:col-span-3" hover>
          <SectionTitle sub="Classement par nombre de vues sur 30 jours.">Top produits par vues</SectionTitle>
          <div className="space-y-1">
            {topProducts.map((p, i) => {
              const ratio = p.views / topProducts[0].views;
              return (
                <div key={p.id} className="grid grid-cols-[24px_44px_1fr_auto] items-center gap-3 py-2 border-b border-black/[0.04] last:border-b-0">
                  <div className="flex items-center justify-center">
                    {i === 0 ? <Icon.Crown size={18} className="text-gold" /> : <span className="text-[12px] font-black text-muted tabular-nums">#{i+1}</span>}
                  </div>
                  <ImageSlot tint={p.color} className="w-11 h-11 rounded-[10px]" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{p.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 rounded-full bg-black/[0.05] overflow-hidden flex-1 max-w-[200px]">
                        <div className="h-full" style={{ width: (ratio*100) + '%', background: 'linear-gradient(90deg,#F5C842,#E8A800)', transition: 'width 700ms ease-out' }} />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-black tabular-nums">{fmtNum(p.views)}</div>
                    <div className="text-[10.5px] text-ink2 font-medium uppercase tracking-wide">vues</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 md:col-span-2" style={{ background: 'linear-gradient(135deg,#FFFDF4,#FFFFFF)', borderColor: 'rgba(245,200,66,0.20)' }}>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(245,200,66,0.20)', color: '#92400E' }}>
            <Icon.Sparkle size={11} /> Insight NUNULIA
          </div>
          <h3 className="mt-2 text-[18px] font-black leading-snug">Vos sacs reçoivent <span className="text-gold-grad">2,7×</span> plus de vues que vos bijoux.</h3>
          <p className="mt-2 text-[12.5px] text-ink2 leading-relaxed">Ajoutez plus de pièces dans la catégorie <b>Mode → Sacs</b>, ou boostez ceux déjà en ligne pour capter cette demande.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <GoldButton className="h-10 text-[12.5px]">Ajouter un sac</GoldButton>
            <GhostButton className="h-10 text-[12.5px]" icon={<Icon.Bolt size={14} className="text-purple" />}>Booster</GhostButton>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ───────── src/tab-boost.jsx ─────────
const BoostTab = () => {
  const [openModal, setOpenModal] = React.useState(null);
  const eligible = myProducts.filter(p => p.status === 'active' && !boostRequests.some(b => b.productId === p.id));

  return (
    <div className="space-y-5 animate-fadein">
      {/* HERO */}
      <Card className="p-6 sm:p-7 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, #FFFFFF 60%)' }}>
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%)' }} />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 8px 24px rgba(139,92,246,0.40)' }}>
            <Icon.Bolt size={22} />
          </div>
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(139,92,246,0.12)', color: '#5B21B6' }}>Visibilité Premium</div>
            <h1 className="mt-2 text-[24px] sm:text-[28px] font-black tracking-tight leading-tight">Boostez votre visibilité</h1>
            <p className="mt-2 text-[13.5px] text-ink2 leading-relaxed max-w-[60ch]">
              Un produit boosté apparaît <b className="text-purple">en haut des résultats</b> de recherche pendant 7 jours et reçoit en moyenne <b className="text-purple">3× plus de vues</b>.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 max-w-[480px]">
              {[
                { v: '×3', l: 'Visibilité moyenne' },
                { v: '7 j', l: 'Durée du boost' },
                { v: '5 000', l: 'BIF / produit' },
              ].map((s, i) => (
                <div key={i} className="rounded-[12px] bg-white border border-black/[0.06] p-3">
                  <div className="text-[20px] font-black leading-none" style={{ color: '#7C3AED' }}>{s.v}</div>
                  <div className="text-[10.5px] text-ink2 font-semibold mt-1 uppercase tracking-wide">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ACTIVE BOOSTS */}
      <div>
        <SectionTitle sub="Vos campagnes en cours" right={<span className="text-[11.5px] font-bold text-ink2">{boostRequests.length} actifs</span>}>
          Boosts actifs
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {boostRequests.map(b => (
            <Card key={b.id} className="p-4 overflow-hidden relative" hover>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg,#A78BFA,#7C3AED)' }} />
              <div className="flex items-start gap-3 pt-2">
                <ImageSlot tint={b.color} className="w-16 h-16 rounded-[12px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13.5px] font-semibold leading-snug">{b.title}</div>
                    <Badge bg="rgba(16,185,129,0.10)" color="#10B981" dot>Actif</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div><div className="text-[10px] font-bold text-muted uppercase tracking-wide">Restant</div><div className="text-[13px] font-black tabular-nums">{b.expires}</div></div>
                    <div><div className="text-[10px] font-bold text-muted uppercase tracking-wide">Impressions</div><div className="text-[13px] font-black tabular-nums">{fmtNum(b.impressions)}</div></div>
                    <div><div className="text-[10px] font-bold text-muted uppercase tracking-wide">Hausse</div><div className="text-[13px] font-black" style={{ color: '#7C3AED' }}>{b.uplift}</div></div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* BOOST A PRODUCT */}
      <div>
        <SectionTitle sub="Sélectionnez un produit pour lancer une campagne de 7 jours.">Booster un produit</SectionTitle>
        <Card className="p-2">
          <div className="divide-y divide-black/[0.05]">
            {eligible.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <ImageSlot tint={p.images[0]} className="w-12 h-12 rounded-[10px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{p.title}</div>
                  <div className="text-[12px] text-ink2">{fmtPrice(p.price, p.currency)} · {fmtNum(p.views)} vues</div>
                </div>
                <button
                  onClick={() => setOpenModal(p)}
                  className="h-9 px-3.5 rounded-input text-white text-[12.5px] font-bold press inline-flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 4px 12px rgba(139,92,246,0.35)' }}
                >
                  <Icon.Bolt size={13} /> Booster
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {openModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 animate-fadein" style={{ background: 'rgba(15,15,20,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setOpenModal(null)}>
          <div className="bg-white rounded-modal w-full max-w-md shadow-cardHover overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 flex items-center gap-3 border-b border-black/[0.06]">
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)' }}><Icon.Bolt size={18} /></div>
              <div>
                <div className="text-[15px] font-black">Booster ce produit</div>
                <div className="text-[12px] text-ink2 truncate">{openModal.title}</div>
              </div>
              <button onClick={() => setOpenModal(null)} className="ml-auto w-8 h-8 rounded-full hover:bg-canvas inline-flex items-center justify-center"><Icon.X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { d: '7 jours',  p: '5 000',  hot: false },
                { d: '14 jours', p: '8 500',  hot: true },
                { d: '30 jours', p: '15 000', hot: false },
              ].map((o, i) => (
                <button key={i} className={`w-full flex items-center justify-between p-4 rounded-input border press transition ${o.hot ? 'border-purple bg-purple/[0.05]' : 'border-black/[0.08] hover:bg-canvas'}`}>
                  <div className="text-left">
                    <div className="text-[14px] font-black flex items-center gap-2">{o.d} {o.hot && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple text-white">RECOMMANDÉ</span>}</div>
                    <div className="text-[11.5px] text-ink2">Mise en avant continue · 7j/7</div>
                  </div>
                  <div className="text-[15px] font-black text-gold-grad tabular-nums">{o.p} BIF</div>
                </button>
              ))}
              <button className="w-full h-12 rounded-input text-white font-bold text-[14px] press inline-flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 8px 24px rgba(139,92,246,0.40)' }}>
                <Icon.Bolt size={16} /> Lancer le boost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ───────── src/tab-requests.jsx ─────────
const RequestsTab = () => {
  const [revealed, setRevealed] = React.useState(new Set());

  return (
    <div className="space-y-5 animate-fadein">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(245,200,66,0.18)', color: '#92400E' }}>
            <Icon.Star size={11} /> Opportunités acheteurs
          </div>
          <h1 className="mt-2 text-[24px] font-black tracking-tight">Demandes clients</h1>
          <div className="text-[13px] text-ink2 mt-1">Des acheteurs publient ce qu'ils cherchent. Répondez vite — la première offre l'emporte souvent.</div>
        </div>
      </div>

      {/* TOP STATS */}
      <Card className="p-5 overflow-hidden relative" style={{ background: 'linear-gradient(135deg,#FFFDF4 0%,#FFF8E1 100%)', borderColor: 'rgba(245,200,66,0.30)' }}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,200,66,0.25), transparent 70%)' }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
          <div>
            <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">Aujourd'hui</div>
            <div className="text-[40px] font-black leading-none text-gold-grad tabular-nums mt-1">{requestStats.todayCount}</div>
            <div className="text-[12px] text-ink2 mt-1 font-semibold">demandes ouvertes</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">Ce mois</div>
            <div className="text-[40px] font-black leading-none text-ink tabular-nums mt-1">{requestStats.fulfilledCount}</div>
            <div className="text-[12px] text-ink2 mt-1 font-semibold">demandes satisfaites</div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">Taux de réponse</div>
            <div className="text-[40px] font-black leading-none text-ink tabular-nums mt-1">87%</div>
            <div className="text-[12px] text-ink2 mt-1 font-semibold">vs 64% moyenne</div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider">Temps moyen</div>
            <div className="text-[40px] font-black leading-none text-ink tabular-nums mt-1">42<span className="text-[20px] text-ink2 font-bold">m</span></div>
            <div className="text-[12px] text-ink2 mt-1 font-semibold">jusqu'à la 1<sup>re</sup> réponse</div>
          </div>
        </div>
      </Card>

      {/* FILTER */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {['Toutes', 'Bijoux', 'Mode', 'Maison', 'Bujumbura', 'Kigali', 'Goma'].map((f, i) => (
          <Chip key={f} active={i === 0}>{f}</Chip>
        ))}
      </div>

      {/* REQUESTS LIST */}
      <div className="space-y-3.5">
        {buyerRequests.map((r) => {
          const isRevealed = revealed.has(r.id);
          return (
            <Card
              key={r.id}
              className="overflow-hidden relative"
              hover
              style={{
                background: r.locked ? '#FFFFFF' : 'linear-gradient(135deg,#FFFDF4 0%,#FFFFFF 70%)',
                borderColor: r.locked ? 'rgba(0,0,0,0.07)' : 'rgba(245,200,66,0.25)',
              }}
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <div className="relative shrink-0">
                    <Avatar initials={r.initials} size={44} color={r.locked ? '#EEF0F4' : '#FFE8B0'} textColor={r.locked ? '#9EA5B0' : '#7A4B00'} />
                    {r.locked && (
                      <div className="absolute inset-0 rounded-full backdrop-blur-[3px] flex items-center justify-center bg-white/30">
                        <Icon.Lock size={14} className="text-ink2" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-[14px] font-black">Acheteur anonyme · {r.category}</div>
                        <div className="text-[11.5px] text-ink2 mt-0.5 inline-flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1"><Icon.Pin size={11} /> {r.location}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1"><Icon.Clock size={11} /> {r.timeAgo}</span>
                        </div>
                      </div>
                      <Badge bg="rgba(245,200,66,0.15)" color="#92400E">💰 {r.budget}</Badge>
                    </div>
                    <p className={`mt-2.5 text-[13.5px] leading-relaxed ${r.locked ? 'text-ink2 select-none' : 'text-ink'}`} style={r.locked ? { filter: 'blur(3.5px)' } : null}>
                      {r.text}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-[11.5px] text-ink2 font-semibold">
                        {r.replies > 0 ? `${r.replies} vendeur${r.replies > 1 ? 's' : ''} ${r.replies > 1 ? 'ont' : 'a'} déjà répondu` : 'Soyez le premier à répondre'}
                      </div>
                      {!r.locked && (
                        isRevealed ? (
                          <a href={`https://wa.me/${currentUser.whatsapp.replace(/\s|\+/g, '')}`} className="inline-flex items-center gap-2 px-3.5 h-10 rounded-input text-white text-[13px] font-bold press" style={{ background: '#25D366', boxShadow: '0 6px 16px rgba(37,211,102,0.30)' }}>
                            <Icon.WhatsApp size={14} /> +257 79 ••• 451
                          </a>
                        ) : (
                          <button onClick={() => setRevealed(new Set([...revealed, r.id]))} className="inline-flex items-center gap-2 px-3.5 h-10 rounded-input text-white text-[13px] font-bold press transition" style={{ background: '#25D366', boxShadow: '0 6px 16px rgba(37,211,102,0.30)' }}>
                            <Icon.WhatsApp size={14} /> Contacter via WhatsApp
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {r.locked && (
                  <div className="mt-4 flex items-center justify-between gap-3 p-3 rounded-input" style={{ background: 'rgba(245,200,66,0.10)', border: '1px solid rgba(245,200,66,0.25)' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-goldDeep"><Icon.Lock size={14} /></div>
                      <div>
                        <div className="text-[13px] font-bold">Réservé aux plans Pro et supérieurs</div>
                        <div className="text-[11.5px] text-ink2">Améliorez votre plan pour contacter cet acheteur</div>
                      </div>
                    </div>
                    <GoldButton className="h-9 text-[12.5px]">Améliorer</GoldButton>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="text-center pt-2">
        <button className="text-[12.5px] font-bold text-ink2 hover:text-ink inline-flex items-center gap-1">Charger plus de demandes <Icon.ChevronDn size={12} /></button>
      </div>
    </div>
  );
};

// ───────── src/tab-shop.jsx ─────────
const ShopTab = () => {
  const u = currentUser;
  const s = u.sellerDetails;
  const [sellerType, setSellerType] = React.useState(s.sellerType);
  const [cats, setCats] = React.useState(new Set(s.categories));
  const allCats = ['Bijoux', 'Mode & Accessoires', 'Artisanat', 'Maison', 'Beauté', 'Alimentation', 'Électronique', 'Enfants', 'Sport'];

  const toggleCat = (c) => {
    const ns = new Set(cats);
    ns.has(c) ? ns.delete(c) : ns.add(c);
    setCats(ns);
  };

  return (
    <div className="space-y-5 animate-fadein">
      <div>
        <h1 className="text-[24px] font-black tracking-tight">Ma boutique</h1>
        <div className="text-[13px] text-ink2 mt-1">Personnalisez votre vitrine. Ces informations sont visibles par tous les acheteurs.</div>
      </div>

      {/* IDENTITY */}
      <Card className="overflow-hidden">
        {/* Banner */}
        <div className="relative">
          <ImageSlot tint="#FCE9C7" className="w-full h-[180px]" label="BANNIÈRE — 1600×400" />
          <button className="absolute right-3 top-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-input bg-white/95 backdrop-blur text-[12px] font-bold press shadow">
            <Icon.Camera size={14} /> Changer la bannière
          </button>
          {/* Avatar overlap */}
          <div className="absolute -bottom-12 left-5">
            <div className="relative group">
              <Avatar initials="BK" size={96} ring color="#FFE8B0" textColor="#7A4B00" />
              <button className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/30 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition">
                <Icon.Camera size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="pt-14 px-5 pb-5 space-y-4">
          <Field label="Nom de la boutique">
            <Input defaultValue={s.shopName} />
          </Field>
          <Field label="Bio · vitrine de votre boutique" hint="120 caractères max">
            <Textarea rows={3} defaultValue={u.bio} maxLength={120} />
          </Field>
        </div>
      </Card>

      {/* CONTACT & LOCATION */}
      <Card className="p-5 space-y-4">
        <SectionTitle sub="Comment les acheteurs vous trouvent et vous contactent.">Contact & localisation</SectionTitle>

        <Field label="WhatsApp">
          <div className="flex gap-2">
            <Select className="w-[140px]" defaultValue="BI">
              <option value="BI">🇧🇮 +257</option>
              <option value="RW">🇷🇼 +250</option>
              <option value="CD">🇨🇩 +243</option>
            </Select>
            <Input className="flex-1" defaultValue="79 412 887" />
          </div>
        </Field>

        <Field label="Type de vendeur">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { v: 'Boutique', e: '🏪', d: 'Local physique fixe' },
              { v: 'En ligne', e: '🌐', d: 'Boutique digitale' },
              { v: 'Ambulant', e: '🚶', d: 'Vendeur itinérant' },
            ].map(t => (
              <button
                key={t.v}
                onClick={() => setSellerType(t.v)}
                className={`text-left rounded-input p-3.5 border-2 transition press ${sellerType === t.v ? 'border-gold bg-gold/[0.08]' : 'border-black/[0.08] hover:bg-canvas'}`}
              >
                <div className="text-[22px] leading-none">{t.e}</div>
                <div className="mt-2 text-[13.5px] font-bold">{t.v}</div>
                <div className="text-[11.5px] text-ink2">{t.d}</div>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Province"><Select defaultValue={s.province}><option>{s.province}</option><option>Gitega</option><option>Ngozi</option></Select></Field>
          <Field label="Commune"><Select defaultValue={s.commune}><option>{s.commune}</option><option>Rohero</option></Select></Field>
          <Field label="Quartier"><Input defaultValue={s.quartier} /></Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Coordonnées GPS">
            <div className="flex gap-2">
              <button className="h-11 px-3.5 rounded-input bg-canvas text-[13px] font-bold inline-flex items-center gap-1.5 press hover:bg-black/[0.06]">
                <Icon.Pin size={14} /> Obtenir ma position
              </button>
              <div className="flex-1 h-11 px-3.5 rounded-input bg-canvas border border-black/[0.06] flex items-center text-[13px] text-ink2 tabular-nums font-medium">
                {s.gps.lat.toFixed(4)}, {s.gps.lng.toFixed(4)}
              </div>
            </div>
          </Field>
          <Field label="Lien Google Maps (optionnel)">
            <Input defaultValue={`https://${s.locationUrl}`} placeholder="https://maps.google.com/..." />
          </Field>
        </div>
      </Card>

      {/* CATEGORIES */}
      <Card className="p-5">
        <SectionTitle sub="Choisissez jusqu'à 5 catégories. Elles aident les acheteurs à vous trouver.">Catégories</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {allCats.map(c => {
            const on = cats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12.5px] font-bold transition press border ${
                  on
                    ? 'text-ink shadow-gold border-transparent'
                    : 'bg-white text-ink2 border-black/[0.08] hover:bg-canvas'
                }`}
                style={on ? { background: '#F5C842' } : null}
              >
                {on && <Icon.Check size={12} />}
                {c}
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-[11.5px] text-ink2">{cats.size}/5 catégories sélectionnées</div>
      </Card>

      {/* DOCS */}
      <Card className="p-5 space-y-4">
        <SectionTitle sub="Optionnels — utiles pour la vérification de votre boutique.">Documents</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Numéro NIF" hint="Identifiant fiscal"><Input defaultValue={s.nif} placeholder="BI-NIF-XXXXXXX" /></Field>
          <Field label="Registre de commerce" hint="N° d'enregistrement"><Input placeholder="optionnel" /></Field>
        </div>
      </Card>

      {/* SAVE */}
      <div className="flex items-center justify-end gap-3 sticky bottom-0 py-3 -mx-4 md:-mx-8 px-4 md:px-8 bg-canvas/90 backdrop-blur border-t border-black/[0.05]">
        <GhostButton>Annuler</GhostButton>
        <GoldButton icon={<Icon.Check size={16} />} className="px-6">Enregistrer les modifications</GoldButton>
      </div>
    </div>
  );
};

// ───────── src/tab-verification.jsx ─────────
const VerificationTab = () => {
  // currentUser.isVerified = true; render the verified hero.
  const verified = currentUser.isVerified;

  return (
    <div className="space-y-5 animate-fadein">
      <div>
        <h1 className="text-[24px] font-black tracking-tight">Vérification</h1>
        <div className="text-[13px] text-ink2 mt-1">Le badge vérifié rassure les acheteurs et augmente vos ventes.</div>
      </div>

      {/* STATUS HERO */}
      {verified ? (
        <Card className="p-6 sm:p-7 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, #FFFFFF 60%)', borderColor: 'rgba(16,185,129,0.30)' }}>
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.20), transparent 70%)' }} />
          <div className="relative flex items-start gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#34D399,#10B981)', boxShadow: '0 10px 30px rgba(16,185,129,0.40)' }}>
              <Icon.Check size={26} />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.15)', color: '#065F46' }}>
                Boutique certifiée
              </div>
              <h2 className="mt-2 text-[22px] sm:text-[26px] font-black tracking-tight leading-tight">Boutique vérifiée — Badge affiché</h2>
              <p className="mt-2 text-[13.5px] text-ink2 max-w-[60ch]">Votre boutique est certifiée depuis le <b className="text-ink">12 mars 2026</b>. Le badge vérifié apparaît sur toutes vos annonces et votre profil public.</p>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Badge bg="#FFFFFF" color="#065F46" className="border border-green/30"><Icon.Badge size={11} /> &nbsp;Badge actif</Badge>
                <Badge bg="#FFFFFF" color="#5C6370" className="border border-black/[0.08]">Renouvellement: 12 mars 2027</Badge>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 overflow-hidden" style={{ background: 'linear-gradient(135deg,#FFFBE6,#FFFFFF)', borderColor: 'rgba(217,119,6,0.25)' }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-amber-700 bg-amber-100 shrink-0">
              <Icon.Clock size={24} />
            </div>
            <div>
              <h2 className="text-[20px] font-black">Demande en cours d'examen</h2>
              <p className="mt-1 text-[13px] text-ink2">Délai habituel: 24 à 48h ouvrées.</p>
            </div>
          </div>
        </Card>
      )}

      {/* BENEFITS */}
      <Card className="p-5">
        <SectionTitle sub="Pourquoi se vérifier auprès de NUNULIA">Avantages du badge vérifié</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            { i: 'Badge', t: 'Badge vérifié visible', d: 'Apparaît sur toutes vos annonces et votre profil public.', c: '#10B981' },
            { i: 'Chart', t: 'Meilleur classement',   d: 'Vos produits remontent plus haut dans les résultats.', c: '#F5C842' },
            { i: 'Star',  t: '+38% de confiance',      d: 'Les acheteurs achètent 38% plus chez les vendeurs vérifiés.', c: '#8B5CF6' },
          ].map((b, i) => {
            const I = Icon[b.i];
            return (
              <div key={i} className="rounded-card border border-black/[0.06] p-4 bg-canvas/40">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white" style={{ background: b.c }}>
                  <I size={16} />
                </div>
                <div className="mt-3 text-[14px] font-black">{b.t}</div>
                <div className="text-[12.5px] text-ink2 mt-1 leading-relaxed">{b.d}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* CHECKLIST */}
      <Card className="p-5">
        <SectionTitle>Pièces de votre dossier</SectionTitle>
        <div className="divide-y divide-black/[0.05]">
          {[
            { l: 'NIF — Identifiant fiscal',          v: 'BI-NIF-0044812', ok: true },
            { l: 'Registre de commerce',               v: 'RC-2024-08812', ok: true },
            { l: 'WhatsApp confirmé',                  v: '+257 79 412 887', ok: true },
            { l: 'Pièce d\'identité du gérant',        v: 'Validée le 12/03/2026', ok: true },
            { l: 'Justificatif d\'adresse (boutique)', v: 'Validé le 12/03/2026', ok: true },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-green/10 text-green inline-flex items-center justify-center shrink-0">
                <Icon.Check size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold">{row.l}</div>
                <div className="text-[12px] text-ink2 truncate">{row.v}</div>
              </div>
              <span className="text-[11px] font-bold text-green uppercase tracking-wider">Vérifié</span>
            </div>
          ))}
        </div>
      </Card>

      {/* WHATSAPP SUPPORT */}
      <Card className="p-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, rgba(37,211,102,0.07),#FFFFFF)', borderColor: 'rgba(37,211,102,0.20)' }}>
        <div className="w-11 h-11 rounded-[12px] flex items-center justify-center text-white shrink-0" style={{ background: '#25D366' }}>
          <Icon.WhatsApp size={20} />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-black">Une question sur votre vérification ?</div>
          <div className="text-[12.5px] text-ink2">Notre équipe répond en moyenne en moins d'une heure.</div>
        </div>
        <WhatsAppButton>Contacter le support</WhatsAppButton>
      </Card>
    </div>
  );
};

// ───────── src/app.jsx ─────────
const TAB_LABELS = {
  overview: 'Vue d\'ensemble',
  products: 'Inventaire',
  analytics: 'Analytiques',
  boost: 'Booster',
  requests: 'Demandes clients',
  shop: 'Ma boutique',
  verification: 'Vérification',
  add_product: 'Ajouter un article',
};

const MobileHeader = ({ activeTab, setActiveTab, onMenu }) => {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-white border-b border-black/[0.06]">
      <div className="h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[8px] flex items-center justify-center font-black text-[14px] text-white"
               style={{ background: 'linear-gradient(135deg,#F5C842,#B07410)', boxShadow: '0 2px 8px rgba(245,200,66,0.40)' }}>N</div>
          <div className="leading-tight">
            <div className="text-[13px] font-black tracking-tight">Espace Vendeur</div>
            <div className="text-[10px] text-ink2 font-semibold -mt-0.5">Bijoux Kigali</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tierBadge(subscriptionState.tier)}
          <button onClick={onMenu} className="w-9 h-9 rounded-input bg-canvas inline-flex items-center justify-center press">
            <Icon.Menu size={18} />
          </button>
        </div>
      </div>
      <div className="px-4 pb-3 chip-rail overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          {NAV.map(it => (
            <Chip key={it.id} active={activeTab === it.id} gold={it.id === 'requests' && activeTab === it.id} onClick={() => setActiveTab(it.id)}>
              {it.label}
              {it.id === 'products' && <span className="ml-0.5 opacity-70">({myProducts.length})</span>}
              {it.id === 'requests' && requestStats.todayCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black bg-gold text-ink">{requestStats.todayCount}</span>
              )}
            </Chip>
          ))}
        </div>
      </div>
    </header>
  );
};

const MobileDrawer = ({ open, onClose, activeTab, setActiveTab }) => {
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50 animate-fadein" onClick={onClose} style={{ background: 'rgba(15,15,20,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-white shadow-cardHover flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 flex items-center justify-between border-b border-black/[0.06]">
          <Logomark />
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-canvas inline-flex items-center justify-center"><Icon.X size={16} /></button>
        </div>
        <div className="p-3 flex-1 overflow-y-auto">
          {NAV.map(it => (
            <NavItem key={it.id} item={it} active={activeTab === it.id} onClick={() => { setActiveTab(it.id); onClose(); }} badges={{ products: myProducts.length, requests: requestStats.todayCount }} />
          ))}
          <button
            onClick={() => { setActiveTab('add_product'); onClose(); }}
            className="mt-2 w-full flex items-center gap-2.5 px-3 h-11 rounded-[12px] text-[13.5px] font-semibold press text-ink"
            style={{ background: '#F5C842', boxShadow: '0 6px 16px rgba(245,200,66,0.40)' }}
          >
            <Icon.Plus size={18} /> Ajouter un article
          </button>
        </div>
        <div className="p-4 border-t border-black/[0.06]">
          <Card className="p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">{tierBadge(subscriptionState.tier)}<span className="text-[11px] text-ink2 font-semibold">{subscriptionState.daysRemaining} j</span></div>
              <span className="text-[12px] font-black tabular-nums">{subscriptionState.used}/{subscriptionState.tierMax}</span>
            </div>
            <Progress value={(subscriptionState.used / subscriptionState.tierMax) * 100} />
          </Card>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = React.useState('overview');
  const [drawer, setDrawer] = React.useState(false);

  // Reset scroll on tab change for clarity
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const main = document.getElementById('main-scroll');
      if (main) main.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':     return <OverviewTab setActiveTab={setActiveTab} />;
      case 'products':     return <ProductsTab setActiveTab={setActiveTab} />;
      case 'add_product':  return <AddProductTab />;
      case 'analytics':    return <AnalyticsTab />;
      case 'boost':        return <BoostTab />;
      case 'requests':     return <RequestsTab />;
      case 'shop':         return <ShopTab />;
      case 'verification': return <VerificationTab />;
      default:             return <OverviewTab setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader activeTab={activeTab} setActiveTab={setActiveTab} onMenu={() => setDrawer(true)} />
        <MobileDrawer open={drawer} onClose={() => setDrawer(false)} activeTab={activeTab} setActiveTab={setActiveTab} />
        <main
          id="main-scroll"
          className={`flex-1 px-4 md:px-8 py-4 md:py-8 main-scroll ${activeTab === 'add_product' ? 'pb-32 md:pb-8' : 'pb-10'}`}
          style={{ maxWidth: 1180, width: '100%', marginInline: 'auto' }}
        >
          {renderTab()}
        </main>
      </div>
    </div>
  );
};


export default function SellerDashboard() {
  return <App />;
}


/* ─────────────────────────────────────────────────────────────────────────────
   Tailwind config — add to tailwind.config.{js,ts}:

   module.exports = {
     theme: {
       extend: {
         fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] },
         colors: {
           canvas: '#F7F8FA', ink: '#111318', ink2: '#5C6370', muted: '#9EA5B0',
           gold: '#F5C842', goldHov: '#E8A800', goldDeep: '#B07410',
           green: '#10B981', wa: '#25D366', danger: '#EF4444',
           info: '#3B82F6', purple: '#8B5CF6',
         },
         borderRadius: { card: '16px', input: '12px', modal: '24px' },
         boxShadow: {
           card: '0 2px 8px rgba(0,0,0,0.05)',
           cardHover: '0 6px 18px rgba(0,0,0,0.07)',
           gold: '0 4px 20px rgba(245,200,66,0.45)',
         },
         keyframes: {
           fadein: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
           shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
           pulseRing: { '0%,100%': { boxShadow: '0 0 0 0 rgba(245,200,66,0.35)' }, '50%': { boxShadow: '0 0 0 8px rgba(245,200,66,0)' } },
         },
         animation: {
           fadein: 'fadein 240ms ease-out',
           shimmer: 'shimmer 1.6s linear infinite',
           pulseRing: 'pulseRing 1.8s ease-out infinite',
         },
       },
     },
   };

   Plus the small CSS helpers used by the file (no-scrollbar, focus-gold,
   stripey, bar, lift, press, chip-rail, text-gold-grad, skeleton, main-scroll)
   — copy them from the <style> block in Seller Dashboard.html.
   ───────────────────────────────────────────────────────────────────────── */
