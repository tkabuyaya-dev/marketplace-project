import React from 'react';

interface LegalSectionProps {
  id?: string;
  title: string;
  children: React.ReactNode;
}

export const LegalSection: React.FC<LegalSectionProps> = ({ id, title, children }) => (
  <section id={id} className="mb-8">
    <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-gray-700/50">{title}</h2>
    <div className="text-gray-300 text-sm leading-relaxed space-y-3">
      {children}
    </div>
  </section>
);
