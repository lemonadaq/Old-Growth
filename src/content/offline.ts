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
 * Time away below which nothing happens at all.
 *
 * A tab reload, a laptop lid closed for a moment, a crash and a restart: the
 * player did not "go away", and a modal celebrating four seconds of Water would
 * be noise the first time and an annoyance every time after.
 */
export const OFFLINE_MIN_SECONDS = 60;

/**
 * Length of one catch-up chunk, in seconds.
 *
 * Coarse on purpose. The simulation is correct at any step size — every system
 * it advances is written against elapsed seconds rather than tick counts — so
 * the only thing a finer chunk buys is arithmetic, and the only thing it costs
 * is a load that hangs. Twelve hours is 720 chunks, which is instant; the same
 * span at the live 100 ms step would be 432,000.
 */
export const OFFLINE_CHUNK_SECONDS = 60;

/**
 * Share of its usual rate the canopy earns while the player is away.
 *
 * Not zero: leaves do not stop working because a tab closed, and a canopy that
 * paid nothing offline would push every player toward roots and away from half
 * the game. Not one either — being *there* has to be worth more than not being
 * there, or active play has nothing to offer.
 */
export const CANOPY_OFFLINE_RATE = 0.25;

/**
 * The producer tag the offline penalty is applied to.
 *
 * Mirrors `TreeDomain`'s `'canopy'`, which every above-ground producer carries.
 * Targeting the canopy rather than "everything that is not underground" is what
 * keeps this expressible as one ordinary modifier: the modifier system matches a
 * producer by tag, and there is no tag meaning "not that one".
 */
export const CANOPY_TAG = 'canopy';

/**
 * How long the Collect button's count-up runs, in milliseconds.
 *
 * The one number here the player actually feels. Long enough that a big haul
 * *arrives* rather than appearing, short enough that nobody waits for it twice.
 */
export const COLLECT_COUNT_UP_MS = 1500;
