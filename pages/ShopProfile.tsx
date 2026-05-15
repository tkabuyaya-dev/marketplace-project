import React, { useEffect, useState, Suspense, lazy, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Share2, MoreHorizontal, Star, Check,
  Phone, ChevronRight, ChevronDown, MapPin, Package,
  Zap, ShieldCheck, Calendar,
} from 'lucide-react';
import { User, Product } from '../types';
import { getSellerProducts, getUserBySlugOrId, subscribeToUserProfile } from '../services/firebase';
import { ProductCard } from '../components/ProductCard';
import { useAppContext } from '../contexts/AppContext';
import { updateMetaTags } from '../utils/meta';
import { getOptimizedUrl } from '../services/cloudinary';
import { UnverifiedSellerNotice } from '../components/UnverifiedSellerNotice';

const ShopMap    = lazy(() => import('../components/ShopMap'));
const ShopSearch = lazy(() => import('../components/ShopSearch'));

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const COUNTRY_NAMES: Record<string, string> = {
  bi: 'Burundi', cd: 'RD Congo', rw: 'Rwanda', tz: 'Tanzanie', ke: 'Kenya', ug: 'Ouganda',
};
const COVER_GRADIENT = 'linear-gradient(135deg,#C47E00 0%,#E8A920 50%,#F5C842 100%)';

function joinDateLabel(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function joinYear(ts: number): number { return new Date(ts).getFullYear(); }
function avgRating(products: Product[]): number {
  const rated = products.filter(p => p.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((s, p) => s + p.rating, 0) / rated.length;
}

// ─── FloatingCircle ─────────────────────────────────────────────────────────

function FloatingCircle({
  children, onClick, ariaLabel, style,
}: {
  children: React.ReactNode; onClick?: () => void;
  ariaLabel: string; style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute w-9 h-9 rounded-full bg-white border-none cursor-pointer
                 flex items-center justify-center z-[4] active:scale-95 transition-transform"
      style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08)', ...style }}
    >
      {children}
    </button>
  );
}

// ─── HeroCover ──────────────────────────────────────────────────────────────

function HeroCover({
  bannerUrl, shopName,
  onBack, onShare, onMenu,
}: {
  bannerUrl?: string; shopName: string;
  onBack?: () => void; onShare?: () => void; onMenu?: () => void;
}) {
  const topPx = 12;
  const topStyle = `calc(env(safe-area-inset-top, 0px) + ${topPx}px)`;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 180 }}>
      {bannerUrl ? (
        <img
          src={getOptimizedUrl(bannerUrl, 800)}
          alt={shopName}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: COVER_GRADIENT }} />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(60deg, transparent, transparent 22px, rgba(255,255,255,0.07) 22px, rgba(255,255,255,0.07) 24px)',
            }}
          />
          <div
            className="absolute -top-10 -right-10 w-[200px] h-[200px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)' }}
          />
        </>
      )}
      {/* bottom fade */}
      <div
        className="absolute left-0 right-0 bottom-0 h-14 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%)' }}
      />

      <FloatingCircle ariaLabel="Retour" onClick={onBack} style={{ top: topStyle, left: 14 }}>
        <ArrowLeft size={17} color="#111318" strokeWidth={2.2} />
      </FloatingCircle>
      <FloatingCircle ariaLabel="Partager" onClick={onShare} style={{ top: topStyle, right: 56 }}>
        <Share2 size={14} color="#111318" strokeWidth={2} />
      </FloatingCircle>
      <FloatingCircle ariaLabel="Plus" onClick={onMenu} style={{ top: topStyle, right: 14 }}>
        <MoreHorizontal size={15} color="#111318" strokeWidth={2.2} />
      </FloatingCircle>
    </div>
  );
}

// ─── VerifiedPill ────────────────────────────────────────────────────────────

function VerifiedPill({ kind, label }: { kind: 'check' | 'phone'; label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-[10.5px] font-bold"
      style={{
        background: 'rgba(34,197,94,0.10)',
        border: '1px solid rgba(34,197,94,0.28)',
        color: '#0c8a48',
      }}
    >
      {kind === 'check' ? (
        <span className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: '#22c55e' }}>
          <Check size={7} color="#fff" strokeWidth={4} />
        </span>
      ) : (
        <Phone size={10} color="#0c8a48" strokeWidth={2.4} />
      )}
      <span>{label}</span>
    </div>
  );
}

