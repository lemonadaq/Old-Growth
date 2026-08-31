import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  type AchievementCondition,
  type AchievementDef,
} from '../content/achievements';
import type { TreeNodeType } from '../content/growth';
import { RESOURCE_IDS, type ResourceId } from '../content/resources';
import { SECONDS_PER_HOUR } from '../content/units';
import type { Modifier } from './modifiers';

/**
 * Awarding achievements: one measurement per row, once a tick.
 *
 * Pure, and taking a {@link AchievementContext} rather than the simulation, for
 * the same reason `progression.ts` does: the Journal wants the same answer the
 * engine does — "how close am I" — and a panel must not be able to award
 * anything by asking.
 *
 * ## Earned is a latch
 *
 * An achievement measures a live counter, but *having* one is remembered, not
 * re-measured. That matters for half the table: "have 150 parts at once" is true
 * for the moment the 150th part goes on and false again after the next prune,
 * and a Journal card that emptied itself when a player cut a limb would read as
 * the game taking something back. So `GameState.achievements` is the record, and
 * this file only ever adds to it.
 *
 * ## Bonuses
 *
 * Ten of the thirty carry `+1%` on everything the tree makes. They are granted
 * as one `mul` per resource under a **single revocable source**, exactly as a
 * season or an heirloom is, so republishing an earned set of twelve can never
 * leave a thirteenth behind — and a prestige, which keeps the achievements and
 * throws the tree away, republishes rather than re-grants.
 */

/** The one source id every achievement bonus is published under. */
export const ACHIEVEMENT_SOURCE = 'achievements';

/** Everything an achievement condition can be measured against. */
export interface AchievementContext {
  /** Lifetime gross of a resource, ever earned this run. */
  readonly lifetime: (resource: ResourceId) => number;
  /**
   * Lifetime gross across every run.
   *
   * Only Seeds actually survive a reset — the registry's totals are rebuilt with
   * the state — so this and {@link lifetime} agree for everything else. It is a
   * separate reading anyway, because "across all your trees" is a claim a reader
   * of the table should be able to trust without knowing which resources happen
   * to be carried today.
   */
  readonly lifetimeAcrossRuns: (resource: ResourceId) => number;
  readonly clicks: number;
  readonly prunes: number;
  readonly grafts: number;
  /** Parts standing right now, trunk excluded. */
  readonly parts: number;
  readonly partsOfType: (type: TreeNodeType) => number;
  readonly discoveries: number;
  readonly speciesAvailable: number;
  readonly symbionts: number;
  readonly totems: number;
  readonly rings: number;
  readonly forest: number;
  readonly heirloomLevels: number;
  /** Wall-clock seconds actually spent playing — absences excluded. */
  readonly playtimeSeconds: number;
  readonly stormsBraced: number;
  /** Seconds the offline calculator has paid out for, cumulatively. */
  readonly offlineSeconds: number;
}

/** How far along one achievement is. */
export interface AchievementProgress {
  readonly met: boolean;
  /** Progress toward it, in `[0, 1]`. */
  readonly fraction: number;
  /** What the player has, and what they need — for the Journal's `12 / 25`. */
  readonly have: number;
  readonly need: number;
}

/** A ratio of two numbers, clamped, and safe when the target is zero. */
function ratio(have: number, need: number): number {
  if (!(need > 0)) return 1;
  if (!Number.isFinite(have)) return have > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, have / need));
}

/**
 * Reduce a condition to the pair of numbers behind it.
 *
 * Every variant collapses to "how much do I have, how much do I need", which is
 * what makes the Journal's progress bars one component rather than seventeen.
 */
export function measure(
  condition: AchievementCondition,
  ctx: AchievementContext,
): { readonly have: number; readonly need: number } {
  switch (condition.kind) {
    case 'lifetime':
      return { have: ctx.lifetime(condition.resource), need: condition.amount };
    case 'lifetimeAcrossRuns':
      return { have: ctx.lifetimeAcrossRuns(condition.resource), need: condition.amount };
    case 'clicks':
      return { have: ctx.clicks, need: condition.count };
    case 'prunes':
      return { have: ctx.prunes, need: condition.count };
    case 'grafts':
      return { have: ctx.grafts, need: condition.count };
    case 'parts':
      return { have: ctx.parts, need: condition.count };
    case 'partsOfType':
      return { have: ctx.partsOfType(condition.type), need: condition.count };
    case 'discoveries':
      return { have: ctx.discoveries, need: condition.count };
    case 'speciesAvailable':
      return { have: ctx.speciesAvailable, need: condition.count };
    case 'symbionts':
      return { have: ctx.symbionts, need: condition.count };
    case 'totems':
      return { have: ctx.totems, need: condition.count };
    case 'rings':
      return { have: ctx.rings, need: condition.count };
    case 'forest':
      return { have: ctx.forest, need: condition.count };
    case 'heirloomLevels':
      return { have: ctx.heirloomLevels, need: condition.count };
    case 'playtime':
      return { have: ctx.playtimeSeconds, need: condition.seconds };
    case 'stormsBraced':
      return { have: ctx.stormsBraced, need: condition.count };
    case 'offlineHours':
      return { have: ctx.offlineSeconds, need: condition.hours * SECONDS_PER_HOUR };
  }
}

/** Measure one achievement against the run. */
export function achievementProgress(
  def: AchievementDef,
  ctx: AchievementContext,
): AchievementProgress {
  const { have, need } = measure(def.condition, ctx);
  return { met: have >= need, fraction: ratio(have, need), have, need };
}

/**
 * Every achievement newly earned by this reading, in table order.
 *
 * Takes the earned set and does **not** mutate it: the caller adds, because the
 * caller is also the one that has to queue the toast, and a function that both
 * awarded and reported would make "award silently on load" impossible to write.
 */
export function newlyEarned(
  ctx: AchievementContext,
  earned: ReadonlySet<string>,
): AchievementDef[] {
  const won: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (earned.has(def.id)) continue;
    if (achievementProgress(def, ctx).met) won.push(def);
  }
  return won;
}

/**
 * The multiplier the earned set is worth on everything the tree makes.
 *
 * Additive between achievements rather than compounding — ten of them is `×1.10`
 * and not `×1.1046`. A player counting `+1%` badges should be able to add them
 * up in their head and get the number the HUD shows.
 */
export function achievementMultiplier(earned: ReadonlySet<string>): number {
  let bonus = 0;
  for (const id of earned) bonus += ACHIEVEMENT_BY_ID[id]?.bonus ?? 0;
  return 1 + bonus;
}

/**
 * The modifiers the earned set publishes: one `mul` per resource, the way a Ring
 * works. Empty when nothing bonus-bearing has been earned, so the common early
 * case adds nothing at all to the modifier list.
 */
export function achievementModifiers(earned: ReadonlySet<string>): Modifier[] {
  const multiplier = achievementMultiplier(earned);
  if (multiplier === 1) return [];

  return RESOURCE_IDS.map((resource) => ({
    source: ACHIEVEMENT_SOURCE,
    type: 'mul' as const,
    targetKind: 'resource' as const,
    target: resource,
    value: multiplier,
  }));
}

/** How many of the thirty carry a bonus — stated once, read by the Journal. */
export const BONUS_ACHIEVEMENT_COUNT = ACHIEVEMENTS.filter((a) => (a.bonus ?? 0) > 0).length;
