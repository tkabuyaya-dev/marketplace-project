/**
 * NUNULIA — usePhotoSession hook (Photo Studio state machine côté client)
 *
 * Centralise pour le composant SellerDashboard (carte d'accueil Studio) :
 *   - L'état de la dernière session du vendeur (realtime Firestore)
 *   - Le compteur de quota du jour (realtime Firestore)
 *   - La fonction `startSession` qui appelle la CF et propage le wa.me link
 *   - L'erreur typée pour afficher un toast adapté
 *
 * Source de vérité du quota = features du plan :
 *   PlanFeatures.dailyStudioSessions (free=1, vendeur=2, pro=3, grossiste=5)
 *   La CF côté serveur applique la même limite — c'est de la défense en
 *   profondeur, l'UI peut être bypassée mais la CF refusera.
 *
 * Pourquoi un seul hook plutôt que 3 :
 *   - Le composant carte Studio a besoin de TOUT (session + quota + action)
 *   - Centraliser évite 3 useEffect désynchronisés
 *   - Le state derivé `cardState` simplifie le rendu (un switch suffit)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { PhotoSession } from '../types';
import { featuresForLabel } from '../utils/planFeatures';
import {
  subscribeToLatestVendorSession,
  subscribeToTodayStudioUsage,
  createPhotoSession,
  CreatePhotoSessionResult,
} from '../services/firebase/photo-sessions';
import { subscribeToStudioSettings } from '../services/firebase/app-settings';

/**
 * Etats UI possibles de la carte Photo Studio sur le dashboard vendeur.
 * Le composant fait un `switch (cardState)` pour décider quoi afficher.
 *
 * `loading` n'apparaît qu'au tout premier rendu, le temps que le listener
 * Firestore arrive (typiquement <300ms en réseau correct, <50ms en cache IDB).
 */
export type StudioCardState =
  | 'loading'              // hydration en cours
  | 'idle_can_start'       // pas de session active, quota OK
  | 'idle_quota_exhausted' // pas de session active, mais quota du jour épuisé
  | 'session_waiting'      // session active : waiting_photos
  | 'session_processing'   // session active : processing
  | 'session_ready'        // session active : ready (CTA "Voir mes photos")
  | 'session_expired'      // dernière session expirée (à recommencer)
  | 'session_published'    // dernière session vient d'être publiée (success)
  | 'service_disabled';    // kill switch admin actif (appSettings/studio.enabled === false)

export interface StudioQuota {
  used: number;
  dailyLimit: number;
  /** true si la 1ʳᵉ valeur a été reçue depuis Firestore (sinon used reste 0). */
  hydrated: boolean;
}

export type StudioStartErrorKind =
  | 'quota_exhausted'   // CF a renvoyé resource-exhausted (sécurité serveur)
  | 'permission'        // pas vendeur / suspendu
  | 'unauthenticated'   // pas connecté
  | 'network'           // réseau down
  | 'unknown';

export interface UsePhotoSessionResult {
  /** Etat dérivé pour le rendu — switch dessus dans le composant. */
  cardState: StudioCardState;
  /** Dernière session connue (peut être null si le vendeur n'en a jamais ouvert). */
  session: PhotoSession | null;
  /** Compteur quota du jour. */
  quota: StudioQuota;
  /** true tant qu'au moins un listener n'a pas reçu sa 1ʳᵉ valeur. */
  hydrated: boolean;

  /** Action : démarre une session. Renvoie le résultat brut de la CF ou null en erreur. */
  startSession: () => Promise<CreatePhotoSessionResult | null>;
  starting: boolean;
  startError: { kind: StudioStartErrorKind; message: string } | null;
}

function classifyStartError(err: unknown): { kind: StudioStartErrorKind; message: string } {
  // HttpsError côté client : { code: 'functions/xxx', message: '...' }
  const e = err as { code?: string; message?: string };
  const code = e?.code || '';
  const message = e?.message || 'Erreur inattendue';

  if (code.includes('resource-exhausted')) return { kind: 'quota_exhausted', message };
  if (code.includes('unauthenticated'))    return { kind: 'unauthenticated', message };
  if (code.includes('permission-denied'))  return { kind: 'permission', message };
  // Côté client réseau down : pas de code spécifique, on devine par texte
  if (/network|fetch|offline/i.test(message)) return { kind: 'network', message };
  return { kind: 'unknown', message };
}

