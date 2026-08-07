import Decimal from 'break_infinity.js';
import type { TreeNodeType } from '../content/growth';
import { HYBRID_BY_ID, HYBRID_IDS, hybridFor, type HybridDef } from '../content/hybrids';
import type { ResourceId } from '../content/resources';
import {
  SPECIES,
  SPECIES_BY_ID,
  STARTER_SPECIES_ID,
  speciesResourceTag,
  speciesTag,
  type SpeciesDef,
  type SpeciesPalette,
  type SpeciesTrait,
} from '../content/species';
import { scopedTag, type Modifier } from './modifiers';
import type { TreeGraph } from './treeGraph';

/**
 * Species in the engine: what a part is made of, and what that is worth.
 *
 * The whole system rides on producer **tags**. A part grown as willow registers
 * its producer carrying `species:willow` and `species:willow/water`, so a trait
 * that belongs to willow roots is an ordinary tag-targeted modifier and the
 * economy never learns that species exist. The same trick, through
 * {@link scopedTag}, gives a limb its own click stats.
 *
 * Three scopes, three shapes:
 *
 * - **own\*** traits publish at full strength against the species' tags. They
 *   are already proportional — they only reach parts of that species.
 * - **tree** traits publish scaled by the species' *share* of the tree, because
 *   a global bonus that arrived with one twig would make the choice meaningless.
 * - **price** traits publish nothing: a purchase is priced before the part
 *   exists, so those live in {@link speciesCostMultiplier}.
 */

/** Source id every species and hybrid modifier is granted under. */
export const SPECIES_SOURCE = 'species';

export { SPECIES_TAG_PREFIX, speciesResourceTag, speciesTag } from '../content/species';

/**
 * A species or a hybrid — everything the rest of the engine needs from either.
 *
 * A grafted limb is a species like any other as far as tags, palettes and prices
 * are concerned; the only difference is where its definition came from and that
 * it had to be discovered.
 */
export interface SpeciesLike {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly flavor: string;
  readonly palette: SpeciesPalette;
  readonly costMultiplier: number;
  readonly costByType?: Readonly<Partial<Record<TreeNodeType, number>>>;
  readonly traits: readonly SpeciesTrait[];
  /** True for a grafted hybrid, false for one of the six base species. */
  readonly hybrid: boolean;
}

function asLike(def: SpeciesDef | HybridDef, hybrid: boolean): SpeciesLike {
  return {
    id: def.id,
    name: def.name,
    glyph: def.glyph,
    flavor: def.flavor,
    palette: def.palette,
    costMultiplier: def.costMultiplier,
    costByType: 'costByType' in def ? def.costByType : undefined,
    traits: def.traits,
    hybrid,
  };
}

/** Any species by id — base or hybrid — or `null` for an unknown one. */
export function lookupSpecies(speciesId: string): SpeciesLike | null {
  const base = SPECIES_BY_ID[speciesId];
  if (base) return asLike(base, false);
  const hybrid = HYBRID_BY_ID[speciesId];
  return hybrid ? asLike(hybrid, true) : null;
}

/** Any species by id, falling back to the starter for unknown ids. */
export function speciesOrStarter(speciesId: string): SpeciesLike {
  return lookupSpecies(speciesId) ?? asLike(SPECIES_BY_ID[STARTER_SPECIES_ID], false);
}

/** Whether `speciesId` names a grafted hybrid rather than a base species. */
export function isHybrid(speciesId: string): boolean {
  return HYBRID_BY_ID[speciesId] !== undefined;
}

/** The colours a species is drawn in; the starter's for anything unrecognised. */
export function speciesPalette(speciesId: string): SpeciesPalette {
  return speciesOrStarter(speciesId).palette;
}

/**
 * Price multiplier for growing `type` as `speciesId`.
 *
 * Two factors: the species' blanket discount, and any per-type break on top (a
 * cherry's half-price blossoms). Applied to the list price *before* the
 * `growth.cost` modifiers, so a discount on the species and a discount from a
 * buff compose rather than compete.
 */
export function speciesCostMultiplier(speciesId: string, type: TreeNodeType): number {
  const def = lookupSpecies(speciesId);
  if (!def) return 1;
  return def.costMultiplier * (def.costByType?.[type] ?? 1);
}

/** How many parts of each species the tree carries, trunk included. */
export function speciesCounts(tree: TreeGraph): ReadonlyMap<string, number> {
  return tree.countBySpecies();
}

/**
 * Each species' share of the tree, in `[0, 1]`, summing to 1 over a non-empty
 * tree.
 *
 * The trunk counts. It is a part of the tree like any other, and counting it
 * makes Oak the identity a player has to actively dilute rather than a free
 * extra — which is exactly what being the starter species should mean.
 */
export function speciesShares(counts: ReadonlyMap<string, number>): Map<string, number> {
  let total = 0;
  for (const count of counts.values()) total += count;

  const shares = new Map<string, number>();
  if (total <= 0) return shares;
  for (const [id, count] of counts) shares.set(id, count / total);
  return shares;
}

/**
 * Dilute a whole-tree trait by the species' share.
 *
 * A `mul` moves proportionally away from 1 (×1.5 at half the tree is ×1.25), an
 * `add` is simply scaled. Both reduce to "no effect" at share 0 and to the full
 * effect at share 1, which is the only behaviour that makes a tree of one
 * species feel like a tree of that species.
 */
export function scaleTraitValue(type: 'add' | 'mul', value: number, share: number): number {
  const clamped = Math.min(1, Math.max(0, share));
  return type === 'mul' ? 1 + (value - 1) * clamped : value * clamped;
}

