import React from 'react';
import { ProductScore } from '../hooks/useProductScore';

interface Props {
  score: ProductScore;
}

const LEVEL_LABELS: Record<ProductScore['level'], string> = {
  poor: 'A ameliorer',
  fair: 'Correct',
  good: 'Bon',
  excellent: 'Excellent',
};

const LEVEL_COLORS: Record<ProductScore['level'], { bar: string; text: string; bg: string }> = {
  poor:      { bar: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/10' },
  fair:      { bar: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  good:      { bar: 'bg-blue-500',   text: 'text-blue-400',   bg: 'bg-blue-500/10' },
  excellent: { bar: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-500/10' },
};

export const ProductQualityScore: React.FC<Props> = ({ score }) => {
  const colors = LEVEL_COLORS[score.level];

  return (
    <div className={`${colors.bg} border border-gray-700/50 rounded-2xl p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <span className="text-xs font-bold text-gray-300">Qualite de l'annonce</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${colors.text}`}>
            {LEVEL_LABELS[score.level]}
          </span>
          <span className={`text-sm font-black ${colors.text}`}>
            {score.percentage}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bar}`}
          style={{ width: `${score.percentage}%` }}
        />
      </div>

      {/* Suggestions */}
      {score.suggestions.length > 0 && (
        <div className="space-y-1.5">
          {score.suggestions.slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="text-yellow-500 mt-0.5 flex-shrink-0">💡</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
