import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { FIRST_PRESTIGE_SEEDS } from '../content/balance';
import {
  CEREMONY_SECONDS,
  FOREST_PRODUCTION_BONUS,
  FOREST_RENDER_LIMIT,
  PRESTIGE_HEIGHT_UNITS,
  PRESTIGE_LIGHT_REQUIREMENT,
  SEED_FRAGMENTS_PER_SEED,
  SEED_LIGHT_DIVISOR,
} from '../content/prestige';
import { RESOURCE_IDS } from '../content/resources';
import {
  beginCeremony,
  captureMemory,
  ceremonyFraction,
  dominantSpecies,
  forestModifiers,
  forestMultiplier,
  memoryParts,
  prestigeProgress,
  seedYield,
  summariseTree,
  treeHeight,
  treeSpread,
  FOREST_SOURCE,
} from './prestige';
import { TreeGraph } from './treeGraph';

/** A trunk with a branch, a twig and a leaf up one side, plus a root below. */
function sampleTree(): TreeGraph {
  const tree = TreeGraph.seedling();
  const branch = tree.grow(tree.rootId, 'branch', 'oak');
  const twig = tree.grow(branch?.id ?? '', 'twig', 'oak');
  tree.grow(twig?.id ?? '', 'leafCluster', 'oak');
  tree.grow(tree.rootId, 'rootSegment', 'willow');
  return tree;
}

describe('treeHeight', () => {
  it('is the trunk length for a bare seedling', () => {
    expect(treeHeight(TreeGraph.seedling())).toBeCloseTo(0.6, 3);
  });

  it('rises as the canopy is built upward', () => {
    const bare = treeHeight(TreeGraph.seedling());
    expect(treeHeight(sampleTree())).toBeGreaterThan(bare);
  });

  it('ignores roots entirely — depth is not height', () => {
    const shallow = TreeGraph.seedling();
    const deep = TreeGraph.seedling();
    let parent: string | undefined = deep.rootId;
    for (let i = 0; i < 4 && parent; i += 1) {
      parent = deep.grow(parent, 'rootSegment', 'oak')?.id;
    }

    expect(treeHeight(deep)).toBeCloseTo(treeHeight(shallow), 6);
  });

  it('is never negative', () => {
    expect(treeHeight(TreeGraph.seedling())).toBeGreaterThanOrEqual(0);
  });
});

describe('treeSpread', () => {
  it('is zero for a bare trunk, which stands straight up', () => {
    expect(treeSpread(TreeGraph.seedling())).toBeCloseTo(0, 6);
  });

  it('grows once the canopy leans out', () => {
    expect(treeSpread(sampleTree())).toBeGreaterThan(0);
  });
});

describe('dominantSpecies', () => {
  it('is the starter for a bare trunk', () => {
    expect(dominantSpecies(TreeGraph.seedling())).toBe('oak');
  });

  it('follows the majority of parts', () => {
    const tree = TreeGraph.seedling();
    for (let i = 0; i < 3; i += 1) tree.grow(tree.rootId, 'branch', 'maple');
    expect(dominantSpecies(tree)).toBe('maple');
  });
});

describe('prestigeProgress', () => {
  it('is not ready with height alone', () => {
    const progress = prestigeProgress(PRESTIGE_HEIGHT_UNITS, new Decimal(0));
    expect(progress.heightFraction).toBe(1);
    expect(progress.ready).toBe(false);
  });

  it('is not ready with Light alone', () => {
    const progress = prestigeProgress(0, new Decimal(PRESTIGE_LIGHT_REQUIREMENT));
    expect(progress.lightFraction).toBe(1);
    expect(progress.ready).toBe(false);
  });

  it('is ready once both gates are met', () => {
    const progress = prestigeProgress(
      PRESTIGE_HEIGHT_UNITS,
      new Decimal(PRESTIGE_LIGHT_REQUIREMENT),
    );
    expect(progress.ready).toBe(true);
    expect(progress.fraction).toBe(1);
  });

  it('reports the nearer of the two gates, not their average', () => {
    const progress = prestigeProgress(
      PRESTIGE_HEIGHT_UNITS,
      new Decimal(PRESTIGE_LIGHT_REQUIREMENT / 10),
    );
    expect(progress.fraction).toBeCloseTo(0.1, 3);
  });

  it('clamps both fractions to [0, 1]', () => {
    const progress = prestigeProgress(
      PRESTIGE_HEIGHT_UNITS * 4,
      new Decimal(PRESTIGE_LIGHT_REQUIREMENT).mul(9),
    );
    expect(progress.heightFraction).toBe(1);
    expect(progress.lightFraction).toBe(1);
  });
});

