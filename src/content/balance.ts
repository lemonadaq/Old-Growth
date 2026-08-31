import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';

/**
 * **Every tunable number in the game, in one file.**
 *
 * This is the balance pass's desk. A curve, a cost, a threshold, a duration, a
 * cap — if a designer would want to move it, it is declared here and imported
 * by whichever module reads it. The topic modules (`./growth`, `./prestige`,
 * `./light`, …) keep their prose and their shapes; what they no longer keep is
 * an opinion about *how big* anything is.
 *
 * Two rules hold this in place:
 *
 * 1. `/src/engine` contains no numeric literals beyond structural ones. That is
 *    enforced, not merely intended — `scripts/check-magic-numbers.mjs` walks the
 *    engine and fails on any value that is not in its allowlist, and
 *    `src/engine/magicNumbers.test.ts` runs it in CI.
 * 2. Nothing here imports from `/src/engine`, so the balance table stays
 *    readable by a headless bot (`npm run sim`) with no simulation standing up
 *    around it.
 *
 * Durations are in **engine seconds** unless a name says otherwise — the same
 * clock buffs, seasons and symbiont cadences run on, so none of it can be waited
 * out by closing the tab. Lengths are in **canonical tree units** (1 ≈ a mature
 * tree's height). See BALANCE.md for the reasoning behind the shapes below and
 * the simulation output they were tuned against.
 */

/* ==================================================================== clicks */

/**
 * Unmodified starting values for the four click stats.
 *
 * The opening loop is priced off `clickPower`: at 1 Sap a tap, a branch at 15
 * is about ten taps once the combo is running, which is the first-branch-in-30s
 * target with room to spare for a player reading the tooltip.
 */
export const BASE_CLICK_POWER = 1;

/** Probability of a critical tap, in `[0, 1]`. */
export const BASE_CRIT_CHANCE = 0.02;

/** Payout multiplier on a critical tap. */
export const BASE_CRIT_MULT = 10;

/** Combo stacks the meter can hold before upgrades widen it. */
export const BASE_COMBO_CAP = 50;

/** Clicks within this many ms of the previous one lose no combo. */
export const COMBO_WINDOW_MS = 1500;

/** The meter is fully empty this many ms after the last click. */
export const COMBO_DECAY_MS = 3000;

/** Stack count at which the combo bonus reaches {@link COMBO_BONUS_AT_FULL}. */
export const COMBO_FULL_STACKS = 50;

/** Bonus click power granted at {@link COMBO_FULL_STACKS} stacks (1 = +100%). */
export const COMBO_BONUS_AT_FULL = 1;

/** Pointer distance (CSS px) within which a tap still counts as hitting wood. */
export const CLICK_TOLERANCE_PX = 16;

/* ==================================================================== growth */

/**
 * Every part costs `baseCost × this^(parts of that type already owned)`.
 *
 * The single most load-bearing number in the game: it is what turns "buy the
 * cheapest thing" into a decision, and it is what stops a bot that only ever
 * grows leaves from outrunning one that balances. Raised from the first-pass
 * 1.15 — at 1.15 the twentieth leaf still cost under 200 Sap and a canopy-only
 * strategy simply never met a wall.
 */
export const PART_COST_GROWTH = 1.16;

/**
 * Price of the very first part of each type.
 *
 * The trunk is free because it is where the run starts. Everything else is
 * priced against Sap, which is the only resource a new tree has.
 */
export const PART_BASE_COST: Readonly<Record<TreeNodeType, number>> = {
  trunk: 0,
  branch: 15,
  twig: 8,
  leafCluster: 10,
  blossom: 60,
  rootSegment: 12,
  rootTip: 35,
};

/**
 * Units per second a grown part contributes, before modifiers.
 *
 * A leaf is worth more than a root segment because a leaf is the half of the
 * game that only pays while you are watching; the roots make up the difference
 * by working through the night. Raised from the first-pass 0.4/0.3/0.12: the
 * first simulation pass put the first prestige beyond three hours on every
 * strategy, and lifetime Light is what the maturity gate is measured in.
 */
