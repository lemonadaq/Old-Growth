# Audio assets — wanted

Every sound in Old Growth is currently **synthesised at runtime** by
`src/ui/audio/` from the specs in `src/content/audio.ts`. Nothing in this folder
is loaded yet. This file is the brief for the recordings that should eventually
replace those placeholders.

## How a replacement lands

The swap is deliberately small. `AudioManager` already routes everything through
Howler's master gain, so a recorded cue becomes a `Howl` on that same bus, keyed
by the `SfxId` it replaces:

1. Drop the file in `public/audio/` under the name below.
2. Register it against its `SfxId` in the manager's bank.
3. Delete the matching entry from `SFX` in `src/content/audio.ts`.

Nothing above `AudioManager.play()` changes — the game asks for `'crit'` and does
not care what makes the noise. Cues may be replaced one at a time; a half-real,
half-synthesised bank is a valid state.

## Format

- **OGG Vorbis** (`.ogg`) as the primary, **AAC** (`.m4a`) as the fallback for
  Safari. Howler picks per browser from the array of sources.
- 44.1 kHz, mono for one-shots, stereo for the loops and the music.
- Normalised to about **-16 LUFS**, with true peak under -1 dBFS. This is a cozy
  idle game people leave running in a background tab; nothing should ever be the
  loudest thing on their desktop.
- Trimmed to the first sample of sound — the game's timing is the file's timing,
  and 30 ms of leading silence on the click is 30 ms of input lag to the ear.

## One-shots

| File              | `SfxId`      | Length     | Mood                                                                                                                                                                                                                             |
| ----------------- | ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `click.ogg`       | `click`      | 60–90 ms   | A soft wet pop. Sap coming loose, not a UI beep. Needs to survive ten plays a second without becoming a machine gun — dry, no tail. Ship 3–4 variants; the engine pitches ±10% on top.                                           |
| `crit.ogg`        | `crit`       | 150–250 ms | The same event two octaves down, with wood in it. A knuckle on a hollow trunk. More body than the click, still no ring.                                                                                                          |
| `grow.ogg`        | `grow`       | 150–250 ms | A sprout unfurling: a short upward swish that arrives somewhere. The most-heard deliberate sound in the game, so it must be the least tiring. Quiet.                                                                             |
| `prune.ogg`       | `prune`      | 100–140 ms | Secateurs closing. Two strokes, the second brighter — one stroke reads as a click, two read as scissors. Metallic but small; garden tool, not sword.                                                                             |
| `graft.ogg`       | `graft`      | 0.8–1.2 s  | A five-note pentatonic chime, rung not struck. Fires only on a _first_ discovery of a hybrid, a few dozen times in a run, so it is allowed to be pretty. Must sit under the ambient pad without clashing — pentatonic, key of C. |
| `prestige.ogg`    | `prestige`   | 1.5–2.5 s  | A shimmer that rises and opens out. A whole tree becoming a forest. The player has just given something up; this is the sound telling them it was worth it. Warm, no cymbal, no fanfare.                                         |
| `cue-rain.ogg`    | `cueRain`    | 0.5–0.8 s  | Two soft notes falling. The sky announcing rain ten seconds out.                                                                                                                                                                 |
| `cue-storm.ogg`   | `cueStorm`   | 0.6–0.9 s  | Two notes rising, low and rough. Should raise the pulse slightly — the storm is the one weather that can take limbs.                                                                                                             |
| `cue-drought.ogg` | `cueDrought` | 0.7–1.0 s  | One thin tone that never resolves. Dry, unmoving, faintly wrong.                                                                                                                                                                 |

## Loops

Both must be **seamless** — matched at the loop point with no click and no
audible period. Two minutes is better than thirty seconds; the ear finds the
repeat in a short loop within a couple of passes.

| File       | Length   | Mood                                                                                                                                                                                           |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rain.ogg` | 90–120 s | Steady rain on a canopy. Broadband, no thunder, no gutter splash. Sits low so the pad shows through.                                                                                           |
| `wind.ogg` | 90–120 s | Gusting wind through leaves, swelling and dropping over 5–10 s. This is a storm's voice, so it may be the loudest loop in the game — but it plays for a minute at a time and must not fatigue. |

A drought has **no loop**, deliberately. Its silence is the cue: the rain that is
usually somewhere in the background is gone. Do not fill it.

## Music

Four ambient beds, one per season, played by the season pad today as generative
pentatonic drones. If these are ever recorded rather than generated:

| File         | Length  | Mood                                                                                                     |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `spring.ogg` | 2–4 min | Major pentatonic, bright, mid register, gently in a hurry. Growth is cheap and everything is soft.       |
| `summer.ogg` | 2–4 min | The same colour a fifth lower and slower. Heavy, warm, long-held. Standing under a full canopy at noon.  |
| `autumn.ogg` | 2–4 min | Minor pentatonic. Not sad — _ripe_. Something ending on good terms.                                      |
| `winter.ogg` | 2–4 min | Minor, low, sparse. Long gaps where a single note is alone. The tree is asleep and the player is idling. |

Requirements that override everything above: **no melody, no percussion, no
discernible loop point, and it must never become annoying.** These beds play for
hours. If a phrase is memorable enough to hum, it is wrong for this game.
Seasons cross-fade over ~4 s, so each bed must be mixable with any other for the
duration of the fade.
