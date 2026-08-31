import {
  FIRST_TAP_SAP,
  GRAFT_UNLOCK_SPECIES,
  PRESTIGE_REVEAL_MATURITY,
  PRUNE_UNLOCK_PARTS,
  ROOT_REVEAL_PARTS,
  ROOT_REVEAL_SAP,
  SYMBIONT_PANEL_INTEREST,
} from './balance';
import type { TreeNodeType } from './growth';
import type { ResourceId } from './resources';
import { PICKER_MIN_SPECIES } from './species';

/**
 * Progression: what the game shows a new player, and when.
 *
 * Three tables, all of them data, all of them read by one evaluator in
 * `src/engine/progression.ts`:
 *
 * - {@link FEATURES} — the **feature gating table**. One row per system the game
 *   holds back, with the measurement that opens it. This is the single source of
 *   truth: the HUD asks it whether to draw a button, the Journal's Help tab asks
 *   it what is still needed, and the simulation asks it whether a purchase is
 *   allowed. Nothing anywhere else is permitted its own opinion about when
 *   pruning becomes available.
 * - {@link BEATS} — the scripted first session. Two beats, each *live* while its
 *   window is open rather than fired once, because both are answers to "what do
 *   I do now" and a player who looks away for ten seconds must still get one.
 * - {@link HINTS} — the contextual bubbles. Each is shown **at most once ever**,
 *   which is what makes them worth reading; the seen list lives in the settings
 *   and can be cleared from the Settings panel.
 *
 * The whole file is written to one rule: **no modal walls**. Nothing here stops
 * the game, takes the pointer, or has an OK button. A beat is a shape drawn on
 * the tree, a hint is a bubble in a corner with a ✕ on it, and a gate is a
 * control that is not there yet. A player who ignores every word of it still
 * arrives at roots, because the thing that unlocks roots is tapping the tree.
 *
 * Layer note: content stays free of engine imports. Requirements are declarations
 * measured by the engine, exactly as `SpeciesUnlock` is.
 */

/* --------------------------------------------------- the numbers, from balance */

/**
 * Every gate's threshold, tuned in `./balance` and re-exported here so the table
 * below reads as one page:
 *
 * - `FIRST_TAP_SAP` — Sap the first beat waits for. About ten taps, before
 *   anything else exists.
 * - `ROOT_REVEAL_SAP` / `ROOT_REVEAL_PARTS` — the two routes to the ground
 *   opening, whichever arrives first. Chosen so a player who does nothing but
 *   tap reaches it inside a few minutes, and one who spends everything on tree
 *   gets there at about the same time: the roots are the half of the game that
 *   runs while the tab is shut, and a first session that ends before they exist
 *   is one that never showed what the game is.
 * - `PRUNE_UNLOCK_PARTS` — parts on the tree before the scissors come out.
 * - `GRAFT_UNLOCK_SPECIES` — distinct species standing before the knife does.
 * - `SYMBIONT_PANEL_INTEREST` — how interested a creature has to be before the
 *   panel about creatures appears. Half-way rather than on arrival: its job is to
 *   say "something is nearly here and this is what it wants".
 * - `PRESTIGE_REVEAL_MATURITY` — maturity at which Go to Seed becomes visible,
 *   greyed, with its progress on it. Not at 100%: a prestige button that appears
 *   already pressable is a button nobody has thought about.
 * - `HINT_DURATION_MS` — how long a hint bubble stays up before it counts as read.
 */
export {
  FIRST_TAP_SAP,
  GRAFT_UNLOCK_SPECIES,
  HINT_DURATION_MS,
  PRESTIGE_REVEAL_MATURITY,
  PRUNE_UNLOCK_PARTS,
  ROOT_REVEAL_PARTS,
  ROOT_REVEAL_SAP,
  SYMBIONT_PANEL_INTEREST,
} from './balance';

/* -------------------------------------------------------- the measurements */

/**
 * A measurement of the run, declared rather than computed.
 *
 * The same vocabulary as `SpeciesUnlock`, deliberately: a player cannot tell the
 * difference between "birch is available" and "pruning is available", so the two
 * should not be expressed in different languages.
 */
