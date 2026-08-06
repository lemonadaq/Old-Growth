import { describe, expect, it } from 'vitest';
import { EffectPool, FLOAT_DURATION_MS, RIPPLE_DURATION_MS } from './effects';

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
