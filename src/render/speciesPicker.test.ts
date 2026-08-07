import { describe, expect, it } from 'vitest';
import { CHIP_RADIUS_PX, hitTestSpeciesPicker, layoutSpeciesPicker } from './speciesPicker';

const CENTER = { x: 200, y: 150 };

describe('layoutSpeciesPicker', () => {
  it('centres the row on the anchor', () => {
    const chips = layoutSpeciesPicker(CENTER, ['oak', 'birch', 'willow'], false);
    expect(chips).toHaveLength(3);
    expect(chips[1].x).toBeCloseTo(CENTER.x, 9);
    expect((chips[0].x + chips[2].x) / 2).toBeCloseTo(CENTER.x, 9);
  });

  it('puts a single chip directly under the anchor', () => {
    const [chip] = layoutSpeciesPicker(CENTER, ['oak'], false);
    expect(chip.x).toBeCloseTo(CENTER.x, 9);
    expect(chip.y).toBeGreaterThan(CENTER.y);
  });

  it('hangs over the anchor for a root menu, so it never covers the dials', () => {
    const canopy = layoutSpeciesPicker(CENTER, ['oak', 'birch'], false);
    const root = layoutSpeciesPicker(CENTER, ['oak', 'birch'], true);

    expect(canopy[0].y).toBeGreaterThan(CENTER.y);
    expect(root[0].y).toBeLessThan(CENTER.y);
    // Same distance either way: the row is mirrored, not moved.
    expect(canopy[0].y - CENTER.y).toBeCloseTo(CENTER.y - root[0].y, 9);
  });

  it('keeps the chips apart', () => {
    const chips = layoutSpeciesPicker(CENTER, ['oak', 'birch', 'willow', 'maple'], false);
    for (let i = 1; i < chips.length; i += 1) {
      expect(chips[i].x - chips[i - 1].x).toBeGreaterThan(CHIP_RADIUS_PX * 2);
    }
  });

  it('lays out nothing for no species', () => {
    expect(layoutSpeciesPicker(CENTER, [], false)).toEqual([]);
  });

  it('keeps the order it was given, so the row never reshuffles', () => {
    const ids = ['oak', 'birch', 'willow'];
    expect(layoutSpeciesPicker(CENTER, ids, false).map((c) => c.speciesId)).toEqual(ids);
  });
});

describe('hitTestSpeciesPicker', () => {
  const chips = layoutSpeciesPicker(CENTER, ['oak', 'birch', 'willow'], false);

  it('finds the chip under a point at its centre', () => {
    expect(hitTestSpeciesPicker({ x: chips[1].x, y: chips[1].y }, chips)).toBe(1);
  });

  it('finds a chip at its very edge', () => {
    expect(hitTestSpeciesPicker({ x: chips[0].x + CHIP_RADIUS_PX, y: chips[0].y }, chips)).toBe(0);
  });

  it('misses just outside', () => {
    expect(
      hitTestSpeciesPicker({ x: chips[0].x + CHIP_RADIUS_PX + 0.5, y: chips[0].y }, chips),
    ).toBeNull();
  });

  it('misses the anchor itself, so a tap on the limb is never a tap on a chip', () => {
    expect(hitTestSpeciesPicker(CENTER, chips)).toBeNull();
  });

  it('finds nothing in an empty picker', () => {
    expect(hitTestSpeciesPicker(CENTER, [])).toBeNull();
  });
});
