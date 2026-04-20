import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Product, Category } from '../types';
import { getBrandsForContext } from '../data/brands';

// ── Suggestion types ──────────────────────────────────────────────────────────

/** A known brand name from the local dictionary. Selecting it pre-fills the
 *  input with "<Brand> " so the seller can immediately type the model name. */
interface BrandSuggestion {
  type: 'brand';
  label: string;
  /** Human-readable context shown below the brand name (subcategory or category). */
  context: string;
}

/** One of the seller's own existing products. Selecting it auto-fills the whole
 *  title and propagates the category/subcategory to the parent form. */
interface ProductSuggestion {
  type: 'product';
  label: string;
  context: string;
  product: Product;
}

/** A subcategory name pulled from the category tree. Selecting it auto-fills
 *  the category/subcategory fields in the parent form. */
interface CategorySuggestion {
  type: 'category';
  label: string;
  context: string;
  product: Partial<Product>; // carries { category, subCategory } for onSuggestionSelect
}

type Suggestion = BrandSuggestion | ProductSuggestion | CategorySuggestion;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  existingProducts: Product[];
  categories: Category[];
  onSuggestionSelect: (product: Product) => void;
  /** Currently selected category ID (e.g. 'electronique-telephonie'). */
  selectedCategory?: string;
  /** Currently selected subcategory string (e.g. 'Smartphones'). */
  selectedSubCategory?: string;
  placeholder?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bold-highlights the portion of `text` that matches `query`. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-white">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SmartTitleInput: React.FC<Props> = ({
  value,
  onChange,
  existingProducts,
  categories,
  onSuggestionSelect,
  selectedCategory,
  selectedSubCategory,
  placeholder = 'Ex: iPhone 15 Pro 256 Go Noir…',
}) => {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  // ── Build suggestions ────────────────────────────────────────────────────

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];

    // 1. Brand suggestions — from local dictionary, no network call
    const brandPool = getBrandsForContext(selectedCategory, selectedSubCategory);
    const contextLabel = selectedSubCategory
      || categories.find(c => c.id === selectedCategory)?.name
      || '';

    const brandSuggestions: BrandSuggestion[] = brandPool
      .filter(b => b.toLowerCase().includes(q))
      // Avoid suggesting the brand when the user already typed it exactly
      .filter(b => b.toLowerCase() !== q)
      .slice(0, 3)
      .map(b => ({ type: 'brand', label: b, context: contextLabel }));

    // 2. Product suggestions — seller's own existing products
    const productSuggestions: ProductSuggestion[] = existingProducts
      .filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(q))),
      )
      // Deduplicate against brand suggestions (avoid showing "iPhone" twice)
      .filter(p => !brandSuggestions.some(
        b => b.label.toLowerCase() === p.title.toLowerCase(),
      ))
      .slice(0, 3)
      .map(p => ({
        type: 'product',
        label: p.title,
        context: categories.find(c => c.id === p.category)?.name ?? p.category,
        product: p,
      }));

    // 3. Category / subcategory suggestions — help the seller pick a category
    const categorySuggestions: CategorySuggestion[] = [];
    for (const cat of categories) {
      for (const sub of (cat.subCategories ?? [])) {
        if (sub.toLowerCase().includes(q) && categorySuggestions.length < 2) {
          categorySuggestions.push({
            type: 'category',
            label: sub,
            context: cat.name,
            product: { category: cat.id, subCategory: sub } as Partial<Product>,
          });
        }
      }
    }

    // Brand first → product → category. Cap at 6 total.
    return [...brandSuggestions, ...productSuggestions, ...categorySuggestions].slice(0, 6);
  }, [value, existingProducts, categories, selectedCategory, selectedSubCategory]);

  // ── Close on outside click ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        listRef.current  && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      handleSelect(cursor);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, suggestions, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection handler ────────────────────────────────────────────────────

  const handleSelect = useCallback((index: number) => {
    const s = suggestions[index];

    if (s.type === 'brand') {
      // Pre-fill with "<Brand> " — seller continues typing the model name
      onChange(s.label + ' ');
      setOpen(false);
      setCursor(-1);
      // Return focus so the seller can keep typing immediately
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    // Product or Category: fill the full title and propagate to parent form
    onChange(s.label);
    onSuggestionSelect(s.product as Product);
    setOpen(false);
    setCursor(-1);
  }, [suggestions, onChange, onSuggestionSelect]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-gray-400 mb-1">
        Nom du produit
      </label>

      <input
        ref={inputRef}
        required
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => value.length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-blue-500 outline-none"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck
      />

      {/* ── Dropdown ───────────────────────────────────────────────────── */}
      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}-${i}`}
              type="button"
              role="option"
              aria-selected={i === cursor}
              onMouseDown={() => handleSelect(i)}
              onMouseEnter={() => setCursor(i)}
              className={`
                w-full text-left px-4 py-2.5 text-sm transition-colors
                flex items-center gap-3
                ${i === cursor ? 'bg-gray-700' : 'hover:bg-gray-700/50'}
              `}
            >
              {/* Left icon / badge */}
              {s.type === 'brand' ? (
                <span className="flex-shrink-0 text-[10px] font-bold tracking-wide
                                 text-blue-400 bg-blue-500/10 border border-blue-500/30
                                 px-1.5 py-0.5 rounded-md uppercase">
                  Marque
                </span>
              ) : s.type === 'product' ? (
                <span className="text-gray-500 text-xs flex-shrink-0">📦</span>
              ) : (
                <span className="text-gray-500 text-xs flex-shrink-0">🏷️</span>
              )}

              {/* Label + context */}
              <div className="flex-1 min-w-0">
                <span className={`block truncate ${i === cursor ? 'text-white' : 'text-gray-300'}`}>
                  {highlight(s.label, value.trim())}
                </span>
                {s.context && (
                  <span className="block text-[10px] text-gray-500 truncate mt-0.5">
                    {s.context}
                  </span>
                )}
              </div>

              {/* Right hint — only for brand to signal "continue typing" */}
              {s.type === 'brand' && (
                <svg
                  className="flex-shrink-0 text-gray-600"
                  width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          ))}

          {/* Footer hint */}
          <div className="px-4 py-1.5 border-t border-gray-700/60
                          flex items-center gap-1.5 text-[10px] text-gray-600">
            <kbd className="bg-gray-700/60 rounded px-1 py-0.5 font-mono">↑↓</kbd>
            <span>naviguer</span>
            <kbd className="bg-gray-700/60 rounded px-1 py-0.5 font-mono ml-1">↵</kbd>
            <span>sélectionner</span>
            <kbd className="bg-gray-700/60 rounded px-1 py-0.5 font-mono ml-1">Esc</kbd>
            <span>fermer</span>
          </div>
        </div>
      )}
    </div>
  );
};
