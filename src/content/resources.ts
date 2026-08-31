/**
 * Data-driven resource definitions.
 *
 * These are the seven resources described in PROJECT_SPEC.md. Keeping them as
 * plain typed data (rather than hard-coding them in engine logic) lets the
 * engine, renderer, and HUD all iterate over the same source of truth.
 */

/** Stable identifiers for every resource in the game. */
export type ResourceId =
  'sap' | 'light' | 'water' | 'minerals' | 'leafLitter' | 'deadwood' | 'seeds';

/** Where a resource is primarily produced / conceptually lives. */
export type ResourceDomain = 'trunk' | 'canopy' | 'roots' | 'cycle' | 'prestige';

export interface ResourceDef {
  readonly id: ResourceId;
  readonly label: string;
  /** Short emoji/glyph used in the HUD readout. */
  readonly glyph: string;
  /** Hex color used for HUD accents and future rendering. */
  readonly color: string;
  readonly domain: ResourceDomain;
  readonly description: string;
}

export const RESOURCES: readonly ResourceDef[] = [
  {
    id: 'sap',
    label: 'Sap',
    glyph: '🩸',
    color: '#e0a458',
    domain: 'trunk',
    description: 'Clicked from the trunk; the core currency spent to grow the tree.',
  },
  {
    id: 'light',
    label: 'Light',
    glyph: '☀️',
    color: '#ffd27a',
    domain: 'canopy',
    description: 'Gathered by leaves in the canopy during active play.',
  },
  {
    id: 'water',
    label: 'Water',
    glyph: '💧',
    color: '#6fb7e0',
    domain: 'roots',
    description: 'Drawn up by roots; produced idle and offline.',
  },
  {
    id: 'minerals',
    label: 'Minerals',
    glyph: '🪨',
    color: '#b0a58f',
    domain: 'roots',
    description: 'Mined by deep roots; produced idle and offline.',
  },
  {
    id: 'leafLitter',
    label: 'Leaf Litter',
    glyph: '🍂',
    color: '#c07a3a',
    domain: 'cycle',
    description: 'Shed leaves that feed the soil and symbionts.',
  },
  {
    id: 'deadwood',
    label: 'Deadwood',
    glyph: '🪵',
    color: '#8a6a4a',
    domain: 'cycle',
    description: 'Yielded by pruning limbs; fuels apical-dominance buffs.',
  },
  {
    id: 'seeds',
    label: 'Seeds',
    glyph: '🌰',
    color: '#a9c46c',
    domain: 'prestige',
    description: "Prestige currency from 'Go to Seed'; buys Heirloom meta-upgrades.",
  },
] as const;

/** Lookup map from id → definition. */
export const RESOURCE_BY_ID: Readonly<Record<ResourceId, ResourceDef>> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** All resource ids in canonical display order. */
export const RESOURCE_IDS: readonly ResourceId[] = RESOURCES.map((r) => r.id);
