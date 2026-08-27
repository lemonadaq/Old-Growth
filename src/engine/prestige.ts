import Decimal from 'break_infinity.js';
import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import {
  CEREMONY_SECONDS,
  FOREST_PRODUCTION_BONUS,
  PRESTIGE_HEIGHT_UNITS,
  PRESTIGE_LIGHT_REQUIREMENT,
  SEED_FRAGMENTS_PER_SEED,
  SEED_LIGHT_DIVISOR,
} from '../content/prestige';
import { RESOURCE_IDS } from '../content/resources';
import { STARTER_SPECIES_ID } from '../content/species';
import type { Modifier } from './modifiers';
import type { TreeGraph } from './treeGraph';

/**
 * Prestige: the end of a run, and what survives it.
 *
 * Every function here is pure and takes the tree (or a number) rather than the
 * simulation, for the same reason the seasons are: the maturity gate is quoted
 * in the HUD sixty times a second, the yield is quoted on the confirm button
 * before the player commits, and the ceremony is drawn on the canvas — three
 * consumers that must all agree, and none of which should be able to change
 * anything by asking.
 *
 * `Simulation` owns the one thing that is *not* pure: swapping the state out.
 */

/** Source id the Old Growth forest's standing bonus is granted under. */
export const FOREST_SOURCE = 'forest';

/* -------------------------------------------------------------- the reading */

/**
 * How tall the tree stands, in canonical units above the ground line.
 *
 * The highest point of anything above ground, not the length of the longest
 * chain: a tree that spent its growth reaching sideways is a wide tree, and the
 * gate is deliberately about height. Roots are ignored outright — depth is not
 * height, and counting it would let a player mature a tree by digging.
 */
export function treeHeight(tree: TreeGraph): number {
  let highest = 0;

  for (const node of tree.allNodes()) {
    if (GROWTH_RULE_BY_TYPE[node.type].domain !== 'canopy') continue;
    const placement = tree.placements().get(node.id);
    if (!placement) continue;
    highest = Math.max(highest, placement.start.y, placement.end.y);
  }

  return highest;
}

/** How wide the canopy reaches either side of the trunk, in canonical units. */
export function treeSpread(tree: TreeGraph): number {
  let widest = 0;

  for (const node of tree.allNodes()) {
    if (GROWTH_RULE_BY_TYPE[node.type].domain !== 'canopy') continue;
    const placement = tree.placements().get(node.id);
    if (!placement) continue;
    widest = Math.max(widest, Math.abs(placement.start.x), Math.abs(placement.end.x));
  }

  return widest;
}

/**
 * The species the tree is mostly made of — what colour its silhouette will be.
 *
 * Ties break toward the species with more parts and then toward whatever the
 * tally happens to iterate first; there is no interesting answer for a tree that
 * is exactly half one thing and half another, and picking one is better than
 * inventing a blend nobody asked for. A tree with nothing on it is oak, because
 * that is what its trunk is.
 */
export function dominantSpecies(tree: TreeGraph): string {
  let best = STARTER_SPECIES_ID;
  let bestCount = -1;

  for (const [speciesId, count] of tree.countBySpecies()) {
    if (count > bestCount) {
      best = speciesId;
      bestCount = count;
    }
  }

  return best;
}

/* ------------------------------------------------------------- the maturity */

/** How close the tree is to being able to seed. */
export interface PrestigeProgress {
  /** Canonical units the canopy reaches. */
  readonly height: number;
  readonly heightNeeded: number;
  /** Progress toward the height gate, in `[0, 1]`. */
  readonly heightFraction: number;
  readonly light: Decimal;
  readonly lightNeeded: Decimal;
  /** Progress toward the Light gate, in `[0, 1]`. */
  readonly lightFraction: number;
  /** Both gates met. */
  readonly ready: boolean;
  /** The nearer of the two fractions — what a single bar should show. */
  readonly fraction: number;
}

