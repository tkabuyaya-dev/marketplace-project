import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types';
import { THEME, TC } from '../constants';
import { NotificationBell } from './NotificationBell';

interface NavbarProps {
  currentUser: User | null;
  onSearchClick: () => void;
  onSellerAccess: () => void;
  isOnline?: boolean;
  unreadMessagesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ currentUser, onSearchClick, onSellerAccess, isOnline = true, unreadMessagesCount = 0 }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const renderActionItem = () => {
    if (!currentUser) return { path: '/login', icon: '👤', label: 'Connexion', useSellerAccess: false };
    if (currentUser.role === 'admin') return { path: '/admin', icon: '🛡️', label: 'Admin', useSellerAccess: true };
    if (currentUser.role === 'seller') return { path: '/dashboard', icon: '📊', label: 'Ma Boutique', useSellerAccess: true };
    return { path: '/dashboard', icon: '💼', label: 'Vendre', useSellerAccess: true };
  };

  const actionItem = renderActionItem();

  const navItems = [
    { path: '/', icon: '🏠', label: 'Accueil', useSellerAccess: false },
    ...(currentUser
      ? [{ path: '/favorites', icon: '❤️', label: 'Favoris', useSellerAccess: false }]
      : []),
    { path: '/messenger', icon: '💬', label: 'Chat', useSellerAccess: false },
    actionItem,
    { path: '/profile', icon: '⚙️', label: 'Compte', useSellerAccess: false },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleNav = (item: typeof navItems[0]) => {
    if (item.useSellerAccess) {
      onSellerAccess();
    } else {
      navigate(item.path);
    }
  };

  return (
    <>
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full z-[60] bg-yellow-600 text-yellow-950 text-center text-xs font-bold py-1.5 px-4">
          Mode hors-ligne — Les données affichées peuvent ne pas être à jour
        </div>
      )}

      {/* Desktop/Tablet Top Nav */}
      <nav className="hidden md:flex fixed top-0 w-full z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 px-6 py-4 justify-between items-center transition-all duration-500">
        <button onClick={() => navigate('/')} className={`text-2xl font-black bg-gradient-to-r ${THEME.gradient} text-transparent bg-clip-text transition-all duration-500`}>
          AURABUJA
        </button>

        <div className="flex items-center gap-4">
          {/* Search Trigger Desktop */}
          <button
            onClick={onSearchClick}
            className="group flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-full border border-gray-700 transition-all text-gray-400 hover:text-white"
          >
             <span className="text-lg group-hover:scale-110 transition-transform">🔍</span>
             <span className="text-sm">Rechercher...</span>
             <span className="ml-2 text-xs bg-gray-700 px-1.5 py-0.5 rounded border border-gray-600 hidden lg:inline-block">Cmd+K</span>
          </button>

          {/* Notification Bell */}
          {currentUser && <NotificationBell />}

          <div className="flex gap-8">
            {navItems.map((item) => (
              <button
                key={item.path + item.label}
                onClick={() => handleNav(item)}
                className={`text-sm font-medium transition-colors ${
                  isActive(item.path) ? TC.text400 : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="relative">
                  {item.label}
                  {item.path === '/messenger' && unreadMessagesCount > 0 && (
                    <span className="absolute -top-1.5 -right-4 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 shadow-lg shadow-red-500/40">
                      {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 w-full z-50 bg-gray-900/95 backdrop-blur-xl border-b border-gray-800 px-4 py-3 flex justify-between items-center shadow-lg transition-colors duration-500">
         <button onClick={() => navigate('/')} className={`font-black text-lg bg-gradient-to-r ${THEME.gradient} text-transparent bg-clip-text tracking-tighter`}>
           AURABUJA
         </button>

         <div className="flex gap-2">
           {/* Notification Bell Mobile */}
           {currentUser && <NotificationBell />}

           {/* Search Button Mobile */}
           <button
             onClick={onSearchClick}
             className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 border border-gray-700 text-white"
           >
             🔍
           </button>
         </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 bg-gray-900/95 backdrop-blur-xl border-t border-blue-900/30 pb-safe transition-all duration-500">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <button
              key={item.path + item.label}
              onClick={() => handleNav(item)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive(item.path) ? TC.text500 : 'text-gray-500'
              }`}
            >
              <span className={`relative text-xl transition-transform duration-200 ${isActive(item.path) ? 'scale-110' : ''}`}>
                {item.icon}
                {item.path === '/messenger' && unreadMessagesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 shadow-lg shadow-red-500/40 animate-pulse">
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive(item.path) && (
                <span className={`absolute bottom-1 w-1 h-1 ${TC.bg500} rounded-full shadow-[0_0_8px_currentColor]`} />
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
