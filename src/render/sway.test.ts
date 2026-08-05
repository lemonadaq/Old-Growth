import { describe, expect, it } from 'vitest';
import { buildTreeGraph } from '../engine/treeGraph';
import { DEMO_TREE } from '../content/demoTree';
import type { TreeSpec } from '../content/treeSpec';
import { SwayField, gustAt } from './sway';

const SPEC: TreeSpec = {
  species: 'oak',
  seed: 3,
  branches: [
    { id: 'trunk', parent: null, angle: 0, length: 200, width: 30 },
    { id: 'limb', parent: 'trunk', attach: 0.5, angle: 25, length: 90 },
  ],
  roots: [
    { id: 'tap', parent: null, angle: 180, length: 100, width: 20 },
    { id: 'fork', parent: 'tap', attach: 0.5, angle: 30, length: 60 },
  ],
  leaves: [{ id: 'leaf', parent: 'limb', attach: 1, radius: 28 }],
};

function nodeOf(graph: ReturnType<typeof buildTreeGraph>, id: string) {
  const node = graph.byId.get(id);
  if (!node) throw new Error(`no node "${id}"`);
  return node;
}

describe('SwayField', () => {
  it('leaves the underground perfectly still', () => {
    const graph = buildTreeGraph(SPEC);
    const sway = new SwayField();
    sway.update(graph, 4.2);

    for (const root of graph.roots) {
      expect(sway.entryFor(root)).toEqual({ base: 0, tip: 0 });
    }
  });

  it('moves the canopy', () => {
    const graph = buildTreeGraph(SPEC);
    const sway = new SwayField();

    const samples = [0, 0.7, 1.4, 2.1, 2.8].map((t) => {
      sway.update(graph, t);
      return sway.entryFor(nodeOf(graph, 'leaf')).tip;
    });

    expect(new Set(samples).size).toBeGreaterThan(1);
    expect(samples.some((v) => Math.abs(v) > 0.1)).toBe(true);
  });

  it("inherits a child's base offset from its parent at the attachment point", () => {
    const graph = buildTreeGraph(SPEC);
    const sway = new SwayField();
    sway.update(graph, 3.5);

    const trunk = sway.entryFor(nodeOf(graph, 'trunk'));
    const limb = sway.entryFor(nodeOf(graph, 'limb'));
    // attach = 0.5, and inheritance uses the same quadratic easing as drawing.
    const expected = trunk.base + (trunk.tip - trunk.base) * 0.25;

    expect(limb.base).toBeCloseTo(expected);
    // The limb adds its own oscillation on top of what it inherited.
    expect(limb.tip).not.toBeCloseTo(limb.base);
  });

  it('keeps a limb continuous with its own base offset', () => {
    const graph = buildTreeGraph(SPEC);
    const sway = new SwayField();
    sway.update(graph, 1.25);

    const limb = nodeOf(graph, 'limb');
    expect(sway.offsetAt(limb, 0)).toBeCloseTo(sway.entryFor(limb).base);
    expect(sway.offsetAt(limb, 1)).toBeCloseTo(sway.entryFor(limb).tip);
  });

  it('reports no offset for nodes outside the last update', () => {
    const graph = buildTreeGraph(SPEC);
    const other = buildTreeGraph(DEMO_TREE);
    const sway = new SwayField();
    sway.update(graph, 1);

    expect(sway.entryFor(other.leaves[0])).toEqual({ base: 0, tip: 0 });
  });

  it('is deterministic for a given time', () => {
    const graph = buildTreeGraph(DEMO_TREE);
    const a = new SwayField();
    const b = new SwayField();
    a.update(graph, 9.75);
    b.update(graph, 9.75);

    for (const node of graph.nodes) {
      expect(a.entryFor(node)).toEqual(b.entryFor(node));
    }
  });
});

describe('gustAt', () => {
  it('stays within the gust envelope', () => {
    for (let t = 0; t < 40; t += 0.37) {
      const gust = gustAt(t);
      expect(gust).toBeGreaterThanOrEqual(0.62);
      expect(gust).toBeLessThanOrEqual(1);
    }
  });
});
