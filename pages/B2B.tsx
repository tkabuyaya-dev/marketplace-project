/**
 * Page /reseau — Réseau B2B.
 *
 * Très fine : se contente d'injecter <B2BTab /> et de mettre à jour les
 * meta tags (utile pour le partage social / agents IA). La logique vit
 * dans <B2BTab>.
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { B2BTab } from '../components/B2B/B2BTab';
import { updateMetaTags, resetMetaTags } from '../utils/meta';

const B2BPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    updateMetaTags({
      title: t('b2b.title'),
      description: t('b2b.subtitle'),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    return () => { resetMetaTags(); };
  }, [t]);

  return <B2BTab />;
};

export default B2BPage;
