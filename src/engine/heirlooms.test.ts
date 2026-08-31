import { describe, expect, it } from 'vitest';
import {
  BASE_OFFLINE_CAP_HOURS,
  HEIRLOOMS,
  HEIRLOOM_BRANCHES,
  HEIRLOOM_BY_ID,
  heirloomPrerequisite,
} from '../content/prestige';
import { RESOURCE_IDS } from '../content/resources';
import {
  bondLevel,
  heirloomCost,
  heirloomModifiers,
  isHeirloomMaxed,
  isHeirloomUnlocked,
  memoryDomains,
  offlineCapHours,
  seasonLengthFactor,
  startingParts,
  startingResources,
  HeirloomLedger,
  HEIRLOOM_SOURCE,
} from './heirlooms';

/** A ledger with the named heirlooms owned at the given levels. */
function owning(levels: Readonly<Record<string, number>>): HeirloomLedger {
  const ledger = new HeirloomLedger();
  for (const [id, level] of Object.entries(levels)) ledger.setLevel(id, level);
  return ledger;
}

describe('the catalogue', () => {
  it('is the twenty nodes in four branches the design asks for', () => {
    expect(HEIRLOOM_BRANCHES).toHaveLength(4);
    expect(HEIRLOOMS).toHaveLength(20);
  });

  it('has no duplicate ids', () => {
    expect(new Set(HEIRLOOMS.map((def) => def.id)).size).toBe(HEIRLOOMS.length);
  });

  it('caps every track — the Vault is a map, not a sink', () => {
    expect(HEIRLOOMS.every((def) => def.maxLevel >= 1)).toBe(true);
  });

  it('prices every node in whole Seeds', () => {
    expect(HEIRLOOMS.every((def) => def.baseCost >= 1)).toBe(true);
  });

  it('chains each branch: only the first node of each opens on its own', () => {
    for (const branch of HEIRLOOM_BRANCHES) {
      expect(heirloomPrerequisite(branch.nodes[0].id)).toBeNull();
      for (let i = 1; i < branch.nodes.length; i += 1) {
        expect(heirloomPrerequisite(branch.nodes[i].id)).toBe(branch.nodes[i - 1].id);
      }
    }
  });

  it('opens the first prestige on something affordable', () => {
    // One Seed is what a first prestige pays. A Vault whose cheapest node cost
    // more would leave the player with a currency and nothing to spend it on.
    expect(Math.min(...HEIRLOOMS.map((def) => def.baseCost))).toBeLessThanOrEqual(1);
  });
});

describe('HeirloomLedger', () => {
  it('starts at zero for everything', () => {
    expect(new HeirloomLedger().level('seedcase')).toBe(0);
  });

  it('floors and clamps what it is given', () => {
    const ledger = owning({ seedcase: -3 });
    expect(ledger.level('seedcase')).toBe(0);
    ledger.setLevel('seedcase', 2.8);
    expect(ledger.level('seedcase')).toBe(2);
  });

  it('lists only what is owned', () => {
    const ledger = owning({ seedcase: 2, vigour: 0 });
    expect(ledger.entries()).toEqual([['seedcase', 2]]);
    expect(ledger.spent).toBe(2);
  });
});

describe('heirloomCost', () => {
  it('starts at the base price', () => {
    const def = HEIRLOOM_BY_ID.seedcase;
    expect(heirloomCost(def, 0).toNumber()).toBeCloseTo(def.baseCost, 6);
  });

  it('compounds with each level owned', () => {
    const def = HEIRLOOM_BY_ID.seedcase;
    expect(heirloomCost(def, 2).toNumber()).toBeCloseTo(def.baseCost * def.costGrowth ** 2, 6);
  });

  it('stays flat for a one-level node', () => {
    const def = HEIRLOOM_BY_ID.rootMap;
    expect(heirloomCost(def, 0).toNumber()).toBeCloseTo(def.baseCost, 6);
  });
});

describe('gating', () => {
  it('maxes a track at its cap', () => {
    const def = HEIRLOOM_BY_ID.rootMap;
    expect(isHeirloomMaxed(def, 0)).toBe(false);
    expect(isHeirloomMaxed(def, 1)).toBe(true);
  });

  it('opens the first node of a branch immediately', () => {
    expect(isHeirloomUnlocked('seedcase', new HeirloomLedger())).toBe(true);
  });

  it('keeps a later node shut until the one before it is owned', () => {
    expect(isHeirloomUnlocked('firstLimb', new HeirloomLedger())).toBe(false);
    expect(isHeirloomUnlocked('firstLimb', owning({ seedcase: 1 }))).toBe(true);
  });
});

