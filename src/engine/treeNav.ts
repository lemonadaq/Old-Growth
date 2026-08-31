import type { TreeGraph, TreeNode } from './treeGraph';

/**
 * Moving around the tree without a pointer.
 *
 * The tree is the game's main control surface: every part is its own upgrade
 * button, and until now the only way to press one was to click it. That makes
 * the whole game unreachable by keyboard, which is the one accessibility
 * failure a HUD full of aria labels cannot paper over.
 *
 * The model is the graph, not the pixels. Two axes:
 *
 * - **Out and in** follow the limb: `out` steps to a child, `in` back to the
 *   parent. "Out" means away from the trunk, which is upward in the canopy and
 *   downward underground — the direction the tree grows, whichever half you are
 *   in.
 * - **Left and right** step between siblings, ordered by where they actually
 *   are on screen rather than by the order they were bought. A player pressing
 *   right expects the limb to their right, and creation order has nothing to do
 *   with that.
 *
 * Siblings clamp rather than wrap: wrapping would teleport focus from one edge
 * of the canopy to the other, which is a jump the eye cannot follow. Out and in
 * simply stay put when there is nowhere to go — a keypress that does nothing is
 * better than one that moves focus somewhere surprising.
 */
export type NavDirection = 'out' | 'in' | 'left' | 'right';

/**
 * Which child `out` continues onto: the one closest to straight ahead.
 *
 * `angle` is relative to the parent's own heading, so the smallest magnitude is
 * the child that carries on in the same direction. Following the straightest
 * limb makes repeated `out` presses trace a path up the tree instead of veering
 * into the first branch that happens to have been bought first.
 */
function straightestChild(graph: TreeGraph, node: TreeNode): TreeNode | null {
  let best: TreeNode | null = null;
  for (const childId of node.childIds) {
    const child = graph.node(childId);
    if (!child) continue;
    if (!best || Math.abs(child.angle) < Math.abs(best.angle)) best = child;
  }
  return best;
}

/**
 * A node's siblings, left to right on screen.
 *
 * Ordered by the x of each part's far end, with the node's own id breaking
 * ties so the order is stable across calls — two limbs can end up at the same
 * x, and focus jittering between them under repeated presses would be worse
 * than an arbitrary but fixed order.
 */
export function siblingsLeftToRight(graph: TreeGraph, node: TreeNode): TreeNode[] {
  const parent = node.parentId === null ? null : graph.node(node.parentId);
  const siblings = parent
    ? parent.childIds.map((id) => graph.node(id)).filter((n): n is TreeNode => n !== undefined)
    : [node];

  const placements = graph.placements();
  return [...siblings].sort((a, b) => {
    const ax = placements.get(a.id)?.end.x ?? 0;
    const bx = placements.get(b.id)?.end.x ?? 0;
    return ax === bx ? a.id.localeCompare(b.id) : ax - bx;
  });
}

/**
 * The part one step from `from` in `direction`, or `from` itself when the move
 * has nowhere to land.
 *
 * With no part focused yet, any direction lands on the trunk: the keyboard has
 * to enter the tree somewhere, and the trunk is the one part that always exists
 * and the one every other part hangs off.
 */
export function navigate(graph: TreeGraph, from: string | null, direction: NavDirection): string {
  if (from === null) return graph.rootId;
  const node = graph.node(from);
  if (!node) return graph.rootId;

  switch (direction) {
    case 'in':
      return node.parentId ?? node.id;
    case 'out':
      return straightestChild(graph, node)?.id ?? node.id;
    case 'left':
    case 'right': {
      const row = siblingsLeftToRight(graph, node);
      const index = row.findIndex((sibling) => sibling.id === node.id);
      if (index < 0) return node.id;
      const next = index + (direction === 'right' ? 1 : -1);
      return row[next]?.id ?? node.id;
    }
  }
}

/**
 * Keep focus on something that still exists.
 *
 * A cut takes a whole subtree with it, and a prestige replaces the graph
 * outright, so the focused id can stop being a part between one keypress and
 * the next. Rather than make every caller remember that, focus is checked
 * against the graph on the way in and falls back to the trunk — the one part
 * that cannot be cut and is always there to come back to.
 */
export function focusOrTrunk(graph: TreeGraph, nodeId: string | null): string {
  return nodeId !== null && graph.node(nodeId) ? nodeId : graph.rootId;
}
