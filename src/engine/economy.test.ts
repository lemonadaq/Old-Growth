import { describe, expect, it } from 'vitest';
import { computeProduction, type Producer } from './economy';
import { ModifierSet } from './modifiers';
import { RESOURCE_IDS } from '../content/resources';

describe('computeProduction', () => {
  it('returns a zero rate for every resource with no producers', () => {
    const result = computeProduction([], new ModifierSet());
    for (const id of RESOURCE_IDS) {
      expect(result[id].toNumber()).toBe(0);
    }
  });

  it('sums base rates of producers for the same resource', () => {
    const producers: Producer[] = [
      { id: 'a', resource: 'sap', baseRate: 1, tags: [] },
      { id: 'b', resource: 'sap', baseRate: 2, tags: [] },
    ];
    const result = computeProduction(producers, new ModifierSet());
    expect(result.sap.toNumber()).toBe(3);
  });

  it('applies resource-targeted modifiers per producer', () => {
    const producers: Producer[] = [{ id: 'a', resource: 'sap', baseRate: 10, tags: [] }];
    const mods = new ModifierSet();
    mods.add({ source: 's', type: 'add', targetKind: 'resource', target: 'sap', value: 5 });
    mods.add({ source: 's', type: 'mul', targetKind: 'resource', target: 'sap', value: 2 });
    // (10 + 5) × 2 = 30.
    expect(computeProduction(producers, mods).sap.toNumber()).toBe(30);
  });

  it('applies tag-targeted modifiers to matching producers only', () => {
    const producers: Producer[] = [
      { id: 'leaf', resource: 'light', baseRate: 4, tags: ['canopy'] },
      { id: 'root', resource: 'water', baseRate: 4, tags: ['roots'] },
    ];
    const mods = new ModifierSet();
    mods.add({ source: 'sun', type: 'mul', targetKind: 'tag', target: 'canopy', value: 3 });

    const result = computeProduction(producers, mods);
    expect(result.light.toNumber()).toBe(12); // 4 × 3
    expect(result.water.toNumber()).toBe(4); // untouched
  });
});
