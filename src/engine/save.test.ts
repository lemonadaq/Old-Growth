import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { SAVE_BACKUP_KEY, SAVE_KEY, SAVE_VERSION } from '../content/save';
import { DEFAULT_SETTINGS } from '../content/settings';
import { SYMBIONT_BY_ID } from '../content/symbionts';
import { isNewerThanCurrent, migrateSave, MIGRATIONS } from './migrations';
import { parseSaveText, validateEnvelope, type SaveEnvelope } from './save';
import { Simulation } from './simulation';
import { clearSave, decodeSave, encodeSave, loadGame, saveGame, type SaveStore } from './storage';
import type { TreeNode } from './treeGraph';

/** A `localStorage` stand-in, so the tests never touch a real browser's. */
function memoryStore(seed: Record<string, string> = {}): SaveStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** A store that refuses every write, like a full disk or a blocked origin. */
function hostileStore(): SaveStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

/**
 * A game with something in every corner of the save: a mixed-species tree with
 * roots and leaves, a resident, a totem, a discovery, spent upgrades and a
 * settings change.
 *
 * The round-trip is only worth as much as the state it round-trips, so this
 * deliberately touches each subsystem that has its own restore path.
 */
function playedGame(): Simulation {
  const sim = new Simulation();
  sim.state.resources.add('sap', new Decimal(50_000));
  sim.state.resources.add('water', new Decimal(5_000));
  sim.state.resources.add('deadwood', new Decimal(200));

  const branch = sim.growPart(sim.state.tree.rootId, 'branch') as TreeNode;
  sim.growPart(branch.id, 'leafCluster');
  sim.growPart(branch.id, 'blossom');
  sim.growPart(sim.state.tree.rootId, 'rootSegment');

  sim.buyUpgrade('strongerTaps');
  sim.craftTotem('rain');
  sim.state.symbionts.arrive(SYMBIONT_BY_ID.songbird, sim.state.elapsedSeconds);
  sim.state.discoveries.add('ghostwood');
  sim.state.rings = 2;
  // Through the engine's own republish, not just the field: rings are a
  // multiplier on everything, and a fixture that set the number without the
  // modifier would be comparing a loaded game against a broken one.
  sim.republishRings();
  sim.state.seedFragments = 40;
  sim.state.settings = { ...DEFAULT_SETTINGS, muted: true };

  for (let i = 0; i < 20; i += 1) sim.click(i * 200, () => 1);
  for (let i = 0; i < 30; i += 1) sim.tick(0.1);
  return sim;
}

/** The fields a round-trip must reproduce exactly. */
function fingerprint(sim: Simulation) {
  return {
    sap: sim.state.resources.amount('sap').toString(),
    sapTotal: sim.state.resources.total('sap').toString(),
    water: sim.state.resources.amount('water').toString(),
    light: sim.state.resources.amount('light').toString(),
    treeSize: sim.state.tree.size,
    treeNodes: sim.state.tree
      .allNodes()
      .map((n) => `${n.id}:${n.type}:${n.speciesId}`)
      .sort()
      .join('|'),
    species: [...sim.state.tree.countBySpecies().entries()].sort().join(','),
    upgrades: sim.state.upgrades.level('strongerTaps'),
    totems: sim.state.totems.join(','),
    symbionts: sim.state.symbionts
      .entries()
      .map((s) => `${s.id}:${s.level}`)
      .join(','),
    discoveries: [...sim.state.discoveries].sort().join(','),
    rings: sim.state.rings,
    fragments: sim.state.seedFragments,
    clicks: sim.state.clicks,
    elapsed: sim.state.elapsedSeconds,
    playtime: sim.state.playtimeSeconds,
    muted: sim.state.settings.muted,
  };
}

