/**
 * NUNULIA — Page de confirmation buyer request
 * Route : /confirmer/:code
 *
 * Le buyer arrive ici après avoir cliqué sur le bouton "Confirmer sur
 * WhatsApp" du formulaire OU sur un lien qu'on lui a envoyé. On appelle
 * directement la CF confirmBuyerRequest avec le code de l'URL.
 *
 * UX : page ultra-minimale, zéro friction.
 *  - Loading 1-2s pendant l'appel CF (modération Claude Haiku)
 *  - Succès → message + CTA vers /demandes (ou /)
 *  - Erreur → message clair sans révéler de détail sécurité
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase-config';
import { getDeviceId } from '../utils/deviceFingerprint';

type Phase = 'loading' | 'success' | 'expired' | 'not_found' | 'rejected' | 'error';

interface ConfirmResult {
  ok: boolean;
  alreadyConfirmed: boolean;
  requestId: string;
  title: string;
  city: string;
}

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-card border border-black/[0.05] p-7 text-center">
      {children}
    </div>
  </div>
);

const ConfirmBuyerRequestPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code || !/^[A-Z0-9]{8}$/.test(code)) {
        if (!cancelled) setPhase('not_found');
        return;
      }
      try {
        const fns = await getFirebaseFunctions();
        if (!fns) throw new Error('functions_unavailable');
        const deviceId = await getDeviceId().catch(() => null);
        const fn = httpsCallable<{ code: string; deviceId: string | null }, ConfirmResult>(
          fns, 'confirmBuyerRequest'
        );
        const res = await fn({ code, deviceId });
        if (cancelled) return;
        setResult(res.data);
        setPhase('success');
      } catch (err) {
        if (cancelled) return;
        const fe = err as FunctionsError;
        const c = (fe?.code || '').toString();
        if (c.includes('deadline-exceeded')) setPhase('expired');
        else if (c.includes('not-found')) setPhase('not_found');
        else if (c.includes('invalid-argument')) setPhase('rejected');
        else if (c.includes('failed-precondition')) setPhase('rejected');
        else setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (phase === 'loading') {
    return (
      <PageShell>
        <div className="w-12 h-12 mx-auto rounded-full bg-[#FEF9EC] inline-flex items-center justify-center mb-4">
          <span className="w-6 h-6 border-[3px] border-[#F5C842] border-t-transparent rounded-full animate-spin" />
        </div>
        <h1 className="text-[18px] font-black text-[#111318] tracking-tight">
          Confirmation en cours…
        </h1>
        <p className="mt-2 text-[13px] text-[#5C6370]">
          Vérification de votre demande. Un instant.
        </p>
      </PageShell>
    );
  }

  if (phase === 'success' && result) {
    return (
      <PageShell>
        <div className="w-16 h-16 mx-auto rounded-full bg-[#DCFCE7] inline-flex items-center justify-center mb-4">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
          {result.alreadyConfirmed ? 'Déjà confirmée !' : 'Demande confirmée !'}
        </h1>
        {result.title && (
          <p className="mt-3 text-[14px] text-[#111318]">
            <span className="font-semibold">« {result.title} »</span>
            {result.city && <> à <span className="font-semibold">{result.city}</span></>}
          </p>
        )}
        <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
          Votre demande est maintenant visible par les vendeurs Nunulia.
          Ils vont vous contacter sur WhatsApp directement.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          Retour à l'accueil
        </button>
      </PageShell>
    );
  }

  if (phase === 'expired') {
    return (
      <PageShell>
        <div className="w-16 h-16 mx-auto rounded-full bg-[#FEF3C7] inline-flex items-center justify-center mb-4">
          <span className="text-3xl">⏱</span>
        </div>
        <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
          Délai dépassé
        </h1>
        <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
          Le délai de 30 minutes pour confirmer cette demande est dépassé.
          Vous pouvez en soumettre une nouvelle, c'est rapide.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight active:scale-[0.98] transition"
          style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
        >
          Refaire une demande
        </Link>
      </PageShell>
    );
  }

  if (phase === 'not_found') {
    return (
      <PageShell>
        <div className="w-16 h-16 mx-auto rounded-full bg-[#F0F1F4] inline-flex items-center justify-center mb-4">
          <span className="text-3xl">🔎</span>
        </div>
        <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
          Lien invalide
        </h1>
        <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
          Ce lien de confirmation est introuvable. Vérifiez l'URL ou
          recommencez votre demande.
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

  if (phase === 'rejected') {
    return (
      <PageShell>
        <div className="w-16 h-16 mx-auto rounded-full bg-[#FEE2E2] inline-flex items-center justify-center mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
          Demande non confirmable
        </h1>
        <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
          Cette demande ne peut pas être confirmée. Vérifiez le contenu ou
          recommencez avec une autre formulation.
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

  // phase === 'error'
  return (
    <PageShell>
      <div className="w-16 h-16 mx-auto rounded-full bg-[#FEE2E2] inline-flex items-center justify-center mb-4">
        <span className="text-3xl">❌</span>
      </div>
      <h1 className="text-[20px] font-black text-[#111318] tracking-tight">
        Une erreur est survenue
      </h1>
      <p className="mt-3 text-[13px] text-[#5C6370] leading-relaxed">
        Réessayez dans quelques instants. Si le problème persiste, contactez
        nous via WhatsApp.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 w-full h-12 rounded-full bg-[#F5C842] text-[#111318] text-[14px] font-black tracking-tight active:scale-[0.98] transition"
        style={{ boxShadow: '0 6px 18px rgba(245,200,66,0.45)' }}
      >
        Réessayer
      </button>
    </PageShell>
  );
};

export default ConfirmBuyerRequestPage;
