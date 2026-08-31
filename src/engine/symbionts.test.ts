import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { SYMBIONT_ARRIVAL } from '../content/balance';
import type { ResourceId } from '../content/resources';
import {
  SEED_FRAGMENTS_PER_SEED,
  SONGBIRD_HEIGHT,
  SYMBIONTS,
  SYMBIONT_BY_ID,
  SYMBIONT_MAX_LEVEL,
  type SymbiontDef,
} from '../content/symbionts';
import { applyModifiers, ModifierSet } from './modifiers';
import {
  conditionProgress,
  isSymbiontMaxed,
  scaleEffectValue,
  symbiontContext,
  symbiontLevelCost,
  symbiontModifiers,
  symbiontProgressAll,
  veinReachOf,
  SymbiontLedger,
  SYMBIONT_SOURCE,
  type SymbiontContext,
} from './symbionts';
import { TreeGraph } from './treeGraph';

/** A context with nothing in it — every measurement at rock bottom. */
function emptyContext(over: Partial<SymbiontContext> = {}): SymbiontContext {
  return {
    lifetime: () => new Decimal(0),
    partsOfType: () => 0,
    partsInStratum: () => 0,
    partsOfSpecies: () => 0,
    height: 0,
    ...over,
  };
}

/** What a set of residents multiplies one resource by. */
function multiplierOn(
  living: readonly { id: string; level: number }[],
  resource: ResourceId,
): number {
  const set = new ModifierSet();
  for (const mod of symbiontModifiers(living)) set.add(mod);
  return applyModifiers(new Decimal(1), set.matching(resource, [])).toNumber();
}

/** What a set of residents adds to one click stat. */
function statFrom(living: readonly { id: string; level: number }[], tag: string): number {
  const set = new ModifierSet();
  for (const mod of symbiontModifiers(living)) set.add(mod);
  return applyModifiers(new Decimal(0), set.matchingTag(tag)).toNumber();
}

describe('the symbiont catalogue', () => {
  it('offers five creatures with distinct ids', () => {
    expect(SYMBIONTS).toHaveLength(5);
    expect(new Set(SYMBIONTS.map((s) => s.id)).size).toBe(5);
  });

  it('gives every one a track from arrival to the cap', () => {
    for (const def of SYMBIONTS) {
      expect(def.upgrades).toHaveLength(SYMBIONT_MAX_LEVEL - 1);
    }
  });

  it('prices every level in at least two resources, so no track is bought from one half of the economy', () => {
    for (const def of SYMBIONTS) {
      for (const level of def.upgrades) {
        expect(level.length).toBeGreaterThanOrEqual(2);
        expect(new Set(level.map((line) => line.resource)).size).toBe(level.length);
      }
    }
  });

  it('never asks for a resource nothing yet produces', () => {
    // Leaf Litter arrives with autumn (STEP 12) and Seeds with prestige
    // (STEP 13). A price in either would be a track that cannot be bought.
    for (const def of SYMBIONTS) {
      for (const level of def.upgrades) {
        for (const line of level) {
          expect(['leafLitter', 'seeds']).not.toContain(line.resource);
        }
      }
    }
  });

  it('makes each level dearer than the last', () => {
    for (const def of SYMBIONTS) {
      for (let i = 1; i < def.upgrades.length; i += 1) {
        const previous = def.upgrades[i - 1].reduce((sum, line) => sum + line.amount, 0);
        const next = def.upgrades[i].reduce((sum, line) => sum + line.amount, 0);
        expect(next).toBeGreaterThan(previous);
      }
    }
  });

  it('gives every one either a modifier, a reach or a clock — nothing is decorative', () => {
    for (const def of SYMBIONTS) {
      const does =
        def.effects.length > 0 || def.veinReachPerLevel !== undefined || def.cadence !== undefined;
      expect(does).toBe(true);
    }
  });

  it('makes a Seed out of a hundred fragments', () => {
    expect(SEED_FRAGMENTS_PER_SEED).toBe(100);
  });
});

