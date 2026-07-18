/**
 * NUNULIA — Pull-to-refresh (P9)
 *
 * Tirer vers le bas en haut de page → rafraîchissement, comme une app native.
 *
 * Contraintes respectées :
 *  - Listeners touch PASSIFS (jamais de preventDefault) : le scroll normal
 *    n'est jamais bloqué ; le body a déjà overscroll-behavior-y: none donc
 *    aucun conflit avec un bounce natif.
 *  - Zéro re-render du parent pendant le geste : la position de l'indicateur
 *    est appliquée imperativement via ref (60fps sur entrée de gamme).
 *  - Le composant ne touche PAS au pipeline de données : il appelle onRefresh
 *    fourni par la page, c'est elle qui rejoue son propre flux de chargement.
 */

import React, { useEffect, useRef, useState } from 'react';
import { tapHaptic } from '../utils/haptics';

const THRESHOLD = 70;   // px de tirage pour déclencher
const MAX_PULL = 110;   // limite visuelle
const RESISTANCE = 0.45;

export const PullToRefresh: React.FC<{ onRefresh: () => Promise<void> | void }> = ({ onRefresh }) => {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const st = useRef({ startY: 0, pulling: false, pull: 0, crossed: false, refreshing: false });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const setVisual = (pull: number, animate = false) => {
      const el = indicatorRef.current;
      if (!el) return;
      el.style.transition = animate
        ? 'transform 0.28s cubic-bezier(0.2,0.8,0.2,1), opacity 0.22s ease'
        : 'none';
      el.style.transform = `translateX(-50%) translateY(${pull - 52}px)`;
      el.style.opacity = pull > 6 ? '1' : '0';
      // L'anneau tourne avec le doigt tant qu'on n'est pas en refresh
      const sp = spinnerRef.current;
      if (sp && !st.current.refreshing) sp.style.transform = `rotate(${pull * 2.6}deg)`;
    };

    const onStart = (e: TouchEvent) => {
      if (st.current.refreshing || window.scrollY > 1) return;
      st.current.pulling = true;
      st.current.crossed = false;
      st.current.pull = 0;
      st.current.startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!st.current.pulling || st.current.refreshing) return;
      if (window.scrollY > 1) { st.current.pull = 0; setVisual(0); return; }
      const dy = e.touches[0].clientY - st.current.startY;
      if (dy <= 0) { st.current.pull = 0; setVisual(0); return; }
      const eased = Math.min(MAX_PULL, dy * RESISTANCE);
      st.current.pull = eased;
      if (eased >= THRESHOLD && !st.current.crossed) { st.current.crossed = true; tapHaptic(8); }
      else if (eased < THRESHOLD) st.current.crossed = false;
      setVisual(eased);
    };

    const onEnd = async () => {
      if (!st.current.pulling) return;
      st.current.pulling = false;
      if (st.current.pull >= THRESHOLD && !st.current.refreshing) {
        st.current.refreshing = true;
        setRefreshing(true);
        if (spinnerRef.current) spinnerRef.current.style.transform = '';
        setVisual(THRESHOLD, true);
        try {
          await onRefresh();
        } finally {
          st.current.refreshing = false;
          setRefreshing(false);
          setVisual(0, true);
        }
      } else {
        setVisual(0, true);
      }
      st.current.pull = 0;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      className="fixed left-1/2 z-50 w-10 h-10 rounded-full bg-white flex items-center justify-center pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        transform: 'translateX(-50%) translateY(-52px)',
        opacity: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <div
        ref={spinnerRef}
        className={`w-5 h-5 border-[2.5px] border-[#F5C842]/30 border-t-[#F5C842] rounded-full ${refreshing ? 'animate-spin' : ''}`}
      />
    </div>
  );
};
