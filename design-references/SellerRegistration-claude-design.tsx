// SellerRegistration-claude-design.tsx
// NUNULIA — Seller Registration (4-step onboarding + success)
// Single-file React component. Tailwind CSS required (config snippet at the bottom).
// Drop-in usable as a Next.js page or any React route.
//
// Default export: <SellerRegistration /> — renders Step 1 by default.

// @ts-nocheck
/* eslint-disable */
import React from 'react';
// ──────────────────────────────────────────────────────────────────────────
// NUNULIA — Seller Registration (Espace Vendeur)
// 4-step onboarding flow + success state. Step 1 visible by default.
// ──────────────────────────────────────────────────────────────────────────

const countries = [
  { id: 'bi', name: 'Burundi', flag: '🇧🇮', code: '+257', cities: ['Bujumbura', 'Gitega', 'Ngozi', 'Rumonge', 'Kayanza', 'Muyinga'] },
  { id: 'cd', name: 'RDC',     flag: '🇨🇩', code: '+243', cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Mbuji-Mayi'] },
  { id: 'rw', name: 'Rwanda',  flag: '🇷🇼', code: '+250', cities: ['Kigali', 'Butare', 'Gisenyi', 'Ruhengeri', 'Byumba'] },
];

const ALL_CATEGORIES = [
  { id: 'Bijoux',              icon: '💎' },
  { id: 'Mode & Accessoires',  icon: '👗' },
  { id: 'Artisanat',           icon: '🧵' },
  { id: 'Électronique',        icon: '📱' },
  { id: 'Beauté',              icon: '💄' },
  { id: 'Maison',              icon: '🏠' },
  { id: 'Services',            icon: '🛎️' },
  { id: 'Alimentation',        icon: '🍲' },
  { id: 'Sports',              icon: '⚽' },
];

const currentUser = { name: 'Marc Furaha', avatar: '' };

// ───────────────────────── Inline icon set ─────────────────────────
const I = ({ children, size = 18, sw = 1.75, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);
const Icon = {
  Check:    (p) => <I {...p}><path d="M5 12l4 4 10-10"/></I>,
  ArrowL:   (p) => <I {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></I>,
  ArrowR:   (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6"/></I>,
  Lock:     (p) => <I {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></I>,
  Pin:      (p) => <I {...p}><path d="M12 22s-7-7.5-7-13a7 7 0 0114 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/></I>,
  Camera:   (p) => <I {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/></I>,
  Doc:      (p) => <I {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M8 14h8M8 18h5"/></I>,
  X:        (p) => <I {...p}><path d="M6 6l12 12M18 6L6 18"/></I>,
  ChevronDn:(p) => <I {...p}><path d="M6 9l6 6 6-6"/></I>,
  Spark:    (p) => <I {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/></I>,
  Shop:     (p) => <I {...p}><path d="M3 7l1.5-3h15L21 7"/><path d="M3 7v13h18V7"/><path d="M3 7c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3"/></I>,
  Globe:    (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></I>,
  User:     (p) => <I {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></I>,
  Rocket:   (p) => <I {...p}><path d="M14 4s5 0 6 6c-6 1-6 6-6 6l-4-4s0-5 4-8z"/><path d="M9 15l-3 3M6 14l-2 4 4-2"/></I>,
  Tag:      (p) => <I {...p}><path d="M20 12l-8 8-9-9V3h8l9 9z"/><circle cx="8" cy="8" r="1.5"/></I>,
  Box:      (p) => <I {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></I>,
};

// ───────────────────────── Atoms ─────────────────────────
const Label = ({ children, optional, count, max }) => (
  <div className="flex items-end justify-between mb-1.5">
    <span className="text-[11px] font-bold uppercase tracking-[0.10em] text-muted">{children}</span>
    <div className="flex items-center gap-2">
      {optional && <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Optionnel</span>}
      {typeof count === 'number' && <span className="text-[11px] font-bold text-muted tabular-nums">{count}/{max}</span>}
    </div>
  </div>
);

const TextInput = React.forwardRef(({ leftAdornment, rightAdornment, className = '', ...rest }, ref) => (
  <div className="relative flex items-stretch">
    {leftAdornment}
    <input
      ref={ref}
      className={`flex-1 h-12 px-4 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink placeholder:text-muted focus-gold transition-all duration-150 ${leftAdornment ? 'rounded-l-none' : ''} ${rightAdornment ? 'pr-10' : ''} ${className}`}
      {...rest}
    />
    {rightAdornment && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">{rightAdornment}</div>
    )}
  </div>
));

const SelectInput = ({ children, className = '', ...rest }) => (
  <div className="relative">
    <select
      className={`w-full h-12 pl-4 pr-10 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink focus-gold appearance-none transition-all duration-150 ${className}`}
      {...rest}
    >{children}</select>
    <Icon.ChevronDn size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none" />
  </div>
);

const GoldCTA = ({ children, disabled, loading, className = '', ...rest }) => (
  <button
    disabled={disabled || loading}
    className={`relative w-full h-13 rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
      disabled ? 'bg-fieldRest text-muted cursor-not-allowed' : 'bg-gold hover:bg-goldHov text-ink shadow-gold'
    } ${className}`}
    style={{ height: 52 }}
    {...rest}
  >
    {loading && <span className="w-4 h-4 rounded-full border-2 border-ink/30 border-t-ink animate-spin" />}
    {children}
  </button>
);

const GhostBtn = ({ children, className = '', ...rest }) => (
  <button
    className={`inline-flex items-center justify-center gap-1.5 h-12 px-4 rounded-input text-[14px] font-semibold text-ink2 hover:text-ink hover:bg-fieldRest press transition ${className}`}
    {...rest}
  >{children}</button>
);

const SpinnerIcon = ({ size = 18 }) => (
  <span className="inline-block animate-spin rounded-full border-2 border-current/30 border-t-current" style={{ width: size, height: size }} />
);

// ───────────────────────── Top bar + Language switcher ─────────────────────────
const Logomark = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center font-black text-[18px] text-white"
         style={{ background: 'linear-gradient(135deg,#F5C842 0%, #E8A800 55%, #B07410 100%)', boxShadow: '0 4px 14px rgba(245,200,66,0.45), inset 0 1px 0 rgba(255,255,255,0.35)', letterSpacing: '-0.04em' }}>N</div>
    <div className="text-[15px] font-black tracking-tight text-ink">NUNULIA</div>
  </div>
);

const LanguageSwitcher = () => {
  const [open, setOpen] = React.useState(false);
  const [lang, setLang] = React.useState('FR');
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-fieldRest hover:bg-black/[0.06] text-[12.5px] font-bold text-ink press transition">
        <Icon.Globe size={13} /> {lang}
        <Icon.ChevronDn size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-32 bg-white rounded-input border border-black/[0.08] shadow-cardLg py-1 z-20 animate-fadein">
          {['FR', 'EN', 'RN', 'SW'].map(l => (
            <button key={l} onClick={() => { setLang(l); setOpen(false); }} className="w-full text-left px-3 py-2 text-[13px] font-semibold hover:bg-canvas">
              {l === 'FR' ? '🇫🇷 Français' : l === 'EN' ? '🇬🇧 English' : l === 'RN' ? '🇧🇮 Kirundi' : '🇰🇪 Swahili'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TopBar = () => (
  <header className="sticky top-0 z-30 bg-white border-b border-black/[0.06]">
    <div className="h-14 max-w-3xl mx-auto px-4 flex items-center justify-between">
      <Logomark />
      <LanguageSwitcher />
    </div>
  </header>
);

// ───────────────────────── Progress bar ─────────────────────────
const STEPS = [
  { n: 1, label: 'Profil' },
  { n: 2, label: 'Boutique' },
  { n: 3, label: 'Légal' },
  { n: 4, label: 'Finaliser' },
];

const ProgressBar = ({ step }) => {
  // Compute the percentage of the connecting line that should be green.
  const fillPct = ((Math.max(step - 1, 0)) / (STEPS.length - 1)) * 100;
  return (
    <div className="mt-6 mb-5 px-4">
      <div className="relative max-w-md mx-auto">
        {/* track */}
        <div className="absolute left-5 right-5 top-4 h-[2px] bg-black/[0.10] rounded-full" />
        {/* filled */}
        <div
          className="absolute left-5 top-4 h-[2px] rounded-full"
          style={{ width: `calc((100% - 40px) * ${fillPct / 100})`, background: '#10B981', transition: 'width 500ms ease-out' }}
        />
        <div className="relative flex items-start justify-between">
          {STEPS.map((s) => {
            const completed = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} className="flex flex-col items-center gap-2 w-[40px]">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black transition-all duration-300 ${
                    completed ? 'bg-green text-white' : active ? 'bg-gold text-ink shadow-gold' : 'bg-white text-muted border border-black/[0.15]'
                  }`}
                  style={active ? { animation: 'pop 220ms ease-out' } : null}
                >
                  {completed ? <Icon.Check size={16} sw={2.5} /> : s.n}
                </div>
                <span className={`text-[10.5px] font-bold tracking-wide ${active ? 'text-ink' : completed ? 'text-green' : 'text-muted'}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────── Step 1 — Profil ─────────────────────────
const Step1Profile = ({ form, onChange, onName, name, onCountry, onNext }) => {
  const country = countries.find(c => c.id === form.countryId);
  const canNext = name.trim() && form.cni.trim() && form.phone.trim() && form.province;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'MF';

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">Votre identité</h2>
        <p className="text-[13.5px] text-ink2 mt-1">Ces informations resteront confidentielles.</p>
      </div>

      {/* Avatar greeting */}
      <div className="flex items-center gap-4 mb-6 p-3 rounded-input bg-canvas">
        <div className="relative w-14 h-14 rounded-full flex items-center justify-center font-black text-[18px] text-white shrink-0"
             style={{ background: 'linear-gradient(135deg,#F5C842,#B07410)', boxShadow: '0 6px 18px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.30)' }}>
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-black tracking-tight leading-tight">Bonjour, {name || 'Marc Furaha'} !</div>
          <div className="text-[13px] text-ink2 mt-0.5">Vous pouvez modifier votre nom ci-dessous.</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Nom complet</Label>
          <TextInput value={name} onChange={(e) => onName(e.target.value)} placeholder="Prénom Nom" />
        </div>

        <div>
          <Label>Pays d'activité</Label>
          <div className="relative">
            <select
              value={form.countryId}
              onChange={(e) => onCountry(e.target.value)}
              className="w-full h-12 pl-12 pr-10 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink focus-gold appearance-none transition-all duration-150"
            >
              {countries.map(c => <option key={c.id} value={c.id}>{c.flag} &nbsp;{c.name}</option>)}
            </select>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none">{country.flag}</span>
            <Icon.ChevronDn size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none" />
          </div>
        </div>

        <div>
          <Label>Numéro CNI / Passeport</Label>
          <TextInput
            value={form.cni}
            onChange={(e) => onChange('cni', e.target.value)}
            placeholder="Ex : AB 123456"
            rightAdornment={<Icon.Lock size={14} />}
          />
        </div>

        <div>
          <Label>Téléphone WhatsApp</Label>
          <TextInput
            value={form.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="79 412 887"
            inputMode="tel"
            leftAdornment={
              <div className="inline-flex items-center gap-1.5 h-12 px-3 rounded-l-input border-r border-black/[0.08] text-[14px] font-bold text-ink"
                   style={{ background: 'rgba(245,200,66,0.12)' }}>
                <span>{country.flag}</span>
                <span className="tabular-nums">{country.code}</span>
              </div>
            }
          />
        </div>

        <div>
          <Label>Ville <span className="text-danger">*</span></Label>
          <SelectInput value={form.province} onChange={(e) => onChange('province', e.target.value, true)}>
            <option value="">Sélectionnez votre ville</option>
            {country.cities.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
        </div>

        <div>
          <Label optional>Quartier / Adresse</Label>
          <TextInput value={form.quartier} onChange={(e) => onChange('quartier', e.target.value)} placeholder="Ex : Rohero, Centre-ville…" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1.5 text-[11.5px] text-muted">
        <Icon.Lock size={12} /> Vos données sont chiffrées et protégées.
      </div>

      <div className="mt-6">
        <GoldCTA disabled={!canNext} onClick={onNext}>
          Continuer <Icon.ArrowR size={16} />
        </GoldCTA>
      </div>
    </div>
  );
};

// ───────────────────────── Step 2 — Boutique ─────────────────────────
const SellerTypeCard = ({ value, current, onClick, icon, title, sub, badge }) => {
  const selected = value === current;
  return (
    <button
      onClick={() => onClick(value)}
      className={`lift text-left rounded-card p-4 press border-[1.5px] ${selected ? 'border-gold' : 'border-black/[0.10] hover:border-black/[0.20]'}`}
      style={selected ? { background: 'rgba(245,200,66,0.06)', boxShadow: '0 6px 18px rgba(245,200,66,0.20)' } : { background: '#fff' }}
    >
      <div className="text-[28px] leading-none">{icon}</div>
      <div className="mt-3 text-[14.5px] font-black leading-tight">{title}</div>
      {sub && <div className="text-[12px] text-ink2 mt-0.5 leading-snug">{sub}</div>}
      {badge && (
        <div className="mt-2 inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] font-bold uppercase tracking-wide"
             style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>
          {badge}
        </div>
      )}
      {selected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold flex items-center justify-center shadow-gold animate-pop">
          <Icon.Check size={13} sw={2.5} />
        </div>
      )}
    </button>
  );
};

const Step2Shop = ({ form, onChange, onBack, onNext, onToggleCat, onCaptureGPS, gpsLoading, onShopPhoto, shopPhoto }) => {
  const needsGPS = form.sellerType === 'shop';
  const hasGPS = !!form.gps;
  const canNext = form.shopName.trim() && form.sellerType && form.categories.length >= 1 && (!needsGPS || hasGPS);

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">Votre activité</h2>
        <p className="text-[13.5px] text-ink2 mt-1">Présentez votre boutique aux acheteurs.</p>
      </div>

      <div className="space-y-5">
        <div>
          <Label count={form.shopName.length} max={60}>Nom de la boutique</Label>
          <TextInput
            value={form.shopName}
            onChange={(e) => onChange('shopName', e.target.value.slice(0, 60))}
            placeholder="Ex : Bijoux Kigali, Mode Buja…"
          />
        </div>

        <div>
          <Label>Type de vendeur</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 relative">
            <div className="relative"><SellerTypeCard value="shop"   current={form.sellerType} onClick={(v) => onChange('sellerType', v)} icon="🏪" title="Boutique physique"     sub="Local fixe" badge="GPS requis" /></div>
            <div className="relative"><SellerTypeCard value="street" current={form.sellerType} onClick={(v) => onChange('sellerType', v)} icon="🚶" title="Ambulant"              sub="Aucune contrainte" /></div>
            <div className="relative"><SellerTypeCard value="online" current={form.sellerType} onClick={(v) => onChange('sellerType', v)} icon="🌐" title="En ligne uniquement"   sub="Aucune contrainte" /></div>
          </div>
        </div>

        {needsGPS && (
          <div className="rounded-card p-4 animate-fadein"
               style={{ background: 'rgba(245,200,66,0.06)', border: '1px solid rgba(245,200,66,0.25)' }}>
            <div className="text-[13px] font-black text-ink mb-3 inline-flex items-center gap-1.5">
              <Icon.Pin size={14} className="text-goldDeep" /> Localisation de votre boutique
            </div>
            <button
              onClick={onCaptureGPS}
              disabled={gpsLoading}
              className={`w-full h-12 rounded-input font-bold text-[14px] inline-flex items-center justify-center gap-2 press transition ${
                hasGPS
                  ? 'text-green'
                  : 'text-ink bg-gold hover:bg-goldHov shadow-gold'
              }`}
              style={hasGPS ? { background: 'rgba(16,185,129,0.10)', border: '1px solid #10B981' } : null}
            >
              {gpsLoading ? <SpinnerIcon size={14} /> : (hasGPS ? <Icon.Check size={14} sw={2.5} /> : <Icon.Pin size={14} />)}
              {gpsLoading
                ? 'Capture en cours…'
                : hasGPS
                ? `Position capturée : ${form.gps.lat.toFixed(4)}, ${form.gps.lng.toFixed(4)}`
                : 'Capturer ma position GPS'}
            </button>
            <div className="text-[11px] text-muted mt-2">Votre adresse exacte ne sera pas publiée — utilisée pour les recherches à proximité.</div>

            {/* Shop photo upload */}
            <label
              className="mt-4 block cursor-pointer rounded-input text-center p-4 transition press"
              style={{ border: '1.5px dashed rgba(245,200,66,0.40)', background: 'rgba(255,255,255,0.55)' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) onShopPhoto(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onShopPhoto(e.target.files[0])} />
              {shopPhoto ? (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-input shrink-0 stripey" style={{ background: '#F5E9C8' }} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13.5px] font-bold truncate">{shopPhoto.name || 'boutique.jpg'}</div>
                    <div className="text-[11.5px] text-green font-semibold">✓ Téléversée</div>
                  </div>
                  <button onClick={(e) => { e.preventDefault(); onShopPhoto(null); }} className="w-7 h-7 rounded-full bg-white text-danger inline-flex items-center justify-center press"><Icon.X size={13} /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Icon.Camera size={28} sw={1.5} className="text-goldDeep" />
                  <div className="text-[13.5px] font-bold text-ink">Photo de votre boutique</div>
                  <div className="text-[11.5px] text-muted">JPG, PNG · max 5 MB</div>
                </div>
              )}
            </label>
          </div>
        )}

        <div>
          <Label>Vos catégories de vente (1 minimum)</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map(c => {
              const on = form.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onToggleCat(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12.5px] font-bold transition press border ${
                    on ? 'text-ink border-transparent shadow-gold' : 'bg-white text-ink2 border-black/[0.10] hover:border-black/[0.20]'
                  }`}
                  style={on ? { background: '#F5C842', animation: 'pop 180ms ease-out' } : null}
                >
                  <span>{c.icon}</span>
                  {c.id}
                  {on && <Icon.Check size={12} sw={2.5} />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11.5px] text-muted">{form.categories.length} catégorie{form.categories.length > 1 ? 's' : ''} sélectionnée{form.categories.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <GhostBtn onClick={onBack}><Icon.ArrowL size={14} /> Retour</GhostBtn>
        <button
          onClick={onNext}
          disabled={!canNext}
          className={`flex-1 sm:flex-initial sm:px-8 h-13 rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
            !canNext ? 'bg-fieldRest text-muted cursor-not-allowed' : 'bg-gold hover:bg-goldHov text-ink shadow-gold'
          }`}
          style={{ height: 52 }}
        >
          Continuer <Icon.ArrowR size={16} />
        </button>
      </div>
    </div>
  );
};

// ───────────────────────── Step 3 — Légal ─────────────────────────
const Step3Legal = ({ form, onChange, onBack, onNext }) => {
  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">Situation légale</h2>
        <p className="text-[13.5px] text-ink2 mt-1">Optionnel — mais fortement recommandé.</p>
      </div>

      <div className="rounded-card border border-black/[0.07] bg-white p-4 sm:p-5">
        <div className="text-[15px] font-bold text-ink">Avez-vous un NIF ?</div>
        <div className="text-[12.5px] text-ink2 mt-0.5">Numéro d'Identification Fiscale délivré par votre administration.</div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            onClick={() => onChange('hasNif', true)}
            className={`lift rounded-card p-4 text-left border-[1.5px] press ${form.hasNif === true ? 'border-green' : 'border-black/[0.10] hover:border-black/[0.20] bg-white'}`}
            style={form.hasNif === true ? { background: 'rgba(16,185,129,0.06)' } : null}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${form.hasNif === true ? 'bg-green text-white' : 'bg-fieldRest text-ink2'}`}>
                <Icon.Check size={14} sw={2.5} />
              </div>
              <div>
                <div className="text-[14.5px] font-black">Oui</div>
                <div className="text-[12px] text-ink2">J'ai un NIF</div>
              </div>
            </div>
          </button>
          <button
            onClick={() => onChange('hasNif', false)}
            className={`lift rounded-card p-4 text-left border-[1.5px] press ${form.hasNif === false ? 'border-amber' : 'border-black/[0.10] hover:border-black/[0.20] bg-white'}`}
            style={form.hasNif === false ? { background: 'rgba(245,158,11,0.06)' } : null}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${form.hasNif === false ? 'bg-amber text-white' : 'bg-fieldRest text-ink2'}`}>
                <Icon.X size={14} sw={2.5} />
              </div>
              <div>
                <div className="text-[14.5px] font-black">Non</div>
                <div className="text-[12px] text-ink2">Pas encore</div>
              </div>
            </div>
          </button>
        </div>

        {form.hasNif === true && (
          <div className="mt-4 animate-fadein">
            <Label>Votre numéro NIF</Label>
            <TextInput value={form.nif} onChange={(e) => onChange('nif', e.target.value)} placeholder="BI-NIF-0044812" />
          </div>
        )}
      </div>

      {form.hasNif === true ? (
        <div className="mt-4 rounded-card p-4 animate-fadein" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid #10B981' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-green text-white flex items-center justify-center shrink-0"><Icon.Check size={16} sw={2.5} /></div>
            <div>
              <div className="text-[14.5px] font-black text-ink">Accès illimité aux plans</div>
              <div className="text-[12.5px] text-ink2 mt-0.5 leading-relaxed">Vous pourrez choisir n'importe quel plan (Starter, Pro, Elite, Unlimited) et accéder à toutes les fonctionnalités vendeur.</div>
            </div>
          </div>
        </div>
      ) : form.hasNif === false ? (
        <div className="mt-4 rounded-card p-4 animate-fadein" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber text-white flex items-center justify-center shrink-0 text-[16px] font-black">!</div>
            <div>
              <div className="text-[14.5px] font-black text-ink">Plan Gratuit uniquement</div>
              <div className="text-[12.5px] text-ink2 mt-0.5 leading-relaxed">Sans NIF, votre boutique sera limitée au plan Gratuit (3 produits, badge non vérifié). Vous pouvez compléter plus tard dans votre tableau de bord.</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <GhostBtn onClick={onBack}><Icon.ArrowL size={14} /> Retour</GhostBtn>
        <button
          onClick={onNext}
          disabled={form.hasNif === null}
          className={`flex-1 sm:flex-initial sm:px-8 h-13 rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
            form.hasNif === null ? 'bg-fieldRest text-muted cursor-not-allowed' : 'bg-gold hover:bg-goldHov text-ink shadow-gold'
          }`}
          style={{ height: 52 }}
        >
          Continuer <Icon.ArrowR size={16} />
        </button>
      </div>
    </div>
  );
};

// ───────────────────────── Step 4 — Finaliser ─────────────────────────
const UploadZone = ({ label, sub, file, onFile, onRemove }) => (
  <label
    className="block cursor-pointer rounded-input p-3 transition press"
    style={{ border: file ? '1.5px solid #10B981' : '1.5px dashed rgba(0,0,0,0.12)', background: file ? 'rgba(16,185,129,0.04)' : '#fff' }}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
  >
    <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    <div className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-input flex items-center justify-center shrink-0 ${file ? 'bg-green/10 text-green' : 'bg-fieldRest text-ink2'}`}>
        <Icon.Doc size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-ink truncate">{file ? file.name : label}</div>
        <div className="text-[11.5px] text-muted">{file ? '✓ Prêt à envoyer' : sub}</div>
      </div>
      {file ? (
        <button onClick={(e) => { e.preventDefault(); onRemove(); }} className="w-8 h-8 rounded-full bg-fieldRest text-danger inline-flex items-center justify-center press hover:bg-danger/10">
          <Icon.X size={14} />
        </button>
      ) : (
        <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-fieldRest text-[12px] font-bold text-ink2">Ajouter</span>
      )}
    </div>
  </label>
);

const Step4Finalize = ({ form, name, files, onFile, onRemove, terms, setTerms, loading, onBack, onSubmit }) => {
  const country = countries.find(c => c.id === form.countryId);
  const sellerTypeLabel = { shop: 'Boutique physique', street: 'Ambulant', online: 'En ligne uniquement' }[form.sellerType];

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">Dernière étape !</h2>
        <p className="text-[13.5px] text-ink2 mt-1">Votre boutique sera créée en quelques secondes.</p>
      </div>

      {/* Récap */}
      <div className="rounded-card p-4 sm:p-5" style={{ background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.20)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-card text-goldDeep"><Icon.Spark size={14} /></div>
          <div className="text-[14px] font-black">Récapitulatif</div>
        </div>
        <div className="divide-y divide-black/[0.05]">
          {[
            { i: '👤', l: 'Nom',        v: name || '—' },
            { i: '🏪', l: 'Boutique',   v: form.shopName || '—' },
            { i: '📍', l: 'Ville',      v: form.province ? `${form.province} ${country.flag}` : '—' },
            { i: '🏷️', l: 'Type',       v: sellerTypeLabel || '—' },
            { i: '📦', l: 'Catégories', v: form.categories.join(', ') || '—' },
            { i: '📋', l: 'NIF',        v: form.hasNif ? (form.nif || '—') : 'Non renseigné' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <span className="text-[15px] leading-none w-5 text-center">{row.i}</span>
              <span className="text-[12px] font-bold uppercase tracking-wider text-muted w-[88px] shrink-0">{row.l}</span>
              <span className="text-[13.5px] font-semibold text-ink flex-1 text-right truncate">{row.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div className="mt-5">
        <Label>Pièces justificatives (optionnel)</Label>
        <div className="space-y-2.5">
          <UploadZone label="CNI ou Passeport" sub="JPG, PNG · max 10 MB" file={files.cni} onFile={(f) => onFile('cni', f)} onRemove={() => onFile('cni', null)} />
          {form.hasNif && (
            <div className="animate-fadein">
              <UploadZone label="Justificatif NIF" sub="JPG, PNG, PDF · max 10 MB" file={files.nif} onFile={(f) => onFile('nif', f)} onRemove={() => onFile('nif', null)} />
            </div>
          )}
        </div>
      </div>

      {/* CGU */}
      <button
        onClick={() => setTerms(!terms)}
        className={`mt-5 w-full text-left rounded-card p-4 transition press border-[1.5px] ${terms ? 'border-green' : 'border-black/[0.15] bg-white'}`}
        style={terms ? { background: 'rgba(16,185,129,0.04)' } : null}
      >
        <div className="flex items-start gap-3">
          <div className={`w-5 h-5 rounded-[6px] border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center transition ${terms ? 'bg-green border-green' : 'border-black/[0.25] bg-white'}`}>
            {terms && <Icon.Check size={12} sw={3} stroke="#ffffff" />}
          </div>
          <div className="text-[13px] leading-relaxed text-ink">
            J'accepte les{' '}
            <a href="#" className="font-bold underline" style={{ color: '#C47E00' }} onClick={(e) => e.stopPropagation()}>Conditions Générales d'Utilisation</a>{' '}
            de NUNULIA et confirme que les informations fournies sont exactes. Voir aussi notre{' '}
            <a href="#" className="font-bold underline" style={{ color: '#C47E00' }} onClick={(e) => e.stopPropagation()}>Politique de confidentialité</a>.
          </div>
        </div>
      </button>

      {/* Submit */}
      <div className="mt-6">
        <button
          onClick={onSubmit}
          disabled={!terms || loading}
          className={`w-full h-14 rounded-input font-black text-[16px] inline-flex items-center justify-center gap-2.5 press transition ${
            !terms ? 'bg-fieldRest text-muted cursor-not-allowed' : 'bg-gold hover:bg-goldHov text-ink'
          }`}
          style={terms ? { boxShadow: '0 8px 24px rgba(245,200,66,0.45)' } : null}
        >
          {loading ? (
            <>
              <SpinnerIcon size={18} /> Création en cours…
            </>
          ) : (
            <>🚀 Créer ma boutique</>
          )}
        </button>
        <button onClick={onBack} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink2 hover:text-ink press">
          <Icon.ArrowL size={14} /> Retour
        </button>
      </div>
    </div>
  );
};

// ───────────────────────── Success ─────────────────────────
const SuccessScreen = ({ name, onGo }) => (
  <div className="animate-fadein max-w-md mx-auto text-center px-4 py-10">
    <div className="relative mx-auto mb-6" style={{ width: 96, height: 96 }}>
      <div className="absolute inset-0 rounded-full animate-pulseRing" style={{ background: 'rgba(16,185,129,0.12)', border: '3px solid #10B981' }} />
      <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '3px solid #10B981' }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l4 4 10-10" strokeDasharray="28" style={{ animation: 'checkdraw 500ms ease-out forwards' }} />
        </svg>
      </div>
    </div>
    <h2 className="text-[28px] font-black tracking-tight leading-tight">🎉 <span className="text-gold-grad">Boutique créée !</span></h2>
    <p className="mt-3 text-[15px] text-ink2">Bienvenue dans la famille NUNULIA, <b className="text-ink">{name}</b>.</p>

    <div className="mt-6 rounded-card border border-black/[0.07] bg-white p-4 text-left">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Prochaines étapes</div>
      <ul className="mt-2 space-y-2.5">
        {[
          { i: <Icon.Box size={14} />, t: 'Ajoutez vos premiers articles' },
          { i: <Icon.Shop size={14} />, t: 'Personnalisez votre vitrine' },
          { i: <Icon.Spark size={14} />, t: 'Boostez votre visibilité' },
        ].map((s, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-fieldRest flex items-center justify-center text-ink2 shrink-0">{s.i}</div>
            <span className="text-[13.5px] font-semibold">{s.t}</span>
          </li>
        ))}
      </ul>
    </div>

    <div className="mt-6 max-w-xs mx-auto">
      <GoldCTA onClick={onGo} className="!h-14 !text-[15px]">
        Accéder à mon tableau de bord <Icon.ArrowR size={16} />
      </GoldCTA>
    </div>
  </div>
);

// ───────────────────────── Root ─────────────────────────
const App = () => {
  const [step, setStep] = React.useState(1);
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [editName, setEditName] = React.useState('Marc Furaha');
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);

  const [formData, setFormData] = React.useState({
    cni: 'AB 123456',
    phone: '79 412 887',
    countryId: 'bi',
    province: 'Bujumbura',
    commune: 'Bujumbura',
    quartier: 'Rohero',
    shopName: 'Bijoux Kigali',
    sellerType: 'shop',
    gps: undefined,
    categories: ['Bijoux', 'Mode & Accessoires', 'Artisanat'],
    hasNif: null,
    nif: '',
  });
  const [files, setFiles] = React.useState({ cni: null, nif: null, shop: null });

  const handleChange = (field, value, mirror) => {
    setFormData(prev => ({ ...prev, [field]: value, ...(mirror ? { commune: value } : {}) }));
  };
  const handleCountryChange = (countryId) => {
    setFormData(prev => ({ ...prev, countryId, province: '', commune: '' }));
  };
  const handleFileChange = (field, file) => setFiles(prev => ({ ...prev, [field]: file }));
  const toggleCategory = (cat) => setFormData(prev => ({
    ...prev,
    categories: prev.categories.includes(cat) ? prev.categories.filter(c => c !== cat) : [...prev.categories, cat],
  }));
  const captureGPS = () => {
    setGpsLoading(true);
    // Simulated capture — replace with navigator.geolocation in production.
    setTimeout(() => {
      setFormData(prev => ({ ...prev, gps: { lat: -3.3614, lng: 29.3599 } }));
      setGpsLoading(false);
    }, 1100);
  };
  const handleSubmit = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setDone(true); }, 1400);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-canvas">
        <TopBar />
        <SuccessScreen name={editName} onGo={() => { setDone(false); setStep(1); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-12">
      <TopBar />

      <section className="max-w-lg mx-auto px-4 pt-7 sm:pt-10 text-center">
        <h1 className="text-[26px] sm:text-[30px] font-black tracking-tight leading-[1.15] text-gold-grad">Devenez vendeur sur NUNULIA</h1>
        <p className="mt-2 text-[14.5px] sm:text-[15px] text-ink2 max-w-sm mx-auto">Créez votre boutique en 4 étapes et touchez des milliers d'acheteurs.</p>
      </section>

      <ProgressBar step={step} />

      <main className="max-w-lg mx-auto px-4">
        <div className="bg-white rounded-modal border border-black/[0.07] shadow-cardLg p-6 sm:p-8">
          {step === 1 && (
            <Step1Profile
              form={formData}
              name={editName}
              onName={setEditName}
              onChange={handleChange}
              onCountry={handleCountryChange}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Shop
              form={formData}
              onChange={handleChange}
              onToggleCat={toggleCategory}
              onCaptureGPS={captureGPS}
              gpsLoading={gpsLoading}
              shopPhoto={files.shop}
              onShopPhoto={(f) => handleFileChange('shop', f)}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Legal
              form={formData}
              onChange={handleChange}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <Step4Finalize
              form={formData}
              name={editName}
              files={files}
              onFile={handleFileChange}
              onRemove={(field) => handleFileChange(field, null)}
              terms={acceptedTerms}
              setTerms={setAcceptedTerms}
              loading={loading}
              onBack={() => setStep(3)}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        <div className="text-center mt-5">
          <button className="text-[13px] font-semibold text-muted hover:text-ink2 press">Annuler</button>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted px-2.5 h-7 rounded-full bg-white border border-black/[0.06]">
            <Icon.Lock size={11} /> Connexion sécurisée · Vos données restent en Afrique
          </div>
        </div>
      </main>
    </div>
  );
};


export default function SellerRegistration() {
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
           info: '#3B82F6', amber: '#F59E0B', purple: '#8B5CF6',
           fieldRest: '#F0F1F4',
         },
         borderRadius: { card: '16px', input: '12px', modal: '24px' },
         boxShadow: {
           card: '0 2px 8px rgba(0,0,0,0.05)',
           cardLg: '0 4px 24px rgba(0,0,0,0.06)',
           gold: '0 4px 20px rgba(245,200,66,0.45)',
           goldBig: '0 8px 24px rgba(245,200,66,0.45)',
         },
         keyframes: {
           fadein: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
           pop:    { '0%': { transform: 'scale(0.9)' }, '60%': { transform: 'scale(1.06)' }, '100%': { transform: 'scale(1)' } },
           pulseRing: { '0%,100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.45)' }, '50%': { boxShadow: '0 0 0 14px rgba(16,185,129,0)' } },
           spin:   { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } },
           checkdraw: { '0%': { strokeDashoffset: 28 }, '100%': { strokeDashoffset: 0 } },
         },
         animation: {
           fadein: 'fadein 220ms ease-out',
           pop: 'pop 180ms ease-out',
           pulseRing: 'pulseRing 1.8s ease-out infinite',
           spin: 'spin 0.9s linear infinite',
           checkdraw: 'checkdraw 400ms ease-out forwards',
         },
       },
     },
   };

   And these tiny CSS helpers (put in your global stylesheet):

     .focus-gold:focus { outline: none; box-shadow: 0 0 0 4px rgba(245,200,66,0.20); border-color: #F5C842 !important; background: #FFFFFF !important; }
     .text-gold-grad  { background: linear-gradient(135deg,#C47E00,#B07410); -webkit-background-clip: text; background-clip: text; color: transparent; }
     .press:active    { transform: scale(0.97); }
     .lift            { transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease; }
     .stripey         { background-image: repeating-linear-gradient(135deg, rgba(0,0,0,0.05) 0 8px, rgba(0,0,0,0) 8px 16px); }

   Inter must be loaded (e.g. via next/font/google or a <link> to Google Fonts).
   ───────────────────────────────────────────────────────────────────────── */
