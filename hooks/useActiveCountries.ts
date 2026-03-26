/**
 * AURABUJA — Hook useActiveCountries
 *
 * Fournit la liste des pays actifs avec cache multi-couches :
 *   Couche 1 : Mémoire (Map JS, TTL 5 min)
 *   Couche 2 : localStorage (TTL 10 min, fallback offline)
 *   Couche 3 : Firestore onSnapshot (temps réel, source de vérité)
 *
 * Usage :
 *   const { countries, loading } = useActiveCountries();
 */

import { useState, useEffect, useRef } from 'react';
import { Country } from '../types';
import { subscribeToActiveCountries } from '../services/firebase/admin-data';

// ── Couche 1 : Cache mémoire (partagé entre tous les composants) ──
const MEM_TTL = 5 * 60 * 1000; // 5 min
let memCache: { data: Country[]; ts: number } | null = null;

// ── Couche 2 : localStorage ──
const LS_KEY = 'aurabuja_active_countries';
const LS_TTL = 10 * 60 * 1000; // 10 min

function readLocalStorage(): Country[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number' || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.ts < LS_TTL) return parsed.data;
    return null; // expired
  } catch {
    return null;
  }
}

function writeLocalStorage(data: Country[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/** Read stale localStorage data (for offline fallback, ignores TTL) */
function readStaleLocalStorage(): Country[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return [];
    return parsed.data;
  } catch {
    return [];
  }
}

// ── Fonctions utilitaires exportées (pour usage hors-React) ──

/** Retourne les pays actifs depuis le cache (mémoire → localStorage → []) */
export function getActiveCountriesCached(): Country[] {
  // Couche 1 : mémoire
  if (memCache && Date.now() - memCache.ts < MEM_TTL) {
    return memCache.data;
  }
  // Couche 2 : localStorage
  const lsData = readLocalStorage();
  if (lsData) {
    memCache = { data: lsData, ts: Date.now() };
    return lsData;
  }
  // Couche 2b : stale localStorage (offline)
  return readStaleLocalStorage();
}

/** Invalide tous les caches pays (appelé quand admin modifie) */
export function invalidateCountriesCache(): void {
  memCache = null;
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ── Hook React ──

interface UseActiveCountriesResult {
  countries: Country[];
  loading: boolean;
  error: string | null;
}

export function useActiveCountries(): UseActiveCountriesResult {
  // Initialiser avec le cache le plus rapide disponible
  const [countries, setCountries] = useState<Country[]>(() => getActiveCountriesCached());
  const [loading, setLoading] = useState<boolean>(() => getActiveCountriesCached().length === 0);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  // Track last IDs to avoid unnecessary re-renders
  const lastIdsRef = useRef<string>('');

  useEffect(() => {
    // Couche 3 : Firestore onSnapshot — temps réel
    unsubRef.current = subscribeToActiveCountries((activeCountries) => {
      // Trier par sort_order si disponible, sinon par nom
      const sorted = [...activeCountries].sort((a, b) => {
        const orderA = (a as any).sortOrder ?? 999;
        const orderB = (b as any).sortOrder ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

      // Mettre à jour les 2 couches de cache
      memCache = { data: sorted, ts: Date.now() };
      writeLocalStorage(sorted);

      // Only update React state if data actually changed (prevents infinite loops)
      const newIds = sorted.map(c => `${c.id}:${c.isActive}`).join(',');
      if (newIds !== lastIdsRef.current) {
        lastIdsRef.current = newIds;
        setCountries(sorted);
      }
      setLoading(false);
      setError(null);
    });

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  return { countries, loading, error };
}

export default useActiveCountries;
