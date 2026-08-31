import { SIM } from '../../src/content/balance';
import { HEIRLOOMS, HEIRLOOM_BY_ID } from '../../src/content/prestige';
import { SPECIES } from '../../src/content/species';
import { UPGRADES } from '../../src/content/upgrades';
import type { TreeNodeType } from '../../src/content/growth';
import { GRAFT_MIN_CHILDREN } from '../../src/content/hybrids';
import type { PricedGrowthOption } from '../../src/engine/growth';
import type { TreeNode } from '../../src/engine/treeGraph';
import Decimal from 'break_infinity.js';
import type { ResourceId } from '../../src/content/resources';
import { graftCost, isMatureForGraft } from '../../src/engine/graft';
import { isMaxed, upgradeCost } from '../../src/engine/upgrades';
import { createSeededRandom } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/simulation';
import { createInitialState } from '../../src/engine/types';
import { bestPurchase, STRATEGIES, type Strategy } from './strategies';

/**
 * The headless balance harness — `npm run sim`.
 *
 * It runs the **real engine**, with no DOM and no renderer, driven by three bots
 * (see `./strategies.ts`), and prints how long each one took to reach each
 * milestone. That is the whole idea: a balance pass on an idle game is a claim
 * about *time*, and the only honest way to check a claim about time is to let
 * the clock run.
 *
 * A run is deterministic — every roll comes from a seeded PRNG and the bots have
 * no randomness of their own — so a change to `balance.ts` moves the table by
 * exactly as much as it moves the game, and two people reading BALANCE.md are
 * reading the same numbers.
 *
 * What it deliberately does **not** model: a player who gets bored, a player who
 * closes the tab (offline progress is a separate calculation and would make the
 * table a claim about absence rather than about balance), and a player who reads
 * the Journal. All three make the game faster, so every number here is a
 * pessimistic bound.
 */

/**
 * Parts of a newly unlocked wood the bot plants before it goes back to the
 * cheapest thing. Enough that two of them can plausibly meet at a fork.
 */
const GRAFT_SEED_PARTS = 4;

/** The milestones the table is keyed on, in the order they should happen. */
const MILESTONES = [
  'firstBranch',
  'rootsUnlocked',
  'firstGraft',
  'firstSymbiont',
  'firstPrestige',
  'secondPrestige',
] as const;

type MilestoneId = (typeof MILESTONES)[number];

/** Human-readable milestone names, for the table's left column. */
const MILESTONE_LABEL: Readonly<Record<MilestoneId, string>> = {
  firstBranch: 'First branch',
  rootsUnlocked: 'Roots unlocked',
  firstGraft: 'First graft',
  firstSymbiont: 'First symbiont',
  firstPrestige: 'First prestige',
  secondPrestige: 'Second prestige',
};

/** Engine seconds each milestone landed at, or `null` if it never did. */
type Times = Record<MilestoneId, number | null>;

export interface RunResult {
  readonly strategy: Strategy;
  readonly times: Times;
  /** The most parts the tree ever carried at once, across every run. */
  readonly finalParts: number;
  readonly finalSeeds: number;
  readonly clicks: number;
}

/* ------------------------------------------------------------------- the bot */

/**
 * Buy whatever the strategy wants, until it cannot afford anything.
 *
 * Bounded rather than looped to exhaustion: a bot holding a large balance early
 * in a run can afford a *lot* of twigs, and letting it spend the whole balance
 * inside one simulated second would make the tree's shape an artefact of when
 * the planner happened to run.
 */
function spend(sim: Simulation, strategy: Strategy, maxBuys: number): void {
  // While a graft is still being saved for, the graft's price is not spendable.
  //
  // Roots are bought with Water and a graft is paid partly in Water, so a bot
  // that spent every drop the moment it landed could never afford one — which
  // is what the first simulation pass reported as "first graft: 32 minutes" on
  // every strategy, all of them waiting for a storm to blow enough canopy off
  // that the roots finally outran the leaves. A player saving for a hybrid
  // simply stops buying roots for a minute, so the bot does too.
  const reserve = new Map<ResourceId, Decimal>();
  if (sim.state.grafts === 0 && sim.unlockedSpecies().length >= 2) {
    for (const line of graftCost(sim.state.grafts)) reserve.set(line.resource, line.amount);
  }

  for (let i = 0; i < maxBuys; i += 1) {
    const pick = bestPurchase(sim, strategy.weights, reserve);
    if (!pick) return;
    if (!sim.growPart(pick.nodeId, pick.type)) return;
  }
}

