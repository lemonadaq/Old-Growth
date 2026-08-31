import { GROWTH_RULE_BY_TYPE } from '../content/growth';
import { SYMBIONT_BY_ID } from '../content/symbionts';
import type { Vec2 } from '../engine/geometry';
import type { ScreenSegment } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * The creatures, drawn.
 *
 * A symbiont is not an icon in a panel — it is a thing living *in the tree*, so
 * every one of them is positioned off the tree's own projected geometry and
 * moves with the camera. Bees fly between the actual blossoms the player bought;
 * the ants' road runs up the actual trunk; the bird takes the highest twig there
 * is, and takes a different one when the player grows a higher one.
 *
 * The scene ({@link symbiontScene}) is a pure reduction of the projected tree to
 * the handful of points the creatures need, and the motion functions are pure
 * functions of a time in seconds. That is what lets the flight paths and the
 * perch be tested without a canvas — the drawing itself is the only part that
 * needs one.
 *
 * Time is in **engine seconds** (`GameSnapshot.elapsedSeconds`), not wall clock,
 * for the same reason buffs are: a creature's idle animation is part of the
 * simulated world, and mixing the two clocks is how STEP 5's combo timing nearly
 * went wrong.
 */

/** The points on the tree the creatures live on. */
export interface SymbiontScene {
  /** Where each blossom's flower sits — the bees' waypoints. */
  readonly blossoms: readonly Vec2[];
  /** The trunk, base to tip: the ants' road and the squirrel's ladder. */
  readonly trunk: { readonly a: Vec2; readonly b: Vec2 } | null;
  /** Every root, for the fungal web to lace through. */
  readonly roots: readonly { readonly a: Vec2; readonly b: Vec2; readonly width: number }[];
  /** The highest point of canopy wood — where a bird would sit. */
  readonly perch: Vec2 | null;
  /** Trunk width in px, the scale everything is drawn against. */
  readonly trunkWidth: number;
}

/** An empty tree: nothing to live on. */
export const EMPTY_SCENE: SymbiontScene = {
  blossoms: [],
  trunk: null,
  roots: [],
  perch: null,
  trunkWidth: 0,
};

/** One resident, as the renderer needs it. Read structurally from the snapshot. */
export interface LivingSymbiont {
  readonly id: string;
  readonly level: number;
  /** Engine seconds since it arrived, or `null` if it has not. */
  readonly age: number | null;
}

/**
 * Reduce the projected tree to the points the creatures need.
 *
 * One pass. Called whenever the projection changes — a camera move, a purchase,
 * a resize — and never per frame: the tree does not move between frames, only
 * the creatures on it do.
 */
export function symbiontScene(segments: readonly ScreenSegment[]): SymbiontScene {
  const blossoms: Vec2[] = [];
  const roots: { a: Vec2; b: Vec2; width: number }[] = [];
  const wood: Vec2[] = [];
  // Where foliage hangs. A leaf cluster is drawn as blobs around the tip of the
  // twig carrying it, so that twig's tip is *inside* a bush — which is a fine
  // place for a bird to be and a terrible place to draw one.
  const buried = new Set<string>();
  let trunk: { a: Vec2; b: Vec2 } | null = null;
  let trunkWidth = 0;

  for (const segment of segments) {
    if (segment.kind === 'blossom' || segment.kind === 'leafCluster') {
      if (segment.kind === 'blossom') blossoms.push(segment.b);
      buried.add(`${segment.a.x},${segment.a.y}`);
      continue;
    }
    if (GROWTH_RULE_BY_TYPE[segment.kind].domain === 'root') {
      roots.push({ a: segment.a, b: segment.b, width: segment.width });
      continue;
    }
    if (segment.kind === 'trunk') {
      trunk = { a: segment.a, b: segment.b };
      trunkWidth = segment.width;
    }
    // Screen y grows downward, so the highest wood is the smallest y.
    wood.push(segment.b);
  }

  // The highest *clear* tip, or the highest tip at all when every one of them
  // is under foliage — a bird half-hidden in leaves still beats no bird.
  const highest = (points: readonly Vec2[]): Vec2 | null =>
    points.reduce<Vec2 | null>((best, p) => (best === null || p.y < best.y ? p : best), null);
  const clear = wood.filter((p) => !buried.has(`${p.x},${p.y}`));
  const perch = highest(clear.length > 0 ? clear : wood);

  return { blossoms, trunk, roots, perch, trunkWidth };
}

