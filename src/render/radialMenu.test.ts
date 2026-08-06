import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { priceGrowthOptions } from '../engine/growth';
import { ModifierSet } from '../engine/modifiers';
import { ResourceRegistry } from '../engine/resourceRegistry';
import { TreeGraph } from '../engine/treeGraph';
import {
  hitTestRadialMenu,
  isMenuArmed,
  layoutRadialMenu,
  MENU_ARM_MS,
  MENU_ITEM_RADIUS_PX,
  MENU_RADIUS_PX,
  type RadialMenuState,
} from './radialMenu';

const CENTER = { x: 400, y: 300 };

/** Priced options for a node, with money to spare. */
function optionsFor(nodeId: string, graph: TreeGraph) {
  const resources = new ResourceRegistry();
  resources.add('sap', new Decimal(1e6));
  return priceGrowthOptions(graph, nodeId, resources, new ModifierSet());
}

function trunkOptions() {
  const graph = TreeGraph.seedling();
  return optionsFor(graph.rootId, graph);
}

/** Only the root-domain options a node offers, to test the downward arc. */
function rootOptions() {
  const graph = TreeGraph.seedling();
  const root = graph.grow(graph.rootId, 'rootSegment');
  return optionsFor(root?.id ?? '', graph);
}

describe('layoutRadialMenu', () => {
  it('lays out one dial per option', () => {
    const items = layoutRadialMenu(CENTER, trunkOptions());
    expect(items).toHaveLength(trunkOptions().length);
  });

  it('returns nothing for a node with no options', () => {
    expect(layoutRadialMenu(CENTER, [])).toEqual([]);
  });

  it('places every dial on the menu radius', () => {
    for (const item of layoutRadialMenu(CENTER, trunkOptions())) {
      expect(Math.hypot(item.x - CENTER.x, item.y - CENTER.y)).toBeCloseTo(MENU_RADIUS_PX, 6);
    }
  });

  it('fans canopy options above the tapped node', () => {
    // Screen y grows downward, so "above" means a smaller y.
    for (const item of layoutRadialMenu(CENTER, trunkOptions())) {
      expect(item.y).toBeLessThan(CENTER.y);
    }
  });

  it('fans root options below it, into the soil they grow into', () => {
    for (const item of layoutRadialMenu(CENTER, rootOptions())) {
      expect(item.y).toBeGreaterThan(CENTER.y);
    }
  });

  it('centres a lone option on the arc rather than off to one side', () => {
    const [only] = layoutRadialMenu(CENTER, trunkOptions().slice(0, 1));
    expect(only.x).toBeCloseTo(CENTER.x, 6);
    expect(only.y).toBeCloseTo(CENTER.y - MENU_RADIUS_PX, 6);
  });

  it('keeps the dials clear of one another', () => {
    const items = layoutRadialMenu(CENTER, trunkOptions());
    for (let i = 1; i < items.length; i += 1) {
      const gap = Math.hypot(items[i].x - items[i - 1].x, items[i].y - items[i - 1].y);
      expect(gap).toBeGreaterThan(MENU_ITEM_RADIUS_PX);
    }
  });

  it('honours a custom radius', () => {
    const [item] = layoutRadialMenu(CENTER, trunkOptions(), 40);
    expect(Math.hypot(item.x - CENTER.x, item.y - CENTER.y)).toBeCloseTo(40, 6);
  });
});

describe('hitTestRadialMenu', () => {
  const items = layoutRadialMenu(CENTER, trunkOptions());

  it('finds the dial under the cursor', () => {
    expect(hitTestRadialMenu({ x: items[0].x, y: items[0].y }, items)).toBe(0);
    expect(hitTestRadialMenu({ x: items[1].x, y: items[1].y }, items)).toBe(1);
  });

  it('accepts a press anywhere inside the dial', () => {
    const edge = { x: items[0].x + MENU_ITEM_RADIUS_PX - 1, y: items[0].y };
    expect(hitTestRadialMenu(edge, items)).toBe(0);
  });

  it('misses just outside the dial', () => {
    const outside = { x: items[0].x + MENU_ITEM_RADIUS_PX + 2, y: items[0].y };
    expect(hitTestRadialMenu(outside, items)).toBeNull();
  });

  it('misses at the anchor, so tapping the limb again is never a purchase', () => {
    expect(hitTestRadialMenu(CENTER, items)).toBeNull();
  });

  it('finds nothing in an empty menu', () => {
    expect(hitTestRadialMenu(CENTER, [])).toBeNull();
  });

  it('resolves overlapping dials to the nearer centre', () => {
    const overlapping = layoutRadialMenu(CENTER, trunkOptions(), 6);
    const index = hitTestRadialMenu({ x: overlapping[0].x, y: overlapping[0].y }, overlapping);
    expect(index).toBe(0);
  });
});

describe('arming delay', () => {
  const menu: RadialMenuState = {
    nodeId: 'trunk-0',
    center: CENTER,
    items: layoutRadialMenu(CENTER, trunkOptions()),
    openedAt: 1000,
  };

  it('is dead the instant it opens, so a tap burst cannot buy by accident', () => {
    expect(isMenuArmed(menu, 1000)).toBe(false);
    expect(isMenuArmed(menu, 1000 + MENU_ARM_MS - 1)).toBe(false);
  });

  it('goes live once the delay has passed', () => {
    expect(isMenuArmed(menu, 1000 + MENU_ARM_MS)).toBe(true);
    expect(isMenuArmed(menu, 5000)).toBe(true);
  });
});
