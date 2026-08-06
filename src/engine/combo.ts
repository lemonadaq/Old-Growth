/**
 * The click combo meter.
 *
 * Tapping in a steady rhythm builds stacks; each stack adds a flat percentage
 * to click power, up to +100% at {@link COMBO_FULL_STACKS} stacks. Stop tapping
 * and the meter drains away.
 *
 * ## Timing model
 *
 * The meter is stored as `{ stacks, lastClickAt }` and its *effective* value is
 * derived from those two numbers at read time — there is no per-tick decay
 * bookkeeping, so the meter is exact regardless of frame rate and is trivially
 * testable.
 *
 * ```
 * idle ms:   0 ────────── 1500 ────────── 3000
 *            │  held      │   draining    │ empty
 * factor:    1.0          1.0 ─────────── 0.0
 * ```
 *
 * Clicks landing inside the 1500 ms window therefore lose nothing and the meter
 * climbs by one stack each time. Past the window the meter drains linearly and
 * is completely gone 3000 ms after the last click, so a lapsed player restarts
 * from 1. A click during the drain adds a stack to whatever is left rather than
 * hitting a cliff.
 */

/** Clicks within this many ms of the previous one lose no combo. */
export const COMBO_WINDOW_MS = 1500;

/** The meter is fully empty this many ms after the last click. */
export const COMBO_DECAY_MS = 3000;

/** Stack count at which the combo bonus reaches {@link COMBO_BONUS_AT_FULL}. */
export const COMBO_FULL_STACKS = 50;

/** Bonus click power granted at {@link COMBO_FULL_STACKS} stacks (1 = +100%). */
export const COMBO_BONUS_AT_FULL = 1;

/** Bonus click power per stack. Stacks above the base cap keep paying out. */
export const COMBO_BONUS_PER_STACK = COMBO_BONUS_AT_FULL / COMBO_FULL_STACKS;

/** Mutable combo state owned by the simulation. */
export interface ComboState {
  /** Stacks banked at `lastClickAt`, before any decay. */
  stacks: number;
  /** Timestamp (ms) of the most recent click. */
  lastClickAt: number;
}

/** A fresh, empty combo meter. */
export function createComboState(): ComboState {
  // -Infinity reads as "infinitely idle", so the meter starts fully decayed.
  return { stacks: 0, lastClickAt: Number.NEGATIVE_INFINITY };
}

/**
 * Fraction of the banked stacks still standing after `idleMs` without a click:
 * `1` inside the window, falling linearly to `0` at {@link COMBO_DECAY_MS}.
 */
export function comboDecayFactor(idleMs: number): number {
  if (idleMs <= COMBO_WINDOW_MS) return 1;
  if (idleMs >= COMBO_DECAY_MS) return 0;
  return 1 - (idleMs - COMBO_WINDOW_MS) / (COMBO_DECAY_MS - COMBO_WINDOW_MS);
}

/** The meter's effective (decayed) stack count at time `now`. */
export function comboStacksAt(state: ComboState, now: number): number {
  if (state.stacks <= 0) return 0;
  return state.stacks * comboDecayFactor(now - state.lastClickAt);
}

/**
 * Click power multiplier for a stack count: `1 + stacks × 2%`, with `stacks`
 * limited by the player's current cap.
 */
export function comboMultiplier(stacks: number, cap: number): number {
  return 1 + Math.min(Math.max(stacks, 0), cap) * COMBO_BONUS_PER_STACK;
}

/**
 * Register a click at `now`: decay the meter to the present, add one stack, and
 * clamp to `cap`. Mutates `state` and returns the new stack count.
 */
export function registerComboClick(state: ComboState, now: number, cap: number): number {
  const stacks = Math.min(cap, comboStacksAt(state, now) + 1);
  state.stacks = stacks;
  state.lastClickAt = now;
  return stacks;
}

/** How full the meter is at `now`, in `[0, 1]` — for drawing the meter arc. */
export function comboFill(state: ComboState, now: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(1, comboStacksAt(state, now) / cap);
}