export const PART_BASE_RATE = {
  /** Light per second per leaf cluster, before shading. */
  leafCluster: 0.55,
  /** Light per second per blossom. Unshaded — a blossom sits in the open. */
  blossom: 0.2,
  /** Water per second per root segment. Paid in full while the tab is shut. */
  rootSegment: 0.42,
  /** Minerals per second per root tip, and only inside a vein. */
  rootTip: 0.16,
} as const;

/**
 * Fraction of the parent's length below which spread children never attach —
 * limbs sprout from the upper half, not out of the base.
 */
export const ATTACH_SPREAD_MIN = 0.45;

/* ================================================================== upgrades */

/**
 * The repeatable click upgrades: first-level price and per-level cost growth.
 *
 * Stronger Taps is the cheapest thing in the game on purpose — it is the first
 * purchase most players make and the one that teaches that Sap is for spending.
 * Rhythm of Growth doubles because a wider combo cap compounds with every other
 * click bonus, and a compounding effect on a shallow curve is a runaway.
 */
export const UPGRADE_COST: Readonly<
  Record<string, { readonly base: number; readonly growth: number }>
> = {
  strongerTaps: { base: 10, growth: 1.5 },
  sharperInstincts: { base: 50, growth: 1.6 },
  rhythmOfGrowth: { base: 250, growth: 2 },
  /** Paid in the thing it collects; bought once and never again. */
  rake: { base: 40, growth: 1 },
};

/** Sap per tap one level of Stronger Taps adds. */
export const STRONGER_TAPS_POWER = 1;

/** Critical chance one level of Sharper Instincts adds. */
export const SHARPER_INSTINCTS_CRIT = 0.01;

/** Combo stacks one level of Rhythm of Growth banks. */
export const RHYTHM_COMBO_CAP = 10;

/* ================================================================ hydration */

/** Water per second one leaf cluster wants in order to run at full rate. */
export const WATER_NEED_PER_LEAF = 0.35;

/** Floor on the hydration multiplier: a parched canopy still limps along. */
export const HYDRATION_MIN = 0.25;

/** Ceiling on the hydration multiplier: surplus Water stops paying past here. */
export const HYDRATION_MAX = 1.5;

/* ==================================================================== light */

/** Length of one in-game day, in real seconds. */
export const DAY_LENGTH_SECONDS = 480;

/** Where in the day a brand-new tree sprouts — mid-morning, sun still climbing. */
export const DAY_START_FRACTION = 0.22;

/** Fraction of the day at which the sun has set. */
export const SUNLIT_FRACTION = 0.62;

/** How far above a leaf another leaf can be and still shade it, in world units. */
export const OCCLUSION_RANGE = 250;

/** Full width of the cone a leaf casts its shadow down, in degrees. */
export const OCCLUSION_CONE_DEGREES = 60;

/**
 * Each shading leaf takes this fraction of the light that reaches through the
 * ones above it — compounding, not subtracting.
 */
export const SHADE_PER_OCCLUDER = 0.15;

/** Floor on a leaf's shade factor: a buried leaf stays faintly productive. */
export const EXPOSURE_MIN = 0.1;

/** How close a blossom must be to a leaf to be worth anything to it. */
export const BLOSSOM_BOOST_RANGE = 150;

/** Exposure a nearby blossom adds to a leaf cluster. */
export const BLOSSOM_BOOST = 0.25;

/** How many blossoms one leaf may be paid for. */
export const BLOSSOM_BOOST_MAX_STACKS = 2;

/** What the canopy earns at night, as a fraction of its daytime rate. */
export const MOONLIGHT_FRACTION = 0.1;

/** How often leaf exposure is recomputed, in simulation seconds. */
export const EXPOSURE_INTERVAL_SECONDS = 1;

/** Seconds of current Sap income the dawn Dew burst is worth. */
export const DEW_SECONDS = 60;

