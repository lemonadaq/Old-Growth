import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { partProducerTags } from '../content/growth';
import { HYBRIDS, hybridFor, pairKey } from '../content/hybrids';
import { SPECIES, SPECIES_BY_ID, STARTER_SPECIES_ID } from '../content/species';
import { CLICK_STAT_TAG, resolveClickStats } from './clicker';
import { applyModifiers, ModifierSet, scopedTag } from './modifiers';
import {
  clickScopes,
  isSpeciesUnlocked,
  lookupSpecies,
  scaleTraitValue,
  speciesCostMultiplier,
  speciesModifiers,
  speciesPalette,
  speciesResourceTag,
  speciesShares,
  speciesTag,
  unlockProgress,
  unlockedSpeciesIds,
  type UnlockContext,
} from './species';
import { TreeGraph } from './treeGraph';

function context(overrides: Partial<UnlockContext> = {}): UnlockContext {
  return {
    lifetime: () => new Decimal(0),
    parts: 0,
    partsOfType: () => 0,
    prunes: 0,
    ...overrides,
  };
}

/** A modifier set holding whatever the given species mix grants. */
function modifiersFor(counts: Record<string, number>): ModifierSet {
  const set = new ModifierSet();
  for (const modifier of speciesModifiers(new Map(Object.entries(counts)))) set.add(modifier);
  return set;
}

describe('the catalogue', () => {
  it('starts as a species that exists', () => {
    expect(SPECIES_BY_ID[STARTER_SPECIES_ID]).toBeDefined();
  });

  it('has exactly one hybrid for every unordered pair of the six', () => {
    const pairs = new Set<string>();
    for (const a of SPECIES) {
      for (const b of SPECIES) {
        if (a.id !== b.id) pairs.add(pairKey(a.id, b.id));
      }
    }
    expect(pairs.size).toBe(15);
    expect(HYBRIDS).toHaveLength(15);

    for (const key of pairs) {
      const [a, b] = key.split('+');
      expect(hybridFor(a, b), `no hybrid for ${key}`).not.toBeNull();
      // Order must not matter: the table is keyed on an unordered pair.
      expect(hybridFor(b, a)?.id).toBe(hybridFor(a, b)?.id);
    }
  });

  it('gives every hybrid a distinct id, name and effect set', () => {
    expect(new Set(HYBRIDS.map((h) => h.id)).size).toBe(HYBRIDS.length);
    expect(new Set(HYBRIDS.map((h) => h.name)).size).toBe(HYBRIDS.length);

    const signatures = HYBRIDS.map((h) =>
      h.traits
        .map((t) => `${t.type}:${JSON.stringify(t.target)}:${t.value}`)
        .sort()
        .join('|'),
    );
    expect(new Set(signatures).size).toBe(HYBRIDS.length);
  });

  it('keeps every hybrid trait local to its own limb', () => {
    for (const hybrid of HYBRIDS) {
      for (const trait of hybrid.traits) {
        expect(trait.target.kind, `${hybrid.id} reaches beyond its limb`).not.toBe('tree');
      }
    }
  });

  it('has no hybrid of a species with itself', () => {
    expect(hybridFor('oak', 'oak')).toBeNull();
  });

  it('resolves both species and hybrids by id, and nothing else', () => {
    expect(lookupSpecies('oak')?.hybrid).toBe(false);
    expect(lookupSpecies('ironblossom')?.hybrid).toBe(true);
    expect(lookupSpecies('nonesuch')).toBeNull();
    // An unknown id still draws as something rather than crashing the renderer.
    expect(speciesPalette('nonesuch')).toEqual(SPECIES_BY_ID.oak.palette);
  });
});

describe('producer tags', () => {
  it('stamps a part with its species and its species-plus-resource', () => {
    const tags = partProducerTags('leafCluster', 'maple');
    expect(tags).toContain(speciesTag('maple'));
    expect(tags).toContain(speciesResourceTag('maple', 'light'));
  });

  it('leaves structural parts without a resource tag', () => {
    const tags = partProducerTags('branch', 'maple');
    expect(tags).toContain(speciesTag('maple'));
    expect(tags.some((tag) => tag.includes('/'))).toBe(false);
  });
});

