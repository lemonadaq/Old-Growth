import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { approach, approachDecimal, TWEEN_HALF_LIFE_MS } from './tween';

describe('approach', () => {
  it('closes half the gap in one half-life, whatever the numbers', () => {
    expect(approach(0, 100, TWEEN_HALF_LIFE_MS)).toBeCloseTo(50);
    expect(approach(80, 100, TWEEN_HALF_LIFE_MS)).toBeCloseTo(90);
  });

  it('is frame-rate independent: two half-steps equal one whole step', () => {
    const once = approach(0, 100, TWEEN_HALF_LIFE_MS);
    const twice = approach(approach(0, 100, TWEEN_HALF_LIFE_MS / 2), 100, TWEEN_HALF_LIFE_MS / 2);
    expect(twice).toBeCloseTo(once, 6);
  });

  it('moves down as readily as up', () => {
    expect(approach(100, 0, TWEEN_HALF_LIFE_MS)).toBeCloseTo(50);
  });

  it('stays put when no time has passed', () => {
    expect(approach(3, 99, 0)).toBe(3);
  });

  it('never overshoots, however long the step', () => {
    const huge = approach(0, 100, 10_000);
    expect(huge).toBeLessThanOrEqual(100);
    // A tab that was asleep for ten seconds is accounted for as one long-ish
    // frame rather than as ten seconds of easing: the step is capped, so the
    // value gets most of the way there and closes the rest on the next frame.
    expect(huge).toBeGreaterThan(80);
    expect(huge).toBe(approach(0, 100, 60_000));
  });
});

describe('approachDecimal', () => {
  it('eases toward the target', () => {
    const next = approachDecimal(new Decimal(100), new Decimal(140), TWEEN_HALF_LIFE_MS);
    expect(next.toNumber()).toBeCloseTo(120);
  });

  it('lands exactly rather than crawling forever', () => {
    let value = new Decimal(100);
    for (let i = 0; i < 200; i += 1) value = approachDecimal(value, new Decimal(140), 16);
    expect(value.eq(140)).toBe(true);
  });

  it('is a no-op once it has arrived', () => {
    const target = new Decimal(42);
    expect(approachDecimal(target, target, 16).eq(target)).toBe(true);
  });

  it('snaps rather than animating a jump too big to be production', () => {
    // A prestige zeroes everything; crawling to zero would read as a bug.
    expect(approachDecimal(new Decimal(1e9), new Decimal(0), 16).eq(0)).toBe(true);
    // As would a save being loaded over an empty HUD.
    expect(approachDecimal(new Decimal(0), new Decimal(1e9), 16).eq(1e9)).toBe(true);
  });

  it('still eases a big-but-plausible gain', () => {
    const next = approachDecimal(new Decimal(1000), new Decimal(2500), TWEEN_HALF_LIFE_MS);
    expect(next.toNumber()).toBeCloseTo(1750);
  });

  it('eases a purchase rather than snapping the moment sap is spent', () => {
    const next = approachDecimal(new Decimal(1000), new Decimal(880), TWEEN_HALF_LIFE_MS);
    expect(next.toNumber()).toBeCloseTo(940);
  });

  it('works past the range of a float, where the game actually ends up', () => {
    const from = Decimal.pow(10, 400);
    const to = from.times(1.5);
    const next = approachDecimal(from, to, TWEEN_HALF_LIFE_MS);

    expect(next.gt(from)).toBe(true);
    expect(next.lt(to)).toBe(true);
    expect(next.toNumber()).toBe(Infinity); // i.e. it never went through a float
  });
});
