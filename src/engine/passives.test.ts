import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  CLICK_STAT_TAGS,
  PASSIVE_BRANCHES,
  PASSIVE_NODES,
  PASSIVE_NODE_BY_ID,
  PASSIVE_START_ID,
  passiveCurrency,
  passiveNodeId,
} from '../content/passives';
import { CANOPY_TAG } from '../content/offline';
import { GROWTH_COST_TAG } from '../content/prune';
import { RESOURCE_IDS } from '../content/resources';
import { CLICK_STAT_TAG, resolveClickStats } from './clicker';
import { ModifierSet } from './modifiers';
import {
  allocationCheck,
  connectedAllocation,
  initialPassives,
  isOpen,
  normalisePassives,
  openNodes,
  passiveModifiers,
  passivePointsEarned,
  passivePointsSpent,
  passiveWallet,
  refundCheck,
} from './passives';
import { Simulation } from './simulation';

/** A wallet with `ring` and `seed` points to spend and nothing allocated. */
function wallet(ring: number, seed: number) {
  return {
    ring: { earned: ring, spent: 0, available: ring },
    seed: { earned: seed, spent: 0, available: seed },
  };
}

/** Walk out along one branch, allocating every node up to `key`. */
function walkTo(branch: string, key: string): Set<string> {
  const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k'];
  const allocated = initialPassives();
  for (const step of order) {
    allocated.add(passiveNodeId(branch, step));
    if (step === key) break;
  }
  return allocated;
}

describe('the map itself', () => {
  it('gives every node a unique id and a known branch', () => {
    const ids = new Set(PASSIVE_NODES.map((node) => node.id));
    expect(ids.size).toBe(PASSIVE_NODES.length);

    const branches = new Set(PASSIVE_BRANCHES.map((branch) => branch.id));
    for (const node of PASSIVE_NODES) {
      if (node.id === PASSIVE_START_ID) {
        expect(node.branch).toBeNull();
        continue;
      }
      expect(branches.has(node.branch as string)).toBe(true);
    }
  });

  it('links only to nodes that exist, and never to itself', () => {
    for (const node of PASSIVE_NODES) {
      for (const other of node.links) {
        expect(PASSIVE_NODE_BY_ID[other], `${node.id} → ${other}`).toBeDefined();
        expect(other).not.toBe(node.id);
      }
    }
  });

  it('can reach every node from the heartwood', () => {
    // The one property the whole design rests on: a node no route reaches is a
    // node nobody can ever take, and nothing else in the game would say so.
    const everything = new Set(PASSIVE_NODES.map((node) => node.id));
    const reached = connectedAllocation(everything);
    expect(reached.size).toBe(PASSIVE_NODES.length);
  });

  it('pays minors and notables from rings, and keystones from seeds', () => {
    expect(passiveCurrency('start')).toBeNull();
    expect(passiveCurrency('minor')).toBe('ring');
    expect(passiveCurrency('notable')).toBe('ring');
    expect(passiveCurrency('keystone')).toBe('seed');
  });

  it('gives every branch exactly one keystone', () => {
    for (const branch of PASSIVE_BRANCHES) {
      const keystones = PASSIVE_NODES.filter(
        (node) => node.branch === branch.id && node.kind === 'keystone',
      );
      expect(keystones, branch.id).toHaveLength(1);
    }
  });

  it('mirrors the engine click-stat tags exactly', () => {
    // The content table may not import the engine, so the tags are written out
    // twice. This is the seam where that stops being safe, and it is the reason
    // a node granting `+1 Sap per tap` cannot silently target nothing.
    expect(CLICK_STAT_TAGS).toEqual(CLICK_STAT_TAG);
  });

  it('only targets modifiers the engine actually reads', () => {
    // Sap from a tap, Leaf Litter from a pile and Deadwood from a cut are all
    // credited directly rather than through a producer, so a resource-targeted
    // modifier on them would be a node that does nothing at all. The three
    // below are the ones with producers behind them.
    const producerResources = new Set(['light', 'water', 'minerals']);
    const knownTags = new Set<string>([
      ...Object.values(CLICK_STAT_TAG),
      CANOPY_TAG,
      GROWTH_COST_TAG,
      'offline',
    ]);

    for (const node of PASSIVE_NODES) {
      for (const effect of node.effects) {
        if (effect.kind !== 'modifier') continue;
        if (effect.targetKind === 'resource') {
          expect(producerResources.has(effect.target), `${node.id} → ${effect.target}`).toBe(true);
        } else {
          expect(knownTags.has(effect.target), `${node.id} → ${effect.target}`).toBe(true);
        }
      }
    }
  });
});

