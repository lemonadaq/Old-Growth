import { describe, expect, it } from 'vitest';
import type { ScreenSegment } from '../engine/tree';
import { ceremonyDim, ceremonySeeds } from './ceremony';

/** A canopy of leaves at descending screen heights. */
function canopy(count: number): ScreenSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `leaf-${i}`,
    kind: 'leafCluster' as const,
    speciesId: 'oak',
    depth: 3,
    a: { x: 100 + i * 30, y: 300 + i * 20 },
    b: { x: 100 + i * 30, y: 290 + i * 20 },
    width: 8,
  }));
}

describe('ceremonySeeds', () => {
  it('has nothing to lift from a bare tree', () => {
    expect(ceremonySeeds([], 0.5)).toHaveLength(0);
  });

  it('releases nothing at the very start', () => {
    expect(ceremonySeeds(canopy(6), 0)).toHaveLength(0);
  });

  it('has the whole canopy up by the halfway point', () => {
    expect(ceremonySeeds(canopy(6), 0.5)).toHaveLength(6);
  });

  it('empties the canopy from the top down', () => {
    const early = ceremonySeeds(canopy(8), 0.06);
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(8);
  });

  it('lifts every seed above the leaf it came from', () => {
    const leaves = canopy(5);
    for (const seed of ceremonySeeds(leaves, 0.6)) {
      expect(seed.y).toBeLessThan(Math.max(...leaves.map((leaf) => leaf.b.y)));
    }
  });

  it('keeps rising for the whole ceremony', () => {
    const leaves = canopy(4);
    const mid = ceremonySeeds(leaves, 0.5)[0];
    const late = ceremonySeeds(leaves, 0.9)[0];
    expect(late.y).toBeLessThan(mid.y);
  });

  it('fades them out as they climb away', () => {
    const leaves = canopy(4);
    expect(ceremonySeeds(leaves, 1)[0].alpha).toBeLessThan(ceremonySeeds(leaves, 0.5)[0].alpha);
  });

  it('keeps every value drawable', () => {
    for (const t of [0.1, 0.35, 0.7, 1]) {
      for (const seed of ceremonySeeds(canopy(7), t)) {
        expect(Number.isFinite(seed.x)).toBe(true);
        expect(Number.isFinite(seed.y)).toBe(true);
        expect(seed.radius).toBeGreaterThan(0);
        expect(seed.alpha).toBeGreaterThanOrEqual(0);
        expect(seed.alpha).toBeLessThanOrEqual(1);
        expect(seed.trail).toBeGreaterThan(0);
      }
    }
  });

  it('drifts sideways rather than rising in a column', () => {
    const leaves = canopy(8);
    const seeds = ceremonySeeds(leaves, 0.8);
    const drifted = seeds.filter(
      (seed, i) => Math.abs(seed.x - [...leaves].sort((a, b) => a.b.y - b.b.y)[i].b.x) > 1,
    );
    expect(drifted.length).toBeGreaterThan(0);
  });

  it('is deterministic — the same fraction always draws the same frame', () => {
    expect(ceremonySeeds(canopy(6), 0.42)).toEqual(ceremonySeeds(canopy(6), 0.42));
  });

  it('clamps a fraction outside its span', () => {
    expect(ceremonySeeds(canopy(4), -1)).toHaveLength(0);
    expect(ceremonySeeds(canopy(4), 5)).toEqual(ceremonySeeds(canopy(4), 1));
  });

  it('handles a canopy of one', () => {
    expect(ceremonySeeds(canopy(1), 0.5)).toHaveLength(1);
  });
});

describe('ceremonyDim', () => {
  it('starts clear', () => {
    expect(ceremonyDim(0)).toBe(0);
  });

  it('deepens through the first two thirds', () => {
    expect(ceremonyDim(0.3)).toBeGreaterThan(ceremonyDim(0.1));
  });

  it('holds once it is full, rather than closing over the last seconds', () => {
    expect(ceremonyDim(0.66)).toBeCloseTo(1, 6);
    expect(ceremonyDim(1)).toBe(1);
  });

  it('stays in range either side of the ceremony', () => {
    expect(ceremonyDim(-2)).toBe(0);
    expect(ceremonyDim(9)).toBe(1);
  });
});
