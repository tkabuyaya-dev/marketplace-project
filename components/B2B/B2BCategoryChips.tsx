/**
 * B2BCategoryChips — filtre horizontal des catégories avec compteurs live.
 *
 * Le compteur n'est pas un onSnapshot (trop coûteux sur 3G) : il vient de
 * countOpenPostsByCategory() rafraîchi au mount + après une publication.
 * Présentation chips horizontales scrollables sur mobile.
 */

import React from 'react';
import type { B2BCategory } from '../../types';

interface Props {
  active: B2BCategory | null;
  counts: Record<B2BCategory, number>;
  onChange: (cat: B2BCategory | null) => void;
  labels: Record<B2BCategory | 'all', string>;
}

const CATEGORIES: { id: B2BCategory; color: string }[] = [
  { id: 'fournisseur', color: 'var(--b2b-cat-fournisseur)' },
  { id: 'revendeur',   color: 'var(--b2b-cat-revendeur)' },
  { id: 'marche',      color: 'var(--b2b-cat-marche)' },
  { id: 'transport',   color: 'var(--b2b-cat-transport)' },
];

export const B2BCategoryChips: React.FC<Props> = ({ active, counts, onChange, labels }) => {
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide"
      role="tablist"
      aria-label={labels.all}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === null}
        onClick={() => onChange(null)}
        className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-150 ${
          active === null
            ? 'bg-white text-gray-900'
            : 'bg-white/8 text-white/80 hover:bg-white/12'
        }`}
      >
        {labels.all}
        <span className="ml-1.5 text-[11px] opacity-70">{totalAll}</span>
      </button>
      {CATEGORIES.map((c) => {
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(c.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-150 inline-flex items-center gap-1.5 ${
              isActive ? 'bg-white text-gray-900' : 'bg-white/8 text-white/80 hover:bg-white/12'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: c.color }}
              aria-hidden="true"
            />
            {labels[c.id]}
            <span className="text-[11px] opacity-70">{counts[c.id] || 0}</span>
          </button>
        );
      })}
    </div>
  );
};
