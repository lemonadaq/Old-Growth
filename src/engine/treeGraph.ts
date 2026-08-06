import {
  ATTACH_SPREAD_MIN,
  GROWTH_RULE_BY_TYPE,
  type GrowthRule,
  type TreeNodeType,
} from '../content/growth';
import type { Vec2 } from './geometry';
import { createSeededRandom } from './rng';
import type { TreeSegment } from './tree';

/**
 * The tree graph: the player's tree as an actual data structure, and therefore
 * the game's skill tree.
 *
 * Nodes store only what cannot be derived — type, parentage, and the local
 * geometry of the join (`angle` relative to the parent's heading, `attachT`
 * along the parent, `length`, `thickness`). World positions are *derived* by
 * {@link computePlacements}, a pure walk from the root, so nothing can drift out
 * of sync and the whole graph serialises to plain JSON.
 *
 * Geometry is deterministic: a given action log always produces the same tree.
 * The small per-fork angle wobble comes from a seeded hash of
 * `(seed, parentId, childType, slot)` rather than from a running RNG, which
 * means {@link TreeGraph.getValidGrowthOptions} can promise the *exact* position
 * a part will occupy before it is bought — that promise is what makes the ghost
 * preview honest.
 */

const DEG = Math.PI / 180;

/** Canonical heading of the trunk: straight up. */
export const TRUNK_DIRECTION = Math.PI / 2;

/** Canonical heading roots leave the trunk on: straight down. */
export const ROOT_DIRECTION = -Math.PI / 2;

/** Species every part starts as until STEP 10 introduces the rest. */
export const DEFAULT_SPECIES_ID = 'oak';

/** Seed behind the deterministic angle wobble. */
export const DEFAULT_TREE_SEED = 20260806;

/** Canopy limbs are never allowed to point below this angle above horizontal. */
const CANOPY_MIN_ELEVATION = 8 * DEG;

/** Roots are never allowed to point above this angle below horizontal. */
const ROOT_MIN_DEPRESSION = 8 * DEG;

/** One node of the tree. Plain data — safe to serialise as-is. */
export interface TreeNode {
  readonly id: string;
  readonly type: TreeNodeType;
  /** `null` for the trunk, which is the graph root. */
  readonly parentId: string | null;
  /** Direct children, in creation order. */
  childIds: string[];
  readonly speciesId: string;
  /** Depth from the trunk: the trunk is 0, its children 1, and so on. */
  readonly level: number;
  /** Which of the parent's child positions this node occupies. */
  readonly slot: number;
  /** Heading relative to the parent's, in radians. The trunk's is absolute. */
  readonly angle: number;
  /** Where along the parent this node attaches, `0` at its base, `1` at its tip. */
  readonly attachT: number;
  /** Length in canonical units. */
  readonly length: number;
  /** Stroke width (or blob radius for leaves/blossoms) in canonical units. */
  readonly thickness: number;
  readonly createdAtTick: number;
}

/** A node's derived position in canonical tree space. */
export interface NodePlacement {
  readonly start: Vec2;
  readonly end: Vec2;
  /** Absolute heading in radians (`+x` is right, `+y` is up). */
  readonly direction: number;
}

/**
 * A part the player could buy right now, with the exact geometry it will have.
 *
 * Purely structural — cost and production live in `src/engine/growth.ts` so the
 * graph never has to know about resources.
 */
export interface GrowthOption {
  readonly parentId: string;
  readonly type: TreeNodeType;
  readonly slot: number;
  readonly angle: number;
  readonly attachT: number;
  readonly length: number;
  readonly thickness: number;
  /** Level the new node would sit at. */
  readonly level: number;
}

/** Serialised form of a whole graph. */
export interface TreeGraphData {
  readonly version: 1;
  readonly seed: number;
  readonly rootId: string;
  readonly nextId: number;
  readonly nodes: readonly TreeNode[];
}

