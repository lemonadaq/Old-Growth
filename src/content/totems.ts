import type { EffectSpec } from './effects';
import type { ResourceId } from './resources';

/**
 * Totems: the Deadwood sink.
 *
 * Pruning makes timber, and timber has to go somewhere or the resource is a
 * trophy. A totem is carved from it and planted at the tree's base, where it
 * stands as a **permanent** aura — no upkeep, no timer, no way to take it back.
 *
 * There are only {@link MAX_TOTEMS} places to stand one, which is the whole
 * design: three slots and three recipes means the choice is what to commit the
 * base to, not whether to bother.
 *
 * Layer note: content stays free of engine imports; `'click.power'` mirrors the
 * engine's `CLICK_STAT_TAG` by value.
 */

/** Places at the tree base a totem can be planted. */
export const MAX_TOTEMS = 3;

/** Strength of every totem aura. One number so the three stay comparable. */
export const TOTEM_AURA = 0.2;

export interface TotemDef {
  readonly id: string;
  readonly name: string;
  /** One glyph for the Workshop card. */
  readonly glyph: string;
  readonly description: string;
  /** What it is carved from, and how much of it. */
  readonly costResource: ResourceId;
  readonly cost: number;
  /** Accent colour of the carving, used by the canvas and the Workshop. */
  readonly color: string;
  readonly effects: readonly EffectSpec[];
}

/**
 * The three recipes.
 *
 * One per half of the tree plus one for the hand on it: Rain feeds the roots,
 * Sun feeds the canopy, Vigor feeds the player. Costs step up so filling all
 * three slots is a run-long project rather than an afternoon's pruning —
 * first-pass values, STEP 19 owns real balance.
 */
export const TOTEMS: readonly TotemDef[] = [
  {
    id: 'rain',
    name: 'Totem of Rain',
    glyph: '💧',
    description: 'A channel cut down its face. Water finds the roots more readily. +20% Water.',
    costResource: 'deadwood',
    cost: 20,
    color: '#6fb7e0',
    effects: [{ type: 'mul', targetKind: 'resource', target: 'water', value: 1 + TOTEM_AURA }],
  },
  {
    id: 'sun',
    name: 'Totem of Sun',
    glyph: '☀️',
    description: 'A disc and its rays, facing south. The canopy drinks deeper. +20% Light.',
    costResource: 'deadwood',
    cost: 45,
    color: '#ffd27a',
    effects: [{ type: 'mul', targetKind: 'resource', target: 'light', value: 1 + TOTEM_AURA }],
  },
  {
    id: 'vigor',
    name: 'Totem of Vigor',
    glyph: '🪓',
    description: 'Notched like a tally of good years. Every tap bites deeper. +20% click power.',
    costResource: 'deadwood',
    cost: 90,
    color: '#e0a458',
    effects: [{ type: 'mul', targetKind: 'tag', target: 'click.power', value: 1 + TOTEM_AURA }],
  },
] as const;

/** Lookup map from id → definition. */
export const TOTEM_BY_ID: Readonly<Record<string, TotemDef>> = Object.fromEntries(
  TOTEMS.map((t) => [t.id, t]),
);

/** All totem ids in catalogue order. */
export const TOTEM_IDS: readonly string[] = TOTEMS.map((t) => t.id);
