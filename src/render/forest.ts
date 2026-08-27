import { FOREST_RENDER_LIMIT } from '../content/prestige';
import { SPECIES_BY_ID, STARTER_SPECIES_ID } from '../content/species';
import { HYBRID_BY_ID } from '../content/hybrids';
import type { Viewport } from '../engine/camera';
import type { ForestTree } from '../engine/prestige';
import type { TreeLayout } from '../engine/tree';
import { castColor, lerpColor, type ColorCast } from './color';
import { PALETTE } from './palette';
import { hillHeightAt } from './sky';

/**
 * The Old Growth forest: every tree the player has already given up, standing on
 * the hills behind the one they are growing now.
 *
 * A silhouette and nothing more. These are the *backdrop* — thirty of them at
 * once, several screens back, behind a tree that has to stay the thing you look
 * at — so each is two shapes in one flat colour, tinted by what the tree was
 * mostly made of and dimmed toward the ridge it stands on. Anything more
 * detailed would be a second canopy competing with the first.
 *
 * Everything here is a pure function of the tree record and the camera: no
 * particle pool, no RNG, no per-frame state. The same forest always draws the
 * same way, which is what makes it testable without a canvas — and what stops
 * the hills from crawling as the camera moves.
 */

/** Which hill band the forest stands on. Matches `HILL_PARALLAX[1]` in `./sky.ts`. */
const FOREST_PARALLAX = 0.46;

/**
 * Fraction of the canvas height the tallest possible silhouette occupies.
 *
 * Small on purpose, and it was smaller after seeing it drawn: at a tenth of the
 * canvas the grove reads as a hedge standing in front of the ridgeline rather
 * than as trees on the far side of it, and it took the eye straight off the tree
 * the player is actually growing.
 */
const FOREST_MAX_HEIGHT = 0.075;

/** Canonical height a silhouette drawn at full size corresponds to. */
const FOREST_REFERENCE_HEIGHT = 1.3;

/** Smallest fraction of full size a silhouette is ever drawn at. */
const FOREST_MIN_SCALE = 0.45;

/**
 * How far toward the hill's own colour each silhouette is dragged.
 *
 * Over half, so the grove is a *tint* on the ridge rather than a row of bright
 * canopies. What has to survive is that no two neighbouring species look alike;
 * saturation past that point is saturation competing with the player's tree.
 */
const FOREST_HAZE = 0.58;

/** Width of the band silhouettes are spread across, as a fraction of the canvas. */
const FOREST_SPREAD = 1.9;

/**
 * Golden-ratio conjugate. Stepping by this and wrapping gives a sequence that
 * never repeats and never clumps, which is exactly what a scatter of trees on a
 * ridge wants: each new tree lands in the largest remaining gap.
 */
const PHI = 0.618033988749895;

/** One silhouette, placed and sized in CSS pixels. */
export interface LaidForestTree {
  readonly id: string;
  /** Centre of the trunk. */
  readonly x: number;
  /** Ground line the tree stands on. */
  readonly baseY: number;
  /** Height of the whole silhouette, trunk included. */
  readonly height: number;
  /** Half-width of the crown. */
  readonly halfWidth: number;
  readonly color: string;
}

/**
 * Where one tree stands, as a fraction of the spread band.
 *
 * Derived from its planting index alone, so a tree's spot is fixed the moment it
 * is planted and never moves again — not when the next one arrives, and not when
 * the forest grows past what can be drawn.
 */
export function forestSlotOffset(slot: number): number {
  return (Math.max(0, Math.floor(slot)) * PHI) % 1;
}

/**
 * The colour a tree's silhouette is drawn in.
 *
 * Its leaf colour rather than its bark: a silhouette on a ridge is a crown with
 * a stick under it, and the crown is what carries the species. Hybrids are
 * looked up too — a tree that ended up mostly Ghostwillow should stand as one.
 * An id nothing recognises falls back to oak rather than to a stray colour.
 */
export function forestColor(speciesId: string): string {
  const palette = (SPECIES_BY_ID[speciesId] ?? HYBRID_BY_ID[speciesId])?.palette;
  return palette?.leaf ?? SPECIES_BY_ID[STARTER_SPECIES_ID].palette.leaf;
}

/**
 * The trees to draw, and how many are left over.
 *
 * The **most recent** {@link FOREST_RENDER_LIMIT} rather than the first, so the
 * tree the player has just planted is always among them. Because each keeps the
 * spot its own planting index gave it, showing a different subset never shuffles
 * the ones that stay.
 */
