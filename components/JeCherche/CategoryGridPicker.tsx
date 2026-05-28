/**
 * NUNULIA — Smart Category Grid Picker
 *
 * Le buyer choisit une catégorie en 1 tap :
 *  - Si on a deviné depuis le titre → une bande dorée "Suggéré" apparaît au-dessus
 *  - Sinon, le grid de 14 catégories en gros tiles
 *  - Et une tile spéciale "🤔 Je ne sais pas trop" qui délègue à l'IA backend
 *
 * Tout est tactile, animé, et accessible clavier.
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Category } from '../../types';
import { HELP_CATEGORY_SLUG } from '../../utils/categoryAutoSuggest';

interface CategoryGridPickerProps {
  value: string;
  onChange: (slug: string) => void;
  suggested: string | null;
  categories: Category[];
}

export const CategoryGridPicker: React.FC<CategoryGridPickerProps> = ({
  value,
  onChange,
  suggested,
  categories,
}) => {
  const { t } = useTranslation();

  // Suggestion uniquement pertinente si le buyer n'a pas encore choisi autre chose
  const showSuggestion =
    suggested && suggested !== value && categories.some(c => c.id === suggested);

  const suggestedCat = showSuggestion
    ? categories.find(c => c.id === suggested)
    : null;

  // Petit feedback haptique au tap (mobile)
  const handleSelect = (slug: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(15); } catch { /* iOS bloque silencieusement */ }
    }
    onChange(slug);
  };

  // Si une suggestion forte arrive et rien n'est encore sélectionné, on pré-sélectionne
  // doucement pour faire gagner du temps au buyer sans l'enfermer (il peut toujours
  // taper sur une autre tile pour override).
  useEffect(() => {
    if (showSuggestion && suggested && !value) {
      onChange(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  return (
    <div className="space-y-3">
      {/* ── Bande dorée "Suggéré pour vous" ────────────────────────────────── */}
      {suggestedCat && (
        <button
          type="button"
          onClick={() => handleSelect(suggestedCat.id)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-300 animate-suggest-in"
          style={{
            background:
              'linear-gradient(90deg, rgba(245,200,66,0.18) 0%, rgba(240,188,42,0.08) 100%)',
            borderColor:
              value === suggestedCat.id ? '#F5C842' : 'rgba(245,200,66,0.35)',
            boxShadow:
              value === suggestedCat.id ? '0 0 16px rgba(245,200,66,0.25)' : 'none',
          }}
        >
          <span className="text-2xl">{suggestedCat.icon}</span>
          <div className="flex-1 text-left">
            <div className="text-[10px] font-bold text-gold-400 uppercase tracking-wider flex items-center gap-1">
              <span className="animate-pulse-soft">✨</span>
              {t('jeCherche.form.categorySuggested')}
            </div>
            <div className="text-sm font-bold text-white">{suggestedCat.name}</div>
          </div>
          {value === suggestedCat.id && (
            <div className="w-6 h-6 rounded-full bg-gold-400 flex items-center justify-center">
              <span className="text-gray-900 text-xs font-black">✓</span>
            </div>
          )}
        </button>
      )}

      {/* ── Grid des 14 catégories ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {categories.map(cat => {
          const selected = value === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelect(cat.id)}
              aria-label={cat.name}
              aria-pressed={selected}
              className={`relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all duration-200 ${
                selected
                  ? 'border-gold-400 bg-gold-400/10 scale-[1.04] shadow-[0_0_12px_rgba(245,200,66,0.25)]'
                  : 'border-gray-700/60 bg-gray-800/60 hover:border-gray-600 hover:bg-gray-800 active:scale-95'
              }`}
            >
              <span className={`text-2xl ${selected ? '' : 'opacity-90'}`}>
                {cat.icon}
              </span>
              <span
                className={`text-[9.5px] font-semibold leading-tight text-center line-clamp-2 ${
                  selected ? 'text-gold-300' : 'text-gray-400'
                }`}
              >
                {/* Coupe le nom long après le 1er mot principal pour rester sur 2 lignes max */}
                {cat.name.replace(/ & /, '\n').split('\n')[0]}
              </span>
              {selected && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-400 flex items-center justify-center border border-gray-900">
                  <span className="text-[8px] text-gray-900 font-black">✓</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tile spéciale "Je ne sais pas trop" ────────────────────────────── */}
      <button
        type="button"
        onClick={() => handleSelect(HELP_CATEGORY_SLUG)}
        aria-label={t('jeCherche.form.categoryHelpMe')}
        aria-pressed={value === HELP_CATEGORY_SLUG}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 ${
          value === HELP_CATEGORY_SLUG
            ? 'scale-[1.02] shadow-[0_0_16px_rgba(139,92,246,0.35)]'
            : 'hover:scale-[1.01] active:scale-[0.99]'
        }`}
        style={{
          background:
            value === HELP_CATEGORY_SLUG
              ? 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.18) 100%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.06) 100%)',
          borderColor:
            value === HELP_CATEGORY_SLUG ? '#A78BFA' : 'rgba(167,139,250,0.30)',
        }}
      >
        <span className="text-2xl">🤔</span>
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-white">
            {t('jeCherche.form.categoryHelpMe')}
          </div>
          <div className="text-[11px] text-violet-300/90 mt-0.5">
            {t('jeCherche.form.categoryHelpMeHint')}
          </div>
        </div>
        {value === HELP_CATEGORY_SLUG && (
          <div className="w-6 h-6 rounded-full bg-violet-400 flex items-center justify-center">
            <span className="text-gray-900 text-xs font-black">✓</span>
          </div>
        )}
      </button>
    </div>
  );
};
