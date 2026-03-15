import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { Category } from '../types';
import { INITIAL_CATEGORIES } from '../constants';

/**
 * Real-time categories from Firestore (single source of truth).
 * Uses onSnapshot for instant updates when admin modifies categories.
 * Falls back to INITIAL_CATEGORIES if Firestore is unreachable.
 */
export function useCategories(): { categories: Category[]; loading: boolean } {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        if (!snap.empty) {
          setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
        }
        setLoading(false);
      },
      () => {
        // Error (offline, permissions, etc.) — keep fallback
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { categories, loading };
}
