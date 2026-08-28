import { Howler } from 'howler';
import { DEFAULT_VOLUME, MUSIC_TICK_MS, SFX_BY_ID, type SfxId } from '../../content/audio';
import type { SeasonId } from '../../content/seasons';
import type { WeatherId } from '../../content/weather';
import { Ambience } from './ambience';
import { SeasonPad } from './music';
import { playSpec, type Rng } from './synth';

/**
 * The one thing that owns sound.
 *
 * Three volumes, a mute, a bank of cues, a pad and the weather loops — behind an
 * interface that is safe to call from anywhere, at any time, including before
 * the player has clicked anything and in a test with no audio hardware at all.
 * Every public method is a no-op when there is no context to play into. Audio is
 * decoration: it must never be able to break the interaction that triggered it.
 *
 * **Howler owns the master bus.** Everything synthesised here is routed into
 * `Howler.masterGain`, and master volume and mute go through `Howler.volume()`
 * and `Howler.mute()` rather than through a gain of our own. That is not
 * ceremony to justify the dependency: it is what makes the eventual swap to real
 * assets a non-event. A `Howl` created for a recorded snip connects to that same
 * master gain by construction, so it will already be at the right volume, and
 * already muted when the player has muted.
 *
 * **The context is created lazily**, on the first cue or the first explicit
 * unlock. Browsers refuse to start an `AudioContext` outside a user gesture, and
 * a context created on page load and left suspended is a context that stays
 * silent until something remembers to resume it.
 */

/** Everything the player can set about how loud the game is. */
export interface AudioVolumes {
  /** Overall level, `[0, 1]`. */
  readonly master: number;
  /** The ambient pad, as a fraction of master. */
  readonly music: number;
  /** Cues and weather loops, as a fraction of master. */
  readonly sfx: number;
  /** Silence everything, without forgetting the levels. */
  readonly muted: boolean;
}

/** Clamp a volume into `[0, 1]`, treating anything unusable as silence. */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Gain of a bus, given its own volume and the mute.
 *
 * Master is deliberately *not* in here: it lives on Howler's master gain, one
 * node further down, so that recorded sounds added later obey it for free.
 */
export function busGain(volume: number, muted: boolean): number {
  return muted ? 0 : clampVolume(volume);
}

/** How long a volume change takes to land, in seconds. Short, but not a step. */
const RAMP_SECONDS = 0.08;

