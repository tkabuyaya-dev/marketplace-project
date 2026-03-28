import React from 'react';

interface LegalInfoBoxProps {
  children: React.ReactNode;
}

export const LegalInfoBox: React.FC<LegalInfoBoxProps> = ({ children }) => (
  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 my-4">
    <div className="flex gap-3">
      <span className="text-blue-400 text-lg shrink-0">ℹ️</span>
      <p className="text-blue-200 text-sm leading-relaxed">{children}</p>
    </div>
  </div>
);
