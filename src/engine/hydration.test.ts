import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { HYDRATION_MAX, HYDRATION_MIN, WATER_NEED_PER_LEAF } from '../content/hydration';
import { CLICK_STAT_TAG, resolveClickStats } from './clicker';
import { computeHydration, hydrationModifiers, waterNeed, HYDRATION_SOURCE } from './hydration';
import { ModifierSet, applyModifiers } from './modifiers';

const water = (amount: number) => new Decimal(amount);

describe('waterNeed', () => {
  it('asks for nothing when nothing is drinking', () => {
    expect(waterNeed(0).toNumber()).toBe(0);
  });

  it('scales with the number of leaf clusters', () => {
    expect(waterNeed(1).toNumber()).toBeCloseTo(WATER_NEED_PER_LEAF, 9);
    expect(waterNeed(8).toNumber()).toBeCloseTo(WATER_NEED_PER_LEAF * 8, 9);
  });

  it('treats a negative count as an empty canopy', () => {
    expect(waterNeed(-3).toNumber()).toBe(0);
  });
});

describe('computeHydration', () => {
  it('is neutral while the tree has no leaves to water', () => {
    const hydration = computeHydration(water(0), 0);
    expect(hydration.value).toBe(1);
    expect(hydration.ratio).toBe(1);
  });

  it('is the plain supply ÷ demand ratio between the clamps', () => {
    // Two leaves want 0.7/s; supplying half of that is a half-rate canopy.
    const hydration = computeHydration(water(WATER_NEED_PER_LEAF), 2);
    expect(hydration.ratio).toBeCloseTo(0.5, 9);
    expect(hydration.value).toBeCloseTo(0.5, 9);
  });

  it('reads exactly 1 when the roots meet the canopy’s need', () => {
    expect(computeHydration(water(WATER_NEED_PER_LEAF * 4), 4).value).toBeCloseTo(1, 9);
  });

  it('floors a canopy with no roots under it', () => {
    const hydration = computeHydration(water(0), 5);
    expect(hydration.ratio).toBe(0);
    expect(hydration.value).toBe(HYDRATION_MIN);
  });

  it('caps a canopy swimming in water', () => {
    const hydration = computeHydration(water(100), 1);
    expect(hydration.ratio).toBeGreaterThan(HYDRATION_MAX);
    expect(hydration.value).toBe(HYDRATION_MAX);
  });

  it('keeps the unclamped ratio so the HUD can explain the clamp', () => {
    expect(computeHydration(water(0), 5).ratio).toBe(0);
    expect(computeHydration(water(3.5), 1).ratio).toBeCloseTo(10, 9);
  });

  it('reports the inputs it was given back', () => {
    const hydration = computeHydration(water(2), 3);
    expect(hydration.income.toNumber()).toBe(2);
    expect(hydration.need.toNumber()).toBeCloseTo(WATER_NEED_PER_LEAF * 3, 9);
    expect(hydration.leaves).toBe(3);
  });

  it('sits at the boundaries rather than past them', () => {
    // Exactly at each clamp, the value is the clamp itself.
    const low = computeHydration(water(WATER_NEED_PER_LEAF * HYDRATION_MIN), 1);
    const high = computeHydration(water(WATER_NEED_PER_LEAF * HYDRATION_MAX), 1);
    expect(low.value).toBeCloseTo(HYDRATION_MIN, 9);
    expect(high.value).toBeCloseTo(HYDRATION_MAX, 9);
  });
});

describe('hydrationModifiers', () => {
  it('multiplies canopy production and click power, and nothing else', () => {
    const mods = hydrationModifiers(0.5);
    expect(mods).toHaveLength(2);
    expect(mods.map((m) => m.target).sort()).toEqual([CLICK_STAT_TAG.clickPower, 'canopy'].sort());
    expect(mods.every((m) => m.type === 'mul' && m.targetKind === 'tag')).toBe(true);
  });

  it('grants everything under one revocable source', () => {
    expect(hydrationModifiers(1.2).every((m) => m.source === HYDRATION_SOURCE)).toBe(true);
  });

  it('halves a leaf’s Light through the ordinary modifier pipeline', () => {
    const modifiers = new ModifierSet();
    for (const mod of hydrationModifiers(0.5)) modifiers.add(mod);

    const rate = applyModifiers(
      new Decimal(0.4),
      modifiers.matching('light', ['canopy', 'leafCluster']),
    );
    expect(rate.toNumber()).toBeCloseTo(0.2, 9);
  });

  it('throttles click power without touching crit chance', () => {
    const modifiers = new ModifierSet();
    for (const mod of hydrationModifiers(HYDRATION_MIN)) modifiers.add(mod);

    const stats = resolveClickStats(modifiers);
    expect(stats.clickPower.toNumber()).toBeCloseTo(HYDRATION_MIN, 9);
    expect(stats.critChance).toBeCloseTo(0.02, 9);
  });

  it('leaves root production alone, so hydration cannot feed itself', () => {
    const modifiers = new ModifierSet();
    for (const mod of hydrationModifiers(0.25)) modifiers.add(mod);

    const rate = applyModifiers(
      new Decimal(0.3),
      modifiers.matching('water', ['root', 'rootSegment', 'offline']),
    );
    expect(rate.toNumber()).toBeCloseTo(0.3, 9);
  });
});