/**
 * Buy click upgrades while they are cheap relative to the balance.
 *
 * The appetite is a fraction of the *current* balance rather than a level cap,
 * so a strategy that earns faster naturally buys more of them — which is the
 * behaviour that makes the clicker bot a real corner of the space rather than a
 * balanced bot with a different label.
 */
function buyUpgrades(sim: Simulation, strategy: Strategy): void {
  const appetite = strategy.weights.upgradeAppetite;
  if (appetite <= 0) return;

  // Priced through the ledger rather than through `snapshot()`: a snapshot
  // rebuilds every species unlock, every gate and every heirloom row, and the
  // harness takes this decision thousands of times a run.
  for (const def of UPGRADES) {
    const level = sim.state.upgrades.level(def.id);
    if (isMaxed(def, level)) continue;

    const cost = upgradeCost(def, level);
    const balance = sim.state.resources.amount(def.costResource);
    if (cost.gt(balance.mul(appetite))) continue;
    sim.buyUpgrade(def.id);
  }
}

/**
 * Plant whatever is newly available, so a second wood reaches the tree.
 *
 * Grafting needs two species standing at one fork, and the only way a bot gets
 * there is by *changing what it plants* the moment a milestone hands it a
 * choice. A player does this because the new wood is interesting; the bot does
 * it because otherwise the graft milestone is unreachable and the table would
 * report a design problem that does not exist.
 */
function rotateSpecies(sim: Simulation): void {
  const unlocked = sim.unlockedSpecies();
  if (unlocked.length < 2) return;
  // While a graft is still being chased, the wood being planted is that plan's
  // to choose. Rotating underneath it would move the target every time another
  // species unlocked, and the bot would spend the run planting one part of
  // everything and grafting none of it.
  if (sim.state.grafts === 0) return;

  const onTree = sim.state.tree.countBySpecies();
  // Under-represented rather than merely absent: a tree carrying exactly one
  // part of a second species is usually carrying it as a leaf, which no graft
  // can use.
  const missing = unlocked.find((id) => (onTree.get(id) ?? 0) < GRAFT_SEED_PARTS);
  if (missing) sim.setPlantingSpecies(missing);
}

/**
 * Try every fork on the tree and take the first graft that is both legal and
 * affordable.
 *
 * First rather than best: the hybrid table is fixed and every entry is a
 * discovery, so there is no "wrong" graft to protect the bot from — and a bot
 * that shopped for the strongest hybrid would be measuring the hybrid table
 * rather than the time it takes to reach one.
 */
function tryGraft(sim: Simulation): boolean {
  for (const node of sim.state.tree.allNodes()) {
    if (!isMatureForGraft(node)) continue;
    for (const childId of node.childIds) {
      const child = sim.state.tree.node(childId);
      if (!child || !isMatureForGraft(child)) continue;
      if (sim.graft(node.id, child.id)) return true;
    }
  }
  return false;
}

/**
 * Actually go and make a hybrid, rather than waiting for one to happen.
 *
 * A graft needs a very specific shape: a branch carrying at least one child,
 * with a *branch child of a different wood* that also carries a child. Left to
 * its rate-per-Sap scoring the bot builds that shape only by accident, which is
 * why the first table put the graft milestone half an hour after the second
 * species unlocked and gave the three bots wildly different answers.
 *
 * That was never a fact about the balance. It was the bot not trying. A player
 * who wants a hybrid picks a fork and builds it in three purchases, so the bot
 * does the same: one part per planning tick, cheapest legal spot, and only
 * until the first graft lands.
 */