type AudioContextCtor = typeof AudioContext;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private pad: SeasonPad | null = null;
  private ambience: Ambience | null = null;

  /** Timer that tops up the pad's note queue. */
  private padTimer: number | null = null;

  /** Set once the environment has proved it cannot do audio at all. */
  private unavailable = false;

  private volumes: AudioVolumes = {
    master: DEFAULT_VOLUME,
    music: DEFAULT_VOLUME,
    sfx: DEFAULT_VOLUME,
    muted: false,
  };

  /** What the world is doing, remembered so it survives a late unlock. */
  private season: SeasonId | null = null;
  private weather: WeatherId | null = null;

  constructor(private readonly rng: Rng = Math.random) {}

  /** The levels currently in force. */
  get levels(): AudioVolumes {
    return this.volumes;
  }

  /** Whether a context exists and is running. */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state !== 'suspended';
  }

  /**
   * Set the levels. Applied immediately if there is a context, remembered either
   * way — the player may well turn the music down before the first click has
   * created one.
   */
  setVolumes(next: AudioVolumes): void {
    this.volumes = {
      master: clampVolume(next.master),
      music: clampVolume(next.music),
      sfx: clampVolume(next.sfx),
      muted: next.muted,
    };
    this.applyVolumes();
  }

  /** Flip the mute and return what it became. */
  toggleMute(): boolean {
    this.setVolumes({ ...this.volumes, muted: !this.volumes.muted });
    return this.volumes.muted;
  }

  /**
   * Start (or resume) audio. Call from inside a user gesture.
   *
   * Idempotent and cheap once running, so the input layer can call it on every
   * press without checking.
   */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  /** Play one cue from the bank. Silent, but never an error, without audio. */
  play(id: SfxId): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    // A cue is almost always the result of a press, which is exactly when a
    // suspended context is allowed to start.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    try {
      playSpec(ctx, this.sfxBus, SFX_BY_ID[id], ctx.currentTime, this.rng);
    } catch {
      // A context that died mid-gesture, or a browser refusing a node. The tap
      // that caused this has already been paid for; the sound is optional.
    }
  }

  /**
   * Tell the pad which season it is. Remembered even without a context, so the
   * pad starts in the right season whenever the player first clicks.
   */
  setSeason(season: SeasonId): void {
    this.season = season;
    this.pad?.setSeason(season);
  }

  /** Tell the loops what the sky is doing. `null` is clear skies. */
  setWeather(id: WeatherId | null): void {
    this.weather = id;
    this.ambience?.set(id);
  }

  /** Stop everything and drop the timers. The context itself is Howler's. */
  dispose(): void {
    if (this.padTimer !== null) {
      clearInterval(this.padTimer);
      this.padTimer = null;
    }
    this.ambience?.dispose();
    this.pad?.dispose();

    // The context belongs to Howler and outlives us, so the buses have to be
    // taken off it by hand: left connected, a hot reload would stack a second
    // pair on top of the first and play the pad twice.
    try {
      this.sfxBus?.disconnect();
      this.musicBus?.disconnect();
    } catch {
      // Already gone. Nothing to unhook.
    }

    this.ambience = null;
    this.pad = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ctx = null;
  }

  /**
   * The context and the buses, created on first use.
   *
   * Returns `null` — once, and then permanently — anywhere audio is impossible:
   * a test runner, a browser without WebAudio, a device that refuses to hand out
   * a context. `unavailable` is what stops that failure being retried on every
   * one of the thousands of clicks a session contains.
   */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.unavailable) return null;

    const ctx = this.acquireContext();
    if (!ctx) {
      this.unavailable = true;
      return null;
    }

    this.ctx = ctx;

    // Two buses under Howler's master gain: one for cues and weather, one for
    // the pad. Their split is what makes "music quieter than effects" possible
    // at all, and it is the commonest thing a player wants from a game like
    // this one.
    const destination: AudioNode = Howler.masterGain ?? ctx.destination;
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(destination);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(destination);

    this.pad = new SeasonPad(ctx, this.musicBus, this.rng);
    this.ambience = new Ambience(ctx, this.sfxBus);

    this.applyVolumes();

    // Catch up on everything that happened before audio existed.
    if (this.season) this.pad.setSeason(this.season);
    if (this.weather) this.ambience.set(this.weather);

    // The pad queues notes ahead of the clock; this only tops that queue up.
    this.padTimer = setInterval(() => this.pad?.tick(), MUSIC_TICK_MS) as unknown as number;

    return ctx;
  }

  /**
   * Get an `AudioContext`, preferring Howler's.
   *
   * `Howler.volume()` builds the context and the master gain as a side effect of
   * the first call, which is the documented way to reach them without loading a
   * sound first. If Howler decided WebAudio is unavailable, one is built
   * directly — the buses then run to `ctx.destination` and master volume is
   * applied to them instead. Either way the caller sees one interface.
   */
  private acquireContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      Howler.volume(clampVolume(this.volumes.master));
      if (Howler.ctx) return Howler.ctx;
    } catch {
      // Howler's setup can throw in exotic environments; fall through.
    }

    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      return new Ctor();
    } catch {
      return null;
    }
  }

  /** Push the current levels at Howler and at the two buses. */
  private applyVolumes(): void {
    const { master, music, sfx, muted } = this.volumes;

    try {
      Howler.volume(master);
      Howler.mute(muted);
    } catch {
      // No Howler context yet (or ever). The bus gains below still apply.
    }

    if (!this.ctx) return;

    // Where Howler is not the master — no WebAudio support, so no master gain —
    // master has to be folded into the buses or it would do nothing at all.
    const scale = Howler.masterGain ? 1 : master;
    const at = this.ctx.currentTime;
    this.ramp(this.sfxBus, busGain(sfx, muted) * scale, at);
    this.ramp(this.musicBus, busGain(music, muted) * scale, at);
  }

  /** Slide a bus to a level rather than stepping it, to avoid a click. */
  private ramp(node: GainNode | null, value: number, at: number): void {
    if (!node) return;
    try {
      node.gain.cancelScheduledValues(at);
      node.gain.setValueAtTime(node.gain.value, at);
      node.gain.linearRampToValueAtTime(value, at + RAMP_SECONDS);
    } catch {
      node.gain.value = value;
    }
  }
}
