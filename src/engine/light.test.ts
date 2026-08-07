import { describe, expect, it } from 'vitest';
import {
  BLOSSOM_BOOST,
  BLOSSOM_BOOST_MAX_STACKS,
  BLOSSOM_BOOST_RANGE_CANONICAL,
  EXPOSURE_MIN,
  MOONLIGHT_FRACTION,
  OCCLUSION_RANGE_CANONICAL,
  SHADE_PER_OCCLUDER,
} from '../content/light';
import { SUNLIT_FRACTION } from '../content/daylight';
import type { Vec2 } from './geometry';
import {
  MAX_COUNTED_OCCLUDERS,
  blossomBoost,
  canopyIndex,
  computeLeafExposures,
  DAYLIGHT_SOURCE,
  daylightModifiers,
  exposureAt,
  lightFactorAt,
  occludes,
  shadeFactor,
  type CanopyIndex,
} from './light';
import { TreeGraph } from './treeGraph';

/** A canopy built straight from positions, no tree required. */
function canopy(
  leaves: readonly (Vec2 & { id: string })[],
  blossoms: readonly Vec2[] = [],
): CanopyIndex {
  return {
    leaves: leaves.map(({ id, x, y }) => ({ id, point: { x, y } })),
    blossoms: blossoms.map((point) => ({ ...point })),
  };
}

const ORIGIN: Vec2 = { x: 0, y: 0 };

describe('occludes', () => {
  it('counts a leaf directly overhead', () => {
    expect(occludes(ORIGIN, { x: 0, y: OCCLUSION_RANGE_CANONICAL / 2 })).toBe(true);
  });

  it('ignores a leaf below, however close', () => {
    expect(occludes(ORIGIN, { x: 0, y: -0.001 })).toBe(false);
  });

  it('ignores a leaf at exactly the same height', () => {
    expect(occludes(ORIGIN, { x: 0.01, y: 0 })).toBe(false);
  });

  it('ignores a leaf beyond the range even when straight above', () => {
    expect(occludes(ORIGIN, { x: 0, y: OCCLUSION_RANGE_CANONICAL * 1.01 })).toBe(false);
  });

  it('counts a leaf at exactly the range', () => {
    expect(occludes(ORIGIN, { x: 0, y: OCCLUSION_RANGE_CANONICAL })).toBe(true);
  });

  it('counts a leaf just inside the cone and not one just outside it', () => {
    const dy = OCCLUSION_RANGE_CANONICAL / 2;
    // The cone is 60° wide, so it reaches tan(30°) either side at height dy.
    const edge = dy * Math.tan(Math.PI / 6);
    expect(occludes(ORIGIN, { x: edge * 0.95, y: dy })).toBe(true);
    expect(occludes(ORIGIN, { x: edge * 1.1, y: dy })).toBe(false);
  });

  it('is symmetric about the vertical', () => {
    const above = { x: 0.02, y: 0.1 };
    const mirrored = { x: -0.02, y: 0.1 };
    expect(occludes(ORIGIN, above)).toBe(occludes(ORIGIN, mirrored));
  });
});

describe('shadeFactor', () => {
  it('leaves an unshaded leaf in full sun', () => {
    expect(shadeFactor(0)).toBe(1);
  });

  it('compounds rather than subtracts', () => {
    expect(shadeFactor(1)).toBeCloseTo(1 - SHADE_PER_OCCLUDER, 10);
    expect(shadeFactor(2)).toBeCloseTo((1 - SHADE_PER_OCCLUDER) ** 2, 10);
    // A subtractive reading would already be at 0.70 here; compounding is above it.
    expect(shadeFactor(2)).toBeGreaterThan(1 - 2 * SHADE_PER_OCCLUDER);
  });

  it('never falls below the floor', () => {
    expect(shadeFactor(500)).toBe(EXPOSURE_MIN);
  });

  it('is floored by the time the scan stops counting', () => {
    expect(shadeFactor(MAX_COUNTED_OCCLUDERS)).toBe(EXPOSURE_MIN);
  });

  it('treats a negative count as no shade', () => {
    expect(shadeFactor(-3)).toBe(1);
  });
});