/** Where one trait publishes to, or `null` when it publishes nowhere. */
function traitTarget(
  speciesId: string,
  trait: SpeciesTrait,
): { targetKind: 'tag' | 'resource'; target: string } | null {
  switch (trait.target.kind) {
    case 'ownProduction':
      return {
        targetKind: 'tag',
        target: trait.target.resource
          ? speciesResourceTag(speciesId, trait.target.resource)
          : speciesTag(speciesId),
      };
    case 'ownLimbClick':
      return { targetKind: 'tag', target: scopedTag(speciesTag(speciesId), trait.target.stat) };
    case 'ownTag':
      return { targetKind: 'tag', target: scopedTag(speciesTag(speciesId), trait.target.tag) };
    case 'tree':
      return { targetKind: trait.target.targetKind, target: trait.target.target };
    case 'price':
      // Realised by `speciesCostMultiplier`; there is nothing to publish.
      return null;
  }
}

/**
 * Every modifier the tree's current mix of species grants.
 *
 * Only species actually present contribute: a trait belonging to a species the
 * player has never planted publishes nothing, so the modifier list stays the
 * length of the tree's own composition rather than the catalogue's.
 */
export function speciesModifiers(counts: ReadonlyMap<string, number>): Modifier[] {
  const shares = speciesShares(counts);
  const modifiers: Modifier[] = [];

  for (const [speciesId, count] of counts) {
    if (count <= 0) continue;
    const def = lookupSpecies(speciesId);
    if (!def) continue;

    def.traits.forEach((trait, i) => {
      const target = traitTarget(speciesId, trait);
      if (!target) return;

      const value =
        trait.target.kind === 'tree'
          ? scaleTraitValue(trait.type, trait.value, shares.get(speciesId) ?? 0)
          : trait.value;

      modifiers.push({
        id: `species:${speciesId}:${i}`,
        source: SPECIES_SOURCE,
        type: trait.type,
        targetKind: target.targetKind,
        target: target.target,
        value,
      });
    });
  }

  return modifiers;
}

/**
 * The scope tags a tap on `nodeId` resolves its click stats against.
 *
 * A tap knows which limb it landed on, so a species can be worth *tapping*
 * rather than merely worth owning — which is what makes Ironblossom a place on
 * the tree instead of another line in a list.
 */
export function clickScopes(tree: TreeGraph, nodeId: string | null | undefined): string[] {
  if (!nodeId) return [];
  const node = tree.node(nodeId);
  return node ? [speciesTag(node.speciesId)] : [];
}

/** What the engine needs to know to decide which species are available. */
export interface UnlockContext {
  /** Lifetime total earned of a resource. */
  readonly lifetime: (resource: ResourceId) => Decimal;
  /** Parts grown, trunk excluded. */
  readonly parts: number;
  /** Parts of one type currently on the tree. */
  readonly partsOfType: (type: TreeNodeType) => number;
  /** Limbs cut, lifetime. */
  readonly prunes: number;
}

/** Progress toward a species' unlock, for the Journal's locked cards. */
export interface UnlockProgress {
  readonly unlocked: boolean;
  /** How far along, in `[0, 1]`. */
  readonly fraction: number;
  /** One line naming what is still needed. */
  readonly hint: string;
}

/** Progress toward `def`'s unlock milestone, evaluated against live state. */
export function unlockProgress(def: SpeciesDef, ctx: UnlockContext): UnlockProgress {
  const unlock = def.unlock;

  if (unlock.kind === 'starter') {
    return { unlocked: true, fraction: 1, hint: 'Yours from the first tap.' };
  }

  let current: number;
  let goal: number;
  let hint: string;

  switch (unlock.kind) {
    case 'lifetime':
      current = ctx.lifetime(unlock.resource).toNumber();
      goal = unlock.amount;
      hint = `Earn ${unlock.amount} ${unlock.resource} in total.`;
      break;
    case 'parts':
      current = ctx.parts;
      goal = unlock.count;
      hint = `Grow ${unlock.count} parts.`;
      break;
    case 'partsOfType':
      current = ctx.partsOfType(unlock.type);
      goal = unlock.count;
      hint = `Have ${unlock.count} ${unlock.type} on the tree.`;
      break;
    case 'prunes':
      current = ctx.prunes;
      goal = unlock.count;
      hint = `Prune ${unlock.count} limbs.`;
      break;
  }

  const safeGoal = Math.max(1e-9, goal);
  return {
    unlocked: current >= goal,
    fraction: Math.min(1, Math.max(0, current / safeGoal)),
    hint,
  };
}

/** Whether a species can be planted right now. */
export function isSpeciesUnlocked(def: SpeciesDef, ctx: UnlockContext): boolean {
  return unlockProgress(def, ctx).unlocked;
}

/**
 * Ids of every base species the player may currently plant, in catalogue order.
 *
 * Hybrids are never in this list: a hybrid is *made*, at a fork, out of two
 * limbs that already exist. Offering one in the grow menu would make grafting a
 * shopping trip.
 */
export function unlockedSpeciesIds(ctx: UnlockContext): string[] {
  return SPECIES.filter((def) => isSpeciesUnlocked(def, ctx)).map((def) => def.id);
}

/** The hybrid a pair of species would make, or `null` for a pair with no entry. */
export function hybridOf(a: string, b: string): HybridDef | null {
  return hybridFor(a, b);
}

/** Every hybrid id, discovered or not — the Journal's grid. */
export const ALL_HYBRID_IDS = HYBRID_IDS;
