/**
 * NUNULIA — View Transitions (P1)
 *
 * Le morphing « élément partagé » exige qu'UN SEUL élément par page porte
 * le view-transition-name. On le pose donc imperativement sur l'image
 * cliquée juste avant de naviguer (et on nettoie tout marquage précédent).
 *
 * Navigateurs sans support : no-op complet.
 */

export const HERO_VT_NAME = 'product-hero';

export const supportsViewTransitions = (): boolean =>
  typeof document !== 'undefined' && 'startViewTransition' in document;

/** Marque l'élément comme héros du morphing juste avant la navigation. */
export function markHeroElement(el: HTMLElement | null): void {
  if (!el || !supportsViewTransitions()) return;
  // Un seul héros par page — retire les marquages précédents (cartes déjà
  // cliquées, slide de galerie sur la page produit courante, …)
  document.querySelectorAll<HTMLElement>('[data-vt-hero]').forEach(n => {
    n.style.viewTransitionName = '';
    delete n.dataset.vtHero;
  });
  el.style.viewTransitionName = HERO_VT_NAME;
  el.dataset.vtHero = '1';
}
