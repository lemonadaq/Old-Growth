/**
 * Draws a {@link TreeGraph} onto a canvas already carrying the camera transform.
 *
 * Limbs are tapered quadratic curves: the curve is sampled, each sample is
 * offset along the curve normal by half the local width, and the resulting
 * outline is filled as one polygon — which is what lets thickness shrink toward
 * the tip. Leaf clusters are 3–5 overlapping soft-circle sprites in the species
 * hue. Roots use the same limb code with the species' desaturated earth palette
 * and no sway.
 *
 * Everything here is per-frame hot path, so it reuses scratch buffers, resolves
 * the tinted palette once per frame, and drops detail (side shading, blob count)
 * for limbs that project to only a few pixels.
 */

import { clamp, type Rect } from '../engine/geometry';
import {
  collectVisibleNodes,
  limbPointAt,
  limbTangentAt,
  limbWidthAt,
  type LeafNode,
  type LimbNode,
  type TreeGraph,
  type TreeNode,
} from '../engine/treeGraph';
import {
  SPECIES_BY_ID,
  type BarkPalette,
  type LeafPalette,
  type SpeciesDef,
} from '../content/species';
import { parseHex, rgbToCss, type Rgb } from './color';
import { softCircleSprite } from './leafSprite';
import { SwayField } from './sway';

/** Values per curve sample held in the scratch buffer. */
const SAMPLE_STRIDE = 5; // px, py, nx, ny, halfWidth

/** Curve sampling bounds; more samples on longer, closer limbs. */
const MIN_SAMPLES = 3;
const MAX_SAMPLES = 14;
/** World units of limb length per sample at zoom 1. */
const WORLD_UNITS_PER_SAMPLE = 12;

/** Below this projected width a limb is drawn flat, without side shading. */
const SHADED_WIDTH_PX = 4;
/**
 * Below this projected diameter (device pixels) a leaf cluster collapses to a
 * single soft blob: at that size the individual circles are indistinguishable,
 * and a grown canopy is fill-rate bound long before it is CPU bound.
 */
const DETAILED_LEAF_DIAMETER_PX = 40;

/** Speed of the small per-blob flutter inside a leaf cluster. */
const BLOB_FLUTTER_SPEED = 1.6;

export interface TreeDrawOptions {
  /** Simulated seconds, used for sway. */
  readonly time: number;
  /** Current camera zoom, used for level of detail. */
  readonly zoom: number;
  /** World units → device pixels (`zoom × devicePixelRatio`), for sprite sizing. */
  readonly pixelScale: number;
  /** World rect on screen; nodes outside it are skipped. */
  readonly viewport: Rect;
  /** Ambient light color for the current time of day. */
  readonly ambient: Rgb;
}

/** One tone, resolved for both `fillStyle` and the leaf sprite cache. */
interface Tone {
  /** CSS color string for direct fills. */
  readonly css: string;
  /** Same color as channels, for building sprites. */
  readonly rgb: Rgb;
  /** Stable cache key for the sprite built from this tone. */
  readonly key: string;
}

type Tones = Readonly<Record<'base' | 'light' | 'dark', Tone>>;

/** Species colors under the current ambient light. */
interface TreePaint {
  readonly bark: Tones;
  readonly root: Tones;
  readonly leaf: Tones;
}

export class TreePainter {
  private readonly sway = new SwayField();
  private readonly visible: TreeNode[] = [];
  private readonly samples: number[] = [];
  private readonly polygon: number[] = [];

  /** Cached tint, keyed by species + quantised ambient so it survives frames. */
  private paintKey = '';
  private paint: TreePaint | null = null;

  /** Number of nodes drawn in the last {@link draw} call (debug/telemetry). */
  drawnNodes = 0;

  /**
   * Draw the tree. The context must already be in world space (y-up) via
   * `Camera.applyTransform`.
   */
  draw(ctx: CanvasRenderingContext2D, graph: TreeGraph, options: TreeDrawOptions): void {
    const species = SPECIES_BY_ID[graph.speciesId];
    const paint = this.resolvePaint(species, options.ambient);

    // Sway is computed over the whole graph, not just visible nodes: an
    // off-screen limb still carries the visible twigs growing out of it.
    this.sway.update(graph, options.time);

    const nodes = collectVisibleNodes(graph, options.viewport, this.visible);
    this.drawnNodes = nodes.length;

    for (const node of nodes) {
      if (node.kind === 'leaf') {
        this.drawLeafCluster(ctx, node, paint, options);
      } else {
        this.drawLimb(ctx, node, node.kind === 'root' ? paint.root : paint.bark, options.zoom);
      }
    }
  }

  /** Tapered quadratic limb, filled as an outline polygon. */
  private drawLimb(ctx: CanvasRenderingContext2D, limb: LimbNode, bark: Tones, zoom: number): void {
    const count = this.sampleLimb(limb, zoom);

    ctx.fillStyle = bark.base.css;
    this.fillOffsetPolygon(ctx, count, -1, 1);

    // Side shading is pure decoration; skip it once a limb is a few pixels wide.
    if (limb.baseWidth * zoom >= SHADED_WIDTH_PX) {
      ctx.fillStyle = bark.light.css;
      this.fillOffsetPolygon(ctx, count, -1, -0.3);
      ctx.fillStyle = bark.dark.css;
      this.fillOffsetPolygon(ctx, count, 0.45, 1);
    }
  }

