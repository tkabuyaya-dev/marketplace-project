import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check, ArrowLeft, ArrowRight, Lock, MapPin, Camera, FileText, X,
  ChevronDown, Sparkles, Store, Package, Rocket,
} from 'lucide-react';
import { SellerDetails } from '../types';
import { CITIES_BY_COUNTRY } from '../data/locations';
import { getCountryFlag } from '../constants';
import { registerSeller, updateUserProfile } from '../services/firebase';
import { uploadImage } from '../services/cloudinary';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { useCategories } from '../hooks/useCategories';
import { verifyRecaptcha, loadRecaptchaScript } from '../services/recaptcha';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useActiveCountries } from '../hooks/useActiveCountries';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const COUNTRY_DIAL_CODES: Record<string, string> = {
  bi: '+257',
  cd: '+243',
  rw: '+250',
  // Pays scaffolded — activation via Firestore admin
  tz: '+255',
  ke: '+254',
  ug: '+256',
};

const STEPS = [1, 2, 3, 4] as const;

const CATEGORY_ICONS: Record<string, string> = {
  'Bijoux': '💎',
  'Mode & Accessoires': '👗',
  'Mode': '👗',
  'Artisanat': '🧵',
  'Électronique': '📱',
  'Electronique': '📱',
  'Beauté': '💄',
  'Beaute': '💄',
  'Maison': '🏠',
  'Services': '🛎️',
  'Alimentation': '🍲',
  'Sports': '⚽',
};
const getCategoryIcon = (name: string) => CATEGORY_ICONS[name] || '🏷️';

const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <span
    className="inline-block animate-spin rounded-full border-2 border-current/30 border-t-current"
    style={{ width: size, height: size }}
    aria-hidden
  />
);

const Logomark = () => (
  <div className="flex items-center gap-2.5">
    <div
      className="w-9 h-9 rounded-[10px] flex items-center justify-center font-black text-[18px] text-white"
      style={{
        background: 'linear-gradient(135deg,#F5C842 0%, #E8A800 55%, #B07410 100%)',
        boxShadow: '0 4px 14px rgba(245,200,66,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
        letterSpacing: '-0.04em',
      }}
    >
      N
    </div>
    <div className="text-[15px] font-black tracking-tight text-ink">NUNULIA</div>
  </div>
);

const TopBar = () => (
  <header className="sticky top-0 z-30 bg-white border-b border-black/[0.06]">
    <div className="h-14 max-w-3xl mx-auto px-4 flex items-center justify-between">
      <Logomark />
      <LanguageSwitcher compact />
    </div>
  </header>
);

const Label: React.FC<{
  children: React.ReactNode;
  optional?: boolean;
  count?: number;
  max?: number;
}> = ({ children, optional, count, max }) => (
  <div className="flex items-end justify-between mb-1.5">
    <span className="text-[11px] font-bold uppercase tracking-[0.10em] text-muted">{children}</span>
    <div className="flex items-center gap-2">
      {optional && (
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Optionnel</span>
      )}
      {typeof count === 'number' && (
        <span className="text-[11px] font-bold text-muted tabular-nums">
          {count}/{max}
        </span>
      )}
    </div>
  </div>
);

type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
};
const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ leftAdornment, rightAdornment, className = '', ...rest }, ref) => (
    <div className="relative flex items-stretch">
      {leftAdornment}
      <input
        ref={ref}
        className={`flex-1 h-12 px-4 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink placeholder:text-muted focus-gold transition-all duration-150 ${leftAdornment ? 'rounded-l-none' : ''} ${rightAdornment ? 'pr-10' : ''} ${className}`}
        {...rest}
      />
      {rightAdornment && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
          {rightAdornment}
        </div>
      )}
    </div>
  )
);
TextInput.displayName = 'TextInput';

const SelectInput: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <div className="relative">
    <select
      className={`w-full h-12 pl-4 pr-10 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink focus-gold appearance-none transition-all duration-150 ${className}`}
      {...rest}
    >
      {children}
    </select>
    <ChevronDown
      size={16}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none"
    />
  </div>
);

const GhostBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-1.5 h-12 px-4 rounded-input text-[14px] font-semibold text-ink2 hover:text-ink hover:bg-fieldRest press transition ${className}`}
    {...rest}
  >
    {children}
  </button>
);

const GoldCTA: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
> = ({ children, disabled, loading, className = '', ...rest }) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`relative w-full rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
      disabled || loading
        ? 'bg-fieldRest text-muted cursor-not-allowed'
        : 'bg-gold-400 hover:bg-goldHov text-ink shadow-gold'
    } ${className}`}
    style={{ height: 52 }}
    {...rest}
  >
    {loading && <Spinner size={16} />}
    {children}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ step: number; labels: string[] }> = ({ step, labels }) => {
  const fillPct = ((Math.max(step - 1, 0)) / (STEPS.length - 1)) * 100;
  return (
    <div className="mt-6 mb-5 px-4">
      <div className="relative max-w-md mx-auto">
        <div className="absolute left-5 right-5 top-4 h-[2px] bg-black/[0.10] rounded-full" />
        <div
          className="absolute left-5 top-4 h-[2px] rounded-full"
          style={{
            width: `calc((100% - 40px) * ${fillPct / 100})`,
            background: '#10B981',
            transition: 'width 500ms ease-out',
          }}
        />
        <div className="relative flex items-start justify-between">
          {STEPS.map((n, idx) => {
            const completed = step > n;
            const active = step === n;
            return (
              <div key={n} className="flex flex-col items-center gap-2 w-[40px]">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black transition-all duration-300 ${
                    completed
                      ? 'bg-emerald-500 text-white'
                      : active
                      ? 'bg-gold-400 text-ink shadow-gold animate-pop'
                      : 'bg-white text-muted border border-black/[0.15]'
                  }`}
                >
                  {completed ? <Check size={16} strokeWidth={2.5} /> : n}
                </div>
                <span
                  className={`text-[10.5px] font-bold tracking-wide ${
                    active ? 'text-ink' : completed ? 'text-emerald-500' : 'text-muted'
                  }`}
                >
                  {labels[idx]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────────────────────

interface CountryOption {
  id: string;
  name: string;
  flag: string;
}

interface Step1Props {
  form: SellerDetails;
  name: string;
  onName: (v: string) => void;
  onChange: (field: keyof SellerDetails, value: any, mirror?: boolean) => void;
  onCountry: (id: string) => void;
  countries: CountryOption[];
  cityList: string[];
  onNext: () => void;
}

const Step1Profile: React.FC<Step1Props> = ({
  form, name, onName, onChange, onCountry, countries, cityList, onNext,
}) => {
  const country = countries.find(c => c.id === form.countryId) || countries[0];
  const dialCode = COUNTRY_DIAL_CODES[form.countryId] || '';
  const canNext = name.trim() && form.cni.trim() && form.phone.trim() && form.province;
  const initials =
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">
          Votre identité
        </h2>
        <p className="text-[13.5px] text-ink2 mt-1">
          Ces informations resteront confidentielles.
        </p>
      </div>

      <div className="flex items-center gap-4 mb-6 p-3 rounded-input bg-canvas">
        <div
          className="relative w-14 h-14 rounded-full flex items-center justify-center font-black text-[18px] text-white shrink-0"
          style={{
            background: 'linear-gradient(135deg,#F5C842,#B07410)',
            boxShadow:
              '0 6px 18px rgba(245,200,66,0.40), inset 0 1px 0 rgba(255,255,255,0.30)',
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-black tracking-tight leading-tight">
            Bonjour, {name || 'vendeur'} !
          </div>
          <div className="text-[13px] text-ink2 mt-0.5">
            Vous pouvez modifier votre nom ci-dessous.
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Nom complet</Label>
          <TextInput
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Prénom Nom"
            maxLength={100}
          />
        </div>

        <div>
          <Label>Pays d'activité</Label>
          <div className="relative">
            <select
              value={form.countryId}
              onChange={(e) => onCountry(e.target.value)}
              className="w-full h-12 pl-12 pr-10 rounded-input bg-fieldRest border border-transparent text-[15px] font-medium text-ink focus-gold appearance-none transition-all duration-150"
            >
              {countries.map(c => (
                <option key={c.id} value={c.id}>
                  {getCountryFlag(c)} &nbsp;{c.name}
                </option>
              ))}
            </select>
            {country && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none">
                {getCountryFlag(country)}
              </span>
            )}
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none"
            />
          </div>
        </div>

        <div>
          <Label>Numéro CNI / Passeport</Label>
          <TextInput
            value={form.cni}
            onChange={(e) => onChange('cni', e.target.value)}
            placeholder="Ex : AB 123456"
            rightAdornment={<Lock size={14} />}
          />
        </div>

        <div>
          <Label>Téléphone WhatsApp</Label>
          <TextInput
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="79 412 887"
            leftAdornment={
              dialCode ? (
                <div
                  className="inline-flex items-center gap-1.5 h-12 px-3 rounded-l-input border-r border-black/[0.08] text-[14px] font-bold text-ink"
                  style={{ background: 'rgba(245,200,66,0.12)' }}
                >
                  {country && <span>{getCountryFlag(country)}</span>}
                  <span className="tabular-nums">{dialCode}</span>
                </div>
              ) : undefined
            }
          />
        </div>

        <div>
          <Label>Ville <span className="text-red-500">*</span></Label>
          <SelectInput
            required
            value={form.province}
            onChange={(e) => onChange('province', e.target.value, true)}
          >
            <option value="">Sélectionnez votre ville</option>
            {cityList.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        </div>

        <div>
          <Label optional>Quartier / Adresse</Label>
          <TextInput
            value={form.quartier}
            onChange={(e) => onChange('quartier', e.target.value)}
            placeholder="Ex : Rohero, Centre-ville…"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1.5 text-[11.5px] text-muted">
        <Lock size={12} /> Vos données sont chiffrées et protégées.
      </div>

      <div className="mt-6">
        <GoldCTA disabled={!canNext} onClick={onNext}>
          Continuer <ArrowRight size={16} />
        </GoldCTA>
      </div>
    </div>
  );
};

interface SellerTypeCardProps {
  value: 'shop' | 'street' | 'online';
  current: 'shop' | 'street' | 'online';
  onClick: (v: 'shop' | 'street' | 'online') => void;
  icon: string;
  title: string;
  sub?: string;
  badge?: string;
}
const SellerTypeCard: React.FC<SellerTypeCardProps> = ({
  value, current, onClick, icon, title, sub, badge,
}) => {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`lift text-left rounded-card p-4 press border-[1.5px] relative ${
        selected
          ? 'border-gold-400'
          : 'border-black/[0.10] hover:border-black/[0.20] bg-white'
      }`}
      style={
        selected
          ? { background: 'rgba(245,200,66,0.06)', boxShadow: '0 6px 18px rgba(245,200,66,0.20)' }
          : undefined
      }
    >
      <div className="text-[28px] leading-none">{icon}</div>
      <div className="mt-3 text-[14.5px] font-black leading-tight">{title}</div>
      {sub && <div className="text-[12px] text-ink2 mt-0.5 leading-snug">{sub}</div>}
      {badge && (
        <div
          className="mt-2 inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] font-bold uppercase tracking-wide"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}
        >
          {badge}
        </div>
      )}
      {selected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold-400 flex items-center justify-center shadow-gold animate-pop">
          <Check size={13} strokeWidth={2.5} />
        </div>
      )}
    </button>
  );
};

