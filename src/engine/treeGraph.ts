/**
 * The tree graph: resolved world geometry for every limb and leaf cluster.
 *
 * `buildTreeGraph()` walks a {@link TreeSpec} (authored as relative angles and
 * lengths) and produces immutable nodes carrying absolute world curves, widths,
 * sway parameters, and per-node bounding boxes. The renderer reads this graph
 * every frame and never recomputes geometry; gameplay rebuilds the graph only
 * when the spec changes (a branch grows, a limb is pruned).
 *
 * Pure TypeScript — no React, no canvas.
 */

import type { LeafClusterSpec, LimbSpec, TreeSpec } from '../content/treeSpec';
import type { SpeciesId } from '../content/species';
import {
  angleFromDirection,
  boundsOfPoints,
  clamp,
  directionFromAngle,
  lerp,
  normalize,
  quadraticPoint,
  quadraticTangent,
  rectsIntersect,
  unionRect,
  type Rect,
  type Vec2,
} from './geometry';
import { Rng, hashString } from './rng';

/** Default fraction of the parent's local width a child limb inherits. */
const DEFAULT_WIDTH_SCALE = 0.62;
/** Default tip width as a fraction of the base width. */
const DEFAULT_TAPER = 0.55;
/** Widths below this are clamped up so hairline twigs stay visible. */
const MIN_LIMB_WIDTH = 1.2;

export type NodeKind = 'branch' | 'root' | 'leaf';

/** Shared fields on every node in the graph. */
interface NodeBase {
  readonly id: string;
  readonly parentId: string | null;
  readonly speciesId: SpeciesId;
  /** Distance from the trunk/taproot, in limbs. The trunk is `0`. */
  readonly depth: number;
  /**
   * Parameter along the parent limb this node joins at, `0` = base, `1` = tip.
   * `0` for the trunk and taproot. The renderer uses it to inherit the parent's
   * sway so joints stay attached.
   */
  readonly attach: number;
  /** Peak sideways sway of this node in world units. Roots do not sway. */
  readonly swayAmount: number;
  /** Per-node phase offset so neighbouring limbs sway out of step. */
  readonly swayPhase: number;
  /** World-space AABB including width and sway, used for viewport culling. */
  readonly bounds: Rect;
}

/** A woody limb drawn as a tapered quadratic curve. */
export interface LimbNode extends NodeBase {
  readonly kind: 'branch' | 'root';
  readonly start: Vec2;
  readonly control: Vec2;
  readonly end: Vec2;
  /** Width in world units at the base of the limb. */
  readonly baseWidth: number;
  /** Width in world units at the tip. Always `<= baseWidth`. */
  readonly tipWidth: number;
  readonly length: number;
  /** Absolute world angle of the limb at its base, in degrees. */
  readonly angle: number;
}

/** One soft circle inside a leaf cluster. */
export interface LeafBlob {
  /** Offset from the cluster centre, in world units. */
  readonly offset: Vec2;
  readonly radius: number;
  /** Extra phase so blobs inside a cluster do not move in lockstep. */
  readonly phase: number;
  /** Which of the species' three leaf tones to use. */
  readonly tone: 'dark' | 'base' | 'light';
}

/** A canopy leaf cluster: 3–5 overlapping soft circles. */
export interface LeafNode extends NodeBase {
  readonly kind: 'leaf';
  /** Cluster centre in world space. */
  readonly position: Vec2;
  readonly radius: number;
  readonly blobs: readonly LeafBlob[];
}

export type TreeNode = LimbNode | LeafNode;

export interface TreeGraph {
  readonly speciesId: SpeciesId;
  /** Above-ground limbs, trunk first, then increasing depth. */
  readonly branches: readonly LimbNode[];
  /** Below-ground limbs, taproot first, then increasing depth. */
  readonly roots: readonly LimbNode[];
  /** Canopy leaf clusters. */
  readonly leaves: readonly LeafNode[];
  /** Every node, in draw order: roots, then branches, then leaves. */
  readonly nodes: readonly TreeNode[];
  readonly byId: ReadonlyMap<string, TreeNode>;
  /** World AABB of the whole tree. */
  readonly bounds: Rect;
}

/** Width of a limb at parameter `t` along its curve. */
export function limbWidthAt(limb: LimbNode, t: number): number {
  return lerp(limb.baseWidth, limb.tipWidth, clamp(t, 0, 1));
}