/**
 * Measure the tree against both maturity gates.
 *
 * The overall fraction is the **minimum** of the two rather than their average,
 * because that is the honest answer to "how close am I": a tree at full height
 * with a tenth of the Light is a tenth of the way there, and a bar reading 55%
 * would be a bar that lies.
 */
export function prestigeProgress(height: number, lifetimeLight: Decimal): PrestigeProgress {
  const lightNeeded = new Decimal(PRESTIGE_LIGHT_REQUIREMENT);
  const heightFraction = Math.min(1, Math.max(0, height / PRESTIGE_HEIGHT_UNITS));
  const lightFraction = Math.min(1, Math.max(0, lifetimeLight.div(lightNeeded).toNumber() || 0));

  return {
    height,
    heightNeeded: PRESTIGE_HEIGHT_UNITS,
    heightFraction,
    light: lifetimeLight,
    lightNeeded,
    lightFraction,
    ready: heightFraction >= 1 && lightFraction >= 1,
    fraction: Math.min(heightFraction, lightFraction),
  };
}

/* ---------------------------------------------------------------- the yield */

/** What one prestige pays out, broken down so the confirm can show its working. */
export interface SeedYield {
  /** `⌊√(lifetimeLight / 1e6)⌋` — the run itself. */
  readonly fromLight: number;
  /** `⌊fragments / 100⌋` — what the songbird brought. */
  readonly fromFragments: number;
  /** Whole Seeds awarded. */
  readonly total: number;
  /**
   * Fragments left over after the whole hundreds were converted.
   *
   * The design line reads `… + seedFragments/100`, which taken literally awards
   * a *fraction* of a Seed — and a fraction of a Seed cannot buy anything, since
   * every heirloom is priced in whole ones. So the fragment term is floored like
   * the other one and the remainder is **kept** rather than rounded away: ninety
   * fragments the songbird worked for are ninety fragments in the next run, not
   * a rounding error the player never sees.
   */
  readonly fragmentsRemaining: number;
}

/** What going to seed right now would pay. */
export function seedYield(lifetimeLight: Decimal, seedFragments: number): SeedYield {
  const ratio = lifetimeLight.div(SEED_LIGHT_DIVISOR).toNumber();
  const fromLight = Number.isFinite(ratio) && ratio > 0 ? Math.floor(Math.sqrt(ratio)) : 0;

  const fragments = Math.max(0, Math.floor(seedFragments));
  const fromFragments = Math.floor(fragments / SEED_FRAGMENTS_PER_SEED);

  return {
    fromLight,
    fromFragments,
    total: fromLight + fromFragments,
    fragmentsRemaining: fragments - fromFragments * SEED_FRAGMENTS_PER_SEED,
  };
}

/* --------------------------------------------------------------- the forest */

/**
 * One tree that has already gone to seed, as the hills remember it.
 *
 * Deliberately compact: a silhouette needs a colour, a size and a place to
 * stand, and keeping the whole graph of every tree the player has ever grown
 * would turn a save file into a museum. What is kept is what can be *seen* from
 * the ridge, plus the two numbers worth reading back in a tooltip.
 */
export interface ForestTree {
  readonly id: string;
  /** What the tree was mostly made of — the tint of its silhouette. */
  readonly speciesId: string;
  /** Canonical height it reached, driving how tall it is drawn. */
  readonly height: number;
  /** Canonical half-width of its canopy. */
  readonly spread: number;
  /** Parts it carried at the end. */
  readonly parts: number;
  /** Rings the trunk had laid down. */
  readonly rings: number;
  /** Seeds it paid out on the way. */
  readonly seeds: number;
  /** Its planting index — the spot on the ridge it stands in, forever. */
  readonly slot: number;
}

