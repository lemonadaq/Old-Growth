import { SPRING_GROWTH_DISCOUNT, SUMMER_LIGHT_BONUS, WINTER_PENALTY } from './balance';
import type { EffectSpec } from './effects';
import { GROWTH_COST_TAG } from './prune';

/**
 * The four seasons as data.
 *
 * A season is a standing set of modifiers with a colour scheme and, for two of
 * them, one mechanic of its own: Autumn sheds Leaf Litter at the base, and
 * Winter hands out a Ring to anyone who sits through the whole of it.
 *
 * The wheel turns whether or not the player is watching — `src/engine/seasons.ts`
 * derives which season it is from elapsed time alone, exactly as the day/night
 * cycle does — so nothing here holds state or a clock.
 *
 * Layer note: content stays free of engine imports; `type` and `targetKind`
 * mirror the engine's modifier vocabulary by value, as the rest of `/content`
 * does.
 */

/** Stable identifiers for the seasons, in the order they turn. */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * How a season repaints the world.
 *
 * Each entry is a colour and how far toward it the base palette is dragged, in
 * `[0, 1]`. Dragging rather than replacing is what keeps the tree recognisably
 * the same tree in October as in June: the season is a *cast* over the art, not
 * a second set of art.
 */
export interface SeasonTint {
  /** Colour the sky gradient leans toward. */
  readonly sky: string;
  readonly skyStrength: number;
  /** Colour foliage leans toward — autumn's whole reason for existing. */
  readonly leaf: string;
  readonly leafStrength: number;
  /** Colour the soil bands lean toward. */
  readonly soil: string;
  readonly soilStrength: number;
}

export interface SeasonDef {
  readonly id: SeasonId;
  readonly label: string;
  /** One glyph for the HUD badge. */
  readonly glyph: string;
  /** One line of flavour, shown in the badge's tooltip. */
  readonly flavor: string;
  /** One line naming what the season is doing to the numbers. */
  readonly effectLabel: string;
  /** Modifiers that stand for as long as the season does. */
  readonly effects: readonly EffectSpec[];
  /** Whether the canopy sheds Leaf Litter piles at the base. */
  readonly shedsLitter: boolean;
  /** Whether surviving the whole season lays down a Ring. */
  readonly earnsRing: boolean;
  readonly tint: SeasonTint;
}

/**
 * The wheel, in turning order. A new tree sprouts into Spring — the first thing
 * a new save should be told about the year is that growth is cheap right now.
 */
export const SEASONS: readonly SeasonDef[] = [
  {
    id: 'spring',
    label: 'Spring',
    glyph: '🌱',
    flavor: 'Everything is soft and in a hurry. Wood comes cheap while the sap is running.',
    effectLabel: `Growth costs −${Math.round(SPRING_GROWTH_DISCOUNT * 100)}%`,
    effects: [
      {
        type: 'mul',
        targetKind: 'tag',
        target: GROWTH_COST_TAG,
        value: 1 - SPRING_GROWTH_DISCOUNT,
      },
    ],
    shedsLitter: false,
    earnsRing: false,
    tint: {
      sky: '#cfe8b8',
      skyStrength: 0.12,
      leaf: '#a7d267',
      leafStrength: 0.3,
      soil: '#6f4f2e',
      soilStrength: 0.1,
    },
  },
  {
    id: 'summer',
    label: 'Summer',
    glyph: '☀️',
    flavor: 'The long light. Every leaf is working, and the canopy has never been worth more.',
    effectLabel: `Light +${Math.round(SUMMER_LIGHT_BONUS * 100)}%`,
    effects: [
      { type: 'mul', targetKind: 'resource', target: 'light', value: 1 + SUMMER_LIGHT_BONUS },
    ],
    shedsLitter: false,
    earnsRing: false,
    tint: {
      sky: '#ffe6a8',
      skyStrength: 0.14,
      leaf: '#5f9440',
      leafStrength: 0.22,
      soil: '#7a5533',
      soilStrength: 0.12,
    },
  },
  {
    id: 'autumn',
    label: 'Autumn',
    glyph: '🍂',
    flavor: 'The tree lets go. What falls at the base is worth sweeping up.',
    effectLabel: 'Leaf Litter piles at the base',
    effects: [],
    shedsLitter: true,
    earnsRing: false,
    tint: {
      sky: '#f0c489',
      skyStrength: 0.2,
      leaf: '#d98a2b',
      leafStrength: 0.62,
      soil: '#6a4526',
      soilStrength: 0.16,
    },
  },
  {
    id: 'winter',
    label: 'Winter',
    glyph: '❄️',
    flavor: 'Hold on. A tree that comes through the cold has one more ring than it did.',
    effectLabel: `Light and growth −${Math.round(WINTER_PENALTY * 100)}% · a Ring for surviving`,
    effects: [
      { type: 'mul', targetKind: 'resource', target: 'light', value: 1 - WINTER_PENALTY },
      // The other half of "growth −60%": prices rise rather than fall. See
      // WINTER_PENALTY in `./balance.ts` for why it reads that way round.
      { type: 'mul', targetKind: 'tag', target: GROWTH_COST_TAG, value: 1 + WINTER_PENALTY },
    ],
    shedsLitter: false,
    earnsRing: true,
    // The strongest cast of the four, and it has to be: winter is the season
    // that asks the player to sit still, so it must be unmistakable from across
    // the room. A grey-blue over green foliage reads as frost on leaves that
    // have stopped working — which is exactly what a −60% canopy is.
    tint: {
      sky: '#dbe6f2',
      skyStrength: 0.42,
      leaf: '#b7c2c4',
      leafStrength: 0.62,
      soil: '#63656a',
      soilStrength: 0.42,
    },
  },
] as const;

/** Lookup map from id → definition. */
export const SEASON_BY_ID: Readonly<Record<SeasonId, SeasonDef>> = Object.fromEntries(
  SEASONS.map((s) => [s.id, s]),
) as Record<SeasonId, SeasonDef>;

/** Season ids in turning order. */
export const SEASON_IDS: readonly SeasonId[] = SEASONS.map((s) => s.id);
