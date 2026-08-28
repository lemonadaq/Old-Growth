import Decimal from 'break_infinity.js';
import { useRef } from 'react';

/**
 * Tweened HUD numbers: totals that *slide* toward their target instead of
 * jumping to it.
 *
 * The reason is legibility rather than prettiness. A counter climbing by 40/s
 * updates sixty times a second, and a digit that changes every frame is a digit
 * nobody can read; easing toward the value lets the eye track a number that is
 * moving. It is also the cheapest way to make idle production *feel* like
 * production — a number that grows visibly is the entire genre.
 *
 * The motion is an exponential approach, expressed as a half-life so it is
 * frame-rate independent: whatever the frame time, the gap closes by half every
 * {@link TWEEN_HALF_LIFE_MS}. A fixed per-frame fraction would run at different
 * speeds on a 60 Hz and a 144 Hz display.
 *
 * Two things deliberately skip the tween:
 *
 *   - **Big jumps.** A prestige zeroes every resource; crawling down to zero
 *     over a second would read as a bug rather than as a reset.
 *   - **Reduced motion.** The value is the information; the sliding is not.
 */

/** How long the gap to the target takes to halve, in milliseconds. */
export const TWEEN_HALF_LIFE_MS = 90;

/**
 * Fraction of the larger of the two values past which the tween gives up and
 * lands exactly.
 *
 * A step that moves *nearly the whole quantity* is not production: it is a
 * prestige zeroing the run, a save being imported, or an offline lump sum being
 * paid out. Those are all events the player already knows about, and easing
 * through them reads as the HUD lagging rather than as a number growing.
 */
const SNAP_FRACTION = 0.9;

/** Fraction of the target within which the tween is finished and lands exactly. */
const SETTLE_RATIO = 1e-4;

/** How much wall-clock time one step may account for, in ms. */
const MAX_STEP_MS = 250;

/**
 * One step of the approach, in plain numbers.
 *
 * Exported for the tests and for anything that wants the curve without the
 * `Decimal` wrapper around it.
 */
export function approach(
  current: number,
  target: number,
  elapsedMs: number,
  halfLifeMs: number = TWEEN_HALF_LIFE_MS,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (elapsedMs <= 0 || halfLifeMs <= 0) return current === target ? target : current;
  const factor = 1 - Math.pow(2, -Math.min(elapsedMs, MAX_STEP_MS) / halfLifeMs);
  return current + (target - current) * factor;
}

/**
 * One step of the approach for a `Decimal`.
 *
 * The whole thing is done in `Decimal` rather than by converting to a float,
 * because these are the game's resources: by the late game a total is past
 * `Number.MAX_VALUE` and the difference between two consecutive displayed values
 * is not representable as a float at all.
 */
export function approachDecimal(
  current: Decimal,
  target: Decimal,
  elapsedMs: number,
  halfLifeMs: number = TWEEN_HALF_LIFE_MS,
): Decimal {
  const gap = target.minus(current);
  if (gap.eq(0)) return target;

  // Settled, or a jump too big to be worth animating — land exactly.
  const magnitude = Decimal.max(target.abs(), current.abs());
  if (gap.abs().lte(magnitude.times(SETTLE_RATIO))) return target;
  if (gap.abs().gte(magnitude.times(SNAP_FRACTION))) return target;

  if (elapsedMs <= 0 || halfLifeMs <= 0) return current;
  const factor = 1 - Math.pow(2, -Math.min(elapsedMs, MAX_STEP_MS) / halfLifeMs);
  return current.add(gap.times(factor));
}

/**
 * A `Decimal` that follows `target`, one render at a time.
 *
 * Driven by the render itself rather than by a `requestAnimationFrame` of its
 * own: the engine pushes a fresh snapshot into the store every frame, so the HUD
 * already re-renders at frame rate, and a second clock would only be a second
 * thing to keep in sync. The elapsed time between renders is measured rather
 * than assumed, so a dropped frame moves the tween further rather than slowing
 * it down.
 *
 * Pass `enabled: false` — reduced motion — and it is exactly `target`.
 */
export function useTweenedDecimal(target: Decimal, enabled = true): Decimal {
  const value = useRef<Decimal>(target);
  const at = useRef<number>(0);

  if (!enabled) {
    value.current = target;
    return target;
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  // First render: start *at* the target rather than climbing from zero. A player
  // reloading a save should not watch their sap count animate in from nothing.
  const elapsed = at.current === 0 ? 0 : now - at.current;
  at.current = now;

  value.current = elapsed === 0 ? value.current : approachDecimal(value.current, target, elapsed);
  return value.current;
}