describe('speciesShares', () => {
  it('divides the tree between the species on it', () => {
    const shares = speciesShares(
      new Map([
        ['oak', 3],
        ['birch', 1],
      ]),
    );
    expect(shares.get('oak')).toBeCloseTo(0.75, 9);
    expect(shares.get('birch')).toBeCloseTo(0.25, 9);
  });

  it('is empty for an empty tree', () => {
    expect(speciesShares(new Map()).size).toBe(0);
  });
});

describe('scaleTraitValue', () => {
  it('dilutes a mul toward 1 and an add toward 0', () => {
    expect(scaleTraitValue('mul', 1.5, 0.5)).toBeCloseTo(1.25, 9);
    expect(scaleTraitValue('add', 0.1, 0.5)).toBeCloseTo(0.05, 9);
  });

  it('is the full effect at share 1 and no effect at share 0', () => {
    expect(scaleTraitValue('mul', 1.5, 1)).toBe(1.5);
    expect(scaleTraitValue('mul', 1.5, 0)).toBe(1);
    expect(scaleTraitValue('add', 3, 0)).toBe(0);
  });

  it('clamps a share outside [0, 1]', () => {
    expect(scaleTraitValue('mul', 2, 4)).toBe(2);
    expect(scaleTraitValue('mul', 2, -1)).toBe(1);
  });
});

describe('speciesModifiers', () => {
  it('publishes nothing for a species the tree does not carry', () => {
    const mods = speciesModifiers(new Map([['oak', 4]]));
    expect(mods.every((m) => m.id?.startsWith('species:oak'))).toBe(true);
  });

  it("reaches only its own species' production", () => {
    const set = modifiersFor({ willow: 2, oak: 2 });

    const willowWater = applyModifiers(
      new Decimal(1),
      set.matching('water', partProducerTags('rootSegment', 'willow')),
    );
    const oakWater = applyModifiers(
      new Decimal(1),
      set.matching('water', partProducerTags('rootSegment', 'oak')),
    );

    expect(willowWater.toNumber()).toBeCloseTo(1.5, 9);
    expect(oakWater.toNumber()).toBe(1);
  });

  it('leaves other resources on the same species alone', () => {
    const set = modifiersFor({ willow: 1 });
    const willowLight = applyModifiers(
      new Decimal(1),
      set.matching('light', partProducerTags('leafCluster', 'willow')),
    );
    expect(willowLight.toNumber()).toBe(1);
  });

  it('applies an unqualified own-production trait to everything that species makes', () => {
    const set = modifiersFor({ birch: 1 });
    for (const [type, resource] of [
      ['leafCluster', 'light'],
      ['rootSegment', 'water'],
    ] as const) {
      const rate = applyModifiers(
        new Decimal(1),
        set.matching(resource, partProducerTags(type, 'birch')),
      );
      expect(rate.toNumber()).toBeCloseTo(0.85, 9);
    }
  });

  it('publishes a limb click trait only under its own scope', () => {
    const set = modifiersFor({ cherry: 1 });

    const global = resolveClickStats(set);
    const onCherry = resolveClickStats(set, [speciesTag('cherry')]);

    expect(global.critChance).toBeCloseTo(0.02, 9);
    expect(onCherry.critChance).toBeCloseTo(0.07, 9);
  });

  it("scales a whole-tree trait by that species' share", () => {
    // Frostbloom's dormant winter trait is limb-scoped; Pine's is tree-scoped.
    const half = modifiersFor({ pine: 1, oak: 1 });
    const winter = half.matchingTag('season.winter.penalty');
    expect(winter).toHaveLength(1);
    // 0.4 at full share, diluted to 0.7 at half the tree.
    expect(Number(winter[0].value)).toBeCloseTo(0.7, 9);
  });

  it('publishes nothing at all for a price trait', () => {
    const set = modifiersFor({ birch: 1 });
    // Birch's discount is a price multiplier, not a modifier — there must be no
    // stray identity modifier standing in for it.
    expect(set.all().filter((m) => Number(m.value) === 0.7)).toHaveLength(0);
  });
});

