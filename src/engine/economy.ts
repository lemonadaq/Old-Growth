import Decimal from 'break_infinity.js';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';
import { applyModifiers, type ModifierSet } from './modifiers';

/**
 * A source of production evaluated every tick. A producer contributes its
 * (modified) rate to a single resource. `tags` let modifiers target groups of
 * producers (e.g. all `'leaf'` producers) rather than individual ids.
 */
export interface Producer {
  /** Stable id, unique within the simulation; used for removal. */
  readonly id: string;
  readonly resource: ResourceId;
  /** Unmodified production rate, in units per second. */
  readonly baseRate: number | Decimal;
  /** Arbitrary tags modifiers can target. */
  readonly tags: readonly string[];
}

/**
 * Evaluate every producer against the active modifiers and sum their rates per
 * resource. Each producer's effective rate is `(base + Σ adds) × Π muls` using
 * only the modifiers that target its resource or one of its tags. The returned
 * record has an entry for all seven resources (zero where nothing produces).
 */
export function computeProduction(
  producers: Iterable<Producer>,
  modifiers: ModifierSet,
): Record<ResourceId, Decimal> {
  const perSecond = {} as Record<ResourceId, Decimal>;
  for (const id of RESOURCE_IDS) {
    perSecond[id] = new Decimal(0);
  }

  for (const producer of producers) {
    const base =
      producer.baseRate instanceof Decimal ? producer.baseRate : new Decimal(producer.baseRate);
    const mods = modifiers.matching(producer.resource, producer.tags);
    perSecond[producer.resource] = perSecond[producer.resource].add(applyModifiers(base, mods));
  }

  return perSecond;
}

/**
 * The same evaluation as {@link computeProduction}, restricted to one resource.
 *
 * Used where a single rate is needed mid-tick — the hydration link reads Water
 * income before deciding what the canopy is worth — and skipping the other six
 * resources keeps that from costing a full pipeline pass.
 */
export function computeResourceRate(
  producers: Iterable<Producer>,
  modifiers: ModifierSet,
  resource: ResourceId,
): Decimal {
  let total = new Decimal(0);

  for (const producer of producers) {
    if (producer.resource !== resource) continue;
    const base =
      producer.baseRate instanceof Decimal ? producer.baseRate : new Decimal(producer.baseRate);
    total = total.add(applyModifiers(base, modifiers.matching(producer.resource, producer.tags)));
  }

  return total;
}
