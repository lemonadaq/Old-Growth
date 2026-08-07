import type { Vec2 } from '../engine/geometry';
import { speciesOrStarter } from '../engine/species';
import { PALETTE } from './palette';

/**
 * The species picker: a row of chips under the radial grow menu.
 *
 * It appears only once the player has more than one species, because a picker
 * offering a single option is a control that does nothing. It sits *inside* the
 * grow menu rather than in a panel, so the choice of what to plant is made in
 * the same gesture and the same place as the choice of what to plant *there*.
 *
 * Chips hang on the opposite side of the anchor from the dials — under a canopy
 * menu, over a root menu — so neither ever covers the other.
 *
 * Layout and hit-testing are pure functions of the anchor, exactly as the menu's
 * are, and are tested without a canvas.
 */

/** Radius of one species chip. */
export const CHIP_RADIUS_PX = 15;

/** Gap between chip centres. */
const CHIP_SPACING_PX = 36;

/** Distance from the menu anchor to the chip row. */
const CHIP_OFFSET_PX = 46;

/** One species chip in screen space. */
export interface SpeciesChip {
  readonly speciesId: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Lay the chips out in a row centred under (or over) `center`.
 *
 * `rootward` matches the menu's own orientation: a root menu arcs downward, so
 * its picker goes up.
 */
export function layoutSpeciesPicker(
  center: Vec2,
  speciesIds: readonly string[],
  rootward: boolean,
): SpeciesChip[] {
  if (speciesIds.length === 0) return [];

  const y = center.y + (rootward ? -CHIP_OFFSET_PX : CHIP_OFFSET_PX);
  const width = (speciesIds.length - 1) * CHIP_SPACING_PX;
  const startX = center.x - width / 2;

  return speciesIds.map((speciesId, i) => ({
    speciesId,
    x: startX + i * CHIP_SPACING_PX,
    y,
    radius: CHIP_RADIUS_PX,
  }));
}

/** Index of the chip under `point`, or `null`. Ties go to the nearest centre. */
export function hitTestSpeciesPicker(point: Vec2, chips: readonly SpeciesChip[]): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < chips.length; i += 1) {
    const distance = Math.hypot(point.x - chips[i].x, point.y - chips[i].y);
    if (distance <= chips[i].radius && distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Draw the chips.
 *
 * Each chip is filled with its species' own bark colour, so the row reads as a
 * set of woods rather than a set of buttons; the selected one is ringed and
 * carries its name underneath, which is the only text the picker needs.
 */
export function drawSpeciesPicker(
  ctx: CanvasRenderingContext2D,
  chips: readonly SpeciesChip[],
  selectedId: string,
  hovered: number | null,
  open = 1,
): void {
  if (chips.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = open;

  for (let i = 0; i < chips.length; i += 1) {
    const chip = chips[i];
    const def = speciesOrStarter(chip.speciesId);
    const selected = chip.speciesId === selectedId;
    const radius = chip.radius * (selected ? 1 : 0.88);

    ctx.fillStyle = def.palette.bark;
    ctx.beginPath();
    ctx.arc(chip.x, chip.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = selected
      ? PALETTE.menuBorderHover
      : hovered === i
        ? PALETTE.menuBorder
        : PALETTE.menuSpoke;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.stroke();

    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(def.glyph, chip.x, chip.y + 1);

    if (selected) {
      ctx.fillStyle = PALETTE.menuText;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(def.name, chip.x, chip.y + radius + 9);
    }
  }

  ctx.restore();
}
