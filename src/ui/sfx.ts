/**
 * A single placeholder sound effect, synthesised rather than loaded.
 *
 * **Temporary.** STEP 16 owns audio properly — an `AudioManager` over Howler
 * with persisted master/music/sfx volumes, a mute hotkey, and a synthesised
 * bank of every action's SFX. This module exists so that the one sound STEP 9
 * calls for (the snip of a cut) is not silently owed until then, and it is
 * deliberately shaped to be *replaced*: one exported function, no state worth
 * migrating, no assets to license.
 *
 * Everything is lazy and defensive. The AudioContext is created on the first
 * cut — browsers refuse to start one before a user gesture, and a cut is always
 * a gesture — and every path is guarded so a headless or audio-less environment
 * degrades to silence instead of throwing into the input handler.
 */

/**
 * Whether the placeholder SFX are silenced.
 *
 * Module-level rather than passed to every call: the sound functions are called
 * from input handlers wired once on mount, which cannot read React state. The
 * setting itself lives in the engine's state — this is only its mirror, pushed
 * here whenever it changes, and STEP 16's `AudioManager` inherits the same job.
 */
let muted = false;

/** Silence, or unsilence, every placeholder sound. */
export function setSfxMuted(next: boolean): void {
  muted = next;
}

/** Whether sound is currently silenced. */
export function isSfxMuted(): boolean {
  return muted;
}

/** Peak gain of the snip. Quiet: it punctuates a cut, it does not announce one. */
const SNIP_GAIN = 0.12;

/** Length of one blade stroke, in seconds. */
const BLADE_SECONDS = 0.045;

/** Gap between the two blade strokes — the two halves of a pair of scissors. */
const BLADE_GAP_SECONDS = 0.055;

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

/** The page's AudioContext, created on first use. `null` where unsupported. */
function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;

  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * One blade stroke: a short band-passed noise burst.
 *
 * Noise rather than a tone because a snip has no pitch — it is friction. The
 * band-pass is what separates "scissors" from "static": the ear reads the
 * centre frequency as the size of the thing that made the sound.
 */
function blade(ctx: AudioContext, at: number, centerHz: number, seconds: number): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Decaying white noise: the stroke is loudest where the blades first meet.
    samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.2);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(centerHz, at);
  filter.Q.value = 2.4;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SNIP_GAIN, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + seconds);
}

/**
 * The sound of a cut: two quick blade strokes, the second brighter than the
 * first, so the pair reads as scissors closing rather than as one click.
 */
export function playSnip(): void {
  if (muted) return;
  const ctx = audioContext();
  if (!ctx) return;

  // Browsers suspend contexts created outside a gesture; a cut is one.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  try {
    const now = ctx.currentTime;
    blade(ctx, now, 2600, BLADE_SECONDS);
    blade(ctx, now + BLADE_GAP_SECONDS, 3900, BLADE_SECONDS * 0.8);
  } catch {
    // Audio is decoration. Never let it break the interaction that triggered it.
  }
}

/** Peak gain of a weather cue. Quieter than the snip: it is a warning, not an alarm. */
const CUE_GAIN = 0.07;

/** One soft tone, ramped in and out so it has no click at either end. */
function tone(
  ctx: AudioContext,
  at: number,
  hz: number,
  seconds: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(CUE_GAIN, at + seconds * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/**
 * The cue that goes with the sky turning, ten seconds before weather lands.
 *
 * Three different shapes rather than three pitches of the same note: rain falls
 * (two notes down, soft), a storm gathers (two notes *up*, and rough enough to
 * be alarming), and a drought is one thin sustained tone that does not resolve.
 * The design asks for the telegraph to be audible as well as visible, and a
 * player should be able to tell which one is coming without looking up.
 */
export function playWeatherCue(kind: 'rain' | 'storm' | 'drought'): void {
  if (muted) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  try {
    const now = ctx.currentTime;
    if (kind === 'rain') {
      tone(ctx, now, 523.25, 0.28);
      tone(ctx, now + 0.22, 392, 0.42);
    } else if (kind === 'storm') {
      tone(ctx, now, 174.61, 0.34, 'sawtooth');
      tone(ctx, now + 0.26, 261.63, 0.5, 'sawtooth');
    } else {
      tone(ctx, now, 659.25, 0.75, 'triangle');
    }
  } catch {
    // Audio is decoration. Never let it break the tick that triggered it.
  }
}
