import { describe, expect, it } from 'vitest';
import { beatPhase, drawBeat, type BeatMark } from './onboarding';
import { lookCurve, LOOK_DURATION_MS } from './canvas';

/**
 * A 2D context that records what it is asked to draw.
 *
 * The same shape `tree.test.ts` uses, and for the same reason: the questions
 * worth asking about a mark on the canvas are "did anything get drawn" and "is it
 * the *same* drawing a second later", and both are answered by comparing the
 * calls rather than the pixels.
 */
function recordingContext() {
  const calls: string[] = [];
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const ctx = {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${round(x)},${round(y)}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${round(x)},${round(y)}`),
    arc: (x: number, y: number, r: number) => calls.push(`arc:${round(x)},${round(y)},${round(r)}`),
    roundRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`roundRect:${round(x)},${round(y)},${round(w)},${round(h)}`),
    fillText: (text: string, x: number, y: number) =>
      calls.push(`text:${text}@${round(x)},${round(y)}`),
    measureText: (text: string) => ({ width: text.length * 7 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const AT = { x: 400, y: 300 };

const PULSE: BeatMark = { id: 'firstTap', line: 'Tap the trunk', style: 'pulse' };
const ARROW: BeatMark = { id: 'firstBranch', line: 'Tap it again', style: 'arrow' };

/** What one beat puts on the canvas at `now`, as a comparable string. */
function frame(mark: BeatMark, now: number, motion: boolean): string {
  const ctx = recordingContext();
  drawBeat(ctx, mark, AT, now, motion);
  return ctx.calls.join('|');
}

describe('beatPhase', () => {
  it('breathes between 0 and 1 with motion on', () => {
    const samples = [0, 200, 400, 700, 1000, 1300].map((t) => beatPhase(t, true));
    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(new Set(samples.map((v) => Math.round(v * 100))).size).toBeGreaterThan(1);
  });

  it('holds a half breath with motion off', () => {
    expect(beatPhase(0, false)).toBe(0.5);
    expect(beatPhase(99_999, false)).toBe(0.5);
  });
});

describe('drawBeat', () => {
  it('rings the point it is asking to be pressed', () => {
    expect(frame(PULSE, 0, true)).toContain(`arc:${AT.x},${AT.y}`);
  });

  it('writes its line above the mark, never over it', () => {
    const label = frame(PULSE, 0, true)
      .split('|')
      .find((call) => call.startsWith('text:'));
    expect(label).toContain('Tap the trunk');
    const y = Number(label?.split('@')[1].split(',')[1]);
    expect(y).toBeLessThan(AT.y);
  });

  it('draws an arrow that stops short of the point, so the trunk stays visible', () => {
    const calls = frame(ARROW, 0, true).split('|');
    const shaft = calls.find((call) => call.startsWith('lineTo:'));
    expect(Number(shaft?.split(':')[1].split(',')[1])).toBeLessThan(AT.y);
  });

  it('holds perfectly still with reduced motion, and moves without it', () => {
    // The acceptance criterion for a tutorial mark under `prefers-reduced-motion`:
    // it must still be *there*, and it must stop breathing.
    expect(frame(PULSE, 0, false)).toBe(frame(PULSE, 1500, false));
    expect(frame(ARROW, 0, false)).toBe(frame(ARROW, 1500, false));
    // A quarter of the ring's period, not half: half a breath later it is at the
    // same width again, which would make this assertion pass for the wrong reason.
    expect(frame(PULSE, 0, true)).not.toBe(frame(PULSE, 350, true));
  });

  it('draws the same number of shapes either way — it stops moving, not showing', () => {
    const shapes = (frame: string) =>
      frame.split('|').filter((c) => c === 'fill' || c === 'stroke');
    expect(shapes(frame(PULSE, 0, false)).length).toBe(shapes(frame(PULSE, 0, true)).length);
    expect(shapes(frame(PULSE, 0, false)).length).toBeGreaterThan(0);
  });
});

describe('lookCurve', () => {
  it('starts and ends where the camera already was', () => {
    expect(lookCurve(0)).toBe(0);
    expect(lookCurve(1)).toBe(0);
  });

  it('holds at the bottom rather than turning straight round', () => {
    // The hold is what makes it a glance instead of a glitch.
    expect(lookCurve(0.4)).toBe(1);
    expect(lookCurve(0.6)).toBe(1);
  });

  it('descends and returns without overshooting', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(lookCurve(t)).toBeGreaterThanOrEqual(0);
      expect(lookCurve(t)).toBeLessThanOrEqual(1);
    }
    expect(lookCurve(0.15)).toBeGreaterThan(0);
    expect(lookCurve(0.15)).toBeLessThan(1);
  });

  it('clamps outside its window, so a late frame cannot drive it past the end', () => {
    expect(lookCurve(-1)).toBe(0);
    expect(lookCurve(4)).toBe(0);
    expect(LOOK_DURATION_MS).toBeGreaterThan(0);
  });
});
