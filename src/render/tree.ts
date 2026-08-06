import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import type { ScreenSegment, TreeBounds, TreeLayout } from '../engine/tree';
import { HORIZON_RATIO, PALETTE } from './palette';

/**
 * Screen placement and drawing of the tree.
 *
 * The trunk base sits on the horizon line: canopy above, roots below. The scale
 * is derived from the tree's *measured* bounds rather than assumed, because the
 * silhouette changes every time the player grows something — whichever of
 * canopy height, root depth or width binds first decides the scale, so the tree
 * stays fully on screen on narrow phones and wide monitors alike.
 *
 * New parts ease in over {@link GROW_ANIM_MS} so a purchase lands with a little
 * weight instead of blinking into existence.
 */

/** Fraction of the sky height the canopy may fill. */
const VERTICAL_FIT = 0.86;

/** Fraction of the soil height the roots may fill. */
const UNDERGROUND_FIT = 0.86;

/** Fraction of the canvas width the tree may span. */
const HORIZONTAL_FIT = 0.66;

/**
 * Canopy height the layout scales against until the tree outgrows it.
 *
 * Without a floor, a lone seedling would be blown up to fill the whole sky and
 * then visibly shrink with every branch bought. Fitting to a full-grown unit
 * height instead lets a sapling *look* like a sapling and keeps the picture
 * stable through the early game.
 */
const REFERENCE_HEIGHT = 1;

/** How long a newly grown part takes to scale in, in ms. */
export const GROW_ANIM_MS = 120;

/** Ease-out cubic: quick off the mark, settling into place. */
function easeOut(t: number): number {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

/**
 * Scale-in progress for a part grown at `spawnedAt`, in `[0, 1]`. Parts with no
 * recorded spawn time (anything already there when the renderer started) are
 * fully grown.
 */
export function growProgress(now: number, spawnedAt: number | undefined): number {
  if (spawnedAt === undefined) return 1;
  const t = (now - spawnedAt) / GROW_ANIM_MS;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return easeOut(t);
}

/** Where a tree with the given `bounds` sits on a canvas of `w × h` CSS pixels. */
export function computeTreeLayout(w: number, h: number, bounds: TreeBounds): TreeLayout {
  const groundY = Math.round(h * HORIZON_RATIO);

  // Guard against a degenerate (zero-extent) tree dividing by zero.
  const above = Math.max(bounds.maxY, REFERENCE_HEIGHT);
  const below = Math.max(-bounds.minY, 0);
  const halfSpread = Math.max((bounds.maxX - bounds.minX) / 2, 1e-6);

  const skyScale = (groundY * VERTICAL_FIT) / above;
  const soilScale = below > 0 ? ((h - groundY) * UNDERGROUND_FIT) / below : Infinity;
  const widthScale = (w * HORIZONTAL_FIT) / 2 / halfSpread;
  const scale = Math.min(skyScale, soilScale, widthScale);

  // Centre the silhouette, not the trunk: a lopsided canopy still sits centred.
  const centerX = (bounds.minX + bounds.maxX) / 2;

  return {
    originX: Math.round(w / 2 - centerX * scale),
    originY: groundY,
    scale,
  };
}

/** A segment shortened to `t` of its length, as the scale-in animation wants. */
function interpolated(segment: ScreenSegment, t: number): ScreenSegment {
  if (t >= 1) return segment;
  return {
    ...segment,
    b: {
      x: segment.a.x + (segment.b.x - segment.a.x) * t,
      y: segment.a.y + (segment.b.y - segment.a.y) * t,
    },
    // Never fully vanish: a part popping in from nothing reads as a glitch.
    width: segment.width * (0.35 + 0.65 * t),
  };
}

/**
 * Deterministic blob offsets for a leaf cluster, derived from its node id so a
 * given cluster always has the same silhouette.
 */
function blobOffsets(id: string, count: number): { dx: number; dy: number; r: number }[] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const blobs: { dx: number; dy: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    const angle = ((hash >>> 8) / 0xffffff) * Math.PI * 2;
    hash = Math.imul(hash ^ (hash >>> 13), 0x85ebca6b) >>> 0;
    const radial = 0.35 + ((hash >>> 8) / 0xffffff) * 0.55;
    blobs.push({
      dx: Math.cos(angle) * radial,
      dy: Math.sin(angle) * radial,
      r: 0.62 + ((hash >>> 4) % 100) / 260,
    });
  }
  return blobs;
}

/** How much of its base width a limb keeps at its tip. */
const TAPER = 0.66;

/**
 * Wood: a limb that narrows toward its tip, with round joints at both ends.
 *
 * Drawn as a single filled path rather than a stroke, because a constant-width
 * stroke makes every limb read as a plank — the taper is most of what makes a
 * drawn tree look like a tree. The end caps are arcs on the same path, so a
 * child limb's fat base sits flush inside its parent's narrow tip.
 */
