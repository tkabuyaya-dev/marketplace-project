import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LegalHeaderProps {
  title: string;
  subtitle: string;
  badge: string;
}

export const LegalHeader: React.FC<LegalHeaderProps> = ({ title, subtitle, badge }) => {
  const navigate = useNavigate();

  return (
    <div className="mb-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour
      </button>
      <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">{title}</h1>
      <p className="text-gray-400 text-sm mb-3">{subtitle}</p>
      <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
        {badge}
      </span>
    </div>
  );
};