describe('SymbiontLedger', () => {
  const bees = SYMBIONT_BY_ID.bees;
  const songbird = SYMBIONT_BY_ID.songbird;

  it('settles a creature in at level 1', () => {
    const ledger = new SymbiontLedger();
    const active = ledger.arrive(bees, 10);

    expect(active?.level).toBe(1);
    expect(active?.arrivedAt).toBe(10);
    expect(ledger.has('bees')).toBe(true);
    expect(ledger.level('bees')).toBe(1);
  });

  it('lets a creature arrive only once', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(bees, 0);
    expect(ledger.arrive(bees, 100)).toBeNull();
    expect(ledger.size).toBe(1);
  });

  it('reports nothing for a creature that has not arrived', () => {
    const ledger = new SymbiontLedger();
    expect(ledger.has('bees')).toBe(false);
    expect(ledger.level('bees')).toBe(0);
    expect(ledger.get('bees')).toBeNull();
  });

  it('clamps a level to the track and ignores an absent creature', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(bees, 0);

    ledger.setLevel('bees', 99);
    expect(ledger.level('bees')).toBe(SYMBIONT_MAX_LEVEL);
    ledger.setLevel('bees', -4);
    expect(ledger.level('bees')).toBe(1);

    ledger.setLevel('ants', 3);
    expect(ledger.level('ants')).toBe(0);
  });

  it('pays nothing to a creature with no clock', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(bees, 0);
    expect(ledger.claimDue(1e6)).toEqual([]);
  });

  it('pays nothing before the interval is up, and once at exactly the interval', () => {
    const interval = songbird.cadence?.intervalSeconds ?? 0;
    const ledger = new SymbiontLedger();
    ledger.arrive(songbird, 0);

    expect(ledger.claimDue(interval - 0.001)).toEqual([]);
    expect(ledger.claimDue(interval)).toEqual([{ id: 'songbird', count: 1 }]);
  });

  it('pays every whole interval a jump covers, not just one', () => {
    const interval = songbird.cadence?.intervalSeconds ?? 0;
    const ledger = new SymbiontLedger();
    ledger.arrive(songbird, 0);

    expect(ledger.claimDue(interval * 3.5)).toEqual([{ id: 'songbird', count: 3 }]);
  });

  it('advances the clock by whole intervals, so the cadence cannot drift', () => {
    const interval = songbird.cadence?.intervalSeconds ?? 0;
    const ledger = new SymbiontLedger();
    ledger.arrive(songbird, 0);

    // Claimed late: the next payout is still due on the original beat.
    ledger.claimDue(interval + 5);
    expect(ledger.get('songbird')?.nextPayoutAt).toBeCloseTo(interval * 2, 9);
  });

  it('caps a single catch-up rather than spinning on a long absence', () => {
    const interval = songbird.cadence?.intervalSeconds ?? 0;
    const ledger = new SymbiontLedger();
    ledger.arrive(songbird, 0);

    expect(ledger.claimDue(interval * 1000, 4)).toEqual([{ id: 'songbird', count: 4 }]);
  });

  it('drops everyone on clear', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(bees, 0);
    ledger.clear();
    expect(ledger.entries()).toEqual([]);
  });
});

describe('conditionProgress', () => {
  it('measures parts of a type — the bees want three blossoms', () => {
    const ctx = emptyContext({ partsOfType: () => 2 });
    const progress = conditionProgress(SYMBIONT_BY_ID.bees.condition, ctx);

    expect(progress.met).toBe(false);
    expect(progress.fraction).toBeCloseTo(2 / 3, 9);
    expect(progress.hint).toContain('blossoms');
  });

  it('is met at exactly the goal, and stays capped above it', () => {
    const at = (blossoms: number) =>
      conditionProgress(
        SYMBIONT_BY_ID.bees.condition,
        emptyContext({ partsOfType: () => blossoms }),
      );

    expect(at(3).met).toBe(true);
    expect(at(3).fraction).toBe(1);
    expect(at(30).fraction).toBe(1);
  });

  it('measures a lifetime total — the ants want five Deadwood ever', () => {
    const ctx = emptyContext({ lifetime: () => new Decimal(5) });
    expect(conditionProgress(SYMBIONT_BY_ID.ants.condition, ctx).met).toBe(true);
  });

  it('measures parts in a layer — the fungus wants a root tip in the clay', () => {
    const inRock = emptyContext({
      partsInStratum: (type, stratum) => (type === 'rootTip' && stratum === 'rock' ? 4 : 0),
    });
    const inClay = emptyContext({
      partsInStratum: (type, stratum) => (type === 'rootTip' && stratum === 'clay' ? 1 : 0),
    });

    expect(conditionProgress(SYMBIONT_BY_ID.mycorrhiza.condition, inRock).met).toBe(false);
    expect(conditionProgress(SYMBIONT_BY_ID.mycorrhiza.condition, inClay).met).toBe(true);
    expect(conditionProgress(SYMBIONT_BY_ID.mycorrhiza.condition, inRock).hint).toContain('Clay');
  });

  it('writes its hints like a person — no "1 root tips"', () => {
    const hints = SYMBIONTS.map((def) => conditionProgress(def.condition, emptyContext()).hint);
    expect(hints).toContain(`Reach ${SYMBIONT_ARRIVAL.mycorrhizaTips} root tip into the Clay.`);
    expect(hints).toContain(`Grow ${SYMBIONT_ARRIVAL.beeBlossoms} blossoms.`);
    expect(hints).toContain(`Grow ${SYMBIONT_ARRIVAL.squirrelOakBranches} branches of oak.`);
    // The rule this test is really about: no "1 root tips", ever.
    for (const hint of hints) expect(hint).not.toMatch(/\b1 \w+s\b/);
  });

  it('measures height — the bird wants somewhere to look out from', () => {
    const low = emptyContext({ height: SONGBIRD_HEIGHT / 2 });
    const high = emptyContext({ height: SONGBIRD_HEIGHT });

    expect(conditionProgress(SYMBIONT_BY_ID.songbird.condition, low).fraction).toBeCloseTo(0.5, 9);
    expect(conditionProgress(SYMBIONT_BY_ID.songbird.condition, high).met).toBe(true);
  });

  it('measures a species — the squirrel wants an oak branch, not just any branch', () => {
    const birch = emptyContext({
      partsOfSpecies: (speciesId) =>
        speciesId === 'birch' ? SYMBIONT_ARRIVAL.squirrelOakBranches : 0,
    });
    const oak = emptyContext({
      partsOfSpecies: (speciesId, type) =>
        speciesId === 'oak' && type === 'branch' ? SYMBIONT_ARRIVAL.squirrelOakBranches : 0,
    });

    expect(conditionProgress(SYMBIONT_BY_ID.squirrel.condition, birch).met).toBe(false);
    expect(conditionProgress(SYMBIONT_BY_ID.squirrel.condition, oak).met).toBe(true);
  });
});

