/**
 * NUNULIA — useUserLanguage
 *
 * Langue préférée pour la lecture des posts B2B.
 * Priorité : (1) users/{uid}.b2bLang Firestore, (2) navigator.language (slice 2),
 * (3) fallback 'fr'. Le setter écrit en Firestore via updateUserProfile.
 *
 * Distinct de l'i18n UI (FR/EN seulement). Cette langue affecte UNIQUEMENT
 * quel champ de B2BPost.translations afficher.
 */

import { useCallback, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { updateUserProfile } from '../services/firebase';
import type { B2BLang } from '../types';

const SUPPORTED: readonly B2BLang[] = ['fr', 'en', 'sw', 'rn', 'rw'] as const;

function detectFromNavigator(): B2BLang {
  if (typeof navigator === 'undefined') return 'fr';
  const code = (navigator.language || '').slice(0, 2).toLowerCase();
  return (SUPPORTED as readonly string[]).includes(code) ? (code as B2BLang) : 'fr';
}

export function useUserLanguage(): {
  language: B2BLang;
  setLanguage: (lang: B2BLang) => Promise<void>;
  supported: readonly B2BLang[];
} {
  const { currentUser } = useAppContext();

  const language = useMemo<B2BLang>(() => {
    const stored = currentUser?.b2bLang;
    if (stored && (SUPPORTED as readonly string[]).includes(stored)) return stored;
    return detectFromNavigator();
  }, [currentUser?.b2bLang]);

  const setLanguage = useCallback(async (lang: B2BLang) => {
    if (!currentUser) return;
    if (!(SUPPORTED as readonly string[]).includes(lang)) return;
    await updateUserProfile(currentUser.id, { b2bLang: lang });
  }, [currentUser?.id]);

  return { language, setLanguage, supported: SUPPORTED };
}
