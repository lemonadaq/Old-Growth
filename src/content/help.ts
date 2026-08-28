/**
 * The Help tab: every mechanic, said once, in fiction.
 *
 * Deliberately **not** the same list as `FEATURES`. That table is about *when* a
 * system appears; this one is about the things that are always there and are
 * never introduced by a gate opening — tapping, the combo, what shade does to a
 * leaf, why a root in the clay is worth more than one in the topsoil. The Journal
 * renders the two together: these topics first, then the gated systems read
 * straight out of the gating table, so nothing is described in two places.
 *
 * House style, and the reason this is content rather than JSX: every line is
 * written from inside the world. "Leaves shade each other" rather than "the
 * exposure coefficient scales the base rate". A player who wants the numbers has
 * the tooltips, which quote them exactly; a player who wants to know what kind of
 * thing a tree is has this.
 */

export interface HelpTopic {
  readonly id: string;
  readonly title: string;
  /** One paragraph per entry. Two at most: this is a page, not a manual. */
  readonly body: readonly string[];
}

/** The mechanics that are there from the first frame, in the order they matter. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'tapping',
    title: 'Sap',
    body: [
      'Tapping the tree draws Sap, and Sap is what everything is grown from. Taps in quick ' +
        'succession build a combo — the meter under your pointer — and every so often one ' +
        'lands on a good vein and pays many times over.',
      'The first tap of each day shakes the dew loose, which is worth a minute of income on ' +
        'its own. There is no way to lose a combo except by stopping.',
    ],
  },
  {
    id: 'growing',
    title: 'The tree is the upgrade tree',
    body: [
      'There is no shop. Tapping a limb opens a ring of buds around it, and each bud is a ' +
        'part you could grow there: another branch, a twig, a cluster of leaves, a blossom. ' +
        'What you buy appears exactly where you bought it, and stays.',
      'Every part of a kind costs more than the last one of that kind, so a wide tree and a ' +
        'tall tree are different decisions rather than the same one made twice.',
    ],
  },
  {
    id: 'light',
    title: 'Light and shade',
    body: [
      'Leaves gather Light, and they gather it from the sky — so a cluster with three others ' +
        'above it is working in their shadow and earns a fraction of what it could. Placement ' +
        'is the whole canopy game: reach outward, not just upward.',
      'The sun rises and sets on its own. Light is worth most at noon, almost nothing at ' +
        'midnight, and blossoms lift the leaves beside them a little regardless.',
    ],
  },
  {
    id: 'water',
    title: 'Water and the thirst of leaves',
    body: [
      'Every leaf cluster drinks. If the roots cannot draw enough Water for the canopy above ' +
        'them, everything the tree makes is throttled until they can — a tree that is all ' +
        'leaves and no roots is a tree that wilts.',
      'Roots reach down through topsoil, loam and clay, and the deeper a segment sits the more ' +
        'it draws. A root tip that ends inside a mineral vein worries Minerals out of it; one ' +
        'that ends a hand’s breadth away finds nothing at all.',
    ],
  },
  {
    id: 'deadwood',
    title: 'Deadwood, litter and totems',
    body: [
      'Nothing the tree drops is wasted. Autumn sheds leaf litter at the base, cut limbs leave ' +
        'Deadwood, and storms leave both. Sweep the piles up by hand, or buy the rake and stop ' +
        'thinking about them.',
      'Deadwood carves into totems, which stand at the foot of the trunk and change how the ' +
        'whole tree works for as long as it lives.',
    ],
  },
  {
    id: 'weather',
    title: 'Weather',
    body: [
      'The sky announces itself before it arrives. Rain multiplies what the roots draw; drought ' +
        'dries the shallow ones and leaves the deep ones alone; a storm is fifteen seconds of ' +
        'holding the trunk — tap the anchor at the base and the wind takes less.',
      'What the wind does take is yours as Deadwood. A storm is not a punishment, it is a ' +
        'harvest you did not choose.',
    ],
  },
  {
    id: 'offline',
    title: 'While you are away',
    body: [
      'The canopy rests when you do; the roots do not. Close the tab and the tree keeps drawing ' +
        'Water and finding Minerals, and the year keeps turning — a winter that passes while ' +
        'you were gone still lays its ring.',
      'There is a limit on how much absence is paid for, and the Vault sells more of it.',
    ],
  },
  {
    id: 'saving',
    title: 'The save',
    body: [
      'The game writes itself down every half minute, and again whenever the tab is hidden or ' +
        'closed. The previous save is kept as a backup, and a damaged file falls back to it ' +
        'rather than to nothing.',
      'Settings will hand you the whole save as text. That copy is yours: it survives cleared ' +
        'browser data, and it opens on any device.',
    ],
  },
];
