import { AMBIENCE, type AmbienceSpec } from '../../content/audio';
import type { WeatherId } from '../../content/weather';
import { createLoopBuffer } from './synth';

/**
 * The weather loops: rain and wind, running for as long as the sky is doing it.
 *
 * One voice at a time, because only one weather event runs at a time. Changing
 * what is playing always **cross-fades** rather than cuts — the old voice fades
 * out over its own fade time and stops itself, while the new one fades in — so
 * a storm arriving over rain (or a drought's deliberate silence arriving over
 * either) never lands as a click.
 *
 * The gusting is an LFO on the filter's centre frequency rather than on its
 * gain. Wind that swells in volume sounds like someone riding a fader; wind that
 * moves in *timbre* sounds like air changing direction, which is what it is.
 */

/** One running loop, and everything needed to take it back down. */
interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly lfo: OscillatorNode | null;
  readonly fadeSeconds: number;
}

export class Ambience {
  private voice: Voice | null = null;

  /** What is currently playing, so a re-set of the same weather is a no-op. */
  private current: WeatherId | null = null;

  /** Shared across voices: one buffer of noise is enough for every loop. */
  private buffer: AudioBuffer | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
  ) {}

  /** What the sky is currently being heard doing, if anything. */
  get playing(): WeatherId | null {
    return this.current;
  }

  /**
   * Play the loop for `id`, or silence with `null`.
   *
   * Idempotent: asking for what is already playing does nothing, which matters
   * because the caller drives this from a per-frame snapshot rather than from an
   * event.
   */
  set(id: WeatherId | null): void {
    if (id === this.current) return;
    this.current = id;

    this.fadeOut();

    const spec = id === null ? null : AMBIENCE[id];
    if (spec) this.voice = this.start(spec);
  }

  /** Stop everything immediately — for teardown, not for weather changing. */
  dispose(): void {
    this.current = null;
    if (!this.voice) return;
    try {
      this.voice.source.stop();
      this.voice.lfo?.stop();
    } catch {
      // Already stopped, or a context that has gone away underneath us.
    }
    this.voice = null;
  }

  /** Fade the running voice down and schedule it to stop when it is silent. */
  private fadeOut(): void {
    const voice = this.voice;
    this.voice = null;
    if (!voice) return;

    const now = this.ctx.currentTime;
    const end = now + voice.fadeSeconds;
    try {
      // Cancel first: an in-flight fade-*in* would otherwise keep ramping this
      // voice up underneath the fade-out that is replacing it.
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, end);
      voice.source.stop(end + 0.05);
      voice.lfo?.stop(end + 0.05);
    } catch {
      // A stop() on an already-stopped source throws; there is nothing to undo.
    }
  }

  /** Build and start one loop voice, fading in from silence. */
  private start(spec: AmbienceSpec): Voice {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (!this.buffer) this.buffer = createLoopBuffer(ctx);

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = spec.filter;
    filter.frequency.setValueAtTime(spec.hz, now);
    filter.Q.value = spec.q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain, now + spec.fadeSeconds);

    source.connect(filter).connect(gain).connect(this.bus);

    // The gust: a slow sine on the filter's frequency, in Hz either side of its
    // centre. Started with the voice so a storm is already moving when it lands.
    let lfo: OscillatorNode | null = null;
    if (spec.sweep > 0) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(1 / spec.sweepSeconds, now);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(spec.hz * spec.sweep, now);
      lfo.connect(depth).connect(filter.frequency);
      lfo.start(now);
    }

    source.start(now);
    return { source, gain, lfo, fadeSeconds: spec.fadeSeconds };
  }
}