export function visibleForest(trees: readonly ForestTree[]): {
  readonly drawn: readonly ForestTree[];
  readonly hidden: number;
} {
  if (trees.length <= FOREST_RENDER_LIMIT) return { drawn: trees, hidden: 0 };
  return {
    drawn: trees.slice(trees.length - FOREST_RENDER_LIMIT),
    hidden: trees.length - FOREST_RENDER_LIMIT,
  };
}

/**
 * Place every visible silhouette against the near hill band.
 *
 * Each stands *on* the ridgeline rather than on the ground line — the same sum
 * of sines `./sky.ts` draws the band with, sampled at the tree's own x — so a
 * tree on a crest is higher than one in a dip, and all of them travel with the
 * band's parallax as the camera pans.
 */
export function layoutForest(
  trees: readonly ForestTree[],
  viewport: Viewport,
  layout: TreeLayout,
): LaidForestTree[] {
  const groundY = layout.originY;
  if (groundY <= 0) return [];

  const amplitude = viewport.height * 0.09;
  const offset = (viewport.width / 2 - layout.originX) * FOREST_PARALLAX;
  const span = viewport.width * FOREST_SPREAD;
  const left = viewport.width / 2 - span / 2;

  return trees.map((tree) => {
    // The tree's own place in the band, then dragged along by the parallax and
    // wrapped, so panning scrolls through the forest instead of sliding it off.
    const worldX = left + forestSlotOffset(tree.slot) * span;
    const x = ((((worldX - offset) % span) + span) % span) + left;

    const scale = Math.min(1, Math.max(FOREST_MIN_SCALE, tree.height / FOREST_REFERENCE_HEIGHT));
    const height = viewport.height * FOREST_MAX_HEIGHT * scale;
    // A tree's own spread decides how broad its crown is, floored so a tall bare
    // spire is still a tree rather than a line.
    const halfWidth = height * (0.3 + 0.45 * Math.min(1, tree.spread / 0.8));

    return {
      id: tree.id,
      x,
      baseY: groundY - hillHeightAt(x + offset, 1, amplitude),
      height,
      halfWidth,
      color: forestColor(tree.speciesId),
    };
  });
}

/** Draw one silhouette: a trunk, and a crown of three overlapping lobes. */
function drawSilhouette(ctx: CanvasRenderingContext2D, tree: LaidForestTree): void {
  const trunkHeight = tree.height * 0.34;
  const trunkWidth = Math.max(1.5, tree.height * 0.07);
  const crownY = tree.baseY - tree.height + tree.halfWidth * 0.72;

  ctx.fillStyle = tree.color;
  ctx.fillRect(tree.x - trunkWidth / 2, tree.baseY - trunkHeight, trunkWidth, trunkHeight);

  // Three lobes rather than one circle: a single disc on a stick reads as a
  // lollipop, and three overlapping ones read as foliage even at twelve pixels.
  ctx.beginPath();
  ctx.arc(tree.x, crownY, tree.halfWidth * 0.78, 0, Math.PI * 2);
  ctx.arc(
    tree.x - tree.halfWidth * 0.5,
    crownY + tree.halfWidth * 0.34,
    tree.halfWidth * 0.6,
    0,
    Math.PI * 2,
  );
  ctx.arc(
    tree.x + tree.halfWidth * 0.5,
    crownY + tree.halfWidth * 0.34,
    tree.halfWidth * 0.6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

/**
 * Draw the forest standing on the hills, and — once there are more trees than
 * can be drawn — the count of the ones that are not.
 *
 * Every silhouette is hazed toward the hill behind it and takes whatever the
 * season and the weather are casting, for the same reason the ridgeline does: a
 * winter that whitened the sky and left a summer-green forest standing in it
 * would read as two different days in one picture.
 */
export function drawForest(
  ctx: CanvasRenderingContext2D,
  trees: readonly LaidForestTree[],
  hidden: number,
  viewport: Viewport,
  layout: TreeLayout,
  casts: readonly ColorCast[] = [],
): void {
  const groundY = layout.originY;
  if (groundY <= 0 || (trees.length === 0 && hidden === 0)) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, viewport.width, Math.min(viewport.height, groundY));
  ctx.clip();

  for (const tree of trees) {
    const hazed = castColor(lerpColor(tree.color, PALETTE.hillNear, FOREST_HAZE), casts);
    drawSilhouette(ctx, { ...tree, color: hazed });
  }

  if (hidden > 0) {
    // Centred rather than tucked into a corner: both corners of the sky already
    // hold a panel, and a counter drawn behind one is a counter nobody reads.
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = castColor(PALETTE.forestCount, casts);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`+${hidden} more in the grove`, viewport.width / 2, groundY - 10);
  }

  ctx.restore();
}
