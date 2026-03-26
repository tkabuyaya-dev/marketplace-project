import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { SearchOverlay } from './components/SearchOverlay';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { BackgroundLoader } from './components/BackgroundLoader';
import { useAppContext } from './contexts/AppContext';
import { Product, User } from './types';

const App: React.FC = () => {
  const {
    currentUser,
    isOnline,
    isSearchOpen, setIsSearchOpen,
    handleSellerAccess,
    backgroundLoading,
  } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  // Pages without the main Navbar (dashboard/admin have their own nav)
  const hideNavbar = ['/login', '/register-seller', '/dashboard', '/admin'].includes(location.pathname)
    || location.pathname.startsWith('/product/')
    || location.pathname.startsWith('/shop/');

  const handleProductClick = (product: Product) => {
    navigate(`/product/${product.slug || product.id}`, { state: { product } });
    setIsSearchOpen(false);
  };

  const handleShopClick = (seller: User) => {
    navigate(`/shop/${seller.slug || seller.id}`, { state: { seller } });
    setIsSearchOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 selection:bg-gold-400/30">
      {/* Background sync indicator */}
      <BackgroundLoader visible={backgroundLoading} />

      {/* Background gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full blur-[120px] bg-gold-400/[0.06]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] rounded-full blur-[120px] bg-gold-600/[0.04]" />
      </div>

      <div className="relative z-10">
        {!hideNavbar && (
          <Navbar
            currentUser={currentUser}
            onSearchClick={() => setIsSearchOpen(true)}
            onSellerAccess={handleSellerAccess}
            isOnline={isOnline}
          />
        )}
        <main>
          <Outlet />
        </main>
      </div>

      {/* Global Search Overlay */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onProductClick={handleProductClick}
        onShopClick={handleShopClick}
      />

      {/* Language Switcher is now integrated directly in each page's header */}

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
};

export default App;
