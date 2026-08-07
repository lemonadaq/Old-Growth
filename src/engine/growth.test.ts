import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { GROWTH_RULE_BY_TYPE, PART_COST_GROWTH } from '../content/growth';
import {
  partCost,
  partProducer,
  partProducerId,
  partProductionDelta,
  priceGrowthOptions,
} from './growth';
import { ModifierSet } from './modifiers';
import { ResourceRegistry } from './resourceRegistry';
import { BARREN_SOIL, type SoilMap } from './soil';
import { TreeGraph, type NodePlacement } from './treeGraph';

/** A placement whose working tip sits at canonical `y` (negative = underground). */
function placementAt(y: number): NodePlacement {
  return { start: { x: 0, y: 0 }, direction: -Math.PI / 2, end: { x: 0, y } };
}

/** Soil holding one generous pocket centred on a given depth. */
function soilWithVeinAt(y: number, richness: number): SoilMap {
  return { seed: 1, veins: [{ id: 'planted', center: { x: 0, y }, radius: 0.1, richness }] };
}

describe('partCost', () => {
  it('charges the base cost for the first part of a type', () => {
    expect(partCost('branch', 0).toNumber()).toBeCloseTo(GROWTH_RULE_BY_TYPE.branch.baseCost, 9);
  });

  it('grows ×1.15 per part of that type already owned', () => {
    const base = GROWTH_RULE_BY_TYPE.leafCluster.baseCost;
    expect(partCost('leafCluster', 1).toNumber()).toBeCloseTo(base * PART_COST_GROWTH, 9);
    expect(partCost('leafCluster', 5).toNumber()).toBeCloseTo(base * PART_COST_GROWTH ** 5, 9);
  });

  it('prices each type off its own count, not a shared one', () => {
    expect(partCost('twig', 3).toNumber()).not.toBeCloseTo(partCost('branch', 3).toNumber(), 6);
  });

  it('treats a negative count as zero rather than discounting', () => {
    expect(partCost('branch', -4).toNumber()).toBeCloseTo(GROWTH_RULE_BY_TYPE.branch.baseCost, 9);
  });
});

describe('partProducer', () => {
  it('gives producing parts a node-scoped id and domain tags', () => {
    const producer = partProducer({ id: 'leafCluster-7', type: 'leafCluster' });
    expect(producer).not.toBeNull();
    expect(producer?.id).toBe(partProducerId('leafCluster-7'));
    expect(producer?.resource).toBe('light');
    expect(producer?.tags).toEqual(['canopy', 'leafCluster']);
  });

  it('returns nothing for structural parts', () => {
    expect(partProducer({ id: 'branch-1', type: 'branch' })).toBeNull();
    expect(partProducer({ id: 'trunk-0', type: 'trunk' })).toBeNull();
  });

  it('tags roots as underground and offline-safe', () => {
    expect(partProducer({ id: 'rootSegment-2', type: 'rootSegment' })?.tags).toEqual([
      'root',
      'rootSegment',
      'offline',
    ]);
  });

  it('scales a root by the depth its tip reached', () => {
    const producer = partProducer(
      { id: 'rootSegment-2', type: 'rootSegment' },
      { soil: BARREN_SOIL, placement: placementAt(-0.5) },
    );
    // 500 soil units down doubles production.
    expect(Number(producer?.baseRate)).toBeCloseTo(0.6, 9);
  });

  it('registers nothing for a root tip that found no vein', () => {
    expect(
      partProducer(
        { id: 'rootTip-3', type: 'rootTip' },
        { soil: BARREN_SOIL, placement: placementAt(-0.5) },
      ),
    ).toBeNull();
  });

  it('registers a root tip that struck ore, scaled by richness', () => {
    const producer = partProducer(
      { id: 'rootTip-3', type: 'rootTip' },
      { soil: soilWithVeinAt(-0.5, 2), placement: placementAt(-0.5) },
    );
    expect(Number(producer?.baseRate)).toBeCloseTo(0.12 * 2 * 2, 9);
  });

  it('treats a part with no known placement as sitting in barren surface soil', () => {
    expect(
      Number(partProducer({ id: 'rootSegment-2', type: 'rootSegment' })?.baseRate),
    ).toBeCloseTo(0.3, 9);
    expect(partProducer({ id: 'rootTip-3', type: 'rootTip' })).toBeNull();
  });
});