/** Floor on the Dew burst, in taps' worth of Sap. */
export const DEW_MIN_TAPS = 30;

/* ================================================================== grafting */

/**
 * What the first graft costs, before the per-graft escalation.
 *
 * Priced in two resources on purpose: Sap says "you have been tapping" and
 * Water says "you have been digging", so a hybrid is the first thing in the
 * game that cannot be bought by doing only half of it.
 *
 * Raised from the first pass (250 Sap, 60 Water) once the simulation could
 * measure it. At that price the tapping bot had the shape *and* the money
 * eight and a half minutes in, well inside the window meant for the second
 * species to be worth planting; the whole cost of a graft was about twenty
 * seconds of income.
 */
export const GRAFT_BASE_COST: readonly {
  readonly resource: ResourceId;
  readonly amount: number;
}[] = [
  { resource: 'sap', amount: 700 },
  { resource: 'water', amount: 180 },
];

/** Each graft multiplies the price of the next by this. */
export const GRAFT_COST_GROWTH = 1.6;

/* =================================================================== seasons */

/** Engine days each season runs for. */
export const SEASON_LENGTH_DAYS = 20;

/** Length of one season in engine seconds. */
export const SEASON_LENGTH_SECONDS = SEASON_LENGTH_DAYS * DAY_LENGTH_SECONDS;

/** Seasons in a year — the length of the `SEASONS` table, restated as a number. */
export const SEASONS_PER_YEAR = 4;

/** Length of a full year in engine seconds. */
export const YEAR_LENGTH_SECONDS = SEASON_LENGTH_SECONDS * SEASONS_PER_YEAR;

/** Growth discount in Spring: prices are multiplied by `1 - this`. */
export const SPRING_GROWTH_DISCOUNT = 0.2;

/** Light bonus in Summer. */
export const SUMMER_LIGHT_BONUS = 0.3;

/**
 * How much Winter takes off the canopy and how much dearer it makes growing.
 *
 * The design line is "Light and growth −60%". Light is the plain reading: the
 * canopy earns 40% of what it would. Growth cannot be, because Spring already
 * spends "−20%" on making growth *cheaper* — a winter that discounted prices
 * further would be a reward for the hardest season in the game. So winter's
 * −60% is the same axis in the opposite direction: growth costs ×1.6.
 */
export const WINTER_PENALTY = 0.6;

/* ----------------------------------------------------------------- rings */

/**
 * What surviving one full winter is permanently worth: `×1.05` on all
 * production, compounding with every ring the trunk carries.
 *
 * A ring is the only permanent multiplier in the game that cannot be bought,
 * only outlasted — which is what makes the worst season worth sitting through
 * rather than worth logging off for.
 */
export const RING_PRODUCTION_BONUS = 0.05;

/* ------------------------------------------------------------ leaf litter */

/** Engine seconds between leaf-litter piles forming at the base in Autumn. */
export const LITTER_INTERVAL_SECONDS = 20;

/**
 * Most piles allowed on the ground at once.
 *
 * A cap is what keeps autumn a *rhythm* — sweep the base every so often — rather
 * than a chore that accumulates while the player is looking at their roots.
 */
export const LITTER_MAX_PILES = 6;

/** Leaf Litter one pile carries, per leaf cluster in the canopy. */
export const LITTER_PER_LEAF = 0.8;

/** Smallest pile worth drawing: a bare tree still sheds *something*. */
export const LITTER_MIN_AMOUNT = 1;

/** Half-width of the band piles land in, in canonical units either side of the trunk. */
export const LITTER_SPREAD = 0.42;

/* =================================================================== weather */

/** Shortest gap between the end of one weather event and the start of the next. */
export const WEATHER_MIN_GAP_SECONDS = 150;

/** Longest such gap. */
export const WEATHER_MAX_GAP_SECONDS = 420;

/**
 * How far ahead an event announces itself.
 *
 * Ten seconds of gathering sky and a rising note is the whole point of the storm
 * minigame: bracing is only a decision if the player is told in time to make it.
 */
