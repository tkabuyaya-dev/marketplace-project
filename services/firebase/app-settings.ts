/**
 * NUNULIA — App Settings Service
 *
 * Lecture realtime de la collection `appSettings/*`. Premier usage : Photo
 * Studio kill switch (Phase 8). Réutilisable pour d'autres feature flags
 * gérés en runtime depuis la Firestore Console (pas de redéploiement).
 *
 * Conventions :
 *   - Document `appSettings/studio` :
 *       {
 *         enabled: boolean,        // default true (Studio actif)
 *         whatsappNumber: string,  // override du numéro fallback (CF only)
 *       }
 *   - Fail-open partout : si le doc est absent ou la lecture échoue, le
 *     service est considéré comme actif. On veut JAMAIS bloquer le vendeur
 *     sur un problème de lecture du flag.
 *   - Le CF photoSessionCreate vérifie aussi le flag en défense en
 *     profondeur — un user qui bypasse le front via Postman est refusé
 *     côté serveur.
 */

import { db, doc, getDoc, onSnapshot } from './constants';
import type { Unsubscribe } from './constants';

const APP_SETTINGS_COLLECTION = 'appSettings';

export interface StudioSettings {
  /** false = kill switch actif, sinon Studio actif (default true). */
  enabled: boolean;
  /** Override du numéro WhatsApp Studio (lecture côté CF uniquement). */
  whatsappNumber?: string;
}

const DEFAULT_SETTINGS: StudioSettings = { enabled: true };

/**
 * Subscribe au flag `appSettings/studio`. Le callback est invoqué :
 *   - immédiatement avec les valeurs par défaut si Firestore n'est pas init
 *   - dès la première hydratation du doc
 *   - à chaque update du doc
 *   - avec les défauts si erreur (fail-open)
 *
 * Convention `enabled` : on n'éteint le service QUE si la valeur est
 * strictement `false`. Une valeur absente / null / undefined / autre type =
 * actif. Ça évite un kill switch accidentel par une mauvaise saisie console.
 */
export function subscribeToStudioSettings(
  cb: (settings: StudioSettings) => void,
): Unsubscribe {
  if (!db) {
    cb(DEFAULT_SETTINGS);
    return () => {};
  }
  return onSnapshot(
    doc(db, APP_SETTINGS_COLLECTION, 'studio'),
    (snap) => {
      if (!snap.exists()) {
        cb(DEFAULT_SETTINGS);
        return;
      }
      const data = snap.data();
      cb({
        enabled: data?.enabled !== false,
        whatsappNumber: typeof data?.whatsappNumber === 'string' && data.whatsappNumber.length > 0
          ? data.whatsappNumber
          : undefined,
      });
    },
    (err) => {
      // Fail-open : si on ne peut pas lire le flag, on laisse le service actif.
      // Le serveur revalide de toute façon (défense en profondeur dans
      // photoSessionCreate).
      console.warn('[subscribeToStudioSettings] error', err);
      cb(DEFAULT_SETTINGS);
    },
  );
}

// ── Heartbeat du cycle abonnements (Lot B, audit I6) ─────────────────────────
// Écrit par la CF subscriptionLifecycle à chaque passage (schedule ou manuel).
// Document `appSettings/subscriptionLifecycle`.

export interface LifecycleHeartbeat {
  lastRunAt: number;
  trigger: 'schedule' | 'manual';
  ok: boolean;
  error?: string;
  counts?: Record<string, number>;
}

/** Dernier passage du cron abonnements — null si jamais exécuté / illisible. */
export async function getLifecycleHeartbeat(): Promise<LifecycleHeartbeat | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, APP_SETTINGS_COLLECTION, 'subscriptionLifecycle'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (typeof data?.lastRunAt !== 'number') return null;
    return data as LifecycleHeartbeat;
  } catch {
    return null;
  }
}
