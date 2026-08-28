import {
  MUSIC_CROSSFADE_SECONDS,
  MUSIC_LOOKAHEAD_SECONDS,
  SEASON_MUSIC,
  type MusicSpec,
} from '../../content/audio';
import type { SeasonId } from '../../content/seasons';
import type { Rng } from './synth';

/**
 * The ambient pad: one very quiet generative drone per season.
 *
 * There is no recording, no bar line and no melody. Notes are drawn from a
 * pentatonic scale at a slow jittered interval and left to ring for two or three
 * times the gap between them, so what the player hears is a chord that keeps
 * changing its mind. That shape is chosen against one requirement — *it must
 * never become annoying* — and it satisfies it structurally rather than by being
 * quiet: there is no phrase to learn, so there is nothing to get sick of, and no
 * loop point to notice on the fortieth pass.
 *
 * Notes are queued **ahead of the clock**. WebAudio's timeline is
 * sample-accurate; `setTimeout` in a backgrounded tab is not, and can be
 * throttled to once a second or stopped entirely. {@link tick} tops up a few
 * seconds of queue at a time, so the pad survives a tab losing focus with no
 * audible seam.
 *
 * A season change **cross-fades** over {@link MUSIC_CROSSFADE_SECONDS}: notes
 * already ringing in the old season ring out through a gain that is on its way
 * down, while the new season's first notes come up through one on its way up.
 * Autumn should arrive the way autumn arrives.
 */

/** Pitch of one note of a pad's scale, `octave` octaves above its root. */
export function scaleNote(spec: MusicSpec, degree: number, octave: number): number {
  const semitones =
    spec.scale[((degree % spec.scale.length) + spec.scale.length) % spec.scale.length];
  return spec.rootHz * Math.pow(2, octave + semitones / 12);
}

/** Draw one note from a pad's scale, anywhere in its register. */
export function pickNote(spec: MusicSpec, rng: Rng = Math.random): number {
  const degree = Math.floor(rng() * spec.scale.length);
  const octave = Math.floor(rng() * spec.octaves);
  return scaleNote(spec, degree, octave);
}

/** Seconds until the next note, jittered so the pad never keeps time. */
export function nextInterval(spec: MusicSpec, rng: Rng = Math.random): number {
  const spread = spec.intervalSeconds * spec.intervalJitter;
  return Math.max(0.25, spec.intervalSeconds + (rng() * 2 - 1) * spread);
}

/** One season's voice: everything it plays goes through its own gain. */
interface Layer {
  readonly season: SeasonId;
  readonly gain: GainNode;
  /** Context time the next note is due at. */
  nextAt: number;
}

export class SeasonPad {
  private layer: Layer | null = null;

  /** Layers on their way out, kept only so teardown can disconnect them. */
  private retiring: GainNode[] = [];

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly rng: Rng = Math.random,
  ) {}

  /** The season currently being played, or `null` before the first. */
  get season(): SeasonId | null {
    return this.layer?.season ?? null;
  }

  /**
   * Move the pad to a season, cross-fading. Idempotent, because the caller
   * drives this from a snapshot rather than from an event.
   */
  setSeason(season: SeasonId): void {
    if (this.layer?.season === season) return;

    const now = this.ctx.currentTime;
    this.fadeOut(now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + MUSIC_CROSSFADE_SECONDS);
    gain.connect(this.bus);

    // First note lands immediately rather than after a full interval: a season
    // that turns in silence has not turned as far as the player can tell.
    this.layer = { season, gain, nextAt: now + 0.05 };
    this.tick();
  }

  /**
   * Top the note queue up.
   *
   * Safe to call at any rate — it schedules only as far ahead as the lookahead
   * window and returns immediately once it is full. The bound on the loop is the
   * window, not the caller's cadence, so a tab that was throttled for a minute
   * catches up with a handful of notes rather than a minute's worth.
   */
  tick(): void {
    const layer = this.layer;
    if (!layer) return;

    const spec = SEASON_MUSIC[layer.season];
    const horizon = this.ctx.currentTime + MUSIC_LOOKAHEAD_SECONDS;

    // A pad that was silent while the tab slept should not try to play the notes
    // it "missed" — they would all land at once.
    if (layer.nextAt < this.ctx.currentTime) layer.nextAt = this.ctx.currentTime;

    while (layer.nextAt < horizon) {
      this.strike(spec, layer, layer.nextAt);
      layer.nextAt += nextInterval(spec, this.rng);
    }
  }

  /** Stop the pad. Notes already scheduled ring out; nothing new is queued. */
  dispose(): void {
    this.fadeOut(this.ctx.currentTime);
    this.retiring = [];
  }

  /** One note: an oscillator through a low-pass, under a very slow envelope. */
  private strike(spec: MusicSpec, layer: Layer, at: number): void {
    const ctx = this.ctx;
    const hz = pickNote(spec, this.rng);
    const end = at + spec.noteSeconds;

    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(hz, at);
    // A couple of cents off true, drawn per note. Nothing in a forest is in
    // tune with anything else, and a perfectly tuned pad sounds synthetic.
    osc.detune.setValueAtTime((this.rng() * 2 - 1) * 6, at);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(spec.toneHz, at);
    tone.Q.value = 0.5;

    const gain = ctx.createGain();
    // A third of the note rising, the rest of it falling away. Anything faster
    // has an attack, and an attack is a thing you notice.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(spec.gain, at + spec.noteSeconds * 0.34);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(tone).connect(gain).connect(layer.gain);
    osc.start(at);
    osc.stop(end + 0.05);
  }

  /** Ramp the live layer to silence and stop scheduling into it. */
  private fadeOut(now: number): void {
    const layer = this.layer;
    this.layer = null;
    if (!layer) return;

    try {
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
      layer.gain.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC_CROSSFADE_SECONDS);
    } catch {
      // A context that has gone away underneath us. Nothing to fade.
    }
    this.retiring.push(layer.gain);
  }
}
