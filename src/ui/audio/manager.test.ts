import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOLUME } from '../../content/audio';
import { FakeAudioContext, FakeBufferSource, FakeGain, type FakeNode } from './fakeContext';

/**
 * Howler owns the master bus, so the manager cannot be tested without standing
 * in for it. The stub records what the manager asks of it and hands back a fake
 * context, which is exactly the contract the real one has: a context, a master
 * gain, a volume and a mute.
 */
const howler = vi.hoisted(() => ({
  volumes: [] as number[],
  mutes: [] as boolean[],
  ctx: null as unknown,
  masterGain: null as unknown,
}));

vi.mock('howler', () => ({
  Howler: {
    get ctx() {
      return howler.ctx;
    },
    get masterGain() {
      return howler.masterGain;
    },
    volume(value: number) {
      howler.volumes.push(value);
    },
    mute(value: boolean) {
      howler.mutes.push(value);
    },
  },
}));

// Imported after the mock is declared for readability only: `vi.mock` is
// hoisted above every import in the file, so `./manager` gets the stub.
import { AudioManager, busGain, clampVolume } from './manager';

let fake: FakeAudioContext;
let master: FakeGain;
let manager: AudioManager;

/** The last element of an array. `Array.at` is past this project's target. */
function last<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}

/** The gain the manager built for a bus: the one connected to the master. */
function buses(): FakeGain[] {
  return fake.nodesOfKind('gain').filter((node) => node.connections.includes(master)) as FakeGain[];
}

beforeEach(() => {
  howler.volumes = [];
  howler.mutes = [];
  fake = new FakeAudioContext();
  master = fake.createGain();
  howler.ctx = fake;
  howler.masterGain = master;

  // The manager refuses to build anything without a window; there is one in a
  // browser and there is not one here.
  (globalThis as unknown as { window?: unknown }).window = {};

  manager = new AudioManager(() => 0.5);
});

afterEach(() => {
  manager.dispose();
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('clampVolume', () => {
  it('holds the range and refuses nonsense', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(40)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
  });
});

describe('busGain', () => {
  it('is the volume, or silence when muted', () => {
    expect(busGain(0.7, false)).toBe(0.7);
    expect(busGain(0.7, true)).toBe(0);
  });
});

describe('AudioManager', () => {
  it('starts at the documented default and makes nothing until asked', () => {
    expect(manager.levels.master).toBe(DEFAULT_VOLUME);
    expect(manager.levels.muted).toBe(false);
    expect(fake.created.length).toBe(1); // the master gain the test itself made
  });

  it('builds its buses on the first cue and routes them into Howler', () => {
    manager.play('click');

    const routed = buses();
    expect(routed).toHaveLength(2); // sfx and music
    expect(fake.started.length).toBeGreaterThan(0);
  });

  it('plays every cue in the bank without throwing', () => {
    for (const id of ['click', 'crit', 'grow', 'prune', 'graft', 'prestige'] as const) {
      expect(() => manager.play(id)).not.toThrow();
    }
    expect(fake.started.length).toBeGreaterThan(5);
  });

  it('takes levels before there is any audio, and applies them when there is', () => {
    manager.setVolumes({ master: 0.5, music: 0.2, sfx: 0.9, muted: false });
    expect(manager.levels.music).toBe(0.2);

    manager.play('click');

    const values = buses().map((bus) => last(bus.gain.events)?.value);
    expect(values).toContain(0.9);
    expect(values).toContain(0.2);
  });

  it('clamps a level rather than trusting it', () => {
    manager.setVolumes({ master: 12, music: -1, sfx: Number.NaN, muted: false });
    expect(manager.levels).toEqual({ master: 1, music: 0, sfx: 0, muted: false });
  });

  it('silences both buses when muted, and tells Howler too', () => {
    manager.play('click');
    manager.setVolumes({ ...manager.levels, muted: true });

    for (const bus of buses()) expect(last(bus.gain.events)?.value).toBe(0);
    expect(last(howler.mutes)).toBe(true);
  });

  it('gives the levels back on unmute rather than forgetting them', () => {
    manager.setVolumes({ master: 0.4, music: 0.3, sfx: 0.8, muted: false });
    manager.play('click');

    expect(manager.toggleMute()).toBe(true);
    expect(manager.toggleMute()).toBe(false);

    const values = buses().map((bus) => last(bus.gain.events)?.value);
    expect(values).toContain(0.8);
    expect(values).toContain(0.3);
    expect(manager.levels.master).toBe(0.4);
  });

  it('ramps a level change instead of stepping it', () => {
    manager.play('click');
    manager.setVolumes({ ...manager.levels, sfx: 0.1 });

    const kinds = buses().flatMap((bus) => bus.gain.events.map((event) => event.kind));
    expect(kinds).toContain('linear');
  });

  it('remembers the season it was told about before audio existed', () => {
    manager.setSeason('autumn');
    manager.play('click');

    // The pad only builds oscillators once it has both a context and a season,
    // and it builds several — more than the one the click itself is made of.
    expect(fake.nodesOfKind('oscillator').length).toBeGreaterThan(1);
  });

  it('starts a looping weather voice, and stops it when the sky clears', () => {
    manager.play('click');
    manager.setWeather('rain');

    const loop = fake.nodesOfKind('bufferSource').find((node) => (node as FakeBufferSource).loop);
    expect(loop).toBeDefined();
    expect(loop?.stoppedAt).toBeNull();

    manager.setWeather(null);
    expect(loop?.stoppedAt).not.toBeNull();
  });

  it('leaves a drought silent, because its silence is the cue', () => {
    manager.play('click');
    const before = fake.nodesOfKind('bufferSource').filter((n) => (n as FakeBufferSource).loop);
    manager.setWeather('drought');
    const after = fake.nodesOfKind('bufferSource').filter((n) => (n as FakeBufferSource).loop);

    expect(after.length).toBe(before.length);
  });

  it('is silent, and never throws, where there is no audio at all', () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    howler.ctx = null;

    const deaf = new AudioManager();
    expect(() => {
      deaf.play('crit');
      deaf.setSeason('spring');
      deaf.setWeather('storm');
      deaf.setVolumes({ master: 1, music: 1, sfx: 1, muted: false });
      deaf.unlock();
      deaf.dispose();
    }).not.toThrow();
    expect(deaf.running).toBe(false);
  });

  it('gives up on audio after one failure rather than retrying every click', () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const deaf = new AudioManager();

    deaf.play('click');
    // A window appearing later must not resurrect it mid-session: the point of
    // the latch is that thousands of clicks do not each pay for a failed setup.
    (globalThis as unknown as { window?: unknown }).window = {};
    deaf.play('click');

    expect(deaf.running).toBe(false);
    deaf.dispose();
  });

  it('drops its timers and voices on dispose', () => {
    manager.play('click');
    manager.setWeather('storm');
    const loop = fake.nodesOfKind('bufferSource').find((node: FakeNode) => node.startedAt !== null);

    manager.dispose();

    expect(loop?.stoppedAt).not.toBeNull();
    expect(manager.running).toBe(false);
  });
});
