import type { TreeNodeType } from '../content/growth';
import {
  BEATS,
  FEATURES,
  HINTS,
  type BeatDef,
  type FeatureDef,
  type FeatureId,
  type HintDef,
  type Requirement,
} from '../content/progression';
import type { ResourceId } from '../content/resources';

/**
 * Progression: measuring the run against the gating table.
 *
 * Every function here is pure and takes a {@link ProgressionContext} rather than
 * the simulation, for the same reason `prestige.ts` does: the same answer is
 * wanted by the HUD sixty times a second, by the Journal's Help tab, and by
 * `Simulation.growPart` when it decides whether a root may be bought — three
 * consumers that must agree, and none of which should be able to change anything
 * by asking.
 *
 * What is *not* here is the latch. A gate opening is measured; a gate **staying**
 * open is remembered, by `GameState.features`. That split matters: pruning
 * unlocks at eight parts and the first thing a player does with it is cut the
 * tree back to six, and a scissors button that vanished at that moment would read
 * as a bug in the game rather than as a rule about the game.
 */

/** Everything a requirement can be measured against. */
export interface ProgressionContext {
  /** Lifetime gross of a resource, ever earned this run. */
  readonly lifetime: (resource: ResourceId) => number;
  /** Parts grown, trunk excluded. */
  readonly parts: number;
  /** Parts of one type currently on the tree. */
  readonly partsOfType: (type: TreeNodeType) => number;
  /** Base species the player may currently plant. */
  readonly speciesAvailable: number;
  /** Distinct species standing on the tree, the trunk's included. */
  readonly speciesOnTree: number;
  /** How close the most-courted creature is to moving in, in `[0, 1]`. */
  readonly symbiontInterest: number;
  /** How close the tree is to being able to seed, in `[0, 1]`. */
  readonly maturity: number;
  /** Trees already standing in the Old Growth forest. */
  readonly forest: number;
}

/** How far along one measurement is. */
export interface RequirementProgress {
  readonly met: boolean;
  /** Progress toward it, in `[0, 1]`. */
  readonly fraction: number;
}

/** One gate as every consumer reads it. */
export interface FeatureProgress extends RequirementProgress {
  readonly id: FeatureId;
  /** True once the measurement is satisfied. Mirrors `met`, read as English. */
  readonly unlocked: boolean;
  /** One line naming what is still needed; empty once it is open. */
  readonly hint: string;
}

/** A ratio of two numbers, clamped, and safe when the target is zero. */
function ratio(have: number, need: number): number {
  if (!(need > 0)) return 1;
  if (!Number.isFinite(have)) return have > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, have / need));
}

function progressOf(have: number, need: number): RequirementProgress {
  return { met: have >= need, fraction: ratio(have, need) };
}

/**
 * Measure one requirement.
 *
 * `any` reports the **best** of its parts rather than their sum: it is a choice
 * of routes to the same door, and a bar that added two unrelated routes together
 * would claim progress the player cannot use.
 */
export function requirementProgress(
  requirement: Requirement,
  ctx: ProgressionContext,
): RequirementProgress {
  switch (requirement.kind) {
    case 'always':
      return { met: true, fraction: 1 };
    case 'lifetime':
      return progressOf(ctx.lifetime(requirement.resource), requirement.amount);
    case 'parts':
      return progressOf(ctx.parts, requirement.count);
    case 'partsOfType':
      return progressOf(ctx.partsOfType(requirement.type), requirement.count);
    case 'speciesAvailable':
      return progressOf(ctx.speciesAvailable, requirement.count);
    case 'speciesOnTree':
      return progressOf(ctx.speciesOnTree, requirement.count);
    case 'symbiontInterest':
      return progressOf(ctx.symbiontInterest, requirement.fraction);
    case 'maturity':
      return progressOf(ctx.maturity, requirement.fraction);
    case 'forest':
      return progressOf(ctx.forest, requirement.count);
    case 'any': {
      let met = false;
      let fraction = 0;
      for (const part of requirement.of) {
        const progress = requirementProgress(part, ctx);
        met = met || progress.met;
        fraction = Math.max(fraction, progress.fraction);
      }
      return { met, fraction };
    }
  }
}

/** Measure one feature's gate. */
export function featureProgress(def: FeatureDef, ctx: ProgressionContext): FeatureProgress {
  const progress = requirementProgress(def.requirement, ctx);
  return {
    id: def.id,
    met: progress.met,
    unlocked: progress.met,
    fraction: progress.fraction,
    hint: progress.met ? '' : def.locked,
  };
}

/** Every gate in table order, measured. */
export function featureProgressAll(ctx: ProgressionContext): FeatureProgress[] {
  return FEATURES.map((def) => featureProgress(def, ctx));
}

/** The ids whose gates are open **right now**, before any latch is applied. */
export function openFeatures(ctx: ProgressionContext): FeatureId[] {
  return FEATURES.filter((def) => requirementProgress(def.requirement, ctx).met).map(
    (def) => def.id,
  );
}

/**
 * The beat whose window is open, or `null`.
 *
 * The first match wins, so the table's order is its priority: two windows that
 * overlap would otherwise both want the trunk, and one mark on one limb is the
 * entire point of the exercise.
 */
export function activeBeat(ctx: ProgressionContext): BeatDef | null {
  for (const def of BEATS) {
    if (!requirementProgress(def.from, ctx).met) continue;
    if (requirementProgress(def.until, ctx).met) continue;
    return def;
  }
  return null;
}

/**
 * The next hint worth showing, or `null`.
 *
 * Eligible, unseen, first in table order. One at a time on purpose: three
 * bubbles arriving together — which is exactly what happens when a burst of
 * growth trips several gates at once — is a wall by another name.
 */
export function nextHint(ctx: ProgressionContext, seen: ReadonlySet<string>): HintDef | null {
  for (const def of HINTS) {
    if (seen.has(def.id)) continue;
    if (!requirementProgress(def.when, ctx).met) continue;
    return def;
  }
  return null;
}