/** Smallest and largest a creature is drawn, whatever the zoom, in px. */
const UNIT_MIN = 7;
const UNIT_MAX = 44;

/**
 * The scale creatures are drawn at: the trunk's own width, clamped.
 *
 * Tying it to the tree means a bee stays bee-sized relative to the flower it is
 * visiting at every zoom level. The clamp is what stops it becoming a single
 * grey pixel on a zoomed-out old tree, or a bee the size of a branch on a
 * seedling.
 */
export function creatureUnit(scene: SymbiontScene): number {
  return Math.min(UNIT_MAX, Math.max(UNIT_MIN, scene.trunkWidth));
}

/** How long a newly arrived creature plays itself in, in engine seconds. */
export const ARRIVAL_SECONDS = 2.2;

/**
 * How far through its arrival a creature is, in `[0, 1]`. Anything that arrived
 * before the renderer was watching (`null`) is simply already here.
 */
export function arrivalProgress(age: number | null): number {
  if (age === null) return 1;
  return Math.min(1, Math.max(0, age / ARRIVAL_SECONDS));
}

/** Seconds a bee spends travelling from one blossom to the next. */
export const BEE_HOP_SECONDS = 2.4;

/**
 * How many bees are in the air at a hive level.
 *
 * Two, or three from level 3. Deliberately not "one per level": the hive's
 * strength is a number in the panel, and a swarm that grew with it would turn
 * the canopy into static long before level 5.
 */
export function beeCount(level: number): number {
  return level >= 3 ? 3 : 2;
}

/** A point on a quadratic Bézier — the arc a bee takes between two flowers. */
export function quadraticAt(p0: Vec2, control: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y,
  };
}

/**
 * The control point that bows a flight path to one side.
 *
 * Perpendicular to the line between the two flowers, so a bee arcs rather than
 * sliding along a ruler — and the sign alternates per hop, so consecutive trips
 * bow opposite ways instead of tracing the same wire back and forth.
 */
function flightControl(from: Vec2, to: Vec2, hop: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const bow = Math.min(46, distance * 0.32) * (hop % 2 === 0 ? 1 : -1);
  return {
    x: (from.x + to.x) / 2 - (dy / distance) * bow,
    y: (from.y + to.y) / 2 + (dx / distance) * bow,
  };
}

/**
 * Where bee `index` is at time `t`, or `null` when there is nothing to visit.
 *
 * Each bee runs the same hop clock at its own offset, so they are never in
 * formation. With a single blossom on the tree they orbit it instead — a bee
 * that flies from a flower to the same flower would look broken.
 */
export function beeAt(scene: SymbiontScene, index: number, t: number): Vec2 | null {
  const flowers = scene.blossoms;
  if (flowers.length === 0) return null;

  const offset = index * 0.41;
  const clock = t / BEE_HOP_SECONDS + offset;
  const hop = Math.floor(clock);
  const local = clock - hop;

  if (flowers.length === 1) {
    const orbit = creatureUnit(scene) * 1.5;
    const angle = clock * Math.PI * 2;
    return {
      x: flowers[0].x + Math.cos(angle) * orbit,
      y: flowers[0].y + Math.sin(angle) * orbit * 0.6,
    };
  }

  const from = flowers[(hop + index) % flowers.length];
  const to = flowers[(hop + index + 1) % flowers.length];
  const point = quadraticAt(from, flightControl(from, to, hop + index), to, local);

  // A flutter on top of the path: a bee that traced a clean curve would read as
  // a cursor, not an insect.
  return { x: point.x, y: point.y + Math.sin(t * 16 + index * 2.1) * 1.6 };
}

/** Ants on the road at a colony level. */
function antCount(level: number): number {
  return 5 + level * 2;
}

/** How long one ant takes to walk the trunk, in seconds. */
const ANT_TRIP_SECONDS = 9;

