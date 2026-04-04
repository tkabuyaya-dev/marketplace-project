import React, { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
// Lazy-loaded pages with auto-retry on chunk load failure (reload once only)
const lazyRetry = (importFn: () => Promise<any>) =>
  lazy(() =>
    importFn().catch(() => {
      const key = 'chunk_reload';
      const alreadyReloaded = sessionStorage.getItem(key);
      if (!alreadyReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise to prevent React from rendering
        // while the page reloads
        return new Promise(() => {});
      }
      // Already reloaded once — clear flag and reject so ErrorBoundary shows
      sessionStorage.removeItem(key);
      throw new Error('Chunk load failed after retry');
    })
  );

const HomePage = lazyRetry(() => import('./pages/Home'));
const ProductDetailPage = lazyRetry(() => import('./pages/ProductDetail'));
const ShopProfilePage = lazyRetry(() => import('./pages/ShopProfile'));
const SellerDashboardPage = lazyRetry(() => import('./pages/SellerDashboard'));
const SellerRegistrationPage = lazyRetry(() => import('./pages/SellerRegistration'));
const AdminDashboardPage = lazyRetry(() => import('./pages/admin'));
const LoginPage = lazyRetry(() => import('./pages/Login'));
const ProfilePage = lazyRetry(() => import('./pages/Profile'));
const FavoritesPage = lazyRetry(() => import('./pages/Favorites'));
const PlansPage = lazyRetry(() => import('./pages/PlansPage'));
const SearchPage = lazyRetry(() => import('./pages/Search'));
const CGUPage = lazyRetry(() => import('./pages/legal/CGU'));
const PrivacyPolicyPage = lazyRetry(() => import('./pages/legal/PrivacyPolicy'));
const BuyerRequestsPage = lazyRetry(() => import('./pages/BuyerRequests'));
const AuthGooglePage = lazyRetry(() => import('./pages/AuthGoogle'));

// Prefetch critical routes after initial load
if (typeof window !== 'undefined') {
  // Home is lazy but first to load — prefetch immediately after shell renders
  import('./pages/Home');
  window.addEventListener('load', () => {
    setTimeout(() => {
      import('./pages/ProductDetail');
      import('./pages/Login');
    }, 2000);
  }, { once: true });
}

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const RouteErrorBoundary = () => {
  const { t } = useTranslation();
  const error = useRouteError();
  const isChunkError = error instanceof TypeError && error.message.includes('dynamically imported module');
  if (isChunkError) {
    window.location.reload();
    return null;
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-xl font-bold text-white mb-2">{t('errors.pageError')}</p>
      <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">
        {t('errors.reloadPage')}
      </button>
    </div>
  );
};

const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

// Layout wrapper that provides AppContext (needs to be inside Router)
const AppWithProvider: React.FC = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ToastProvider>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppWithProvider />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <SuspenseWrapper><HomePage /></SuspenseWrapper> },
      { path: 'product/:slugOrId', element: <SuspenseWrapper><ProductDetailPage /></SuspenseWrapper> },
      { path: 'shop/:slugOrId', element: <SuspenseWrapper><ShopProfilePage /></SuspenseWrapper> },
      { path: 'shop/:shopSlug/product/:slugOrId', element: <SuspenseWrapper><ProductDetailPage /></SuspenseWrapper> },
      { path: 'dashboard', element: <SuspenseWrapper><SellerDashboardPage /></SuspenseWrapper> },
      { path: 'register-seller', element: <SuspenseWrapper><SellerRegistrationPage /></SuspenseWrapper> },
      { path: 'admin', element: <SuspenseWrapper><AdminDashboardPage /></SuspenseWrapper> },
      { path: 'search', element: <SuspenseWrapper><SearchPage /></SuspenseWrapper> },
      { path: 'plans', element: <SuspenseWrapper><PlansPage /></SuspenseWrapper> },
      { path: 'favorites', element: <SuspenseWrapper><FavoritesPage /></SuspenseWrapper> },
      { path: 'profile', element: <SuspenseWrapper><ProfilePage /></SuspenseWrapper> },
      { path: 'login', element: <SuspenseWrapper><LoginPage /></SuspenseWrapper> },
      { path: 'cgu', element: <SuspenseWrapper><CGUPage /></SuspenseWrapper> },
      { path: 'politique-confidentialite', element: <SuspenseWrapper><PrivacyPolicyPage /></SuspenseWrapper> },
      { path: 'demandes', element: <SuspenseWrapper><BuyerRequestsPage /></SuspenseWrapper> },
      { path: 'auth-google', element: <SuspenseWrapper><AuthGooglePage /></SuspenseWrapper> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
