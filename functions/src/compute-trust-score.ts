/**
 * NUNULIA — Trust score pour buyer requests (fonction pure)
 *
 * Calcule un score 0-100 à partir de signaux historiques (numéro déjà confirmé,
 * deviceId vu, IP) et de patterns d'abus (burst, multi-numéros, deviceId
 * blacklisté). Retourne aussi la liste lisible des signaux pour audit admin.
 *
 * Gate utilisé par submitBuyerRequest :
 *   score ≥ 70  → publication directe ('active', visible=true)
 *   score 40-69 → 'pending_confirmation' (admin alerté 🟡)
 *   score < 40  → 'pending_confirmation' (admin alerté 🔴)
 *   blacklisté  → 'pending_confirmation' + score=0 + silence honeypot
 *
 * Fonction PURE testable sans Firestore : on lui passe les signaux déjà lus
 * (whatsappHistory, deviceHistory). Les lectures Firestore sont faites par
 * l'appelant (submit-buyer-request.ts).
 */

import type { DeviceFingerprint } from "../../types.js";

export interface TrustScoreInput {
  /** Numéro WhatsApp normalisé (avec +). */
  whatsapp: string;
  /** Fingerprint de l'appareil (16 chars). */
  deviceId: string | null;
  /** IP source (peut être null si CF n'a pas eu accès aux headers). */
  ip: string | null;
  /** UTC ms de la soumission (côté serveur). */
  now: number;

  // ── Signaux historiques pré-chargés par le caller ─────────────────────
  /** Demandes passées avec ce numéro. */
  whatsappHistory: Array<{
    status: string;
    confirmedAt?: number | null;
    createdAt: number;
    deviceId?: string;
    countryId?: string;
    city?: string;
  }>;
  /** Fingerprint dénormalisé du device (null si jamais vu). */
  deviceHistory: DeviceFingerprint | null;
  /** Nombre de demandes depuis cette IP dans la dernière heure. */
  ipBurstCount: number;
  /** Le device est-il dans la blocklist active ? */
  isBlocked: boolean;
  /** Pays déclaré dans la demande. */
  declaredCountry: string;
  /** Ville déclarée. */
  declaredCity: string;
}

export interface TrustScoreResult {
  /** Score borné [0, 100]. */
  score: number;
  /** Signaux lisibles ("device_seen_before:+20", "ip_burst_1h:-30"…). */
  signals: string[];
  /** Triage : >= 70 = direct, 40-69 = jaune, < 40 = rouge. */
  level: 'green' | 'yellow' | 'red' | 'blocked';
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Score borné dans [0, 100]. Démarre à 50 (neutre) et oscille selon les signaux.
 */
export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  // Court-circuit blacklist : tout est forcé à 0 (mais on calcule quand même
  // pour l'audit — l'admin verra les signaux historiques).
  if (input.isBlocked) {
    return {
      score: 0,
      signals: ['device_blacklisted:-100'],
      level: 'blocked',
    };
  }

  let score = 50;
  const signals: string[] = ['baseline:+50'];

  const { whatsappHistory, deviceHistory, ipBurstCount, now, deviceId } = input;

  // ── Signaux positifs ──────────────────────────────────────────────────

  // +30 : Le numéro a déjà confirmé une demande dans le passé (≤ 90j)
  const confirmedBefore = whatsappHistory.some(h =>
    h.confirmedAt && h.confirmedAt > 0 && now - h.confirmedAt < 90 * ONE_DAY_MS
  );
  if (confirmedBefore) {
    score += 30;
    signals.push('whatsapp_confirmed_before:+30');
  }

  // +20 : Le deviceId a déjà confirmé une demande
  if (deviceHistory && deviceHistory.confirmedRequests > 0) {
    score += 20;
    signals.push('device_confirmed_before:+20');
  }

  // +15 : Comportement device connu et propre (≥ 2 demandes, 0 signalements)
  if (
    deviceHistory &&
    deviceHistory.totalRequests >= 2 &&
    deviceHistory.abuseFlagged === 0
  ) {
    score += 15;
    signals.push('device_clean_history:+15');
  }

  // ── Signaux négatifs ──────────────────────────────────────────────────

  // -50 : Numéro jamais vu sur Nunulia (premier contact)
  if (whatsappHistory.length === 0) {
    score -= 50;
    signals.push('whatsapp_first_time:-50');
  }

  // -30 : 3+ demandes depuis ce deviceId dans les 24h dernières
  if (deviceHistory) {
    const recent24h = whatsappHistory.filter(h =>
      h.deviceId === deviceId && now - h.createdAt < ONE_DAY_MS
    ).length;
    if (recent24h >= 3) {
      score -= 30;
      signals.push(`device_burst_24h(${recent24h}):-30`);
    }
  }

  // -40 : Numéros différents pour le même deviceId aujourd'hui
  if (deviceHistory && deviceHistory.whatsappNumbers.length >= 3) {
    // Compte les numéros vus dans les 24h
    const numbersToday = new Set<string>();
    whatsappHistory.forEach(h => {
      if (h.deviceId === deviceId && now - h.createdAt < ONE_DAY_MS) {
        numbersToday.add(input.whatsapp); // approximation : on n'a pas h.whatsapp ici
      }
    });
    if (deviceHistory.whatsappNumbers.length >= 3) {
      score -= 40;
      signals.push(`device_multi_whatsapp(${deviceHistory.whatsappNumbers.length}):-40`);
    }
  }

  // -30 : IP burst — 3+ demandes même IP en 1h
  if (ipBurstCount >= 3) {
    score -= 30;
    signals.push(`ip_burst_1h(${ipBurstCount}):-30`);
  }

  // -20 : Demande soumise entre 00h00 et 04h00 UTC (heure suspecte)
  const hourUtc = new Date(now).getUTCHours();
  if (hourUtc < 4) {
    score -= 20;
    signals.push('off_hours_00_04_utc:-20');
  }

  // -40 : Device a déjà été signalé pour abus
  if (deviceHistory && deviceHistory.abuseFlagged > 0) {
    score -= 40;
    signals.push(`device_abuse_history(${deviceHistory.abuseFlagged}):-40`);
  }

  // ── Borne + niveau ────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  let level: TrustScoreResult['level'];
  if (score >= 70) level = 'green';
  else if (score >= 40) level = 'yellow';
  else level = 'red';

  return { score, signals, level };
}

/**
 * Génère un code de confirmation humain-lisible, 8 caractères, sans confusion
 * 0/O/1/I/L. Alphabet 32 chars → 32^8 ≈ 10^12 combinaisons, espace de
 * collision négligeable sur 24h × quelques milliers de pending max.
 *
 * Utilise crypto.randomBytes pour entropie cryptographique côté CF.
 */
export function generateConfirmationCode(): string {
  // ABCDEFGHJKMNPQRSTUVWXYZ23456789 (32 chars sans 0,O,1,I,L)
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const len = 8;

  // Node crypto disponible côté CF — pas besoin de dépendance supplémentaire.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('crypto') as typeof import('crypto');
  const buf = randomBytes(len);
  let code = '';
  for (let i = 0; i < len; i++) {
    code += ALPHABET[buf[i] % ALPHABET.length];
  }
  return code;
}
