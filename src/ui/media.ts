import type { MediaQueryLike } from './motion';

/**
 * The phone breakpoint, in JavaScript.
 *
 * Two things change shape below it that CSS cannot do on its own: the dock
 * becomes a row of tabs (CSS handles that) and the radial grow menu becomes a
 * bottom sheet (CSS cannot — the dials are drawn on a canvas, and swapping them
 * for a DOM sheet is a decision the app has to make). So the number lives here
 * as well as in the stylesheets, and the two must be changed together.
 *
 * 620px rather than a device width: it is where the dock's seven labels stop
 * fitting in a row, which is a fact about this UI rather than about any phone.
 */
export const PHONE_QUERY = '(max-width: 620px)';

/** The live query, or `null` where there is no `matchMedia` (tests, SSR). */
export function mediaQuery(query: string): MediaQueryLike | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

/**
 * Report whether a query matches now, and on every change. Returns a detach
 * function.
 *
 * Like {@link watchReducedMotion}, the callback fires immediately so callers
 * have one code path rather than one for startup and another for changes, and
 * both generations of the listener API are handled because Safari before 14 has
 * only `addListener` and is still on phones this game is meant to run on.
 */
export function watchMedia(
  onChange: (matches: boolean) => void,
  query: MediaQueryLike | null,
): () => void {
  onChange(query?.matches ?? false);
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