describe('capture and restore', () => {
  it('writes an envelope with a version, a timestamp and a tree', () => {
    const envelope = playedGame().save(1234);
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.timestamp).toBe(1234);
    expect(envelope.data.tree.nodes.length).toBeGreaterThan(1);
  });

  it('restores a played game exactly', () => {
    const original = playedGame();
    const before = fingerprint(original);

    const loaded = new Simulation();
    expect(loaded.load(original.save())).toBe(true);
    expect(fingerprint(loaded)).toEqual(before);
  });

  it('brings the loaded game back producing at the same rate', () => {
    const original = playedGame();
    const loaded = new Simulation();
    loaded.load(original.save());

    original.tick(0.1);
    loaded.tick(0.1);

    expect(loaded.state.resources.perSecond('light').toNumber()).toBeCloseTo(
      original.state.resources.perSecond('light').toNumber(),
      6,
    );
    expect(loaded.state.resources.perSecond('water').toNumber()).toBeCloseTo(
      original.state.resources.perSecond('water').toNumber(),
      6,
    );
  });

  it('keeps a totem’s aura standing after a load', () => {
    const original = playedGame();
    const loaded = new Simulation();
    loaded.load(original.save());
    // Rain is +20% Water, republished by `hydrate` rather than saved as a
    // modifier: modifiers are derived, and saving them would let a load double
    // an aura that was also re-granted.
    expect(loaded.state.modifiers.all().some((m) => m.target === 'water')).toBe(true);
  });

  it('changes nothing when the data cannot be read', () => {
    const sim = playedGame();
    const before = fingerprint(sim);

    const broken = { version: SAVE_VERSION, timestamp: 0, data: { tree: null } } as never;
    expect(sim.load(broken as SaveEnvelope)).toBe(false);
    expect(fingerprint(sim)).toEqual(before);
  });

  it('drops a buff that lapsed while the tab was shut', () => {
    const sim = new Simulation();
    sim.grantBuff('lateralSurge');
    expect(sim.state.buffs.entries()).toHaveLength(1);

    const saved = sim.save();
    // Long enough that the buff's 120 s is well behind the clock.
    const envelope = {
      ...saved,
      data: { ...saved.data, elapsedSeconds: saved.data.elapsedSeconds + 10_000 },
    };

    const loaded = new Simulation();
    loaded.load(envelope);
    expect(loaded.state.buffs.entries()).toHaveLength(0);
  });

  it('skips content ids the game no longer has', () => {
    const sim = playedGame();
    const saved = sim.save();
    const envelope = {
      ...saved,
      data: {
        ...saved.data,
        totems: [...saved.data.totems, 'totem-of-nothing'],
        discoveries: [...saved.data.discoveries, 'chimera'],
      },
    };

    const loaded = new Simulation();
    expect(loaded.load(envelope)).toBe(true);
    expect(loaded.state.totems).not.toContain('totem-of-nothing');
    // A discovery is only a name: an unknown one is kept rather than dropped,
    // so a save made on a newer build does not lose its Journal on an older one.
    expect(loaded.state.discoveries.has('ghostwood')).toBe(true);
  });
});

describe('playtime', () => {
  it('counts live ticks and not offline ones', () => {
    const sim = new Simulation();
    sim.tick(1);
    sim.tick(1, { offline: true });
    expect(sim.state.playtimeSeconds).toBeCloseTo(1, 9);
  });

  it('survives a round trip', () => {
    const sim = new Simulation();
    for (let i = 0; i < 50; i += 1) sim.tick(0.1);

    const loaded = new Simulation();
    loaded.load(sim.save());
    expect(loaded.state.playtimeSeconds).toBeCloseTo(5, 6);
  });
});

