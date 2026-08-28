import { describe, expect, it } from 'vitest';
import {
  BEATS,
  FEATURES,
  FEATURE_BY_ID,
  HINTS,
  PRESTIGE_REVEAL_MATURITY,
  PRUNE_UNLOCK_PARTS,
  ROOT_REVEAL_SAP,
  SYMBIONT_PANEL_INTEREST,
  type Requirement,
} from '../content/progression';
import { PICKER_MIN_SPECIES } from '../content/species';
import {
  activeBeat,
  featureProgress,
  featureProgressAll,
  nextHint,
  openFeatures,
  requirementProgress,
  type ProgressionContext,
} from './progression';

/** A run that has done nothing at all. Every test starts here and moves one dial. */
function fresh(overrides: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    lifetime: () => 0,
    parts: 0,
    partsOfType: () => 0,
    speciesAvailable: 1,
    speciesOnTree: 1,
    symbiontInterest: 0,
    maturity: 0,
    forest: 0,
    ...overrides,
  };
}

/** A run with one resource's lifetime set. */
function withSap(amount: number, overrides: Partial<ProgressionContext> = {}) {
  return fresh({ lifetime: (resource) => (resource === 'sap' ? amount : 0), ...overrides });
}

describe('requirementProgress', () => {
  it('measures a lifetime total against its target', () => {
    expect(
      requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, withSap(0)),
    ).toEqual({ met: false, fraction: 0 });
    expect(
      requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, withSap(25)),
    ).toEqual({ met: false, fraction: 0.25 });
    expect(
      requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, withSap(100)),
    ).toEqual({ met: true, fraction: 1 });
  });

  it('reads the resource it was asked about and not another', () => {
    const ctx = fresh({ lifetime: (resource) => (resource === 'light' ? 500 : 0) });
    expect(requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, ctx).met).toBe(
      false,
    );
  });

  it('never reports more than fully done', () => {
    expect(
      requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, withSap(1e9))
        .fraction,
    ).toBe(1);
  });

  it('copes with a lifetime past the range of a double', () => {
    // `Decimal.toNumber()` hands back `Infinity` once the magnitude runs off the
    // end of a float, which is exactly what a late-game Sap total does.
    const ctx = fresh({ lifetime: () => Infinity });
    expect(requirementProgress({ kind: 'lifetime', resource: 'sap', amount: 100 }, ctx)).toEqual({
      met: true,
      fraction: 1,
    });
  });

  it('counts parts, parts of a type, species and the forest', () => {
    expect(requirementProgress({ kind: 'parts', count: 8 }, fresh({ parts: 4 })).fraction).toBe(
      0.5,
    );
    expect(
      requirementProgress(
        { kind: 'partsOfType', type: 'leafCluster', count: 1 },
        fresh({ partsOfType: (type) => (type === 'leafCluster' ? 1 : 0) }),
      ).met,
    ).toBe(true);
    expect(
      requirementProgress({ kind: 'speciesAvailable', count: 2 }, fresh({ speciesAvailable: 2 }))
        .met,
    ).toBe(true);
    expect(
      requirementProgress({ kind: 'speciesOnTree', count: 2 }, fresh({ speciesOnTree: 1 })).met,
    ).toBe(false);
    expect(requirementProgress({ kind: 'forest', count: 1 }, fresh({ forest: 3 })).met).toBe(true);
  });

  it('measures fractions — interest and maturity — against a fraction', () => {
    expect(
      requirementProgress(
        { kind: 'symbiontInterest', fraction: 0.5 },
        fresh({ symbiontInterest: 0.25 }),
      ),
    ).toEqual({ met: false, fraction: 0.5 });
    expect(
      requirementProgress({ kind: 'maturity', fraction: 0.75 }, fresh({ maturity: 0.75 })).met,
    ).toBe(true);
  });

  it('is always met by `always`', () => {
    expect(requirementProgress({ kind: 'always' }, fresh())).toEqual({ met: true, fraction: 1 });
  });

  it('takes the best of an `any`, never the sum', () => {
    const either: Requirement = {
      kind: 'any',
      of: [
        { kind: 'maturity', fraction: 1 },
        { kind: 'forest', count: 4 },
      ],
    };
    // Half-way down two different roads is half-way, not all the way.
    const half = requirementProgress(either, fresh({ maturity: 0.5, forest: 2 }));
    expect(half).toEqual({ met: false, fraction: 0.5 });
    expect(requirementProgress(either, fresh({ forest: 4 })).met).toBe(true);
  });
});

