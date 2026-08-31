import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  BUFF_BY_ID,
  LATERAL_SURGE_DURATION_SECONDS,
  LATERAL_SURGE_GROWTH_DISCOUNT,
  LATERAL_SURGE_ID,
  LATERAL_SURGE_SAP_BONUS,
  type BuffDef,
} from '../content/buffs';
import { GROWTH_COST_TAG } from '../content/prune';
import { BuffLedger, buffModifiers, buffSource } from './buffs';
import { ModifierSet, applyModifiers } from './modifiers';

const SURGE = BUFF_BY_ID[LATERAL_SURGE_ID];

/** A throwaway buff of a given length, for testing the clock in isolation. */
function buff(id: string, durationSeconds: number): BuffDef {
  return {
    id,
    name: id,
    glyph: '•',
    description: '',
    durationSeconds,
    effects: [{ type: 'mul', targetKind: 'tag', target: 'test', value: 2 }],
  };
}

describe('buffSource', () => {
  it('namespaces a buff so its modifiers revoke as a group', () => {
    expect(buffSource('lateralSurge')).toBe('buff:lateralSurge');
    expect(buffSource('a')).not.toBe(buffSource('b'));
  });
});

describe('buffModifiers', () => {
  it('turns every content effect into a modifier under one source', () => {
    const mods = buffModifiers(SURGE);
    expect(mods).toHaveLength(SURGE.effects.length);
    expect(new Set(mods.map((m) => m.source))).toEqual(new Set([buffSource(LATERAL_SURGE_ID)]));
  });

  it('carries the Lateral Surge growth discount as a 0.75 multiplier', () => {
    const mods = buffModifiers(SURGE);
    const growth = mods.find((m) => m.target === GROWTH_COST_TAG);
    expect(growth?.type).toBe('mul');
    expect(growth?.value).toBeCloseTo(1 - LATERAL_SURGE_GROWTH_DISCOUNT, 9);
  });

  it('carries the Sap bonus onto the resource itself', () => {
    const sap = buffModifiers(SURGE).find((m) => m.targetKind === 'resource' && m.target === 'sap');
    expect(sap?.value).toBeCloseTo(1 + LATERAL_SURGE_SAP_BONUS, 9);
  });

  it('gives every effect a distinct id so none shadows another', () => {
    const ids = buffModifiers(SURGE).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stacks through the ordinary modifier pipeline', () => {
    const set = new ModifierSet();
    for (const mod of buffModifiers(SURGE)) set.add(mod);
    const priced = applyModifiers(new Decimal(100), set.matchingTag(GROWTH_COST_TAG));
    expect(priced.toNumber()).toBeCloseTo(75, 9);
  });
});

describe('BuffLedger', () => {
  it('starts empty', () => {
    const ledger = new BuffLedger();
    expect(ledger.has('anything')).toBe(false);
    expect(ledger.entries()).toEqual([]);
  });

  it('records a grant as expiring one duration later', () => {
    const ledger = new BuffLedger();
    const active = ledger.grant(buff('x', 120), 40);
    expect(active.grantedAt).toBe(40);
    expect(active.expiresAt).toBe(160);
    expect(ledger.has('x')).toBe(true);
  });

  it('counts down as engine time passes', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('x', 120), 0);
    expect(ledger.remaining('x', 0)).toBe(120);
    expect(ledger.remaining('x', 45)).toBe(75);
    expect(ledger.remaining('x', 200)).toBe(0);
  });

  it('reports nothing left for a buff that was never granted', () => {
    expect(new BuffLedger().remaining('x', 10)).toBe(0);
  });

  it('expires exactly at its expiry, not a tick later', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('x', 120), 0);

    expect(ledger.expire(119.9)).toEqual([]);
    expect(ledger.has('x')).toBe(true);
    expect(ledger.expire(120)).toEqual(['x']);
    expect(ledger.has('x')).toBe(false);
  });

  it('reports each expiry once, so its modifiers are revoked once', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('x', 10), 0);
    expect(ledger.expire(30)).toEqual(['x']);
    expect(ledger.expire(30)).toEqual([]);
  });

  it('refreshes rather than stacks: a second grant resets the clock', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('x', 120), 0);
    ledger.grant(buff('x', 120), 100);

    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.remaining('x', 100)).toBe(120);
    // It would have lapsed at 120 without the refresh.
    expect(ledger.expire(150)).toEqual([]);
    expect(ledger.expire(220)).toEqual(['x']);
  });

  it('expires several buffs in one sweep', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('a', 10), 0);
    ledger.grant(buff('b', 20), 0);
    ledger.grant(buff('c', 90), 0);
    expect(ledger.expire(30).sort()).toEqual(['a', 'b']);
    expect(ledger.entries().map((b) => b.id)).toEqual(['c']);
  });

  it('drops everything on clear, silently', () => {
    const ledger = new BuffLedger();
    ledger.grant(buff('x', 10), 0);
    ledger.clear();
    expect(ledger.entries()).toEqual([]);
    expect(ledger.expire(999)).toEqual([]);
  });

  it("knows the catalogue's Lateral Surge runs for two minutes", () => {
    expect(SURGE.durationSeconds).toBe(LATERAL_SURGE_DURATION_SECONDS);
    expect(LATERAL_SURGE_DURATION_SECONDS).toBe(120);
  });
});