describe('seedYield', () => {
  it('pays nothing before the first threshold', () => {
    expect(seedYield(new Decimal(SEED_LIGHT_DIVISOR - 1), 0).total).toBe(0);
  });

  it('pays exactly what the first prestige is meant to pay, at the gate', () => {
    // The divisor is *derived* from the gate and FIRST_PRESTIGE_SEEDS precisely
    // so a run that ends on the gate pays a known amount and a first prestige is
    // never a trap. If this fails, the derivation was broken rather than tuned.
    expect(seedYield(new Decimal(PRESTIGE_LIGHT_REQUIREMENT), 0).total).toBe(FIRST_PRESTIGE_SEEDS);
  });

  it('is a square root: four times the Light for twice the Seeds', () => {
    expect(seedYield(new Decimal(SEED_LIGHT_DIVISOR * 4), 0).fromLight).toBe(2);
    expect(seedYield(new Decimal(SEED_LIGHT_DIVISOR * 100), 0).fromLight).toBe(10);
  });

  it('converts whole hundreds of fragments and keeps the remainder', () => {
    const paid = seedYield(new Decimal(0), 250);
    expect(paid.fromFragments).toBe(2);
    expect(paid.fragmentsRemaining).toBe(50);
    expect(paid.total).toBe(2);
  });

  it('keeps every fragment when there are not yet a hundred', () => {
    const paid = seedYield(new Decimal(0), SEED_FRAGMENTS_PER_SEED - 1);
    expect(paid.total).toBe(0);
    expect(paid.fragmentsRemaining).toBe(SEED_FRAGMENTS_PER_SEED - 1);
  });

  it('sums the two sources', () => {
    const paid = seedYield(new Decimal(SEED_LIGHT_DIVISOR * 9), 100);
    expect(paid.fromLight).toBe(3);
    expect(paid.fromFragments).toBe(1);
    expect(paid.total).toBe(4);
  });

  it('never pays for negative fragments', () => {
    const paid = seedYield(new Decimal(0), -50);
    expect(paid.total).toBe(0);
    expect(paid.fragmentsRemaining).toBe(0);
  });
});

describe('the forest', () => {
  it('is worth nothing when empty', () => {
    expect(forestMultiplier(0)).toBe(1);
    expect(forestModifiers(0)).toHaveLength(0);
  });

  it('adds one per cent per tree', () => {
    expect(forestMultiplier(1)).toBeCloseTo(1 + FOREST_PRODUCTION_BONUS, 6);
    expect(forestMultiplier(30)).toBeCloseTo(1 + FOREST_PRODUCTION_BONUS * 30, 6);
  });

  it('keeps counting past the render limit — only the drawing stops', () => {
    expect(forestMultiplier(FOREST_RENDER_LIMIT + 20)).toBeGreaterThan(
      forestMultiplier(FOREST_RENDER_LIMIT),
    );
  });

  it('publishes one modifier per resource under one source', () => {
    const modifiers = forestModifiers(3);
    expect(modifiers).toHaveLength(RESOURCE_IDS.length);
    expect(modifiers.every((m) => m.source === FOREST_SOURCE)).toBe(true);
    expect(modifiers.every((m) => m.targetKind === 'resource')).toBe(true);
  });
});

describe('summariseTree', () => {
  it('records what the hills need to draw it', () => {
    const record = summariseTree(sampleTree(), { slot: 2, rings: 4, seeds: 7 });

    expect(record.id).toBe('grove-2');
    expect(record.slot).toBe(2);
    expect(record.rings).toBe(4);
    expect(record.seeds).toBe(7);
    // Four parts grown; the trunk is not one of them.
    expect(record.parts).toBe(4);
    expect(record.height).toBeGreaterThan(0);
  });

  it('never counts the trunk as a grown part', () => {
    expect(summariseTree(TreeGraph.seedling(), { slot: 0, rings: 0, seeds: 0 }).parts).toBe(0);
  });
});

describe('captureMemory', () => {
  it('records every part but the trunk, in creation order', () => {
    const memory = captureMemory(sampleTree());

    expect(memory.rootId).toBe('trunk-0');
    expect(memory.parts).toHaveLength(4);
    expect(memory.parts.map((part) => part.type)).toEqual([
      'branch',
      'twig',
      'leafCluster',
      'rootSegment',
    ]);
  });

  it('always lists a parent before its children', () => {
    const memory = captureMemory(sampleTree());
    const seen = new Set<string>([memory.rootId]);

    for (const part of memory.parts) {
      expect(seen.has(part.parentId)).toBe(true);
      seen.add(part.id);
    }
  });

  it('filters cleanly by domain', () => {
    const memory = captureMemory(sampleTree());

    const roots = memoryParts(memory, new Set(['root']));
    expect(roots.map((part) => part.type)).toEqual(['rootSegment']);

    const canopy = memoryParts(memory, new Set(['canopy']));
    expect(canopy).toHaveLength(3);
    expect(canopy.every((part) => part.type !== 'rootSegment')).toBe(true);
  });

  it('remembers what each part was made of', () => {
    const memory = captureMemory(sampleTree());
    const root = memory.parts.find((part) => part.type === 'rootSegment');
    expect(root?.speciesId).toBe('willow');
  });
});

describe('the ceremony', () => {
  const seeds = seedYield(new Decimal(SEED_LIGHT_DIVISOR), 0);

  it('runs for exactly the six seconds the design asks for', () => {
    const ceremony = beginCeremony(100, seeds);
    expect(ceremony.endsAt - ceremony.startedAt).toBe(CEREMONY_SECONDS);
  });

  it('locks the payout in when it opens', () => {
    expect(beginCeremony(0, seeds).yield).toEqual(seeds);
  });

  it('reports a fraction across its span, clamped either side', () => {
    const ceremony = beginCeremony(10, seeds);
    expect(ceremonyFraction(ceremony, 5)).toBe(0);
    expect(ceremonyFraction(ceremony, 10)).toBe(0);
    expect(ceremonyFraction(ceremony, 10 + CEREMONY_SECONDS / 2)).toBeCloseTo(0.5, 6);
    expect(ceremonyFraction(ceremony, 10 + CEREMONY_SECONDS)).toBe(1);
    expect(ceremonyFraction(ceremony, 1000)).toBe(1);
  });
});