export type Requirement =
  /** Open from the first frame. */
  | { readonly kind: 'always' }
  /** Lifetime total of a resource, ever earned this run. */
  | { readonly kind: 'lifetime'; readonly resource: ResourceId; readonly amount: number }
  /** Parts grown, trunk excluded. */
  | { readonly kind: 'parts'; readonly count: number }
  /** Parts of one type currently on the tree. */
  | { readonly kind: 'partsOfType'; readonly type: TreeNodeType; readonly count: number }
  /** Base species the player may currently plant. */
  | { readonly kind: 'speciesAvailable'; readonly count: number }
  /** Distinct species actually standing on the tree, the trunk's included. */
  | { readonly kind: 'speciesOnTree'; readonly count: number }
  /** How close the most-courted creature is to moving in, in `[0, 1]`. */
  | { readonly kind: 'symbiontInterest'; readonly fraction: number }
  /** How close the tree is to being able to seed, in `[0, 1]`. */
  | { readonly kind: 'maturity'; readonly fraction: number }
  /** Trees already standing in the Old Growth forest. */
  | { readonly kind: 'forest'; readonly count: number }
  /** Met as soon as any one of its parts is. */
  | { readonly kind: 'any'; readonly of: readonly Requirement[] };

/* ------------------------------------------------------ the gating table */

/** Every system the game holds back until the player has a reason for it. */
export type FeatureId =
  'roots' | 'pruning' | 'speciesPicker' | 'grafting' | 'symbionts' | 'seasons' | 'prestige';

export interface FeatureDef {
  readonly id: FeatureId;
  /** What the player would call it. */
  readonly label: string;
  /** What it is, in fiction. Read out by the Journal's Help tab. */
  readonly blurb: string;
  /** The measurement that opens it. */
  readonly requirement: Requirement;
  /** One line naming what is still needed, shown while it is shut. */
  readonly locked: string;
}

/**
 * The gating table.
 *
 * Order is the order things happen in, which is also the order the Help tab
 * reads in and the order a queued hint bubble comes up in.
 */