describe('blossomBoost', () => {
  it('is neutral with no blossoms', () => {
    expect(blossomBoost(0)).toBe(1);
  });

  it('adds its share per blossom', () => {
    expect(blossomBoost(1)).toBeCloseTo(1 + BLOSSOM_BOOST, 10);
    expect(blossomBoost(2)).toBeCloseTo(1 + 2 * BLOSSOM_BOOST, 10);
  });

  it('caps so a ring of blossoms cannot beat spreading out', () => {
    expect(blossomBoost(9)).toBeCloseTo(1 + BLOSSOM_BOOST_MAX_STACKS * BLOSSOM_BOOST, 10);
  });
});

describe('exposureAt', () => {
  it('gives a lone leaf full sun', () => {
    expect(exposureAt(ORIGIN, canopy([{ id: 'a', x: 0, y: 0 }]), 'a').exposure).toBe(1);
  });

  it('never lets a leaf shade itself', () => {
    const only = canopy([{ id: 'a', x: 0, y: 0 }]);
    expect(exposureAt(ORIGIN, only, 'a').occluders).toBe(0);
  });

  it('counts every leaf stacked above it', () => {
    const stack = canopy([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 0.05 },
      { id: 'c', x: 0, y: 0.1 },
      { id: 'd', x: 0, y: 0.15 },
    ]);
    const shaded = exposureAt(ORIGIN, stack, 'a');
    expect(shaded.occluders).toBe(3);
    expect(shaded.exposure).toBeCloseTo(shadeFactor(3), 10);
  });

  it('ignores leaves out to the side, however many', () => {
    const spread = canopy([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0.2, y: 0.05 },
      { id: 'c', x: -0.2, y: 0.05 },
    ]);
    expect(exposureAt(ORIGIN, spread, 'a').occluders).toBe(0);
  });

  it('stops counting once the floor is unreachable', () => {
    const leaves = [{ id: 'a', x: 0, y: 0 }];
    for (let i = 1; i <= MAX_COUNTED_OCCLUDERS + 20; i += 1) {
      leaves.push({ id: `o${i}`, x: 0, y: 0.001 * i });
    }
    const buried = exposureAt(ORIGIN, canopy(leaves), 'a');
    expect(buried.occluders).toBe(MAX_COUNTED_OCCLUDERS);
    expect(buried.exposure).toBe(EXPOSURE_MIN);
  });

  it('lifts a leaf above full sun for a blossom beside it', () => {
    const beside = canopy(
      [{ id: 'a', x: 0, y: 0 }],
      [{ x: BLOSSOM_BOOST_RANGE_CANONICAL / 2, y: 0 }],
    );
    const lit = exposureAt(ORIGIN, beside, 'a');
    expect(lit.blossoms).toBe(1);
    expect(lit.exposure).toBeCloseTo(1 + BLOSSOM_BOOST, 10);
  });

  it('ignores a blossom out of range', () => {
    const far = canopy(
      [{ id: 'a', x: 0, y: 0 }],
      [{ x: BLOSSOM_BOOST_RANGE_CANONICAL * 1.2, y: 0 }],
    );
    expect(exposureAt(ORIGIN, far, 'a').blossoms).toBe(0);
  });

  it('multiplies shade by boost rather than choosing between them', () => {
    const both = canopy(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 0, y: 0.05 },
      ],
      [{ x: 0.02, y: 0 }],
    );
    const leaf = exposureAt(ORIGIN, both, 'a');
    expect(leaf.exposure).toBeCloseTo(leaf.shade * leaf.boost, 10);
    expect(leaf.exposure).toBeCloseTo(shadeFactor(1) * blossomBoost(1), 10);
  });

  it('quotes a prospective leaf without excluding anything', () => {
    const existing = canopy([{ id: 'a', x: 0, y: 0.05 }]);
    expect(exposureAt(ORIGIN, existing).occluders).toBe(1);
  });

  it('gives full sun in an empty canopy', () => {
    expect(exposureAt(ORIGIN).exposure).toBe(1);
  });
});

