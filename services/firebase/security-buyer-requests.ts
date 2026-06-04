/**
 * NUNULIA — Helpers Firestore admin pour le dashboard sécurité.
 *
 * Lectures only — toutes les écritures (blocklist, deviceFingerprints) passent
 * par les CFs admin SDK pour conserver les invariants. Le client admin écrit
 * seulement via callables explicites (à venir si on ajoute des actions
 * manuelles).
 */

import {
  db, collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  COLLECTIONS,
} from './constants';
import { docToBuyerRequest } from './buyer-requests';
import { getFirebaseFunctions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';
import type { BuyerRequest, DeviceBlock, DeviceFingerprint } from '../../types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Liste les demandes en attente de confirmation (admin).
 * Triées par date desc, limit 100.
 */
export async function getPendingConfirmationRequests(): Promise<BuyerRequest[]> {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('status', '==', 'pending_confirmation'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToBuyerRequest(d.data(), d.id));
}

/**
 * Liste les demandes signalées comme abus par le vrai propriétaire WhatsApp.
 * Sert à alimenter la section "Alertes" du dashboard.
 */
export async function getAbuseReportedRequests(daysBack = 7): Promise<BuyerRequest[]> {
  if (!db) return [];
  const since = Date.now() - daysBack * ONE_DAY_MS;
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('isAbuse', '==', true),
    where('abuseSignaledAt', '>=', since),
    orderBy('abuseSignaledAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToBuyerRequest(d.data(), d.id));
}

/**
 * Récupère tous les devices fingerprints visibles dans le dashboard.
 * Triés par lastSeenAt desc.
 */
export async function getRecentDevices(daysBack = 7): Promise<DeviceFingerprint[]> {
  if (!db) return [];
  const since = Date.now() - daysBack * ONE_DAY_MS;
  const q = query(
    collection(db, COLLECTIONS.DEVICE_FINGERPRINTS),
    where('lastSeenAt', '>=', since),
    orderBy('lastSeenAt', 'desc'),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as DeviceFingerprint);
}

/** Récupère un device précis (pour la vue dossier). */
export async function getDeviceFingerprint(deviceId: string): Promise<DeviceFingerprint | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.DEVICE_FINGERPRINTS, deviceId));
  if (!snap.exists()) return null;
  return snap.data() as DeviceFingerprint;
}

/** Récupère toutes les demandes d'un device (pour le dossier d'enquête). */
export async function getRequestsByDevice(deviceId: string, max = 50): Promise<BuyerRequest[]> {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTIONS.BUYER_REQUESTS),
    where('deviceId', '==', deviceId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToBuyerRequest(d.data(), d.id));
}

/** Liste les devices blacklistés (actifs ou expirés). */
export async function getBlocklist(): Promise<DeviceBlock[]> {
  if (!db) return [];
  const snap = await getDocs(query(
    collection(db, COLLECTIONS.BLOCKLIST),
    orderBy('blockedAt', 'desc'),
    limit(200),
  ));
  return snap.docs.map(d => d.data() as DeviceBlock);
}

/**
 * Détecte les patterns suspects "device avec 3+ numéros différents en 1h" :
 * scan en mémoire sur les demandes des dernières 24h.
 */
export interface DeviceAlert {
  deviceId: string;
  whatsappNumbers: string[];     // distincts
  count: number;
  firstSeen: number;
  lastSeen: number;
  ip?: string;
}

/**
 * Active manuellement une demande pending_confirmation (admin only).
 * Appelle la CF confirmBuyerRequest avec auth admin requise côté serveur.
 */
export async function adminConfirmBuyerRequest(requestId: string): Promise<{
  ok: boolean;
  alreadyConfirmed: boolean;
}> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<
    { requestId: string },
    { ok: boolean; alreadyConfirmed: boolean }
  >(fns, 'confirmBuyerRequest');
  const res = await fn({ requestId });
  return res.data;
}

/**
 * Signale une demande comme abus (admin only) → suspension + blacklist auto
 * du device d'origine s'il a déjà été signalé.
 */
export async function adminSignalBuyerRequest(requestId: string): Promise<{
  ok: boolean;
  alreadyHandled?: boolean;
}> {
  const fns = await getFirebaseFunctions();
  if (!fns) throw new Error('Firebase Functions non initialisé');
  const fn = httpsCallable<
    { requestId: string },
    { ok: boolean; alreadyHandled?: boolean }
  >(fns, 'signalBuyerRequest');
  const res = await fn({ requestId });
  return res.data;
}

export function detectMultiNumberAlerts(requests: BuyerRequest[]): DeviceAlert[] {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const byDevice = new Map<string, {
    numbers: Set<string>;
    count: number;
    firstSeen: number;
    lastSeen: number;
    ip?: string;
  }>();
  requests.forEach(r => {
    if (!r.deviceId) return;
    if (now - r.createdAt > 24 * oneHour) return;
    const entry = byDevice.get(r.deviceId) || {
      numbers: new Set<string>(),
      count: 0,
      firstSeen: r.createdAt,
      lastSeen: r.createdAt,
      ip: r.deviceIp,
    };
    entry.numbers.add(r.whatsapp);
    entry.count += 1;
    entry.firstSeen = Math.min(entry.firstSeen, r.createdAt);
    entry.lastSeen = Math.max(entry.lastSeen, r.createdAt);
    if (r.deviceIp) entry.ip = r.deviceIp;
    byDevice.set(r.deviceId, entry);
  });
  return Array.from(byDevice.entries())
    .filter(([, v]) => v.numbers.size >= 3)
    .map(([deviceId, v]) => ({
      deviceId,
      whatsappNumbers: Array.from(v.numbers),
      count: v.count,
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      ip: v.ip,
    }))
    .sort((a, b) => b.whatsappNumbers.length - a.whatsappNumbers.length);
}
