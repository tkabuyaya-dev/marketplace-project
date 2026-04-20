/**
 * NUNULIA — useRotatingPlaceholder
 *
 * Cycles through an array of strings with a smooth fade/slide transition.
 * Used for animated search bar placeholders on home/navbar.
 *
 * Design constraints:
 * - Zero dependencies beyond React hooks
 * - One setInterval + one pending setTimeout per cycle → negligible CPU cost
 * - No DOM writes between ticks — only React state (2 booleans + 1 index)
 * - Works perfectly offline (no API calls)
 * - Compatible with Lighthouse PWA audits
 *
 * Usage:
 *   const { term, visible } = useRotatingPlaceholder(terms, 2800);
 *   <span className={`transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1.5'}`}>
 *     {term}
 *   </span>
 */
import { useState, useEffect, useRef } from 'react';

/**
 * @param terms       Array of strings to cycle through. Must be stable across renders
 *                    (define outside the component or with useMemo).
 * @param intervalMs  Total time each term is visible (ms). Default: 2800.
 * @param transitionMs Duration of the fade-out/fade-in animation (ms). Default: 320.
 */
export function useRotatingPlaceholder(
  terms: string[],
  intervalMs = 2800,
  transitionMs = 320,
): { term: string; visible: boolean } {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  // Keep a ref to pending swap timer so we can clear it on unmount
  const swapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to current length to avoid re-creating the interval
  const lengthRef = useRef(terms.length);
  lengthRef.current = terms.length;

  useEffect(() => {
    // Nothing to rotate if 0 or 1 terms
    if (terms.length <= 1) return;

    const intervalId = setInterval(() => {
      // 1. Fade out (CSS handles the visual)
      setVisible(false);

      // 2. After the CSS transition completes, advance the index and fade back in
      swapRef.current = setTimeout(() => {
        setIndex(prev => (prev + 1) % lengthRef.current);
        setVisible(true);
      }, transitionMs);
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      if (swapRef.current) clearTimeout(swapRef.current);
    };
    // Only depends on intervalMs/transitionMs — terms.length is read via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, transitionMs]);

  // Guard: index may be out of range if terms array shrinks
  const safeTerm = terms[index % Math.max(terms.length, 1)] ?? '';

  return { term: safeTerm, visible };
}
