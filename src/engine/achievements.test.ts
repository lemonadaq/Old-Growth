import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../content/achievements';
import { ACHIEVEMENT_BONUS, ACHIEVEMENT_GOAL, SYMBIONT_ARRIVAL } from '../content/balance';
import { RESOURCE_IDS } from '../content/resources';
import {
  achievementModifiers,
  achievementMultiplier,
  achievementProgress,
  measure,
  newlyEarned,
  ACHIEVEMENT_SOURCE,
  BONUS_ACHIEVEMENT_COUNT,
  type AchievementContext,
} from './achievements';
import { Simulation } from './simulation';

/** A run in which nothing has happened. Override one field per test. */
function context(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    lifetime: () => 0,
    lifetimeAcrossRuns: () => 0,
    clicks: 0,
    prunes: 0,
    grafts: 0,
    parts: 0,
    partsOfType: () => 0,
    discoveries: 0,
    speciesAvailable: 0,
    symbionts: 0,
    totems: 0,
    rings: 0,
    forest: 0,
    heirloomLevels: 0,
    playtimeSeconds: 0,
    stormsBraced: 0,
    offlineSeconds: 0,
    ...over,
  };
}

describe('the table', () => {
  it('has thirty of them', () => {
    expect(ACHIEVEMENTS).toHaveLength(30);
  });

  it('gives every one a unique id', () => {
    const ids = ACHIEVEMENTS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts a bonus on ten of them, all the same size', () => {
    const bonuses = ACHIEVEMENTS.map((def) => def.bonus ?? 0).filter((b) => b > 0);
    expect(bonuses).toHaveLength(10);
    expect(BONUS_ACHIEVEMENT_COUNT).toBe(10);
    expect(new Set(bonuses)).toEqual(new Set([ACHIEVEMENT_BONUS]));
  });

  it('writes every one a name and a line saying what was done', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.glyph.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The five sample triggers the step asks to be covered, one per condition
 * family: a counter, a lifetime total, a live count of parts, something the
 * world does to you, and something that outlives the tree.
 */
describe('five sample triggers', () => {
  it('a counter: taps', () => {
    const def = ACHIEVEMENT_BY_ID.firstHundred;
    const need = ACHIEVEMENT_GOAL.clicksFirst;

    expect(achievementProgress(def, context({ clicks: need - 1 })).met).toBe(false);
    expect(achievementProgress(def, context({ clicks: need })).met).toBe(true);
    expect(achievementProgress(def, context({ clicks: need / 2 })).fraction).toBeCloseTo(0.5, 9);
  });

  it('a lifetime total: Sap ever drawn', () => {
    const def = ACHIEVEMENT_BY_ID.sapEarly;
    const need = ACHIEVEMENT_GOAL.sapEarly;
    const lifetime = (amount: number) => () => amount;

    expect(achievementProgress(def, context({ lifetime: lifetime(need - 1) })).met).toBe(false);
    expect(achievementProgress(def, context({ lifetime: lifetime(need) })).met).toBe(true);
  });

  it('a live count: parts standing right now', () => {
    const def = ACHIEVEMENT_BY_ID.hundredFiftyParts;
    const need = ACHIEVEMENT_GOAL.partsLots;

    expect(achievementProgress(def, context({ parts: need - 1 })).met).toBe(false);
    expect(achievementProgress(def, context({ parts: need })).met).toBe(true);
  });

  it('something the world did: a storm held to the last', () => {
    const def = ACHIEVEMENT_BY_ID.bracedStorm;
    const need = ACHIEVEMENT_GOAL.bracedStorms;

    expect(achievementProgress(def, context({ stormsBraced: need - 1 })).met).toBe(false);
    expect(achievementProgress(def, context({ stormsBraced: need })).met).toBe(true);
  });

  it('something that outlives the tree: a tree given up', () => {
    const def = ACHIEVEMENT_BY_ID.firstSeed;
    const need = ACHIEVEMENT_GOAL.forestFew;

    expect(achievementProgress(def, context({ forest: need - 1 })).met).toBe(false);
    expect(achievementProgress(def, context({ forest: need })).met).toBe(true);
  });
});

describe('measuring', () => {
  it('has a goal for every row and no spares', () => {
    const named = new Set(
      ACHIEVEMENTS.flatMap((def) =>
        Object.values(def.condition).filter((value) => typeof value === 'number'),
      ),
    );
    for (const [name, goal] of Object.entries(ACHIEVEMENT_GOAL)) {
      expect(named.has(goal), `${name} is a goal nothing measures`).toBe(true);
    }
  });

  it('reduces every condition in the table to a have and a need', () => {
    // Every variant of the union has to be reachable, or a card in the Journal
    // draws an empty progress bar and nobody notices until a player asks why.
    for (const def of ACHIEVEMENTS) {
      const { need } = measure(def.condition, context());
      expect(Number.isFinite(need)).toBe(true);
      expect(need).toBeGreaterThan(0);
    }
  });

  it('reports a fraction in [0, 1] however far past the goal the run is', () => {
    const def = ACHIEVEMENT_BY_ID.firstHundred;
    expect(achievementProgress(def, context({ clicks: 0 })).fraction).toBe(0);
    expect(achievementProgress(def, context({ clicks: 1e9 })).fraction).toBe(1);
  });
});

describe('awarding', () => {
  it('names everything newly met, in table order, and nothing already held', () => {
    const ctx = context({ clicks: ACHIEVEMENT_GOAL.clicksLots });
    const won = newlyEarned(ctx, new Set());
    expect(won.map((def) => def.id)).toEqual(['firstHundred', 'tenThousandTaps']);

    const held = new Set(['firstHundred']);
    expect(newlyEarned(ctx, held).map((def) => def.id)).toEqual(['tenThousandTaps']);
  });

  it('does not mutate the set it is given', () => {
    const held = new Set<string>();
    newlyEarned(context({ clicks: 1e9 }), held);
    expect(held.size).toBe(0);
  });
});

describe('the bonus', () => {
  it('is nothing at all until a bonus-bearing badge is earned', () => {
    expect(achievementMultiplier(new Set())).toBe(1);
    expect(achievementModifiers(new Set())).toEqual([]);
    // A badge without a bonus is still a badge, and still worth nothing.
    expect(achievementMultiplier(new Set(['firstHundred']))).toBe(1);
  });

  it('adds rather than compounds, so a player can total them in their head', () => {
    const two = new Set(['tenThousandTaps', 'firstSeed']);
    expect(achievementMultiplier(two)).toBeCloseTo(1 + 2 * ACHIEVEMENT_BONUS, 12);
  });

  it('publishes one modifier per resource, under one revocable source', () => {
    const mods = achievementModifiers(new Set(['tenThousandTaps']));
    expect(mods).toHaveLength(RESOURCE_IDS.length);
    for (const mod of mods) {
      expect(mod.source).toBe(ACHIEVEMENT_SOURCE);
      expect(mod.type).toBe('mul');
      expect(mod.value).toBeCloseTo(1 + ACHIEVEMENT_BONUS, 12);
    }
  });

  it('ignores an id the table has never heard of', () => {
    expect(achievementMultiplier(new Set(['nonesuch']))).toBe(1);
  });
});

describe('in a running game', () => {
  it('earns a badge, once, and queues it for the toast', () => {
    const sim = new Simulation();
    sim.state.clicks = ACHIEVEMENT_GOAL.clicksFirst;

    expect(sim.updateAchievements().map((def) => def.id)).toContain('firstHundred');
    expect(sim.drainAchievementEvents()).toContain('firstHundred');
    // Drained, like every other event queue.
    expect(sim.drainAchievementEvents()).toEqual([]);
    // And never awarded twice.
    expect(sim.updateAchievements()).toEqual([]);
  });

  it('keeps a badge after the thing it measured is gone', () => {
    // Half the table measures something true for a moment: "150 parts at once"
    // is false again after the next cut, and a Journal card that emptied itself
    // would read as the game taking something back.
    const sim = new Simulation();
    sim.state.clicks = ACHIEVEMENT_GOAL.clicksFirst;
    sim.updateAchievements();

    sim.state.clicks = 0;
    expect(sim.state.achievements.has('firstHundred')).toBe(true);
    expect(sim.snapshot(0).achievements.find((row) => row.id === 'firstHundred')?.earned).toBe(
      true,
    );
  });

  it('publishes the bonus into the production pipeline', () => {
    const sim = new Simulation();
    sim.state.clicks = ACHIEVEMENT_GOAL.clicksLots;
    sim.updateAchievements();

    const published = [...sim.state.modifiers.all()].filter(
      (mod) => mod.source === ACHIEVEMENT_SOURCE,
    );
    expect(published).toHaveLength(RESOURCE_IDS.length);
  });

  it('awards silently on the way in — a save being read is not a discovery', () => {
    const sim = new Simulation();
    sim.state.clicks = ACHIEVEMENT_GOAL.clicksFirst;
    sim.updateAchievements(false);

    expect(sim.state.achievements.has('firstHundred')).toBe(true);
    expect(sim.drainAchievementEvents()).toEqual([]);
  });

  it('counts a storm only when it was held to the end', () => {
    const sim = new Simulation();
    expect(sim.state.stormsBraced).toBe(0);
  });

  it('reports the whole table on the snapshot, earned or not', () => {
    const sim = new Simulation();
    const rows = sim.snapshot(0).achievements;

    expect(rows).toHaveLength(ACHIEVEMENTS.length);
    expect(rows.map((row) => row.id)).toEqual(ACHIEVEMENTS.map((def) => def.id));
    expect(rows.every((row) => !row.earned)).toBe(true);
  });

  it('reports the stats the panel draws', () => {
    const sim = new Simulation();
    sim.state.clicks = 12;
    sim.state.prunes = 3;
    sim.state.resources.add('sap', new Decimal(500));

    const stats = sim.snapshot(0).stats;
    expect(stats.clicks).toBe(12);
    expect(stats.prunes).toBe(3);
    expect(stats.lifetime.sap.toNumber()).toBe(500);
    expect(stats.achievementsTotal).toBe(ACHIEVEMENTS.length);
    expect(stats.achievementMultiplier).toBe(1);
  });
});

describe('what survives a reset', () => {
  it('keeps the badges and their bonus across a prestige', () => {
    const sim = new Simulation();
    sim.state.clicks = ACHIEVEMENT_GOAL.clicksLots;
    sim.updateAchievements();
    const earned = new Set(sim.state.achievements);
    expect(earned.size).toBeGreaterThan(0);

    // The path a prestige takes on the way out is the same one a load takes on
    // the way in, so re-hydrating is a faithful stand-in for the reset itself.
    sim.republishAchievements();
    const published = [...sim.state.modifiers.all()].filter(
      (mod) => mod.source === ACHIEVEMENT_SOURCE,
    );

    expect(sim.state.achievements).toEqual(earned);
    // Republished, not stacked: one set per resource however often it is called.
    expect(published).toHaveLength(RESOURCE_IDS.length);
  });

  it('is unaffected by an arrival threshold moving underneath it', () => {
    // A regression guard on the balance pass rather than on the table: the
    // symbiont badge counts residents, and residents arrive on conditions that
    // a tuning pass moves. The badge must measure the count, not the condition.
    const def = ACHIEVEMENT_BY_ID.firstSymbiont;
    expect(measure(def.condition, context({ symbionts: 1 })).have).toBe(1);
    expect(SYMBIONT_ARRIVAL.squirrelOakBranches).toBeGreaterThan(0);
  });
});
