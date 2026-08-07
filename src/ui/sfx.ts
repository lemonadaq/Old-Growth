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