describe('the gating table', () => {
  it('opens nothing but the seasons on a brand-new tree', () => {
    expect(openFeatures(fresh())).toEqual(['seasons']);
  });

  it('opens the ground at the lifetime Sap the table names', () => {
    expect(openFeatures(withSap(ROOT_REVEAL_SAP - 1))).not.toContain('roots');
    expect(openFeatures(withSap(ROOT_REVEAL_SAP))).toContain('roots');
  });

  it('hands over the scissors at eight grown parts', () => {
    expect(openFeatures(fresh({ parts: PRUNE_UNLOCK_PARTS - 1 }))).not.toContain('pruning');
    expect(openFeatures(fresh({ parts: PRUNE_UNLOCK_PARTS }))).toContain('pruning');
  });

  it('shows the picker once there is a second species to pick', () => {
    expect(openFeatures(fresh({ speciesAvailable: PICKER_MIN_SPECIES - 1 }))).not.toContain(
      'speciesPicker',
    );
    expect(openFeatures(fresh({ speciesAvailable: PICKER_MIN_SPECIES }))).toContain(
      'speciesPicker',
    );
  });

  it('hands over the knife once two species stand on the tree', () => {
    // Available is not the same as owned: grafting needs two woods actually
    // growing, because that is what a graft joins.
    expect(openFeatures(fresh({ speciesAvailable: 6, speciesOnTree: 1 }))).not.toContain(
      'grafting',
    );
    expect(openFeatures(fresh({ speciesOnTree: 2 }))).toContain('grafting');
  });

  it('opens the Symbionts panel half-way through courting something', () => {
    expect(openFeatures(fresh({ symbiontInterest: SYMBIONT_PANEL_INTEREST - 0.01 }))).not.toContain(
      'symbionts',
    );
    expect(openFeatures(fresh({ symbiontInterest: SYMBIONT_PANEL_INTEREST }))).toContain(
      'symbionts',
    );
  });

  it('shows the Vault at three quarters grown, before it can be used', () => {
    expect(openFeatures(fresh({ maturity: PRESTIGE_REVEAL_MATURITY - 0.01 }))).not.toContain(
      'prestige',
    );
    expect(openFeatures(fresh({ maturity: PRESTIGE_REVEAL_MATURITY }))).toContain('prestige');
  });

  it('keeps the Vault open for anyone who has already seeded a tree', () => {
    // The Vault is also where Seeds are spent. Hiding it from a player holding
    // Seeds would hide the point of having earned them.
    expect(openFeatures(fresh({ maturity: 0, forest: 1 }))).toContain('prestige');
  });

  it('names what is still needed, and stops naming it once it is not', () => {
    const shut = featureProgress(FEATURE_BY_ID.pruning, fresh({ parts: 4 }));
    expect(shut.unlocked).toBe(false);
    expect(shut.hint).toBe(FEATURE_BY_ID.pruning.locked);
    expect(shut.fraction).toBeCloseTo(0.5, 6);

    const open = featureProgress(FEATURE_BY_ID.pruning, fresh({ parts: PRUNE_UNLOCK_PARTS }));
    expect(open.unlocked).toBe(true);
    expect(open.hint).toBe('');
  });

  it('measures every row in the table, in table order', () => {
    const measured = featureProgressAll(fresh());
    expect(measured.map((gate) => gate.id)).toEqual(FEATURES.map((def) => def.id));
  });

  it('gives every shut gate a line to show while it is shut', () => {
    for (const def of FEATURES) {
      if (def.requirement.kind === 'always') continue;
      expect(def.locked.length).toBeGreaterThan(0);
    }
  });
});

describe('the opening beats', () => {
  it('asks for a first tap on an untouched tree', () => {
    expect(activeBeat(fresh())?.id).toBe('firstTap');
  });

  it('points at the trunk once there is Sap to spend', () => {
    expect(activeBeat(withSap(20))?.id).toBe('firstBranch');
  });

  it('goes quiet the moment something has been grown', () => {
    expect(activeBeat(withSap(200, { parts: 1 }))).toBeNull();
  });

  it('never asks for a first tap on a tree that already has limbs', () => {
    // A run started with an heirloom limb has plainly worked out how to tap.
    expect(activeBeat(fresh({ parts: 1 }))).toBeNull();
  });

  it('shows one beat at a time, never two', () => {
    for (const sap of [0, 5, 10, 40, 150]) {
      const live = BEATS.filter(
        (def) =>
          requirementProgress(def.from, withSap(sap)).met &&
          !requirementProgress(def.until, withSap(sap)).met,
      );
      expect(live.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('the contextual hints', () => {
  const leafy = fresh({ partsOfType: (type) => (type === 'leafCluster' ? 1 : 0) });

  it('says nothing until something has happened', () => {
    expect(nextHint(fresh(), new Set())).toBeNull();
  });

  it('explains Light after the first leaf', () => {
    expect(nextHint(leafy, new Set())?.id).toBe('light');
  });

  it('never repeats one that has been seen', () => {
    expect(nextHint(leafy, new Set(['light']))).toBeNull();
  });

  it('queues rather than stacks when several land at once', () => {
    const busy = fresh({
      partsOfType: (type) => (type === 'leafCluster' ? 1 : 0),
      parts: PRUNE_UNLOCK_PARTS,
      symbiontInterest: 1,
    });
    expect(nextHint(busy, new Set())?.id).toBe('light');
    expect(nextHint(busy, new Set(['light']))?.id).toBe('symbionts');
    expect(nextHint(busy, new Set(['light', 'symbionts']))?.id).toBe('pruning');
  });

  it('runs out once every one of them has been read', () => {
    const everything = fresh({
      lifetime: () => 1e9,
      parts: 100,
      partsOfType: () => 10,
      speciesAvailable: 6,
      speciesOnTree: 3,
      symbiontInterest: 1,
      maturity: 1,
      forest: 2,
    });
    expect(nextHint(everything, new Set(HINTS.map((def) => def.id)))).toBeNull();
  });

  it('has a unique id per hint, since the id is what is remembered', () => {
    expect(new Set(HINTS.map((def) => def.id)).size).toBe(HINTS.length);
  });
});