export function usePhotoSession(): UsePhotoSessionResult {
  const { currentUser } = useAppContext();

  const [session, setSession] = useState<PhotoSession | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const [usageCount, setUsageCount] = useState(0);
  const [usageHydrated, setUsageHydrated] = useState(false);

  // Kill switch via appSettings/studio.enabled (Phase 8). Default true =
  // fail-open : si Firestore down ou doc absent, le service reste actif.
  const [studioEnabled, setStudioEnabled] = useState(true);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<UsePhotoSessionResult['startError']>(null);

  const vendorId = currentUser?.id;
  const tierLabel = currentUser?.sellerDetails?.tierLabel;
  const subscriptionExpiresAt = currentUser?.sellerDetails?.subscriptionExpiresAt;

  // Source de vérité quota : PlanFeatures.dailyStudioSessions
  // Si le plan payant a expiré, on retombe sur Free (alignement avec la CF).
  const dailyLimit = useMemo(() => {
    const isExpired =
      typeof subscriptionExpiresAt === 'number' &&
      subscriptionExpiresAt > 0 &&
      Date.now() > subscriptionExpiresAt;
    return featuresForLabel(isExpired ? null : tierLabel).dailyStudioSessions;
  }, [tierLabel, subscriptionExpiresAt]);

  // Subscribe à la dernière session du vendeur
  useEffect(() => {
    if (!vendorId) {
      setSession(null);
      setSessionHydrated(false);
      return;
    }
    setSessionHydrated(false);
    const unsub = subscribeToLatestVendorSession(vendorId, (s) => {
      setSession(s);
      setSessionHydrated(true);
    });
    return unsub;
  }, [vendorId]);

  // Subscribe au compteur de sessions du jour
  useEffect(() => {
    if (!vendorId) {
      setUsageCount(0);
      setUsageHydrated(false);
      return;
    }
    setUsageHydrated(false);
    const unsub = subscribeToTodayStudioUsage(vendorId, (count) => {
      setUsageCount(count);
      setUsageHydrated(true);
    });
    return unsub;
  }, [vendorId]);

  // Subscribe au kill switch admin (Phase 8). Pas de dépendance vendorId :
  // c'est un flag global, lu indépendamment du user connecté.
  useEffect(() => {
    const unsub = subscribeToStudioSettings((settings) => {
      setStudioEnabled(settings.enabled);
    });
    return unsub;
  }, []);

  // Etat dérivé
  const hydrated = sessionHydrated && usageHydrated;
  const quotaExhausted = usageCount >= dailyLimit;

  const cardState: StudioCardState = useMemo(() => {
    // Kill switch admin : court-circuit AVANT tout — pas d'affichage de quota,
    // pas de session en cours, pas de CTA. Carte = "Service indisponible".
    if (!studioEnabled) return 'service_disabled';

    if (!hydrated) return 'loading';

    // Pas de session connue → menu d'accueil (ou bloqué quota)
    if (!session) {
      return quotaExhausted ? 'idle_quota_exhausted' : 'idle_can_start';
    }

    // Session récente — interprète son status
    switch (session.status) {
      case 'waiting_photos': return 'session_waiting';
      case 'processing':     return 'session_processing';
      case 'ready':          return 'session_ready';

      case 'published':
        // La session est terminée — on retombe sur le menu d'accueil.
        // (idle_quota_exhausted si déjà au max, sinon idle_can_start)
        return quotaExhausted ? 'idle_quota_exhausted' : 'idle_can_start';

      case 'expired':
        // Si quota OK, on propose "Recommencer". Sinon "Revenez demain".
        return quotaExhausted ? 'idle_quota_exhausted' : 'session_expired';

      default:
        return 'idle_can_start';
    }
  }, [hydrated, session, quotaExhausted, studioEnabled]);

  // Action : démarrer une session
  const startSession = useCallback(async (): Promise<CreatePhotoSessionResult | null> => {
    if (starting) return null;
    setStarting(true);
    setStartError(null);
    try {
      const result = await createPhotoSession();
      return result;
    } catch (err) {
      const classified = classifyStartError(err);
      setStartError(classified);
      return null;
    } finally {
      setStarting(false);
    }
  }, [starting]);

  return {
    cardState,
    session,
    quota: {
      used: usageCount,
      dailyLimit,
      hydrated: usageHydrated,
    },
    hydrated,
    startSession,
    starting,
    startError,
  };
}
