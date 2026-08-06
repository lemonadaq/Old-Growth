import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  BASE_CLICK_STATS,
  CLICK_STAT_TAG,
  resolveClick,
  resolveClickStats,
  type ClickStats,
} from './clicker';
import { COMBO_FULL_STACKS } from './combo';
import { ModifierSet } from './modifiers';

function stats(overrides: Partial<ClickStats> = {}): ClickStats {
  return {
    clickPower: new Decimal(1),
    critChance: 0.02,
    critMult: 10,
    comboCap: COMBO_FULL_STACKS,
    ...overrides,
  };
}

describe('resolveClickStats', () => {
  it('returns the documented base values with no modifiers', () => {
    const resolved = resolveClickStats(new ModifierSet());
    expect(resolved.clickPower.toNumber()).toBe(BASE_CLICK_STATS.clickPower);
    expect(resolved.critChance).toBe(BASE_CLICK_STATS.critChance);
    expect(resolved.critMult).toBe(BASE_CLICK_STATS.critMult);
    expect(resolved.comboCap).toBe(BASE_CLICK_STATS.comboCap);
  });

  it('applies tag-targeted modifiers with the standard stacking order', () => {
    const mods = new ModifierSet();
    mods.add({
      source: 'test',
      type: 'add',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.clickPower,
      value: 4,
    });
    mods.add({
      source: 'test',
      type: 'mul',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.clickPower,
      value: 3,
    });

    // (1 + 4) × 3
    expect(resolveClickStats(mods).clickPower.toNumber()).toBe(15);
  });

  it('ignores resource-targeted modifiers, which belong to producers', () => {
    const mods = new ModifierSet();
    mods.add({ source: 'test', type: 'mul', targetKind: 'resource', target: 'sap', value: 100 });
    expect(resolveClickStats(mods).clickPower.toNumber()).toBe(1);
  });

  it('keeps each stat on its own tag', () => {
    const mods = new ModifierSet();
    mods.add({
      source: 'test',
      type: 'add',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.critChance,
      value: 0.08,
    });

    const resolved = resolveClickStats(mods);
    expect(resolved.critChance).toBeCloseTo(0.1, 10);
    expect(resolved.clickPower.toNumber()).toBe(1);
    expect(resolved.comboCap).toBe(50);
  });

  it('clamps crit chance to [0, 1] and keeps the cap a whole number ≥ 1', () => {
    const overshoot = new ModifierSet();
    overshoot.add({
      source: 'test',
      type: 'add',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.critChance,
      value: 5,
    });
    expect(resolveClickStats(overshoot).critChance).toBe(1);

    const undershoot = new ModifierSet();
    undershoot.add({
      source: 'test',
      type: 'add',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.critChance,
      value: -1,
    });
    expect(resolveClickStats(undershoot).critChance).toBe(0);

    const shrunkCap = new ModifierSet();
    shrunkCap.add({
      source: 'test',
      type: 'mul',
      targetKind: 'tag',
      target: CLICK_STAT_TAG.comboCap,
      value: 0,
    });
    expect(resolveClickStats(shrunkCap).comboCap).toBe(1);
  });
});

describe('crit maths', () => {
  it('crits when the roll lands below crit chance', () => {
    expect(resolveClick(stats(), 0, 0.019).crit).toBe(true);
    expect(resolveClick(stats(), 0, 0).crit).toBe(true);
  });

  it('does not crit on a roll at or above crit chance', () => {
    expect(resolveClick(stats(), 0, 0.02).crit).toBe(false);
    expect(resolveClick(stats(), 0, 0.9999).crit).toBe(false);
  });

  it('multiplies the payout by critMult on a crit', () => {
    const plain = resolveClick(stats({ clickPower: new Decimal(7) }), 0, 1);
    const crit = resolveClick(stats({ clickPower: new Decimal(7) }), 0, 0);
    expect(plain.gain.toNumber()).toBe(7);
    expect(crit.gain.toNumber()).toBe(70);
  });

  it('never crits at 0% and always crits at 100%', () => {
    expect(resolveClick(stats({ critChance: 0 }), 0, 0).crit).toBe(false);
    expect(resolveClick(stats({ critChance: 1 }), 0, 0.999999).crit).toBe(true);
  });

  it('stacks the combo and crit multipliers together', () => {
    // 1 base × ×2 combo (50 stacks) × ×10 crit
    const result = resolveClick(stats(), COMBO_FULL_STACKS, 0);
    expect(result.comboMultiplier).toBeCloseTo(2, 10);
    expect(result.gain.toNumber()).toBeCloseTo(20, 10);
  });

  it('applies the combo multiplier without a crit', () => {
    const result = resolveClick(stats({ clickPower: new Decimal(3) }), 25, 1);
    expect(result.crit).toBe(false);
    expect(result.gain.toNumber()).toBeCloseTo(4.5, 10); // 3 × 1.5
  });

  it('caps the combo contribution at the player cap', () => {
    const result = resolveClick(stats({ comboCap: 10 }), 999, 1);
    expect(result.comboMultiplier).toBeCloseTo(1.2, 10);
  });

  it('reports the stacks and stats the tap resolved against', () => {
    const s = stats({ critMult: 4 });
    const result = resolveClick(s, 12, 1);
    expect(result.comboStacks).toBe(12);
    expect(result.stats).toBe(s);
  });
});