/** Take the standing record of a tree about to be given up. */
export function summariseTree(
  tree: TreeGraph,
  info: { readonly slot: number; readonly rings: number; readonly seeds: number },
): ForestTree {
  return {
    id: `grove-${info.slot}`,
    speciesId: dominantSpecies(tree),
    height: treeHeight(tree),
    spread: treeSpread(tree),
    // The trunk is not something the player grew, so it does not count.
    parts: Math.max(0, tree.size - 1),
    rings: info.rings,
    seeds: info.seeds,
    slot: info.slot,
  };
}

/** What a forest of `count` trees multiplies all production by: `1 + 0.01n`. */
export function forestMultiplier(count: number): number {
  return 1 + FOREST_PRODUCTION_BONUS * Math.max(0, Math.floor(count));
}

/**
 * The forest as modifiers: one `mul` per resource, all under one source.
 *
 * Per resource rather than per tag, for the same reason the rings are — "base
 * production" has to mean everything, and a tag is something a producer can
 * forget to carry.
 */
export function forestModifiers(count: number): Modifier[] {
  const trees = Math.max(0, Math.floor(count));
  if (trees === 0) return [];

  const value = new Decimal(forestMultiplier(trees));
  return RESOURCE_IDS.map((resource) => ({
    id: `forest:${resource}`,
    source: FOREST_SOURCE,
    type: 'mul' as const,
    targetKind: 'resource' as const,
    target: resource,
    value,
  }));
}

/* --------------------------------------------------------------- the memory */

/**
 * One part of a remembered tree: where it hung, what it was, what of.
 *
 * Ids are the *previous* run's, which is exactly what makes this replayable —
 * the parts are recorded in creation order, so a replay that walks them in order
 * always has the parent already rebuilt and can map old id to new as it goes.
 */
export interface RememberedPart {
  /** The id this part had in the run that grew it. */
  readonly id: string;
  readonly parentId: string;
  readonly type: TreeNodeType;
  readonly speciesId: string;
}

/** A whole tree, remembered as the sequence of purchases that made it. */
export interface TreeMemory {
  /** Id the previous trunk had, so a replay knows where the walk starts. */
  readonly rootId: string;
  /** Every part except the trunk, in the order it was grown. */
  readonly parts: readonly RememberedPart[];
}

/**
 * Record a tree as the list of parts that built it.
 *
 * Insertion order is creation order, and a part can only be grown on something
 * that already exists, so a parent always precedes its children — which is the
 * whole reason this can be replayed with a plain forward walk rather than a
 * sort.
 */
export function captureMemory(tree: TreeGraph): TreeMemory {
  const parts: RememberedPart[] = [];

  for (const node of tree.allNodes()) {
    if (node.parentId === null) continue;
    parts.push({
      id: node.id,
      parentId: node.parentId,
      type: node.type,
      speciesId: node.speciesId,
    });
  }

  return { rootId: tree.rootId, parts };
}

/** The parts of a memory belonging to one half of the tree. */
export function memoryParts(
  memory: TreeMemory,
  domains: ReadonlySet<'root' | 'canopy'>,
): readonly RememberedPart[] {
  return memory.parts.filter((part) => domains.has(GROWTH_RULE_BY_TYPE[part.type].domain));
}

/* ------------------------------------------------------------- the ceremony */

/** The six seconds between committing to seed and the tree being gone. */
export interface Ceremony {
  /** Engine seconds it began at. */
  readonly startedAt: number;
  /** Engine seconds it lands at. */
  readonly endsAt: number;
  /** Seeds it will pay, locked in when it began. */
  readonly yield: SeedYield;
}

/** Open a ceremony at `now`, paying whatever the tree is worth at that moment. */
export function beginCeremony(now: number, seeds: SeedYield): Ceremony {
  return { startedAt: now, endsAt: now + CEREMONY_SECONDS, yield: seeds };
}

/** How far through a ceremony `now` is, in `[0, 1]`. */
export function ceremonyFraction(ceremony: Ceremony, now: number): number {
  const span = Math.max(1e-9, ceremony.endsAt - ceremony.startedAt);
  return Math.min(1, Math.max(0, (now - ceremony.startedAt) / span));
}
