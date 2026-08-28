import { describe, expect, it } from 'vitest';
import {
  CONFETTI_DURATION_MS,
  DRIFT_DURATION_MS,
  EffectPool,
  FLOAT_DURATION_MS,
  LEAF_FALL_DURATION_MS,
  RIPPLE_DURATION_MS,
} from './effects';

describe('EffectPool', () => {
  it('tracks the effects it spawns', () => {
    const pool = new EffectPool();
    pool.spawnHit(10, 20, '+1', false, 0);
    pool.spawnHit(30, 40, '+9', true, 0);

    expect(pool.activeFloats).toBe(2);
    expect(pool.activeRipples).toBe(2);
  });

  it('retires floating numbers after 600ms and ripples after their own life', () => {
    const pool = new EffectPool();
    pool.spawnHit(0, 0, '+1', false, 1000);

    pool.prune(1000 + RIPPLE_DURATION_MS - 1);
    expect(pool.activeRipples).toBe(1);

    pool.prune(1000 + RIPPLE_DURATION_MS);
    expect(pool.activeRipples).toBe(0);
    expect(pool.activeFloats).toBe(1); // the number outlives the ripple

    pool.prune(1000 + FLOAT_DURATION_MS - 1);
    expect(pool.activeFloats).toBe(1);

    pool.prune(1000 + FLOAT_DURATION_MS);
    expect(pool.activeFloats).toBe(0);
  });

  it('never exceeds its capacity, however hard the player taps', () => {
    const pool = new EffectPool(4, 2);
    for (let i = 0; i < 200; i += 1) {
      pool.spawnHit(i, i, `+${i}`, false, i);
    }
    expect(pool.activeFloats).toBe(4);
    expect(pool.activeRipples).toBe(2);
  });

  it('recycles the oldest slot when saturated, keeping the newest effects', () => {
    const pool = new EffectPool(2, 2);
    pool.spawnFloatingNumber(0, 0, 'oldest', false, 100);
    pool.spawnFloatingNumber(0, 0, 'middle', false, 200);
    pool.spawnFloatingNumber(0, 0, 'newest', false, 300);

    // 'oldest' was recycled, so pruning at its expiry leaves the two newer ones.
    pool.prune(100 + FLOAT_DURATION_MS);
    expect(pool.activeFloats).toBe(2);
  });

  it('reuses freed slots rather than growing', () => {
    const pool = new EffectPool(2, 2);
    pool.spawnFloatingNumber(0, 0, '+1', false, 0);
    pool.spawnFloatingNumber(0, 0, '+2', false, 0);
    pool.prune(FLOAT_DURATION_MS);
    expect(pool.activeFloats).toBe(0);

    pool.spawnFloatingNumber(0, 0, '+3', false, FLOAT_DURATION_MS);
    expect(pool.activeFloats).toBe(1);
  });

  it('clears everything on demand', () => {
    const pool = new EffectPool();
    pool.spawnHit(0, 0, '+1', false, 0);
    pool.clear();
    expect(pool.activeFloats).toBe(0);
    expect(pool.activeRipples).toBe(0);
  });
});

describe('confetti', () => {
  it('throws a burst and retires it after its duration', () => {
    const pool = new EffectPool();
    pool.spawnConfetti(50, 50, 0, 20);
    expect(pool.activeConfetti).toBe(20);

    pool.prune(CONFETTI_DURATION_MS - 1);
    expect(pool.activeConfetti).toBe(20);
    pool.prune(CONFETTI_DURATION_MS);
    expect(pool.activeConfetti).toBe(0);
  });

  it('never outgrows its pool', () => {
    const pool = new EffectPool(4, 4, 4, 6);
    pool.spawnConfetti(0, 0, 0, 40);
    expect(pool.activeConfetti).toBe(6);
  });

  it('outlives a prune burst, because a discovery should be the last thing left', () => {
    expect(CONFETTI_DURATION_MS).toBeGreaterThan(LEAF_FALL_DURATION_MS);
  });
});

describe('wind-drifted leaves', () => {
  it('spawns and retires on its own schedule', () => {
    const pool = new EffectPool();
    pool.spawnDriftLeaf(10, 10, 20, 1000);
    expect(pool.activeDrift).toBe(1);

    pool.prune(1000 + DRIFT_DURATION_MS - 1);
    expect(pool.activeDrift).toBe(1);

    pool.prune(1000 + DRIFT_DURATION_MS);
    expect(pool.activeDrift).toBe(0);
  });

  it('stays on screen far longer than anything a click makes', () => {
    // It is the idle animation: a leaf that is gone before it is noticed has
    // done nothing for a tree nobody is currently clicking.
    expect(DRIFT_DURATION_MS).toBeGreaterThan(LEAF_FALL_DURATION_MS);
    expect(DRIFT_DURATION_MS).toBeGreaterThan(FLOAT_DURATION_MS);
  });

  it('is capped low: a breeze, not a blizzard', () => {
    const pool = new EffectPool(8, 8, 8, 8, 3);
    for (let i = 0; i < 50; i += 1) pool.spawnDriftLeaf(i, i, 10, i);
    expect(pool.activeDrift).toBe(3);
  });
});

describe('reduced motion', () => {
  it('refuses every decorative particle', () => {
    const pool = new EffectPool();
    pool.setMotion(false);

    pool.spawnDriftLeaf(0, 0, 10, 0);
    pool.spawnFallingLeaf(0, 0, 0);
    pool.spawnPruneBurst([{ x: 1, y: 1 }], 0);
    pool.spawnConfetti(0, 0, 0);

    expect(pool.activeDrift).toBe(0);
    expect(pool.activeLeaves).toBe(0);
    expect(pool.activeConfetti).toBe(0);
  });

  it('keeps the feedback that a tap actually happened', () => {
    const pool = new EffectPool();
    pool.setMotion(false);
    pool.spawnHit(0, 0, '+1', false, 0);

    expect(pool.activeFloats).toBe(1);
    expect(pool.activeRipples).toBe(1);
  });

  it('clears what is already in the air, rather than letting it peter out', () => {
    const pool = new EffectPool();
    pool.spawnConfetti(0, 0, 0);
    pool.spawnDriftLeaf(0, 0, 10, 0);
    expect(pool.activeConfetti).toBeGreaterThan(0);

    pool.setMotion(false);

    expect(pool.activeConfetti).toBe(0);
    expect(pool.activeDrift).toBe(0);
  });

  it('starts allowing motion again the moment it is switched back on', () => {
    const pool = new EffectPool();
    pool.setMotion(false);
    pool.setMotion(true);
    pool.spawnDriftLeaf(0, 0, 10, 0);

    expect(pool.motionEnabled).toBe(true);
    expect(pool.activeDrift).toBe(1);
  });
});