export const WEATHER_TELEGRAPH_SECONDS = 10;

/** How long the rain lasts, and what it does to Water while it falls. */
export const RAIN_DURATION_SECONDS = 90;
export const RAIN_WATER_MULTIPLIER = 3;

/** How long a storm blows, which is also the length of the brace window. */
export const STORM_DURATION_SECONDS = 15;

/** Taps on the anchor that count as a full brace. */
export const STORM_BRACE_TAPS = 20;

/** Chance an unbraced wide limb snaps. A full brace takes this to zero. */
export const STORM_SNAP_CHANCE = 0.4;

/**
 * Hard ceiling on limbs lost to one storm.
 *
 * The design says "never destroys more than 2 limbs", and it is load-bearing: a
 * storm that could take a canopy apart would make the game about being present
 * for the weather, which is the opposite of what an idle game is for.
 */
export const STORM_MAX_SNAPS = 2;

/**
 * How far off vertical a limb has to lean before the wind can get under it, in
 * degrees. A limb reaching out sideways is the one that snaps; the leader,
 * pointing into the wind, is not.
 */
export const STORM_WIDE_DEGREES = 45;

/** How long a drought runs, and what it leaves of Water income while it does. */
export const DROUGHT_DURATION_SECONDS = 120;
export const DROUGHT_WATER_MULTIPLIER = 0.3;

/* ==================================================================== prune */

/**
 * Share of a subtree's value handed back when it is cut, quoted against what
 * rebuilding that exact set of parts would cost right now.
 */
export const PRUNE_REFUND_FRACTION = 0.4;

/**
 * Deadwood per unit of canonical wood — the subtree's Σ(thickness × length).
 *
 * Canonical units are tiny (a first-generation branch is 0.023 × 0.3 ≈ 0.007),
 * so this constant carries the whole scale of the Deadwood economy: at 150 a
 * branch is worth about 1 Deadwood and a well-grown limb about 4.
 */
export const DEADWOOD_PER_WOOD = 150;

/* ================================================================== offline */

/** Time away below which nothing happens at all. */
export const OFFLINE_MIN_SECONDS = 60;

/** Length of one catch-up chunk, in seconds. */
export const OFFLINE_CHUNK_SECONDS = 60;

/** Share of its usual rate the canopy earns while the player is away. */
export const CANOPY_OFFLINE_RATE = 0.25;

/** Hours of absence the tree pays for before the calculator stops counting. */
export const BASE_OFFLINE_CAP_HOURS = 8;

/** How long the Collect button's count-up runs, in milliseconds. */
export const COLLECT_COUNT_UP_MS = 1500;

/* ================================================================= prestige */

/**
 * Lifetime Light the tree must have gathered before it can seed.
 *
 * The gate, and the first of the two prestige numbers to reason about: it is
 * "how long is a run", and the simulation says a canopy that has stopped
 * growing earns roughly 20 Light a second, so this is about an hour of tree.
 * See BALANCE.md.
 */
export const PRESTIGE_LIGHT_REQUIREMENT = 7.8e4;

/**
 * Seeds the first prestige pays — the run that ends exactly on the gate.
 *
 * The design's payout is a square root, so the second Seed of a *single* run
 * costs four times the first and the tenth a hundred times; that curve is
 * intact. What this sets is where it starts, and it was the difference between
 * a meta layer and a decoration. At one Seed the first prestige bought the
 * cheapest node in the Vault — 200 Sap, about eight seconds of tapping — and
 * the second run was measurably *slower* than the first, because starting over
 * cost more than the reward was worth. At eight, the first prestige buys a real
 * decision: a head start, or the Canopy Map that replays the tree you gave up.
 */
export const FIRST_PRESTIGE_SEEDS = 8;

