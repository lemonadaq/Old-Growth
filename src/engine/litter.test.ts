import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  LITTER_MAX_PILES,
  LITTER_MIN_AMOUNT,
  LITTER_PER_LEAF,
  LITTER_SPREAD,
} from '../content/balance';
import { LitterGround, litterAmount, litterPosition } from './litter';
import { createSeededRandom } from './rng';

/** Drop a pile of a known size at the trunk. */
function drop(ground: LitterGround, amount: number, now = 0) {
  return ground.spawn(new Decimal(amount), 0, now);
}

describe('litterAmount', () => {
  it('scales with the canopy that shed it', () => {
    expect(litterAmount(10).toNumber()).toBeCloseTo(10 * LITTER_PER_LEAF, 9);
    expect(litterAmount(50).toNumber()).toBeCloseTo(50 * LITTER_PER_LEAF, 9);
  });

  it('is floored, so a thin canopy still leaves something worth stooping for', () => {
    expect(litterAmount(1).toNumber()).toBe(LITTER_MIN_AMOUNT);
    expect(litterAmount(0).toNumber()).toBe(LITTER_MIN_AMOUNT);
    expect(litterAmount(-3).toNumber()).toBe(LITTER_MIN_AMOUNT);
  });
});

describe('litterPosition', () => {
  it('lands inside the band around the trunk, either side of it', () => {
    const random = createSeededRandom(5);
    let left = 0;
    let right = 0;

    for (let i = 0; i < 200; i += 1) {
      const x = litterPosition(random);
      expect(Math.abs(x)).toBeLessThanOrEqual(LITTER_SPREAD);
      if (x < 0) left += 1;
      else right += 1;
    }

    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });
});

describe('LitterGround', () => {
  it('starts bare', () => {
    const ground = new LitterGround();
    expect(ground.size).toBe(0);
    expect(ground.entries()).toEqual([]);
    expect(ground.total().toNumber()).toBe(0);
  });

  it('keeps piles oldest first, each with its own id', () => {
    const ground = new LitterGround();
    drop(ground, 3, 10);
    drop(ground, 5, 20);

    const ids = ground.entries().map((pile) => pile.id);
    expect(new Set(ids).size).toBe(2);
    expect(ground.entries().map((pile) => pile.spawnedAt)).toEqual([10, 20]);
  });

  it('stops at the cap rather than banking a backlog', () => {
    const ground = new LitterGround();
    for (let i = 0; i < LITTER_MAX_PILES; i += 1) expect(drop(ground, 1, i)).not.toBeNull();

    expect(ground.full).toBe(true);
    expect(drop(ground, 1, 99)).toBeNull();
    expect(ground.size).toBe(LITTER_MAX_PILES);
  });

  it('hands a pile over once and once only', () => {
    const ground = new LitterGround();
    const pile = drop(ground, 7);

    expect(ground.collect(pile?.id ?? '')?.amount.toNumber()).toBe(7);
    expect(ground.collect(pile?.id ?? '')).toBeNull();
    expect(ground.size).toBe(0);
  });

  it('ignores a pile that was never there', () => {
    const ground = new LitterGround();
    drop(ground, 4);
    expect(ground.collect('litter-nope')).toBeNull();
    expect(ground.size).toBe(1);
  });

  it('sweeps the whole base at once', () => {
    const ground = new LitterGround();
    drop(ground, 2);
    drop(ground, 3);
    drop(ground, 4);

    expect(ground.total().toNumber()).toBe(9);
    const swept = ground.collectAll();
    expect(swept.map((pile) => pile.amount.toNumber())).toEqual([2, 3, 4]);
    expect(ground.size).toBe(0);
    expect(ground.collectAll()).toEqual([]);
  });

  it('frees room again once a pile is swept', () => {
    const ground = new LitterGround();
    for (let i = 0; i < LITTER_MAX_PILES; i += 1) drop(ground, 1, i);

    ground.collect(ground.entries()[0].id);
    expect(ground.full).toBe(false);
    expect(drop(ground, 1, 100)).not.toBeNull();
  });

  it('never reuses an id, so a stale click cannot claim a new pile', () => {
    const ground = new LitterGround();
    const first = drop(ground, 1);
    ground.collect(first?.id ?? '');
    const second = drop(ground, 1);

    expect(second?.id).not.toBe(first?.id);
  });

  it('drops everything without crediting it on clear', () => {
    const ground = new LitterGround();
    drop(ground, 5);
    ground.clear();
    expect(ground.size).toBe(0);
  });
});