describe('partProductionDelta', () => {
  it('quotes the unmodified rate when nothing is boosting it', () => {
    const delta = partProductionDelta('leafCluster', new ModifierSet());
    expect(delta?.resource).toBe('light');
    expect(delta?.rate.toNumber()).toBeCloseTo(0.4, 9);
  });

  it('is null for a part that produces nothing', () => {
    expect(partProductionDelta('branch', new ModifierSet())).toBeNull();
  });

  it('applies modifiers that target the part’s tags', () => {
    const modifiers = new ModifierSet();
    modifiers.add({ source: 'test', type: 'mul', targetKind: 'tag', target: 'canopy', value: 2 });
    expect(partProductionDelta('leafCluster', modifiers)?.rate.toNumber()).toBeCloseTo(0.8, 9);
  });

  it('applies modifiers that target the produced resource', () => {
    const modifiers = new ModifierSet();
    modifiers.add({
      source: 'test',
      type: 'add',
      targetKind: 'resource',
      target: 'light',
      value: 0.1,
    });
    expect(partProductionDelta('leafCluster', modifiers)?.rate.toNumber()).toBeCloseTo(0.5, 9);
  });

  it('ignores modifiers aimed at a different part’s tags', () => {
    const modifiers = new ModifierSet();
    modifiers.add({ source: 'test', type: 'mul', targetKind: 'tag', target: 'root', value: 5 });
    expect(partProductionDelta('leafCluster', modifiers)?.rate.toNumber()).toBeCloseTo(0.4, 9);
  });

  it('reports no soil conditions for a part in the canopy', () => {
    const delta = partProductionDelta('leafCluster', new ModifierSet(), {
      soil: BARREN_SOIL,
      placement: placementAt(0.6),
    });
    expect(delta?.depth).toBeNull();
    expect(delta?.stratum).toBeNull();
    expect(delta?.depthMultiplier).toBe(1);
    expect(delta?.missingVein).toBe(false);
  });

  it('names the layer a root would sit in and the bonus it earns there', () => {
    const delta = partProductionDelta('rootSegment', new ModifierSet(), {
      soil: BARREN_SOIL,
      placement: placementAt(-0.5),
    });
    expect(delta?.depth).toBeCloseTo(500, 9);
    expect(delta?.stratum?.id).toBe('clay');
    expect(delta?.depthMultiplier).toBeCloseTo(2, 9);
    expect(delta?.rate.toNumber()).toBeCloseTo(0.6, 9);
  });

  it('quotes zero, and says why, for a mineral part with no vein', () => {
    const delta = partProductionDelta('rootTip', new ModifierSet(), {
      soil: BARREN_SOIL,
      placement: placementAt(-0.5),
    });
    expect(delta?.rate.toNumber()).toBe(0);
    expect(delta?.missingVein).toBe(true);
    expect(delta?.vein).toBeNull();
  });

  it('stacks depth, richness and modifiers in that order', () => {
    const modifiers = new ModifierSet();
    modifiers.add({ source: 'test', type: 'mul', targetKind: 'tag', target: 'root', value: 3 });

    const delta = partProductionDelta('rootTip', modifiers, {
      soil: soilWithVeinAt(-0.5, 2),
      placement: placementAt(-0.5),
    });
    expect(delta?.vein?.richness).toBe(2);
    expect(delta?.rate.toNumber()).toBeCloseTo(0.12 * 2 * 2 * 3, 9);
  });

  it('keeps a zero rate at zero even under an additive modifier', () => {
    const modifiers = new ModifierSet();
    modifiers.add({
      source: 'test',
      type: 'add',
      targetKind: 'resource',
      target: 'minerals',
      value: 5,
    });

    const delta = partProductionDelta('rootTip', modifiers, {
      soil: BARREN_SOIL,
      placement: placementAt(-0.5),
    });
    expect(delta?.rate.toNumber()).toBe(0);
  });
});

