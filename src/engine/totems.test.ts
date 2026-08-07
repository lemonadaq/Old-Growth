import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { MAX_TOTEMS, TOTEMS, TOTEM_BY_ID, TOTEM_AURA } from '../content/totems';
import { applyModifiers, ModifierSet } from './modifiers';
import { hasFreeSlot, totemCost, totemModifiers, TOTEM_SOURCE } from './totems';

/** Everything a set of totems does to one resource, as a multiplier. */
function multiplierOn(planted: readonly string[], resource: 'water' | 'light'): number {
  const set = new ModifierSet();
  for (const mod of totemModifiers(planted)) set.add(mod);
  return applyModifiers(new Decimal(1), set.matching(resource, [])).toNumber();
}

describe('the totem catalogue', () => {
  it('offers one recipe per aura, all costed in Deadwood', () => {
    expect(TOTEMS).toHaveLength(3);
    for (const def of TOTEMS) {
      expect(def.costResource).toBe('deadwood');
      expect(def.cost).toBeGreaterThan(0);
      expect(def.effects.length).toBeGreaterThan(0);
    }
  });

  it('gives all three the same +20% aura, so the choice is what to boost', () => {
    for (const def of TOTEMS) {
      for (const effect of def.effects) {
        expect(effect.type).toBe('mul');
        expect(effect.value).toBeCloseTo(1 + TOTEM_AURA, 9);
      }
    }
  });

  it('leaves exactly three places to stand one', () => {
    expect(MAX_TOTEMS).toBe(3);
  });
});

describe('totemCost', () => {
  it('quotes the catalogue price as a Decimal', () => {
    expect(totemCost(TOTEM_BY_ID.rain).toNumber()).toBe(TOTEM_BY_ID.rain.cost);
  });
});

describe('hasFreeSlot', () => {
  it('is true until every slot is taken', () => {
    expect(hasFreeSlot([])).toBe(true);
    expect(hasFreeSlot(['rain', 'sun'])).toBe(true);
    expect(hasFreeSlot(['rain', 'sun', 'vigor'])).toBe(false);
  });
});

describe('totemModifiers', () => {
  it('grants nothing when nothing is planted', () => {
    expect(totemModifiers([])).toEqual([]);
  });

  it('publishes every aura under one revocable source', () => {
    const mods = totemModifiers(['rain', 'sun']);
    expect(new Set(mods.map((m) => m.source))).toEqual(new Set([TOTEM_SOURCE]));
  });

  it('puts Rain on Water and Sun on Light', () => {
    expect(multiplierOn(['rain'], 'water')).toBeCloseTo(1.2, 9);
    expect(multiplierOn(['rain'], 'light')).toBeCloseTo(1, 9);
    expect(multiplierOn(['sun'], 'light')).toBeCloseTo(1.2, 9);
    expect(multiplierOn(['sun'], 'water')).toBeCloseTo(1, 9);
  });

  it('targets click power by tag, not by resource', () => {
    const mods = totemModifiers(['vigor']);
    expect(mods[0].targetKind).toBe('tag');
    expect(mods[0].target).toBe('click.power');
  });

  it('stacks duplicates instead of letting one shadow the other', () => {
    expect(multiplierOn(['rain', 'rain'], 'water')).toBeCloseTo(1.2 * 1.2, 9);
    expect(multiplierOn(['rain', 'rain', 'rain'], 'water')).toBeCloseTo(1.2 ** 3, 9);
  });

  it('keys modifiers by slot, so two of a kind are two modifiers', () => {
    const ids = totemModifiers(['rain', 'rain']).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skips an unknown id rather than throwing', () => {
    expect(totemModifiers(['rain', 'ghost'])).toHaveLength(1);
  });
});
