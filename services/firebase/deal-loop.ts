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
  /** Prix affiché (promo-aware) + devise → GMV estimé côté admin. */
  productPrice?: number;
  currency?: string;
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

// ── Admin : tableau de bord d'intelligence commerciale ──────────────────────

export interface SellerRow {
  sellerUid: string;
  name: string;
  contacts: number;
  matured: number;
  sold: number;
  notSold: number;
}
export interface ProductRow {
  productId: string;
  slug: string | null;
  title: string;
  contacts: number;
  sold: number;
}
export interface DealLoopStats {
  periodDays: number;
  capped: boolean;
  kpis: {
    contacts: number;
    clicks: number;
    sold: number;
    notSold: number;
    responded: number;
    awaiting: number;
    conversionResponded: number;
    conversionMatured: number;
  };
  gmvByCurrency: Record<string, number>;
  funnel: { stage: string; count: number }[];
  watchSellers: SellerRow[];
  champions: SellerRow[];
  unmetDemand: ProductRow[];
  series14d: { day: string; contacts: number }[];
}

/** Récupère les stats deal loop agrégées (admin only). null si indisponible/refusé. */
export async function getDealLoopStats(): Promise<DealLoopStats | null> {
  try {
    const fns = await getFirebaseFunctions();
    if (!fns) return null;
    const fn = httpsCallable<unknown, DealLoopStats>(fns, 'getDealLoopStats');
    const res = await fn({});
    return res.data;
  } catch {
    return null;
  }
}
