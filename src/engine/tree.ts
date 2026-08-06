import { DEFAULT_TREE, type TreeBlueprint } from '../content/tree';
import type { Segment, Vec2 } from './geometry';
import { createSeededRandom, type RandomSource } from './rng';

/**
 * The procedural tree skeleton: an ordered list of straight segments that make
 * up the trunk and its branches.
 *
 * Segments live in **canonical tree space**: the trunk base sits at the origin,
 * `+x` points right and `+y` points *up*. One unit is roughly the tree's own
 * height, which keeps the geometry resolution-independent — the renderer
 * projects it into screen pixels via {@link projectTree}.
 */
export interface TreeSegment extends Segment {
  /** Stable id, unique within a generated tree. */
  readonly id: string;
  readonly kind: 'trunk' | 'branch';
  /** 0 for the trunk, incrementing once per branch generation. */
  readonly depth: number;
  /** Stroke width in canonical units. */
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

const DEG = Math.PI / 180;

function advance(from: Vec2, angleRad: number, length: number): Vec2 {
  return {
    x: from.x + Math.cos(angleRad) * length,
    y: from.y + Math.sin(angleRad) * length,
  };
}

/**
 * Recursively grow one branch and its children, appending to `out`.
 *
 * Children fan out evenly across `spreadDegrees` centred on the parent's
 * heading, with a per-branch random wobble so no two forks look identical.
 */
function growBranch(
  out: TreeSegment[],
  id: string,
  from: Vec2,
  angleRad: number,
  length: number,
  width: number,
  depth: number,
  bp: TreeBlueprint,
  rng: RandomSource,
): void {
  const to = advance(from, angleRad, length);
  out.push({ id, kind: 'branch', depth: bp.depth - depth, a: from, b: to, width });

  if (depth <= 0) return;

  const spread = bp.spreadDegrees * DEG;
  const jitter = bp.angleJitterDegrees * DEG;
  const count = bp.branchesPerNode;

  for (let i = 0; i < count; i += 1) {
    // Evenly spaced across the spread; a lone child continues straight on.
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
    const childAngle = angleRad + offset + (rng() - 0.5) * 2 * jitter;
    growBranch(
      out,
      `${id}.${i}`,
      to,
      childAngle,
      length * bp.lengthFalloff,
      width * bp.widthFalloff,
      depth - 1,
      bp,
      rng,
    );
  }
}

/**
 * Build the tree skeleton from a blueprint.
 *
 * The trunk is a slightly curving chain of segments that tapers as it rises;
 * its upper segments sprout alternating side limbs, and the top forks into the
 * crown. Deterministic for a given `blueprint.seed`.
 */
export function generateTree(blueprint: TreeBlueprint = DEFAULT_TREE): TreeSegment[] {
  const bp = blueprint;
  const rng = createSeededRandom(bp.seed);
  const out: TreeSegment[] = [];

  const segmentLength = bp.trunkLength / bp.trunkSegments;
  const curvePerSegment = (bp.trunkCurveDegrees * DEG) / bp.trunkSegments;

  let cursor: Vec2 = { x: 0, y: 0 };
  let angle = Math.PI / 2; // straight up

  for (let i = 0; i < bp.trunkSegments; i += 1) {
    angle += (rng() - 0.5) * 2 * curvePerSegment;
    // Taper toward the crown so the base reads as the heaviest part.
    const width = bp.trunkWidth * (1 - 0.45 * (i / bp.trunkSegments));
    const next = advance(cursor, angle, segmentLength);
    out.push({ id: `trunk.${i}`, kind: 'trunk', depth: 0, a: cursor, b: next, width });

    if (i >= bp.sideBranchFromSegment) {
      // Alternate sides so the limbs do not all lean the same way.
      const side = i % 2 === 0 ? 1 : -1;
      growBranch(
        out,
        `limb.${i}`,
        next,
        angle + side * bp.spreadDegrees * DEG,
        segmentLength * 1.1,
        width * bp.widthFalloff,
        bp.depth - 1,
        bp,
        rng,
      );
    }

    cursor = next;
  }

  // The crown: the trunk's own continuation, forking to full depth.
  growBranch(
    out,
    'crown',
    cursor,
    angle,
    bp.trunkLength * bp.lengthFalloff,
    bp.trunkWidth * bp.widthFalloff,
    bp.depth,
    bp,
    rng,
  );

  return out;
}

/**
 * Extents of the tree's centre-lines, so the renderer can fit it to the canvas
 * instead of guessing at a scale. An empty tree collapses to the origin.
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

/** Project one canonical segment into screen space (y is flipped). */
export function projectSegment(segment: TreeSegment, layout: TreeLayout): ScreenSegment {
  const { originX, originY, scale } = layout;
  return {
    ...segment,
    a: { x: originX + segment.a.x * scale, y: originY - segment.a.y * scale },
    b: { x: originX + segment.b.x * scale, y: originY - segment.b.y * scale },
    width: segment.width * scale,
  };
}

/** Project a whole tree into screen space. */
export function projectTree(segments: readonly TreeSegment[], layout: TreeLayout): ScreenSegment[] {
  return segments.map((segment) => projectSegment(segment, layout));
}
