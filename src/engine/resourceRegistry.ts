import Decimal from 'break_infinity.js';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';

/**
 * Mutable per-resource state tracked by the {@link ResourceRegistry}.
 *
 * - `amount`    — the current spendable balance.
 * - `total`     — lifetime gross gained (never decreases; ignores spending).
 * - `perSecond` — cached net production rate, refreshed by the tick pipeline.
 */
export interface ResourceEntry {
  amount: Decimal;
  total: Decimal;
  perSecond: Decimal;
}

/**
 * Central store for the seven game resources. Every resource carries a current
 * amount, a lifetime total, and a cached per-second rate. Kept framework-free so
 * it can be driven by the tick loop, tests, or an offline-progress calculator.
 */
export class ResourceRegistry {
  private readonly entries: Record<ResourceId, ResourceEntry>;

  constructor() {
    this.entries = {} as Record<ResourceId, ResourceEntry>;
    for (const id of RESOURCE_IDS) {
      this.entries[id] = {
        amount: new Decimal(0),
        total: new Decimal(0),
        perSecond: new Decimal(0),
      };
    }
  }

  /** Current spendable amount of a resource. */
  amount(id: ResourceId): Decimal {
    return this.entries[id].amount;
  }

  /** Lifetime gross total ever gained (unaffected by spending). */
  total(id: ResourceId): Decimal {
    return this.entries[id].total;
  }

  /** Cached net production rate for a resource, in units per second. */
  perSecond(id: ResourceId): Decimal {
    return this.entries[id].perSecond;
  }

  /**
   * Apply a signed delta to a resource's amount. Positive deltas also accrue the
   * lifetime total; negative deltas (spending) do not reduce it.
   */
  add(id: ResourceId, delta: Decimal): void {
    const entry = this.entries[id];
    entry.amount = entry.amount.add(delta);
    if (delta.gt(0)) {
      entry.total = entry.total.add(delta);
    }
  }

  /** Overwrite the cached per-second rate for a resource. */
  setPerSecond(id: ResourceId, rate: Decimal): void {
    this.entries[id].perSecond = rate;
  }
}
