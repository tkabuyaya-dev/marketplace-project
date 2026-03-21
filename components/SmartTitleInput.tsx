import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Product, Category } from '../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  existingProducts: Product[];
  categories: Category[];
  onSuggestionSelect: (product: Product) => void;
  placeholder?: string;
}

/**
 * Smart title input with autocomplete from existing products.
 * When a suggestion is selected, auto-fills category + subcategory.
 * 100% client-side, 0 network calls.
 */
export const SmartTitleInput: React.FC<Props> = ({
  value,
  onChange,
  existingProducts,
  categories,
  onSuggestionSelect,
  placeholder = 'Ex: MacBook Pro M3...',
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build suggestion index from existing products + category names
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];

    // Search in seller's existing products
    const productMatches = existingProducts
      .filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
      )
      .slice(0, 4)
      .map(p => ({
        type: 'product' as const,
        label: p.title,
        sub: p.category,
        product: p,
      }));

    // Search in subcategories for category suggestions
    const catMatches: typeof productMatches = [];
    for (const cat of categories) {
      for (const sub of (cat.subCategories || [])) {
        if (sub.toLowerCase().includes(q) && catMatches.length < 2) {
          catMatches.push({
            type: 'product' as const,
            label: sub,
            sub: cat.name,
            product: { category: cat.id, subCategory: sub } as Product,
          });
        }
      }
    }

    return [...productMatches, ...catMatches].slice(0, 5);
  }, [value, existingProducts, categories]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[selectedIndex];
      onChange(selected.label);
      onSuggestionSelect(selected.product);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, selectedIndex, onChange, onSuggestionSelect]);

  const handleSelect = (index: number) => {
    const selected = suggestions[index];
    onChange(selected.label);
    onSuggestionSelect(selected.product);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-gray-400 mb-1">Nom du produit</label>
      <input
        ref={inputRef}
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        }}
        onFocus={() => value.length >= 2 && setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-blue-500 outline-none"
        placeholder={placeholder}
        autoComplete="off"
      />

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(i)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                i === selectedIndex
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <span className="text-gray-500 text-xs flex-shrink-0">
                {s.type === 'product' ? '📦' : '🏷️'}
              </span>
              <div className="flex-1 min-w-0">
                <span className="block truncate">{s.label}</span>
                {s.sub && (
                  <span className="block text-[10px] text-gray-500 truncate">{s.sub}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
