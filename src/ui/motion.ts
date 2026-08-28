/**
 * `prefers-reduced-motion`, read once and watched for changes.
 *
 * The setting is an accessibility request, not a performance one: for some
 * players a canopy that never stops swaying is nausea, and drifting particles
 * over a camera that slides are worse. What the game turns off when it is set is
 * decided per effect, and the rule is the same everywhere — **motion that only
 * decorates goes; motion that carries information stays**.
 *
 *   - Off: the canopy sway, ambient wind-drift leaves, prune debris, discovery
 *     confetti, hill parallax, HUD number tweening, CSS transitions.
 *   - Kept: the floating "+N" and its ripple (they *are* the feedback for a
 *     tap), the growth scale-in shortened to nothing rather than removed (a part
 *     still has to appear), and every sound, which is not motion at all.
 *
 * A media query is the whole implementation. STEP 18 owns the accessibility
 * panel and may add an in-game override on top of this; the shape here — one
 * boolean, pushed at whoever needs it — is what that override would set.
 */

/** The query, named once so the CSS and the TypeScript cannot drift apart. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The parts of `MediaQueryList` this module uses.
 *
 * Structural rather than the DOM type so a test can hand in a fake, and so the
 * two generations of listener API can both be optional: Safari before 14 has
 * only `addListener`, and it is still on enough phones to matter for a game that
 * is meant to be playable on one.
 */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  addListener?(listener: (event: { matches: boolean }) => void): void;
  removeListener?(listener: (event: { matches: boolean }) => void): void;
}

/** The live query, or `null` where there is no `matchMedia` (tests, SSR). */
export function reducedMotionQuery(): MediaQueryLike | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    return null;
  }
}

/** Whether reduced motion is asked for right now. `false` where unknowable. */
export function prefersReducedMotion(query: MediaQueryLike | null = reducedMotionQuery()): boolean {
  return query?.matches ?? false;
}

/**
 * Report the setting now and on every change. Returns a detach function.
 *
 * The callback fires immediately with the current value so callers have exactly
 * one code path for "apply the setting" rather than one for startup and another
 * for changes.
 */
export function watchReducedMotion(
  onChange: (reduced: boolean) => void,
  query: MediaQueryLike | null = reducedMotionQuery(),
): () => void {
  onChange(prefersReducedMotion(query));
  if (!query) return () => undefined;

  const listener = (event: { matches: boolean }) => onChange(event.matches);

  if (query.addEventListener) {
    query.addEventListener('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }
  if (query.addListener) {
    query.addListener(listener);
    return () => query.removeListener?.(listener);
  }
  return () => undefined;
}
