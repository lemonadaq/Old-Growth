import { describe, expect, it } from 'vitest';
import { MUSIC_LOOKAHEAD_SECONDS, SEASON_MUSIC } from '../../content/audio';
import { SEASON_IDS } from '../../content/seasons';
import { fakeContext, FakeGain, FakeOscillator } from './fakeContext';
import { nextInterval, pickNote, scaleNote, SeasonPad } from './music';

/** A "random" that walks a fixed list, so a whole pad is reproducible. */
function sequence(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('the season pads', () => {
  it('gives every season a pad', () => {
    for (const id of SEASON_IDS) expect(SEASON_MUSIC[id]).toBeDefined();
  });

  it('uses pentatonic scales — five notes, no semitone neighbours', () => {
    for (const id of SEASON_IDS) {
      const scale = SEASON_MUSIC[id].scale;
      expect(scale).toHaveLength(5);
      for (let i = 1; i < scale.length; i += 1) {
        expect(scale[i] - scale[i - 1]).toBeGreaterThan(1);
      }
    }
  });

  it('lets every note ring longer than the gap to the next one', () => {
    // This is what makes the pad a chord rather than a tune: notes overlap.
    for (const id of SEASON_IDS) {
      const spec = SEASON_MUSIC[id];
      expect(spec.noteSeconds).toBeGreaterThan(spec.intervalSeconds * 1.5);
    }
  });

  it('stays quiet enough to sit under everything else', () => {
    for (const id of SEASON_IDS) expect(SEASON_MUSIC[id].gain).toBeLessThanOrEqual(0.06);
  });
});

describe('scaleNote', () => {
  it('returns the root itself at degree 0, octave 0', () => {
    const spec = SEASON_MUSIC.spring;
    expect(scaleNote(spec, 0, 0)).toBeCloseTo(spec.rootHz);
  });

  it('doubles per octave', () => {
    const spec = SEASON_MUSIC.spring;
    expect(scaleNote(spec, 2, 1)).toBeCloseTo(scaleNote(spec, 2, 0) * 2);
  });

  it('wraps a degree past the end of the scale rather than falling off it', () => {
    const spec = SEASON_MUSIC.autumn;
    expect(scaleNote(spec, 5, 0)).toBeCloseTo(scaleNote(spec, 0, 0));
    expect(scaleNote(spec, -1, 0)).toBeCloseTo(scaleNote(spec, 4, 0));
  });
});

describe('pickNote', () => {
  it('only ever draws notes that are in the scale', () => {
    const spec = SEASON_MUSIC.winter;
    const allowed = new Set<string>();
    for (let octave = 0; octave < spec.octaves; octave += 1) {
      for (let degree = 0; degree < spec.scale.length; degree += 1) {
        allowed.add(scaleNote(spec, degree, octave).toFixed(4));
      }
    }

    for (let i = 0; i < 200; i += 1) {
      expect(allowed.has(pickNote(spec).toFixed(4))).toBe(true);
    }
  });

  it('stays inside the register the spec asked for', () => {
    const spec = SEASON_MUSIC.summer;
    const ceiling = spec.rootHz * Math.pow(2, spec.octaves);
    for (let i = 0; i < 200; i += 1) {
      const hz = pickNote(spec);
      expect(hz).toBeGreaterThanOrEqual(spec.rootHz);
      expect(hz).toBeLessThan(ceiling);
    }
  });
});

describe('nextInterval', () => {
  it('spans the jitter band around the nominal interval', () => {
    const spec = SEASON_MUSIC.spring;
    const spread = spec.intervalSeconds * spec.intervalJitter;
    expect(nextInterval(spec, () => 0)).toBeCloseTo(spec.intervalSeconds - spread);
    expect(nextInterval(spec, () => 1)).toBeCloseTo(spec.intervalSeconds + spread);
  });

  it('never returns a gap so short the pad becomes a drone of onsets', () => {
    const spec = SEASON_MUSIC.spring;
    for (let i = 0; i < 100; i += 1) expect(nextInterval(spec)).toBeGreaterThanOrEqual(0.25);
  });
});

describe('SeasonPad', () => {
  it('starts playing as soon as it is given a season', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('spring');

    expect(pad.season).toBe('spring');
    expect(fake.nodesOfKind('oscillator').length).toBeGreaterThan(0);
  });

  it('queues ahead of the clock, but no further than the lookahead', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('winter');
    for (const node of fake.started) {
      expect(node.startedAt).toBeLessThanOrEqual(MUSIC_LOOKAHEAD_SECONDS);
    }
  });

  it('keeps topping the queue up as the clock advances', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('spring');
    const first = fake.started.length;

    fake.currentTime += MUSIC_LOOKAHEAD_SECONDS;
    pad.tick();

    expect(fake.started.length).toBeGreaterThan(first);
  });

  it('does not replay the notes it missed while the tab slept', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('summer');
    const before = fake.started.length;

    // Ten minutes away, then one tick: the queue covers the lookahead window,
    // not the outage.
    fake.currentTime += 600;
    pad.tick();

    const spec = SEASON_MUSIC.summer;
    const ceiling =
      MUSIC_LOOKAHEAD_SECONDS / (spec.intervalSeconds * (1 - spec.intervalJitter)) + 2;
    expect(fake.started.length - before).toBeLessThanOrEqual(Math.ceil(ceiling));
  });

  it('ignores a re-set of the season it is already playing', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('autumn');
    const gains = fake.nodesOfKind('gain').length;
    pad.setSeason('autumn');

    expect(fake.nodesOfKind('gain').length).toBe(gains);
  });

  it('cross-fades on a season change rather than cutting', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('autumn');
    // The layer gain is the one gain connected straight to the bus.
    const layer = fake
      .nodesOfKind('gain')
      .find((node) => node.connections.includes(bus)) as FakeGain;

    pad.setSeason('winter');

    const fade = layer.gain.events.filter((event) => event.kind === 'exponential').pop();
    expect(fade?.value).toBeLessThan(0.001);
    expect(fade?.at).toBeGreaterThan(fake.currentTime);
    expect(pad.season).toBe('winter');
  });

  it('detunes each note slightly, so nothing is dead in tune', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0, 0.5, 1]));

    pad.setSeason('spring');

    const detunes = fake
      .nodesOfKind('oscillator')
      .map((node) => (node as FakeOscillator).detune.events[0].value);
    expect(new Set(detunes).size).toBeGreaterThan(1);
    for (const cents of detunes) expect(Math.abs(cents)).toBeLessThanOrEqual(6);
  });

  it('stops scheduling once disposed', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const pad = new SeasonPad(ctx, bus as unknown as AudioNode, sequence([0.5]));

    pad.setSeason('spring');
    pad.dispose();
    const after = fake.started.length;

    fake.currentTime += 30;
    pad.tick();

    expect(fake.started.length).toBe(after);
    expect(pad.season).toBeNull();
  });
});
