/**
 * NUNULIA — Hook usePaymentMethods
 *
 * Méthodes Mobile Money d'un pays, temps réel (éditables depuis l'admin).
 * Jamais vide : fallback sur PAYMENT_METHODS (constants.ts) si le doc
 * Firestore est absent, corrompu ou hors-ligne.
 */

import { useEffect, useState } from 'react';
import { PaymentMethod } from '../types';
import {
  subscribeToPaymentMethods,
  paymentMethodsFallback,
} from '../services/firebase/payment-methods';

export function usePaymentMethods(countryId: string): PaymentMethod[] {
  const [methods, setMethods] = useState<PaymentMethod[]>(() => paymentMethodsFallback(countryId));

  useEffect(() => {
    setMethods(paymentMethodsFallback(countryId));
    const unsub = subscribeToPaymentMethods(countryId, setMethods);
    return () => unsub();
  }, [countryId]);

  return methods;
}

export default usePaymentMethods;