function pursueGraft(sim: Simulation): void {
  if (sim.state.grafts > 0) return;
  const tree = sim.state.tree;

  const unlocked = sim.unlockedSpecies();
  if (unlocked.length < 2) return;

  // One target wood, held until the graft lands: whichever unlocked species the
  // tree carries least of, which on a fresh run is the one that just unlocked.
  const onTree = tree.countBySpecies();
  const planting = unlocked.reduce((fewest, id) =>
    (onTree.get(id) ?? 0) < (onTree.get(fewest) ?? 0) ? id : fewest,
  );
  sim.setPlantingSpecies(planting);

  // A legal pair already exists — take it.
  if (tryGraft(sim)) return;

  /** The cheapest affordable option of `type` on `nodeId`, if the rules allow one. */
  const cheapest = (nodeId: string, type: TreeNodeType) =>
    sim
      .growthOptions(nodeId)
      .filter((option) => option.rule.type === type && option.affordable)
      .sort((a, b) => a.cost.cmp(b.cost))[0] ?? null;

  const branches = tree.allNodes().filter((node) => node.type === 'branch');

  // A branch of the new wood is up but bare. Give it the child that makes it
  // count as established.
  for (const scion of branches) {
    if (scion.speciesId !== planting) continue;
    if (scion.childIds.length >= GRAFT_MIN_CHILDREN) continue;
    for (const type of ['twig', 'leafCluster'] as const) {
      if (cheapest(scion.id, type) && sim.growPart(scion.id, type)) return;
    }
  }

  // Otherwise put a branch of the new wood on an established branch of another,
  // cheapest fork first — the graft only cares that the two meet, not where.
  const forks = branches
    .filter(
      (node) =>
        node.speciesId !== planting &&
        node.childIds.length >= GRAFT_MIN_CHILDREN &&
        !node.childIds.some((id) => tree.node(id)?.speciesId === planting),
    )
    .map((node) => ({ node, option: cheapest(node.id, 'branch') }))
    .filter(
      (entry): entry is { node: TreeNode; option: PricedGrowthOption } => entry.option !== null,
    )
    .sort((a, b) => a.option.cost.cmp(b.option.cost));

  if (forks.length > 0) {
    sim.growPart(forks[0].node.id, 'branch');
    return;
  }

  // Nowhere to put it. A branch holds four children and the scorer fills every
  // slot it can reach, so by the time a second wood unlocks the whole tree is
  // full — and a graft needs a *slot*, not just Sap.
  //
  // This is what the scissors are for, and what a player does here: cut one
  // leaf off a suitable fork and plant the new wood in the gap. The cut is
  // limited to a single leaf cluster (the cheapest thing on the tree to buy
  // back) and only while the tree has never been grafted, so the bot cannot
  // prune its way through the run.
  for (const node of branches) {
    if (node.speciesId === planting) continue;
    if (node.childIds.length < GRAFT_MIN_CHILDREN + 1) continue;
    const spare = node.childIds
      .map((id) => tree.node(id))
      .find((child): child is TreeNode => child?.type === 'leafCluster');
    if (spare && sim.prunePart(spare.id)) return;
  }
}

/**
 * Spend Seeds on the Vault: anything that replays the tree or lifts every rate
 * first, then whatever is cheapest.
 *
 * The ordering is the whole reason the second-prestige milestone lands where it
 * does, so it is worth stating what it is *not*. Cheapest-first spends the
 * first payout on 200 starting Sap — eight seconds of tapping — and the second
 * run comes out barely faster than the first. Dearest-first is worse: it buys
 * whatever happens to cost the most, which in this Vault is a longer offline
 * cap the harness cannot use at all. Neither is a player.
 *
 * A player reads the two lines that say *the tree you gave up comes back* and
 * *everything makes more*, and buys those. Within each tier the bot still takes
 * the cheapest, because a Seed spent is a Seed that cannot be saved.
 */
function heirloomRank(id: string): number {
  const def = HEIRLOOM_BY_ID[id];
  if (!def) return 2;
  if (def.effects.some((effect) => effect.kind === 'memory')) return 0;
  if (def.effects.some((effect) => effect.kind === 'allProduction')) return 1;
  return 2;
}

function buyHeirlooms(sim: Simulation): void {
  for (;;) {
    const snapshot = sim.snapshot(0).prestige.heirlooms;
    const buyable = snapshot
      .filter((h) => h.unlocked && !h.maxed && h.affordable)
      .sort((a, b) => heirloomRank(a.id) - heirloomRank(b.id) || a.cost.cmp(b.cost));
    if (buyable.length === 0) return;
    if (!sim.buyHeirloom(buyable[0].id)) return;
  }
}

