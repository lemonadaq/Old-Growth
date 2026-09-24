import {
  PASSIVE_BRANCH_BY_ID,
  PASSIVE_EDGES,
  PASSIVE_NODES,
  PASSIVE_NODE_BY_ID,
  PASSIVE_START_ID,
  type PassiveKind,
  type PassiveNodeDef,
} from '../content/passives';
import { PALETTE } from './palette';

/**
 * Drawing the Heartwood map.
 *
 * A cross-section of a trunk: the pith at the centre, six branches radiating
 * out, and every node a mark on one of them. The whole module is a pure
 * function of a camera and a set of allocated ids — it owns no state, reads no
 * store, and is handed everything it draws, which is what lets the React shell
 * decide *when* to draw and keeps this file testable without a DOM.
 *
 * The visual grammar is three-way and has to survive a 360px phone screen:
 *
 * - **Shape says what a node is.** Minors are small discs, notables are large
 *   discs with a ring, keystones are diamonds. Size and silhouette carry it,
 *   because colour alone is not available to everyone and a phone screen in
 *   sunlight is not a colour-accurate display.
 * - **Fill says whether it is yours.** Allocated nodes are filled in their
 *   branch's colour; open ones are outlined in it and hollow; everything else
 *   is drawn in the dim of unlit wood.
 * - **The line between two nodes lights up only when both ends are
 *   allocated**, which is what makes a finished route read as a route.
 */

/** Where the map is being looked at from. */
export interface MapCamera {
  /** Map units per CSS pixel at scale 1 — the zoom. */
  readonly scale: number;
  /** Map point currently under the centre of the canvas. */
  readonly x: number;
  readonly y: number;
}

/** The canvas the map is drawn into, in CSS pixels. */
export interface MapViewport {
  readonly width: number;
  readonly height: number;
}

/** Everything the map needs to know about the player's progress. */
export interface MapState {
  readonly allocated: ReadonlySet<string>;
  readonly open: ReadonlySet<string>;
  /** The node the info card is currently showing, or `null`. */
  readonly selected: string | null;
  /** Node ids matching the current search, or `null` when nothing is searched. */
  readonly matches: ReadonlySet<string> | null;
}

/**
 * Radius of each node kind, **in map units**.
 *
 * In map units rather than pixels so that zooming in makes the nodes bigger,
 * which is what everyone expects from a map and what makes the crowded middle
 * legible: six branches all start within a unit and a half of the centre, and
 * at a fixed pixel size their first two nodes overlap the heartwood at the zoom
 * where the whole map fits. Clamped at both ends on the way to the screen, so
 * they stay tappable zoomed out and stop growing zoomed in.
 */
const NODE_UNITS: Readonly<Record<PassiveKind, number>> = {
  start: 0.5,
  minor: 0.24,
  notable: 0.36,
  keystone: 0.44,
};

/** Drawn node radius, whatever the zoom. */
const MIN_NODE_PX = 4;
const MAX_NODE_PX = 26;

/** How much bigger a node's tap target is than the node itself. */
const TOUCH_SLOP_PX = 9;

/** A node's drawn radius in CSS pixels, at this zoom. */
function nodeRadius(kind: PassiveKind, scale: number): number {
  return Math.min(MAX_NODE_PX, Math.max(MIN_NODE_PX, NODE_UNITS[kind] * scale));
}

/**
 * The dim every unreachable node is drawn in: unlit wood, not grey.
 *
 * Bright enough to read as a node rather than as background. A locked node is
 * still information — it is where the branch *goes* — and a map whose far half
 * is invisible until you have walked to it cannot be planned against, which is
 * the only thing a passive map is for.
 */
const DIM = 'rgba(253, 243, 224, 0.38)';
const DIM_LINE = 'rgba(253, 243, 224, 0.16)';

/** What every node is filled with before it is taken. */
const UNTAKEN_FILL = 'rgba(38, 27, 16, 0.92)';

/** Map units of clear space the grain is drawn out to, past the last node. */
export const MAP_PADDING = 1.6;

/** How far past the outermost node the branch labels sit, in CSS pixels. */
const LABEL_OFFSET_PX = 30;

