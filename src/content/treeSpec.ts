/**
 * The authored description of a tree.
 *
 * A `TreeSpec` is plain data: parent/child relationships plus *relative* angles
 * and lengths. `buildTreeGraph()` in the engine turns one into a `TreeGraph`
 * with resolved world geometry. Keeping the two apart means gameplay only ever
 * appends spec entries (grow a branch, extend a root) and the geometry is
 * re-derived, which is also what save files will store.
 *
 * Angles are in degrees and measured **relative to the parent limb's direction**
 * at the attachment point, positive rotating toward `+x`. A limb with no parent
 * uses an absolute world angle where `0` is straight up and `180` straight down,
 * so the trunk is `0` and the taproot is `180`.
 */

import type { SpeciesId } from './species';

/** A woody limb: trunk, branch, or root. */
export interface LimbSpec {
  readonly id: string;
  /** Parent limb id, or `null` for the trunk / taproot. */
  readonly parent: string | null;
  /** Position along the parent limb to attach to, `0` = base, `1` = tip. */
  readonly attach?: number;
  /** Angle relative to the parent's direction at the attachment point. */
  readonly angle: number;
  /** Limb length in world units. */
  readonly length: number;
  /**
   * Base width in world units. When omitted it is derived from the parent's
   * width at the attachment point via {@link LimbSpec.widthScale}.
   */
  readonly width?: number;
  /** Fraction of the parent's local width to inherit. Default `0.62`. */
  readonly widthScale?: number;
  /** Tip width as a fraction of the base width. Default `0.55`. */
  readonly taper?: number;
  /**
   * Sideways bow of the limb as a fraction of its length, applied to the
   * quadratic control point. Positive bends toward `+x`.
   */
  readonly curve?: number;
}

/** A cluster of leaves hanging off a branch. */
export interface LeafClusterSpec {
  readonly id: string;
  /** Branch this cluster grows from. */
  readonly parent: string;
  /** Position along the parent branch, `0` = base, `1` = tip. Default `1`. */
  readonly attach?: number;
  /** Angle away from the branch direction, in degrees. Default `0`. */
  readonly spread?: number;
  /** Distance from the attachment point, in world units. Default `0`. */
  readonly distance?: number;
  /** Overall cluster radius in world units. */
  readonly radius: number;
}

export interface TreeSpec {
  /** Species used for bark, leaf, and root palettes. */
  readonly species: SpeciesId;
  /** World position of the trunk base. Usually the origin (soil line). */
  readonly origin?: { readonly x: number; readonly y: number };
  /** Seed for procedural decoration (leaf blob offsets, sway phases). */
  readonly seed: number;
  /** Above-ground limbs. The first entry with `parent: null` is the trunk. */
  readonly branches: readonly LimbSpec[];
  /** Below-ground limbs, authored the same way as branches. */
  readonly roots: readonly LimbSpec[];
  /** Canopy leaf clusters. */
  readonly leaves: readonly LeafClusterSpec[];
}