// ─── IdentityCard ────────────────────────────────────────────────────────────

function IdentityCard({
  seller, productsCount, rating,
}: {
  seller: User; productsCount: number; rating: number;
}) {
  const shopName = seller.sellerDetails?.shopName || seller.name;
  const initials  = shopName.slice(0, 2).toUpperCase();
  const tier      = seller.verificationTier;
  const phoneVerified = tier === 'phone' || tier === 'identity' || tier === 'shop';
  const identityVerified = tier === 'identity' || tier === 'shop';
  const shopVerified  = tier === 'shop';

  return (
    <div
      className="relative z-[2] mx-3 -mt-8 px-4 pb-[18px] bg-white rounded-2xl"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)' }}
    >
      {/* Avatar */}
      <div className="flex justify-center -mt-8">
        {seller.avatar ? (
          <img
            src={getOptimizedUrl(seller.avatar, 160)}
            alt={shopName}
            className="w-[72px] h-[72px] rounded-full object-cover"
            style={{ border: '3px solid #fff', boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}
          />
        ) : (
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white font-black"
            style={{
              fontSize: 22, letterSpacing: '-0.02em',
              border: '3px solid #fff',
              background: 'linear-gradient(135deg,#D97757 0%,#B05B3D 60%,#7A3D29 100%)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Name */}
      <h1
        className="mt-2.5 text-center text-[#111318] font-black leading-[1.1]"
        style={{ fontSize: 22, letterSpacing: '-0.035em' }}
      >
        {shopName}
      </h1>

      {/* Bio / tagline */}
      {seller.bio && (
        <p className="mt-1 text-center text-[13px] font-medium leading-[1.4]" style={{ color: '#5C6370' }}>
          {seller.bio}
        </p>
      )}

      {/* Verified pills */}
      {(phoneVerified || identityVerified || shopVerified) && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {identityVerified && <VerifiedPill kind="check" label="Identité" />}
          {shopVerified     && <VerifiedPill kind="check" label="Boutique" />}
          {phoneVerified    && <VerifiedPill kind="phone" label="Téléphone" />}
        </div>
      )}

      {/* Trust row */}
      <div
        className="mt-3.5 pt-3 flex justify-center items-center gap-2.5"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        {rating > 0 && (
          <>
            <span className="flex items-center gap-1">
              <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={2} />
              <span className="text-[11px] font-extrabold text-[#111318]">{rating.toFixed(1)}</span>
              <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: '.06em' }}>Note</span>
            </span>
            <span className="w-[3px] h-[3px] rounded-full" style={{ background: '#D0D2D8' }} />
          </>
        )}
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-extrabold text-[#111318]">{productsCount}</span>
          <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: '.06em' }}>Produits</span>
        </span>
        <span className="w-[3px] h-[3px] rounded-full" style={{ background: '#D0D2D8' }} />
        <span className="flex items-center gap-1">
          <span className="text-[9.5px] font-bold text-[#9EA5B0] uppercase" style={{ letterSpacing: '.06em' }}>Depuis</span>
          <span className="text-[11px] font-extrabold text-[#111318]">{joinYear(seller.joinDate)}</span>
        </span>
      </div>
    </div>
  );
}

// ─── TrustMetrics ────────────────────────────────────────────────────────────

function TrustMetrics({ seller, productsCount }: { seller: User; productsCount: number }) {
  const hasWhatsApp = !!seller.whatsapp;
  const isVerified  = !!seller.isVerified;

  return (
    <div
      className="mx-3 mt-2.5 px-2 py-3 bg-white rounded-2xl flex items-stretch"
      style={{ border: '1px solid rgba(0,0,0,0.06)' }}
    >
      <MetricCol
        icon={<Zap size={14} color="#C47E00" fill="#C47E00" strokeWidth={0} />}
        big={hasWhatsApp ? 'WhatsApp' : 'Contacter'}
        small="Répond via"
      />
      <div className="w-px my-1.5" style={{ background: 'rgba(0,0,0,0.06)' }} />
      <MetricCol
        icon={<Package size={14} color="#C47E00" strokeWidth={2.2} />}
        big={`${productsCount}`}
        small="Articles"
      />
      <div className="w-px my-1.5" style={{ background: 'rgba(0,0,0,0.06)' }} />
      <MetricCol
        icon={<ShieldCheck size={14} color="#C47E00" strokeWidth={2.2} />}
        big={isVerified ? 'Vérifié' : 'Standard'}
        small="Compte"
      />
    </div>
  );
}