/**
 * Pixels of the canvas reserved for the branch labels, on every side.
 *
 * In pixels, because that is what the labels are measured in: they sit a fixed
 * distance past the outermost node and are a fixed number of points tall,
 * whatever the zoom. Reserving the room in *map units* instead is what cut
 * `CANOPY` and `ROOTS` in half on a portrait phone — the reservation shrank
 * with the map while the text it was for did not.
 */
const LABEL_RESERVE_PX = 56;

/** Project a map point into canvas CSS pixels. */
export function toScreen(
  point: { readonly x: number; readonly y: number },
  camera: MapCamera,
  viewport: MapViewport,
): { x: number; y: number } {
  return {
    x: (point.x - camera.x) * camera.scale + viewport.width / 2,
    y: (point.y - camera.y) * camera.scale + viewport.height / 2,
  };
}

/** The reverse: canvas CSS pixels back into map units. */
export function toMap(
  point: { readonly x: number; readonly y: number },
  camera: MapCamera,
  viewport: MapViewport,
): { x: number; y: number } {
  return {
    x: (point.x - viewport.width / 2) / camera.scale + camera.x,
    y: (point.y - viewport.height / 2) / camera.scale + camera.y,
  };
}

/**
 * The scale at which the whole map fits the canvas.
 *
 * The map is the same size for everyone — it is a fixed table — so this is the
 * one number that makes a 360px phone and a 1440px desktop show the same thing
 * on open, rather than a phone opening on the middle third of a constellation.
 */
export function fitScale(viewport: MapViewport, radius: number): number {
  const usableWidth = Math.max(1, viewport.width - LABEL_RESERVE_PX * 2);
  const usableHeight = Math.max(1, viewport.height - LABEL_RESERVE_PX * 2);
  return Math.min(usableWidth, usableHeight) / (radius * 2);
}

/**
 * The node under a point, or `null`.
 *
 * Tested against the *drawn* radius plus a slop, in screen space, so the target
 * is what the player can see plus a thumb's worth of forgiveness — and nearest
 * wins, so two nodes whose targets overlap at low zoom still resolve to the one
 * actually aimed at.
 */