describe('symbiontContext', () => {
  it('measures a real tree in one pass', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch', 'birch');
    tree.grow(branch?.id ?? '', 'blossom', 'birch');

    const ctx = symbiontContext(tree, () => new Decimal(0));

    expect(ctx.partsOfType('blossom')).toBe(1);
    expect(ctx.partsOfSpecies('birch', 'branch')).toBe(1);
    // The trunk is oak and there is no oak branch — which is the distinction
    // the squirrel's condition turns on.
    expect(ctx.partsOfSpecies('oak', 'branch')).toBe(0);
    expect(ctx.partsOfSpecies('oak', 'trunk')).toBe(1);
  });

  it('reports the height of the highest wood', () => {
    const bare = TreeGraph.seedling();
    const bareHeight = symbiontContext(bare, () => new Decimal(0)).height;

    const taller = TreeGraph.seedling();
    const branch = taller.grow(taller.rootId, 'branch');
    taller.grow(branch?.id ?? '', 'twig');

    expect(symbiontContext(taller, () => new Decimal(0)).height).toBeGreaterThan(bareHeight);
  });

  it('finds a root tip by the layer its tip is in', () => {
    const tree = TreeGraph.seedling();
    let parent = tree.rootId;
    for (let i = 0; i < 3; i += 1) {
      parent = tree.grow(parent, 'rootSegment')?.id ?? parent;
    }
    tree.grow(parent, 'rootTip');

    const ctx = symbiontContext(tree, () => new Decimal(0));
    const layers = (['topsoil', 'clay', 'rock', 'bedrock'] as const).map((id) =>
      ctx.partsInStratum('rootTip', id),
    );

    // Wherever it landed, it landed in exactly one layer.
    expect(layers.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(ctx.partsInStratum('rootTip', 'topsoil')).toBe(0);
  });
});

describe('scaleEffectValue', () => {
  const add = { type: 'add', targetKind: 'tag', target: 't', value: 0.03 } as const;
  const mul = { type: 'mul', targetKind: 'resource', target: 'sap', value: 1.05 } as const;

  it('scales an add linearly with the level', () => {
    expect(scaleEffectValue(add, 1).toNumber()).toBeCloseTo(0.03, 9);
    expect(scaleEffectValue(add, 4).toNumber()).toBeCloseTo(0.12, 9);
  });

  it('compounds a mul with the level', () => {
    expect(scaleEffectValue(mul, 3).toNumber()).toBeCloseTo(1.05 ** 3, 9);
  });

  it('is the identity at level 0, whichever kind it is', () => {
    expect(scaleEffectValue(add, 0).toNumber()).toBe(0);
    expect(scaleEffectValue(mul, 0).toNumber()).toBe(1);
  });
});

