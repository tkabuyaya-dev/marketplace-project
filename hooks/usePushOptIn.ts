/**
 * NUNULIA — Opt-in push contextuel (hook partagé)
 *
 * Trois surfaces l'utilisent : l'écran succès/confirmation « Je Cherche »
 * (acheteurs), le panneau de la cloche (tous), et la carte post-install PWA.
 * Principe : le prompt navigateur n'est déclenché QUE sur un geste
 * utilisateur, au moment où être alerté est dans SON intérêt évident —
 * jamais à froid (Chrome passe en « quiet UI » et un refus est quasi
 * irréversible).
 *
 * Réutilise le circuit FCM validé prod (useNotificationConsent →
 * registerFcmForUser) — aucune couche parallèle, conformément au mémo
 * d'architecture FCM verrouillée.
 */

import { useState } from 'react';
import { useNotificationConsent } from './useNotificationConsent';
import { useAppContext } from '../contexts/AppContext';

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true);

interface Options {
  /**
   * true (défaut) : n'est éligible qu'avec un utilisateur connecté (le token
   * FCM est rattaché à son uid immédiatement). false : la permission seule
   * suffit — le token sera enregistré au prochain login via
   * refreshFcmTokenSilent (cas carte post-install, user pas encore connecté).
   */
  requireUser?: boolean;
}

export function usePushOptIn({ requireUser = true }: Options = {}) {
  const { currentUser } = useAppContext();
  const { permission, requestPermission } = useNotificationConsent();
  const [enabling, setEnabling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  // iOS hors PWA installée : Apple bloque le Web Push → proposer un bouton
  // qui ne peut pas aboutir serait un bouton mort.
  const promptPossible =
    typeof Notification !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    (!isIOS() || isStandalone());

  const eligible =
    promptPossible &&
    permission === 'default' &&
    (!requireUser || !!currentUser);

  /** À appeler sur un geste utilisateur. Retourne true si notifs actives. */
  const enable = async (): Promise<boolean> => {
    if (enabling) return false;
    setEnabling(true);
    try {
      const result = await requestPermission(currentUser?.id);
      if (result !== 'granted') return false;
      if (currentUser?.id) {
        // requestPermission enregistre le token en fire-and-forget ; ici on
        // attend le résultat réel pour que le ✅ affiché soit honnête.
        const { registerFcmForUser } = await import('../services/fcm');
        await registerFcmForUser(currentUser.id);
      }
      setJustEnabled(true);
      return true;
    } catch {
      return false;
    } finally {
      setEnabling(false);
    }
  };

  return { eligible, enabling, justEnabled, enable };
}
