import { describe, expect, it } from 'vitest';
import { prefersReducedMotion, watchReducedMotion, type MediaQueryLike } from './motion';

/** A modern `MediaQueryList`: `addEventListener`, and nothing else. */
function modernQuery(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query: MediaQueryLike & { fire(next: boolean): void; listeners: number } = {
    matches,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    fire(next: boolean) {
      for (const listener of listeners) listener({ matches: next });
    },
    get listeners() {
      return listeners.size;
    },
  };
  return query;
}

/** Safari before 14: the old `addListener` pair and no `addEventListener`. */
function legacyQuery(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    matches,
    addListener(listener: (event: { matches: boolean }) => void) {
      listeners.add(listener);
    },
    removeListener(listener: (event: { matches: boolean }) => void) {
      listeners.delete(listener);
    },
    fire(next: boolean) {
      for (const listener of listeners) listener({ matches: next });
    },
    get listeners() {
      return listeners.size;
    },
  };
}

describe('prefersReducedMotion', () => {
  it('reports what the query says', () => {
    expect(prefersReducedMotion(modernQuery(true))).toBe(true);
    expect(prefersReducedMotion(modernQuery(false))).toBe(false);
  });

  it('assumes motion is fine where the question cannot be asked', () => {
    // No `matchMedia` at all: a test runner, or a very old browser. Guessing
    // "reduced" would strip the game's animation from everyone it cannot ask.
    expect(prefersReducedMotion(null)).toBe(false);
  });
});

describe('watchReducedMotion', () => {
  it('reports the current value immediately, so callers have one code path', () => {
    const seen: boolean[] = [];
    watchReducedMotion((reduced) => seen.push(reduced), modernQuery(true));
    expect(seen).toEqual([true]);
  });

  it('reports changes as the player flips the system setting', () => {
    const query = modernQuery(false);
    const seen: boolean[] = [];
    watchReducedMotion((reduced) => seen.push(reduced), query);

    query.fire(true);
    query.fire(false);

    expect(seen).toEqual([false, true, false]);
  });

  it('detaches cleanly', () => {
    const query = modernQuery(false);
    const detach = watchReducedMotion(() => undefined, query);
    expect(query.listeners).toBe(1);
    detach();
    expect(query.listeners).toBe(0);
  });

  it('falls back to the pre-Safari-14 listener API', () => {
    const query = legacyQuery(false);
    const seen: boolean[] = [];
    const detach = watchReducedMotion((reduced) => seen.push(reduced), query);

    query.fire(true);
    expect(seen).toEqual([false, true]);

    detach();
    expect(query.listeners).toBe(0);
  });

  it('is a harmless no-op with no query to watch', () => {
    const seen: boolean[] = [];
    const detach = watchReducedMotion((reduced) => seen.push(reduced), null);
    expect(seen).toEqual([false]);
    expect(() => detach()).not.toThrow();
  });
});