/* ---------------------------------------------------------------- the runner */

/**
 * How often the bot stops to think, in simulated seconds.
 *
 * A player does not re-price the whole tree ten times a second, and neither
 * should the harness: the sweep is the expensive part of a run, and thinking
 * twice as often does not buy a decision the next second would not have made.
 */
const PLAN_INTERVAL_SECONDS = 2;

/** Run one strategy to the horizon (or until both prestiges land). */
export function runStrategy(strategy: Strategy, seed: number): RunResult {
  const random = createSeededRandom(seed);
  const sim = new Simulation(createInitialState(0), random);

  const times: Times = {
    firstBranch: null,
    rootsUnlocked: null,
    firstGraft: null,
    firstSymbiont: null,
    firstPrestige: null,
    secondPrestige: null,
  };

  const step = SIM.stepSeconds;
  const steps = Math.ceil(SIM.horizonSeconds / step);
  const clicksPerStep = SIM.clicksPerSecond * step;
  const planEvery = Math.max(1, Math.round(PLAN_INTERVAL_SECONDS / step));

  let clickDebt = 0;
  let prestiges = 0;
  // Counted across runs: a prestige throws the tree and its tallies away, so
  // reading either off the final state would report the seedling the run ended
  // on rather than the run.
  let clicks = 0;
  let seenClicks = 0;
  let peakParts = 0;

  for (let i = 0; i < steps; i += 1) {
    // The harness keeps its own clock. `state.elapsedSeconds` is the *tree's*,
    // and a prestige builds a fresh state — so reading milestones off it would
    // stamp everything after the first reset with the time since that reset.
    const elapsed = i * step;

    // Taps first: they resolve outside the tick in the real game too, and the
    // Sap they pay is what the planner below is about to spend.
    clickDebt += clicksPerStep;
    while (clickDebt >= 1) {
      clickDebt -= 1;
      sim.click(elapsed * 1000, random, sim.state.tree.rootId);
    }

    sim.tick(step);

    if (i % planEvery === 0) {
      // The graft plan goes first: it needs a *slot*, and the scorer below
      // fills every slot it can reach.
      pursueGraft(sim);
      rotateSpecies(sim);
      buyUpgrades(sim, strategy);
      spend(sim, strategy, 6);

      if (sim.canGoToSeed()) sim.goToSeed();
      if (sim.state.resources.amount('seeds').gt(0)) buyHeirlooms(sim);
    }

    const now = elapsed + step;
    if (times.firstBranch === null && sim.state.tree.countOfType('branch') > 0) {
      times.firstBranch = now;
    }
    if (times.rootsUnlocked === null && sim.hasFeature('roots')) times.rootsUnlocked = now;
    if (times.firstGraft === null && sim.state.grafts > 0) times.firstGraft = now;
    if (times.firstSymbiont === null && sim.state.symbionts.size > 0) times.firstSymbiont = now;

    peakParts = Math.max(peakParts, sim.state.tree.size - 1);
    // The counter resets with the tree, and it resets inside the ceremony
    // rather than at the moment the forest grows — so the only safe reading is
    // "it went down, bank what it was".
    if (sim.state.clicks < seenClicks) clicks += seenClicks;
    seenClicks = sim.state.clicks;

    if (sim.state.forest.length > prestiges) {
      prestiges = sim.state.forest.length;
      if (prestiges === 1) times.firstPrestige = now;
      if (prestiges === 2) {
        times.secondPrestige = now;
        break;
      }
    }
  }

  return {
    strategy,
    times,
    finalParts: peakParts,
    finalSeeds: sim.state.resources.total('seeds').toNumber(),
    clicks: clicks + seenClicks,
  };
}

/* ---------------------------------------------------------------- reporting */

