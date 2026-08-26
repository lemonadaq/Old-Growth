import { describe, expect, it } from 'vitest';
import type { TreeNodeType } from '../content/growth';
import type { ScreenSegment } from '../engine/tree';
import {
  antAt,
  arrivalProgress,
  beeAt,
  beeCount,
  creatureUnit,
  quadraticAt,
  squirrelAt,
  symbiontScene,
  ARRIVAL_SECONDS,
  BEE_HOP_SECONDS,
  EMPTY_SCENE,
} from './symbionts';

/** A projected segment, in screen pixels (y grows downward). */
function segment(
  id: string,
  kind: TreeNodeType,
  a: [number, number],
  b: [number, number],
  width = 12,
): ScreenSegment {
  return { id, kind, depth: 0, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, width };
}

/** A trunk with a branch, a high twig, two blossoms and a root. */
const TREE: ScreenSegment[] = [
  segment('trunk-0', 'trunk', [200, 400], [200, 250], 16),
  segment('branch-1', 'branch', [200, 260], [270, 200], 9),
  segment('twig-2', 'twig', [270, 200], [300, 140], 4),
  segment('blossom-3', 'blossom', [300, 140], [310, 130], 6),
  segment('blossom-4', 'blossom', [200, 250], [180, 230], 6),
  segment('rootSegment-5', 'rootSegment', [200, 400], [230, 470], 8),
  segment('rootTip-6', 'rootTip', [230, 470], [240, 520], 3),
];

describe('symbiontScene', () => {
  it('collects the blossoms the bees will visit', () => {
    const scene = symbiontScene(TREE);
    expect(scene.blossoms).toEqual([
      { x: 310, y: 130 },
      { x: 180, y: 230 },
    ]);
  });

  it('finds the trunk and its width, which is the scale everything is drawn at', () => {
    const scene = symbiontScene(TREE);
    expect(scene.trunk).toEqual({ a: { x: 200, y: 400 }, b: { x: 200, y: 250 } });
    expect(scene.trunkWidth).toBe(16);
  });

  it('collects every root and nothing else, for the web to lace through', () => {
    const scene = symbiontScene(TREE);
    expect(scene.roots).toHaveLength(2);
    expect(scene.roots.map((root) => root.b.y)).toEqual([470, 520]);
  });

  it('perches the bird on wood, not on the highest anything', () => {
    // The blossom at y = 130 is the highest thing on the tree, and no bird
    // stands on a flower.
    expect(symbiontScene(TREE).perch?.y).toBeGreaterThan(130);
  });

  it('skips a tip that is buried in foliage', () => {
    // The twig tip (y = 140) is the highest wood, but it carries a blossom, so
    // a bird drawn there would be inside the bush. The branch tip is clear.
    expect(symbiontScene(TREE).perch).toEqual({ x: 270, y: 200 });
  });

  it('takes the highest tip anyway when every one of them is under foliage', () => {
    const smothered: ScreenSegment[] = [
      segment('trunk-0', 'trunk', [0, 300], [0, 200], 10),
      segment('leafCluster-1', 'leafCluster', [0, 200], [0, 190], 8),
    ];
    // Half-hidden in leaves still beats no bird at all.
    expect(symbiontScene(smothered).perch).toEqual({ x: 0, y: 200 });
  });

  it('falls back to the trunk tip on a bare seedling', () => {
    const scene = symbiontScene([segment('trunk-0', 'trunk', [50, 200], [50, 120])]);
    expect(scene.perch).toEqual({ x: 50, y: 120 });
  });

  it('reads an empty tree as an empty scene', () => {
    const scene = symbiontScene([]);
    expect(scene).toEqual(EMPTY_SCENE);
  });
});

describe('creatureUnit', () => {
  it('follows the trunk, so a bee stays bee-sized against the flower it visits', () => {
    expect(creatureUnit(symbiontScene(TREE))).toBe(16);
  });

  it('clamps at both ends, so no creature is a grey pixel or a limb', () => {
    const tiny = symbiontScene([segment('trunk-0', 'trunk', [0, 10], [0, 0], 0.4)]);
    const huge = symbiontScene([segment('trunk-0', 'trunk', [0, 900], [0, 0], 400)]);

    expect(creatureUnit(tiny)).toBeGreaterThanOrEqual(7);
    expect(creatureUnit(huge)).toBeLessThanOrEqual(44);
    expect(creatureUnit(EMPTY_SCENE)).toBeGreaterThan(0);
  });
});

