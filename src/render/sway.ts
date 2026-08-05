/**
 * Wind sway for the canopy.
 *
 * Each node oscillates by its own `swayAmount` around its own `swayPhase`, but a
 * limb also has to carry everything hanging off it — otherwise twigs and leaf
 * clusters visibly detach from the branch they grow on. So sway is accumulated
 * down the graph: a node's *base* offset is its parent's offset at the
 * attachment point, and its *tip* offset adds its own oscillation on top.
 *
 * `TreeGraph.nodes` is ordered parents-before-children, so one linear pass per
 * frame resolves the whole tree. Roots have `swayAmount === 0`, which makes the
 * underground perfectly still for free.
 */

import { lerp } from '../engine/geometry';
import type { TreeGraph, TreeNode } from '../engine/treeGraph';

/** Radians per second of the base sway oscillation. */
const SWAY_SPEED = 0.9;

/** Slow gust envelope that swells and eases the whole canopy. */
const GUST_SPEED = 0.21;
const GUST_MIN = 0.62;

export interface SwayEntry {
  /** Sideways offset at the node's base, inherited from its parent. */
  readonly base: number;
  /** Sideways offset at the node's tip. */
  readonly tip: number;
}

const STILL: SwayEntry = { base: 0, tip: 0 };

/** Strength of the wind at `time`, in `[GUST_MIN, 1]`. */
export function gustAt(time: number): number {
  return GUST_MIN + (1 - GUST_MIN) * (0.5 + 0.5 * Math.sin(time * GUST_SPEED));
}

/**
 * Per-frame sway offsets for every node in a graph. The instance is reused
 * across frames so a 500-node tree allocates nothing after the first pass.
 */
export class SwayField {
  private readonly entries = new Map<string, SwayEntry>();

  /** Recompute every node's offsets for `time` (seconds of simulated time). */
  update(graph: TreeGraph, time: number): void {
    this.entries.clear();
    const gust = gustAt(time);

    for (const node of graph.nodes) {
      const parent = node.parentId === null ? undefined : this.entries.get(node.parentId);
      // Parent limbs bend quadratically, so inherit with the same easing the
      // limb itself is drawn with.
      const base = parent ? lerp(parent.base, parent.tip, node.attach * node.attach) : 0;
      const oscillation = node.swayAmount * gust * Math.sin(time * SWAY_SPEED + node.swayPhase);
      this.entries.set(node.id, { base, tip: base + oscillation });
    }
  }

  /** Offsets for a node; all-zero if it was not part of the last update. */
  entryFor(node: TreeNode): SwayEntry {
    return this.entries.get(node.id) ?? STILL;
  }

  /** Sideways offset at parameter `t` along a limb. */
  offsetAt(node: TreeNode, t: number): number {
    const entry = this.entryFor(node);
    return lerp(entry.base, entry.tip, t * t);
  }
}
