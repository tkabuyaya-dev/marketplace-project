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
import { useParams, Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase-config';
import { getDeviceId } from '../utils/deviceFingerprint';

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-card border border-black/[0.05] p-7 text-center">
      {children}
    </div>
  </div>
);

const SignalBuyerRequestPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [phase, setPhase] = useState<'loading' | 'done'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Volontairement permissif côté front : on appelle la CF même si le code
      // est mal formé — la CF renvoie {ok: true} silencieusement.
      try {
        const fns = await getFirebaseFunctions();
        if (fns && code) {
          const deviceId = await getDeviceId().catch(() => null);
          const fn = httpsCallable<{ code: string; deviceId: string | null }, { ok: boolean }>(
            fns, 'signalBuyerRequest'
          );
          await fn({ code, deviceId });
        }
      } catch {
        /* silent — on affiche le même message dans tous les cas */
      } finally {
        if (!cancelled) setPhase('done');
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
