import type { EffectSpec } from './effects';
import { GROWTH_COST_TAG } from './prune';

/**
 * Timed buffs as data.
 *
 * A buff is a named bundle of modifiers with a clock on it. The engine grants
 * one under a single source id and revokes the whole bundle when it runs out,
 * so a buff never leaves anything behind — and granting one that is already
 * running simply resets its clock.
 *
 * Layer note: content stays free of engine imports; `'click.power'` mirrors the
 * engine's `CLICK_STAT_TAG` by value, as `src/content/upgrades.ts` does.
 */

export interface BuffDef {
  readonly id: string;
  readonly name: string;
  /** One glyph for the HUD badge. */
  readonly glyph: string;
  /** One line explaining what it does, in-fiction. */
  readonly description: string;
  /** How long one grant lasts, in engine seconds. */
  readonly durationSeconds: number;
  readonly effects: readonly EffectSpec[];
}

/** Id of the apical-dominance buff, granted by topping the tree. */
export const LATERAL_SURGE_ID = 'lateralSurge';

/** How long a Lateral Surge runs before it lapses. */
export const LATERAL_SURGE_DURATION_SECONDS = 120;

/** Growth cost reduction while a Lateral Surge is running. */
export const LATERAL_SURGE_GROWTH_DISCOUNT = 0.25;

/** Sap bonus while a Lateral Surge is running. */
export const LATERAL_SURGE_SAP_BONUS = 0.25;

/**
 * The buff catalogue.
 *
 * Lateral Surge is real botany: a tree's leading shoot suppresses the buds below
 * it, and cutting that leader off releases them all at once. Mechanically it
 * pays for the cut twice over — cheaper parts *and* more Sap to buy them with —
 * which is what turns topping the tree from a loss into a play.
 */
export const BUFFS: readonly BuffDef[] = [
  {
    id: LATERAL_SURGE_ID,
    name: 'Lateral Surge',
    glyph: '🌿',
    description:
      'The leader is gone and every bud below it wakes at once. Growth costs less and the Sap runs hard.',
    durationSeconds: LATERAL_SURGE_DURATION_SECONDS,
    effects: [
      {
        type: 'mul',
        targetKind: 'tag',
        target: GROWTH_COST_TAG,
        value: 1 - LATERAL_SURGE_GROWTH_DISCOUNT,
      },
      { type: 'mul', targetKind: 'resource', target: 'sap', value: 1 + LATERAL_SURGE_SAP_BONUS },
      // Taps are the only Sap income the game has today, so "Sap/s +25%" has to
      // reach them or the better half of this buff is invisible. The resource
      // modifier above covers every passive Sap producer the later steps add.
      { type: 'mul', targetKind: 'tag', target: 'click.power', value: 1 + LATERAL_SURGE_SAP_BONUS },
    ],
  },
] as const;

/** Lookup map from id → definition. */
export const BUFF_BY_ID: Readonly<Record<string, BuffDef>> = Object.fromEntries(
  BUFFS.map((b) => [b.id, b]),
);
