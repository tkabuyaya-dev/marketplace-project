/**
 * NUNULIA — Deal Loop Service (callable wrappers)
 *
 * - recordContact : journalise un clic « Contacter sur WhatsApp ». Appelé en
 *   fire-and-forget — n'attend pas, n'échoue jamais bruyamment (WhatsApp doit
 *   s'ouvrir immédiatement).
 * - confirmDeal : le vendeur répond Oui/Non depuis le dashboard.
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase-config';
import { getDeviceId } from '../../utils/deviceFingerprint';

interface RecordContactArgs {
  productId: string;
  sellerUid: string;
  productSlug?: string | null;
  productTitle: string;
}

/**
 * Journalise le contact. Fire-and-forget : on n'await PAS côté appelant et on
 * avale toute erreur (le but est de ne jamais retarder l'ouverture WhatsApp).
 */
export async function recordContact(args: RecordContactArgs): Promise<void> {
  try {
    const fns = await getFirebaseFunctions();
    if (!fns) return;
    let deviceId: string | null = null;
    try {
      deviceId = await getDeviceId();
    } catch {
      deviceId = null;
    }
    const fn = httpsCallable(fns, 'recordContact');
    await fn({ ...args, deviceId });
  } catch {
    // Silencieux — purement opportuniste.
  }
}

/** Le vendeur confirme (ou non) la vente. Retourne true si enregistré. */
export async function confirmDeal(eventId: string, answer: 'yes' | 'no'): Promise<boolean> {
  try {
    const fns = await getFirebaseFunctions();
    if (!fns) return false;
    const fn = httpsCallable(fns, 'confirmDeal');
    await fn({ eventId, answer });
    return true;
  } catch {
    return false;
  }
}
