import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { applyModifiers, ModifierSet, type Modifier } from './modifiers';

/** Helper: build a resource-target modifier for terser test data. */
function mod(partial: Partial<Modifier> & Pick<Modifier, 'type' | 'value'>): Modifier {
  return {
    source: 'test',
    targetKind: 'resource',
    target: 'sap',
    ...partial,
  };
}

describe('applyModifiers — stacking order (base + Σadds) × Πmuls', () => {
  it('sums adds onto the base before applying muls', () => {
    // (10 + 5 + 5) × 2 = 40, not 10×2 + 5 + 5.
    const result = applyModifiers(new Decimal(10), [
      mod({ type: 'add', value: 5 }),
      mod({ type: 'mul', value: 2 }),
      mod({ type: 'add', value: 5 }),
    ]);
    expect(result.toNumber()).toBe(40);
  });

  it('is independent of modifier insertion order', () => {
    const mods = [mod({ type: 'mul', value: 2 }), mod({ type: 'add', value: 5 })];
    // A mul listed first must still apply after the add: (10 + 5) × 2 = 30.
    expect(applyModifiers(new Decimal(10), mods).toNumber()).toBe(30);
  });

  it('multiplies all mul factors together', () => {
    const result = applyModifiers(new Decimal(10), [
      mod({ type: 'mul', value: 2 }),
      mod({ type: 'mul', value: 3 }),
    ]);
    expect(result.toNumber()).toBe(60);
  });

  it('returns the base unchanged with no modifiers', () => {
    expect(applyModifiers(new Decimal(7), []).toNumber()).toBe(7);
  });

  it('ignores reserved pow modifiers', () => {
    const result = applyModifiers(new Decimal(10), [mod({ type: 'pow', value: 2 })]);
    expect(result.toNumber()).toBe(10);
  });

  it('accepts Decimal-valued modifiers', () => {
    const result = applyModifiers(new Decimal(10), [mod({ type: 'add', value: new Decimal(5) })]);
    expect(result.toNumber()).toBe(15);
  });
});

describe('ModifierSet — add / remove by source', () => {
  it('removes every modifier for a source, leaving others intact', () => {
    const set = new ModifierSet();
    set.add(mod({ source: 'bees', type: 'add', value: 1 }));
    set.add(mod({ source: 'bees', type: 'mul', value: 2 }));
    set.add(mod({ source: 'ants', type: 'add', value: 3 }));

    set.removeBySource('bees');

    const remaining = set.all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].source).toBe('ants');
  });

  it('is a no-op when removing an unknown source', () => {
    const set = new ModifierSet();
    set.add(mod({ source: 'ants', type: 'add', value: 3 }));
    set.removeBySource('fungi');
    expect(set.all()).toHaveLength(1);
  });

  it('matches modifiers by resource target and by tag', () => {
    const set = new ModifierSet();
    set.add(mod({ source: 'a', type: 'add', value: 1, targetKind: 'resource', target: 'sap' }));
    set.add(mod({ source: 'b', type: 'mul', value: 2, targetKind: 'tag', target: 'canopy' }));
    set.add(mod({ source: 'c', type: 'add', value: 9, targetKind: 'resource', target: 'water' }));

    const matched = set.matching('sap', ['canopy']);
    expect(matched.map((m) => m.source).sort()).toEqual(['a', 'b']);
  });
});