describe('priceGrowthOptions', () => {
  function setup(sap: number) {
    const graph = TreeGraph.seedling();
    const resources = new ResourceRegistry();
    resources.add('sap', new Decimal(sap));
    return { graph, resources, modifiers: new ModifierSet() };
  }

  it('prices every option the graph offers', () => {
    const { graph, resources, modifiers } = setup(1000);
    const priced = priceGrowthOptions(graph, graph.rootId, resources, modifiers);
    expect(priced.map((p) => p.option.type)).toEqual([
      ...GROWTH_RULE_BY_TYPE.trunk.allowedChildren,
    ]);
  });

  it('marks affordable options and leaves nothing owing', () => {
    const { graph, resources, modifiers } = setup(1000);
    const [branch] = priceGrowthOptions(graph, graph.rootId, resources, modifiers);
    expect(branch.affordable).toBe(true);
    expect(branch.missing.toNumber()).toBe(0);
  });

  it('reports the exact shortfall rather than hiding what cannot be bought', () => {
    const { graph, resources, modifiers } = setup(4);
    const [branch] = priceGrowthOptions(graph, graph.rootId, resources, modifiers);
    expect(branch.affordable).toBe(false);
    expect(branch.missing.toNumber()).toBeCloseTo(GROWTH_RULE_BY_TYPE.branch.baseCost - 4, 9);
  });

  it('treats exactly enough as affordable', () => {
    const { graph, resources, modifiers } = setup(GROWTH_RULE_BY_TYPE.branch.baseCost);
    const [branch] = priceGrowthOptions(graph, graph.rootId, resources, modifiers);
    expect(branch.affordable).toBe(true);
  });

  it('reprices as the tree accumulates parts of that type', () => {
    const { graph, resources, modifiers } = setup(1e6);
    const first = priceGrowthOptions(graph, graph.rootId, resources, modifiers)[0].cost;
    graph.grow(graph.rootId, 'branch');
    const second = priceGrowthOptions(graph, graph.rootId, resources, modifiers)[0].cost;
    expect(second.toNumber()).toBeCloseTo(first.toNumber() * PART_COST_GROWTH, 9);
  });

  it('carries the production the part will add', () => {
    const graph = TreeGraph.seedling();
    const branch = graph.grow(graph.rootId, 'branch');
    const resources = new ResourceRegistry();
    resources.add('sap', new Decimal(1e6));

    const priced = priceGrowthOptions(graph, branch?.id ?? '', resources, new ModifierSet());
    const leaf = priced.find((p) => p.option.type === 'leafCluster');
    expect(leaf?.production?.resource).toBe('light');
    expect(leaf?.production?.rate.toNumber()).toBeCloseTo(0.4, 9);

    const twig = priced.find((p) => p.option.type === 'twig');
    expect(twig?.production).toBeNull();
  });

  it('places each option where it would actually land before pricing it', () => {
    const graph = TreeGraph.seedling();
    const resources = new ResourceRegistry();
    resources.add('sap', new Decimal(1e6));

    const priced = priceGrowthOptions(
      graph,
      graph.rootId,
      resources,
      new ModifierSet(),
      BARREN_SOIL,
    );
    const root = priced.find((p) => p.option.type === 'rootSegment');

    // The root leaves the trunk base heading down, so it is quoted underground
    // and already earning its depth bonus.
    expect(root?.production?.depth).toBeGreaterThan(0);
    expect(root?.production?.rate.toNumber()).toBeGreaterThan(0.3);
  });

  it('returns nothing for a node with no valid options', () => {
    const graph = TreeGraph.seedling();
    const branch = graph.grow(graph.rootId, 'branch');
    const leaf = graph.grow(branch?.id ?? '', 'leafCluster');
    const priced = priceGrowthOptions(
      graph,
      leaf?.id ?? '',
      new ResourceRegistry(),
      new ModifierSet(),
    );
    expect(priced).toEqual([]);
  });
});
