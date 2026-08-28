import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_BY_ID, STARTER_SPECIES_ID, type SpeciesDef } from './species';

/**
 * Colour-blind verification for the species palettes (STEP 18).
 *
 * The game asks the player to tell six species apart by looking at the tree,
 * and four of them are green. That is the look it wants — a canopy of six
 * unrelated hues would not read as one tree — but it is also the exact palette
 * that fails for the eight percent of men with a red-green deficiency.
 *
 * So the palette is held to two rules, checked here rather than by eye:
 *
 * 1. **Lightness carries the difference.** Under a deficiency the hue channel
 *    collapses and lightness is what survives, so the leaf colours must be
 *    separated in lightness and not only in hue.
 * 2. **There is a second channel.** Every species declares its own mark for the
 *    patterns-on-leaves setting, and no two share one — because two greens that
 *    do separate for most people should still be distinguishable for everyone
 *    who turns patterns on.
 *
 * The simulations below are the standard Brettel/Viénot-style matrices in
 * linear RGB. They are approximations — no matrix is a person's vision — which
 * is why the thresholds here are floors on legibility rather than a claim that
 * the palette is perfect.
 */

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

/** sRGB → linear light, so the matrices below operate on actual intensities. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearize({ r, g, b }: Rgb): Rgb {
  return { r: toLinear(r), g: toLinear(g), b: toLinear(b) };
}

/** Relative luminance, the one thing a colour deficiency does not take away. */
function luminance(hex: string): number {
  const { r, g, b } = linearize(parseHex(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

const MATRICES: Readonly<Record<Deficiency, readonly number[]>> = {
  // Rows are the new R, G, B as mixtures of the old ones.
  protanopia: [0.0, 1.05118294, -0.05116099, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
  deuteranopia: [1.0, 0.0, 0.0, 0.9513092, 0.0, 0.04866992, 0.0, 0.0, 1.0],
  tritanopia: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -0.86744736, 1.86727089, 0.0],
};

/** A colour as someone with `kind` would see it, in linear RGB. */
function simulate(hex: string, kind: Deficiency): Rgb {
  const { r, g, b } = linearize(parseHex(hex));
  const m = MATRICES[kind];
  return {
    r: m[0] * r + m[1] * g + m[2] * b,
    g: m[3] * r + m[4] * g + m[5] * b,
    b: m[6] * r + m[7] * g + m[8] * b,
  };
}

/** Straight-line distance between two colours in linear RGB, in `[0, √3]`. */
function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Every unordered pair of species. */
function pairs(): [SpeciesDef, SpeciesDef][] {
  const out: [SpeciesDef, SpeciesDef][] = [];
  for (let i = 0; i < SPECIES.length; i += 1) {
    for (let j = i + 1; j < SPECIES.length; j += 1) out.push([SPECIES[i], SPECIES[j]]);
  }
  return out;
}

describe('the palette is legible without colour', () => {
  it('separates every pair of leaf colours by lightness alone', () => {
    // Greyscale is the worst case — the whole hue channel gone — and it is what
    // a screenshot in a colour-blind simulator most resembles. A tenth of the
    // full range is about the smallest step that survives being drawn as a
    // ten-pixel blob against a sky.
    const tooClose = pairs()
      .map(([a, b]) => ({
        pair: `${a.id}/${b.id}`,
        gap: Math.abs(luminance(a.palette.leaf) - luminance(b.palette.leaf)),
      }))
      .filter((entry) => entry.gap < 0.02);

    expect(tooClose).toEqual([]);
  });

  it('keeps the leaf colours apart under each deficiency', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const tooClose = pairs()
        .map(([a, b]) => ({
          kind,
          pair: `${a.id}/${b.id}`,
          gap: distance(simulate(a.palette.leaf, kind), simulate(b.palette.leaf, kind)),
        }))
        .filter((entry) => entry.gap < 0.03);

      expect(tooClose).toEqual([]);
    }
  });

  it('keeps the bark colours apart too — a limb is species-coloured before it has leaves', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const tooClose = pairs()
        .map(([a, b]) => ({
          kind,
          pair: `${a.id}/${b.id}`,
          gap: distance(simulate(a.palette.branch, kind), simulate(b.palette.branch, kind)),
        }))
        .filter((entry) => entry.gap < 0.01);

      expect(tooClose).toEqual([]);
    }
  });
});

describe('the second channel', () => {
  it('gives every species its own mark', () => {
    const marks = SPECIES.map((species) => species.leafPattern);
    expect(new Set(marks).size).toBe(SPECIES.length);
  });

  it('gives the starter species one too, since the trunk is drawn before any choice', () => {
    expect(SPECIES_BY_ID[STARTER_SPECIES_ID].leafPattern).toBeTruthy();
  });
});