function advance(from: Vec2, direction: number, length: number): Vec2 {
  return {
    x: from.x + Math.cos(direction) * length,
    y: from.y + Math.sin(direction) * length,
  };
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** FNV-1a over a string — cheap, stable, and enough to seed a wobble. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic angular wobble (radians) for one prospective child. Derived from
 * the join rather than from graph history, so it is identical whether it is
 * being previewed or grown.
 */
function jitterFor(
  seed: number,
  parentId: string,
  type: TreeNodeType,
  slot: number,
  degrees: number,
): number {
  const random = createSeededRandom(hashString(`${seed}:${parentId}:${type}:${slot}`));
  return (random() - 0.5) * 2 * degrees * DEG;
}

/**
 * Angle offset for a child in `slot`, fanned out from the reference heading.
 *
 * Slots alternate sides and step outward — `0` leans right, `1` leans left, and
 * later slots sit progressively wider — so a limb never lands on top of its
 * sibling and a half-grown fork still looks balanced.
 */
export function fanOffset(slot: number, maxChildren: number, spreadRad: number): number {
  if (maxChildren <= 1) return 0;
  const side = slot % 2 === 0 ? 1 : -1;
  const rank = Math.floor(slot / 2);
  const ranks = Math.max(1, Math.ceil(maxChildren / 2) - 1);
  return side * spreadRad * (0.45 + 0.55 * Math.min(1, rank / ranks));
}

/**
 * How far along the parent a child attaches.
 *
 * Roots leaving the trunk start at its very base; `'spread'` parents pay out
 * their slots from the tip downward (so the first limb is the apical one); every
 * other parent hangs its children off its far end.
 */
export function attachFraction(
  parentRule: GrowthRule,
  childRule: GrowthRule,
  slot: number,
): number {
  if (childRule.domain === 'root' && parentRule.domain === 'canopy') return 0;
  if (parentRule.childAttach !== 'spread') return 1;
  const steps = Math.max(1, parentRule.maxChildren - 1);
  return 1 - (1 - ATTACH_SPREAD_MIN) * (Math.min(slot, steps) / steps);
}

/** Lowest slot index not already taken by a sibling. */
function nextFreeSlot(used: ReadonlySet<number>, maxChildren: number): number {
  for (let slot = 0; slot < maxChildren; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return maxChildren;
}

/** Fold an angle into `(-π, π]`. */
function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Shortest angular distance between two headings, in `[0, π]`. */
function angularDistance(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}

/** The arc of headings a part of this domain is allowed to point along. */
function allowedArc(rule: GrowthRule): { lo: number; hi: number } {
  return rule.domain === 'canopy'
    ? { lo: CANOPY_MIN_ELEVATION, hi: Math.PI - CANOPY_MIN_ELEVATION }
    : { lo: -Math.PI + ROOT_MIN_DEPRESSION, hi: -ROOT_MIN_DEPRESSION };
}

/**
 * Keep a heading in its domain's half-plane: canopy parts always point at least
 * slightly upward, roots always at least slightly downward. Without this a chain
 * of limbs each leaning 70° from its parent could eventually curl into the
 * ground.
 *
 * An out-of-arc heading snaps to the **angularly nearer** end of the arc. A
 * plain numeric clamp gets this badly wrong: a twig that leans just past
 * straight-up-and-left normalises to a large negative angle and would be pulled
 * all the way across to the right horizon, flinging the leaf to the far side of
 * the tree. Snapping to the near end instead just stops it at vertical, which is
 * what "grows upward" is supposed to mean.
 */
function clampDirection(direction: number, rule: GrowthRule): number {
  const { lo, hi } = allowedArc(rule);
  const angle = normalizeAngle(direction);
  if (angle >= lo && angle <= hi) return angle;
  return angularDistance(angle, lo) <= angularDistance(angle, hi) ? lo : hi;
}

/**
 * Derive every node's world position by walking down from the trunk.
 *
 * Pure: the same nodes always yield the same placements, and nothing is cached
 * on the nodes themselves.
 */
export function computePlacements(
  nodes: ReadonlyMap<string, TreeNode>,
  rootId: string,
): Map<string, NodePlacement> {
  const placements = new Map<string, NodePlacement>();
  const root = nodes.get(rootId);
  if (!root) return placements;

  const origin: Vec2 = { x: 0, y: 0 };
  placements.set(rootId, {
    start: origin,
    direction: root.angle,
    end: advance(origin, root.angle, root.length),
  });

  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    const parent = nodes.get(parentId);
    const parentPlacement = placements.get(parentId);
    if (!parent || !parentPlacement) continue;

    for (const childId of parent.childIds) {
      const child = nodes.get(childId);
      if (!child) continue;
      placements.set(childId, placeChild(parentPlacement, child));
      queue.push(childId);
    }
  }

  return placements;
}

/** Where a child sits given its parent's placement and its own local geometry. */
export function placeChild(
  parent: NodePlacement,
  child: Pick<TreeNode, 'angle' | 'attachT' | 'length'>,
): NodePlacement {
  const direction = parent.direction + child.angle;
  const start = lerp(parent.start, parent.end, child.attachT);
  return { start, direction, end: advance(start, direction, child.length) };
}

/** Where a prospective {@link GrowthOption} would sit. Used for ghost previews. */
export function placeOption(parent: NodePlacement, option: GrowthOption): NodePlacement {
  return placeChild(parent, option);
}

/**
 * The player's tree.
 *
 * Mutable by design — it is owned by the {@link Simulation} — but every read
 * that matters (placements, segments, options) is derived on demand from the
 * node table, and `revision` ticks on every structural change so the renderer
 * knows when to re-project.
 */
export class TreeGraph {
  private readonly nodes = new Map<string, TreeNode>();
  private readonly counts = new Map<TreeNodeType, number>();
  private nextId = 1;

  /** Bumped on every grow/prune, so consumers can cache derived geometry. */
  private version = 0;

  private placementCache: Map<string, NodePlacement> | null = null;
  private placementVersion = -1;

  private constructor(
    readonly seed: number,
    private root: string,
  ) {}

  /** A fresh sapling: one trunk, nothing else. */
  static seedling(seed: number = DEFAULT_TREE_SEED, createdAtTick = 0): TreeGraph {
    const rule = GROWTH_RULE_BY_TYPE.trunk;
    const graph = new TreeGraph(seed, 'trunk-0');
    graph.insert({
      id: 'trunk-0',
      type: 'trunk',
      parentId: null,
      childIds: [],
      speciesId: DEFAULT_SPECIES_ID,
      level: 0,
      slot: 0,
      angle: TRUNK_DIRECTION,
      attachT: 0,
      length: rule.baseLength,
      thickness: rule.baseThickness,
      createdAtTick,
    });
    return graph;
  }

  /** Rebuild a graph from its serialised form. */
  static fromJSON(data: TreeGraphData): TreeGraph {
    const graph = new TreeGraph(data.seed, data.rootId);
    for (const node of data.nodes) {
      graph.insert({ ...node, childIds: [...node.childIds] });
    }
    graph.nextId = data.nextId;
    return graph;
  }

  private insert(node: TreeNode): void {
    this.nodes.set(node.id, node);
    this.counts.set(node.type, (this.counts.get(node.type) ?? 0) + 1);
  }

  /** Id of the trunk. */
  get rootId(): string {
    return this.root;
  }

  /** Structural revision counter. */
  get revision(): number {
    return this.version;
  }

  /** Number of nodes in the graph, trunk included. */
  get size(): number {
    return this.nodes.size;
  }

  /** One node by id, or `undefined`. */
  node(id: string): TreeNode | undefined {
    return this.nodes.get(id);
  }

  /** Every node, in insertion order. */
  allNodes(): readonly TreeNode[] {
    return [...this.nodes.values()];
  }

  /** Direct children of a node. */
  children(id: string): TreeNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.childIds
      .map((childId) => this.nodes.get(childId))
      .filter((child): child is TreeNode => child !== undefined);
  }

  /** How many parts of a type the tree currently carries. Drives pricing. */
  countOfType(type: TreeNodeType): number {
    return this.counts.get(type) ?? 0;
  }

  /** Derived world positions, memoised until the next structural change. */
  placements(): ReadonlyMap<string, NodePlacement> {
    if (this.placementCache === null || this.placementVersion !== this.version) {
      this.placementCache = computePlacements(this.nodes, this.root);
      this.placementVersion = this.version;
    }
    return this.placementCache;
  }

  /**
   * Every part that could be grown on `nodeId` right now, with the geometry it
   * would have. Empty when the node is terminal or already full.
   *
   * All options share the same slot — whichever is bought takes it — so the
   * ghost preview of each shows exactly where that part would land.
   */
  getValidGrowthOptions(nodeId: string): GrowthOption[] {
    const parent = this.nodes.get(nodeId);
    if (!parent) return [];

    const parentRule = GROWTH_RULE_BY_TYPE[parent.type];
    if (parent.childIds.length >= parentRule.maxChildren) return [];

    const used = new Set(this.children(nodeId).map((child) => child.slot));
    const slot = nextFreeSlot(used, parentRule.maxChildren);
    if (slot >= parentRule.maxChildren) return [];

    return parentRule.allowedChildren.map((type) => this.optionFor(parent, parentRule, type, slot));
  }

  private optionFor(
    parent: TreeNode,
    parentRule: GrowthRule,
    type: TreeNodeType,
    slot: number,
  ): GrowthOption {
    const childRule = GROWTH_RULE_BY_TYPE[type];
    const parentDirection = this.placements().get(parent.id)?.direction ?? parent.angle;

    // Roots leave the trunk pointing down whichever way the trunk itself leans;
    // everything else fans out from its parent's own heading.
    const reference =
      childRule.domain === 'root' && parentRule.domain === 'canopy'
        ? ROOT_DIRECTION
        : parentDirection;

    const offset =
      fanOffset(slot, parentRule.maxChildren, childRule.spreadDegrees * DEG) +
      jitterFor(this.seed, parent.id, type, slot, childRule.jitterDegrees);

    const absolute = clampDirection(reference + offset, childRule);
    const falloff = Math.pow(childRule.depthFalloff, parent.level);

    return {
      parentId: parent.id,
      type,
      slot,
      angle: absolute - parentDirection,
      attachT: attachFraction(parentRule, childRule, slot),
      length: childRule.baseLength * falloff,
      thickness: childRule.baseThickness * falloff,
      level: parent.level + 1,
    };
  }

  /**
   * Grow `childType` on `nodeId`. Returns the new node, or `null` when the
   * growth rules forbid it (wrong child type, or the parent is full).
   *
   * Affordability is *not* checked here — the graph knows nothing about
   * resources. `Simulation.growPart` owns that.
   */
  grow(
    nodeId: string,
    childType: TreeNodeType,
    speciesId: string = DEFAULT_SPECIES_ID,
    createdAtTick = 0,
  ): TreeNode | null {
    const parent = this.nodes.get(nodeId);
    if (!parent) return null;

    const option = this.getValidGrowthOptions(nodeId).find((o) => o.type === childType);
    if (!option) return null;

    const id = `${childType}-${this.nextId}`;
    this.nextId += 1;

    const node: TreeNode = {
      id,
      type: childType,
      parentId: parent.id,
      childIds: [],
      speciesId,
      level: option.level,
      slot: option.slot,
      angle: option.angle,
      attachT: option.attachT,
      length: option.length,
      thickness: option.thickness,
      createdAtTick,
    };

    this.insert(node);
    parent.childIds.push(id);
    this.version += 1;
    return node;
  }

  /** Every node in the subtree rooted at `nodeId`, the node itself first. */
  subtree(nodeId: string): TreeNode[] {
    const start = this.nodes.get(nodeId);
    if (!start) return [];

    const collected: TreeNode[] = [];
    const queue: TreeNode[] = [start];
    while (queue.length > 0) {
      const node = queue.shift() as TreeNode;
      collected.push(node);
      for (const childId of node.childIds) {
        const child = this.nodes.get(childId);
        if (child) queue.push(child);
      }
    }
    return collected;
  }

  /**
   * Cut `nodeId` and everything above/below it off the tree, returning the nodes
   * that were removed (so the caller can refund them and drop their producers).
   *
   * The trunk cannot be pruned — a tree with no root node has no geometry.
   */
  prune(nodeId: string): TreeNode[] {
    const node = this.nodes.get(nodeId);
    if (!node || node.parentId === null) return [];

    const removed = this.subtree(nodeId);
    const parent = this.nodes.get(node.parentId);
    if (parent) {
      parent.childIds = parent.childIds.filter((id) => id !== nodeId);
    }

    for (const doomed of removed) {
      this.nodes.delete(doomed.id);
      this.counts.set(doomed.type, Math.max(0, (this.counts.get(doomed.type) ?? 0) - 1));
    }

    this.version += 1;
    return removed;
  }

  /**
   * Flatten to drawable, hit-testable segments in canonical space, parents
   * before children so the draw order layers correctly.
   */
  toSegments(): TreeSegment[] {
    const placements = this.placements();
    const segments: TreeSegment[] = [];
    const queue: string[] = [this.root];

    while (queue.length > 0) {
      const id = queue.shift() as string;
      const node = this.nodes.get(id);
      const placement = placements.get(id);
      if (!node || !placement) continue;

      segments.push({
        id: node.id,
        kind: node.type,
        depth: node.level,
        a: placement.start,
        b: placement.end,
        width: node.thickness,
      });
      queue.push(...node.childIds);
    }

    return segments;
  }

  /** Plain-JSON form. Round-trips through {@link TreeGraph.fromJSON}. */
  toJSON(): TreeGraphData {
    return {
      version: 1,
      seed: this.seed,
      rootId: this.root,
      nextId: this.nextId,
      nodes: this.allNodes().map((node) => ({ ...node, childIds: [...node.childIds] })),
    };
  }
}
