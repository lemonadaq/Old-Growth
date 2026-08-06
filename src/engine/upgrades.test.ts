import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { UPGRADE_BY_ID } from '../content/upgrades';
import { resolveClickStats } from './clicker';
import { Simulation } from './simulation';
import { isMaxed, UpgradeLedger, upgradeCost, upgradeModifiers, upgradeSource } from './upgrades';

const STRONGER_TAPS = UPGRADE_BY_ID.strongerTaps;
const SHARPER_INSTINCTS = UPGRADE_BY_ID.sharperInstincts;
const RHYTHM = UPGRADE_BY_ID.rhythmOfGrowth;

/** Give the simulation enough Sap to shop with. */
function withSap(amount: number): Simulation {
  const sim = new Simulation();
  sim.state.resources.add('sap', new Decimal(amount));
  return sim;
}

describe('UpgradeLedger', () => {
  it('reports zero for unowned upgrades and stores whole levels', () => {
    const ledger = new UpgradeLedger();
    expect(ledger.level('strongerTaps')).toBe(0);

    ledger.setLevel('strongerTaps', 3.7);
    expect(ledger.level('strongerTaps')).toBe(3);

    ledger.setLevel('strongerTaps', -2);
    expect(ledger.level('strongerTaps')).toBe(0);
    expect(ledger.entries()).toEqual([['strongerTaps', 0]]);
  });
});

describe('upgradeCost', () => {
  it('follows baseCost × growth^level', () => {
    expect(upgradeCost(STRONGER_TAPS, 0).toNumber()).toBeCloseTo(10, 6);
    expect(upgradeCost(STRONGER_TAPS, 1).toNumber()).toBeCloseTo(15, 6);
    expect(upgradeCost(STRONGER_TAPS, 2).toNumber()).toBeCloseTo(22.5, 6);
    expect(upgradeCost(STRONGER_TAPS, 3).toNumber()).toBeCloseTo(33.75, 6);
  });

  it('uses each upgrade’s own growth rate', () => {
    expect(upgradeCost(SHARPER_INSTINCTS, 1).toNumber()).toBeCloseTo(80, 6);
    expect(upgradeCost(RHYTHM, 2).toNumber()).toBeCloseTo(1000, 6);
  });
});

describe('upgradeModifiers', () => {
  it('grants nothing at level 0', () => {
    expect(upgradeModifiers(STRONGER_TAPS, 0)).toEqual([]);
  });

  it('scales additive effects linearly with the level', () => {
    const [mod] = upgradeModifiers(STRONGER_TAPS, 4);
    expect(mod.type).toBe('add');
    expect(mod.targetKind).toBe('tag');
    expect(new Decimal(mod.value).toNumber()).toBe(4);
  });

  it('compounds multiplicative effects', () => {
    const def = {
      ...STRONGER_TAPS,
      effects: [{ type: 'mul' as const, target: 'x', valuePerLevel: 2 }],
    };
    expect(new Decimal(upgradeModifiers(def, 3)[0].value).toNumber()).toBe(8);
  });

  it('tags every effect with one removable source', () => {
    for (const mod of upgradeModifiers(RHYTHM, 1)) {
      expect(mod.source).toBe(upgradeSource(RHYTHM.id));
    }
  });
});

describe('isMaxed', () => {
  it('is false when no cap is declared', () => {
    expect(isMaxed(STRONGER_TAPS, 9999)).toBe(false);
  });

  it('is true once the declared cap is reached', () => {
    const capped = { ...STRONGER_TAPS, maxLevel: 2 };
    expect(isMaxed(capped, 1)).toBe(false);
    expect(isMaxed(capped, 2)).toBe(true);
  });
});

describe('Simulation.buyUpgrade', () => {
  it('refuses unknown upgrades', () => {
    expect(withSap(1e6).buyUpgrade('nope')).toBe(false);
  });

  it('refuses a purchase the player cannot afford, changing nothing', () => {
    const sim = withSap(9);
    expect(sim.buyUpgrade('strongerTaps')).toBe(false);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(9);
    expect(sim.state.upgrades.level('strongerTaps')).toBe(0);
  });

  it('spends the cost and raises the level', () => {
    const sim = withSap(10);
    expect(sim.buyUpgrade('strongerTaps')).toBe(true);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(0);
    expect(sim.state.upgrades.level('strongerTaps')).toBe(1);
  });

  it('does not credit the lifetime total when spending', () => {
    const sim = withSap(10);
    const before = sim.state.resources.total('sap').toNumber();
    sim.buyUpgrade('strongerTaps');
    expect(sim.state.resources.total('sap').toNumber()).toBe(before);
  });

  it('Stronger Taps adds +1 click power per level, without double-counting', () => {
    const sim = withSap(1000);
    expect(resolveClickStats(sim.state.modifiers).clickPower.toNumber()).toBe(1);

    sim.buyUpgrade('strongerTaps');
    expect(resolveClickStats(sim.state.modifiers).clickPower.toNumber()).toBe(2);

    sim.buyUpgrade('strongerTaps');
    sim.buyUpgrade('strongerTaps');
    expect(resolveClickStats(sim.state.modifiers).clickPower.toNumber()).toBe(4);
    // One source, re-granted each level — not one modifier per purchase.
    expect(
      sim.state.modifiers.all().filter((m) => m.source === 'upgrade:strongerTaps'),
    ).toHaveLength(1);
  });

  it('Sharper Instincts adds +1% crit chance per level', () => {
    const sim = withSap(1000);
    sim.buyUpgrade('sharperInstincts');
    expect(resolveClickStats(sim.state.modifiers).critChance).toBeCloseTo(0.03, 10);

    sim.buyUpgrade('sharperInstincts');
    expect(resolveClickStats(sim.state.modifiers).critChance).toBeCloseTo(0.04, 10);
  });

  it('Rhythm of Growth adds +10 combo cap per level', () => {
    const sim = withSap(10000);
    sim.buyUpgrade('rhythmOfGrowth');
    expect(resolveClickStats(sim.state.modifiers).comboCap).toBe(60);

    sim.buyUpgrade('rhythmOfGrowth');
    expect(resolveClickStats(sim.state.modifiers).comboCap).toBe(70);
  });

  it('costs escalate, so a fixed budget buys a bounded number of levels', () => {
    const sim = withSap(45); // 10 + 15 + 22.5 = 47.5 > 45
    expect(sim.buyUpgrade('strongerTaps')).toBe(true);
    expect(sim.buyUpgrade('strongerTaps')).toBe(true);
    expect(sim.buyUpgrade('strongerTaps')).toBe(false);
    expect(sim.state.upgrades.level('strongerTaps')).toBe(2);
  });

  it('surfaces level, next cost, and affordability in the snapshot', () => {
    const sim = withSap(10);
    const before = sim.snapshot(0).upgrades.find((u) => u.id === 'strongerTaps');
    expect(before).toMatchObject({ level: 0, affordable: true, maxed: false });
    expect(before?.cost.toNumber()).toBeCloseTo(10, 6);

    sim.buyUpgrade('strongerTaps');
    const after = sim.snapshot(0).upgrades.find((u) => u.id === 'strongerTaps');
    expect(after).toMatchObject({ level: 1, affordable: false });
    expect(after?.cost.toNumber()).toBeCloseTo(15, 6);
  });
});
