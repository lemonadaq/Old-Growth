import { describe, expect, it } from 'vitest';
import { FOREST_RENDER_LIMIT } from '../content/prestige';
import { SPECIES_BY_ID } from '../content/species';
import { HYBRID_BY_ID } from '../content/hybrids';
import type { ForestTree } from '../engine/prestige';
import type { TreeLayout } from '../engine/tree';
import { forestColor, forestSlotOffset, layoutForest, visibleForest } from './forest';

const VIEWPORT = { width: 1280, height: 800 };
const LAYOUT: TreeLayout = { originX: 640, originY: 520, scale: 300 };

function tree(slot: number, overrides: Partial<ForestTree> = {}): ForestTree {
  return {
    id: `grove-${slot}`,
    speciesId: 'oak',
    height: 1.2,
    spread: 0.5,
    parts: 20,
    rings: 1,
    seeds: 2,
    slot,
    ...overrides,
  };
}

function grove(count: number): ForestTree[] {
  return Array.from({ length: count }, (_, i) => tree(i));
}

describe('forestSlotOffset', () => {
  it('lands inside the band', () => {
    for (let slot = 0; slot < 200; slot += 1) {
      const offset = forestSlotOffset(slot);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(1);
    }
  });

  it('is fixed for a slot — a tree never moves once planted', () => {
    expect(forestSlotOffset(7)).toBe(forestSlotOffset(7));
  });

  it('never puts two of the first thirty on top of each other', () => {
    const offsets = Array.from({ length: FOREST_RENDER_LIMIT }, (_, i) => forestSlotOffset(i)).sort(
      (a, b) => a - b,
    );

    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i] - offsets[i - 1]).toBeGreaterThan(0.01);
    }
  });

  it('treats a nonsense slot as the first one', () => {
    expect(forestSlotOffset(-4)).toBe(forestSlotOffset(0));
  });
});

describe('forestColor', () => {
  it('is the species foliage', () => {
    expect(forestColor('maple')).toBe(SPECIES_BY_ID.maple.palette.leaf);
  });

  it('knows hybrids too', () => {
    const [hybrid] = Object.values(HYBRID_BY_ID);
    expect(forestColor(hybrid.id)).toBe(hybrid.palette.leaf);
  });

  it('falls back to oak rather than to nothing', () => {
    expect(forestColor('not-a-species')).toBe(SPECIES_BY_ID.oak.palette.leaf);
  });
});

describe('visibleForest', () => {
  it('draws everything while the grove is small', () => {
    const { drawn, hidden } = visibleForest(grove(5));
    expect(drawn).toHaveLength(5);
    expect(hidden).toBe(0);
  });

  it('draws exactly the limit at the limit', () => {
    const { drawn, hidden } = visibleForest(grove(FOREST_RENDER_LIMIT));
    expect(drawn).toHaveLength(FOREST_RENDER_LIMIT);
    expect(hidden).toBe(0);
  });

  it('keeps the newest trees and counts the rest', () => {
    const trees = grove(FOREST_RENDER_LIMIT + 7);
    const { drawn, hidden } = visibleForest(trees);

    expect(drawn).toHaveLength(FOREST_RENDER_LIMIT);
    expect(hidden).toBe(7);
    // The tree just planted is always on the ridge.
    expect(drawn[drawn.length - 1]).toBe(trees[trees.length - 1]);
  });
});

describe('layoutForest', () => {
  it('stands every tree above the ground line', () => {
    for (const laid of layoutForest(grove(12), VIEWPORT, LAYOUT)) {
      expect(laid.baseY).toBeLessThanOrEqual(LAYOUT.originY);
      expect(laid.height).toBeGreaterThan(0);
      expect(laid.halfWidth).toBeGreaterThan(0);
    }
  });

  it('draws nothing when the camera is underground', () => {
    expect(layoutForest(grove(4), VIEWPORT, { ...LAYOUT, originY: -20 })).toHaveLength(0);
  });

  it('is stable: two calls with the same camera agree exactly', () => {
    expect(layoutForest(grove(6), VIEWPORT, LAYOUT)).toEqual(
      layoutForest(grove(6), VIEWPORT, LAYOUT),
    );
  });

  it('scales a silhouette by the height the tree actually reached', () => {
    const [short, tall] = layoutForest(
      [tree(0, { height: 0.7 }), tree(1, { height: 1.3 })],
      VIEWPORT,
      LAYOUT,
    );
    expect(tall.height).toBeGreaterThan(short.height);
  });

  it('floors the size so a stunted tree is still a tree', () => {
    const [laid] = layoutForest([tree(0, { height: 0.01 })], VIEWPORT, LAYOUT);
    expect(laid.height).toBeGreaterThan(0);
  });

  it('gives a broader canopy a broader crown', () => {
    const [narrow, wide] = layoutForest(
      [tree(0, { spread: 0.1 }), tree(1, { spread: 0.9 })],
      VIEWPORT,
      LAYOUT,
    );
    // Same height, so the crowns differ only by the spread that made them.
    expect(wide.halfWidth).toBeGreaterThan(narrow.halfWidth);
  });

  it('travels with the camera — panning scrolls through the grove', () => {
    const still = layoutForest([tree(3)], VIEWPORT, LAYOUT);
    const panned = layoutForest([tree(3)], VIEWPORT, { ...LAYOUT, originX: 340 });
    expect(panned[0].x).not.toBeCloseTo(still[0].x, 3);
  });

  it('lags the tree it stands behind — the ridge is further away', () => {
    const dx = 200;
    const panned = layoutForest([tree(3)], VIEWPORT, { ...LAYOUT, originX: LAYOUT.originX - dx });
    const still = layoutForest([tree(3)], VIEWPORT, LAYOUT);
    expect(Math.abs(panned[0].x - still[0].x)).toBeLessThan(dx);
  });

  it('carries the colour of the species the tree was made of', () => {
    const [laid] = layoutForest([tree(0, { speciesId: 'pine' })], VIEWPORT, LAYOUT);
    expect(laid.color).toBe(SPECIES_BY_ID.pine.palette.leaf);
  });
});
