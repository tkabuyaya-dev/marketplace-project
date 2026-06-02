/**
 * NUNULIA — usePhotoEnhancement
 *
 * Hook pour le composant PhotoEnhancementStep (option facultative dans
 * "Ajouter produit"). Gère le cycle :
 *   1. Idle (le vendeur n'a pas encore choisi)
 *   2. Declined (vendeur garde les originaux — rien à faire)
 *   3. Uploading (upload des originaux vers Cloudinary)
 *   4. Enhancing (appels CF enhanceProductPhoto en séquentiel)
 *   5. Preview (vendeur voit avant/après, peut revert)
 *   6. Failed (PhotoRoom down ou quota — fail-open : on garde les originaux)
 *
 * Le hook UPLOADE les originaux quand le vendeur clique "Améliorer". Si le
 * vendeur reste sur "Non merci", l'upload est fait dans handleAddProduct
 * (chemin existant). Cette stratégie évite les appels CF inutiles et
 * préserve le flow offline (queueAsDraft prend les Files originaux).
 *
 * Fail-open : si l'enhancement échoue (réseau, quota, PhotoRoom 5xx), le
 * hook retombe sur les URLs originales déjà uploadées. Aucun blocage du
 * vendeur — il peut publier dès qu'il clique "Continuer".
 */