describe('speciesCostMultiplier', () => {
  it('is 1 for a species with no break, and the species factor otherwise', () => {
    expect(speciesCostMultiplier('oak', 'branch')).toBe(1);
    expect(speciesCostMultiplier('birch', 'branch')).toBeCloseTo(0.7, 9);
  });

  it('multiplies a per-type break on top of the blanket one', () => {
    expect(speciesCostMultiplier('cherry', 'blossom')).toBeCloseTo(0.5, 9);
    expect(speciesCostMultiplier('cherry', 'branch')).toBe(1);
  });

  it('is 1 for an unknown species rather than free', () => {
    expect(speciesCostMultiplier('nonesuch', 'branch')).toBe(1);
  });
});

describe('unlocks', () => {
  it('has the starter available immediately and the rest not', () => {
    const ids = unlockedSpeciesIds(context());
    expect(ids).toEqual([STARTER_SPECIES_ID]);
  });

  it('opens a lifetime milestone at exactly its threshold', () => {
    const willow = SPECIES_BY_ID.willow;
    const under = context({ lifetime: () => new Decimal(39.99) });
    const at = context({ lifetime: () => new Decimal(40) });

    expect(isSpeciesUnlocked(willow, under)).toBe(false);
    expect(isSpeciesUnlocked(willow, at)).toBe(true);
  });

  it('reports partial progress toward a locked species', () => {
    const progress = unlockProgress(SPECIES_BY_ID.birch, context({ parts: 4 }));
    expect(progress.unlocked).toBe(false);
    expect(progress.fraction).toBeCloseTo(0.5, 9);
    expect(progress.hint).toMatch(/8 parts/);
  });

  it('caps progress at 1 once the milestone is passed', () => {
    const progress = unlockProgress(SPECIES_BY_ID.birch, context({ parts: 40 }));
    expect(progress.unlocked).toBe(true);
    expect(progress.fraction).toBe(1);
  });

  it('counts prunes for the species that wants them', () => {
    expect(isSpeciesUnlocked(SPECIES_BY_ID.pine, context({ prunes: 2 }))).toBe(false);
    expect(isSpeciesUnlocked(SPECIES_BY_ID.pine, context({ prunes: 3 }))).toBe(true);
  });

  it('returns unlocked species in catalogue order', () => {
    const ids = unlockedSpeciesIds(
      context({ parts: 100, prunes: 100, lifetime: () => new Decimal(1e6) }),
    );
    expect(ids).toEqual(SPECIES.map((s) => s.id));
  });
});

describe('clickScopes', () => {
  it("names the struck limb's species", () => {
    const tree = TreeGraph.seedling();
    tree.grow(tree.rootId, 'branch', 'birch');
    const branch = tree.allNodes().find((node) => node.type === 'branch');

    expect(clickScopes(tree, branch?.id)).toEqual([speciesTag('birch')]);
    expect(clickScopes(tree, tree.rootId)).toEqual([speciesTag('oak')]);
  });

  it('names nothing for a missing or unknown node', () => {
    const tree = TreeGraph.seedling();
    expect(clickScopes(tree, null)).toEqual([]);
    expect(clickScopes(tree, 'ghost-9')).toEqual([]);
  });

  it('is what makes a scoped click modifier apply at all', () => {
    const set = new ModifierSet();
    set.add({
      source: 'test',
      type: 'mul',
      targetKind: 'tag',
      target: scopedTag(speciesTag('ironblossom'), CLICK_STAT_TAG.critMult),
      value: 1.5,
    });

    expect(resolveClickStats(set).critMult).toBe(10);
    expect(resolveClickStats(set, [speciesTag('ironblossom')]).critMult).toBeCloseTo(15, 9);
  });
});
