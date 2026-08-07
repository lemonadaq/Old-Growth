import {
  cameraFromLayout,
  cameraLayout,
  clampCamera,
  panCamera,
  refitCamera,
  scrollCamera,
  zoomCameraAt,
  type Camera,
  type Viewport,
} from '../engine/camera';
import { CLICK_TOLERANCE_PX } from '../engine/clicker';
import { dayCycle } from '../engine/daylight';
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
import { placeOption, type NodePlacement } from '../engine/treeGraph';
import type { GameSnapshot } from '../engine/types';
import { drawComboMeter } from './comboMeter';
import { EffectPool } from './effects';
import {
  drawRadialMenu,
  hitTestRadialMenu,
  isMenuArmed,
  layoutRadialMenu,
  type RadialMenuState,
} from './radialMenu';
import { drawBackdrop } from './sky';
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
 * The projection is recomputed on resize, on camera moves, and whenever the
 * tree's structure changes — never per frame.
 *
 * The camera follows the auto-fit until the player first touches it. From then
 * on it is theirs: growing a branch no longer yanks the framing out from under
 * someone who has deliberately panned down to inspect their roots.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  private camera: Camera = { x: 0, y: 0, zoom: 1, baseScale: 1 };

  /** Has the player moved the camera themselves? See the class comment. */
  private engaged = false;

  /** Click feedback pool, driven by the input layer. */
  readonly effects = new EffectPool();

  private tree: readonly TreeSegment[] = [];
  private placements: ReadonlyMap<string, NodePlacement> = new Map();
  private bounds: TreeBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private screenTree: ScreenSegment[] = [];
  private layout: TreeLayout = { originX: 0, originY: 0, scale: 1 };

  /** Wall-clock time each node first appeared, driving its scale-in. */
  private readonly spawns = new Map<string, number>();
  private seeded = false;

  private menu: RadialMenuState | null = null;
  /** Kept alongside the menu so it can be re-laid-out when the camera moves. */
  private menuOptions: readonly PricedGrowthOption[] = [];
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
    this.menuOptions = options;
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
    this.menuOptions = [];
    this.hoveredItem = null;
    this.ghost = null;
  }

  /**
   * Re-hang an open menu on its node after the projection changed.
   *
   * Panning while the menu is open would otherwise leave the dials floating in
   * space, disconnected from the limb they belong to — and still clickable
   * there, which is worse than merely looking wrong.
   */
  private reanchorMenu(): void {
    if (!this.menu) return;
    const anchor = this.nodeAnchor(this.menu.nodeId);
    if (!anchor) {
      this.closeMenu();
      return;
    }
    this.menu = {
      ...this.menu,
      center: anchor,
      items: layoutRadialMenu(anchor, this.menuOptions),
    };
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

    if (this.engaged) {
      // Keep the player's zoom and their place in the world, but re-derive what
      // "fits" means for the new canvas — a phone rotating should reframe, not
      // strand the tree off-screen.
      this.camera = refitCamera(this.camera, this.fitScale(), this.viewport);
    }
    this.projectTreeToScreen();

    // A resize moves every node, so an open menu would be anchored to nothing.
    this.closeMenu();
  }

  /** The canvas size in CSS pixels. */
  private get viewport(): Viewport {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  /** Scale at which the whole tree fits the canvas — the camera's zoom-1. */
  private fitScale(): number {
    return computeTreeLayout(this.cssWidth, this.cssHeight, this.bounds).scale;
  }

  private projectTreeToScreen(): void {
    if (!this.engaged) {
      // Track the auto-fit: the early game reframes itself as the tree grows.
      this.camera = clampCamera(
        cameraFromLayout(
          computeTreeLayout(this.cssWidth, this.cssHeight, this.bounds),
          this.viewport,
        ),
        this.viewport,
      );
    }
    this.layout = cameraLayout(this.camera, this.viewport);
    this.screenTree = projectTree(this.tree, this.layout);
  }

  /** Apply a camera change: the player now owns the framing. */
  private moveCamera(next: Camera): void {
    this.engaged = true;
    this.camera = next;
    this.projectTreeToScreen();
    this.reanchorMenu();
  }

  /** Drag the world by a screen-space delta (pointer drag). */
  panBy(dx: number, dy: number): void {
    this.moveCamera(panCamera(this.camera, dx, dy, this.viewport));
  }

  /** Scroll the view by a wheel/trackpad delta. */
  scrollBy(deltaX: number, deltaY: number): void {
    this.moveCamera(scrollCamera(this.camera, deltaX, deltaY, this.viewport));
  }

  /** Zoom by `factor`, holding the world point under `cursor` still. */
  zoomAt(cursor: Vec2, factor: number): void {
    this.moveCamera(zoomCameraAt(this.camera, cursor, factor, this.viewport));
  }

  /** Zoom about the middle of the canvas, for keyboard and button zoom. */
  zoomBy(factor: number): void {
    this.zoomAt({ x: this.cssWidth / 2, y: this.cssHeight / 2 }, factor);
  }

  /** Hand the framing back to the auto-fit. */
  resetCamera(): void {
    this.engaged = false;
    this.projectTreeToScreen();
    this.reanchorMenu();
  }

  /** Current zoom factor, for the HUD. */
  get zoom(): number {
    return this.camera.zoom;
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
    const { ctx } = this;
    const viewport = this.viewport;

    // Sky, hills, then the soil cross-section — all keyed off the projected
    // ground line, so the whole world moves together under the camera.
    drawBackdrop(ctx, viewport, this.layout, dayCycle(snapshot.elapsedSeconds));

    drawTree(ctx, this.screenTree, now, this.spawns, viewport);

    const ghost = this.ghostSegment();
    if (ghost) drawGhostPart(ctx, ghost);

    if (this.menu) drawRadialMenu(ctx, this.menu, this.hoveredItem, now);

    this.effects.draw(ctx, now);

    if (this.pointer) {
      drawComboMeter(ctx, this.pointer.x, this.pointer.y, snapshot.combo);
    }
  }
}
