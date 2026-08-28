/**
 * Sound as data: every noise the game makes, described rather than recorded.
 *
 * No licensed assets exist yet, so nothing here names a file. Each cue is a
 * short list of **voices** — a tone or a burst of filtered noise, with a start
 * offset, a length and an envelope — which `src/ui/audio/synth.ts` renders with
 * WebAudio at the moment it is asked for. That is a deliberate trade rather
 * than a stopgap that happens to work:
 *
 * - A synthesised bank is **weightless**. The whole game still downloads as one
 *   JS bundle, and a cue that is a dozen numbers can be tuned in a text editor
 *   between two taps instead of re-exported from a DAW.
 * - It is **parametric**. The click is pitched ±10% per tap from one spec, which
 *   is what stops ten taps a second from sounding like a machine gun; a sample
 *   would need ten samples or a playback-rate hack.
 * - It is **honest about being temporary**. `/public/audio/ASSETS_TODO.md` lists
 *   the files that should eventually replace these, and the shape of that
 *   replacement is already decided: a `Howl` per cue, played through the same
 *   master gain the synth voices already run through, keyed by the same
 *   {@link SfxId}. Nothing above this file has to move.
 *
 * Everything is in seconds and linear gain, because that is what WebAudio takes.
 * Gains are small on purpose: this is a cozy game about a tree, and the loudest
 * thing in it should still be quieter than the music the player already has on.
 */

/** Every distinct thing the game can be heard doing. */
export type SfxId =
  | 'click'
  | 'crit'
  | 'grow'
  | 'prune'
  | 'graft'
  | 'prestige'
  | 'cueRain'
  | 'cueStorm'
  | 'cueDrought';

/** A pitched voice: one oscillator under a short envelope. */
export interface ToneVoice {
  readonly kind: 'tone';
  readonly wave: OscillatorType;
  /** Start of the voice, in seconds after the cue is triggered. */
  readonly at: number;
  readonly seconds: number;
  readonly hz: number;
  /** Glide target. Omitted means a steady pitch. */
  readonly toHz?: number;
  /** Peak linear gain, before the bus and master volumes have their say. */
  readonly gain: number;
  /** Fraction of the voice spent rising to peak, in `[0, 1)`. */
  readonly attack: number;
}

/** An unpitched voice: white noise pushed through one filter. */
export interface NoiseVoice {
  readonly kind: 'noise';
  readonly at: number;
  readonly seconds: number;
  readonly gain: number;
  readonly filter: BiquadFilterType;
  readonly hz: number;
  readonly q: number;
  /**
   * Shape of the noise itself, as an exponent on its decay: 1 is a flat fade,
   * 3 is a sharp transient. This is baked into the buffer rather than done with
   * a gain ramp because it is what separates "a snip" from "a hiss".
   */
  readonly decay: number;
}

export type Voice = ToneVoice | NoiseVoice;

/** One cue: the voices it is made of, and how much it varies between plays. */
export interface SfxSpec {
  readonly id: SfxId;
  /**
   * Random pitch spread per play, as a fraction. `0.1` is the brief's ±10%.
   *
   * Applies to tone frequencies and to noise filter centres alike: both are
   * "how big was the thing that made this sound", and varying them together is
   * what keeps a repeated cue from reading as a loop.
   */
  readonly jitter: number;
  readonly voices: readonly Voice[];
}

/** Semitone ratio, for building the chime out of intervals instead of numbers. */
const SEMITONE = Math.pow(2, 1 / 12);

/** A pitch `n` semitones above `hz`. */
function step(hz: number, n: number): number {
  return hz * Math.pow(SEMITONE, n);
}

/** Middle-ish C. The root the chimes and the pad are built from. */
const C5 = 523.25;

/**
 * The bank.
 *
 * Each cue is written to a one-line brief, kept in its comment, because the
 * numbers below are meaningless without it and every one of them was chosen by
 * ear against that sentence.
 */