/**
 * Lifetime Light one Seed is measured against: `Seeds = ⌊√(light / this)⌋`.
 *
 * Derived rather than declared, so the gate and the payout cannot drift apart:
 * a run that ends exactly on {@link PRESTIGE_LIGHT_REQUIREMENT} pays exactly
 * {@link FIRST_PRESTIGE_SEEDS}, by construction.
 */
export const SEED_LIGHT_DIVISOR =
  PRESTIGE_LIGHT_REQUIREMENT / (FIRST_PRESTIGE_SEEDS * FIRST_PRESTIGE_SEEDS);

/** Seed Fragments the songbird has to drop before they are worth one Seed. */
export const SEED_FRAGMENTS_PER_SEED = 100;

/**
 * How tall the tree must stand before it can seed, in canonical units.
 *
 * A bare trunk is 0.6, so this is a little under twice the sapling the run
 * starts as. **The canopy has a ceiling and this has to sit well under it**:
 * `depthFalloff` shrinks every generation of wood, so height is not something
 * more Sap can buy past a point.
 *
 * Lowered from 1.15 during the STEP 19 pass, and the reason is worth keeping.
 * A tree grown greedily up its own highest tip tops out around 1.15 — the gate
 * was sitting *on* the ceiling, and whether a given run cleared it came down to
 * the few degrees of deterministic jitter each fork is given. Reshuffling that
 * jitter (the trunk's root reservation changed which slot the first branch
 * takes) was enough to make maturity unreachable on trees that had reached it
 * the day before. A gate a player can miss by luck is not a gate.
 *
 * Light is the binding half of maturity by design; this is the half that says
 * "and it has to be a *tree*".
 */
export const PRESTIGE_HEIGHT_UNITS = 1.05;

/** How long the "Go to Seed" ceremony runs before the reset lands. */
export const CEREMONY_SECONDS = 6;

/** What one tree standing in the Old Growth forest adds to all production. */
export const FOREST_PRODUCTION_BONUS = 0.01;

/** Most silhouettes drawn on the hills at once; past this the forest is a counter. */
export const FOREST_RENDER_LIMIT = 30;

/* ============================================================== progression */

/** Sap the first beat waits for — about ten taps, before anything else exists. */
export const FIRST_TAP_SAP = 10;

/**
 * Lifetime Sap at which the ground opens up.
 *
 * The roots-at-3-4-minutes target is this number divided by how fast a player
 * taps, so it is the one threshold the milestone table moves most directly.
 */
export const ROOT_REVEAL_SAP = 2200;

/**
 * Parts grown that *also* open the ground, whatever the Sap says.
 *
 * The Sap threshold on its own made the roots milestone a measure of how hard
 * the player taps, and nothing else: the simulation's tapping bot reached it
 * in three minutes and its root-focused bot in five and a half, on the same
 * game. That is not two ways to play, it is one way to play and one way to be
 * late.
 *
 * A tree that has been *built* has earned the ground as surely as one that has
 * been tapped, so either does it. Whichever arrives first is the answer, which
 * pulls the two strategies back together without slowing the one in front.
 */
export const ROOT_REVEAL_PARTS = 47;

/** Parts on the tree before the scissors come out. */
export const PRUNE_UNLOCK_PARTS = 8;

/** Distinct species standing on the tree before the knife does. */
export const GRAFT_UNLOCK_SPECIES = 2;

/** How interested a creature has to be before the panel about creatures appears. */
export const SYMBIONT_PANEL_INTEREST = 0.5;

/** Maturity at which Go to Seed becomes visible — greyed, with its progress on it. */
export const PRESTIGE_REVEAL_MATURITY = 0.75;

/** How long a hint bubble stays up before it counts as read, in ms. */
export const HINT_DURATION_MS = 14_000;

/* =============================================================== milestones */

/**
 * What a species unlock is measured against.
 *
 * Birch and Willow sit early on purpose: a second species is what opens
 * grafting, and the first-graft-at-15-minutes target is really "how long until
 * two woods stand on the same tree".
 */
