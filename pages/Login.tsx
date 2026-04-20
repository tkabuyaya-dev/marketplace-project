import React from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const Login: React.FC = () => {
  const { handleLogin, loginLoading, currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (currentUser) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-16 relative">
      <div className="absolute top-4 right-4 z-50">
        <LanguageSwitcher compact />
      </div>
      <div className="w-full max-w-sm text-center space-y-8">
        <div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-gold-400 to-gold-600 text-transparent bg-clip-text mb-2">Nunulia</h1>
          <p className="text-gray-400">{t('auth.loginSubtitle')}</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold h-14 rounded-xl text-base transition-colors disabled:opacity-50 shadow-lg"
          >
            {loginLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span>{t('auth.loginWithGoogle')}</span>
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center">
            En continuant, vous acceptez nos{' '}
            <Link to="/cgu" className="underline text-amber-400 hover:text-amber-300">
              Conditions d'utilisation
            </Link>
            {' '}et notre{' '}
            <Link to="/politique-confidentialite" className="underline text-amber-400 hover:text-amber-300">
              Politique de confidentialité
            </Link>
          </p>
          <Button
            className="w-full text-gray-500" variant="ghost"
            onClick={() => navigate('/')}
          >
            {t('auth.continueWithout')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Login;