export const SFX: readonly SfxSpec[] = [
  /**
   * Click — a soft pop. Sap coming loose, not a UI beep.
   *
   * A sine gliding *down* an octave in 70 ms, which is the whole trick: a pitch
   * that falls reads as something being released, and a pitch that rises reads
   * as something being charged. The tiny noise transient underneath is the
   * knuckle of the tap; without it the pop has no beginning.
   */
  {
    id: 'click',
    jitter: 0.1,
    voices: [
      {
        kind: 'tone',
        wave: 'sine',
        at: 0,
        seconds: 0.07,
        hz: 620,
        toHz: 310,
        gain: 0.11,
        attack: 0.06,
      },
      {
        kind: 'noise',
        at: 0,
        seconds: 0.02,
        gain: 0.045,
        filter: 'bandpass',
        hz: 1900,
        q: 1.1,
        decay: 3,
      },
    ],
  },

  /**
   * Crit — a deeper thock. The same event, further down and with more wood in it.
   *
   * Two octaves below the click and a triangle rather than a sine, so it has
   * upper harmonics to be *heard* over a fast tap sequence, plus a low sine
   * "body" that gives it the weight the pop deliberately lacks.
   */
  {
    id: 'crit',
    jitter: 0.08,
    voices: [
      {
        kind: 'tone',
        wave: 'triangle',
        at: 0,
        seconds: 0.16,
        hz: 196,
        toHz: 98,
        gain: 0.15,
        attack: 0.04,
      },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0,
        seconds: 0.22,
        hz: 88,
        toHz: 62,
        gain: 0.1,
        attack: 0.08,
      },
      {
        kind: 'noise',
        at: 0,
        seconds: 0.035,
        gain: 0.06,
        filter: 'lowpass',
        hz: 900,
        q: 0.8,
        decay: 2.4,
      },
    ],
  },

  /**
   * Grow — a sprout swish. Something unfurling, quickly, and then being there.
   *
   * Noise swept *upward* through a band-pass is the swish; the quiet tone that
   * follows it a beat later is the part that says the swish arrived somewhere.
   * Growing is the game's most common deliberate purchase, so it is also the
   * cue most at risk of becoming annoying: it is the quietest thing in the bank.
   */
  {
    id: 'grow',
    jitter: 0.07,
    voices: [
      {
        kind: 'noise',
        at: 0,
        seconds: 0.16,
        gain: 0.05,
        filter: 'bandpass',
        hz: 1500,
        q: 0.9,
        decay: 1.1,
      },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0.06,
        seconds: 0.16,
        hz: 440,
        toHz: 660,
        gain: 0.055,
        attack: 0.3,
      },
    ],
  },

  /**
   * Prune — a snip. Two blade strokes, the second brighter than the first.
   *
   * The pair is the whole sound: one stroke is a click, two is a pair of
   * scissors closing. Carried over from the placeholder STEP 9 wrote, which was
   * always meant to end up here.
   */
  {
    id: 'prune',
    jitter: 0.06,
    voices: [
      {
        kind: 'noise',
        at: 0,
        seconds: 0.045,
        gain: 0.12,
        filter: 'bandpass',
        hz: 2600,
        q: 2.4,
        decay: 2.2,
      },
      {
        kind: 'noise',
        at: 0.055,
        seconds: 0.036,
        gain: 0.1,
        filter: 'bandpass',
        hz: 3900,
        q: 2.4,
        decay: 2.2,
      },
    ],
  },

  /**
   * Graft — a chime arpeggio. The one cue in the game that is allowed to be
   * pretty, because it fires a few dozen times in a whole run.
   *
   * A major-pentatonic run (root, 2nd, 3rd, 5th, octave) rung out on triangles.
   * Pentatonic because no two of its notes can clash, which matters when the
   * ambient pad is holding a chord underneath and nothing coordinates the two.
   */
  {
    id: 'graft',
    jitter: 0.02,
    voices: [
      { kind: 'tone', wave: 'triangle', at: 0, seconds: 0.5, hz: C5, gain: 0.07, attack: 0.02 },
      {
        kind: 'tone',
        wave: 'triangle',
        at: 0.09,
        seconds: 0.5,
        hz: step(C5, 2),
        gain: 0.065,
        attack: 0.02,
      },
      {
        kind: 'tone',
        wave: 'triangle',
        at: 0.18,
        seconds: 0.5,
        hz: step(C5, 4),
        gain: 0.06,
        attack: 0.02,
      },
      {
        kind: 'tone',
        wave: 'triangle',
        at: 0.27,
        seconds: 0.55,
        hz: step(C5, 7),
        gain: 0.055,
        attack: 0.02,
      },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0.36,
        seconds: 0.9,
        hz: step(C5, 12),
        gain: 0.05,
        attack: 0.04,
      },
    ],
  },

  /**
   * Prestige — a shimmer. A whole tree becoming a forest, in a second and a half.
   *
   * Three sines a fifth apart, each rising slowly, plus a long noise wash under
   * them. Rising, not falling: this is the one moment in the game where the
   * player has given something up and needs to be told it was worth it.
   */
  {
    id: 'prestige',
    jitter: 0,
    voices: [
      {
        kind: 'tone',
        wave: 'sine',
        at: 0,
        seconds: 1.6,
        hz: step(C5, -12),
        toHz: step(C5, -5),
        gain: 0.07,
        attack: 0.35,
      },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0.12,
        seconds: 1.5,
        hz: step(C5, -5),
        toHz: step(C5, 2),
        gain: 0.055,
        attack: 0.35,
      },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0.24,
        seconds: 1.4,
        hz: step(C5, 7),
        toHz: step(C5, 12),
        gain: 0.04,
        attack: 0.4,
      },
      {
        kind: 'noise',
        at: 0,
        seconds: 1.6,
        gain: 0.03,
        filter: 'highpass',
        hz: 2600,
        q: 0.6,
        decay: 0.8,
      },
    ],
  },

  /**
   * The three telegraph cues, ten seconds before weather lands.
   *
   * Three different *shapes* rather than three pitches of one shape, so a player
   * can tell what is coming without looking up: rain falls (two notes down,
   * soft), a storm gathers (two notes up, and rough enough to be alarming), and
   * a drought is one thin tone that never resolves.
   */
  {
    id: 'cueRain',
    jitter: 0.03,
    voices: [
      { kind: 'tone', wave: 'sine', at: 0, seconds: 0.28, hz: C5, gain: 0.07, attack: 0.25 },
      {
        kind: 'tone',
        wave: 'sine',
        at: 0.22,
        seconds: 0.42,
        hz: step(C5, -5),
        gain: 0.07,
        attack: 0.25,
      },
    ],
  },
  {
    id: 'cueStorm',
    jitter: 0.03,
    voices: [
      {
        kind: 'tone',
        wave: 'sawtooth',
        at: 0,
        seconds: 0.34,
        hz: step(C5, -19),
        gain: 0.06,
        attack: 0.25,
      },
      {
        kind: 'tone',
        wave: 'sawtooth',
        at: 0.26,
        seconds: 0.5,
        hz: step(C5, -12),
        gain: 0.06,
        attack: 0.25,
      },
    ],
  },
  {
    id: 'cueDrought',
    jitter: 0.03,
    voices: [
      {
        kind: 'tone',
        wave: 'triangle',
        at: 0,
        seconds: 0.75,
        hz: step(C5, 4),
        gain: 0.055,
        attack: 0.25,
      },
    ],
  },
];