describe('validateEnvelope', () => {
  it.each([
    ['not json at all', 'hello'],
    ['json that is not an object', '42'],
    ['an object with no version', '{"data":{"tree":{"nodes":[]}}}'],
    ['an envelope with no data', '{"version":"1.0"}'],
    ['data with no tree', '{"version":"1.0","data":{}}'],
  ])('refuses %s', (_label, text) => {
    const result = parseSaveText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it('accepts a minimal well-formed envelope', () => {
    const result = validateEnvelope({
      version: '1.0',
      timestamp: 1,
      data: { tree: { nodes: [] } },
    });
    expect(result.ok).toBe(true);
  });
});

describe('migrations', () => {
  it('passes a current save through untouched', () => {
    const envelope = playedGame().save();
    const result = migrateSave(envelope);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.applied).toEqual([]);
  });

  it('refuses a save from a newer build rather than guessing', () => {
    const envelope = { ...playedGame().save(), version: '99.0' };
    const result = migrateSave(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/newer version/);
  });

  it('refuses a version with no path forward', () => {
    const envelope = { ...playedGame().save(), version: '0.1' };
    const result = migrateSave(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot read/);
  });

  it('compares versions as numbers, so 1.10 is newer than 1.9', () => {
    expect(isNewerThanCurrent('1.10')).toBe(true);
    expect(isNewerThanCurrent('0.9')).toBe(false);
    expect(isNewerThanCurrent(SAVE_VERSION)).toBe(false);
  });

  it('has a registry whose steps chain without a gap', () => {
    // Vacuous today and deliberately so: it starts failing the moment someone
    // adds a step whose `from` does not match the previous step's `to`.
    for (let i = 1; i < MIGRATIONS.length; i += 1) {
      expect(MIGRATIONS[i].from).toBe(MIGRATIONS[i - 1].to);
    }
    if (MIGRATIONS.length > 0) {
      expect(MIGRATIONS[MIGRATIONS.length - 1].to).toBe(SAVE_VERSION);
    }
  });
});

describe('storage', () => {
  it('writes and reads a save back', () => {
    const store = memoryStore();
    const sim = playedGame();
    expect(saveGame(sim.save(), store)).toBe(true);

    const outcome = loadGame(store);
    expect(outcome.kind).toBe('loaded');
    if (outcome.kind !== 'loaded') return;

    const loaded = new Simulation();
    expect(loaded.load(outcome.envelope)).toBe(true);
    expect(fingerprint(loaded)).toEqual(fingerprint(sim));
  });

  it('reports nothing to load on a fresh browser', () => {
    expect(loadGame(memoryStore()).kind).toBe('none');
  });

  it('rotates the previous save into the backup slot', () => {
    const store = memoryStore();
    const first = playedGame();
    saveGame(first.save(1), store);
    saveGame(first.save(2), store);

    expect(store.data.has(SAVE_BACKUP_KEY)).toBe(true);
    expect(JSON.parse(store.data.get(SAVE_BACKUP_KEY) as string).timestamp).toBe(1);
  });

  it('falls back to the backup when the live save is corrupt', () => {
    const store = memoryStore();
    const sim = playedGame();
    saveGame(sim.save(), store);
    saveGame(sim.save(), store); // now both keys hold a good save

    // A write that died halfway: valid JSON's opening, and nothing else.
    store.data.set(SAVE_KEY, '{"version":"1.0","timestamp":5,"data":{"tre');

    const outcome = loadGame(store);
    expect(outcome.kind).toBe('recovered');
    if (outcome.kind !== 'recovered') return;
    expect(outcome.reason.length).toBeGreaterThan(0);

    const loaded = new Simulation();
    expect(loaded.load(outcome.envelope)).toBe(true);
    expect(loaded.state.tree.size).toBe(sim.state.tree.size);
  });

  it('never promotes a corrupt live save into the backup', () => {
    const store = memoryStore();
    // Twice, so the backup slot is actually populated before the live save is
    // wrecked — one save leaves nothing to rotate.
    saveGame(playedGame().save(1), store);
    saveGame(playedGame().save(2), store);
    store.data.set(SAVE_KEY, 'not a save at all');

    saveGame(playedGame().save(3), store);
    // The backup still holds the last file that actually parsed.
    expect(parseSaveText(store.data.get(SAVE_BACKUP_KEY) as string).ok).toBe(true);
  });

  it('reports failure when both slots are unreadable', () => {
    const store = memoryStore({ [SAVE_KEY]: 'rubbish', [SAVE_BACKUP_KEY]: 'also rubbish' });
    expect(loadGame(store).kind).toBe('failed');
  });

  it('survives a browser that refuses storage entirely', () => {
    const store = hostileStore();
    expect(saveGame(playedGame().save(), store)).toBe(false);
    expect(() => clearSave(store)).not.toThrow();
    expect(loadGame(null).kind).toBe('none');
  });

  it('clears both keys on a hard reset', () => {
    const store = memoryStore();
    saveGame(playedGame().save(1), store);
    saveGame(playedGame().save(2), store);

    clearSave(store);
    expect(store.data.size).toBe(0);
  });
});

describe('export and import', () => {
  it('round-trips a save through the clipboard format', async () => {
    const sim = playedGame();
    const text = await encodeSave(sim.save());
    expect(text.startsWith('OG')).toBe(true);

    const json = await decodeSave(text);
    expect(json).not.toBeNull();

    const parsed = parseSaveText(json as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const loaded = new Simulation();
    expect(loaded.load(parsed.envelope)).toBe(true);
    expect(fingerprint(loaded)).toEqual(fingerprint(sim));
  });

  it('compresses, so a paste fits somewhere sensible', async () => {
    const sim = playedGame();
    const raw = JSON.stringify(sim.save());
    const encoded = await encodeSave(sim.save());
    expect(encoded.length).toBeLessThan(raw.length);
  });

  it('accepts raw JSON, so a save pasted from devtools still imports', async () => {
    const sim = playedGame();
    const json = JSON.stringify(sim.save());
    expect(await decodeSave(json)).toBe(json);
  });

  it('survives the whitespace a chat client adds', async () => {
    const encoded = await encodeSave(playedGame().save());
    const wrapped = encoded.replace(/(.{40})/g, '$1\n');
    expect(await decodeSave(wrapped)).not.toBeNull();
  });

  it('refuses text that is not a save', async () => {
    expect(await decodeSave('')).toBeNull();
    expect(await decodeSave('hello there')).toBeNull();
    expect(await decodeSave('OG1:not-base64!!')).toBeNull();
  });
});

describe('the acceptance case: export → hard reset → import', () => {
  it('restores the exact state a hard reset threw away', async () => {
    const sim = playedGame();
    const before = fingerprint(sim);
    const exported = await encodeSave(sim.save());

    sim.hardReset();
    // Genuinely gone: a seedling, no upgrades, no totems, no residents.
    expect(sim.state.tree.size).toBe(1);
    expect(sim.state.resources.amount('sap').toNumber()).toBe(0);
    expect(sim.state.totems).toEqual([]);
    expect(sim.state.upgrades.level('strongerTaps')).toBe(0);
    expect(sim.state.symbionts.size).toBe(0);
    expect(sim.state.discoveries.size).toBe(0);
    expect(fingerprint(sim)).not.toEqual(before);

    const json = await decodeSave(exported);
    const parsed = parseSaveText(json as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(sim.load(parsed.envelope)).toBe(true);
    expect(fingerprint(sim)).toEqual(before);
  });

  it('leaves a hard reset unrecoverable from storage alone', () => {
    const store = memoryStore();
    saveGame(playedGame().save(), store);
    saveGame(playedGame().save(), store);

    clearSave(store);
    // Including the backup: a reset the next load could undo is not a reset.
    expect(loadGame(store).kind).toBe('none');
  });
});
