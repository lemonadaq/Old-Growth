import { describe, expect, it } from 'vitest';
import { SFX, SFX_BY_ID, WEATHER_CUE, type SfxId } from '../../content/audio';
import { WEATHER_IDS } from '../../content/weather';
import { fakeContext, FakeGain, FakeOscillator, type FakeNode } from './fakeContext';
import { cueSeconds, fillNoise, jitterFactor, playSpec } from './synth';

/** A deterministic "random" that always returns the same point in `[0, 1)`. */
const constant = (value: number) => () => value;

describe('the bank', () => {
  it('has exactly one spec per id, and the index agrees with the list', () => {
    const ids = SFX.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of SFX) expect(SFX_BY_ID[spec.id]).toBe(spec);
  });

  it('gives every weather event a telegraph cue that exists', () => {
    for (const id of WEATHER_IDS) {
      const cue: SfxId = WEATHER_CUE[id];
      expect(SFX_BY_ID[cue]).toBeDefined();
    }
  });

  it('keeps every voice audible, finite and quiet', () => {
    for (const spec of SFX) {
      expect(spec.voices.length).toBeGreaterThan(0);
      for (const voice of spec.voices) {
        expect(voice.seconds).toBeGreaterThan(0);
        expect(voice.at).toBeGreaterThanOrEqual(0);
        // Nothing in a cozy game about a tree should be able to clip on its own.
        expect(voice.gain).toBeGreaterThan(0);
        expect(voice.gain).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('keeps the taps short: a click must be over before the next one lands', () => {
    // Ten taps a second is a realistic combo rate, so 100 ms is the budget.
    expect(cueSeconds(SFX_BY_ID.click)).toBeLessThanOrEqual(0.1);
  });
});

describe('jitterFactor', () => {
  it('is exactly 1 with no spread', () => {
    expect(jitterFactor(0, constant(0.9))).toBe(1);
  });

  it('spans the requested band and nothing wider', () => {
    expect(jitterFactor(0.1, constant(0))).toBeCloseTo(0.9);
    expect(jitterFactor(0.1, constant(1))).toBeCloseTo(1.1);
    expect(jitterFactor(0.1, constant(0.5))).toBeCloseTo(1);
  });

  it('refuses a nonsensical spread rather than making a cue unrecognisable', () => {
    expect(jitterFactor(9, constant(1))).toBe(2);
    expect(jitterFactor(-3, constant(0))).toBe(1);
  });
});

describe('cueSeconds', () => {
  it('measures to the end of the last voice, not the last start', () => {
    // The chime's final note starts late and rings long.
    const graft = SFX_BY_ID.graft;
    const lastStart = Math.max(...graft.voices.map((voice) => voice.at));
    expect(cueSeconds(graft)).toBeGreaterThan(lastStart);
  });
});

describe('fillNoise', () => {
  it('decays from loud to silent across the buffer', () => {
    const samples = new Float32Array(1000);
    fillNoise(samples, 2);
    const head = Math.abs(samples[0]) + Math.abs(samples[1]) + Math.abs(samples[2]);
    const tail = Math.abs(samples[997]) + Math.abs(samples[998]) + Math.abs(samples[999]);
    expect(head).toBeGreaterThan(tail);
    expect(Math.abs(samples[999])).toBeLessThan(0.05);
  });

  it('stays inside the representable range', () => {
    const samples = new Float32Array(500);
    fillNoise(samples, 1);
    for (const sample of samples) expect(Math.abs(sample)).toBeLessThanOrEqual(1);
  });
});

describe('playSpec', () => {
  it('starts and stops every voice, leaving nothing running', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();

    playSpec(ctx, bus as unknown as AudioNode, SFX_BY_ID.crit, 0, constant(0.5));

    expect(fake.started.length).toBe(SFX_BY_ID.crit.voices.length);
    for (const node of fake.started) expect(node.stoppedAt).not.toBeNull();
  });

  it('routes every voice into the bus it was given and nowhere else', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();

    playSpec(ctx, bus as unknown as AudioNode, SFX_BY_ID.prune, 0, constant(0.5));

    // Follow each started node's chain; it must terminate at the bus.
    for (const node of fake.started) {
      let hop: FakeNode | undefined = node;
      const seen: FakeNode[] = [];
      while (hop && hop !== bus) {
        seen.push(hop);
        hop = hop.connections[0];
        expect(seen.length).toBeLessThan(8);
      }
      expect(hop).toBe(bus);
    }
    // Nothing may reach the speakers except through the bus.
    expect(fake.destination.connections).toHaveLength(0);
  });

  it('schedules against the time it is handed, not the context clock', () => {
    const { ctx, fake } = fakeContext();
    fake.currentTime = 12;
    const bus = fake.createGain();

    playSpec(ctx, bus as unknown as AudioNode, SFX_BY_ID.graft, 40, constant(0.5));

    for (const node of fake.started) expect(node.startedAt).toBeGreaterThanOrEqual(40);
  });

  it('pitches the click differently on two plays, and by no more than a tenth', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();
    const base = SFX_BY_ID.click.voices.find((voice) => voice.kind === 'tone');
    if (!base || base.kind !== 'tone') throw new Error('the click lost its tone');

    playSpec(ctx, bus as unknown as AudioNode, SFX_BY_ID.click, 0, constant(0));
    playSpec(ctx, bus as unknown as AudioNode, SFX_BY_ID.click, 0, constant(1));

    const [low, high] = fake
      .nodesOfKind('oscillator')
      .map((node) => (node as FakeOscillator).frequency.events[0].value);

    expect(low).toBeLessThan(high);
    expect(low).toBeCloseTo(base.hz * 0.9, 4);
    expect(high).toBeCloseTo(base.hz * 1.1, 4);
  });

  it('never ramps a gain to zero, which would silently do nothing', () => {
    const { ctx, fake } = fakeContext();
    const bus = fake.createGain();

    for (const spec of SFX) playSpec(ctx, bus as unknown as AudioNode, spec, 0, constant(0.5));

    for (const node of fake.nodesOfKind('gain')) {
      for (const event of (node as FakeGain).gain.events) {
        if (event.kind === 'exponential') expect(event.value).toBeGreaterThan(0);
      }
    }
  });
});
