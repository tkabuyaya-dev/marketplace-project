/**
 * B2BReputationRings — anneau de réputation B2B.
 *
 * Mapping (cf. plan §2.7) :
 *   0-5     pts → ○  Nouveau
 *   6-20    pts → ◎  Vérifié
 *   21-50   pts → ◉  Actif B2B
 *   51+ pts → ⦿  Top vendeur B2B
 *
 * On utilise des cercles SVG plutôt que des glyphes Unicode pour un rendu
 * net sur Android Chrome 3G (les glyphes ◎/◉/⦿ rendent mal sur certains
 * navigateurs et nécessitent un fallback font).
 */

import React from 'react';

interface Props {
  score: number;
  size?: number;
  ariaLabel?: string;
}

type Tier = { rings: number; label: string };

function tierOf(score: number): Tier {
  if (score >= 51) return { rings: 4, label: 'Top B2B' };
  if (score >= 21) return { rings: 3, label: 'Actif B2B' };
  if (score >= 6) return { rings: 2, label: 'Vérifié' };
  return { rings: 1, label: 'Nouveau' };
}

export const B2BReputationRings: React.FC<Props> = ({ score, size = 16, ariaLabel }) => {
  const { rings, label } = tierOf(score);
  const dim = size;
  const cx = dim / 2;
  const cy = dim / 2;
  const radii = [dim / 2 - 1, dim / 2 - 4, dim / 2 - 7, dim / 2 - 10].filter((r) => r > 0);
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `Réputation B2B ${label} — ${score} points`}
      className="inline-flex items-center"
      title={`${label} • ${score} pts`}
    >
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} aria-hidden="true">
        {radii.slice(0, rings).map((r, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={i === rings - 1 ? 1.5 : 1}
            opacity={1 - i * 0.18}
          />
        ))}
      </svg>
    </span>
  );
};