/** The bank, keyed for lookup. */
export const SFX_BY_ID: Readonly<Record<SfxId, SfxSpec>> = Object.fromEntries(
  SFX.map((spec) => [spec.id, spec]),
) as Record<SfxId, SfxSpec>;

/** The telegraph cue for each weather event. */
export const WEATHER_CUE: Readonly<Record<'rain' | 'storm' | 'drought', SfxId>> = {
  rain: 'cueRain',
  storm: 'cueStorm',
  drought: 'cueDrought',
};

/**
 * A weather loop: noise, shaped.
 *
 * Rain and wind are the same generator with different filters, which is not a
 * shortcut — it is what they physically are. Rain is broadband and steady; wind
 * is a narrow band whose centre wanders, and the wander is what makes it read as
 * gusting rather than as tape hiss.
 */
export interface AmbienceSpec {
  readonly filter: BiquadFilterType;
  /** Centre or corner frequency of the filter, in Hz. */
  readonly hz: number;
  readonly q: number;
  readonly gain: number;
  /** How far the filter wanders either side of `hz`, as a fraction. */
  readonly sweep: number;
  /** Seconds per full wander. Slow: a gust is not a vibrato. */
  readonly sweepSeconds: number;
  /** Seconds to fade in and out, so weather arrives and leaves rather than cuts. */
  readonly fadeSeconds: number;
}

/** The loops, by the weather that brings them. Clear skies are silent. */
export const AMBIENCE: Readonly<Record<'rain' | 'storm' | 'drought', AmbienceSpec | null>> = {
  /** Steady, wide, and low enough not to sit on top of the pad. */
  rain: {
    filter: 'lowpass',
    hz: 2100,
    q: 0.7,
    gain: 0.1,
    sweep: 0.12,
    sweepSeconds: 9,
    fadeSeconds: 2.5,
  },
  /** Wind: a narrow band, wandering wide and slow, twice as loud as the rain. */
  storm: {
    filter: 'bandpass',
    hz: 620,
    q: 1.4,
    gain: 0.19,
    sweep: 0.55,
    sweepSeconds: 6,
    fadeSeconds: 1.6,
  },
  /**
   * A drought has no sound. Silence *is* the cue: the canopy stops moving, the
   * rain that would normally be somewhere in the background is gone, and the
   * only thing left is the pad. Adding a "heat shimmer" here would have been
   * decoration pretending to be information.
   */
  drought: null,
};

