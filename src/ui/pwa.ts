/**
 * Service worker registration.
 *
 * The worker itself is generated at build time (`scripts/build-sw.mjs`) because
 * it has to name the hashed asset files, which nothing in source can know. All
 * that is left here is deciding *when* to ask for it:
 *
 * - **Production only.** A worker caching the dev server's module graph turns
 *   every edit into a cache-busting exercise, and Vite already serves the app
 *   fine without one.
 * - **Relative to `BASE_URL`.** The game ships both to a domain root (Vercel)
 *   and to a subdirectory (itch.io serves each build under its own path), and a
 *   hard-coded `/sw.js` would 404 in the second case — taking the offline
 *   promise with it.
 * - **Never fatal.** Registration fails in private windows, on insecure origins,
 *   and wherever a host forbids workers. None of that stops the game being
 *   playable, so none of it is allowed to reach the player.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const url = `${import.meta.env.BASE_URL}sw.js`;
  // After load: registering during startup competes with the first paint and
  // the first frames of the game for the same connection.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Offline play is a bonus, not a feature the game is built on.
    });
  });
}
