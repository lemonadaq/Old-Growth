/**
 * Offline progress: what the tree does while nobody is watching.
 *
 * The rule the whole step turns on is thematic before it is numeric — **the tree
 * rests and the roots work**. Underground production, which has carried
 * {@link OFFLINE_TAG} since roots existed, earns its full rate; the canopy earns
 * a quarter of its. An idle game that paid the same either way would make the
 * canopy pointless to tend, and one that paid nothing would make closing the tab
 * a punishment.
 *
 * Layer note: content stays free of engine imports. `'canopy'` mirrors the
 * domain tag the part catalogue stamps on every above-ground producer.
 */

/**
 * The three tunables, all of them in `./balance`:
 *
 * - `OFFLINE_MIN_SECONDS` — time away below which nothing happens at all. A tab
 *   reload, a lid closed for a moment, a crash and a restart: the player did not
 *   "go away", and a modal celebrating four seconds of Water would be noise the
 *   first time and an annoyance every time after.
 * - `OFFLINE_CHUNK_SECONDS` — length of one catch-up chunk. Coarse on purpose:
 *   the simulation is correct at any step size, so the only thing a finer chunk
 *   buys is arithmetic and the only thing it costs is a load that hangs. Twelve
 *   hours is 720 chunks, which is instant; the same span at the live 100 ms step
 *   would be 432,000.
 * - `CANOPY_OFFLINE_RATE` — share of its usual rate the canopy earns while the
 *   player is away. Not zero, or every player is pushed toward roots and away
 *   from half the game; not one either, or being *there* is worth nothing.
 */
export {
  CANOPY_OFFLINE_RATE,
  COLLECT_COUNT_UP_MS,
  OFFLINE_CHUNK_SECONDS,
  OFFLINE_MIN_SECONDS,
} from './balance';

/**
 * The producer tag the offline penalty is applied to.
 *
 * Mirrors `TreeDomain`'s `'canopy'`, which every above-ground producer carries.
 * Targeting the canopy rather than "everything that is not underground" is what
 * keeps this expressible as one ordinary modifier: the modifier system matches a
 * producer by tag, and there is no tag meaning "not that one".
 */
export const CANOPY_TAG = 'canopy';

/*
 * `COLLECT_COUNT_UP_MS` (re-exported above) is how long the Collect button's
 * count-up runs — the one number here the player actually feels. Long enough
 * that a big haul *arrives* rather than appearing, short enough that nobody
 * waits for it twice.
 */
