import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import { SPECIES_BY_ID, STARTER_SPECIES_ID } from '../content/species';
import type { Viewport } from '../engine/camera';
import { speciesPalette } from '../engine/species';
import type { ScreenSegment, TreeBounds, TreeLayout } from '../engine/tree';
import { castColor, lerpColor, type ColorCast } from './color';
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

/**
 * How long a newly grown part takes to scale in, in ms.
 *
 * Longer than it needs to be to be *seen*, and that is the point: a purchase is
 * the moment the player's decision becomes part of the tree, and a limb that
 * unfurls over a third of a second has weight that one that appears in two
 * frames does not. Short enough that a player buying six branches in a row is
 * never waiting on the animation to know the last one landed.
 */
export const GROW_ANIM_MS = 380;

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

/** FNV-1a over a node id: a stable seed for that node's look and motion. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Deterministic blob offsets for a leaf cluster, derived from its node id so a
 * given cluster always has the same silhouette.
 */
function blobOffsets(id: string, count: number): { dx: number; dy: number; r: number }[] {
  let hash = hashId(id);

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

/** How long one full sway takes, in ms. Slow: this is a big old tree. */
const SWAY_PERIOD_MS = 3400;

/** Sway travel as a fraction of a cluster's radius. */
const SWAY_AMPLITUDE = 0.22;

/**
 * How far a piece of foliage has drifted from its rest position, in pixels.
 *
 * Each cluster gets its own phase from its node id, so neighbouring leaves lag
 * one another instead of the whole canopy pulsing as one slab — that
 * synchronised look is what makes a swaying tree read as a screensaver. The
 * vertical component is a third of the horizontal and runs at twice the rate,
 * which traces a shallow figure-eight rather than a slide.
 */
export function swayOffset(id: string, now: number, radius: number): { dx: number; dy: number } {
  const phase = (hashId(id) % 1000) / 1000;
  const angle = (now / SWAY_PERIOD_MS + phase) * Math.PI * 2;
  const reach = radius * SWAY_AMPLITUDE;
  return { dx: Math.sin(angle) * reach, dy: Math.sin(angle * 2) * reach * 0.33 };
}

/**
 * Is this segment close enough to the viewport to be worth drawing?
 *
 * The padding is generous on purpose: a leaf cluster's blobs reach well past
 * its centre-line, and a cluster popping in at the screen edge is far more
 * noticeable than the handful of microseconds spent drawing it. Culling is
 * what keeps a 500-node tree at 60fps once the camera is zoomed in and most of
 * the tree is off-screen.
 */
export function isSegmentVisible(segment: ScreenSegment, viewport: Viewport, padding = 0): boolean {
  const reach = padding + segment.width * 2;
  const minX = Math.min(segment.a.x, segment.b.x) - reach;
  const maxX = Math.max(segment.a.x, segment.b.x) + reach;
  const minY = Math.min(segment.a.y, segment.b.y) - reach;
  const maxY = Math.max(segment.a.y, segment.b.y) + reach;

  return maxX >= 0 && minX <= viewport.width && maxY >= 0 && minY <= viewport.height;
}

/** The segments worth drawing for this viewport, in their original order. */
export function cullSegments(
  segments: readonly ScreenSegment[],
  viewport: Viewport,
  padding = 8,
): ScreenSegment[] {
  return segments.filter((segment) => isSegmentVisible(segment, viewport, padding));
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

/** No motion — for the ghost preview, which must sit exactly where it will land. */
const STILL = { dx: 0, dy: 0 } as const;

/**
 * How far toward {@link PALETTE.leafOccluded} a fully shaded cluster is dragged.
 *
 * Short of the whole way on purpose: the tint is a *hint*, not a readout. It has
 * to be obvious enough that a stacked canopy looks wrong from across the screen,
 * and gentle enough that a shaded leaf still looks like a leaf.
 */
const SHADE_TINT_STRENGTH = 0.7;

/**
 * How dark a cluster is drawn, in `[0, 1]`, given its light exposure.
 *
 * Exposure of 1 (full sun) tints nothing; the floor tints most. Anything a
 * blossom has lifted above 1 is simply untinted rather than brightened — the
 * blossom itself is already visible next to it.
 *
 * The square root is what makes the lesson land. A single occluder costs only
 * 15% of a leaf's light, and a linear tint of 15% is invisible against foliage
 * that is already three shades of green — so the *first* mistake would look
 * exactly like no mistake. The curve front-loads the response: any shade at all
 * is visible, and piling more on deepens it without ever reaching black.
 */
export function shadeTint(exposure: number | undefined): number {
  if (exposure === undefined) return 0;
  return Math.sqrt(Math.min(1, Math.max(0, 1 - exposure))) * SHADE_TINT_STRENGTH;
}

/**
 * A leaf cluster: overlapping soft circles around the twig's tip.
 *
 * Two things recolour foliage and they are not the same kind of thing. `tint` is
 * *shade* — how much sky this particular cluster can see — and it is applied
 * first, because it is about this leaf. `season` is the month, and it is applied
 * over the top, because October happens to the whole tree.
 */
function drawLeafCluster(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  t: number,
  alpha = 1,
  sway: { dx: number; dy: number } = STILL,
  tint = 0,
  season?: ColorCast,
  patterns = false,
): void {
  const radius = Math.max(3, segment.width) * t;
  const blobs = blobOffsets(segment.id, 4);
  const leaves = speciesPalette(segment.speciesId ?? STARTER_SPECIES_ID);
  const casts = season ? [season] : [];

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i];
    const base =
      i === 0 ? leaves.leafShade : i === blobs.length - 1 ? leaves.leafHighlight : leaves.leaf;
    const shaded = tint > 0 ? lerpColor(base, PALETTE.leafOccluded, tint) : base;
    ctx.fillStyle = castColor(shaded, casts);
    ctx.beginPath();
    ctx.arc(
      segment.b.x + blob.dx * radius + sway.dx,
      segment.b.y + blob.dy * radius + sway.dy,
      radius * blob.r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // The second channel: a species-stable mark over the cluster, for anyone whose
  // eyes do not separate the hues the palette leans on. Derived from the species
  // id rather than chosen per cluster, so every oak carries the same mark and the
  // pattern *means* something.
  if (patterns) drawLeafPattern(ctx, segment, radius, sway, leaves.leafShade);

  ctx.restore();
}

/**
 * A small mark over a leaf cluster, keyed by its species.
 *
 * Which mark belongs to which species is declared in the species catalogue
 * rather than hashed from its id: a hash into a fixed set of shapes collides,
 * and two species sharing a mark defeats the only reason the marks exist. The
 * catalogue guarantees they are distinct; this only has to draw them.
 */
function drawLeafPattern(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  radius: number,
  sway: { dx: number; dy: number },
  color: string,
): void {
  const cx = segment.b.x + sway.dx;
  const cy = segment.b.y + sway.dy;
  const r = radius * 0.34;
  if (r < 1) return;

  const species = SPECIES_BY_ID[segment.speciesId ?? STARTER_SPECIES_ID];

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.42);
  ctx.lineCap = 'round';

  switch (species?.leafPattern ?? 'dot') {
    case 'ring':
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'bar': // Lying down.
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      break;
    case 'stripe': // Standing up — the same line, and unmistakably not the same mark.
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    case 'cross':
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      break;
    case 'chevron':
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.5);
      ctx.lineTo(cx, cy + r * 0.6);
      ctx.lineTo(cx + r, cy - r * 0.5);
      ctx.stroke();
      break;
    default: // A dot.
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  ctx.restore();
}

/** A blossom: petals around a pale core. */
function drawBlossom(
  ctx: CanvasRenderingContext2D,
  segment: ScreenSegment,
  t: number,
  alpha = 1,
  sway: { dx: number; dy: number } = STILL,
): void {
  const radius = Math.max(2.5, segment.width) * t;
  const cx = segment.b.x + sway.dx;
  const cy = segment.b.y + sway.dy;
  const petals = speciesPalette(segment.speciesId ?? STARTER_SPECIES_ID);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = petals.blossom;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius * 0.7,
      cy + Math.sin(angle) * radius * 0.7,
      radius * 0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = petals.blossomCore;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Bark colour for a structural part, in its own species' wood.
 *
 * A birch limb is pale, a cherry limb is red-brown, a grafted limb is neither of
 * its parents — which is the only reason a species choice or a graft is visible
 * at a glance rather than buried in a tooltip. An unspecified species (a ghost
 * preview, a fixture) falls back to the starter's palette.
 */
export function woodColor(kind: TreeNodeType, speciesId?: string): string {
  const palette = speciesPalette(speciesId ?? STARTER_SPECIES_ID);
  switch (kind) {
    case 'trunk':
      return palette.bark;
    case 'branch':
      return palette.branch;
    case 'twig':
      return palette.twig;
    case 'rootSegment':
      return palette.root;
    case 'rootTip':
      return palette.rootTip;
    default:
      return palette.branch;
  }
}

/** Spawn timestamps per node id, so each part can ease in independently. */
export type SpawnTimes = ReadonlyMap<string, number>;

/**
 * Per-leaf light exposure, keyed by node id — the engine's own record, read
 * structurally so the renderer needs nothing from it but the number.
 */
export type LeafExposures = ReadonlyMap<string, { readonly exposure: number }>;

/**
 * Draw the whole tree.
 *
 * Roots go down first (they belong behind the soil's shading), then the wood of
 * the canopy, then the sunlit trunk edge, and finally leaves and blossoms on
 * top so foliage always reads in front of the limb carrying it.
 *
 * Passing a `viewport` culls everything off-screen before any of those passes
 * run, so a zoomed-in camera pays only for the parts the player can see.
 * Passing `exposures` darkens the clusters the canopy is shading, which is how
 * a crowded tree tells on itself. Passing `season` recolours the foliage for the
 * month — autumn's whole reason for existing.
 *
 * Passing `motion: false` — the player's `prefers-reduced-motion` — holds the
 * canopy perfectly still and lands new parts at full size. The tree still says
 * everything it says about shade, species and season; it simply stops moving.
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  allSegments: readonly ScreenSegment[],
  now: number,
  spawns: SpawnTimes = new Map(),
  viewport?: Viewport,
  exposures?: LeafExposures,
  season?: ColorCast,
  motion = true,
  patterns = false,
): void {
  const segments = viewport ? cullSegments(allSegments, viewport) : allSegments;
  if (segments.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const progress = new Map<string, number>();
  for (const segment of segments) {
    // With motion off, a new part is simply *there* on the frame it is bought.
    // The scale-in is the one piece of juice that cannot be replaced by holding
    // still — a part has to arrive somehow — so it is skipped, not slowed.
    progress.set(segment.id, motion ? growProgress(now, spawns.get(segment.id)) : 1);
  }

  const at = (segment: ScreenSegment) => interpolated(segment, progress.get(segment.id) ?? 1);

  // Roots.
  for (const segment of segments) {
    const rule = GROWTH_RULE_BY_TYPE[segment.kind];
    if (rule.domain !== 'root') continue;
    fillWood(ctx, at(segment), woodColor(segment.kind, segment.speciesId));
  }

  // Canopy wood.
  for (const segment of segments) {
    if (segment.kind !== 'trunk' && segment.kind !== 'branch' && segment.kind !== 'twig') continue;
    fillWood(ctx, at(segment), woodColor(segment.kind, segment.speciesId));
  }

  // Sunlit edge: a thin offset stroke along the trunk only.
  for (const segment of segments) {
    if (segment.kind !== 'trunk') continue;
    ctx.strokeStyle = speciesPalette(segment.speciesId ?? STARTER_SPECIES_ID).barkHighlight;
    const drawn = at(segment);
    const offset = drawn.width * 0.26;
    ctx.lineWidth = Math.max(1, drawn.width * 0.22);
    ctx.beginPath();
    ctx.moveTo(drawn.a.x - offset, drawn.a.y);
    ctx.lineTo(drawn.b.x - offset, drawn.b.y);
    ctx.stroke();
  }

  // Foliage on top, drifting in the wind.
  for (const segment of segments) {
    if (segment.kind !== 'leafCluster' && segment.kind !== 'blossom') continue;
    const t = progress.get(segment.id) ?? 1;
    const sway = motion ? swayOffset(segment.id, now, Math.max(3, segment.width) * t) : STILL;
    if (segment.kind === 'leafCluster') {
      drawLeafCluster(
        ctx,
        segment,
        t,
        1,
        sway,
        shadeTint(exposures?.get(segment.id)?.exposure),
        season,
        patterns,
      );
    } else {
      drawBlossom(ctx, segment, t, 1, sway);
    }
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
