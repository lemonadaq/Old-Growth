import { describe, expect, it } from 'vitest';
import type { ScreenSegment } from '../engine/tree';
import { drawFocusRing, FOCUS_HALO_PX } from './focus';

/** Records every stroke and the width it was drawn at. */
function recordingContext() {
  const calls: string[] = [];
  const ctx = {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    arc: (x: number, y: number, r: number) => calls.push(`arc:${x},${y},${r}`),
    stroke() {
      calls.push(`stroke:${this.strokeStyle}@${this.lineWidth}`);
    },
    fill: () => calls.push('fill'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

function limb(id: string, kind: ScreenSegment['kind'] = 'branch'): ScreenSegment {
  return {
    id,
    kind,
    depth: 1,
    width: 6,
    a: { x: 100, y: 300 },
    b: { x: 140, y: 240 },
  };
}

const SEGMENTS = [limb('trunk-0', 'trunk'), limb('branch-1'), limb('leaf-2', 'leafCluster')];

describe('the keyboard focus ring', () => {
  it('draws nothing when nothing is focused', () => {
    const ctx = recordingContext();
    drawFocusRing(ctx, SEGMENTS, null);
    expect(ctx.calls).toEqual([]);
  });

  it('draws nothing for a part that is no longer on the tree', () => {
    // A cut takes its subtree with it while the ring is still pointing at it.
    const ctx = recordingContext();
    drawFocusRing(ctx, SEGMENTS, 'branch-99');
    expect(ctx.calls).toEqual([]);
  });

  it('marks the focused limb and only that one', () => {
    const ctx = recordingContext();
    drawFocusRing(ctx, SEGMENTS, 'branch-1');
    const lines = ctx.calls.filter((call) => call.startsWith('lineTo'));
    expect(lines).toEqual(['lineTo:140,240', 'lineTo:140,240']);
  });

  it('is wider than the limb it marks, so it reads as a halo rather than a repaint', () => {
    const ctx = recordingContext();
    drawFocusRing(ctx, SEGMENTS, 'branch-1');
    const widths = ctx.calls
      .filter((call) => call.startsWith('stroke:'))
      .map((call) => Number(call.split('@')[1]));

    expect(Math.max(...widths)).toBeGreaterThanOrEqual(6 + FOCUS_HALO_PX);
    // And a thin bright line on top of it, or the halo alone would vanish
    // against a pale sky.
    expect(Math.min(...widths)).toBeLessThan(3);
  });

  it('rings foliage instead of stroking through it', () => {
    const ctx = recordingContext();
    drawFocusRing(ctx, SEGMENTS, 'leaf-2');
    expect(ctx.calls.filter((call) => call.startsWith('arc:'))).toHaveLength(2);
    expect(ctx.calls.filter((call) => call.startsWith('lineTo'))).toEqual([]);
  });

  it('always balances its save with a restore', () => {
    for (const id of [null, 'branch-1', 'leaf-2']) {
      const ctx = recordingContext();
      drawFocusRing(ctx, SEGMENTS, id);
      expect(ctx.calls.filter((c) => c === 'save')).toHaveLength(
        ctx.calls.filter((c) => c === 'restore').length,
      );
    }
  });
});