export const FEATURES: readonly FeatureDef[] = [
  {
    id: 'seasons',
    label: 'The turning year',
    blurb:
      'Spring is cheap to grow in, summer is bright, autumn drops what the soil will eat, ' +
      'and winter takes something back. The year turns whether or not you are watching, and ' +
      'every winter you stand through lays a ring in the trunk that never goes away.',
    // Always visible, and named in the table anyway: a system with no gate is
    // still a system the Help tab has to be able to describe, and a special case
    // for "this one is never locked" is one more thing to get wrong.
    requirement: { kind: 'always' },
    locked: '',
  },
  {
    id: 'roots',
    label: 'Roots',
    blurb:
      'Everything above ground stops when you do. Roots do not: they draw Water while the ' +
      'tab is shut, and the deeper they reach the more they find. A root tip that lands in a ' +
      'mineral vein worries Minerals out of the clay.',
    // Either route opens it: Sap drawn, or tree built. See ROOT_REVEAL_PARTS.
    requirement: {
      kind: 'any',
      of: [
        { kind: 'lifetime', resource: 'sap', amount: ROOT_REVEAL_SAP },
        { kind: 'parts', count: ROOT_REVEAL_PARTS },
      ],
    },
    locked: `Draw ${ROOT_REVEAL_SAP} Sap from the tree, or grow ${ROOT_REVEAL_PARTS} parts`,
  },
  {
    id: 'symbionts',
    label: 'Symbionts',
    blurb:
      'Creatures are not bought. Each one is waiting for a particular shape of tree — three ' +
      'blossoms, a root in the clay, an oak branch to sit on — and moves in of its own accord ' +
      'the moment it finds one. Once in residence they can be kept better, and never leave.',
    requirement: { kind: 'symbiontInterest', fraction: SYMBIONT_PANEL_INTEREST },
    locked: 'Grow something a creature wants to live in',
  },
  {
    id: 'pruning',
    label: 'Pruning',
    blurb:
      'A cut limb pays back part of what it cost, and gives up Deadwood besides. Cut the ' +
      'tree’s leader and the buds below it are released — apical dominance broken — and ' +
      'everything grows harder for a while.',
    requirement: { kind: 'parts', count: PRUNE_UNLOCK_PARTS },
    locked: `Grow ${PRUNE_UNLOCK_PARTS} parts`,
  },
  {
    id: 'speciesPicker',
    label: 'Species',
    blurb:
      'Six woods, each good at one thing and honest about what it gives up for it. What you ' +
      'plant next is chosen in the ring of buds; what is already standing keeps the wood it ' +
      'was grown as.',
    requirement: { kind: 'speciesAvailable', count: PICKER_MIN_SPECIES },
    locked: 'Earn a second species',
  },
  {
    id: 'grafting',
    label: 'Grafting',
    blurb:
      'Bind two limbs of different woods at a fork and the scion becomes something that is ' +
      'neither. Fifteen hybrids exist and the table is fixed, so a pairing that worked once ' +
      'works always — the Journal keeps what you have found.',
    requirement: { kind: 'speciesOnTree', count: GRAFT_UNLOCK_SPECIES },
    locked: `Grow parts of ${GRAFT_UNLOCK_SPECIES} different species`,
  },
  {
    id: 'prestige',
    label: 'Going to seed',
    blurb:
      'A tree that has reached its height and its Light can go to seed. It stands on the ' +
      'hills from then on, adding to everything that comes after it, and the Seeds it leaves ' +
      'buy Heirlooms in the Vault — the only things that outlive a tree.',
    // Sticky past the first prestige: the Vault is also where Seeds are spent,
    // and hiding it from a player who has Seeds in hand would hide the whole
    // point of having earned them.
    requirement: {
      kind: 'any',
      of: [
        { kind: 'maturity', fraction: PRESTIGE_REVEAL_MATURITY },
        { kind: 'forest', count: 1 },
      ],
    },
    locked: `Grow to ${Math.round(PRESTIGE_REVEAL_MATURITY * 100)}% maturity`,
  },
];

/** Lookup from id → definition. */
export const FEATURE_BY_ID: Readonly<Record<FeatureId, FeatureDef>> = Object.fromEntries(
  FEATURES.map((def) => [def.id, def]),
) as Record<FeatureId, FeatureDef>;

/* ------------------------------------------------------------- the beats */

/** What a live beat draws on the canvas. */
export type BeatStyle =
  /** A ring that breathes around the thing to press. */
  | 'pulse'
  /** An arrow that leans toward it. */
  | 'arrow';

export interface BeatDef {
  readonly id: string;
  /** One line, in the imperative, next to the mark. */
  readonly line: string;
  readonly style: BeatStyle;
  /** The window opens when this is met. */
  readonly from: Requirement;
  /** …and shuts the moment this is. */
  readonly until: Requirement;
}

/**
 * The first two minutes, as two marks on the trunk.
 *
 * Both are **live states rather than one-off events**, which is the whole
 * difference between a hint and a tutorial: a player who tapped once, went to
 * make tea and came back still gets the arrow, and a player who did not need it
 * never sees it because their window shut before they looked.
 *
 * Beats three and four of the scripted opening are not here, because they are
 * not marks on the tree. The first leaf earns a card about Light (see
 * {@link HINTS}), and the ground opening at {@link ROOT_REVEAL_SAP} is a feature
 * unlocking — the camera's one-off pan hangs off that, not off a beat.
 */
export const BEATS: readonly BeatDef[] = [
  {
    id: 'firstTap',
    line: 'Tap the trunk',
    style: 'pulse',
    from: { kind: 'always' },
    // Either enough Sap or a tree that already has something on it: a run
    // started with an heirloom limb has plainly worked out how to tap.
    until: {
      kind: 'any',
      of: [
        { kind: 'lifetime', resource: 'sap', amount: FIRST_TAP_SAP },
        { kind: 'parts', count: 1 },
      ],
    },
  },
  {
    id: 'firstBranch',
    line: 'Tap it again — the buds open',
    style: 'arrow',
    from: { kind: 'lifetime', resource: 'sap', amount: FIRST_TAP_SAP },
    until: { kind: 'parts', count: 1 },
  },
];