export const SPECIES_UNLOCK = {
  /** Parts grown before Birch is available. */
  birchParts: 215,
  /** Lifetime Water before Willow is. */
  willowWater: 120_000,
  /** Lifetime Light before Maple is. */
  mapleLight: 45_000,
  /** Cuts made before Pine is. */
  pinePrunes: 3,
  /** Lifetime Sap before Cherry is. */
  cherrySap: 600_000,
} as const;

/**
 * What each creature is waiting for.
 *
 * A symbiont is a milestone in fiction — *the tree is now big enough that
 * something has moved in* — so each of these has to be a thing the player
 * notices doing. The squirrel used to want a single oak branch, which every
 * tree grows in its first ten seconds; the simulation duly reported "first
 * symbiont: 0s" on all three strategies, which is another way of saying the
 * creature was part of the starting position rather than a reward.
 */
export const SYMBIONT_ARRIVAL = {
  /** Blossoms on the tree before the bees find it. */
  beeBlossoms: 3,
  /** Lifetime Deadwood before the ants build their road. */
  antDeadwood: 5,
  /** Root tips down in the clay before the fungal web takes hold. */
  mycorrhizaTips: 1,
  /** Canonical tree height before a songbird will nest in it. */
  songbirdHeight: 1.25,
  /** Oak branches before a squirrel moves in. */
  squirrelOakBranches: 12,
} as const;

/* ============================================================= achievements */

/**
 * What a bonus-bearing achievement is worth: `+1%` on everything the tree makes.
 *
 * Ten of the thirty carry one. Small on purpose — an achievement is a record of
 * something the player did, and one worth chasing for its number would turn the
 * list into a checklist. Ten of them together is a Ring's worth of production,
 * earned across a whole first run rather than in one winter.
 */
export const ACHIEVEMENT_BONUS = 0.01;

/** How long an achievement toast stays up, in milliseconds. */
export const ACHIEVEMENT_TOAST_MS = 6000;

/**
 * Thresholds the achievement table is measured against.
 *
 * One entry per row of the table and no spares: a goal nothing measures is a
 * number that looks tuned and is not, and the next person to move it would be
 * moving nothing.
 */
export const ACHIEVEMENT_GOAL = {
  clicksFirst: 100,
  clicksLots: 10_000,
  sapEarly: 1_000,
  sapLate: 10_000_000,
  lightEarly: 1_000,
  lightMid: 250_000,
  mineralsEarly: 250,
  litterEarly: 100,
  deadwoodEarly: 50,
  partsFew: 10,
  partsLots: 150,
  leavesMany: 25,
  rootsMany: 20,
  blossomsFew: 5,
  prunesFew: 5,
  graftsFew: 1,
  discoveriesAll: 15,
  symbiontsFew: 1,
  symbiontsAll: 5,
  speciesAll: 6,
  ringsFew: 1,
  ringsMany: 4,
  forestFew: 1,
  forestMany: 5,
  seedsMany: 25,
  heirloomsFew: 5,
  totemsFew: 1,
  bracedStorms: 1,
  playtimeHour: 3_600,
  offlineHours: 8,
} as const;

/* ============================================================== simulation */

/**
 * The headless harness's assumptions and targets — the contract the balance
 * table is tuned against. `npm run sim` prints a pass/fail column from these.
 *
 * `clicksPerSecond` is the one *player* assumption in the file: five taps a
 * second is a comfortable sustained rate that holds the combo window open
 * without being a macro.
 */