/** `2h 05m`, `18m 20s`, `24s`, or a dash for a milestone never reached. */
export function formatTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  const restSeconds = total % 60;
  if (minutes < 60) return `${minutes}m ${String(restSeconds).padStart(2, '0')}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/**
 * Whether the milestone table meets the targets in `balance.ts`.
 *
 * Two questions, and they are different questions. **In window** asks whether
 * every strategy lands inside the designed band — that is the pacing claim.
 * **Spread** asks whether the fastest strategy is more than `maxStrategySpread`
 * times the slowest — that is the dominance claim, and it is the one that
 * actually decides whether the game has three ways to play or one.
 */
export function verdicts(results: readonly RunResult[]): {
  readonly lines: readonly string[];
  readonly ok: boolean;
} {
  const lines: string[] = [];
  let ok = true;

  for (const id of MILESTONES) {
    const times = results.map((r) => r.times[id]);
    const target = (SIM.targets as Record<string, readonly [number, number] | undefined>)[id];

    if (times.some((t) => t === null)) {
      lines.push(`${pad(MILESTONE_LABEL[id], 17)} not reached by every strategy`);
      ok = false;
      continue;
    }

    const reached = times as number[];
    const slowest = Math.max(...reached);
    const fastest = Math.max(1, Math.min(...reached));
    const spread = slowest / fastest;

    const notes: string[] = [];
    if (target) {
      const [min, max] = target;
      const inside = reached.every((t) => t >= min && t <= max);
      if (!inside) ok = false;
      notes.push(
        `${inside ? 'in window' : 'OUT OF WINDOW'} (${formatTime(min)}–${formatTime(max)})`,
      );
    }
    if (spread > SIM.maxStrategySpread) {
      ok = false;
      notes.push(`SPREAD ${spread.toFixed(2)}× > ${SIM.maxStrategySpread}×`);
    } else {
      notes.push(`spread ${spread.toFixed(2)}×`);
    }

    lines.push(`${pad(MILESTONE_LABEL[id], 17)} ${notes.join(', ')}`);
  }

  return { lines, ok };
}

/** The whole report, as text, so BALANCE.md and stdout can never disagree. */
export function report(results: readonly RunResult[]): string {
  const out: string[] = [];
  const nameWidth = 17;
  const colWidth = 12;

  out.push('Time to milestone');
  out.push('');
  out.push(pad('', nameWidth) + results.map((r) => padStart(r.strategy.label, colWidth)).join(''));
  for (const id of MILESTONES) {
    out.push(
      pad(MILESTONE_LABEL[id], nameWidth) +
        results.map((r) => padStart(formatTime(r.times[id]), colWidth)).join(''),
    );
  }

  out.push('');
  out.push(
    pad('Parts at peak', nameWidth) +
      results.map((r) => padStart(String(r.finalParts), colWidth)).join(''),
  );
  out.push(
    pad('Taps', nameWidth) + results.map((r) => padStart(String(r.clicks), colWidth)).join(''),
  );
  out.push(
    pad('Seeds earned', nameWidth) +
      results.map((r) => padStart(r.finalSeeds.toFixed(0), colWidth)).join(''),
  );

  const { lines, ok } = verdicts(results);
  out.push('');
  out.push('Against the targets in balance.ts');
  out.push('');
  out.push(...lines.map((line) => `  ${line}`));
  out.push('');
  out.push(ok ? 'All targets met.' : 'Targets NOT met.');

  return out.join('\n');
}

/* --------------------------------------------------------------------- main */

/**
 * Seed behind every roll in a reported run.
 *
 * Fixed so the table in BALANCE.md is reproducible. Pass `--seed=N` to check
 * that a result is not an artefact of this one.
 */
const DEFAULT_SEED = 19;

function main(): void {
  const seedArg = process.argv.find((a) => a.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.slice('--seed='.length)) : DEFAULT_SEED;

  console.log(`Old Growth — balance simulation (seed ${seed})`);
  console.log(
    `${SPECIES.length} species, ${HEIRLOOMS.length} heirlooms, ${UPGRADES.length} upgrades`,
  );
  console.log('');
  for (const strategy of STRATEGIES) {
    console.log(`  ${pad(strategy.label, 10)} ${strategy.blurb}`);
  }
  console.log('');

  const results = STRATEGIES.map((strategy) => {
    const started = Date.now();
    const result = runStrategy(strategy, seed);
    const wall = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`  ran ${strategy.id} in ${wall}s`);
    return result;
  });

  console.log(report(results));

  const { ok } = verdicts(results);
  process.exitCode = ok ? 0 : 1;
}

main();
