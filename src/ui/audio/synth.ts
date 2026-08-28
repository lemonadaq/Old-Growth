import type { NoiseVoice, SfxSpec, ToneVoice, Voice } from '../../content/audio';

/**
 * The renderer for the synthesised bank: {@link Voice} specs in, WebAudio nodes
 * out.
 *
 * Every node this file creates is **fire-and-forget**. A voice is built, started
 * at an absolute time on the context's own clock, and stopped at a known one;
 * WebAudio disconnects and collects a stopped source on its own. Nothing is
 * pooled and nothing is retained, which is the one design decision that matters
 * here: a click that had to be released would eventually be a click that leaks,
 * and the player taps this game thousands of times a session.
 *
 * Timing runs off `AudioContext.currentTime`, never off `Date.now()`. The audio
 * clock is sample-accurate and the JavaScript one is not; scheduling the second
 * blade of a snip 55 ms after the first with a `setTimeout` would produce a
 * different sound on a busy frame.
 */

/** Where a cue is played into: a bus gain, not the destination. */
export type Bus = AudioNode;

/** A source of randomness, so a test can make a cue deterministic. */
export type Rng = () => number;

/**
 * The pitch multiplier one play of a cue gets, from its jitter spread.
 *
 * Symmetric around 1 and clamped to a sane band: a spec asking for ±400% would
 * be a typo, and the cost of honouring it is a sound nobody can recognise.
 */
export function jitterFactor(jitter: number, rng: Rng = Math.random): number {
  const spread = Math.min(1, Math.max(0, jitter));
  return 1 + (rng() * 2 - 1) * spread;
}

/** How long a cue runs, in seconds: the end of its last voice. */
export function cueSeconds(spec: SfxSpec): number {
  let end = 0;
  for (const voice of spec.voices) end = Math.max(end, voice.at + voice.seconds);
  return end;
}

/**
 * A buffer of white noise whose amplitude decays across it.
 *
 * The decay is baked into the samples rather than applied as a gain ramp because
 * the transient *is* the sound: a snip is a burst that is loudest where the
 * blades first meet, and an exponent of 3 versus 1 is the difference between
 * scissors and a hiss.
 */
export function fillNoise(samples: Float32Array, decay: number): void {
  const frames = samples.length;
  for (let i = 0; i < frames; i += 1) {
    samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, decay);
  }
}

/** One pitched voice, under an attack/decay envelope. */
function playTone(ctx: AudioContext, bus: Bus, voice: ToneVoice, at: number, pitch: number): void {
  const start = at + voice.at;
  const end = start + voice.seconds;

  const osc = ctx.createOscillator();
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(voice.hz * pitch, start);
  if (voice.toHz !== undefined) {
    // Exponential, not linear: pitch is heard logarithmically, and a linear
    // glide down an octave audibly slows as it falls.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.toHz * pitch), end);
  }

  const gain = ctx.createGain();
  const peak = start + voice.seconds * Math.min(0.95, Math.max(0, voice.attack));
  // Ramps run between tiny positive values, never to or from zero:
  // `exponentialRampToValueAtTime` is undefined at 0 and silently does nothing.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, voice.gain),
    Math.max(peak, start + 0.001),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(bus);
  osc.start(start);
  // A hair of tail past the envelope: stopping exactly on the ramp's end can
  // clip the last sample into a click on some implementations.
  osc.stop(end + 0.02);
}

/** One burst of filtered noise. */
function playNoise(
  ctx: AudioContext,
  bus: Bus,
  voice: NoiseVoice,
  at: number,
  pitch: number,
): void {
  const start = at + voice.at;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * voice.seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  fillNoise(buffer.getChannelData(0), voice.decay);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = voice.filter;
  // Jittered with the tones: the filter centre is "how big was the thing that
  // made this sound", so moving it with the pitch keeps one cue coherent.
  filter.frequency.setValueAtTime(voice.hz * pitch, start);
  filter.Q.value = voice.q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(voice.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.seconds);

  source.connect(filter).connect(gain).connect(bus);
  source.start(start);
  source.stop(start + voice.seconds);
}

/** Render one voice into a bus at an absolute context time. */
export function playVoice(
  ctx: AudioContext,
  bus: Bus,
  voice: Voice,
  at: number,
  pitch: number,
): void {
  if (voice.kind === 'tone') {
    playTone(ctx, bus, voice, at, pitch);
  } else {
    playNoise(ctx, bus, voice, at, pitch);
  }
}

/**
 * Render a whole cue into a bus, jittered.
 *
 * Returns how long it will be making noise for, which the manager uses for
 * nothing today and a future `Howl`-backed bank will use to decide whether a
 * retrigger should cut the previous play off.
 */
export function playSpec(
  ctx: AudioContext,
  bus: Bus,
  spec: SfxSpec,
  at: number,
  rng: Rng = Math.random,
): number {
  const pitch = jitterFactor(spec.jitter, rng);
  for (const voice of spec.voices) playVoice(ctx, bus, voice, at, pitch);
  return cueSeconds(spec);
}

/** Seconds of noise in a loop buffer. Long enough that the loop is not a pulse. */
const LOOP_BUFFER_SECONDS = 3;

/**
 * A seamless buffer of flat white noise, for the weather loops.
 *
 * Flat rather than decaying — this one is held open by a filter and a gain, not
 * shaped by its own samples — and long enough that no periodicity is audible.
 * White noise loops seamlessly by construction: there is no waveform to match up
 * at the join, only the same statistics either side of it.
 */
export function createLoopBuffer(ctx: AudioContext): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * LOOP_BUFFER_SECONDS));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}