describe('symbiontModifiers', () => {
  it('grants nothing when the tree is empty of creatures', () => {
    expect(symbiontModifiers([])).toEqual([]);
  });

  it('publishes everything under one revocable source', () => {
    const mods = symbiontModifiers([
      { id: 'bees', level: 2 },
      { id: 'ants', level: 1 },
    ]);
    expect(new Set(mods.map((m) => m.source))).toEqual(new Set([SYMBIONT_SOURCE]));
  });

  it('gives the bees +3% crit per hive level', () => {
    expect(statFrom([{ id: 'bees', level: 1 }], 'click.critChance')).toBeCloseTo(0.03, 9);
    expect(statFrom([{ id: 'bees', level: 5 }], 'click.critChance')).toBeCloseTo(0.15, 9);
  });

  it('gives the ants +5% Sap per colony level, compounding', () => {
    expect(multiplierOn([{ id: 'ants', level: 1 }], 'sap')).toBeCloseTo(1.05, 9);
    expect(multiplierOn([{ id: 'ants', level: 3 }], 'sap')).toBeCloseTo(1.05 ** 3, 9);
  });

  it('reaches taps as well as passive Sap, since taps are all the Sap there is', () => {
    const set = new ModifierSet();
    for (const mod of symbiontModifiers([{ id: 'ants', level: 2 }])) set.add(mod);
    expect(applyModifiers(new Decimal(1), set.matchingTag('click.power')).toNumber()).toBeCloseTo(
      1.05 ** 2,
      9,
    );
  });

  it('publishes nothing for the three whose work is not a modifier', () => {
    for (const id of ['mycorrhiza', 'songbird', 'squirrel']) {
      expect(symbiontModifiers([{ id, level: 5 }])).toEqual([]);
    }
  });

  it('skips an unknown id and a level of zero rather than throwing', () => {
    expect(symbiontModifiers([{ id: 'dragon', level: 3 }])).toEqual([]);
    expect(symbiontModifiers([{ id: 'bees', level: 0 }])).toEqual([]);
  });
});

describe('veinReachOf', () => {
  it('is plain sight with no fungus in the ground', () => {
    expect(veinReachOf([])).toBe(1);
    expect(veinReachOf([{ id: 'bees', level: 5 }])).toBe(1);
  });

  it('widens by half a radius per network level', () => {
    expect(veinReachOf([{ id: 'mycorrhiza', level: 1 }])).toBeCloseTo(1.5, 9);
    expect(veinReachOf([{ id: 'mycorrhiza', level: 5 }])).toBeCloseTo(3.5, 9);
  });
});

describe('symbiontLevelCost', () => {
  const bees: SymbiontDef = SYMBIONT_BY_ID.bees;

  it('has no price before arrival', () => {
    expect(symbiontLevelCost(bees, 0)).toBeNull();
  });

  it('quotes the catalogue price of the next level', () => {
    const cost = symbiontLevelCost(bees, 1);
    expect(cost?.map((line) => line.resource)).toEqual(
      bees.upgrades[0].map((line) => line.resource),
    );
    expect(cost?.[0].amount.toNumber()).toBe(bees.upgrades[0][0].amount);
  });

  it('has no price at the top of the track', () => {
    expect(symbiontLevelCost(bees, SYMBIONT_MAX_LEVEL)).toBeNull();
    expect(isSymbiontMaxed(SYMBIONT_MAX_LEVEL)).toBe(true);
    expect(isSymbiontMaxed(SYMBIONT_MAX_LEVEL - 1)).toBe(false);
  });
});

describe('symbiontProgressAll', () => {
  it('reports every creature in catalogue order, resident or not', () => {
    const rows = symbiontProgressAll(new SymbiontLedger(), emptyContext(), 0);
    expect(rows.map((row) => row.id)).toEqual(SYMBIONTS.map((def) => def.id));
    expect(rows.every((row) => !row.active && row.level === 0)).toBe(true);
  });

  it('keeps a resident whatever the tree looks like now — arriving is not a lease', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(SYMBIONT_BY_ID.bees, 5);

    // Every blossom gone, and the bees are still here.
    const rows = symbiontProgressAll(ledger, emptyContext(), 20);
    const bees = rows.find((row) => row.id === 'bees');

    expect(bees?.active).toBe(true);
    expect(bees?.met).toBe(true);
    expect(bees?.fraction).toBe(1);
    expect(bees?.age).toBe(15);
  });

  it('counts down to a resident’s next payout, and reports none for one with no clock', () => {
    const ledger = new SymbiontLedger();
    ledger.arrive(SYMBIONT_BY_ID.songbird, 0);
    ledger.arrive(SYMBIONT_BY_ID.bees, 0);

    const rows = symbiontProgressAll(ledger, emptyContext(), 60);
    const interval = SYMBIONT_BY_ID.songbird.cadence?.intervalSeconds ?? 0;

    expect(rows.find((row) => row.id === 'songbird')?.nextPayoutIn).toBeCloseTo(interval - 60, 9);
    expect(rows.find((row) => row.id === 'bees')?.nextPayoutIn).toBeNull();
  });
});
