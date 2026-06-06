import React from 'react';

interface LegalSectionProps {
  id?: string;
  title: string;
  children: React.ReactNode;
}

export const LegalSection: React.FC<LegalSectionProps> = ({ id, title, children }) => (
  <section id={id} className="mb-8">
    <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-black/[0.08]">{title}</h2>
    <div className="text-ink2 text-sm leading-relaxed space-y-3">
      {children}
    </div>
  </section>
);
