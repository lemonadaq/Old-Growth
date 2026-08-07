import Decimal from 'break_infinity.js';
import { MAX_TOTEMS, TOTEM_BY_ID, type TotemDef } from '../content/totems';
import type { Modifier } from './modifiers';

/**
 * Totems: permanent auras carved from Deadwood and planted at the tree base.
 *
 * Unlike a buff there is no clock and no removal path, so the modifiers are
 * republished wholesale whenever a totem is planted rather than tracked
 * individually. All of them share one source id, which makes "recompute the
 * auras" a remove-then-add — the same shape hydration and daylight use.
 *
 * Duplicates are allowed on purpose: three Totems of Rain is a legitimate,
 * legible build (×1.2³ Water) and refusing it would make two of the three slots
 * decide themselves.
 */

/** Source id every totem aura is granted under. */
export const TOTEM_SOURCE = 'totems';

/** What a totem costs, as a Decimal. */
export function totemCost(def: TotemDef): Decimal {
  return new Decimal(def.cost);
}

/** Whether another totem will fit at the base. */
export function hasFreeSlot(planted: readonly string[]): boolean {
  return planted.length < MAX_TOTEMS;
}

/**
 * The modifiers a set of planted totems grants.
 *
 * Keyed by slot rather than by totem id so two of the same totem are two
 * distinct modifiers and genuinely stack, instead of one quietly shadowing the
 * other.
 */
export function totemModifiers(planted: readonly string[]): Modifier[] {
  const modifiers: Modifier[] = [];

  planted.forEach((totemId, slot) => {
    const def = TOTEM_BY_ID[totemId];
    if (!def) return;
    def.effects.forEach((effect, i) => {
      modifiers.push({
        id: `totem:${slot}:${totemId}:${i}`,
        source: TOTEM_SOURCE,
        type: effect.type,
        targetKind: effect.targetKind,
        target: effect.target,
        value: effect.value,
      });
    });
  });

  return modifiers;
}
