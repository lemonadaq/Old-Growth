import type { TreeNodeType } from '../content/growth';
import type { Segment } from './geometry';

/**
 * Projection between canonical tree space and the screen.
 *
 * The tree itself lives in `src/engine/treeGraph.ts`; this module only carries
 * its flattened geometry across into pixels. Segments are in **canonical tree
 * space**: the trunk base sits at the origin, `+x` points right and `+y` points
 * *up*, with 1 unit ≈ a mature tree's height. Keeping the graph
 * resolution-independent means a resize re-projects rather than regrows.
 */

/** One node of the tree flattened into a drawable, hit-testable segment. */
export interface TreeSegment extends Segment {
  /** The id of the node this segment came from. */
  readonly id: string;
  /** The node's part type; decides how the renderer draws it. */
  readonly kind: TreeNodeType;
  /**
   * What the part is made of; decides the colours it is drawn in. Optional so a
   * synthetic segment (a ghost preview, a test fixture) can leave it out and get
   * the starter palette.
   */
  readonly speciesId?: string;
  /** Depth from the trunk (the trunk is 0). */
  readonly depth: number;
  /** Stroke width — or blob radius, for leaf clusters and blossoms. */
  readonly width: number;
}

/** Maps canonical tree space onto screen (CSS pixel) space. */
export interface TreeLayout {
  /** Screen x of the trunk base. */
  readonly originX: number;
  /** Screen y of the trunk base (the ground line). */
  readonly originY: number;
  /** Screen pixels per canonical unit. */
  readonly scale: number;
}

/** A {@link TreeSegment} projected into screen space; widths are in pixels. */
export type ScreenSegment = TreeSegment;

/** Axis-aligned extents of a tree in canonical space. */
export interface TreeBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Extents of the tree's centre-lines, so the renderer can fit it to the canvas
 * instead of guessing at a scale. An empty tree collapses to the origin.
 *
 * `minY` goes negative once roots exist — the underground half is measured the
 * same way as the canopy.
 *
 * Stroke width is deliberately ignored: half a trunk width is small next to the
 * margin the fit already leaves, and including it would make the fit depend on
 * the scale it is being used to compute.
 */
export function treeBounds(segments: readonly TreeSegment[]): TreeBounds {
  if (segments.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const segment of segments) {
    for (const point of [segment.a, segment.b]) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }

  return { minX, maxX, minY, maxY };
}

/** Project one canonical point into screen space (y is flipped). */
export function projectPoint(point: { x: number; y: number }, layout: TreeLayout) {
  return {
    x: layout.originX + point.x * layout.scale,
    y: layout.originY - point.y * layout.scale,
  };
}

/** Project one canonical segment into screen space. */
export function projectSegment(segment: TreeSegment, layout: TreeLayout): ScreenSegment {
  return {
    ...segment,
    a: projectPoint(segment.a, layout),
    b: projectPoint(segment.b, layout),
    width: segment.width * layout.scale,
  };
}

/** Project a whole tree into screen space. */
export function projectTree(segments: readonly TreeSegment[], layout: TreeLayout): ScreenSegment[] {
  return segments.map((segment) => projectSegment(segment, layout));
}
