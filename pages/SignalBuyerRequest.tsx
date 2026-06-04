/**
 * NUNULIA — Page de signalement buyer request (anti-usurpation)
 * Route : /signaler/:code
 *
 * Le vrai propriétaire du numéro WhatsApp arrive ici via un lien WhatsApp
 * qu'on lui a envoyé. La CF signalBuyerRequest renvoie TOUJOURS {ok: true}
 * (honeypot doux) — la page affiche donc systématiquement le même message
 * pour ne pas révéler l'état réel à un éventuel attaquant.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase-config';
import { useAppContext } from '../contexts/AppContext';

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-card border border-black/[0.05] p-7 text-center">
      {children}
    </div>
  </div>
);

const SignalBuyerRequestPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { currentUser, authReady } = useAppContext();
  const [phase, setPhase] = useState<'loading' | 'done' | 'unauthorized'>('loading');

  const isAdmin = authReady && currentUser?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return;
      // Refonte Option C : page admin-only. Un visiteur lambda est refusé.
      if (!isAdmin) {
        if (!cancelled) setPhase('unauthorized');
        return;
      }
      try {
        const fns = await getFirebaseFunctions();
        if (fns && code) {
          const fn = httpsCallable<{ code: string }, { ok: boolean }>(
            fns, 'signalBuyerRequest'
          );
          await fn({ code });
        }
      } catch {
        /* silent — l'admin verra le résultat dans le dashboard */
      } finally {
        if (!cancelled) setPhase('done');
      }
    })();
    return () => { cancelled = true; };
  }, [code, authReady, isAdmin]);

  if (authReady && !currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (phase === 'unauthorized') {
    return (
      <PageShell>
        <div className="w-16 h-16 mx-auto rounded-full bg-[#F0F1F4] inline-flex items-center justify-center mb-4">
          <span className="text-3xl">🔒</span>
        </div>
        <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
          Accès réservé
        </h1>
        <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
          Cette page est réservée aux administrateurs Nunulia.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          Retour à l'accueil
        </Link>
      </PageShell>
    );
  }

  if (phase === 'loading') {
    return (
      <PageShell>
        <div className="w-12 h-12 mx-auto rounded-full bg-[#FEF9EC] inline-flex items-center justify-center mb-4">
          <span className="w-6 h-6 border-[3px] border-[#F5C842] border-t-transparent rounded-full animate-spin" />
        </div>
        <h1 className="text-[18px] font-black text-[#111318] tracking-tight">
          Traitement en cours…
        </h1>
        <p className="mt-2 text-[13px] text-[#5C6370]">Un instant.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="w-16 h-16 mx-auto rounded-full bg-[#DCFCE7] inline-flex items-center justify-center mb-4">
        <span className="text-3xl">🛡️</span>
      </div>
      <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
        Abus signalé
      </h1>
      <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
        La demande a été suspendue immédiatement. Votre numéro WhatsApp est
        en sécurité.
      </p>
      <p className="mt-2 text-[13px] text-[#5C6370] leading-relaxed">
        Merci de nous avoir alertés — c'est votre vigilance qui protège la
        communauté.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center justify-center w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight active:scale-[0.98] transition"
        style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
      >
        Retour à l'accueil
      </Link>
    </PageShell>
  );
};

export default SignalBuyerRequestPage;
