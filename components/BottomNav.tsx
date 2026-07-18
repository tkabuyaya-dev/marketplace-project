/**
 * NUNULIA — BottomNav partagée (Home, Profile, …)
 *
 * Une seule source de vérité : l'onglet actif est détecté depuis l'URL
 * (fini les copies locales avec `isActive` codé en dur par page).
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Search, Plus, Heart, User as UserIcon } from 'lucide-react';

const TABS = [
  { id: 'home',      label: 'Accueil',  Icon: HomeIcon, path: '/' },
  { id: 'search',    label: 'Chercher', Icon: Search,   path: '/search' },
  { id: 'sell',      label: 'Vendre',   Icon: Plus,     path: '' },
  { id: 'favorites', label: 'Favoris',  Icon: Heart,    path: '/favorites' },
  { id: 'profile',   label: 'Profil',   Icon: UserIcon, path: '/profile' },
] as const;

export const BottomNav: React.FC<{ onSell: () => void }> = ({ onSell }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

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
        {TABS.map(({ id, label, Icon, path }) => {
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
                  className="w-12 h-12 rounded-full flex items-center justify-center -mt-3.5 active:scale-95 transition-transform"
                  style={{
                    background: 'linear-gradient(135deg,#F5C842 0%,#E8A800 100%)',
                    boxShadow: '0 4px 16px rgba(245,200,66,0.5)',
                  }}
                >
                  <Plus size={22} color="#111318" strokeWidth={3} />
                </div>
                <span className="text-[10px] font-bold text-[#111318]">{label}</span>
              </button>
            );
          }

          const active = isActive(path);
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path, { viewTransition: true })}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 flex-1 bg-transparent border-none cursor-pointer"
            >
              <Icon
                size={22}
                color={active ? '#A45F00' : '#5C6370'}
                strokeWidth={active ? 2.5 : 2}
                fill={id === 'favorites' && active ? '#A45F00' : 'none'}
              />
              <span
                className="text-[10px]"
                style={{ color: active ? '#A45F00' : '#5C6370', fontWeight: active ? 800 : 600 }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