/**
 * A season's pad: a generative drone, one per season, built from a pentatonic
 * scale so that any two notes it happens to overlap are consonant.
 *
 * There is no melody and no bar line. Notes are drawn from the scale at a slow,
 * jittered interval and left to ring for much longer than the gap between them,
 * so the pad is always a chord and never a tune — a tune is a thing you notice,
 * and the brief for this music is that it must never become annoying. The loop
 * is seamless for the same reason a river is: there is nothing to loop.
 */
export interface MusicSpec {
  /** Lowest note of the scale, in Hz. */
  readonly rootHz: number;
  /** Semitone offsets from the root. Pentatonic — five notes, no semitone clashes. */
  readonly scale: readonly number[];
  /** How many octaves up from the root notes may be drawn. */
  readonly octaves: number;
  readonly wave: OscillatorType;
  /** How long a note rings, in seconds. Long: this is a pad, not a pluck. */
  readonly noteSeconds: number;
  /** Seconds between note starts, before jitter. */
  readonly intervalSeconds: number;
  /** Random spread on that interval, as a fraction. Kills the metronome. */
  readonly intervalJitter: number;
  /** Peak gain of a single note. Very quiet — several ring at once. */
  readonly gain: number;
  /** Low-pass corner over the whole pad, in Hz. Softens the oscillator's edge. */
  readonly toneHz: number;
}

/** Major pentatonic: root, 2nd, 3rd, 5th, 6th. */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Minor pentatonic: root, ♭3rd, 4th, 5th, ♭7th. */
const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const;

/**
 * One pad per season.
 *
 * The seasons differ by scale, register and pace rather than by volume, because
 * volume is the player's business and the mood is ours. Spring is bright and
 * quick; summer is the same scale a fifth lower and slower; autumn drops to
 * minor; winter is minor, low, sparse and slow enough that a note can be alone.
 */
export const SEASON_MUSIC: Readonly<Record<'spring' | 'summer' | 'autumn' | 'winter', MusicSpec>> =
  {
    spring: {
      rootHz: step(C5, -12),
      scale: MAJOR_PENTATONIC,
      octaves: 2,
      wave: 'triangle',
      noteSeconds: 6,
      intervalSeconds: 2.6,
      intervalJitter: 0.45,
      gain: 0.05,
      toneHz: 1400,
    },
    summer: {
      rootHz: step(C5, -17),
      scale: MAJOR_PENTATONIC,
      octaves: 2,
      wave: 'sine',
      noteSeconds: 8,
      intervalSeconds: 3.4,
      intervalJitter: 0.45,
      gain: 0.05,
      toneHz: 1100,
    },
    autumn: {
      rootHz: step(C5, -15),
      scale: MINOR_PENTATONIC,
      octaves: 2,
      wave: 'triangle',
      noteSeconds: 9,
      intervalSeconds: 4,
      intervalJitter: 0.5,
      gain: 0.045,
      toneHz: 900,
    },
    winter: {
      rootHz: step(C5, -24),
      scale: MINOR_PENTATONIC,
      octaves: 3,
      wave: 'sine',
      noteSeconds: 12,
      intervalSeconds: 5.5,
      intervalJitter: 0.5,
      gain: 0.04,
      toneHz: 700,
    },
  };

/**
 * How far ahead the pad schedules notes, in seconds.
 *
 * WebAudio's clock is sample-accurate and JavaScript's is not, so notes are
 * queued ahead of time against `AudioContext.currentTime` rather than fired from
 * a timer. A window this wide survives a browser throttling timers in a
 * backgrounded tab without the pad audibly stuttering when the tab comes back.
 */
export const MUSIC_LOOKAHEAD_SECONDS = 4;

/** How often the scheduler wakes to top the queue up, in milliseconds. */
export const MUSIC_TICK_MS = 1000;

/** Seconds a season change takes to cross-fade. Long: nobody should hear a cut. */
export const MUSIC_CROSSFADE_SECONDS = 4;

/** What a fresh install starts at, for all three volumes. */
export const DEFAULT_VOLUME = 0.7;

/** The key that mutes everything, per the brief. */
export const MUTE_HOTKEY = 'm';
