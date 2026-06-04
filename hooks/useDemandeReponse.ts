/**
 * NUNULIA — useDemandeReponse
 *
 * Encapsule toute la logique de réponse à une demande client :
 *   - Realtime listener sur le document buyerRequests/{id} (compteur,
 *     état isFull mis à jour en direct sans recharge)
 *   - Lecture one-shot de hasSellerResponded au mount
 *   - Action handleRepondre : transaction atomique côté service, ouvre
 *     WhatsApp seulement si la place a été obtenue (ou si le vendeur a
 *     déjà répondu)
 *
 * Le hook expose une interface stable au composant — pas de logique métier
 * dans la card. Le composant n'a qu'à câbler l'UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_SELLERS_PER_REQUEST,
  hasSellerResponded,
  respondToBuyerRequest,
  subscribeBuyerRequest,
} from '../services/firebase/buyer-requests';
import { buildWaUrl } from '../config/whatsapp.config';
import type { BuyerRequest } from '../types';

export interface DemandeReponseState {
  reponseCount: number;
  maxReponses: number;
  isFull: boolean;
  aDejaRepondu: boolean;
  isLoading: boolean;
  handleRepondre: () => Promise<{ opened: boolean; reason?: 'full' | 'error' }>;
}

interface Args {
  request: BuyerRequest;
  sellerId: string | null;
  sellerTierId: string | undefined;
  /** Message déjà i18n'isé pour pré-remplir le lien WhatsApp. */
  whatsappMessage: string;
}

export function useDemandeReponse({
  request,
  sellerId,
  sellerTierId,
  whatsappMessage,
}: Args): DemandeReponseState {
  // Realtime — point de vérité unique. La valeur snapshot du prop request
  // sert juste d'initialisation pour éviter un flash 0/5.
  const [reponseCount, setReponseCount] = useState<number>(request.uniqueSellerCount ?? 0);
  const [isFull, setIsFull] = useState<boolean>(request.isFull === true);
  const [aDejaRepondu, setADejaRepondu] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // 1) Realtime listener — la barre s'anime quand un autre vendeur clique
  useEffect(() => {
    const unsub = subscribeBuyerRequest(request.id, (live) => {
      if (!mounted.current || !live) return;
      setReponseCount(live.uniqueSellerCount ?? 0);
      setIsFull(live.isFull === true);
    });
    return () => unsub();
  }, [request.id]);

  // 2) Lecture initiale "j'ai déjà répondu ?". Si pas de seller (pas
  // authentifié), on saute (cas qui ne devrait pas arriver — la page est
  // déjà auth-gatée).
  useEffect(() => {
    if (!sellerId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const has = await hasSellerResponded(request.id, sellerId);
        if (cancelled || !mounted.current) return;
        setADejaRepondu(has);
      } catch {
        /* lecture best-effort ; en cas d'échec on autorise la tentative */
      } finally {
        if (!cancelled && mounted.current) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [request.id, sellerId]);

  // 3) Action principale
  const handleRepondre = useCallback(async (): Promise<{ opened: boolean; reason?: 'full' | 'error' }> => {
    // Pas de seller : on n'aurait pas dû arriver ici, mais on guard.
    if (!sellerId) return { opened: false, reason: 'error' };

    const openWhatsApp = () => {
      window.open(
        buildWaUrl(whatsappMessage, { phone: request.whatsapp }),
        '_blank',
        'noopener,noreferrer',
      );
    };

    // Cas 1 : déjà répondu → no-op transaction, ouvre WhatsApp directement.
    if (aDejaRepondu) {
      openWhatsApp();
      return { opened: true };
    }

    try {
      const res = await respondToBuyerRequest(
        request.id,
        sellerId,
        sellerTierId || 'free',
      );
      if (!res.ok) {
        // La transaction a vu que c'est plein — sync l'état local et n'ouvre rien.
        if (mounted.current) {
          setIsFull(true);
          setReponseCount(MAX_SELLERS_PER_REQUEST);
        }
        return { opened: false, reason: 'full' };
      }
      // Transaction OK — mais la donnée live arrivera via onSnapshot ;
      // on met aussi à jour optimistically pour zéro latence perçue.
      if (mounted.current) {
        setADejaRepondu(true);
        if (!res.alreadyResponded) {
          setReponseCount((c) => Math.max(c + 1, c));
          setIsFull(res.isFullAfter);
        }
      }
      openWhatsApp();
      return { opened: true };
    } catch {
      return { opened: false, reason: 'error' };
    }
  }, [aDejaRepondu, request.id, request.whatsapp, sellerId, sellerTierId, whatsappMessage]);

  return {
    reponseCount,
    maxReponses: MAX_SELLERS_PER_REQUEST,
    isFull,
    aDejaRepondu,
    isLoading,
    handleRepondre,
  };
}
