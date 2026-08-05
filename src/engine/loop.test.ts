import { describe, expect, it, vi } from 'vitest';
import { GameLoop, MAX_FRAME_MS, MS_PER_TICK } from './loop';

function makeLoop() {
  const update = vi.fn();
  const render = vi.fn();
  const onStats = vi.fn();
  const loop = new GameLoop({ update, render, onStats });
  return { loop, update, render, onStats };
}

describe('GameLoop.advance (fixed timestep accumulator)', () => {
  it('runs exactly one tick per MS_PER_TICK of elapsed time', () => {
    const { loop, update } = makeLoop();
    expect(loop.advance(MS_PER_TICK)).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(MS_PER_TICK / 1000);
  });

  it('runs no ticks when less than one step has accumulated', () => {
    const { loop, update, render } = makeLoop();
    expect(loop.advance(MS_PER_TICK / 2)).toBe(0);
    expect(update).not.toHaveBeenCalled();
    // Rendering still happens every frame, decoupled from ticks.
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('carries leftover time in the accumulator across frames', () => {
    const { loop, update } = makeLoop();
    // Two half-steps should together trigger exactly one tick.
    expect(loop.advance(MS_PER_TICK * 0.6)).toBe(0);
    expect(loop.advance(MS_PER_TICK * 0.6)).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('runs multiple ticks for a multi-step frame (below the clamp)', () => {
    const { loop, update } = makeLoop();
    // 2 * MS_PER_TICK == 200ms, under MAX_FRAME_MS so nothing is clamped.
    expect(loop.advance(MS_PER_TICK * 2)).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('clamps huge frame gaps to avoid the spiral of death', () => {
    const { loop, update } = makeLoop();
    const ticks = loop.advance(60_000); // simulate a long tab freeze
    expect(ticks).toBe(Math.floor(MAX_FRAME_MS / MS_PER_TICK));
    expect(update).toHaveBeenCalledTimes(ticks);
  });

  it('renders exactly once per advance regardless of tick count', () => {
    const { loop, render } = makeLoop();
    loop.advance(MS_PER_TICK * 5);
    loop.advance(0);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('passes an interpolation alpha in [0, 1) to render', () => {
    const { loop, render } = makeLoop();
    loop.advance(MS_PER_TICK * 1.25);
    const alpha = render.mock.calls[0][0] as number;
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.25, 5);
  });

  it('samples FPS/TPS roughly once per second of processed time', () => {
    const { loop, onStats } = makeLoop();
    // Ten 100ms frames == 1s of processed time, one tick each.
    for (let i = 0; i < 10; i += 1) {
      loop.advance(100);
    }
    expect(onStats).toHaveBeenCalledTimes(1);
    expect(onStats).toHaveBeenCalledWith({ fps: 10, tps: 10 });
  });

  it('ignores negative frame deltas', () => {
    const { loop, update } = makeLoop();
    expect(loop.advance(-500)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
