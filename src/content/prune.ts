/**
 * Pruning: what cutting a limb off gives back.
 *
 * Two returns, deliberately different in kind. The **refund** is a fraction of
 * what the cut limb is worth as an investment, so re-planning a canopy costs
 * something but never wipes the work out. The **Deadwood** is a fraction of what
 * the limb is worth as *material* — measured from its physical bulk rather than
 * its price, so a fat old branch is worth more timber than a spray of cheap
 * twigs that cost the same.
 *
 * Layer note: content stays free of engine imports; the arithmetic lives in
 * `src/engine/prune.ts`.
 */

/**
 * Share of a subtree's value handed back when it is cut.
 *
 * Quoted against what rebuilding that exact set of parts would cost *right now*
 * rather than against what was historically paid for them. The two are the same
 * number — prices depend only on how many parts of a type the tree carries — and
 * the forward-looking reading is the one a player can check: cut a limb, and 40%
 * of the price tag on putting it back comes home.
 */
export const PRUNE_REFUND_FRACTION = 0.4;

/**
 * Deadwood per unit of canonical wood — the subtree's Σ(thickness × length).
 *
 * Canonical units are tiny (a first-generation branch is 0.023 × 0.3 ≈ 0.007),
 * so this constant carries the whole scale of the Deadwood economy: at 150 a
 * branch is worth about 1 Deadwood and a well-grown limb about 4. First-pass
 * value; STEP 19 owns real balance.
 */
export const DEADWOOD_PER_WOOD = 150;

/**
 * Modifier tag every part price is resolved against.
 *
 * A `mul` of 0.75 here is "growth costs −25%". Prices go through the ordinary
 * `(base + Σadds) × Πmuls` pipeline like everything else, so a discount from a
 * buff, a species and a season would stack without any of them knowing about
 * the others.
 */
export const GROWTH_COST_TAG = 'growth.cost';
