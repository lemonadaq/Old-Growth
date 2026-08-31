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
  MENU_ARM_MS,
  type RadialMenuState,
} from './radialMenu';
import { PICKER_MIN_SPECIES } from '../content/species';
import { drawPruneConfirm, drawPruneMark, markedPoints, type PruneSelection } from './prune';
import { drawGraftBadge, drawGraftMark, type GraftSelection } from './graft';
import { drawFocusRing } from './focus';
import {
  drawSpeciesPicker,
  hitTestSpeciesPicker,
  layoutSpeciesPicker,
  type SpeciesChip,
} from './speciesPicker';
import { drawBeat, type BeatMark } from './onboarding';
import { drawCeremony } from './ceremony';
import { drawForest, layoutForest, visibleForest } from './forest';
import { drawBackdrop } from './sky';
import { drawSymbionts, symbiontScene, EMPTY_SCENE, type SymbiontScene } from './symbionts';
import { drawTotems } from './totems';
import { computeTreeLayout, drawGhostPart, drawTree } from './tree';
import { drawLitter, hitTestLitter, layoutLitter, type LaidPile } from './litter';
import {
  braceAnchorLayout,
  drawBraceAnchor,
  drawWeather,
  hitTestBraceAnchor,
  seasonLeafCast,
  seasonSoilCast,
  skyCasts,
} from './weather';

/** How long the one-off look underground takes, door to door, in ms. */
export const LOOK_DURATION_MS = 3600;

/** How far below the auto-fit that look dips, in canonical units. */
export const LOOK_DEPTH_UNITS = 0.85;

/**
 * The look's shape: down, hold, back — `0 → 1 → 0` over `[0, 1]`.
 *
 * The hold is the point of it. A dip that turned round the instant it arrived
 * would read as a glitch rather than as the game showing the player something,
 * and a second of stillness at the bottom is what makes it a glance.
 */
