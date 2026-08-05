import { SeededRng } from './rng';
import {
  NODE_RULES,
  baseDirection,
  type GrowthDomain,
  type NodeType,
  type TreeNode,
} from './treeTypes';

/** Serialized, JSON-safe form of a {@link TreeGraph}. */
export interface SerializedTreeGraph {
  readonly version: number;
  /** Seed the graph was created with (kept for reference/debugging). */
  readonly seed: number;
  /** Live PRNG state so continued growth stays deterministic after load. */
  readonly rngState: number;
  /** Next integer used to mint node ids. */
  readonly nextId: number;
  readonly rootId: string;
  /** Current simulation tick stamped onto newly grown nodes. */
  readonly currentTick: number;
  readonly nodes: TreeNode[];
}

/** Derived world geometry for a single node (screen coords, +y down). */
export interface NodeGeometry {
  readonly id: string;
  /** Start point (the parent's tip, or the origin for the root). */
  readonly startX: number;
  readonly startY: number;
  /** Tip point, `length` away from the start along `worldAngle`. */
  readonly endX: number;
  readonly endY: number;
  /** Absolute world direction of this segment, in radians. */
  readonly worldAngle: number;
}

const SERIAL_VERSION = 1;

function cloneNode(node: TreeNode): TreeNode {
  return { ...node, childIds: [...node.childIds] };
}

/**
 * The tree upgrade graph: a single rooted tree of {@link TreeNode}s with
 * data-driven growth rules. Deterministic — the same sequence of {@link grow} /
 * {@link prune} calls from the same seed always produces identical geometry —
 * and fully (de)serializable to plain JSON.
 *
 * World positions are **not** stored; they are derived on demand by
 * {@link computeWorldPositions}, keeping the graph a pure topological model.
 */
export class TreeGraph {
  readonly seed: number;

  private readonly nodes = new Map<string, TreeNode>();
  private rng: SeededRng;
  private nextId = 0;
  private _rootId = '';
  private _currentTick = 0;

