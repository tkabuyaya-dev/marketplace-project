import React from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { ConsentBanner } from './components/ConsentBanner';
import { BackgroundLoader } from './components/BackgroundLoader';
import { useAppContext } from './contexts/AppContext';
/** Écran de chargement affiché pendant les transitions auth (login/logout/init) */
const AuthLoadingScreen: React.FC<{ message?: string }> = ({ message }) => (
  <div className="min-h-screen bg-[#F7F7F5] dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-400 to-amber-500 flex items-center justify-center shadow-lg shadow-gold-400/30 animate-pulse">
      <span className="text-2xl font-black text-gray-900">N</span>
    </div>
    <div className="w-8 h-8 border-[3px] border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
    {message && (
      <p className="text-sm text-gray-600 dark:text-gray-400 animate-fade-in">{message}</p>
    )}
  </div>
);

const App: React.FC = () => {
  const {
    currentUser,
    isOnline,
    handleSellerAccess,
    backgroundLoading,
    isAuthTransitioning,
    loginLoading,
  } = useAppContext();
  const location = useLocation();

  // Bloque UNIQUEMENT pendant les transitions login/logout (popup Google ouvert).
  // PAS pendant l'init Firebase (authReady) — ça bloquerait le rendu 1-5s sur 4G lente
  // et tuerait LCP + CLS. On rend immédiatement, l'état auth se met à jour en arrière-plan.
  if (isAuthTransitioning) {
    return <AuthLoadingScreen message={loginLoading ? 'Connexion en cours…' : undefined} />;
  }

  // Pages without the main Navbar (dashboard/admin have their own nav)
  const hideNavbar = ['/', '/login', '/auth-google', '/register-seller', '/devenir-vendeur', '/dashboard', '/admin', '/cgu', '/politique-confidentialite', '/securite', '/search', '/favorites', '/demandes', '/profile'].includes(location.pathname)
    || location.pathname.startsWith('/product/')
    || location.pathname.startsWith('/shop/')
    || location.pathname.startsWith('/search');

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-gray-900 dark:bg-gray-950 dark:text-gray-100 font-sans selection:bg-gold-400/30">
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
            onSellerAccess={handleSellerAccess}
            isOnline={isOnline}
          />
        )}
        <main>
          <Outlet />
        </main>
      </div>

      <PWAInstallPrompt />
      <ConsentBanner />

      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </div>
  );
};

export default App;