interface Step2Props {
  form: SellerDetails;
  categories: string[];
  onChange: (field: keyof SellerDetails, value: any) => void;
  onToggleCat: (cat: string) => void;
  onCaptureGPS: () => void;
  gpsLoading: boolean;
  shopPhoto: File | undefined;
  onShopPhoto: (f: File | null) => void;
  onBack: () => void;
  onNext: () => void;
}
const Step2Shop: React.FC<Step2Props> = ({
  form, categories, onChange, onToggleCat, onCaptureGPS, gpsLoading,
  shopPhoto, onShopPhoto, onBack, onNext,
}) => {
  const needsGPS = form.sellerType === 'shop';
  const hasGPS = !!form.gps;
  const canNext =
    !!form.shopName?.trim() &&
    !!form.sellerType &&
    form.categories.length >= 1 &&
    (!needsGPS || (hasGPS && !!shopPhoto));

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">
          Votre activité
        </h2>
        <p className="text-[13.5px] text-ink2 mt-1">
          Présentez votre boutique aux acheteurs.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <Label count={form.shopName?.length || 0} max={60}>
            Nom de la boutique
          </Label>
          <TextInput
            value={form.shopName || ''}
            onChange={(e) => onChange('shopName', e.target.value.slice(0, 60))}
            placeholder="Ex : Bijoux Kigali, Mode Buja…"
          />
        </div>

        <div>
          <Label>Type de vendeur</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <SellerTypeCard
              value="shop"
              current={form.sellerType}
              onClick={(v) => onChange('sellerType', v)}
              icon="🏪"
              title="Boutique physique"
              sub="Local fixe"
              badge="GPS requis"
            />
            <SellerTypeCard
              value="street"
              current={form.sellerType}
              onClick={(v) => onChange('sellerType', v)}
              icon="🚶"
              title="Ambulant"
              sub="Aucune contrainte"
            />
            <SellerTypeCard
              value="online"
              current={form.sellerType}
              onClick={(v) => onChange('sellerType', v)}
              icon="🌐"
              title="En ligne uniquement"
              sub="Aucune contrainte"
            />
          </div>
        </div>

        {needsGPS && (
          <div
            className="rounded-card p-4 animate-fadein"
            style={{
              background: 'rgba(245,200,66,0.06)',
              border: '1px solid rgba(245,200,66,0.25)',
            }}
          >
            <div className="text-[13px] font-black text-ink mb-3 inline-flex items-center gap-1.5">
              <MapPin size={14} className="text-goldDeep" /> Localisation de votre boutique
            </div>
            <button
              type="button"
              onClick={onCaptureGPS}
              disabled={gpsLoading}
              className={`w-full h-12 rounded-input font-bold text-[14px] inline-flex items-center justify-center gap-2 press transition ${
                hasGPS ? 'text-emerald-600' : 'text-ink bg-gold-400 hover:bg-goldHov shadow-gold'
              }`}
              style={
                hasGPS
                  ? { background: 'rgba(16,185,129,0.10)', border: '1px solid #10B981' }
                  : undefined
              }
            >
              {gpsLoading ? (
                <Spinner size={14} />
              ) : hasGPS ? (
                <Check size={14} strokeWidth={2.5} />
              ) : (
                <MapPin size={14} />
              )}
              {gpsLoading
                ? 'Capture en cours…'
                : hasGPS && form.gps
                ? `Position capturée : ${form.gps.lat.toFixed(4)}, ${form.gps.lng.toFixed(4)}`
                : 'Capturer ma position GPS'}
            </button>
            <div className="text-[11px] text-muted mt-2">
              Votre adresse exacte ne sera pas publiée — utilisée pour les recherches à proximité.
            </div>

            <label
              className="mt-4 block cursor-pointer rounded-input text-center p-4 transition press"
              style={{
                border: '1.5px dashed rgba(245,200,66,0.40)',
                background: 'rgba(255,255,255,0.55)',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) onShopPhoto(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onShopPhoto(e.target.files[0])}
              />
              {shopPhoto ? (
                <div className="flex items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-input shrink-0 stripey"
                    style={{ background: '#F5E9C8' }}
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13.5px] font-bold truncate">
                      {shopPhoto.name || 'boutique.jpg'}
                    </div>
                    <div className="text-[11.5px] text-emerald-600 font-semibold">
                      ✓ Téléversée
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onShopPhoto(null);
                    }}
                    className="w-7 h-7 rounded-full bg-white text-red-500 inline-flex items-center justify-center press"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Camera size={28} strokeWidth={1.5} className="text-goldDeep" />
                  <div className="text-[13.5px] font-bold text-ink">
                    Photo de votre boutique
                  </div>
                  <div className="text-[11.5px] text-muted">JPG, PNG · max 5 MB</div>
                </div>
              )}
            </label>
          </div>
        )}

        <div>
          <Label>Vos catégories de vente (1 minimum)</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => {
              const on = form.categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onToggleCat(cat)}
                  className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12.5px] font-bold transition press border ${
                    on
                      ? 'text-ink border-transparent shadow-gold'
                      : 'bg-white text-ink2 border-black/[0.10] hover:border-black/[0.20]'
                  }`}
                  style={on ? { background: '#F5C842', animation: 'pop 180ms ease-out' } : undefined}
                >
                  <span>{getCategoryIcon(cat)}</span>
                  {cat}
                  {on && <Check size={12} strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11.5px] text-muted">
            {form.categories.length} catégorie
            {form.categories.length > 1 ? 's' : ''} sélectionnée
            {form.categories.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <GhostBtn onClick={onBack}>
          <ArrowLeft size={14} /> Retour
        </GhostBtn>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className={`flex-1 sm:flex-initial sm:px-8 rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
            !canNext
              ? 'bg-fieldRest text-muted cursor-not-allowed'
              : 'bg-gold-400 hover:bg-goldHov text-ink shadow-gold'
          }`}
          style={{ height: 52 }}
        >
          Continuer <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

interface Step3Props {
  form: SellerDetails;
  nifDecided: boolean;
  setHasNif: (v: boolean) => void;
  onChange: (field: keyof SellerDetails, value: any) => void;
  onBack: () => void;
  onNext: () => void;
}
const Step3Legal: React.FC<Step3Props> = ({
  form, nifDecided, setHasNif, onChange, onBack, onNext,
}) => {
  const yes = nifDecided && form.hasNif === true;
  const no = nifDecided && form.hasNif === false;

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">
          Situation légale
        </h2>
        <p className="text-[13.5px] text-ink2 mt-1">
          Optionnel — mais fortement recommandé.
        </p>
      </div>

      <div className="rounded-card border border-black/[0.07] bg-white p-4 sm:p-5">
        <div className="text-[15px] font-bold text-ink">Avez-vous un NIF ?</div>
        <div className="text-[12.5px] text-ink2 mt-0.5">
          Numéro d'Identification Fiscale délivré par votre administration.
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => setHasNif(true)}
            className={`lift rounded-card p-4 text-left border-[1.5px] press ${
              yes ? 'border-emerald-500' : 'border-black/[0.10] hover:border-black/[0.20] bg-white'
            }`}
            style={yes ? { background: 'rgba(16,185,129,0.06)' } : undefined}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  yes ? 'bg-emerald-500 text-white' : 'bg-fieldRest text-ink2'
                }`}
              >
                <Check size={14} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[14.5px] font-black">Oui</div>
                <div className="text-[12px] text-ink2">J'ai un NIF</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setHasNif(false)}
            className={`lift rounded-card p-4 text-left border-[1.5px] press ${
              no ? 'border-amber-500' : 'border-black/[0.10] hover:border-black/[0.20] bg-white'
            }`}
            style={no ? { background: 'rgba(245,158,11,0.06)' } : undefined}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  no ? 'bg-amber-500 text-white' : 'bg-fieldRest text-ink2'
                }`}
              >
                <X size={14} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[14.5px] font-black">Non</div>
                <div className="text-[12px] text-ink2">Pas encore</div>
              </div>
            </div>
          </button>
        </div>

        {yes && (
          <div className="mt-4 animate-fadein">
            <Label>Votre numéro NIF</Label>
            <TextInput
              value={form.nif || ''}
              onChange={(e) => onChange('nif', e.target.value)}
              placeholder="BI-NIF-0044812"
            />
          </div>
        )}
      </div>

      {yes ? (
        <div
          className="mt-4 rounded-card p-4 animate-fadein"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid #10B981' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[14.5px] font-black text-ink">Accès illimité aux plans</div>
              <div className="text-[12.5px] text-ink2 mt-0.5 leading-relaxed">
                Vous pourrez choisir n'importe quel plan (Starter, Pro, Elite, Unlimited) et
                accéder à toutes les fonctionnalités vendeur.
              </div>
            </div>
          </div>
        </div>
      ) : no ? (
        <div
          className="mt-4 rounded-card p-4 animate-fadein"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 text-[16px] font-black">
              !
            </div>
            <div>
              <div className="text-[14.5px] font-black text-ink">Plan Gratuit uniquement</div>
              <div className="text-[12.5px] text-ink2 mt-0.5 leading-relaxed">
                Sans NIF, votre boutique sera limitée au plan Gratuit (3 produits, badge non
                vérifié). Vous pouvez compléter plus tard dans votre tableau de bord.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <GhostBtn onClick={onBack}>
          <ArrowLeft size={14} /> Retour
        </GhostBtn>
        <button
          type="button"
          onClick={onNext}
          disabled={!nifDecided}
          className={`flex-1 sm:flex-initial sm:px-8 rounded-input font-black text-[15px] inline-flex items-center justify-center gap-2 press transition ${
            !nifDecided
              ? 'bg-fieldRest text-muted cursor-not-allowed'
              : 'bg-gold-400 hover:bg-goldHov text-ink shadow-gold'
          }`}
          style={{ height: 52 }}
        >
          Continuer <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

interface UploadZoneProps {
  label: string;
  sub: string;
  file?: File;
  onFile: (f: File) => void;
  onRemove: () => void;
}
const UploadZone: React.FC<UploadZoneProps> = ({ label, sub, file, onFile, onRemove }) => (
  <label
    className="block cursor-pointer rounded-input p-3 transition press"
    style={{
      border: file ? '1.5px solid #10B981' : '1.5px dashed rgba(0,0,0,0.12)',
      background: file ? 'rgba(16,185,129,0.04)' : '#fff',
    }}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
    }}
  >
    <input
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
    />
    <div className="flex items-center gap-3">
      <div
        className={`w-11 h-11 rounded-input flex items-center justify-center shrink-0 ${
          file ? 'bg-emerald-500/10 text-emerald-600' : 'bg-fieldRest text-ink2'
        }`}
      >
        <FileText size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-ink truncate">
          {file ? file.name : label}
        </div>
        <div className="text-[11.5px] text-muted">{file ? '✓ Prêt à envoyer' : sub}</div>
      </div>
      {file ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          className="w-8 h-8 rounded-full bg-fieldRest text-red-500 inline-flex items-center justify-center press hover:bg-red-500/10"
        >
          <X size={14} />
        </button>
      ) : (
        <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-fieldRest text-[12px] font-bold text-ink2">
          Ajouter
        </span>
      )}
    </div>
  </label>
);

interface Step4Props {
  form: SellerDetails;
  name: string;
  files: { cni?: File; nif?: File; reg?: File; shop?: File };
  onFile: (field: 'cni' | 'nif' | 'reg' | 'shop', f: File | null) => void;
  terms: boolean;
  setTerms: (v: boolean) => void;
  loading: boolean;
  onBack: () => void;
  onSubmit: () => void;
  countries: CountryOption[];
}
const Step4Finalize: React.FC<Step4Props> = ({
  form, name, files, onFile, terms, setTerms, loading, onBack, onSubmit, countries,
}) => {
  const country = countries.find(c => c.id === form.countryId);
  const sellerTypeLabel: Record<string, string> = {
    shop: 'Boutique physique',
    street: 'Ambulant',
    online: 'En ligne uniquement',
  };

  const recap = [
    { i: '👤', l: 'Nom', v: name || '—' },
    { i: '🏪', l: 'Boutique', v: form.shopName || '—' },
    { i: '📍', l: 'Ville', v: form.province ? `${form.province} ${country ? getCountryFlag(country) : ''}` : '—' },
    { i: '🏷️', l: 'Type', v: sellerTypeLabel[form.sellerType] || '—' },
    { i: '📦', l: 'Catégories', v: form.categories.join(', ') || '—' },
    { i: '📋', l: 'NIF', v: form.hasNif ? (form.nif || '—') : 'Non renseigné' },
  ];

  return (
    <div className="animate-fadein">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-tight">
          Dernière étape !
        </h2>
        <p className="text-[13.5px] text-ink2 mt-1">
          Votre boutique sera créée en quelques secondes.
        </p>
      </div>

      <div
        className="rounded-card p-4 sm:p-5"
        style={{ background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.20)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-card text-goldDeep">
            <Sparkles size={14} />
          </div>
          <div className="text-[14px] font-black">Récapitulatif</div>
        </div>
        <div className="divide-y divide-black/[0.05]">
          {recap.map((row, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <span className="text-[15px] leading-none w-5 text-center">{row.i}</span>
              <span className="text-[12px] font-bold uppercase tracking-wider text-muted w-[88px] shrink-0">
                {row.l}
              </span>
              <span className="text-[13.5px] font-semibold text-ink flex-1 text-right truncate">
                {row.v}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <Label>Pièces justificatives (optionnel)</Label>
        <div className="space-y-2.5">
          <UploadZone
            label="CNI ou Passeport"
            sub="JPG, PNG · max 10 MB"
            file={files.cni}
            onFile={(f) => onFile('cni', f)}
            onRemove={() => onFile('cni', null)}
          />
          {form.hasNif && (
            <div className="animate-fadein">
              <UploadZone
                label="Justificatif NIF"
                sub="JPG, PNG · max 10 MB"
                file={files.nif}
                onFile={(f) => onFile('nif', f)}
                onRemove={() => onFile('nif', null)}
              />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTerms(!terms)}
        className={`mt-5 w-full text-left rounded-card p-4 transition press border-[1.5px] ${
          terms ? 'border-emerald-500' : 'border-black/[0.15] bg-white'
        }`}
        style={terms ? { background: 'rgba(16,185,129,0.04)' } : undefined}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-5 h-5 rounded-[6px] border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center transition ${
              terms ? 'bg-emerald-500 border-emerald-500' : 'border-black/[0.25] bg-white'
            }`}
          >
            {terms && <Check size={12} strokeWidth={3} className="text-white" />}
          </div>
          <div className="text-[13px] leading-relaxed text-ink">
            J'accepte les{' '}
            <a
              href="/cgu"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
              style={{ color: '#A45F00' }}
              onClick={(e) => e.stopPropagation()}
            >
              Conditions Générales d'Utilisation
            </a>{' '}
            de NUNULIA et confirme que les informations fournies sont exactes. Voir aussi notre{' '}
            <a
              href="/politique-confidentialite"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
              style={{ color: '#A45F00' }}
              onClick={(e) => e.stopPropagation()}
            >
              Politique de confidentialité
            </a>
            .
          </div>
        </div>
      </button>

      <div className="mt-6">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!terms || loading}
          className={`w-full h-14 rounded-input font-black text-[16px] inline-flex items-center justify-center gap-2.5 press transition ${
            !terms || loading
              ? 'bg-fieldRest text-muted cursor-not-allowed'
              : 'bg-gold-400 hover:bg-goldHov text-ink'
          }`}
          style={terms && !loading ? { boxShadow: '0 8px 24px rgba(245,200,66,0.45)' } : undefined}
        >
          {loading ? (
            <>
              <Spinner size={18} /> Création en cours…
            </>
          ) : (
            <>
              <Rocket size={18} /> Créer ma boutique
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink2 hover:text-ink press"
        >
          <ArrowLeft size={14} /> Retour
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Success screen
// ─────────────────────────────────────────────────────────────────────────────

const SuccessScreen: React.FC<{ name: string; onGo: () => void }> = ({ name, onGo }) => (
  <div className="animate-fadein max-w-md mx-auto text-center px-4 py-10">
    <div className="relative mx-auto mb-6" style={{ width: 96, height: 96 }}>
      <div
        className="absolute inset-0 rounded-full animate-pulse-ring-green"
        style={{ background: 'rgba(16,185,129,0.12)', border: '3px solid #10B981' }}
      />
      <div
        className="relative w-24 h-24 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(16,185,129,0.12)', border: '3px solid #10B981' }}
      >
        <svg
          width="42"
          height="42"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10B981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M5 12l4 4 10-10"
            strokeDasharray="28"
            className="animate-checkdraw"
          />
        </svg>
      </div>
    </div>
    <h2 className="text-[28px] font-black tracking-tight leading-tight">
      🎉 <span className="text-gold-grad">Boutique créée !</span>
    </h2>
    <p className="mt-3 text-[15px] text-ink2">
      Bienvenue dans la famille NUNULIA, <b className="text-ink">{name}</b>.
    </p>

    <div className="mt-6 rounded-card border border-black/[0.07] bg-white p-4 text-left">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
        Prochaines étapes
      </div>
      <ul className="mt-2 space-y-2.5">
        {[
          { i: <Package size={14} />, t: 'Ajoutez vos premiers articles' },
          { i: <Store size={14} />, t: 'Personnalisez votre vitrine' },
          { i: <Sparkles size={14} />, t: 'Boostez votre visibilité' },
        ].map((s, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-fieldRest flex items-center justify-center text-ink2 shrink-0">
              {s.i}
            </div>
            <span className="text-[13.5px] font-semibold">{s.t}</span>
          </li>
        ))}
      </ul>
    </div>

    <div className="mt-6 max-w-xs mx-auto">
      <GoldCTA onClick={onGo} className="!h-14 !text-[15px]">
        Accéder à mon tableau de bord <ArrowRight size={16} />
      </GoldCTA>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export const SellerRegistration: React.FC = () => {
  const { currentUser, activeCountry } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { categories: firestoreCategories } = useCategories();
  const { countries } = useActiveCountries();

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [editName, setEditName] = useState(currentUser.name || '');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [nifDecided, setNifDecided] = useState(false);

  const [formData, setFormData] = useState<SellerDetails>({
    cni: '',
    phone: '',
    countryId: activeCountry || 'bi',
    province: '',
    commune: '',
    quartier: '',
    shopName: '',
    sellerType: 'shop',
    gps: undefined,
    categories: [],
    hasNif: false,
    hasRegistry: false,
    nif: '',
    registryNumber: '',
  });

  const [files, setFiles] = useState<{ cni?: File; nif?: File; reg?: File; shop?: File }>({});
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    loadRecaptchaScript();
  }, []);

  const regCountryIds = countries.map(c => c.id).join(',');
  useEffect(() => {
    if (countries.length > 0 && !countries.find(c => c.id === formData.countryId)) {
      setFormData(prev => ({ ...prev, countryId: countries[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regCountryIds]);

  const handleChange = (field: keyof SellerDetails, value: any, mirror?: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(mirror ? { commune: value } : {}),
    }));
  };

  const handleCountryChange = (countryId: string) => {
    setFormData(prev => ({
      ...prev,
      countryId,
      province: '',
      commune: '',
      quartier: '',
    }));
  };

  const handleFileChange = (field: 'cni' | 'nif' | 'reg' | 'shop', file: File | null) => {
    setFiles(prev => {
      const next = { ...prev };
      if (file) next[field] = file;
      else delete next[field];
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const exists = prev.categories.includes(cat);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter(c => c !== cat)
          : [...prev.categories, cat],
      };
    });
  };

  const setHasNif = (v: boolean) => {
    setNifDecided(true);
    setFormData(prev => ({ ...prev, hasNif: v, nif: v ? prev.nif : '' }));
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast(t('registration.gpsNotSupported'), 'error');
      return;
    }
    if (
      location.protocol !== 'https:' &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1'
    ) {
      toast(t('registration.gpsNeedsHttps'), 'error');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          gps: { lat: position.coords.latitude, lng: position.coords.longitude },
        }));
        toast(t('registration.gpsCapturedSuccess'), 'success');
        setGpsLoading(false);
      },
      (error) => {
        console.error('[GPS]', error.code, error.message);
        let msg = t('registration.gpsErrorGeneric');
        switch (error.code) {
          case 1: msg = t('registration.gpsErrorDenied'); break;
          case 2: msg = t('registration.gpsErrorUnavailable'); break;
          case 3: msg = t('registration.gpsErrorTimeout'); break;
        }
        toast(msg, 'error');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async () => {
    if (!acceptedTerms) {
      toast(t('registration.termsRequired'), 'error');
      return;
    }

    setLoading(true);

    try {
      const passed = await verifyRecaptcha('seller_registration');
      if (!passed) {
        toast(t('registration.securityFailed'), 'error');
        setLoading(false);
        return;
      }
      if (formData.sellerType === 'shop' && !formData.gps) {
        toast(t('registration.gpsRequired'), 'error');
        setStep(2);
        setLoading(false);
        return;
      }
      if (formData.sellerType === 'shop' && !files.shop) {
        toast(t('registration.shopPhotoRequired'), 'error');
        setStep(2);
        setLoading(false);
        return;
      }

      const documents: any = {};
      if (files.cni)
        documents.cniUrl = await uploadImage(files.cni, { folder: 'aurabuja-app-2026/documents' });
      if (files.nif)
        documents.nifUrl = await uploadImage(files.nif, { folder: 'aurabuja-app-2026/documents' });
      if (files.reg)
        documents.registryUrl = await uploadImage(files.reg, {
          folder: 'aurabuja-app-2026/documents',
        });

      let shopImageUrl = '';
      if (files.shop)
        shopImageUrl = await uploadImage(files.shop, { folder: 'aurabuja-app-2026/shops' });

      const finalData = { ...formData, documents, shopImage: shopImageUrl };

      if (editName.trim() && editName.trim() !== currentUser.name) {
        await updateUserProfile(currentUser.id, { name: editName.trim() });
      }

      await registerSeller(currentUser.id, finalData);
      setDone(true);
    } catch (error: any) {
      console.error('Registration error:', error);
      toast(error?.message || t('registration.registrationError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const cityList = CITIES_BY_COUNTRY[formData.countryId] ?? [];
  const categoryNames = firestoreCategories.map(c => c.name);

  const stepLabels = [
    t('registration.stepProfile', 'Profil'),
    t('registration.stepShop', 'Boutique'),
    t('registration.stepLegal', 'Légal'),
    t('registration.stepFinalize', 'Finaliser'),
  ];

  if (done) {
    return (
      <div className="min-h-screen bg-canvas">
        <TopBar />
        <SuccessScreen
          name={editName || currentUser.name}
          onGo={() => navigate('/dashboard')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-12">
      <TopBar />

      <section className="max-w-lg mx-auto px-4 pt-7 sm:pt-10 text-center">
        <h1 className="text-[26px] sm:text-[30px] font-black tracking-tight leading-[1.15] text-gold-grad">
          {t('registration.title')}
        </h1>
        <p className="mt-2 text-[14.5px] sm:text-[15px] text-ink2 max-w-sm mx-auto">
          {t('registration.subtitle')}
        </p>
      </section>

      <ProgressBar step={step} labels={stepLabels} />

      <main className="max-w-lg mx-auto px-4">
        <div className="bg-white rounded-modal border border-black/[0.07] shadow-cardLg p-6 sm:p-8">
          {step === 1 && (
            <Step1Profile
              form={formData}
              name={editName}
              onName={setEditName}
              onChange={handleChange}
              onCountry={handleCountryChange}
              countries={countries}
              cityList={cityList}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Shop
              form={formData}
              categories={categoryNames}
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
              nifDecided={nifDecided}
              setHasNif={setHasNif}
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
              terms={acceptedTerms}
              setTerms={setAcceptedTerms}
              loading={loading}
              countries={countries}
              onBack={() => setStep(3)}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        <div className="text-center mt-5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-[13px] font-semibold text-muted hover:text-ink2 press"
          >
            {t('registration.cancel')}
          </button>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted px-2.5 h-7 rounded-full bg-white border border-black/[0.06]">
            <Lock size={11} /> Connexion sécurisée · Vos données restent en Afrique
          </div>
        </div>
      </main>
    </div>
  );
};

export default SellerRegistration;