describe('computeLeafExposures', () => {
  it('spreading a canopy out beats stacking it up', () => {
    const stacked = canopy([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 0.05 },
      { id: 'c', x: 0, y: 0.1 },
      { id: 'd', x: 0, y: 0.15 },
    ]);
    const spread = canopy([
      { id: 'a', x: -0.45, y: 0.6 },
      { id: 'b', x: -0.15, y: 0.6 },
      { id: 'c', x: 0.15, y: 0.6 },
      { id: 'd', x: 0.45, y: 0.6 },
    ]);

    const total = (index: CanopyIndex) =>
      [...computeLeafExposures(index).values()].reduce((sum, leaf) => sum + leaf.exposure, 0);

    expect(total(spread)).toBe(4);
    // Three of the four stacked leaves are shaded; only the top one is not.
    expect(total(stacked)).toBeCloseTo(
      shadeFactor(3) + shadeFactor(2) + shadeFactor(1) + shadeFactor(0),
      10,
    );
    expect(total(stacked)).toBeLessThan(total(spread) * 0.8);
  });

  it('keys its results by node id', () => {
    const exposures = computeLeafExposures(
      canopy([
        { id: 'leafCluster-3', x: 0, y: 0 },
        { id: 'leafCluster-4', x: 0.5, y: 0 },
      ]),
    );
    expect([...exposures.keys()].sort()).toEqual(['leafCluster-3', 'leafCluster-4']);
  });
});

describe('canopyIndex', () => {
  it('picks up only the foliage, at its far end', () => {
    const tree = TreeGraph.seedling();
    const branch = tree.grow(tree.rootId, 'branch');
    const leaf = tree.grow(branch?.id ?? '', 'leafCluster');
    const blossom = tree.grow(branch?.id ?? '', 'blossom');

    const index = canopyIndex(tree);
    expect(index.leaves).toHaveLength(1);
    expect(index.blossoms).toHaveLength(1);
    expect(index.leaves[0].id).toBe(leaf?.id);
    expect(index.leaves[0].point).toEqual(tree.placements().get(leaf?.id ?? '')?.end);
    expect(index.blossoms[0]).toEqual(tree.placements().get(blossom?.id ?? '')?.end);
  });

  it('is empty for a bare sapling', () => {
    expect(canopyIndex(TreeGraph.seedling()).leaves).toHaveLength(0);
  });
});

describe('lightFactorAt', () => {
  it('peaks at full strength mid-morning-to-afternoon', () => {
    expect(lightFactorAt(SUNLIT_FRACTION / 2)).toBeCloseTo(1, 10);
  });

  it('falls to the moonlight trickle after dark', () => {
    expect(lightFactorAt(0.8)).toBe(MOONLIGHT_FRACTION);
    expect(lightFactorAt(0.99)).toBe(MOONLIGHT_FRACTION);
  });

  it('never drops below the trickle, even at the exact horizon', () => {
    expect(lightFactorAt(0)).toBe(MOONLIGHT_FRACTION);
    expect(lightFactorAt(SUNLIT_FRACTION)).toBe(MOONLIGHT_FRACTION);
  });

  it('climbs from dawn toward noon', () => {
    expect(lightFactorAt(0.05)).toBeLessThan(lightFactorAt(0.15));
    expect(lightFactorAt(0.15)).toBeLessThan(lightFactorAt(SUNLIT_FRACTION / 2));
  });
});

describe('daylightModifiers', () => {
  it('multiplies the Light resource under a revocable source', () => {
    const [modifier] = daylightModifiers(0.4);
    expect(modifier.source).toBe(DAYLIGHT_SOURCE);
    expect(modifier.type).toBe('mul');
    expect(modifier.targetKind).toBe('resource');
    expect(modifier.target).toBe('light');
    expect(modifier.value).toBe(0.4);
  });

  it('touches nothing else', () => {
    expect(daylightModifiers(1)).toHaveLength(1);
  });
});