/* ------------------------------------------------------------- the hints */

/** Where a bubble sits. Two places, so a bubble can never land on the tree. */
export type HintAnchor =
  /** Under the resource readout, top left. */
  | 'resources'
  /** Under the tool buttons, top right. */
  | 'tools';

export interface HintDef {
  readonly id: string;
  readonly title: string;
  /** One or two sentences. Anything longer belongs in the Help tab. */
  readonly body: string;
  readonly anchor: HintAnchor;
  /** When it becomes worth saying. */
  readonly when: Requirement;
}

/**
 * The contextual bubbles.
 *
 * One at a time, in this order, each shown **once ever** and then remembered in
 * the settings. The rule they are all written to: say what just became possible
 * and why it is worth doing, in one breath, and never explain something the
 * player can see for themselves.
 *
 * Every one of them is optional. Nothing in the game requires a hint to have
 * been read, and the Journal's Help tab says all of it again, in order, for a
 * player who cleared them or never had them.
 */
export const HINTS: readonly HintDef[] = [
  {
    id: 'light',
    title: 'Leaves make Light',
    body:
      'That cluster is gathering Light every second, even between taps — and it will gather ' +
      'more where nothing above it is in the way.',
    anchor: 'resources',
    when: { kind: 'partsOfType', type: 'leafCluster', count: 1 },
  },
  {
    id: 'symbionts',
    title: 'Something is interested',
    // Written to be true whether or not a creature has already turned up: the
    // squirrel wants one oak branch, so on most trees this bubble and the
    // squirrel's own arrival card land within a second of each other.
    body:
      'Creatures move in on their own when the tree suits them. The Symbionts panel (S) shows ' +
      'who has arrived and what the others are still waiting for.',
    anchor: 'tools',
    when: { kind: 'symbiontInterest', fraction: SYMBIONT_PANEL_INTEREST },
  },
  {
    id: 'pruning',
    title: 'The scissors are out',
    body:
      'Cutting a limb pays back some of its Sap and leaves you Deadwood. Take the highest one ' +
      'and the rest of the tree wakes up.',
    anchor: 'tools',
    when: { kind: 'parts', count: PRUNE_UNLOCK_PARTS },
  },
  {
    id: 'species',
    title: 'A second wood',
    body: 'The ring of buds now has chips on it. What you pick is what the next part is made of.',
    anchor: 'tools',
    when: { kind: 'speciesAvailable', count: PICKER_MIN_SPECIES },
  },
  {
    id: 'grafting',
    title: 'Two woods, one limb',
    body:
      'Graft (G) joins two neighbouring limbs of different species into a hybrid. The Journal ' +
      'keeps every one you find.',
    anchor: 'tools',
    when: { kind: 'speciesOnTree', count: GRAFT_UNLOCK_SPECIES },
  },
  {
    id: 'prestige',
    title: 'The tree is getting old',
    body:
      'Three quarters grown. When it is ready it can go to seed: the tree joins the hills, and ' +
      'the Seeds buy things that outlive it.',
    anchor: 'tools',
    when: { kind: 'maturity', fraction: PRESTIGE_REVEAL_MATURITY },
  },
];

/** Lookup from id → definition. */
export const HINT_BY_ID: Readonly<Record<string, HintDef>> = Object.fromEntries(
  HINTS.map((def) => [def.id, def]),
);

/** Every hint id, for the "show them again" control in Settings. */
export const HINT_IDS: readonly string[] = HINTS.map((def) => def.id);

/* ----------------------------------------------------------- the reveal */

/** What the one-off camera move at {@link ROOT_REVEAL_SAP} says while it runs. */
export const ROOT_REVEAL_TITLE = 'Something stirs below…';

export const ROOT_REVEAL_BODY =
  'The soil has been waiting. Roots draw Water even while the game is shut, and they reach ' +
  'for what is buried down there.';