function fillWood(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  color: string,
  taper = TAPER,
): void {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  if (dx === 0 && dy === 0) return;

  const angle = Math.atan2(dy, dx);
  const halfBase = Math.max(0.7, segment.width / 2);
  const halfTip = Math.max(0.5, halfBase * taper);

  ctx.fillStyle = color;
  ctx.beginPath();
  // Round the base joint, run up one flank, round the tip, and close down the
  // other flank.
  ctx.arc(segment.a.x, segment.a.y, halfBase, angle + Math.PI / 2, angle + 1.5 * Math.PI);
  ctx.arc(segment.b.x, segment.b.y, halfTip, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

/** A leaf cluster: overlapping soft circles around the twig's tip. */
function drawLeafCluster(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  t: number,
  alpha = 1,
): void {
  const radius = Math.max(3, segment.width) * t;
  const blobs = blobOffsets(segment.id, 4);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i];
    ctx.fillStyle =
      i === 0 ? PALETTE.leafShade : i === blobs.length - 1 ? PALETTE.leafHighlight : PALETTE.leaf;
    ctx.beginPath();
    ctx.arc(
      segment.b.x + blob.dx * radius,
      segment.b.y + blob.dy * radius,
      radius * blob.r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** A blossom: petals around a pale core. */
function drawBlossom(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  t: number,
  alpha = 1,
): void {
  const radius = Math.max(2.5, segment.width) * t;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.blossom;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      segment.b.x + Math.cos(angle) * radius * 0.7,
      segment.b.y + Math.sin(angle) * radius * 0.7,
      radius * 0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.blossomCore;
  ctx.beginPath();
  ctx.arc(segment.b.x, segment.b.y, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Bark colour for a structural part. */
function woodColor(kind: TreeNodeType): string {
  switch (kind) {
    case 'trunk':
      return PALETTE.bark;
    case 'branch':
      return PALETTE.branch;
    case 'twig':
      return PALETTE.twig;
    case 'rootSegment':
      return PALETTE.root;
    case 'rootTip':
      return PALETTE.rootTip;
    default:
      return PALETTE.branch;
  }
}

/** Spawn timestamps per node id, so each part can ease in independently. */
export type SpawnTimes = ReadonlyMap<string, number>;

/**
 * Draw the whole tree.
 *
 * Roots go down first (they belong behind the soil's shading), then the wood of
 * the canopy, then the sunlit trunk edge, and finally leaves and blossoms on
 * top so foliage always reads in front of the limb carrying it.
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  segments: readonly ScreenSegment[],
  now: number,
  spawns: SpawnTimes = new Map(),
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const progress = new Map<string, number>();
  for (const segment of segments) {
    progress.set(segment.id, growProgress(now, spawns.get(segment.id)));
  }

  const at = (segment: ScreenSegment) => interpolated(segment, progress.get(segment.id) ?? 1);

  // Roots.
  for (const segment of segments) {
    const rule = GROWTH_RULE_BY_TYPE[segment.kind];
    if (rule.domain !== 'root') continue;
    fillWood(ctx, at(segment), woodColor(segment.kind));
  }

  // Canopy wood.
  for (const segment of segments) {
    if (segment.kind !== 'trunk' && segment.kind !== 'branch' && segment.kind !== 'twig') continue;
    fillWood(ctx, at(segment), woodColor(segment.kind));
  }

  // Sunlit edge: a thin offset stroke along the trunk only.
  ctx.strokeStyle = PALETTE.barkHighlight;
  for (const segment of segments) {
    if (segment.kind !== 'trunk') continue;
    const drawn = at(segment);
    const offset = drawn.width * 0.26;
    ctx.lineWidth = Math.max(1, drawn.width * 0.22);
    ctx.beginPath();
    ctx.moveTo(drawn.a.x - offset, drawn.a.y);
    ctx.lineTo(drawn.b.x - offset, drawn.b.y);
    ctx.stroke();
  }

  // Foliage on top.
  for (const segment of segments) {
    const t = progress.get(segment.id) ?? 1;
    if (segment.kind === 'leafCluster') drawLeafCluster(ctx, segment, t);
    else if (segment.kind === 'blossom') drawBlossom(ctx, segment, t);
  }

  ctx.restore();
}

/**
 * Draw a translucent preview of a part the player is hovering but has not
 * bought, at the exact position and angle it would occupy.
 */
export function drawGhostPart(ctx: CanvasRenderingContext2D, segment: ScreenSegment): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (segment.kind === 'leafCluster') {
    drawLeafCluster(ctx, segment, 1, 0.5);
  } else if (segment.kind === 'blossom') {
    drawBlossom(ctx, segment, 1, 0.5);
  } else {
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = PALETTE.ghost;
    ctx.lineWidth = Math.max(1.5, segment.width);
    ctx.beginPath();
    ctx.moveTo(segment.a.x, segment.a.y);
    ctx.lineTo(segment.b.x, segment.b.y);
    ctx.stroke();
  }

  // A dot marking exactly where the new part joins its parent.
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.ghost;
  ctx.beginPath();
  ctx.arc(segment.a.x, segment.a.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
