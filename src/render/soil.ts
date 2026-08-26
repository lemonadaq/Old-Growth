import { SOIL_UNITS_PER_CANONICAL, STRATA, type Stratum } from '../content/soil';
import type { MineralVein, SoilMap } from '../engine/soil';
import { createSeededRandom } from '../engine/rng';
import type { TreeLayout } from '../engine/tree';
import { PALETTE } from './palette';

/**
 * The underground, drawn.
 *
 * The soil is a cross-section: four bands of ground stacked below the trunk
 * base, with mineral pockets glowing inside them. Everything is positioned
 * through the same {@link TreeLayout} the tree is projected with, so the strata
 * and the roots growing through them can never disagree about where the clay
 * starts — a root the player can see entering the clay layer really is earning
 * the clay's depth bonus.
 *
 * The band geometry is a pure function ({@link soilBands}) so it can be tested
 * without a canvas.
 */

/** Screen y (CSS px) of a depth in soil units. */
export function depthToScreenY(depth: number, layout: TreeLayout): number {
  return layout.originY + (depth / SOIL_UNITS_PER_CANONICAL) * layout.scale;
}

/** One stratum as it lands on the canvas. */
export interface SoilBand {
  readonly stratum: Stratum;
  /** Top edge, clipped to the soil surface. */
  readonly top: number;
  /** Bottom edge, clipped to the bottom of the canvas. */
  readonly bottom: number;
  /** Unclipped edges, so the fill shades across the whole band, not the slice. */
  readonly gradientTop: number;
  readonly gradientBottom: number;
}

/**
 * The strata that are actually on screen, in order.
 *
 * Bands entirely above the surface or below the canvas are dropped; the rest
 * are clipped. The layout's scale shrinks as the tree grows, so deeper bands
 * come into view as the roots reach for them.
 */
export function soilBands(layout: TreeLayout, canvasHeight: number): SoilBand[] {
  const surface = layout.originY;
  const bands: SoilBand[] = [];

  for (const stratum of STRATA) {
    const gradientTop = depthToScreenY(stratum.top, layout);
    const gradientBottom = Number.isFinite(stratum.bottom)
      ? depthToScreenY(stratum.bottom, layout)
      : canvasHeight;

    const top = Math.max(gradientTop, surface);
    const bottom = Math.min(gradientBottom, canvasHeight);
    if (bottom <= top) continue;

    bands.push({ stratum, top, bottom, gradientTop, gradientBottom });
  }

  return bands;
}

/**
 * Ore grains stay grain-sized: they are clamped to a few pixels whatever the
 * zoom, so a pocket reads as *mineral in the ground* rather than as a cluster of
 * bubbles when the camera is close.
 */
const SPECK_MIN_PX = 0.9;
const SPECK_MAX_PX = 2.6;

/** Deterministic ore specks for one pocket, in units of its radius. */
function speckOffsets(vein: MineralVein, count: number): { dx: number; dy: number; r: number }[] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < vein.id.length; i += 1) {
    hash ^= vein.id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const random = createSeededRandom(hash);
  const specks: { dx: number; dy: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    // sqrt keeps the specks evenly spread over the disc instead of clumping
    // at the centre the way a linear radius would.
    const radial = Math.sqrt(random()) * 0.8;
    specks.push({
      dx: Math.cos(angle) * radial,
      dy: Math.sin(angle) * radial,
      r: 0.04 + random() * 0.05,
    });
  }
  return specks;
}

/** Ore specks scale with how rich the pocket is, so richness is legible. */
function speckCount(vein: MineralVein): number {
  return 3 + Math.round(vein.richness * 2);
}

/**
 * Draw one mineral pocket: a soft halo with ore glinting inside it.
 *
 * `reach` is how far out a root tip can currently *feel* the pocket, which the
 * mycorrhiza widens. The ore itself never moves — only the halo grows, and it
 * grows dimmer as it does, so the fungus reads as "the ground has fewer secrets"
 * rather than as "there is more ore now".
 */
function drawVein(
  ctx: CanvasRenderingContext2D,
  vein: MineralVein,
  layout: TreeLayout,
  reach: number,
): void {
  const cx = layout.originX + vein.center.x * layout.scale;
  const cy = layout.originY - vein.center.y * layout.scale;
  const radius = vein.radius * layout.scale;
  if (radius < 3) return;

  const felt = radius * Math.max(1, reach);
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, felt);
  halo.addColorStop(0, PALETTE.veinGlow);
  halo.addColorStop(1, 'rgba(214, 190, 126, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, felt, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.72;
  for (const speck of speckOffsets(vein, speckCount(vein))) {
    const size = Math.min(SPECK_MAX_PX, Math.max(SPECK_MIN_PX, speck.r * radius));
    ctx.fillStyle = speck.r < 0.055 ? PALETTE.veinCore : PALETTE.vein;
    ctx.beginPath();
    ctx.arc(cx + speck.dx * radius, cy + speck.dy * radius, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Whether a pocket touches the visible canvas at all. */
function veinVisible(
  vein: MineralVein,
  layout: TreeLayout,
  width: number,
  height: number,
): boolean {
  const cx = layout.originX + vein.center.x * layout.scale;
  const cy = layout.originY - vein.center.y * layout.scale;
  const radius = vein.radius * layout.scale;
  return cx + radius > 0 && cx - radius < width && cy + radius > 0 && cy - radius < height;
}

/** Smallest band height (px) that still gets a name written on it. */
const LABEL_MIN_BAND_PX = 26;

/**
 * Fill the soil cross-section: the strata bands, the lines between them, their
 * names, and every mineral pocket that is on screen.
 *
 * Drawn before the tree, so roots read as growing *through* the ground.
 */
export function drawSoil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: TreeLayout,
  soil: SoilMap,
  veinReach = 1,
): void {
  const bands = soilBands(layout, height);

  ctx.save();
  for (const band of bands) {
    const fill = ctx.createLinearGradient(0, band.gradientTop, 0, band.gradientBottom);
    fill.addColorStop(0, band.stratum.colorTop);
    fill.addColorStop(1, band.stratum.colorBottom);
    ctx.fillStyle = fill;
    ctx.fillRect(0, band.top, width, band.bottom - band.top);
  }

  // Bedding planes: a thin dark line wherever one layer gives way to the next.
  ctx.fillStyle = PALETTE.stratumEdge;
  for (const band of bands) {
    if (band.gradientTop <= layout.originY) continue;
    ctx.fillRect(0, band.gradientTop - 1, width, 2);
  }

  // Pockets sit under the labels but over the ground they are buried in.
  for (const vein of soil.veins) {
    if (veinVisible(vein, layout, width, height)) drawVein(ctx, vein, layout, veinReach);
  }

  ctx.fillStyle = PALETTE.stratumLabel;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (const band of bands) {
    if (band.bottom - band.top < LABEL_MIN_BAND_PX) continue;
    ctx.fillText(band.stratum.label.toUpperCase(), 10, band.top + 6);
  }
  ctx.restore();
}