/** Point at parameter `t` along a limb's curve. */
export function limbPointAt(limb: LimbNode, t: number): Vec2 {
  return quadraticPoint(limb.start, limb.control, limb.end, clamp(t, 0, 1));
}

/** Unit tangent at parameter `t` along a limb's curve. */
export function limbTangentAt(limb: LimbNode, t: number): Vec2 {
  return normalize(quadraticTangent(limb.start, limb.control, limb.end, clamp(t, 0, 1)));
}

/**
 * Nodes whose bounds overlap `viewport`, in draw order. Everything else is
 * skipped before any canvas work happens, which is what keeps large trees cheap
 * when the camera is zoomed into the canopy or down among the roots.
 */
export function collectVisibleNodes(graph: TreeGraph, viewport: Rect, out: TreeNode[]): TreeNode[] {
  out.length = 0;
  for (const node of graph.nodes) {
    if (rectsIntersect(node.bounds, viewport)) {
      out.push(node);
    }
  }
  return out;
}

/**
 * Allocating form of {@link collectVisibleNodes}. The renderer uses the
 * out-parameter version so a 60fps draw loop produces no garbage.
 */
export function visibleNodes(graph: TreeGraph, viewport: Rect): TreeNode[] {
  return collectVisibleNodes(graph, viewport, []);
}

/** Build a {@link TreeGraph} from authored {@link TreeSpec} data. */
export function buildTreeGraph(spec: TreeSpec): TreeGraph {
  const origin: Vec2 = spec.origin ?? { x: 0, y: 0 };
  const byId = new Map<string, TreeNode>();

  const branches = buildLimbs(spec.branches, 'branch', spec, origin, byId);
  const roots = buildLimbs(spec.roots, 'root', spec, origin, byId);
  const leaves = buildLeaves(spec.leaves, spec, byId);

  // Roots first so the trunk overlaps them at the soil line, leaves last so the
  // canopy sits in front of the twigs holding it.
  const nodes: TreeNode[] = [...roots, ...branches, ...leaves];

  let bounds: Rect = nodes.length > 0 ? nodes[0].bounds : boundsOfPoints([origin]);
  for (const node of nodes) {
    bounds = unionRect(bounds, node.bounds);
  }

  return {
    speciesId: spec.species,
    branches,
    roots,
    leaves,
    nodes,
    byId,
    bounds,
  };
}

function buildLimbs(
  specs: readonly LimbSpec[],
  kind: 'branch' | 'root',
  tree: TreeSpec,
  origin: Vec2,
  byId: Map<string, TreeNode>,
): LimbNode[] {
  const limbs: LimbNode[] = [];

  for (const limbSpec of specs) {
    const parent = resolveParentLimb(limbSpec, byId);

    const attach = clamp(limbSpec.attach ?? 1, 0, 1);
    let start: Vec2;
    let angle: number;
    let baseWidth: number;
    let depth: number;

    if (parent === null) {
      start = origin;
      angle = limbSpec.angle;
      baseWidth = limbSpec.width ?? 24;
      depth = 0;
    } else {
      start = limbPointAt(parent, attach);
      angle = angleFromDirection(limbTangentAt(parent, attach)) + limbSpec.angle;
      baseWidth =
        limbSpec.width ??
        limbWidthAt(parent, attach) * (limbSpec.widthScale ?? DEFAULT_WIDTH_SCALE);
      depth = parent.depth + 1;
    }

    baseWidth = Math.max(MIN_LIMB_WIDTH, baseWidth);
    const tipWidth = Math.max(MIN_LIMB_WIDTH * 0.6, baseWidth * (limbSpec.taper ?? DEFAULT_TAPER));

    const direction = directionFromAngle(angle);
    const { length } = limbSpec;
    const end: Vec2 = { x: start.x + direction.x * length, y: start.y + direction.y * length };

    // Bow the limb sideways by displacing the control point off the chord.
    const curve = limbSpec.curve ?? 0;
    const perpendicular: Vec2 = { x: direction.y, y: -direction.x };
    const control: Vec2 = {
      x: (start.x + end.x) / 2 + perpendicular.x * curve * length,
      y: (start.y + end.y) / 2 + perpendicular.y * curve * length,
    };

    const rng = new Rng(hashString(`${tree.seed}:${limbSpec.id}`));
    const swayAmount = kind === 'root' ? 0 : limbSwayAmount(depth, length);
    const swayPhase = rng.range(0, Math.PI * 2);

    const bounds = boundsOfPoints(
      [start, control, end],
      baseWidth / 2 + swayAmount + 2, // pad for stroke width and sway travel
    );

    const node: LimbNode = {
      kind,
      id: limbSpec.id,
      parentId: limbSpec.parent,
      speciesId: tree.species,
      depth,
      attach: parent === null ? 0 : attach,
      start,
      control,
      end,
      baseWidth,
      tipWidth,
      length,
      angle,
      swayAmount,
      swayPhase,
      bounds,
    };

    byId.set(node.id, node);
    limbs.push(node);
  }

  limbs.sort((a, b) => a.depth - b.depth);
  return limbs;
}

