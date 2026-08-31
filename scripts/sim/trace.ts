import { SIM } from '../../src/content/balance';
import { createSeededRandom } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/simulation';
import { createInitialState } from '../../src/engine/types';
import { bestPurchase, STRATEGIES } from './strategies';
import { formatTime } from './run';

/**
 * `npm run sim:trace -- --strategy=balanced` — one run, narrated.
 *
 * The milestone table says *when*; this says *why*. It prints a line a minute
 * with the two numbers behind maturity (height and lifetime Light, each as a
 * fraction of its gate), what the tree is made of, and what it is earning — so a
 * balance change can be aimed at the gate that is actually binding instead of at
 * whichever number was easiest to reach.
 *
 * A tuning instrument, not a test. It asserts nothing.
 */

const MINUTE = 60;

function main(): void {
  const arg = (name: string, fallback: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

  const wanted = arg('strategy', 'balanced');
  const strategy = STRATEGIES.find((s) => s.id === wanted) ?? STRATEGIES[0];
  const seed = Number(arg('seed', '19'));
  const untilSeconds = Number(arg('minutes', '90')) * MINUTE;
  const every = Number(arg('every', '5')) * MINUTE;

  const random = createSeededRandom(seed);
  const sim = new Simulation(createInitialState(0), random);

  const step = SIM.stepSeconds;
  const clicksPerStep = SIM.clicksPerSecond * step;
  const planEvery = Math.max(1, Math.round(2 / step));
  let clickDebt = 0;

  console.log(`trace: ${strategy.label}, seed ${seed}`);
  console.log(
    [
      'time',
      'height',
      'light',
      'parts',
      'leaves',
      'roots',
      'light/s',
      'sap/tap',
      'sapEarned',
      'species',
      'grafts',
    ].join('\t'),
  );

  for (let i = 0; i * step < untilSeconds; i += 1) {
    const elapsed = i * step;

    clickDebt += clicksPerStep;
    while (clickDebt >= 1) {
      clickDebt -= 1;
      sim.click(elapsed * 1000, random, sim.state.tree.rootId);
    }
    sim.tick(step);

    if (i % planEvery === 0) {
      const unlocked = sim.unlockedSpecies();
      const onTree = sim.state.tree.countBySpecies();
      const missing = unlocked.find((id) => (onTree.get(id) ?? 0) < 3);
      if (missing && unlocked.length >= 2) sim.setPlantingSpecies(missing);

      for (let n = 0; n < 6; n += 1) {
        const pick = bestPurchase(sim, strategy.weights);
        if (!pick || !sim.growPart(pick.nodeId, pick.type)) break;
      }
      if (sim.canGoToSeed()) sim.goToSeed();
    }

    if (elapsed % every === 0) {
      const progress = sim.prestigeProgress();
      const tree = sim.state.tree;
      console.log(
        [
          formatTime(elapsed),
          progress.heightFraction.toFixed(3),
          progress.lightFraction.toFixed(3),
          Math.max(0, tree.size - 1),
          tree.countOfType('leafCluster'),
          tree.countOfType('rootSegment') + tree.countOfType('rootTip'),
          sim.state.resources.perSecond('light').toNumber().toFixed(1),
          sim.snapshot(0).clickStats.clickPower.toFixed(1),
          sim.state.resources.total('sap').toNumber().toFixed(0),
          sim.unlockedSpecies().length,
          sim.state.grafts,
        ].join('\t'),
      );
    }
  }
}

main();