  private constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new SeededRng(this.seed);
  }

  /** Create a fresh graph seeded with a single trunk of `speciesId`. */
  static create(seed: number, speciesId: string, tick = 0): TreeGraph {
    const graph = new TreeGraph(seed);
    graph._currentTick = tick;
    const rule = NODE_RULES.trunk;
    const id = graph.mintId();
    const trunk: TreeNode = {
      id,
      type: 'trunk',
      parentId: null,
      childIds: [],
      speciesId,
      level: 0,
      angle: 0,
      length: rule.baseLength,
      thickness: rule.baseThickness,
      createdAtTick: tick,
    };
    graph.nodes.set(id, trunk);
    graph._rootId = id;
    return graph;
  }

  // --- reads -------------------------------------------------------------

  get rootId(): string {
    return this._rootId;
  }

  /** The trunk node. Always present for a well-formed graph. */
  get root(): TreeNode {
    const node = this.nodes.get(this._rootId);
    if (!node) throw new Error('TreeGraph has no root');
    return node;
  }

  get size(): number {
    return this.nodes.size;
  }

  /** Current tick stamped onto nodes grown from now on. */
  get tick(): number {
    return this._currentTick;
  }

  /** Set the tick recorded as `createdAtTick` on subsequently grown nodes. */
  setTick(tick: number): void {
    this._currentTick = tick;
  }

  getNode(id: string): TreeNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Direct children of `id`, in insertion order. */
  getChildren(id: string): TreeNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.childIds.map((childId) => this.nodes.get(childId)).filter(isDefined);
  }

  /** Every node in the graph (no ordering guarantee beyond insertion). */
  allNodes(): TreeNode[] {
    return [...this.nodes.values()];
  }

  // --- growth ------------------------------------------------------------

  /**
   * Child types that may currently be grown from `nodeId`: the node type's
   * allowed children, or `[]` once it has reached its child cap.
   * @throws if `nodeId` is unknown.
   */
  getValidGrowthOptions(nodeId: string): NodeType[] {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`getValidGrowthOptions: unknown node "${nodeId}"`);
    return this.validOptionsFor(node);
  }

  /**
   * Grow a `childType` child off `nodeId` as `speciesId`, returning the new node.
   * The child's angle is placed deterministically (an even fan across the type's
   * allowed range plus small seeded jitter).
   * @throws if the node is unknown or `childType` is not a valid option.
   */
  grow(nodeId: string, childType: NodeType, speciesId: string): TreeNode {
    const parent = this.nodes.get(nodeId);
    if (!parent) throw new Error(`grow: unknown node "${nodeId}"`);
    if (!this.validOptionsFor(parent).includes(childType)) {
      throw new Error(
        `grow: "${childType}" is not a valid child of "${parent.type}" (node "${nodeId}")`,
      );
    }

    const angle = this.computeChildAngle(parent, childType);
    const rule = NODE_RULES[childType];
    const id = this.mintId();
    const child: TreeNode = {
      id,
      type: childType,
      parentId: parent.id,
      childIds: [],
      speciesId,
      level: parent.level + 1,
      angle,
      length: rule.baseLength,
      thickness: rule.baseThickness,
      createdAtTick: this._currentTick,
    };
    this.nodes.set(id, child);
    parent.childIds.push(id);
    return child;
  }

  /**
   * Remove the entire subtree rooted at `nodeId` (the node and all descendants)
   * and detach it from its parent. Returns every removed node, subtree-root
   * first.
   * @throws if `nodeId` is unknown or refers to the trunk (the graph root).
   */
  prune(nodeId: string): TreeNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`prune: unknown node "${nodeId}"`);
    if (node.parentId === null) throw new Error(`prune: cannot prune the root trunk "${nodeId}"`);

    const removed: TreeNode[] = [];
    const stack: string[] = [nodeId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) break;
      const current = this.nodes.get(id);
      if (!current) continue;
      removed.push(current);
      for (const childId of current.childIds) stack.push(childId);
      this.nodes.delete(id);
    }

    const parent = this.nodes.get(node.parentId);
    if (parent) {
      const index = parent.childIds.indexOf(nodeId);
      if (index >= 0) parent.childIds.splice(index, 1);
    }
    return removed;
  }

  // --- serialization -----------------------------------------------------

  serialize(): SerializedTreeGraph {
    return {
      version: SERIAL_VERSION,
      seed: this.seed,
      rngState: this.rng.getState(),
      nextId: this.nextId,
      rootId: this._rootId,
      currentTick: this._currentTick,
      nodes: this.allNodes().map(cloneNode),
    };
  }

  static deserialize(data: SerializedTreeGraph): TreeGraph {
    if (data.version !== SERIAL_VERSION) {
      throw new Error(`deserialize: unsupported version ${data.version}`);
    }
    const graph = new TreeGraph(data.seed);
    graph.rng = SeededRng.fromState(data.rngState);
    graph.nextId = data.nextId;
    graph._rootId = data.rootId;
    graph._currentTick = data.currentTick;
    for (const node of data.nodes) {
      graph.nodes.set(node.id, cloneNode(node));
    }
    return graph;
  }

  // --- internals ---------------------------------------------------------

  private mintId(): string {
    const id = `n${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  private validOptionsFor(node: TreeNode): NodeType[] {
    const rule = NODE_RULES[node.type];
    if (node.childIds.length >= rule.maxChildren) return [];
    return [...rule.allowedChildren];
  }

  /**
   * Place a new child within its allowed angular range. Children are fanned
   * evenly across `[-spread, +spread]` using the parent's child cap so siblings
   * spread apart, with a small deterministic jitter drawn from the seeded RNG.
   * The result is clamped to the allowed range.
   */
  private computeChildAngle(parent: TreeNode, childType: NodeType): number {
    const spread = NODE_RULES[childType].maxAngleFromParent;
    const maxKids = NODE_RULES[parent.type].maxChildren;
    const index = parent.childIds.length; // slot for the child about to be added
    const t = maxKids > 1 ? index / (maxKids - 1) : 0.5;
    const fan = -spread + t * 2 * spread;
    const jitter = (this.rng.next() - 0.5) * 2 * spread * 0.15;
    const angle = fan + jitter;
    if (angle > spread) return spread;
    if (angle < -spread) return -spread;
    return angle;
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Pure derivation of world geometry, walking from the graph root. World
 * positions are never stored on the graph — this is the single source of truth
 * for where nodes sit. A node inherits its parent's world direction and adds its
 * own relative `angle`; when a node begins a new domain (a root off the trunk)
 * its direction resets to that domain's base so canopy grows up and roots grow
 * down regardless of the parent's orientation.
 *
 * Screen coordinates: +x right, +y **down**; canopy tips toward -y, roots +y.
 */
export function computeWorldPositions(
  graph: TreeGraph,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): Map<string, NodeGeometry> {
  const result = new Map<string, NodeGeometry>();
  const root = graph.getNode(graph.rootId);
  if (!root) return result;

  interface Frame {
    nodeId: string;
    parentWorldAngle: number | null;
    parentDomain: GrowthDomain | null;
    startX: number;
    startY: number;
  }

  const stack: Frame[] = [
    { nodeId: root.id, parentWorldAngle: null, parentDomain: null, startX: origin.x, startY: origin.y },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const node = graph.getNode(frame.nodeId);
    if (!node) continue;

    const domain = NODE_RULES[node.type].domain;
    const worldAngle =
      frame.parentWorldAngle === null || frame.parentDomain !== domain
        ? baseDirection(domain) + node.angle
        : frame.parentWorldAngle + node.angle;

    const endX = frame.startX + Math.cos(worldAngle) * node.length;
    const endY = frame.startY + Math.sin(worldAngle) * node.length;
    result.set(node.id, {
      id: node.id,
      startX: frame.startX,
      startY: frame.startY,
      endX,
      endY,
      worldAngle,
    });

    for (const childId of node.childIds) {
      stack.push({
        nodeId: childId,
        parentWorldAngle: worldAngle,
        parentDomain: domain,
        startX: endX,
        startY: endY,
      });
    }
  }

  return result;
}