export const SIM = {
  /**
   * Taps per second a bot sustains while it is clicking.
   *
   * Three, not five. Five is a rate a person can hold for a burst and not for
   * an hour, and the pacing tests in `simulation.test.ts` already call three
   * "a comfortable pace" — running the harness faster than that would have made
   * every number in BALANCE.md a claim about a player nobody is.
   */
  clicksPerSecond: 3,
  /**
   * Fixed step the harness advances the simulation by, in seconds.
   *
   * Coarser than the live 100 ms tick. Every system the engine advances is
   * written against elapsed seconds rather than tick counts, so the run is the
   * same run — it just costs a quarter as much wall clock, which is what makes
   * re-running the table after every edit to this file practical.
   */
  stepSeconds: 0.25,
  /** Give up on a strategy after this long, in engine seconds. */
  horizonSeconds: 4 * 3600,
  /** Milestone targets, in seconds, as `[min, max]`. */
  targets: {
    firstBranch: [0, 30],
    rootsUnlocked: [150, 300],
    firstGraft: [540, 1200],
    firstSymbiont: [60, 900],
    firstPrestige: [2700, 4500],
    secondPrestige: [3300, 6900],
  },
  /**
   * How much better the best strategy may be than the worst on any one
   * milestone before the balance is called lopsided.
   */
  maxStrategySpread: 2,
} as const satisfies {
  clicksPerSecond: number;
  stepSeconds: number;
  horizonSeconds: number;
  targets: Readonly<Record<string, readonly [number, number]>>;
  maxStrategySpread: number;
};

/** Resource ids the Stats panel reports lifetime totals for, in display order. */
export const STAT_RESOURCES: readonly ResourceId[] = [
  'sap',
  'light',
  'water',
  'minerals',
  'leafLitter',
  'deadwood',
  'seeds',
];

/* ========================================================== engine framing */

/**
 * The numbers the engine runs *on* rather than the ones it pays out: tick rate,
 * safety caps, camera limits, the seed behind the tree's wobble.
 *
 * Not balance in the "how long until my first prestige" sense, but every one of
 * them is a value somebody might reasonably want to change, and none of them
 * should be a bare literal buried in a module. They live here for the same
 * reason the costs do — so `scripts/check-magic-numbers.mjs` can hold the engine
 * to the rule that a number with a meaning has a name.
 */

/** Simulation ticks per second. */
export const TICK_RATE = 10;

/**
 * Largest frame delta processed in one call, in milliseconds. Longer gaps (tab
 * backgrounded, breakpoint hit) are clamped so the loop never tries to catch up
 * with an unbounded number of ticks — the classic "spiral of death".
 */
export const MAX_FRAME_MS = 250;

/**
 * Most cadence payouts a single symbiont call may settle.
 *
 * A long absence must not spin: the ledger can be handed a jump of hours, and
 * the honest answer is "as many as fit, up to a sane bound" rather than a loop
 * whose length is decided by how long the player was away.
 */
export const MAX_CATCH_UP_PAYOUTS = 512;

/** Most weather events one catch-up may resolve, for the same reason. */
export const MAX_WEATHER_STEPS = 64;

/** Floor on the season-length factor: Tempo can never collapse the year to a tick. */
export const MIN_SEASON_LENGTH_FACTOR = 0.1;

/** Zoom limits. 1 fits the tree; below 1 pulls back, above 1 leans in. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;

/** Highest the view may rise, in canonical units above the ground line. */
export const CLOUD_LEVEL_Y = 2.4;

/** Deepest the view may sink. Roots bottom out well above this. */
export const BEDROCK_Y = -2.4;

/** How far either side of the trunk the view may wander. */
export const HORIZONTAL_SPAN = 2;

/** One notch of keyboard or button zoom. */
export const ZOOM_STEP = 1.2;

/** Seed behind the tree's deterministic angle wobble. */
export const DEFAULT_TREE_SEED = 20260806;

/** Canopy limbs never point below this angle above horizontal, in degrees. */
export const CANOPY_MIN_ELEVATION_DEGREES = 8;

/** Roots never point above this angle below horizontal, in degrees. */
export const ROOT_MIN_DEPRESSION_DEGREES = 8;

/**
 * How a fork fans out: the innermost slot sits at this fraction of the spread
 * arc, and the outermost at `FAN_INNER + FAN_RAMP`. Keeping the inner slot off
 * zero is what stops the first two children of a fork from overlapping.
 */
export const FAN_INNER = 0.45;
export const FAN_RAMP = 0.55;
