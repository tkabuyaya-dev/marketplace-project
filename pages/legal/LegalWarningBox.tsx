import React from 'react';

interface LegalWarningBoxProps {
  children: React.ReactNode;
}

export const LegalWarningBox: React.FC<LegalWarningBoxProps> = ({ children }) => (
  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 my-4">
    <div className="flex gap-3">
      <span className="text-amber-400 text-lg shrink-0">⚠️</span>
      <p className="text-amber-200 text-sm leading-relaxed font-medium">{children}</p>
    </div>
  </div>
);