describe('arrivalProgress', () => {
  it('plays a new creature in over its arrival window', () => {
    expect(arrivalProgress(0)).toBe(0);
    expect(arrivalProgress(ARRIVAL_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(arrivalProgress(ARRIVAL_SECONDS)).toBe(1);
    expect(arrivalProgress(999)).toBe(1);
  });

  it('treats a creature that was already here as already arrived', () => {
    expect(arrivalProgress(null)).toBe(1);
  });
});

describe('quadraticAt', () => {
  const p0 = { x: 0, y: 0 };
  const control = { x: 50, y: -100 };
  const p1 = { x: 100, y: 0 };

  it('starts at the first point and ends at the second', () => {
    expect(quadraticAt(p0, control, p1, 0)).toEqual(p0);
    expect(quadraticAt(p0, control, p1, 1)).toEqual(p1);
  });

  it('bows toward the control point in between', () => {
    const mid = quadraticAt(p0, control, p1, 0.5);
    expect(mid.x).toBeCloseTo(50, 9);
    // Halfway to the control, never all the way — that is what makes it an arc.
    expect(mid.y).toBeCloseTo(-50, 9);
  });
});

describe('beeAt', () => {
  const scene = symbiontScene(TREE);

  it('has nowhere to be with no blossoms on the tree', () => {
    expect(beeAt(symbiontScene([segment('trunk-0', 'trunk', [0, 10], [0, 0])]), 0, 3)).toBeNull();
  });

  it('flies between the actual blossoms, staying within their span', () => {
    const xs = scene.blossoms.map((b) => b.x);
    for (let i = 0; i < 20; i += 1) {
      const at = beeAt(scene, 0, i * 0.3);
      expect(at).not.toBeNull();
      // The arc bows sideways, so allow the bow; what must not happen is a bee
      // wandering off across the canvas.
      expect(at?.x).toBeGreaterThan(Math.min(...xs) - 60);
      expect(at?.x).toBeLessThan(Math.max(...xs) + 60);
    }
  });

  it('leaves from a flower at the top of each hop', () => {
    // Bee 0's clock starts at 0, so t = 0 is the moment it leaves a blossom.
    const at = beeAt(scene, 0, 0);
    const nearest = Math.min(
      ...scene.blossoms.map((b) => Math.hypot((at?.x ?? 0) - b.x, (at?.y ?? 0) - b.y)),
    );
    expect(nearest).toBeLessThan(2.5);
  });

  it('keeps two bees out of formation', () => {
    const a = beeAt(scene, 0, 1.1);
    const b = beeAt(scene, 1, 1.1);
    expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(5);
  });

  it('orbits a lone blossom rather than flying from it to itself', () => {
    const single = symbiontScene([
      segment('trunk-0', 'trunk', [200, 400], [200, 250], 16),
      segment('blossom-1', 'blossom', [200, 250], [200, 230], 6),
    ]);

    const samples = [0, 0.6, 1.2, 1.8].map((t) => beeAt(single, 0, t));
    for (const at of samples) {
      const distance = Math.hypot((at?.x ?? 0) - 200, (at?.y ?? 0) - 230);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(60);
    }
    // It actually moves around it.
    expect(samples[0]?.x).not.toBeCloseTo(samples[1]?.x ?? 0, 3);
  });

  it('moves the whole time', () => {
    const a = beeAt(scene, 0, BEE_HOP_SECONDS * 0.25);
    const b = beeAt(scene, 0, BEE_HOP_SECONDS * 0.75);
    expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(1);
  });
});

describe('beeCount', () => {
  it('sends two bees out, three once the hive is established', () => {
    expect(beeCount(1)).toBe(2);
    expect(beeCount(2)).toBe(2);
    expect(beeCount(3)).toBe(3);
    expect(beeCount(5)).toBe(3);
  });
});

describe('antAt', () => {
  it('keeps every ant on the trunk', () => {
    for (let i = 0; i < 11; i += 1) {
      for (const t of [0, 1.7, 9, 40.5]) {
        const { at } = antAt(i, 11, t);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThanOrEqual(1);
      }
    }
  });

  it('runs the road both ways, so it reads as traffic rather than a loading bar', () => {
    const directions = Array.from({ length: 6 }, (_, i) => antAt(i, 6, 2).up);
    expect(directions).toContain(true);
    expect(directions).toContain(false);
  });

  it('spaces the column out instead of bunching it', () => {
    const positions = [0, 2, 4].map((i) => antAt(i, 6, 0).at);
    expect(positions[1]).not.toBeCloseTo(positions[0], 3);
    expect(positions[2]).not.toBeCloseTo(positions[1], 3);
  });
});

describe('squirrelAt', () => {
  it('runs up and down the upper trunk without reaching either end', () => {
    for (let t = 0; t < 40; t += 0.37) {
      const at = squirrelAt(t);
      expect(at).toBeGreaterThanOrEqual(0.33);
      expect(at).toBeLessThanOrEqual(0.8);
    }
  });

  it('pauses at the turns rather than cycling at one speed', () => {
    // The run turns at t = 0 and again half a period later (≈5.7s), so the
    // quarter point is where it is moving fastest. Near a turn the position
    // barely changes over the same interval.
    const atTurn = Math.abs(squirrelAt(0.2) - squirrelAt(0));
    const midRun = Math.abs(squirrelAt(3.05) - squirrelAt(2.85));
    expect(midRun).toBeGreaterThan(atTurn * 4);
  });
});
