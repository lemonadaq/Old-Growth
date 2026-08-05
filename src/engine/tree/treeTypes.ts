/**
 * Data model + growth rules for the procedural tree graph.
 *
 * Everything here is plain, strictly typed data so the same source of truth is
 * shared by the engine (growth constraints), the renderer (world geometry), and
 * later the UI. No behaviour lives here beyond a couple of pure geometry helpers.
 */

/** Every kind of node the tree graph can contain. */
export type NodeType =
  | 'trunk'
  | 'branch'
  | 'twig'
  | 'leafCluster'
  | 'blossom'
  | 'rootSegment'
  | 'rootTip';

/**
 * Which half of the tree a node belongs to. Canopy nodes grow upward (active
 * play, Light); root nodes grow downward (idle play, Water/Minerals). The
 * domain also decides a node's base world direction when it starts a new domain
 * (e.g. a `rootSegment` hanging off the `trunk`).
 */
export type GrowthDomain = 'canopy' | 'roots';

/** Whether a node extends upward (canopy) or downward (roots) in world space. */
export type GrowthDirection = 'up' | 'down';

/**
 * A single node of the tree. All fields are JSON-primitive so the whole graph
 * serializes to plain objects. `angle` is stored relative to the parent's world
 * direction (radians); absolute world positions are derived by walking the graph
 * — see `computeWorldPositions`.
 */
export interface TreeNode {
  /** Stable unique id within the graph. */
  id: string;
  type: NodeType;
  /** `null` only for the graph root (the trunk). */
  parentId: string | null;
  /** Ordered child ids; order is deterministic and drives angular fanning. */
  childIds: string[];
  /** Which species this node was grown as (grafting/hybrids come later). */
  speciesId: string;
  /** Generation depth from the trunk (trunk = 0). */
  level: number;
  /** Angle relative to the parent's world direction, in radians. */
  angle: number;
  /** Segment length in world units. */
  length: number;
  /** Segment thickness in world units. */
  thickness: number;
  /** Simulation tick at which this node was grown. */
  createdAtTick: number;
}

/** Static growth rules for a node type; the data behind every constraint. */
export interface NodeTypeRule {
  readonly domain: GrowthDomain;
  readonly direction: GrowthDirection;
  /** Child types this node type is allowed to grow. Empty = terminal. */
  readonly allowedChildren: readonly NodeType[];
  /** Maximum number of direct children this node type may hold. */
  readonly maxChildren: number;
  /**
   * How far a child of this type may deviate from its parent's direction, in
   * radians. Children fan out symmetrically within `[-max, +max]`.
   */
  readonly maxAngleFromParent: number;
  readonly baseLength: number;
  readonly baseThickness: number;
}

const DEG = Math.PI / 180;

/** Canopy nodes may splay up to ±70° from their parent (per the spec). */
const CANOPY_SPREAD = 70 * DEG;
/** Roots splay a bit less so they read as reaching straight down. */
const ROOT_SPREAD = 55 * DEG;

/**
 * The complete, data-driven rule table. Keyed by a node's own type; a node's
 * allowed children and child-count cap come from its entry, while a child's
 * angular spread comes from the child type's entry.
 */
export const NODE_RULES: Readonly<Record<NodeType, NodeTypeRule>> = {
  trunk: {
    domain: 'canopy',
    direction: 'up',
    allowedChildren: ['branch', 'rootSegment'],
    maxChildren: 6,
    maxAngleFromParent: 5 * DEG,
    baseLength: 60,
    baseThickness: 20,
  },
  branch: {
    domain: 'canopy',
    direction: 'up',
    allowedChildren: ['branch', 'twig'],
    maxChildren: 4,
    maxAngleFromParent: CANOPY_SPREAD,
    baseLength: 40,
    baseThickness: 10,
  },
  twig: {
    domain: 'canopy',
    direction: 'up',
    allowedChildren: ['twig', 'leafCluster', 'blossom'],
    maxChildren: 3,
    maxAngleFromParent: CANOPY_SPREAD,
    baseLength: 20,
    baseThickness: 4,
  },
  leafCluster: {
    domain: 'canopy',
    direction: 'up',
    allowedChildren: [],
    maxChildren: 0,
    maxAngleFromParent: CANOPY_SPREAD,
    baseLength: 10,
    baseThickness: 2,
  },
  blossom: {
    domain: 'canopy',
    direction: 'up',
    allowedChildren: [],
    maxChildren: 0,
    maxAngleFromParent: CANOPY_SPREAD,
    baseLength: 8,
    baseThickness: 2,
  },
  rootSegment: {
    domain: 'roots',
    direction: 'down',
    allowedChildren: ['rootSegment', 'rootTip'],
    maxChildren: 4,
    maxAngleFromParent: ROOT_SPREAD,
    baseLength: 35,
    baseThickness: 8,
  },
  rootTip: {
    domain: 'roots',
    direction: 'down',
    allowedChildren: [],
    maxChildren: 0,
    maxAngleFromParent: ROOT_SPREAD,
    baseLength: 12,
    baseThickness: 3,
  },
};

/**
 * World-space base directions, in radians, in screen coordinates where +y points
 * **down**. Canopy grows toward -y (up on screen); roots grow toward +y (down).
 */
export const UP_ANGLE = -Math.PI / 2;
export const DOWN_ANGLE = Math.PI / 2;

/** The world direction a domain points before any per-node angle is applied. */
export function baseDirection(domain: GrowthDomain): number {
  return domain === 'roots' ? DOWN_ANGLE : UP_ANGLE;
}
