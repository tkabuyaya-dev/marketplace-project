import React from 'react';
import { LOW_STOCK_THRESHOLD } from '../constants';

interface StockUrgencyProps {
  stockQuantity?: number;
}

export const StockUrgency: React.FC<StockUrgencyProps> = ({ stockQuantity }) => {
  if (stockQuantity === undefined || stockQuantity === null || stockQuantity > LOW_STOCK_THRESHOLD) return null;

  if (stockQuantity <= 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
        <span className="text-red-400 text-lg">&#x26D4;</span>
        <span className="text-red-400 font-semibold text-sm">Rupture de stock</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl animate-pulse">
      <span className="text-amber-400 text-lg">&#x26A0;&#xFE0F;</span>
      <span className="text-amber-400 font-semibold text-sm">
        Plus que <span className="text-amber-300 font-bold">{stockQuantity}</span> article{stockQuantity > 1 ? 's' : ''} en stock
      </span>
    </div>
  );
};