describe('heirloomModifiers', () => {
  it('grants nothing when nothing is owned', () => {
    expect(heirloomModifiers(new HeirloomLedger())).toHaveLength(0);
  });

  it('publishes everything under one revocable source', () => {
    const modifiers = heirloomModifiers(owning({ seedcase: 1, firstLimb: 1, vigour: 2 }));
    expect(modifiers.length).toBeGreaterThan(0);
    expect(modifiers.every((m) => m.source === HEIRLOOM_SOURCE)).toBe(true);
  });

  it('compounds a multiplicative effect with its level', () => {
    const one = heirloomModifiers(owning({ vigour: 1 })).find((m) => m.target === 'click.power');
    const three = heirloomModifiers(owning({ vigour: 3 })).find((m) => m.target === 'click.power');

    expect(Number(one?.value)).toBeCloseTo(1.12, 6);
    expect(Number(three?.value)).toBeCloseTo(1.12 ** 3, 6);
  });

  it('scales an additive effect linearly with its level', () => {
    const combo = heirloomModifiers(owning({ metronome: 2 })).find((m) => m.target === 'combo.cap');
    expect(combo?.type).toBe('add');
    expect(Number(combo?.value)).toBeCloseTo(30, 6);
  });

  it('expands an "all production" node to one modifier per resource', () => {
    const modifiers = heirloomModifiers(owning({ chorus: 1 }));
    expect(modifiers).toHaveLength(RESOURCE_IDS.length);
    expect(modifiers.every((m) => m.targetKind === 'resource')).toBe(true);
  });

  it('grants nothing for a capability node — those are read at run start', () => {
    expect(heirloomModifiers(owning({ rootMap: 1 }))).toHaveLength(0);
    expect(heirloomModifiers(owning({ oldFriend: 1 }))).toHaveLength(0);
  });
});

describe('what a run opens with', () => {
  it('is nothing on a fresh Vault', () => {
    expect(startingResources(new HeirloomLedger())).toHaveLength(0);
    expect(startingParts(new HeirloomLedger())).toHaveLength(0);
  });

  it('scales a starting balance with the level', () => {
    const [sap] = startingResources(owning({ seedcase: 3 }));
    expect(sap.resource).toBe('sap');
    expect(sap.amount.toNumber()).toBe(600);
  });

  it('lists starting balances in catalogue order', () => {
    const lines = startingResources(owning({ seedcase: 1, cotyledon: 1 }));
    expect(lines.map((line) => line.resource)).toEqual(['sap', 'light']);
  });

  it('counts starting parts per type', () => {
    const parts = startingParts(owning({ firstLimb: 2, firstRoot: 1 }));
    expect(parts).toContainEqual({ type: 'branch', count: 2 });
    expect(parts).toContainEqual({ type: 'rootSegment', count: 1 });
  });
});

describe('memory, bond and tempo', () => {
  it('remembers nothing without a Memory heirloom', () => {
    expect(memoryDomains(new HeirloomLedger()).size).toBe(0);
  });

  it('takes each Memory node as owning one half of the tree outright', () => {
    expect([...memoryDomains(owning({ rootMap: 1 }))]).toEqual(['root']);
    const both = memoryDomains(owning({ rootMap: 1, canopyMap: 1 }));
    expect(both.has('root')).toBe(true);
    expect(both.has('canopy')).toBe(true);
  });

  it('reports no bond until Old Friend is bought', () => {
    expect(bondLevel(new HeirloomLedger())).toBe(0);
    // Warm Welcome on its own is worthless: there is nobody to welcome.
    expect(bondLevel(owning({ warmWelcome: 3 }))).toBe(0);
  });

  it('settles a bonded creature at level one, plus Warm Welcome', () => {
    expect(bondLevel(owning({ oldFriend: 1 }))).toBe(1);
    expect(bondLevel(owning({ oldFriend: 1, warmWelcome: 2 }))).toBe(3);
  });

  it('shortens the season by ten per cent per level of Quickening', () => {
    expect(seasonLengthFactor(new HeirloomLedger())).toBe(1);
    expect(seasonLengthFactor(owning({ quickening: 1 }))).toBeCloseTo(0.9, 6);
    expect(seasonLengthFactor(owning({ quickening: 3 }))).toBeCloseTo(0.7, 6);
  });

  it('never collapses the year, however much Tempo is bought', () => {
    expect(seasonLengthFactor(owning({ quickening: 99 }))).toBeGreaterThan(0);
  });

  it('adds four hours to the offline cap per level of Long Sleep', () => {
    expect(offlineCapHours(new HeirloomLedger())).toBe(BASE_OFFLINE_CAP_HOURS);
    expect(offlineCapHours(owning({ longSleep: 2 }))).toBe(BASE_OFFLINE_CAP_HOURS + 8);
  });
});