import { useCallback, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase-config';
import { uploadImages } from '../services/cloudinary';

export type EnhancementStyle = 'white' | 'branded';

export type EnhancementMode =
  | 'idle'        // choix non fait
  | 'declined'    // garder originaux
  | 'uploading'   // upload originaux en cours
  | 'enhancing'   // appels CF en cours
  | 'preview'     // avant/après visible, vendeur peut revert
  | 'failed';     // échec total — UI fail-open, parent fait l'upload classique

export interface PerImageEnhancement {
  originalUrl: string;
  enhancedUrl?: string;
  status: 'pending' | 'ok' | 'failed' | 'reverted';
  errorCode?: string;
}

export interface UsePhotoEnhancementApi {
  mode: EnhancementMode;
  style: EnhancementStyle | null;
  results: PerImageEnhancement[];
  quotaUsed?: number;
  quotaLimit?: number;
  errorMessage?: string;
  /** Vendeur choisit "Non merci". Parent uploadera les originaux lui-même. */
  decline: () => void;
  /** Vendeur lance l'enhancement avec un style. Upload + appels CF. */
  enhance: (files: File[], style: EnhancementStyle) => Promise<void>;
  /** Remet l'original pour une photo donnée. */
  revertOne: (index: number) => void;
  /** Réinitialise tout (vendeur veut re-choisir, ou cleanup). */
  reset: () => void;
  /**
   * Renvoie les URLs finales prêtes à passer à addProduct.
   * - mode === 'preview' : enhanced (sauf indices revert → original)
   * - mode === 'failed' / 'declined' / autre : tableau vide (parent fait son upload)
   */
  getFinalUrls: () => string[];
  /** True si le hook a uploadé les originaux et le parent peut SKIP son upload. */
  hasUploadedUrls: () => boolean;
}

export function usePhotoEnhancement(): UsePhotoEnhancementApi {
  const [mode, setMode] = useState<EnhancementMode>('idle');
  const [style, setStyle] = useState<EnhancementStyle | null>(null);
  const [results, setResults] = useState<PerImageEnhancement[]>([]);
  const [quotaUsed, setQuotaUsed] = useState<number | undefined>();
  const [quotaLimit, setQuotaLimit] = useState<number | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // Garde l'identité d'une session enhance pour ignorer les promesses en vol
  // si le vendeur reset() avant la fin.
  const sessionRef = useRef(0);

  const reset = useCallback(() => {
    sessionRef.current += 1;
    setMode('idle');
    setStyle(null);
    setResults([]);
    setQuotaUsed(undefined);
    setQuotaLimit(undefined);
    setErrorMessage(undefined);
  }, []);

  const decline = useCallback(() => {
    sessionRef.current += 1;
    setMode('declined');
    setStyle(null);
    setResults([]);
    setErrorMessage(undefined);
  }, []);

  const enhance = useCallback(async (files: File[], chosenStyle: EnhancementStyle) => {
    const sessionId = ++sessionRef.current;
    setStyle(chosenStyle);
    setErrorMessage(undefined);
    setResults([]);
    setMode('uploading');

    // 1) Upload originaux vers Cloudinary
    let originalUrls: string[];
    try {
      originalUrls = await uploadImages(files);
    } catch (err) {
      if (sessionRef.current !== sessionId) return;
      setMode('failed');
      setErrorMessage('Réseau indisponible. Vos photos originales seront publiées.');
      return;
    }
    if (sessionRef.current !== sessionId) return;

    // Initialise les slots — tous en pending avec leur URL originale
    setResults(originalUrls.map((url) => ({ originalUrl: url, status: 'pending' })));
    setMode('enhancing');

    // 2) Appels CF en séquentiel
    const fns = await getFirebaseFunctions();
    if (!fns) {
      if (sessionRef.current !== sessionId) return;
      // CF indispo : on a quand même les originaux uploadés. Fail-open.
      setMode('failed');
      setErrorMessage("L'amélioration n'est pas disponible pour le moment. Vos photos originales seront publiées.");
      return;
    }

    const callable = httpsCallable<
      { cloudinaryUrl: string; style: EnhancementStyle },
      { enhancedUrl: string; style: EnhancementStyle; quotaUsed: number; quotaLimit: number }
    >(fns, 'enhanceProductPhoto');

    let quotaExhausted = false;
    let anySuccess = false;

    for (let i = 0; i < originalUrls.length; i++) {
      if (sessionRef.current !== sessionId) return;
      if (quotaExhausted) {
        // Marque le reste en failed (sans appel CF inutile)
        setResults((prev) => {
          const next = [...prev];
          if (next[i]) next[i] = { ...next[i], status: 'failed', errorCode: 'quota_exhausted' };
          return next;
        });
        continue;
      }
      try {
        const res = await callable({ cloudinaryUrl: originalUrls[i], style: chosenStyle });
        if (sessionRef.current !== sessionId) return;
        anySuccess = true;
        setQuotaUsed(res.data.quotaUsed);
        setQuotaLimit(res.data.quotaLimit);
        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            originalUrl: originalUrls[i],
            enhancedUrl: res.data.enhancedUrl,
            status: 'ok',
          };
          return next;
        });
      } catch (err) {
        if (sessionRef.current !== sessionId) return;
        const code = (err as { code?: string })?.code || 'unknown';
        if (code === 'functions/resource-exhausted') {
          quotaExhausted = true;
          const details = (err as { details?: { quotaUsed?: number; quotaLimit?: number } }).details;
          if (details?.quotaUsed != null) setQuotaUsed(details.quotaUsed);
          if (details?.quotaLimit != null) setQuotaLimit(details.quotaLimit);
        }
        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            originalUrl: originalUrls[i],
            status: 'failed',
            errorCode: code,
          };
          return next;
        });
      }
    }

    if (sessionRef.current !== sessionId) return;

    if (!anySuccess) {
      // Aucun appel n'a réussi : on a quand même les originaux uploadés.
      setMode('failed');
      if (quotaExhausted) {
        setErrorMessage('Quota atteint aujourd\'hui. Vos photos originales seront publiées.');
      } else {
        setErrorMessage("L'amélioration n'est pas disponible pour le moment. Vos photos originales seront publiées.");
      }
      return;
    }

    setMode('preview');
  }, []);

  const revertOne = useCallback((index: number) => {
    setResults((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      // Toggle : si déjà reverted → repasse à ok (si on a une enhancedUrl)
      if (current.status === 'reverted' && current.enhancedUrl) {
        next[index] = { ...current, status: 'ok' };
      } else if (current.status === 'ok') {
        next[index] = { ...current, status: 'reverted' };
      }
      return next;
    });
  }, []);

  const getFinalUrls = useCallback((): string[] => {
    if (mode === 'preview') {
      return results.map((r) => (r.status === 'ok' && r.enhancedUrl ? r.enhancedUrl : r.originalUrl));
    }
    if (mode === 'failed' && results.length > 0) {
      // Originaux uploadés mais enhancement raté — on retombe sur les originaux
      return results.map((r) => r.originalUrl);
    }
    return [];
  }, [mode, results]);

  const hasUploadedUrls = useCallback((): boolean => {
    return (mode === 'preview' || mode === 'failed') && results.length > 0;
  }, [mode, results]);

  return {
    mode,
    style,
    results,
    quotaUsed,
    quotaLimit,
    errorMessage,
    decline,
    enhance,
    revertOne,
    reset,
    getFinalUrls,
    hasUploadedUrls,
  };
}
