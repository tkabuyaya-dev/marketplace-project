/**
 * NUNULIA — Retour haptique léger (Android Chrome).
 * navigator.vibrate est ignoré silencieusement sur iOS/desktop → aucun risque.
 * À réserver aux actions positives (like, ajout) — jamais en rafale.
 */
export function tapHaptic(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* noop */
  }
}
