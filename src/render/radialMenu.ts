import type { Vec2 } from '../engine/geometry';
import type { PricedGrowthOption } from '../engine/growth';
import { formatNumber } from '../engine/format';
import { PALETTE } from './palette';

/**
 * The radial grow menu: the tree's own context menu, drawn on the canvas.
 *
 * Tapping a node fans its valid growth options around it — canopy options arc
 * over the limb, root options arc under it — so the choice appears *at* the
 * thing being changed rather than in a panel across the screen.
 *
 * Layout and hit-testing are pure functions of the anchor point and the option
 * list, which keeps them testable without a canvas.
 */

/** Distance from the tapped node to the centre of each option dial. */
export const MENU_RADIUS_PX = 82;

/** Radius of one option dial. */
export const MENU_ITEM_RADIUS_PX = 26;

/**
 * How long after opening before dials accept a tap.
 *
 * The trunk is also the Sap button, so a player drumming on it opens the menu
 * mid-burst. Arming the dials a moment late means the next few taps in that
 * burst fall through to the tree instead of buying something by accident.
 */
export const MENU_ARM_MS = 180;

/** Total angular span the dials fan across. */
const MENU_ARC_RAD = (150 * Math.PI) / 180;

/** One option laid out as a tappable dial in screen space. */
export interface RadialItem {
  readonly priced: PricedGrowthOption;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** An open menu: which node it belongs to, where it sits, and what it offers. */
export interface RadialMenuState {
  readonly nodeId: string;
  /** Anchor in CSS pixels — the point on the tree that was tapped. */
  readonly center: Vec2;
  readonly items: readonly RadialItem[];
  /** Timestamp the menu opened, for the arming delay and the open animation. */
  readonly openedAt: number;
}

/**
 * Fan `options` around `center`.
 *
 * The arc is centred on screen-up for canopy parts and screen-down for roots,
 * so the menu opens into the empty space the new part would grow into. A lone
 * option sits at the middle of that arc.
 */
export function layoutRadialMenu(
  center: Vec2,
  options: readonly PricedGrowthOption[],
  radius: number = MENU_RADIUS_PX,
): RadialItem[] {
  if (options.length === 0) return [];

  // Screen y grows downward, so "up" is -π/2.
  const rootward = options.every((priced) => priced.rule.domain === 'root');
  const mid = rootward ? Math.PI / 2 : -Math.PI / 2;
  const span = options.length === 1 ? 0 : MENU_ARC_RAD;
  const start = mid - span / 2;
  const step = options.length === 1 ? 0 : span / (options.length - 1);

  return options.map((priced, i) => {
    const angle = start + step * i;
    return {
      priced,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      radius: MENU_ITEM_RADIUS_PX,
    };
  });
}

/** Index of the dial under `point`, or `null`. Ties go to the nearest centre. */
export function hitTestRadialMenu(point: Vec2, items: readonly RadialItem[]): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < items.length; i += 1) {
    const distance = Math.hypot(point.x - items[i].x, point.y - items[i].y);
    if (distance <= items[i].radius && distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }

  return best;
}

/** Whether the menu has been open long enough for its dials to accept a tap. */
export function isMenuArmed(menu: RadialMenuState, now: number): boolean {
  return now - menu.openedAt >= MENU_ARM_MS;
}

/** Ease-out cubic, shared with the part scale-in. */
function easeOut(t: number): number {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

/**
 * Draw the menu.
 *
 * Dials scale in from the anchor over the arming delay, which doubles as the
 * visual promise that they are not live yet. Unaffordable options stay visible
 * but dimmed, with the shortfall under the label rather than the price.
 */
export function drawRadialMenu(
  ctx: CanvasRenderingContext2D,
  menu: RadialMenuState,
  hovered: number | null,
  now: number,
): void {
  const open = easeOut(Math.min(1, Math.max(0, (now - menu.openedAt) / MENU_ARM_MS)));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Anchor dot on the tapped node.
  ctx.fillStyle = PALETTE.menuAnchor;
  ctx.beginPath();
  ctx.arc(menu.center.x, menu.center.y, 4, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < menu.items.length; i += 1) {
    const item = menu.items[i];
    const x = menu.center.x + (item.x - menu.center.x) * open;
    const y = menu.center.y + (item.y - menu.center.y) * open;
    const radius = item.radius * (0.4 + 0.6 * open);
    const { priced } = item;
    const isHovered = hovered === i;

    // Spoke from the node out to the dial.
    ctx.strokeStyle = PALETTE.menuSpoke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(menu.center.x, menu.center.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = priced.affordable ? PALETTE.menuBackdrop : PALETTE.menuBackdropDisabled;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isHovered ? PALETTE.menuBorderHover : PALETTE.menuBorder;
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();

    ctx.fillStyle = priced.affordable ? PALETTE.menuText : PALETTE.menuTextDisabled;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(priced.rule.shortLabel, x, y - 5);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(formatNumber(priced.cost), x, y + 8);

    if (!priced.affordable) {
      ctx.fillStyle = PALETTE.menuTextDisabled;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`−${formatNumber(priced.missing)}`, x, y + radius + 10);
    }
  }

  ctx.restore();
}
