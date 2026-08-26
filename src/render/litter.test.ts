import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import type { TreeLayout } from '../engine/tree';
import type { LitterSnapshot } from '../engine/types';
import { hitTestLitter, layoutLitter } from './litter';

const LAYOUT: TreeLayout = { originX: 640, originY: 500, scale: 400 };

/** A pile at a canonical offset from the trunk. */
function pile(id: string, x: number, spawnedAt = 0): LitterSnapshot {
  return { id, x, amount: new Decimal(5), spawnedAt };
}

describe('layoutLitter', () => {
  it('places a pile at the foot of the trunk it fell from', () => {
    const [laid] = layoutLitter([pile('a', 0)], LAYOUT);
    expect(laid.x).toBeCloseTo(LAYOUT.originX, 9);
    // Settled *into* the ground line rather than floating above it.
    expect(laid.y).toBeGreaterThan(LAYOUT.originY);
  });

  it('projects the offset through the same layout the tree uses', () => {
    const [left, right] = layoutLitter([pile('l', -0.25), pile('r', 0.25)], LAYOUT);
    expect(left.x).toBeCloseTo(LAYOUT.originX - 0.25 * LAYOUT.scale, 9);
    expect(right.x).toBeCloseTo(LAYOUT.originX + 0.25 * LAYOUT.scale, 9);
  });

  it('travels with the camera', () => {
    const panned: TreeLayout = { originX: 100, originY: 900, scale: 400 };
    const [laid] = layoutLitter([pile('a', 0)], panned);
    expect(laid.x).toBeCloseTo(100, 9);
    expect(laid.y).toBeGreaterThan(900);
  });

  it('keeps a pile clickable when zoomed out and sane when zoomed in', () => {
    const tiny = layoutLitter([pile('a', 0)], { ...LAYOUT, scale: 4 })[0];
    const huge = layoutLitter([pile('a', 0)], { ...LAYOUT, scale: 40_000 })[0];

    expect(tiny.radius).toBeGreaterThanOrEqual(9);
    expect(huge.radius).toBeLessThanOrEqual(44);
  });

  it('carries the pile through, so a hit can be paid out', () => {
    const source = pile('a', 0.1);
    expect(layoutLitter([source], LAYOUT)[0].pile).toBe(source);
  });

  it('lays out nothing for a bare base', () => {
    expect(layoutLitter([], LAYOUT)).toEqual([]);
  });
});

describe('hitTestLitter', () => {
  it('finds the pile under the press', () => {
    const laid = layoutLitter([pile('a', -0.3), pile('b', 0.3)], LAYOUT);
    expect(hitTestLitter({ x: laid[1].x, y: laid[1].y }, laid)?.id).toBe('b');
  });

  it('misses when the press is not on a pile', () => {
    const laid = layoutLitter([pile('a', 0)], LAYOUT);
    expect(hitTestLitter({ x: laid[0].x, y: laid[0].y - 400 }, laid)).toBeNull();
    expect(hitTestLitter({ x: 0, y: 0 }, [])).toBeNull();
  });

  it('takes the topmost of two overlapping heaps — the one the player can see', () => {
    const laid = layoutLitter([pile('under', 0), pile('over', 0)], LAYOUT);
    expect(hitTestLitter({ x: laid[0].x, y: laid[0].y }, laid)?.id).toBe('over');
  });

  it('answers just inside the pile and not just outside it', () => {
    const [laid] = layoutLitter([pile('a', 0)], LAYOUT);
    expect(hitTestLitter({ x: laid.x + laid.radius - 1, y: laid.y }, [laid])?.id).toBe('a');
    expect(hitTestLitter({ x: laid.x + laid.radius + 2, y: laid.y }, [laid])).toBeNull();
  });
});