/**
 * Where ant `index` of `count` is along the trunk at time `t`, in `[0, 1)`.
 *
 * Evenly spaced and all moving at one speed, which is what makes a column read
 * as a column. Half the colony walks down: an ant road is two-way, and a line
 * that only ever goes up looks like a loading bar.
 */
export function antAt(index: number, count: number, t: number): { at: number; up: boolean } {
  const up = index % 2 === 0;
  const phase = (t / ANT_TRIP_SECONDS + index / Math.max(1, count)) % 1;
  return { at: up ? phase : 1 - phase, up };
}

/**
 * Where the squirrel is along the trunk at time `t`, in `[0, 1]`.
 *
 * It runs up and down between a third and four fifths of the trunk, pausing at
 * each end — a sine gives that for free, and pausing is most of what makes an
 * animal look like it is deciding something rather than cycling.
 */
export function squirrelAt(t: number): number {
  return 0.33 + 0.47 * (0.5 - 0.5 * Math.cos(t * 0.55));
}

/** Interpolate along a segment. */
function along(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The expanding ring that marks a creature turning up. */
function drawArrivalRing(ctx: CanvasRenderingContext2D, at: Vec2, unit: number, p: number): void {
  if (p >= 1) return;
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.75;
  ctx.strokeStyle = PALETTE.arrivalRing;
  ctx.lineWidth = Math.max(1, unit * 0.12);
  ctx.beginPath();
  ctx.arc(at.x, at.y, unit * (0.6 + p * 3.4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** One bee: a striped body with a blur of wing over it. */
function drawBee(ctx: CanvasRenderingContext2D, at: Vec2, unit: number, t: number): void {
  const r = Math.max(1.6, unit * 0.17);

  ctx.fillStyle = PALETTE.beeWing;
  const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 26));
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - r * 0.8, r * 1.1, r * 0.55 * flap, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.bee;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.beeStripe;
  ctx.fillRect(at.x - r * 0.18, at.y - r * 0.75, Math.max(0.8, r * 0.36), r * 1.5);
}

function drawBees(
  ctx: CanvasRenderingContext2D,
  scene: SymbiontScene,
  level: number,
  t: number,
  fade: number,
): void {
  const unit = creatureUnit(scene);
  ctx.save();
  ctx.globalAlpha = fade;
  for (let i = 0; i < beeCount(level); i += 1) {
    const at = beeAt(scene, i, t);
    if (at) drawBee(ctx, at, unit, t + i);
  }
  ctx.restore();
}

function drawAnts(
  ctx: CanvasRenderingContext2D,
  scene: SymbiontScene,
  level: number,
  t: number,
  fade: number,
): void {
  const trunk = scene.trunk;
  if (!trunk) return;

  const unit = creatureUnit(scene);
  const offset = unit * 0.22;
  const size = Math.max(0.9, unit * 0.09);
  const count = antCount(level);

  ctx.save();
  ctx.globalAlpha = fade;

  // The road itself: a faint dotted line the column walks along, so an empty
  // stretch of trunk still reads as part of the route.
  ctx.strokeStyle = PALETTE.antTrail;
  ctx.lineWidth = Math.max(1, unit * 0.06);
  ctx.setLineDash([unit * 0.16, unit * 0.24]);
  ctx.beginPath();
  ctx.moveTo(trunk.a.x + offset, trunk.a.y);
  ctx.lineTo(trunk.b.x + offset, trunk.b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = PALETTE.ant;
  for (let i = 0; i < count; i += 1) {
    const { at, up } = antAt(i, count, t);
    const point = along(trunk.a, trunk.b, at);
    // Up and down traffic keeps to its own side of the road.
    const lane = up ? offset : -offset * 0.55;
    ctx.beginPath();
    ctx.ellipse(point.x + lane, point.y, size * 1.6, size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMycorrhiza(
  ctx: CanvasRenderingContext2D,
  scene: SymbiontScene,
  level: number,
  t: number,
  fade: number,
): void {
  if (scene.roots.length === 0) return;

  const unit = creatureUnit(scene);
  // Breathes rather than blinks: the network is alive, not a warning light.
  const pulse = 0.68 + 0.32 * Math.sin(t * 0.9);

  ctx.save();
  ctx.globalAlpha = fade * pulse;
  ctx.lineCap = 'round';

  // A soft sheath around every root, wider as the network deepens. Kept close to
  // the root's own width: it is a coat on the root, not a replacement for it.
  ctx.strokeStyle = PALETTE.myceliumGlow;
  for (const root of scene.roots) {
    ctx.lineWidth = root.width * (1.5 + level * 0.14) + unit * 0.1;
    ctx.beginPath();
    ctx.moveTo(root.a.x, root.a.y);
    ctx.lineTo(root.b.x, root.b.y);
    ctx.stroke();
  }

  // Hyphae: short filaments striking out sideways from each root, more of them
  // the higher the level — the visible half of "found further out".
  ctx.strokeStyle = PALETTE.mycelium;
  ctx.lineWidth = Math.max(1.1, unit * 0.085);
  const filaments = 2 + level;
  for (let r = 0; r < scene.roots.length; r += 1) {
    const root = scene.roots[r];
    const dx = root.b.x - root.a.x;
    const dy = root.b.y - root.a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;

    for (let i = 0; i < filaments; i += 1) {
      const at = (i + 0.5) / filaments;
      const base = along(root.a, root.b, at);
      const side = (i + r) % 2 === 0 ? 1 : -1;
      const reach = unit * (0.5 + 0.2 * level) * (0.6 + 0.4 * Math.sin(t * 0.7 + i + r));
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + nx * reach * side, base.y + ny * reach * side);
      ctx.stroke();
    }
  }

  // Spores drifting off the deepest root, so the web has something in motion.
  const deepest = scene.roots.reduce((low, root) => (root.b.y > low.b.y ? root : low));
  ctx.fillStyle = PALETTE.myceliumSpore;
  for (let i = 0; i < 3; i += 1) {
    const phase = (t * 0.35 + i / 3) % 1;
    ctx.globalAlpha = fade * (1 - phase) * 0.7;
    ctx.beginPath();
    ctx.arc(
      deepest.b.x + Math.sin(t * 1.3 + i * 2) * unit * 0.4,
      deepest.b.y - phase * unit * 1.6,
      Math.max(0.7, unit * 0.06),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawSongbird(
  ctx: CanvasRenderingContext2D,
  scene: SymbiontScene,
  level: number,
  t: number,
  fade: number,
): void {
  const perch = scene.perch;
  if (!perch) return;

  const unit = creatureUnit(scene);
  const size = unit * 0.62;
  // A bob, plus a flick of the head every few seconds: a bird at rest is never
  // quite still, and that is the whole difference between perched and pinned.
  const bob = Math.sin(t * 2.1) * size * 0.09;
  const glance = Math.sin(t * 0.6) > 0.86 ? 1 : -1;
  const cx = perch.x;
  const cy = perch.y - size * 0.75 + bob;

  ctx.save();
  ctx.globalAlpha = fade;

  // Tail, body, belly, head, beak, eye — back to front.
  ctx.fillStyle = PALETTE.songbird;
  ctx.beginPath();
  ctx.moveTo(cx - glance * size * 0.6, cy);
  ctx.lineTo(cx - glance * size * 1.5, cy + size * 0.42);
  ctx.lineTo(cx - glance * size * 1.35, cy - size * 0.06);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.72, size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.songbirdBelly;
  ctx.beginPath();
  ctx.ellipse(
    cx + glance * size * 0.1,
    cy + size * 0.2,
    size * 0.44,
    size * 0.3,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.fillStyle = PALETTE.songbird;
  ctx.beginPath();
  ctx.arc(cx + glance * size * 0.62, cy - size * 0.42, size * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.songbirdBeak;
  ctx.beginPath();
  ctx.moveTo(cx + glance * size * 0.94, cy - size * 0.48);
  ctx.lineTo(cx + glance * size * 1.42, cy - size * 0.36);
  ctx.lineTo(cx + glance * size * 0.94, cy - size * 0.26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.beeStripe;
  ctx.beginPath();
  ctx.arc(cx + glance * size * 0.74, cy - size * 0.52, Math.max(0.7, size * 0.09), 0, Math.PI * 2);
  ctx.fill();

  // A note or two, once per song level, riding up out of the beak.
  ctx.fillStyle = PALETTE.songbirdBelly;
  for (let i = 0; i < level; i += 1) {
    const phase = (t * 0.5 + i / Math.max(1, level)) % 1;
    ctx.globalAlpha = fade * Math.max(0, 1 - phase) * 0.6;
    ctx.beginPath();
    ctx.arc(
      cx + glance * size * (1.6 + phase * 1.2),
      cy - size * (0.6 + phase * 1.6),
      Math.max(0.7, size * 0.11),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawSquirrel(
  ctx: CanvasRenderingContext2D,
  scene: SymbiontScene,
  t: number,
  fade: number,
): void {
  const trunk = scene.trunk;
  if (!trunk) return;

  const unit = creatureUnit(scene);
  const size = unit * 0.5;
  const at = squirrelAt(t);
  const point = along(trunk.a, trunk.b, at);
  // Facing the way it is travelling, which the derivative of its path gives.
  const climbing = Math.sin(t * 0.55) > 0;
  const facing = climbing ? -1 : 1;
  const cx = point.x + unit * 0.5;
  const cy = point.y;

  ctx.save();
  ctx.globalAlpha = fade;

  // Tail: a fat comma curling back over the body, which is the entire
  // silhouette a squirrel has at this size.
  ctx.strokeStyle = PALETTE.squirrel;
  ctx.lineWidth = size * 0.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + facing * size * 0.6);
  ctx.quadraticCurveTo(
    cx + size * 1.0,
    cy + facing * size * 1.1,
    cx + size * 0.3,
    cy + facing * size * 1.7,
  );
  ctx.stroke();

  ctx.fillStyle = PALETTE.squirrel;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.42, size * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.squirrelBelly;
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.12, cy, size * 0.22, size * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head at the leading end, with an ear on it.
  ctx.fillStyle = PALETTE.squirrel;
  ctx.beginPath();
  ctx.arc(cx, cy - facing * size * 0.78, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.24, cy - facing * size * 1.02, size * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Where each creature's arrival ring is centred. */
function homeOf(id: string, scene: SymbiontScene): Vec2 | null {
  switch (id) {
    case 'bees':
      return scene.blossoms[0] ?? scene.perch;
    case 'songbird':
      return scene.perch;
    case 'mycorrhiza':
      return scene.roots.length > 0
        ? scene.roots.reduce((low, root) => (root.b.y > low.b.y ? root : low)).b
        : null;
    case 'ants':
    case 'squirrel':
      return scene.trunk ? along(scene.trunk.a, scene.trunk.b, 0.5) : null;
    default:
      return null;
  }
}

/**
 * Draw every resident onto the scene.
 *
 * `t` is engine seconds. Creatures that have just arrived fade in under an
 * expanding ring, so the moment one turns up is legible on the canvas and not
 * only in the toast — the toast tells you *what*, the ring tells you *where to
 * look*.
 */
export function drawSymbionts(
  ctx: CanvasRenderingContext2D,
  living: readonly LivingSymbiont[],
  scene: SymbiontScene,
  t: number,
): void {
  if (living.length === 0) return;

  ctx.save();
  for (const resident of living) {
    if (!SYMBIONT_BY_ID[resident.id]) continue;

    const progress = arrivalProgress(resident.age);
    const fade = Math.min(1, progress * 2.5);
    const level = Math.max(1, resident.level);

    switch (resident.id) {
      case 'bees':
        drawBees(ctx, scene, level, t, fade);
        break;
      case 'ants':
        drawAnts(ctx, scene, level, t, fade);
        break;
      case 'mycorrhiza':
        drawMycorrhiza(ctx, scene, level, t, fade);
        break;
      case 'songbird':
        drawSongbird(ctx, scene, level, t, fade);
        break;
      case 'squirrel':
        drawSquirrel(ctx, scene, t, fade);
        break;
      default:
        break;
    }

    const home = homeOf(resident.id, scene);
    if (home) drawArrivalRing(ctx, home, creatureUnit(scene), progress);
  }
  ctx.restore();
}
