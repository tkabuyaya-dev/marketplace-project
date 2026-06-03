/**
 * B2BHelpList — liste des vendeurs qui ont cliqué "Je peux aider".
 *
 * Visible UNIQUEMENT par l'auteur du post (la rule Firestore filtre les
 * lectures par get(post).authorId). Affichage en panel latéral/modal selon
 * la largeur d'écran. Bouton WhatsApp pour chaque helper.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeHelpsForPost } from '../../services/firebase/b2b';
import { buildWaUrl } from '../../config/whatsapp.config';
import { B2BReputationRings } from './B2BReputationRings';
import type { B2BHelp, B2BPost } from '../../types';

interface Props {
  post: B2BPost;
  isOpen: boolean;
  onClose: () => void;
}

export const B2BHelpList: React.FC<Props> = ({ post, isOpen, onClose }) => {
  const { t } = useTranslation();
  const [helps, setHelps] = useState<B2BHelp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const unsub = subscribeHelpsForPost(post.id, (list) => {
      setHelps(list);
      setLoading(false);
    });
    return () => unsub();
  }, [isOpen, post.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="b2b-helplist-title"
    >
      <div className="b2b-card w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 id="b2b-helplist-title" className="text-[17px] font-extrabold text-white">
            {t('b2b.helpList.title', { count: helps.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <p className="text-[12.5px] text-white/60 mb-4 whitespace-pre-wrap">
          “{post.originalText}”
        </p>

        {loading && (
          <p className="text-[13px] text-white/55 text-center py-6">{t('b2b.helpList.loading')}</p>
        )}

        {!loading && helps.length === 0 && (
          <p className="text-[13px] text-white/55 text-center py-6">{t('b2b.helpList.empty')}</p>
        )}

        {!loading && helps.length > 0 && (
          <ul className="space-y-2.5">
            {helps.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-white truncate inline-flex items-center gap-1.5">
                    {h.helperName}
                    <span className="text-white/55">
                      <B2BReputationRings score={0} size={13} ariaLabel="" />
                    </span>
                  </p>
                  <p className="text-[11.5px] text-white/55">
                    {h.helperCity ? `${h.helperCity} · ` : ''}{h.helperCountry}
                  </p>
                </div>
                <a
                  href={buildWaUrl(
                    t('b2b.helpList.waMessage', { name: post.authorName }),
                    { phone: h.helperWhatsApp },
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="b2b-wa-btn px-3 h-9 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                  aria-label={t('b2b.helpList.waAria', { name: h.helperName })}
                >
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
