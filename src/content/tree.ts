/**
 * Parameters for the procedurally generated tree skeleton.
 *
 * Plain typed data so the generator in `src/engine/tree.ts` stays a pure
 * function of its blueprint. This is the *clickable skeleton* only — trunk and
 * branch centre-lines. Bark texture, leaves, and player-driven growth land in
 * later steps and will extend this blueprint rather than replace it.
 */
export interface TreeBlueprint {
  /** Seed for the deterministic jitter, so the silhouette is reproducible. */
  readonly seed: number;
  /** Total trunk length in canonical units (1 unit ≈ the tree's own height). */
  readonly trunkLength: number;
  /** Trunk width at the base, in canonical units. */
  readonly trunkWidth: number;
  /** Trunk is split into this many segments so it can curve and be hit-tested. */
  readonly trunkSegments: number;
  /** Maximum lean of the trunk across its whole length, in degrees. */
  readonly trunkCurveDegrees: number;
  /** Trunk segments from this index upward also sprout a side limb. */
  readonly sideBranchFromSegment: number;
  /** Recursion levels below the crown fork. */
  readonly depth: number;
  /** Child branches created at each fork. */
  readonly branchesPerNode: number;
  /** Each generation's length as a fraction of its parent's. */
  readonly lengthFalloff: number;
  /** Each generation's width as a fraction of its parent's. */
  readonly widthFalloff: number;
  /** Total angular spread of the children at a fork, in degrees. */
  readonly spreadDegrees: number;
  /** Random angular wobble applied per branch, in degrees. */
  readonly angleJitterDegrees: number;
}

/** The starting sapling every run begins with. */
export const DEFAULT_TREE: TreeBlueprint = {
  seed: 20260806,
  trunkLength: 0.6,
  trunkWidth: 0.075,
  trunkSegments: 5,
  trunkCurveDegrees: 8,
  sideBranchFromSegment: 2,
  depth: 3,
  branchesPerNode: 2,
  lengthFalloff: 0.7,
  widthFalloff: 0.62,
  spreadDegrees: 64,
  angleJitterDegrees: 13,
};
