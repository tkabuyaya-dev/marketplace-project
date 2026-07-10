/**
 * NUNULIA — Méthodes de paiement Mobile Money par pays (éditables admin)
 *
 * Collection `paymentMethods/{countryId}` : { methods: [{ name, number, icon }] }.
 * Même pattern éprouvé que subscriptionPricing et countries :
 *   - Firestore onSnapshot = source de vérité temps réel (une modification
 *     admin est visible par les vendeurs en ~1-3 s, sans redéploiement)
 *   - PAYMENT_METHODS (constants.ts) = seed + fallback offline/doc absent
 *
 * Rules : read public / write admin (bloc additif, pattern subscriptionPricing).
 */

import { PaymentMethod } from '../../types';
import { PAYMENT_METHODS } from '../../constants';
import { db, doc, setDoc, onSnapshot, collection } from './constants';
import type { Unsubscribe } from './constants';

const COLLECTION = 'paymentMethods';

/** Fallback local : constantes du pays, sinon celles du Burundi. */
export function paymentMethodsFallback(countryId: string): PaymentMethod[] {
  return PAYMENT_METHODS[countryId] || PAYMENT_METHODS['bi'];
}

function sanitize(raw: unknown, countryId: string): PaymentMethod[] {
  if (!Array.isArray(raw)) return paymentMethodsFallback(countryId);
  const methods = raw
    .filter(m => m && typeof m.name === 'string' && m.name.trim().length > 0
      && typeof m.number === 'string' && m.number.trim().length > 0)
    .map(m => ({
      name: String(m.name).slice(0, 40),
      number: String(m.number).slice(0, 60),
      icon: typeof m.icon === 'string' && m.icon.length <= 8 ? m.icon : '📱',
    }));
  // Doc corrompu/vide → fallback (ne jamais afficher zéro méthode de paiement)
  return methods.length > 0 ? methods : paymentMethodsFallback(countryId);
}

/** Temps réel pour UN pays (PlansPage, modals vendeur). */
export function subscribeToPaymentMethods(
  countryId: string,
  callback: (methods: PaymentMethod[]) => void,
): Unsubscribe {
  const fallback = paymentMethodsFallback(countryId);
  if (!db) {
    callback(fallback);
    return () => {};
  }
  return onSnapshot(
    doc(db, COLLECTION, countryId),
    (snap) => {
      callback(snap.exists() ? sanitize((snap.data() as any)?.methods, countryId) : fallback);
    },
    () => callback(fallback),
  );
}

/** Temps réel pour TOUS les pays (console admin) — mergé sur les constantes. */
export function subscribeToAllPaymentMethods(
  callback: (byCountry: Record<string, PaymentMethod[]>) => void,
): Unsubscribe {
  const base: Record<string, PaymentMethod[]> = { ...PAYMENT_METHODS };
  if (!db) {
    callback(base);
    return () => {};
  }
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const merged: Record<string, PaymentMethod[]> = { ...PAYMENT_METHODS };
      snap.docs.forEach(d => {
        merged[d.id] = sanitize((d.data() as any)?.methods, d.id);
      });
      callback(merged);
    },
    () => callback(base),
  );
}

/** Admin : remplace les méthodes d'un pays (doc entier). */
export async function updatePaymentMethods(
  countryId: string,
  methods: PaymentMethod[],
): Promise<void> {
  if (!db) throw new Error('Firebase non initialisé');
  await setDoc(doc(db, COLLECTION, countryId), {
    methods,
    updatedAt: Date.now(),
  });
}
