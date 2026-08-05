/**
 * Data-driven tree species.
 *
 * A species carries everything the renderer needs to draw a limb: bark colors,
 * the leaf hue used for canopy clusters, and a desaturated earth palette for the
 * root system below the soil line. Later steps add growth/production traits to
 * these same records, and grafting discovers hybrids by combining two of them.
 */

/** Stable identifiers for every species available so far. */
export type SpeciesId = 'oak' | 'maple' | 'pine';

/** Bark colors for a limb: base fill plus a lit edge and a shaded edge. */
export interface BarkPalette {
  /** Flat fill for the limb body. */
  readonly base: string;
  /** Sun-facing highlight down one side of the limb. */
  readonly light: string;
  /** Shaded side of the limb. */
  readonly dark: string;
}

/** Leaf cluster colors; blobs cycle through these for depth. */
export interface LeafPalette {
  readonly base: string;
  readonly light: string;
  readonly dark: string;
}

export interface SpeciesDef {
  readonly id: SpeciesId;
  readonly label: string;
  /** Bark above the soil line. */
  readonly bark: BarkPalette;
  /**
   * Roots below the soil line. Deliberately desaturated earth tones so the
   * underground reads as a different, dimmer world than the canopy.
   */
  readonly root: BarkPalette;
  readonly leaf: LeafPalette;
  readonly description: string;
}

export const SPECIES: readonly SpeciesDef[] = [
  {
    id: 'oak',
    label: 'Oak',
    bark: { base: '#6b533b', light: '#8a6c4c', dark: '#4a3728' },
    root: { base: '#7d6a52', light: '#94805f', dark: '#5a4a37' },
    leaf: { base: '#5e8c42', light: '#7cab55', dark: '#3f6a30' },
    description: 'Broad, patient, and heavy-limbed. The starting species.',
  },
  {
    id: 'maple',
    label: 'Maple',
    bark: { base: '#7a6047', light: '#9a7c5c', dark: '#553f2d' },
    root: { base: '#86705a', light: '#9c8568', dark: '#5f4e3c' },
    leaf: { base: '#c9713a', light: '#e2914f', dark: '#9b5228' },
    description: 'Fast, fiery canopy; sweet sap yields.',
  },
  {
    id: 'pine',
    label: 'Pine',
    bark: { base: '#5c4534', light: '#7a5c44', dark: '#3e2f24' },
    root: { base: '#74644f', light: '#8a785d', dark: '#524534' },
    leaf: { base: '#3d6b4a', light: '#54885d', dark: '#294c35' },
    description: 'Narrow and evergreen; thrives where others will not.',
  },
] as const;

/** Lookup map from id → definition. */
export const SPECIES_BY_ID: Readonly<Record<SpeciesId, SpeciesDef>> = Object.fromEntries(
  SPECIES.map((s) => [s.id, s]),
) as Record<SpeciesId, SpeciesDef>;

/** The species a fresh save starts with. */
export const DEFAULT_SPECIES_ID: SpeciesId = 'oak';