  /**
   * Sample the limb curve into the scratch buffer: position, unit normal, and
   * half width per sample. Returns the sample count.
   */
  private sampleLimb(limb: LimbNode, zoom: number): number {
    const count = clamp(
      Math.round((limb.length * zoom) / WORLD_UNITS_PER_SAMPLE),
      MIN_SAMPLES,
      MAX_SAMPLES,
    );
    const buffer = this.samples;
    buffer.length = (count + 1) * SAMPLE_STRIDE;

    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const point = limbPointAt(limb, t);
      const tangent = limbTangentAt(limb, t);
      const offset = this.sway.offsetAt(limb, t);
      const index = i * SAMPLE_STRIDE;

      buffer[index] = point.x + offset;
      buffer[index + 1] = point.y;
      // Normal is the tangent rotated a quarter turn: points to the +x side of
      // an upward limb, which is the shaded side under our upper-left sun.
      buffer[index + 2] = tangent.y;
      buffer[index + 3] = -tangent.x;
      buffer[index + 4] = limbWidthAt(limb, t) / 2;
    }

    return count;
  }

  /**
   * Fill the band between two normal offsets of the sampled curve. `-1` is the
   * lit edge, `1` the shaded edge, so `(-1, 1)` fills the whole limb.
   */
  private fillOffsetPolygon(
    ctx: CanvasRenderingContext2D,
    count: number,
    fromScale: number,
    toScale: number,
  ): void {
    const buffer = this.samples;
    const outline = this.polygon;
    outline.length = 0;

    for (let i = 0; i <= count; i += 1) {
      const index = i * SAMPLE_STRIDE;
      const half = buffer[index + 4];
      outline.push(
        buffer[index] + buffer[index + 2] * half * fromScale,
        buffer[index + 1] + buffer[index + 3] * half * fromScale,
      );
    }
    for (let i = count; i >= 0; i -= 1) {
      const index = i * SAMPLE_STRIDE;
      const half = buffer[index + 4];
      outline.push(
        buffer[index] + buffer[index + 2] * half * toScale,
        buffer[index + 1] + buffer[index + 3] * half * toScale,
      );
    }

    ctx.beginPath();
    ctx.moveTo(outline[0], outline[1]);
    for (let i = 2; i < outline.length; i += 2) {
      ctx.lineTo(outline[i], outline[i + 1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** 3–5 overlapping soft circles in the species hue, swaying as one mass. */
  private drawLeafCluster(
    ctx: CanvasRenderingContext2D,
    leaf: LeafNode,
    paint: TreePaint,
    options: TreeDrawOptions,
  ): void {
    const { tip } = this.sway.entryFor(leaf);
    const centerX = leaf.position.x + tip;
    const centerY = leaf.position.y;

    const diameterPx = leaf.radius * 2 * options.pixelScale;
    if (diameterPx < DETAILED_LEAF_DIAMETER_PX) {
      // Too small to tell the blobs apart — one soft disc reads the same and
      // costs a quarter of the fill.
      const tone = paint.leaf.base;
      const sprite = softCircleSprite(tone.key, tone.rgb, diameterPx);
      const radius = leaf.radius * 0.95;
      if (sprite) {
        ctx.drawImage(sprite, centerX - radius, centerY - radius, radius * 2, radius * 2);
      } else {
        ctx.fillStyle = tone.css;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    ctx.globalAlpha = 0.92;
    // Soft gradient sprites hide resampling artefacts, so trade filter quality
    // for blit speed — there can be thousands of blobs in a grown canopy.
    ctx.imageSmoothingQuality = 'low';
    for (const blob of leaf.blobs) {
      // Each blob drifts a little on its own so the cluster breathes.
      const flutter = Math.sin(options.time * BLOB_FLUTTER_SPEED + blob.phase);
      const x = centerX + blob.offset.x + flutter * 0.9;
      const y = centerY + blob.offset.y + Math.cos(options.time + blob.phase) * 0.5;
      const tone = paint.leaf[blob.tone];
      const sprite = softCircleSprite(tone.key, tone.rgb, blob.radius * 2 * options.pixelScale);

      if (sprite) {
        ctx.drawImage(sprite, x - blob.radius, y - blob.radius, blob.radius * 2, blob.radius * 2);
      } else {
        ctx.fillStyle = tone.css;
        ctx.beginPath();
        ctx.arc(x, y, blob.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Tint the species palette by the ambient light, memoised between frames. */
  private resolvePaint(species: SpeciesDef, ambient: Rgb): TreePaint {
    // Quantise the ambient so a slowly drifting sky does not rebuild strings —
    // or, worse, leaf sprites — every single frame.
    const key = `${species.id}|${Math.round(ambient.r / 16)},${Math.round(ambient.g / 16)},${Math.round(ambient.b / 16)}`;
    if (this.paint && this.paintKey === key) return this.paint;

    const paint: TreePaint = {
      bark: tintTones(species.bark, ambient, key),
      root: tintTones(species.root, ambient, key),
      leaf: tintTones(species.leaf, ambient, key),
    };
    this.paint = paint;
    this.paintKey = key;
    return paint;
  }
}

/** Multiply a three-tone palette by the ambient light. */
function tintTones(palette: BarkPalette | LeafPalette, ambient: Rgb, paintKey: string): Tones {
  return {
    base: tint(palette.base, ambient, paintKey),
    light: tint(palette.light, ambient, paintKey),
    dark: tint(palette.dark, ambient, paintKey),
  };
}

function tint(hex: string, ambient: Rgb, paintKey: string): Tone {
  const source = parseHex(hex);
  const rgb: Rgb = {
    r: (source.r * ambient.r) / 255,
    g: (source.g * ambient.g) / 255,
    b: (source.b * ambient.b) / 255,
  };
  // Keyed by source color and quantised ambient, so sprites are reused across
  // frames but rebuilt as the light changes through the day.
  return { css: rgbToCss(rgb), rgb, key: `${hex}@${paintKey}` };
}