function MetricCol({ icon, big, small }: { icon: React.ReactNode; big: string; small: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5 px-1 py-0.5">
      <div
        className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center"
        style={{ background: 'rgba(245,200,66,0.12)' }}
      >
        {icon}
      </div>
      <div
        className="text-center text-[#111318] font-extrabold leading-[1.1]"
        style={{ fontSize: 12.5, letterSpacing: '-0.015em' }}
      >
        {big}
      </div>
      <div
        className="text-center text-[#9EA5B0] uppercase font-semibold leading-[1.1]"
        style={{ fontSize: 10, letterSpacing: '0.02em' }}
      >
        {small}
      </div>
    </div>
  );
}

// ─── ContactCTAs ─────────────────────────────────────────────────────────────

function ContactCTAs({ onWhatsApp, onLocation }: { onWhatsApp?: () => void; onLocation?: () => void }) {
  return (
    <div className="mx-3 mt-2.5 flex flex-col gap-2">
      <button
        type="button"
        onClick={onWhatsApp}
        className="h-12 w-full rounded-2xl border-none cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99] transition-transform"
        style={{
          background: '#25D366',
          boxShadow: '0 6px 16px rgba(37,211,102,0.35), 0 2px 4px rgba(37,211,102,0.18)',
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span className="text-white font-extrabold" style={{ fontSize: 14.5, letterSpacing: '-0.01em' }}>
          Contacter sur WhatsApp
        </span>
      </button>

      {onLocation && (
        <button
          type="button"
          onClick={onLocation}
          className="h-[42px] w-full rounded-2xl bg-white cursor-pointer flex items-center justify-center gap-1.5 active:bg-[#FFFBEC] transition-colors"
          style={{ border: '1.5px solid #F5C842' }}
        >
          <MapPin size={13} color="#C47E00" strokeWidth={2.2} />
          <span className="font-extrabold" style={{ fontSize: 13, color: '#C47E00', letterSpacing: '-0.01em' }}>
            Voir localisation
          </span>
        </button>
      )}
    </div>
  );
}

// ─── CategoryChipsBar ────────────────────────────────────────────────────────

function CategoryChipsBar({
  categories, selected, onSelect,
}: { categories: string[]; selected: string; onSelect: (c: string) => void }) {
  return (
    <div
      className="mt-3 flex gap-1.5 px-3 pb-1 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {['Tout', ...categories].map((c) => {
        const active = c === selected;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className="flex-shrink-0 inline-flex items-center px-3.5 h-8 rounded-full cursor-pointer transition-all duration-150 border-none"
            style={{
              background: active ? '#F5C842' : '#FFFFFF',
              border: active ? 'none' : '1px solid rgba(0,0,0,0.08)',
              boxShadow: active ? '0 2px 8px rgba(245,200,66,0.35)' : 'none',
              color: active ? '#111318' : '#5C6370',
              fontWeight: active ? 800 : 600,
              fontSize: 12,
              letterSpacing: '-0.01em',
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

// ─── AboutSection ────────────────────────────────────────────────────────────

function AboutSection({ seller }: { seller: User }) {
  const [open, setOpen] = useState(false);
  const city    = seller.sellerDetails?.commune || seller.sellerDetails?.province || '';
  const country = COUNTRY_NAMES[seller.sellerDetails?.countryId || ''] || '';
  const location = [city, country].filter(Boolean).join(', ');

  return (
    <div
      className="mx-3 mt-3.5 px-4 py-3.5 bg-white rounded-2xl"
      style={{ border: '1px solid rgba(0,0,0,0.06)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
      >
        <span className="text-[14px] font-extrabold text-[#111318]" style={{ letterSpacing: '-0.01em' }}>
          À propos de la boutique
        </span>
        <span
          className="inline-flex transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <ChevronDown size={14} color="#9EA5B0" strokeWidth={2.4} />
        </span>
      </button>

      {open && (
        <div className="mt-2.5">
          {seller.bio && (
            <p className="font-medium leading-[1.55]" style={{ fontSize: 13, color: '#5C6370' }}>
              {seller.bio}
            </p>
          )}
          <div
            className="mt-3 pt-2.5 flex flex-col gap-1.5"
            style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: '#5C6370' }}>
              <Calendar size={11} color="#9EA5B0" strokeWidth={2} />
              Membre depuis {joinDateLabel(seller.joinDate)}
            </span>
            {location && (
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: '#5C6370' }}>
                <MapPin size={11} color="#9EA5B0" strokeWidth={2} />
                {location}
              </span>
            )}
          </div>

          {/* Map */}
          {seller.sellerDetails?.gps?.lat && seller.sellerDetails?.gps?.lng && (
            <div className="mt-3 rounded-xl overflow-hidden" style={{ height: 160 }}>
              <Suspense fallback={<div className="h-40 bg-gray-100 rounded-xl animate-pulse" />}>
                <ShopMap
                  coordinates={seller.sellerDetails.gps}
                  shopName={seller.sellerDetails.shopName || seller.name}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="h-[180px] animate-pulse" style={{ background: COVER_GRADIENT, opacity: 0.5 }} />
      <div className="mx-3 -mt-8 bg-white rounded-2xl p-4 animate-pulse" style={{ border: '1px solid rgba(0,0,0,0.04)' }}>
        <div className="flex justify-center -mt-8 mb-3">
          <div className="w-[72px] h-[72px] rounded-full bg-gray-200" />
        </div>
        <div className="h-5 bg-gray-200 rounded-full w-2/3 mx-auto mb-2" />
        <div className="h-3 bg-gray-100 rounded-full w-1/2 mx-auto" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const ShopProfile: React.FC = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const location     = useLocation();
  const navigate     = useNavigate();
  const { handleContactSeller } = useAppContext();
  const { t } = useTranslation();

  const [seller, setSeller]               = useState<User | null>(location.state?.seller || null);
  const [loading, setLoading]             = useState(!seller);
  const [notFound, setNotFound]           = useState(false);
  const [products, setProducts]           = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Tout');

  // Load seller + subscribe to real-time updates
  useEffect(() => {
    if (!slugOrId) return;
    let unsub: (() => void) | null = null;

    const load = async () => {
      if (!seller) setLoading(true);
      const u = await getUserBySlugOrId(slugOrId);
      if (u) {
        setSeller(u);
        unsub = subscribeToUserProfile(u.id, (updated) => setSeller(updated));
      } else if (!seller) {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();

    return () => { if (unsub) unsub(); };
  }, [slugOrId]);

  // Load products + meta tags
  useEffect(() => {
    if (!seller) return;
    updateMetaTags({
      title: seller.sellerDetails?.shopName || seller.name,
      description: seller.bio || t('shopProfile.shopOnNunulia'),
      image: seller.avatar,
      url: window.location.href,
    });
    const load = async () => {
      setLoadingProducts(true);
      const data = await getSellerProducts(seller.id);
      setProducts(data);
      setLoadingProducts(false);
    };
    load();
  }, [seller?.id]);

  const handleBack = () => {
    if (window.history.length <= 1) navigate('/');
    else navigate(-1);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shopName = seller?.sellerDetails?.shopName || seller?.name || '';
    if (navigator.share) {
      try {
        await navigator.share({ title: shopName, text: t('shopProfile.shareText', { name: shopName }), url });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleLocation = () => {
    const gps = seller?.sellerDetails?.gps;
    const locUrl = seller?.sellerDetails?.locationUrl;
    if (gps?.lat && gps?.lng) {
      window.open(`https://maps.google.com/?q=${gps.lat},${gps.lng}`, '_blank');
    } else if (locUrl) {
      window.open(locUrl, '_blank');
    }
  };

  const onProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
  };

  // Derived data
  const rating = useMemo(() => avgRating(products), [products]);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'Tout') return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const hasLocation = !!(
    seller?.sellerDetails?.gps?.lat ||
    seller?.sellerDetails?.locationUrl
  );

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  if (notFound || !seller) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-6xl">😕</div>
        <h1 className="text-xl font-bold text-[#111318]">{t('shopProfile.notFound')}</h1>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-2xl font-bold text-[#111318] border-none cursor-pointer"
          style={{ background: '#F5C842', boxShadow: '0 4px 12px rgba(245,200,66,0.4)' }}
        >
          {t('shopProfile.backToHome')}
        </button>
      </div>
    );
  }

  const bannerSrc = seller.banner || seller.sellerDetails?.shopImage;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-full pb-7 bg-[#F7F8FA]">

      {/* ── 1. COVER ── */}
      <HeroCover
        bannerUrl={bannerSrc}
        shopName={seller.sellerDetails?.shopName || seller.name}
        onBack={handleBack}
        onShare={handleShare}
        onMenu={() => {}}
      />

      {/* ── 2. IDENTITY CARD ── */}
      <IdentityCard seller={seller} productsCount={products.length} rating={rating} />

      {/* ── 3. UNVERIFIED NOTICE ── */}
      {!seller.isVerified && (
        <div className="mx-3 mt-2.5">
          <UnverifiedSellerNotice tier={seller.verificationTier} variant="banner" />
        </div>
      )}

      {/* ── 4. GRACE PHASE NOTICE ── */}
      {seller.sellerDetails?.downgradePhase === 2 && (
        <div
          className="mx-3 mt-2.5 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs"
          style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
            color: '#92400e',
          }}
        >
          <span>⏳</span>
          <span>{t('shop.gracePh2Notice', 'Certains produits sont temporairement masqués. La boutique sera pleinement disponible après renouvellement.')}</span>
        </div>
      )}

      {/* ── 5. TRUST METRICS ── */}
      <TrustMetrics seller={seller} productsCount={products.length} />

      {/* ── 6. CONTACT CTAs ── */}
      <ContactCTAs
        onWhatsApp={() => handleContactSeller(seller)}
        onLocation={hasLocation ? handleLocation : undefined}
      />

      {/* ── 7. INTRA-SHOP SEARCH ── */}
      {!loadingProducts && products.length > 0 && (
        <div className="mx-3 mt-3.5">
          <Suspense fallback={null}>
            <ShopSearch
              products={products}
              sellerId={seller.id}
              sellerName={seller.sellerDetails?.shopName || seller.name}
              allLoaded={products.length < 50}
            />
          </Suspense>
        </div>
      )}

      {/* ── 8. CATEGORY CHIPS ── */}
      {categories.length > 1 && (
        <CategoryChipsBar
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {/* ── 9. PRODUCTS GRID ── */}
      <div className="mt-3 px-3">
        {loadingProducts ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className="rounded-2xl bg-gray-100 animate-pulse"
                style={{ aspectRatio: '4 / 3' }}
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="text-center text-[#9EA5B0] text-sm py-8">
            {products.length === 0
              ? t('shopProfile.noProductsYet')
              : 'Aucun produit dans cette catégorie'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => onProductClick(product)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 10. ABOUT (collapsible) ── */}
      <AboutSection seller={seller} />

      {/* ── 11. REVIEWS placeholder ── */}
      <div
        className="mx-3 mt-2.5 px-4 pt-3.5 pb-3 bg-white rounded-2xl"
        style={{ border: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-extrabold text-[#111318]" style={{ letterSpacing: '-0.01em' }}>
            Avis clients
          </span>
          {rating > 0 && (
            <span className="flex items-center gap-1">
              <Star size={11} color="#F5C842" fill="#F5C842" strokeWidth={2} />
              <span className="text-[12.5px] font-extrabold text-[#111318]">{rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-[12.5px] font-medium leading-[1.5]" style={{ color: '#9EA5B0' }}>
          {t('shopProfile.noReviews', 'Aucun avis pour l\'instant.')}
        </p>
      </div>

      {/* bottom padding for mobile */}
      <div style={{ height: 24 }} />
    </div>
  );
};

export default ShopProfile;
