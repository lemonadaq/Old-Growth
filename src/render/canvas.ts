import { CLICK_TOLERANCE_PX } from '../engine/clicker';
import { hitTestSegments, type Vec2 } from '../engine/geometry';
import type { PricedGrowthOption } from '../engine/growth';
import {
  projectSegment,
  projectTree,
  treeBounds,
  type ScreenSegment,
  type TreeBounds,
  type TreeLayout,
  type TreeSegment,
} from '../engine/tree';
import { BARREN_SOIL, type SoilMap } from '../engine/soil';
import { placeOption, type NodePlacement } from '../engine/treeGraph';
import type { GameSnapshot } from '../engine/types';
import { drawComboMeter } from './comboMeter';
import { EffectPool } from './effects';
import { PALETTE } from './palette';
import { drawSoil } from './soil';
import {
  drawRadialMenu,
  hitTestRadialMenu,
  isMenuArmed,
  layoutRadialMenu,
  type RadialMenuState,
} from './radialMenu';
import { computeTreeLayout, drawGhostPart, drawTree } from './tree';

/**
 * Canvas 2D renderer: the sky-to-soil scene, the player's tree, the radial grow
 * menu, and the transient click feedback layered on top.
 *
 * The renderer reads snapshots and never mutates game state. It owns
 * devicePixelRatio handling so drawing code can work in CSS pixels.
 *
 * It also owns the **screen-space projection** of the tree, which is why
 * hit-testing lives here: the click tolerance is specified in pixels, so taps
 * are tested against the same projected geometry the player can actually see.
 * The projection is recomputed on resize and whenever the tree's structure
 * changes, never per frame.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  /** Click feedback pool, driven by the input layer. */
  readonly effects = new EffectPool();

  private tree: readonly TreeSegment[] = [];
  private soil: SoilMap = BARREN_SOIL;
  private placements: ReadonlyMap<string, NodePlacement> = new Map();
  private bounds: TreeBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private screenTree: ScreenSegment[] = [];
  private layout: TreeLayout = { originX: 0, originY: 0, scale: 1 };

  /** Wall-clock time each node first appeared, driving its scale-in. */
  private readonly spawns = new Map<string, number>();
  private seeded = false;

  private menu: RadialMenuState | null = null;
  private hoveredItem: number | null = null;
  private ghost: PricedGrowthOption | null = null;

  /** Latest pointer position in CSS px, or `null` when the pointer has left. */
  private pointer: Vec2 | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.resize();
  }

  /**
   * Supply the tree to draw and hit-test against.
   *
   * Nodes not seen before are stamped with `now` so they ease in; the very first
   * call seeds the existing tree silently, so a page load does not replay every
   * part the player has ever grown.
   */
  setTree(
    segments: readonly TreeSegment[],
    placements: ReadonlyMap<string, NodePlacement>,
    now: number,
  ): void {
    const live = new Set<string>();
    for (const segment of segments) {
      live.add(segment.id);
      if (this.seeded && !this.spawns.has(segment.id)) this.spawns.set(segment.id, now);
    }
    for (const id of [...this.spawns.keys()]) {
      if (!live.has(id)) this.spawns.delete(id);
    }
    this.seeded = true;

    this.tree = segments;
    this.placements = placements;
    this.bounds = treeBounds(segments);
    this.projectTreeToScreen();
  }

  /**
   * Supply the ground to draw. Generated once per world from a seed, so unlike
   * the tree this never needs re-pushing.
   */
  setSoil(soil: SoilMap): void {
    this.soil = soil;
  }

  /** Track the pointer so the combo meter can follow it. `null` hides it. */
  setPointer(point: Vec2 | null): void {
    this.pointer = point;
  }

  /** Open the grow menu on a node, or close it with `null`. */
  openMenu(nodeId: string, options: readonly PricedGrowthOption[], now: number): void {
    const anchor = this.nodeAnchor(nodeId);
    if (!anchor || options.length === 0) {
      this.closeMenu();
      return;
    }
    this.menu = {
      nodeId,
      center: anchor,
      items: layoutRadialMenu(anchor, options),
      // Re-opening the same node keeps its arming clock, so a menu that is
      // already live does not go dead again under a rapid second tap.
      openedAt: this.menu?.nodeId === nodeId ? this.menu.openedAt : now,
    };
    this.hoveredItem = null;
    this.ghost = null;
  }

  /** Close the grow menu and drop any preview. */
  closeMenu(): void {
    this.menu = null;
    this.hoveredItem = null;
    this.ghost = null;
  }

  /** The open menu, if any. */
  get openMenuState(): RadialMenuState | null {
    return this.menu;
  }

  /** The option under `point`, or `null` — used for both hover and taps. */
  menuOptionAt(point: Vec2): PricedGrowthOption | null {
    if (!this.menu) return null;
    const index = hitTestRadialMenu(point, this.menu.items);
    return index === null ? null : this.menu.items[index].priced;
  }

  /**
   * Point the pointer at the menu, updating the highlighted dial and the ghost
   * preview. Returns the hovered option so the UI can drive its tooltip.
   */
  hoverMenu(point: Vec2 | null): PricedGrowthOption | null {
    if (!this.menu || !point) {
      this.hoveredItem = null;
      this.ghost = null;
      return null;
    }
    const index = hitTestRadialMenu(point, this.menu.items);
    this.hoveredItem = index;
    this.ghost = index === null ? null : this.menu.items[index].priced;
    return this.ghost;
  }

  /** Whether the menu's dials are live yet (see `MENU_ARM_MS`). */
  isMenuArmed(now: number): boolean {
    return this.menu !== null && isMenuArmed(this.menu, now);
  }

  /**
   * Nearest tree segment within {@link CLICK_TOLERANCE_PX} of a CSS-pixel point,
   * or `null` if the tap missed the wood.
   */
  hitTest(point: Vec2): ScreenSegment | null {
    return hitTestSegments(point, this.screenTree, CLICK_TOLERANCE_PX);
  }

  /** Match the backing store to the element's CSS size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    // Draw in CSS pixels; the transform scales to device pixels.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.projectTreeToScreen();

    // A resize moves every node, so an open menu would be anchored to nothing.
    this.closeMenu();
  }

  private projectTreeToScreen(): void {
    this.layout = computeTreeLayout(this.cssWidth, this.cssHeight, this.bounds);
    this.screenTree = projectTree(this.tree, this.layout);
  }

  /** Screen-space point the grow menu hangs off for a node: its far end. */
  private nodeAnchor(nodeId: string): Vec2 | null {
    const segment = this.screenTree.find((s) => s.id === nodeId);
    return segment ? segment.b : null;
  }

  /** The ghost preview projected into screen space, or `null`. */
  private ghostSegment(): ScreenSegment | null {
    if (!this.menu || !this.ghost) return null;
    const parent = this.placements.get(this.ghost.option.parentId);
    if (!parent) return null;

    const placement = placeOption(parent, this.ghost.option);
    return projectSegment(
      {
        id: `ghost:${this.ghost.option.type}`,
        kind: this.ghost.option.type,
        depth: this.ghost.option.level,
        a: placement.start,
        b: placement.end,
        width: this.ghost.option.thickness,
      },
      this.layout,
    );
  }

  /**
   * Draw one frame.
   *
   * @param snapshot latest game snapshot.
   * @param _alpha   interpolation factor in `[0, 1)` for smooth motion later.
   * @param now      timestamp (ms) driving the time-based click effects.
   */
  draw(snapshot: GameSnapshot, _alpha: number, now: number = Date.now()): void {
    const { ctx, cssWidth: w, cssHeight: h } = this;
    // The soil surface is the trunk's own base, taken from the layout rather
    // than recomputed, so the strata and the tree share one ground line.
    const horizonY = this.layout.originY;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY);

    // Soil: strata bands and the mineral pockets buried in them.
    drawSoil(ctx, w, h, this.layout, this.soil);

    // Horizon line where canopy air meets the ground.
    ctx.fillStyle = PALETTE.horizon;
    ctx.fillRect(0, horizonY - 1, w, 2);

    drawTree(ctx, this.screenTree, now, this.spawns);

    const ghost = this.ghostSegment();
    if (ghost) drawGhostPart(ctx, ghost);

    if (this.menu) drawRadialMenu(ctx, this.menu, this.hoveredItem, now);

    this.effects.draw(ctx, now);

    if (this.pointer) {
      drawComboMeter(ctx, this.pointer.x, this.pointer.y, snapshot.combo);
    }
  }
}
