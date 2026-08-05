import Decimal from 'break_infinity.js';
import type { ResourceId } from '../content/resources';

/**
 * Modifier arithmetic. `'add'` and `'mul'` are live; `'pow'` is reserved for
 * late-game content and is accepted by the type but ignored when evaluating.
 */
export type ModifierType = 'add' | 'mul' | 'pow';

/** Whether a modifier targets a producer tag or a specific resource. */
export type ModifierTargetKind = 'tag' | 'resource';

export interface Modifier {
  /** Optional human-readable id for a single modifier instance (debugging). */
  readonly id?: string;
  /**
   * Grouping id for the thing that granted this modifier (an upgrade, symbiont,
   * season…). All modifiers sharing a source can be removed together cleanly.
   */
  readonly source: string;
  readonly type: ModifierType;
  readonly targetKind: ModifierTargetKind;
  /** A {@link ResourceId} when `targetKind` is `'resource'`, else a free tag. */
  readonly target: string;
  /** Additive amount, multiplicative factor (2 = ×2), or reserved pow value. */
  readonly value: number | Decimal;
}

/**
 * A removable collection of {@link Modifier}s. Modifiers are cheap to add and are
 * removed by their `source` id so the thing that granted them can revoke the
 * whole group without tracking individual handles.
 */
export class ModifierSet {
  private readonly list: Modifier[] = [];

  /** Register a modifier. */
  add(mod: Modifier): void {
    this.list.push(mod);
  }

  /** Remove every modifier that was granted by `source`. */
  removeBySource(source: string): void {
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      if (this.list[i].source === source) {
        this.list.splice(i, 1);
      }
    }
  }

  /** All registered modifiers, in insertion order. */
  all(): readonly Modifier[] {
    return this.list;
  }

  /** Remove all modifiers. */
  clear(): void {
    this.list.length = 0;
  }

  /**
   * Modifiers that apply to a producer of `resource` carrying `tags`: either a
   * resource-target matching the resource, or a tag-target the producer carries.
   */
  matching(resource: ResourceId, tags: readonly string[]): Modifier[] {
    return this.list.filter(
      (m) =>
        (m.targetKind === 'resource' && m.target === resource) ||
        (m.targetKind === 'tag' && tags.includes(m.target)),
    );
  }
}

function toDecimal(value: number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/**
 * Combine `base` with a set of modifiers using the fixed stacking order:
 *
 * ```
 * (base + Σ adds) × Π muls
 * ```
 *
 * All additive modifiers are summed onto the base first, then every
 * multiplicative factor is applied. `'pow'` modifiers are reserved for later and
 * are intentionally ignored here.
 */
export function applyModifiers(base: Decimal, mods: readonly Modifier[]): Decimal {
  let addTotal = new Decimal(0);
  let mulProduct = new Decimal(1);

  for (const mod of mods) {
    if (mod.type === 'add') {
      addTotal = addTotal.add(toDecimal(mod.value));
    } else if (mod.type === 'mul') {
      mulProduct = mulProduct.mul(toDecimal(mod.value));
    }
    // 'pow' is reserved for late game — intentionally not evaluated yet.
  }

  return base.add(addTotal).mul(mulProduct);
}