describe('points', () => {
  it('counts one for the sapling, one per ring and one per badge', () => {
    expect(passivePointsEarned(0, 0, new Decimal(0)).ring).toBe(1);
    expect(passivePointsEarned(3, 0, new Decimal(0)).ring).toBe(4);
    expect(passivePointsEarned(3, 5, new Decimal(0)).ring).toBe(9);
  });

  it('counts one seed point per Seed ever earned, rounded down', () => {
    expect(passivePointsEarned(0, 0, new Decimal(6.66)).seed).toBe(6);
    expect(passivePointsEarned(0, 0, new Decimal(0.9)).seed).toBe(0);
  });

  it('never goes negative on nonsense input', () => {
    const points = passivePointsEarned(-4, -2, new Decimal(-10));
    expect(points.ring).toBe(1);
    expect(points.seed).toBe(0);
  });

  it('charges one point per allocated node and nothing for the heartwood', () => {
    expect(passivePointsSpent(initialPassives())).toEqual({ ring: 0, seed: 0 });

    const toKeystone = walkTo('canopy', 'k');
    // Nine ring nodes on the way out, then the keystone from the other pool.
    expect(passivePointsSpent(toKeystone)).toEqual({ ring: 9, seed: 1 });
  });

  it('reports earned against spent', () => {
    const allocated = walkTo('bark', 'c');
    const pools = passiveWallet(allocated, 4, 2, new Decimal(3));
    expect(pools.ring).toEqual({ earned: 7, spent: 3, available: 4 });
    expect(pools.seed).toEqual({ earned: 3, spent: 0, available: 3 });
  });
});