export function lookCurve(t: number): number {
  // The ends are stated rather than computed: a smoothstep of a value a float
  // away from 1 lands a float away from 0, and "the camera is back where it
  // started" should be exactly true rather than true to thirty decimal places.
  if (!(t > 0) || t >= 1) return 0;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.3) return smooth(t / 0.3);
  if (t < 0.7) return 1;
  return smooth((1 - t) / 0.3);
}

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
  private soil: SoilMap = BARREN_SOIL;
  private placements: ReadonlyMap<string, NodePlacement> = new Map();
  private bounds: TreeBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private screenTree: ScreenSegment[] = [];
  private layout: TreeLayout = { originX: 0, originY: 0, scale: 1 };

  /**
   * Where the creatures live, derived from the projection rather than per frame:
   * the tree does not move between frames, only the animals on it do.
   */
  private scene: SymbiontScene = EMPTY_SCENE;

  /** Wall-clock time each node first appeared, driving its scale-in. */
  private readonly spawns = new Map<string, number>();
  private seeded = false;

  private menu: RadialMenuState | null = null;
  /** Kept alongside the menu so it can be re-laid-out when the camera moves. */
  private menuOptions: readonly PricedGrowthOption[] = [];
  private hoveredItem: number | null = null;
  private ghost: PricedGrowthOption | null = null;

  /** Whether the scissors are out. Prune mode owns every press while it is on. */
  private pruning = false;
  /** The subtree currently marked for cutting, if any. */
  private pruneSelection: PruneSelection | null = null;

  /** Whether the knife is out. Graft mode owns every press while it is on. */
  private grafting = false;
  /** The limbs graft mode has picked and is pointing at. */
  private graftSelection: GraftSelection | null = null;

  /** Species the picker offers, and the one it is showing as chosen. */
  private plantable: readonly string[] = [];
  private planting = '';
  private chips: readonly SpeciesChip[] = [];
  private hoveredChip: number | null = null;

  /** Latest pointer position in CSS px, or `null` when the pointer has left. */
  private pointer: Vec2 | null = null;

  /**
   * The leaf-litter piles as they were last drawn, and whether the storm anchor
   * was up.
   *
   * Both are hit-testable between frames, like the menu, so they are laid out in
   * `draw` and kept — a press must be tested against what the player can
   * actually see, not against what the next frame will show.
   */
  private piles: readonly LaidPile[] = [];
  private bracing = false;

  /**
   * Whether decorative motion is allowed — the inverse of the player's
   * `prefers-reduced-motion`. Owned here rather than read from the media query
   * per frame so the renderer stays free of browser lookups in its hot path, and
   * so a test can drive it directly.
   */
  private motion = true;

  /** Whether leaf clusters carry a pattern as well as a colour. */
  private leafPatterns = false;

  /** Wall-clock time the next wind-drifted leaf is due, in ms. */
  private nextDriftAt = 0;

  /** The mark the scripted opening wants on the trunk, or `null`. */
  private beat: BeatMark | null = null;

  /**
   * The one-off look underground, or `null`.
   *
   * A scripted camera move rather than a permanent reframe: it dips, holds, and
   * comes back, and the auto-fit has the framing again by the end. See
   * {@link lookBelow}.
   */
  private look: { readonly startedAt: number; readonly depth: number } | null = null;

  /** How far down the look is currently dragging the view, in canonical units. */
  private lookOffset = 0;

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

  /**
   * Honour (or stop honouring) `prefers-reduced-motion`.
   *
   * One switch for the whole scene: the canopy stops swaying, new parts land at
   * full size, the hills stop lagging the camera, and every particle system goes
   * quiet. What survives is everything that carries information — the floating
   * numbers, the ripples, the shade tint, the season's colour.
   */
  /**
   * Draw a pattern on each leaf cluster as well as colouring it.
   *
   * A second channel for species and season, for anyone whose eyes do not
   * separate the hues the palette leans on. Off by default because it costs
   * legibility for everyone who does not need it — a patterned canopy is busier
   * than a plain one.
   */
  setLeafPatterns(enabled: boolean): void {
    this.leafPatterns = enabled;
  }

  /**
   * The part the keyboard is currently on, or `null` when nobody is navigating
   * by keyboard.
   *
   * Held here rather than in React because it is drawn every frame and changed
   * on a keystroke: a store round-trip per arrow press would put the ring a
   * frame behind the key, which is exactly the lag that makes keyboard
   * navigation feel broken.
   */
  private focused: string | null = null;

  /** Put the keyboard's cursor on a part, or take it off with `null`. */
  setFocusedPart(nodeId: string | null): void {
    this.focused = nodeId;
  }

  /** The part the keyboard's cursor is on. */
  get focusedPart(): string | null {
    return this.focused;
  }

  /**
   * Move the menu highlight by `delta` dials, wrapping at both ends.
   *
   * This is the keyboard's version of {@link hoverMenu}: it drives the same
   * highlight and the same ghost preview, so a dial reached by arrow key looks
   * exactly like one reached by pointer. Starting from nothing highlighted, a
   * forward step lands on the first dial and a backward step on the last.
   */
  stepMenu(delta: number): PricedGrowthOption | null {
    if (!this.menu || this.menu.items.length === 0) return null;
    const count = this.menu.items.length;
    const from = this.hoveredItem ?? (delta > 0 ? -1 : 0);
    return this.highlightMenu((((from + delta) % count) + count) % count);
  }

  /**
   * Highlight a dial by index, or clear it with `null`.
   *
   * The bottom sheet's rows are the same options in the same order, so pointing
   * at a row lights the same ghost preview a hovered dial would — the phone
   * still gets to see where the part would go before paying for it.
   */
  highlightMenu(index: number | null): PricedGrowthOption | null {
    if (!this.menu || index === null || !this.menu.items[index]) {
      this.hoveredItem = null;
      this.ghost = null;
      return null;
    }
    this.hoveredItem = index;
    this.ghost = this.menu.items[index].priced;
    return this.ghost;
  }

  /** The dial the highlight is on, whether it got there by pointer or by key. */
  get highlightedOption(): PricedGrowthOption | null {
    if (!this.menu || this.hoveredItem === null) return null;
    return this.menu.items[this.hoveredItem]?.priced ?? null;
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = !reduced;
    this.effects.setMotion(!reduced);
  }

  /** Track the pointer so the combo meter can follow it. `null` hides it. */
  setPointer(point: Vec2 | null): void {
    this.pointer = point;
  }

  /** Put the opening beat's mark on the trunk, or take it off with `null`. */
  setBeat(beat: BeatMark | null): void {
    this.beat = beat;
  }

  /**
   * Dip the camera below the ground line once, then bring it back.
   *
   * Returns whether the look was actually started, so the caller can tell the
   * player in words what the camera would otherwise have shown them. Two reasons
   * it refuses:
   *
   * - **The player has moved the camera themselves.** From that moment the
   *   framing is theirs (see the class comment); taking it away to show them
   *   something would be the one thing this renderer has promised not to do.
   * - **Reduced motion.** A camera move is motion, and this one is decoration
   *   over an event the toast reports anyway.
   */
  lookBelow(now: number, depth = LOOK_DEPTH_UNITS): boolean {
    if (this.engaged || !this.motion) return false;
    this.look = { startedAt: now, depth };
    return true;
  }

  /** Whether the one-off look underground is still running. */
  get isLooking(): boolean {
    return this.look !== null;
  }

  /**
   * Advance the look and re-project through it.
   *
   * The offset is applied inside {@link projectTreeToScreen} rather than written
   * onto the camera, so the auto-fit underneath keeps tracking the tree — a limb
   * grown mid-look still reframes, and when the look ends there is nothing to
   * unwind.
   */
  private advanceLook(now: number): void {
    if (!this.look) return;

    const t = (now - this.look.startedAt) / LOOK_DURATION_MS;
    if (t >= 1) {
      this.look = null;
      this.lookOffset = 0;
    } else {
      this.lookOffset = lookCurve(t) * this.look.depth;
    }
    this.projectTreeToScreen();
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
    this.layoutPicker();
  }

  /**
   * Tell the renderer which species may be planted and which one is chosen.
   *
   * Kept here rather than passed per frame because it changes rarely (an unlock,
   * a click on a chip) while the picker has to be hit-testable between frames.
   */
  setPlantableSpecies(unlocked: readonly string[], planting: string): void {
    this.plantable = unlocked;
    this.planting = planting;
    this.layoutPicker();
  }

  /**
   * Hang the picker off the open menu. Empty whenever there is no menu, or when
   * there is nothing to choose between — a picker with one chip is a control
   * that cannot do anything.
   */
  private layoutPicker(): void {
    if (!this.menu || this.plantable.length < PICKER_MIN_SPECIES) {
      this.chips = [];
      this.hoveredChip = null;
      return;
    }
    const rootward =
      this.menuOptions.length > 0 && this.menuOptions.every((o) => o.rule.domain === 'root');
    this.chips = layoutSpeciesPicker(this.menu.center, this.plantable, rootward);
  }

  /** The species chip under `point`, or `null`. */
  pickerChipAt(point: Vec2): string | null {
    const index = hitTestSpeciesPicker(point, this.chips);
    return index === null ? null : this.chips[index].speciesId;
  }

  /** Highlight the chip under the pointer. Returns the species hovered, if any. */
  hoverPicker(point: Vec2 | null): string | null {
    const index = point === null ? null : hitTestSpeciesPicker(point, this.chips);
    this.hoveredChip = index;
    return index === null ? null : this.chips[index].speciesId;
  }

  /** Close the grow menu and drop any preview. */
  closeMenu(): void {
    this.menu = null;
    this.menuOptions = [];
    this.hoveredItem = null;
    this.ghost = null;
    this.chips = [];
    this.hoveredChip = null;
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
    this.layoutPicker();
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

  /**
   * Whether the menu's dials are live yet (see `MENU_ARM_MS`).
   *
   * Always `false` in sheet mode: the dials are not on screen there, and dials
   * that cannot be seen must not be pressable — a tap in the middle of the
   * canvas would otherwise buy whatever invisible option happened to be under
   * the player's thumb.
   */
  isMenuArmed(now: number): boolean {
    return !this.sheet && this.menu !== null && isMenuArmed(this.menu, now);
  }

  /**
   * Show the grow menu as a bottom sheet instead of a ring of dials.
   *
   * A radial menu needs room around the limb it hangs off, and a 390px-wide
   * phone held in one hand has neither the room nor the reach — the dials at
   * the top of the ring end up under the player's own hand. The options do not
   * change; where they are drawn does. The renderer still owns *which* menu is
   * open, so both presentations stay in step with one tap on the tree.
   */
  private sheet = false;

  setSheetMenu(on: boolean): void {
    this.sheet = on;
    if (on) this.highlightMenu(null);
  }

  /** Whether the open menu (if any) is being shown as a sheet. */
  get isSheetMenu(): boolean {
    return this.sheet;
  }

  /**
   * Turn prune mode on or off. Turning it on closes the grow menu — the two are
   * opposite intentions on the same limb and must never both be live.
   */
  setPruneMode(on: boolean): void {
    this.pruning = on;
    this.pruneSelection = null;
    if (on) this.closeMenu();
  }

  /**
   * Turn graft mode on or off. Like prune mode it closes the grow menu: three
   * different intentions on one limb must never be live at once.
   */
  setGraftMode(on: boolean): void {
    this.grafting = on;
    this.graftSelection = null;
    if (on) this.closeMenu();
  }

  /** Whether the knife is out. */
  get isGrafting(): boolean {
    return this.grafting;
  }

  /** Set what graft mode has picked and is pointing at, or clear it with `null`. */
  setGraftSelection(selection: GraftSelection | null): void {
    this.graftSelection = selection;
  }

  /** What graft mode currently has picked, if anything. */
  get graftMark(): GraftSelection | null {
    return this.graftSelection;
  }

  /** Whether the scissors are out. */
  get isPruning(): boolean {
    return this.pruning;
  }

  /** Mark a subtree for cutting, or clear the mark with `null`. */
  setPruneSelection(selection: PruneSelection | null): void {
    this.pruneSelection = selection;
  }

  /** The subtree currently marked, if any. */
  get pruneMark(): PruneSelection | null {
    return this.pruneSelection;
  }

  /**
   * Screen points of the marked subtree — where a cut's debris falls from.
   *
   * Must be read *before* the cut: the projection is rebuilt from the graph, and
   * the graph is about to forget these nodes ever existed.
   */
  prunePoints(): Vec2[] {
    if (!this.pruneSelection) return [];
    return markedPoints(this.screenTree, this.pruneSelection.ids);
  }

  /**
   * Nearest tree segment within {@link CLICK_TOLERANCE_PX} of a CSS-pixel point,
   * or `null` if the tap missed the wood.
   */
  hitTest(point: Vec2): ScreenSegment | null {
    return hitTestSegments(point, this.screenTree, CLICK_TOLERANCE_PX);
  }

  /** Id of the leaf-litter pile under a press, or `null`. */
  litterPileAt(point: Vec2): string | null {
    return hitTestLitter(point, this.piles)?.id ?? null;
  }

  /**
   * Whether a press landed on the storm's brace anchor.
   *
   * `false` whenever no storm is blowing, so the anchor cannot swallow a tap on
   * the trunk it happens to be sitting in front of.
   */
  isBracePress(point: Vec2): boolean {
    if (!this.bracing) return false;
    return hitTestBraceAnchor(point, braceAnchorLayout(this.viewport, this.layout));
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
      const fitted = cameraFromLayout(
        computeTreeLayout(this.cssWidth, this.cssHeight, this.bounds),
        this.viewport,
      );
      this.camera = clampCamera(
        this.lookOffset === 0 ? fitted : { ...fitted, y: fitted.y - this.lookOffset },
        this.viewport,
      );
    }
    this.layout = cameraLayout(this.camera, this.viewport);
    this.screenTree = projectTree(this.tree, this.layout);
    this.scene = symbiontScene(this.screenTree);
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

  /**
   * Where on screen a part is, for anything that has to happen *at* it without
   * a pointer having pointed there — a keyboard tap's floating number, say.
   */
  partAnchor(nodeId: string): Vec2 | null {
    return this.nodeAnchor(nodeId);
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
        // The preview is drawn in the wood the purchase would actually be made
        // of, so the picker's effect is visible before a Sap is spent.
        speciesId: this.ghost.speciesId,
        depth: this.ghost.option.level,
        a: placement.start,
        b: placement.end,
        width: this.ghost.option.thickness,
      },
      this.layout,
    );
  }

  /**
   * How often a leaf comes loose into the wind, in ms, and how hard the wind
   * pushes it sideways in px/s.
   *
   * Both are driven by what the world is actually doing, which is the only
   * reason an ambient particle earns its frame time: leaves come off an autumn
   * tree far more than a spring one, and a storm strips them and throws what it
   * takes across the screen. A constant drizzle of leaves in every weather would
   * be a screensaver.
   */
  private driftEmission(snapshot: GameSnapshot): { intervalMs: number; wind: number } {
    const weather = snapshot.weather.active?.id ?? null;
    if (weather === 'storm') return { intervalMs: 240, wind: 150 };
    if (weather === 'rain') return { intervalMs: 900, wind: 30 };
    if (snapshot.season.id === 'autumn') return { intervalMs: 420, wind: 22 };
    // A drought has nothing left to shed and no wind to shed it with.
    if (weather === 'drought') return { intervalMs: 2600, wind: 10 };
    if (snapshot.season.id === 'winter') return { intervalMs: 2200, wind: 26 };
    return { intervalMs: 1100, wind: 18 };
  }

  /**
   * Let a leaf loose from a random cluster, if one is due.
   *
   * Spawned from the *projected* canopy, so leaves come off the tree the player
   * can see rather than from the top of the screen — and only from clusters,
   * because a leaf drifting out of a root would be a bug that looks like a
   * feature. Cheap by construction: at most one leaf per frame, and none at all
   * when the tree has no foliage yet.
   */
  private emitDrift(snapshot: GameSnapshot, now: number): void {
    if (!this.motion) return;

    const { intervalMs, wind } = this.driftEmission(snapshot);
    if (now < this.nextDriftAt) return;
    // A first frame (or a tab returning after an hour) must not dump a backlog.
    this.nextDriftAt = now + intervalMs * (0.6 + Math.random() * 0.8);

    const clusters = this.screenTree.filter((segment) => segment.kind === 'leafCluster');
    if (clusters.length === 0) return;

    const source = clusters[Math.floor(Math.random() * clusters.length)];
    this.effects.spawnDriftLeaf(
      source.b.x + (Math.random() * 2 - 1) * source.width,
      source.b.y + (Math.random() * 2 - 1) * source.width,
      wind * (Math.random() < 0.5 ? -0.35 : 1),
      now,
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
    // The scripted look moves the camera, so it has to land before anything is
    // measured against the projection this frame.
    this.advanceLook(now);

    const { ctx, cssWidth: w, cssHeight: h } = this;
    const viewport = this.viewport;
    // The soil surface is the trunk's own base, taken from the layout rather
    // than recomputed, so the sky, the strata and the tree share one ground
    // line — and all three travel together under the camera.
    const horizonY = this.layout.originY;

    // Sky, the sun or moon crossing it, and the hills on the horizon — under
    // whatever the season and the weather are casting over them.
    const casts = skyCasts(snapshot.season.id, snapshot.weather);
    drawBackdrop(ctx, viewport, this.layout, snapshot.day, casts, this.motion);

    // Every tree the player has already given up, standing on those hills. Drawn
    // straight after the ridgeline it stands on and before anything underground,
    // which is what puts the grove firmly *behind* the world rather than in it.
    const forest = visibleForest(snapshot.prestige.forest);
    drawForest(
      ctx,
      layoutForest(forest.drawn, viewport, this.layout),
      forest.hidden,
      viewport,
      this.layout,
      casts,
    );

    // Soil: strata bands and the mineral pockets buried in them, drawn at
    // whatever radius the roots can currently feel them from.
    drawSoil(
      ctx,
      w,
      h,
      this.layout,
      this.soil,
      snapshot.veinReach,
      seasonSoilCast(snapshot.season.id),
    );

    // Horizon line where canopy air meets the ground.
    ctx.fillStyle = PALETTE.horizon;
    ctx.fillRect(0, horizonY - 1, w, 2);

    // Totems stand behind the trunk, so a stump planted close in reads as being
    // *at* the base rather than in front of it.
    drawTotems(ctx, snapshot.totems, this.layout);

    // Autumn's piles lie on the ground in front of the totems and behind the
    // trunk, where they fell from.
    this.piles = layoutLitter(snapshot.litter, this.layout);
    drawLitter(ctx, this.piles, snapshot.elapsedSeconds);

    drawTree(
      ctx,
      this.screenTree,
      now,
      this.spawns,
      viewport,
      snapshot.leafLight,
      seasonLeafCast(snapshot.season.id),
      this.motion,
      this.leafPatterns,
    );

    // A leaf on the wind, if one is due. Emitted after the tree is drawn so it
    // is spawned from this frame's projection, and drawn by the effect pool over
    // the top of the canopy it came off.
    this.emitDrift(snapshot, now);

    // The creatures go over the tree they live in, and under the mode overlays:
    // a bee must never obscure the limb the player is about to cut.
    drawSymbionts(
      ctx,
      snapshot.symbionts.filter((s) => s.active),
      this.scene,
      snapshot.elapsedSeconds,
    );

    // The keyboard's cursor on the tree, over the wood and under the mode
    // overlays — a marked cut or a chosen graft limb is a stronger statement
    // about the same part and must win where they land together.
    drawFocusRing(ctx, this.screenTree, this.focused);

    if (this.pruning && this.pruneSelection) {
      drawPruneMark(ctx, this.screenTree, this.pruneSelection, now);
      drawPruneConfirm(ctx, this.screenTree, this.pruneSelection);
    }

    if (this.grafting && this.graftSelection) {
      drawGraftMark(ctx, this.screenTree, this.graftSelection, now);
      drawGraftBadge(ctx, this.screenTree, this.graftSelection);
    }

    // The opening beat sits on the trunk — and only while the ring of buds is
    // shut. Both beats are asking for the same thing, an open menu, so once one
    // is open the mark has been obeyed: leaving "tap it again" on screen over
    // the dials it was asking for would be the tutorial talking past the player.
    if (this.beat && !this.menu) {
      const trunk = this.screenTree.find((segment) => segment.kind === 'trunk');
      if (trunk) {
        drawBeat(
          ctx,
          this.beat,
          { x: (trunk.a.x + trunk.b.x) / 2, y: (trunk.a.y + trunk.b.y) / 2 },
          now,
          this.motion,
        );
      }
    }

    const ghost = this.ghostSegment();
    if (ghost) drawGhostPart(ctx, ghost);

    // In sheet mode the menu is DOM, not canvas: the ghost preview above still
    // draws, because seeing where the part would land is the whole reason to
    // preview it, but the dials and chips are the sheet's job.
    if (this.menu && !this.sheet) {
      drawRadialMenu(ctx, this.menu, this.hoveredItem, now);
      drawSpeciesPicker(
        ctx,
        this.chips,
        this.planting,
        this.hoveredChip,
        Math.min(1, Math.max(0, (now - this.menu.openedAt) / MENU_ARM_MS)),
      );
    }

    // The weather goes over the whole scene — rain falls in front of the tree,
    // not behind it — but under the click feedback, which must stay readable
    // through a downpour.
    drawWeather(ctx, viewport, this.layout, snapshot.weather, snapshot.elapsedSeconds);

    // The anchor is the last thing drawn before the feedback: for fifteen
    // seconds it is the most important thing on the canvas.
    this.bracing = snapshot.weather.storm !== null;
    if (this.bracing && snapshot.weather.storm) {
      drawBraceAnchor(
        ctx,
        braceAnchorLayout(viewport, this.layout),
        snapshot.weather.storm.brace,
        snapshot.elapsedSeconds,
      );
    }

    // Going to Seed goes over everything: for six seconds it is the only thing
    // happening, and the click feedback of a tree that is about to stop existing
    // is not worth reading through it.
    const ceremony = snapshot.prestige.ceremony;
    if (ceremony) {
      drawCeremony(
        ctx,
        viewport,
        this.screenTree.filter((segment) => segment.kind === 'leafCluster'),
        ceremony.fraction,
      );
    }

    this.effects.draw(ctx, now);

    if (this.pointer) {
      drawComboMeter(ctx, this.pointer.x, this.pointer.y, snapshot.combo);
    }
  }
}
