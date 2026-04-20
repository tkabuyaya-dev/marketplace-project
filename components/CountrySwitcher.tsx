import React, { useState, useRef, useEffect } from 'react';
import { TC } from '../constants';
import { useAppContext } from '../contexts/AppContext';
import { useActiveCountries } from '../hooks/useActiveCountries';
import { trackCountrySwitch } from '../services/analytics';

export const CountrySwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { activeCountry, setActiveCountry } = useAppContext();
  const { countries } = useActiveCountries();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Moins d'un pays actif = rien à switcher
  if (countries.length <= 1) return null;

  const isTous = !activeCountry;
  const current = isTous ? null : countries.find(c => c.id === activeCountry) || null;

  const handleSwitch = (countryId: string) => {
    if (countryId !== activeCountry) {
      trackCountrySwitch(activeCountry, countryId);
      setActiveCountry(countryId);
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 ${compact ? 'px-1.5 py-1 rounded-lg' : 'px-2.5 py-1.5 min-h-[44px] rounded-lg'} border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors ${open ? TC.border400 : ''}`}
        title={current?.name || 'Tous les pays'}
      >
        <span className="text-base leading-none">{isTous ? '🌍' : current?.flag}</span>
        {!compact && <span className="text-gray-300 text-xs">{isTous ? 'Tous' : current?.id.toUpperCase()}</span>}
        <span className="text-gray-500 text-[10px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50 animate-fade-in">
          {/* Option "Tous les pays" */}
          <button
            onClick={() => handleSwitch('')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-b border-gray-700/50 ${
              isTous
                ? `${TC.bg950} ${TC.text400} font-medium`
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span className="text-base">🌍</span>
            <span>Tous les pays</span>
          </button>

          {countries.map((country) => (
            <button
              key={country.id}
              onClick={() => handleSwitch(country.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                country.id === activeCountry
                  ? `${TC.bg950} ${TC.text400} font-medium`
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="text-base">{country.flag}</span>
              <span>{country.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