describe('allocation', () => {
  it('opens only what something allocated touches', () => {
    const allocated = initialPassives();
    expect(isOpen(passiveNodeId('canopy', 'a'), allocated)).toBe(true);
    expect(isOpen(passiveNodeId('canopy', 'c'), allocated)).toBe(false);

    const open = openNodes(allocated);
    // Two first nodes per branch, and nothing else, from a bare heartwood.
    expect(open).toHaveLength(PASSIVE_BRANCHES.length * 2);
  });

  it('refuses a node nothing reaches', () => {
    const check = allocationCheck(passiveNodeId('roots', 'h'), initialPassives(), wallet(9, 9));
    expect(check).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('refuses a node already taken, and one that does not exist', () => {
    const allocated = walkTo('bark', 'a');
    expect(allocationCheck(passiveNodeId('bark', 'a'), allocated, wallet(9, 9))).toEqual({
      ok: false,
      reason: 'taken',
    });
    expect(allocationCheck('nonsense', allocated, wallet(9, 9))).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('refuses a node whose own pool is empty, even with the other pool full', () => {
    const toLast = walkTo('season', 'i');
    const keystone = passiveNodeId('season', 'k');

    // Rings to burn, no Seeds: the keystone is out of reach anyway.
    expect(allocationCheck(keystone, toLast, wallet(50, 0))).toEqual({
      ok: false,
      reason: 'points',
    });
    expect(allocationCheck(keystone, toLast, wallet(0, 1)).ok).toBe(true);
  });

  it('lets a route run around the rim rather than back through the centre', () => {
    // Each branch's `g` reaches the next branch's `f`. Without that link the
    // map is six separate lines and every build is the same shape.
    const allocated = walkTo('canopy', 'g');
    const neighbourBranch = PASSIVE_BRANCHES[1].id;
    expect(allocationCheck(passiveNodeId(neighbourBranch, 'f'), allocated, wallet(1, 0)).ok).toBe(
      true,
    );
  });
});

describe('refund', () => {
  it('refuses the heartwood, an unknown node, and one never taken', () => {
    const allocated = walkTo('roots', 'b');
    expect(refundCheck(PASSIVE_START_ID, allocated)).toEqual({ ok: false, reason: 'start' });
    expect(refundCheck('nonsense', allocated)).toEqual({ ok: false, reason: 'unknown' });
    expect(refundCheck(passiveNodeId('roots', 'h'), allocated)).toEqual({
      ok: false,
      reason: 'taken',
    });
  });

  it('allows the end of a path and refuses its middle', () => {
    const allocated = walkTo('roots', 'd');
    expect(refundCheck(passiveNodeId('roots', 'd'), allocated).ok).toBe(true);
    // `c` carries `d`: giving it back would leave `d` paid for and unreachable.
    expect(refundCheck(passiveNodeId('roots', 'c'), allocated)).toEqual({
      ok: false,
      reason: 'stranded',
    });
  });

  it('allows the middle of a path once a second route reaches around it', () => {
    // `canopy:g` hangs off `canopy:e`, so on its own branch `e` is load-bearing.
    const oneBranch = walkTo('canopy', 'g');
    expect(refundCheck(passiveNodeId('canopy', 'e'), oneBranch)).toEqual({
      ok: false,
      reason: 'stranded',
    });

    // Take the neighbouring branch out to its own rim node and `canopy:g` is
    // reachable the other way round — so `e` becomes refundable without
    // anything being stranded. This is the whole reason the rim links exist:
    // a build can be re-routed rather than only unwound.
    const bothBranches = new Set(oneBranch);
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      bothBranches.add(passiveNodeId(PASSIVE_BRANCHES[1].id, key));
    }
    expect(refundCheck(passiveNodeId('canopy', 'e'), bothBranches).ok).toBe(true);
  });
});

describe('modifiers', () => {
  it('grants nothing for a bare heartwood', () => {
    expect(passiveModifiers(initialPassives())).toHaveLength(0);
  });

  it('moves the click stats a node claims to move', () => {
    const allocated = initialPassives();
    allocated.add(passiveNodeId('bark', 'a')); // +1 Sap per tap
    allocated.add(passiveNodeId('bark', 'b')); // +1 Sap per tap

    const modifiers = new ModifierSet();
    for (const modifier of passiveModifiers(allocated)) modifiers.add(modifier);

    const base = resolveClickStats(new ModifierSet());
    const withNodes = resolveClickStats(modifiers);
    expect(withNodes.clickPower.sub(base.clickPower).toNumber()).toBeCloseTo(2);
  });

  it('expands allProduction into one multiplier per resource', () => {
    const allocated = initialPassives();
    allocated.add(passiveNodeId('heart', 'a')); // +4% to everything

    const modifiers = passiveModifiers(allocated);
    expect(modifiers).toHaveLength(RESOURCE_IDS.length);
    for (const resource of RESOURCE_IDS) {
      const mod = modifiers.find((m) => m.target === resource);
      expect(mod?.type).toBe('mul');
      expect(new Decimal(mod?.value ?? 0).toNumber()).toBeCloseTo(1.04);
    }
  });

  it('lets a keystone take something away', () => {
    const allocated = walkTo('bark', 'k');
    const modifiers = new ModifierSet();
    for (const modifier of passiveModifiers(allocated)) modifiers.add(modifier);

    // Splitbark: four times the tap, and the combo meter never fills again.
    const stats = resolveClickStats(modifiers);
    expect(stats.comboCap).toBe(1);
    expect(stats.clickPower.toNumber()).toBeGreaterThan(
      resolveClickStats(new ModifierSet()).clickPower.toNumber(),
    );
  });
});

describe('loading a save', () => {
  it('always puts the heartwood back', () => {
    expect(normalisePassives([]).has(PASSIVE_START_ID)).toBe(true);
  });

  it('drops ids the table no longer has', () => {
    const allocated = normalisePassives(['nonsense', passiveNodeId('canopy', 'a')]);
    expect(allocated.has('nonsense')).toBe(false);
    expect(allocated.has(passiveNodeId('canopy', 'a'))).toBe(true);
  });
});

describe('through the simulation', () => {
  /** A simulation with points to spend, without playing a whole year. */
  function funded(rings = 6): Simulation {
    const sim = new Simulation();
    sim.state.rings = rings;
    return sim;
  }

  it('takes a node, publishes its modifier, and charges a point', () => {
    const sim = funded();
    const before = sim.passiveWallet().ring.available;

    expect(sim.allocatePassive(passiveNodeId('bark', 'a'))).toBe(true);
    expect(sim.passiveWallet().ring.available).toBe(before - 1);
    expect(sim.snapshot().prestige.passives.allocated.has(passiveNodeId('bark', 'a'))).toBe(true);
    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBeGreaterThan(1);
  });

  it('refuses a node it cannot pay for', () => {
    const sim = new Simulation(); // one point, from the sapling
    expect(sim.allocatePassive(passiveNodeId('bark', 'a'))).toBe(true);
    expect(sim.allocatePassive(passiveNodeId('bark', 'b'))).toBe(false);
  });

  it('gives a node back and stops publishing it', () => {
    const sim = funded();
    sim.allocatePassive(passiveNodeId('bark', 'a'));
    const withNode = sim.snapshot().clickStats.clickPower.toNumber();

    expect(sim.refundPassive(passiveNodeId('bark', 'a'))).toBe(true);
    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBeLessThan(withNode);
    expect(sim.passiveWallet().ring.spent).toBe(0);
  });

  it('hands the whole map back on a respec', () => {
    const sim = funded();
    for (const key of ['a', 'b', 'c']) sim.allocatePassive(passiveNodeId('canopy', key));
    expect(sim.passiveWallet().ring.spent).toBe(3);

    sim.respecPassives();
    expect(sim.passiveWallet().ring.spent).toBe(0);
    expect(sim.state.passives.size).toBe(1);
    expect(passiveModifiers(sim.state.passives)).toHaveLength(0);
  });

  it('never publishes a node twice, however often it republishes', () => {
    const sim = funded();
    sim.allocatePassive(passiveNodeId('bark', 'a'));
    const once = sim.snapshot().clickStats.clickPower.toNumber();

    sim.republishPassives();
    sim.republishPassives();
    expect(sim.snapshot().clickStats.clickPower.toNumber()).toBe(once);
  });

  it('pays a point for every badge earned', () => {
    const sim = new Simulation();
    const before = sim.passiveWallet().ring.earned;
    sim.state.achievements.add('firstTap');
    expect(sim.passiveWallet().ring.earned).toBe(before + 1);
  });
});