function buildLeaves(
  specs: readonly LeafClusterSpec[],
  tree: TreeSpec,
  byId: Map<string, TreeNode>,
): LeafNode[] {
  const leaves: LeafNode[] = [];

  for (const leafSpec of specs) {
    const parent = byId.get(leafSpec.parent);
    if (!parent || parent.kind === 'leaf') {
      throw new Error(`Leaf cluster "${leafSpec.id}" must attach to a limb declared before it`);
    }

    const attach = clamp(leafSpec.attach ?? 1, 0, 1);
    const anchor = limbPointAt(parent, attach);
    const angle = angleFromDirection(limbTangentAt(parent, attach)) + (leafSpec.spread ?? 0);
    const direction = directionFromAngle(angle);
    const distance = leafSpec.distance ?? 0;
    const position: Vec2 = {
      x: anchor.x + direction.x * distance,
      y: anchor.y + direction.y * distance,
    };

    const rng = new Rng(hashString(`${tree.seed}:leaf:${leafSpec.id}`));
    const blobs = buildBlobs(rng, leafSpec.radius);
    const depth = parent.depth + 1;
    const swayAmount = leafSwayAmount(depth);
    const swayPhase = rng.range(0, Math.PI * 2);

    let reach = 0;
    for (const blob of blobs) {
      reach = Math.max(reach, Math.hypot(blob.offset.x, blob.offset.y) + blob.radius);
    }

    const node: LeafNode = {
      kind: 'leaf',
      id: leafSpec.id,
      parentId: leafSpec.parent,
      speciesId: tree.species,
      depth,
      attach,
      position,
      radius: leafSpec.radius,
      blobs,
      swayAmount,
      swayPhase,
      bounds: boundsOfPoints([position], reach + swayAmount + 2),
    };

    byId.set(node.id, node);
    leaves.push(node);
  }

  return leaves;
}

/** 3–5 overlapping soft circles, offset around the cluster centre. */
function buildBlobs(rng: Rng, radius: number): LeafBlob[] {
  const count = rng.int(3, 5);
  const tones: LeafBlob['tone'][] = ['dark', 'base', 'light'];
  const blobs: LeafBlob[] = [];
  // Spread the blobs around a circle with jitter so clusters stay convincingly
  // clumped instead of drifting into a line.
  const angleStep = (Math.PI * 2) / count;
  const angleOffset = rng.range(0, Math.PI * 2);

  for (let i = 0; i < count; i += 1) {
    const angle = angleOffset + angleStep * i + rng.range(-0.35, 0.35);
    const distance = radius * rng.range(0.15, 0.42);
    blobs.push({
      offset: { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.8 },
      radius: radius * rng.range(0.55, 0.82),
      phase: rng.range(0, Math.PI * 2),
      // Back blobs are drawn first and darkest, giving the cluster some depth.
      tone: tones[Math.min(tones.length - 1, Math.floor((i / count) * tones.length))],
    });
  }

  return blobs;
}

/** Tips sway more than the trunk; long limbs sway more than stubs. */
function limbSwayAmount(depth: number, length: number): number {
  return (0.6 + depth * 1.15) * clamp(length / 120, 0.45, 1.15);
}

function leafSwayAmount(depth: number): number {
  return clamp(2.2 + depth * 0.9, 2.2, 7);
}

function resolveParentLimb(limbSpec: LimbSpec, byId: Map<string, TreeNode>): LimbNode | null {
  if (limbSpec.parent === null) return null;
  const parent = byId.get(limbSpec.parent);
  if (!parent || parent.kind === 'leaf') {
    throw new Error(`Limb "${limbSpec.id}" must attach to a limb declared before it`);
  }
  return parent;
}
