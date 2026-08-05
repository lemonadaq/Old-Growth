/**
 * Hardcoded demo tree used until real growth mechanics place limbs.
 *
 * Exactly 12 branches (the trunk plus 11 limbs), 20 leaf clusters, and 8 roots,
 * matching the STEP 4 renderer acceptance target. It is ordinary `TreeSpec`
 * data, so swapping it for a player-grown spec later changes nothing in the
 * renderer.
 */

import type { TreeSpec } from './treeSpec';

export const DEMO_TREE: TreeSpec = {
  species: 'oak',
  origin: { x: 0, y: 0 },
  seed: 20260805,
  branches: [
    // Trunk.
    { id: 'b0', parent: null, angle: 0, length: 200, width: 36, taper: 0.5, curve: 0.04 },
    // Primary limbs off the trunk.
    { id: 'b1', parent: 'b0', attach: 0.52, angle: -36, length: 116, widthScale: 0.5, curve: 0.2 },
    {
      id: 'b2',
      parent: 'b0',
      attach: 0.68,
      angle: 32,
      length: 124,
      widthScale: 0.52,
      curve: -0.18,
    },
    { id: 'b3', parent: 'b0', attach: 1, angle: -10, length: 112, widthScale: 0.78, curve: 0.1 },
    // Secondary limbs.
    { id: 'b4', parent: 'b1', attach: 0.72, angle: -28, length: 78, widthScale: 0.6, curve: 0.22 },
    { id: 'b5', parent: 'b1', attach: 1, angle: 22, length: 68, widthScale: 0.72, curve: -0.16 },
    { id: 'b6', parent: 'b2', attach: 0.7, angle: 27, length: 82, widthScale: 0.6, curve: -0.24 },
    { id: 'b7', parent: 'b2', attach: 1, angle: -20, length: 64, widthScale: 0.72, curve: 0.14 },
    { id: 'b8', parent: 'b3', attach: 0.78, angle: 26, length: 66, widthScale: 0.6, curve: -0.16 },
    { id: 'b9', parent: 'b3', attach: 1, angle: -18, length: 60, widthScale: 0.7, curve: 0.18 },
    // Tertiary twigs.
    { id: 'b10', parent: 'b4', attach: 1, angle: -16, length: 44, widthScale: 0.7, curve: 0.2 },
    { id: 'b11', parent: 'b6', attach: 1, angle: 18, length: 46, widthScale: 0.7, curve: -0.2 },
  ],
  roots: [
    // Taproot, straight down from the trunk base.
    { id: 'r0', parent: null, angle: 180, length: 132, width: 28, taper: 0.5, curve: -0.05 },
    { id: 'r1', parent: 'r0', attach: 0.35, angle: -42, length: 104, widthScale: 0.5, curve: -0.2 },
    { id: 'r2', parent: 'r0', attach: 0.55, angle: 44, length: 112, widthScale: 0.5, curve: 0.22 },
    { id: 'r3', parent: 'r0', attach: 1, angle: -12, length: 96, widthScale: 0.76, curve: -0.12 },
    { id: 'r4', parent: 'r1', attach: 0.8, angle: -30, length: 74, widthScale: 0.6, curve: -0.24 },
    { id: 'r5', parent: 'r2', attach: 0.75, angle: 26, length: 80, widthScale: 0.6, curve: 0.2 },
    { id: 'r6', parent: 'r3', attach: 1, angle: 20, length: 70, widthScale: 0.7, curve: 0.16 },
    { id: 'r7', parent: 'r3', attach: 0.6, angle: -26, length: 62, widthScale: 0.6, curve: -0.18 },
  ],
  leaves: [
    { id: 'l0', parent: 'b10', attach: 1, spread: -12, distance: 16, radius: 34 },
    { id: 'l1', parent: 'b10', attach: 0.6, spread: 46, distance: 20, radius: 26 },
    { id: 'l2', parent: 'b4', attach: 0.85, spread: -54, distance: 22, radius: 30 },
    { id: 'l3', parent: 'b4', attach: 0.5, spread: 58, distance: 24, radius: 25 },
    { id: 'l4', parent: 'b5', attach: 1, spread: 10, distance: 18, radius: 33 },
    { id: 'l5', parent: 'b5', attach: 0.62, spread: -50, distance: 22, radius: 27 },
    { id: 'l6', parent: 'b1', attach: 0.9, spread: -62, distance: 26, radius: 28 },
    { id: 'l7', parent: 'b11', attach: 1, spread: 14, distance: 16, radius: 34 },
    { id: 'l8', parent: 'b11', attach: 0.55, spread: -44, distance: 20, radius: 26 },
    { id: 'l9', parent: 'b6', attach: 0.86, spread: 52, distance: 22, radius: 31 },
    { id: 'l10', parent: 'b6', attach: 0.48, spread: -56, distance: 24, radius: 25 },
    { id: 'l11', parent: 'b7', attach: 1, spread: -14, distance: 18, radius: 32 },
    { id: 'l12', parent: 'b7', attach: 0.6, spread: 48, distance: 22, radius: 26 },
    { id: 'l13', parent: 'b2', attach: 0.92, spread: 60, distance: 26, radius: 28 },
    { id: 'l14', parent: 'b8', attach: 1, spread: 16, distance: 16, radius: 33 },
    { id: 'l15', parent: 'b8', attach: 0.55, spread: -46, distance: 20, radius: 26 },
    { id: 'l16', parent: 'b9', attach: 1, spread: -16, distance: 18, radius: 35 },
    { id: 'l17', parent: 'b9', attach: 0.58, spread: 50, distance: 22, radius: 27 },
    { id: 'l18', parent: 'b3', attach: 0.94, spread: -8, distance: 30, radius: 30 },
    { id: 'l19', parent: 'b3', attach: 0.66, spread: 64, distance: 26, radius: 24 },
  ],
};