export function nodeAt(
  point: { readonly x: number; readonly y: number },
  camera: MapCamera,
  viewport: MapViewport,
): PassiveNodeDef | null {
  let best: PassiveNodeDef | null = null;
  let bestDistance = Infinity;

  for (const node of PASSIVE_NODES) {
    const screen = toScreen(node, camera, viewport);
    const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
    const reach = nodeRadius(node.kind, camera.scale) + TOUCH_SLOP_PX;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
}

/** The colour a node is drawn in, before any dimming. */
function branchColor(node: PassiveNodeDef): string {
  return node.branch === null
    ? PALETTE.ceremonySeed
    : (PASSIVE_BRANCH_BY_ID[node.branch]?.color ?? PALETTE.ceremonySeed);
}

/** Draw a diamond — the keystone silhouette, and nothing else's. */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

/** The concentric rings behind everything: a trunk in cross-section. */
function drawGrain(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  viewport: MapViewport,
  radius: number,
): void {
  const centre = toScreen({ x: 0, y: 0 }, camera, viewport);
  ctx.save();
  ctx.strokeStyle = 'rgba(253, 243, 224, 0.05)';
  ctx.lineWidth = 1;

  // One ring per row of nodes, which is what a trunk's grain looks like and
  // what gives the eye something to judge distance from the centre by.
  for (let r = 1; r <= Math.ceil(radius + MAP_PADDING); r += 1) {
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, r * camera.scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The six branch lines, drawn faintly behind the nodes they carry. */
function drawEdges(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  viewport: MapViewport,
  state: MapState,
): void {
  ctx.save();
  ctx.lineCap = 'round';

  for (const [fromId, toId] of PASSIVE_EDGES) {
    const from = PASSIVE_NODE_BY_ID[fromId];
    const to = PASSIVE_NODE_BY_ID[toId];
    if (!from || !to) continue;

    const a = toScreen(from, camera, viewport);
    const b = toScreen(to, camera, viewport);
    const live = state.allocated.has(fromId) && state.allocated.has(toId);

    ctx.strokeStyle = live ? branchColor(to.branch === null ? from : to) : DIM_LINE;
    ctx.lineWidth = live ? 3 : 1.5;
    ctx.globalAlpha = live ? 0.85 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}

/** One node, in whichever of its three states it is in. */
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: PassiveNodeDef,
  camera: MapCamera,
  viewport: MapViewport,
  state: MapState,
): void {
  const screen = toScreen(node, camera, viewport);
  const radius = nodeRadius(node.kind, camera.scale);
  const allocated = state.allocated.has(node.id);
  const open = state.open.has(node.id);
  const color = branchColor(node);
  const searching = state.matches !== null;
  const matched = state.matches?.has(node.id) ?? false;

  ctx.save();
  // A search dims everything it did not find, rather than hiding it: the shape
  // of the map is how a player navigates, and a map with holes in it is a
  // different map.
  if (searching && !matched) ctx.globalAlpha = 0.25;

  const outline = () => {
    if (node.kind === 'keystone') diamond(ctx, screen.x, screen.y, radius);
    else {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    }
  };

  // The body. Three states, and each has to be legible at a glance on a phone:
  // taken is filled, open is outlined brightly and lit from behind, and locked
  // is outlined dimly. Fill, edge and glow rather than colour alone.
  outline();
  if (allocated) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.fillStyle = UNTAKEN_FILL;
    ctx.fill();
    if (open) {
      // The one affordance on the map: these are the nodes a point can be spent
      // on right now, and they should be the first thing the eye lands on.
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Notables and keystones carry a second ring, so the two ranks are still
  // distinguishable at the zoom where a whole branch fits on a phone.
  if (node.kind === 'notable' || node.kind === 'keystone' || node.kind === 'start') {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = allocated ? color : open ? color : DIM;
    ctx.globalAlpha *= allocated ? 0.6 : 0.35;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha /= allocated ? 0.6 : 0.35;
  }

  // The selection ring, last and brightest: it has to be findable over a filled
  // node, a hollow one and the grain behind both.
  if (state.selected === node.id) {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.focusRing;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
    ctx.stroke();
  }

  ctx.restore();
}

/** The branch labels, out past the keystones where nothing else is drawn. */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  viewport: MapViewport,
  radius: number,
): void {
  ctx.save();
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const branch of Object.values(PASSIVE_BRANCH_BY_ID)) {
    const theta = (branch.angle * Math.PI) / 180;
    // Placed in screen space: the keystone's own drawn radius is in pixels, so
    // a gap measured in map units closes as the map zooms out — which is
    // exactly when the label lands on the diamond.
    const tip = toScreen(
      { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius },
      camera,
      viewport,
    );
    const clearance = nodeRadius('keystone', camera.scale) + LABEL_OFFSET_PX;
    const screen = {
      x: tip.x + Math.cos(theta) * clearance,
      y: tip.y + Math.sin(theta) * clearance,
    };
    ctx.fillStyle = branch.color;
    ctx.globalAlpha = 0.75;
    ctx.fillText(branch.label.toUpperCase(), screen.x, screen.y);
  }

  ctx.restore();
}

/**
 * Draw the whole map.
 *
 * Order is back to front and deliberate: grain, then edges, then nodes, then
 * labels. Nodes over edges is what stops a line crossing a node from looking
 * like it passes *through* it, which on this map would be a lie about what
 * connects to what.
 */
export function drawPassiveMap(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  viewport: MapViewport,
  state: MapState,
  radius: number,
): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  drawGrain(ctx, camera, viewport, radius);
  drawEdges(ctx, camera, viewport, state);
  drawLabels(ctx, camera, viewport, radius);

  // The heartwood last among the nodes it shares a centre with, so a filled
  // start node is never half-covered by the first two minors of six branches.
  for (const node of PASSIVE_NODES) {
    if (node.id === PASSIVE_START_ID) continue;
    drawNode(ctx, node, camera, viewport, state);
  }
  const start = PASSIVE_NODE_BY_ID[PASSIVE_START_ID];
  if (start) drawNode(ctx, start, camera, viewport, state);
}
