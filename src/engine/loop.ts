/**
 * Fixed-timestep game loop with an accumulator, decoupled from rendering.
 *
 * The simulation advances in fixed {@link MS_PER_TICK} steps ({@link TICK_RATE}
 * ticks/sec) so game logic is deterministic and framerate-independent. Rendering
 * happens once per animation frame regardless of how many ticks ran, and receives
 * an interpolation `alpha` in `[0, 1)` describing progress toward the next tick.
 *
 * This class contains no React or DOM-rendering code. `advance()` is pure with
 * respect to timing input, which makes the stepping logic unit-testable without
 * a real `requestAnimationFrame`.
 */

import { MAX_FRAME_MS, TICK_RATE } from '../content/balance';
import { MS_PER_SECOND } from '../content/units';

/**
 * `TICK_RATE` is simulation ticks per second and `MAX_FRAME_MS` is the largest
 * frame delta processed in one call; both are tuned in `balance.ts`.
 */
export { MAX_FRAME_MS, TICK_RATE };

/** Milliseconds of simulated time per fixed tick. */
export const MS_PER_TICK = MS_PER_SECOND / TICK_RATE;

export interface LoopCallbacks {
  /** Advance the simulation by one fixed step. `dtSeconds` is constant. */
  update(dtSeconds: number): void;
  /** Draw a frame. `alpha` is progress toward the next tick, in `[0, 1)`. */
  render(alpha: number): void;
  /** Called ~once per second with sampled FPS/TPS. */
  onStats?(stats: { fps: number; tps: number }): void;
}

export class GameLoop {
  private accumulatorMs = 0;
  private running = false;
  private rafId: number | null = null;
  private lastTimeMs = 0;

  // Stat sampling.
  private ticksThisWindow = 0;
  private framesThisWindow = 0;
  private windowMs = 0;

  constructor(private readonly cb: LoopCallbacks) {}

  /**
   * Feed one frame's elapsed time into the loop. Runs zero or more fixed
   * simulation steps, then renders once. Returns the number of ticks executed.
   *
   * Called by the internal rAF loop, and directly by tests.
   */
  advance(frameDtMs: number): number {
    const clamped = Math.min(Math.max(frameDtMs, 0), MAX_FRAME_MS);
    this.accumulatorMs += clamped;

    let ticks = 0;
    while (this.accumulatorMs >= MS_PER_TICK) {
      this.cb.update(MS_PER_TICK / MS_PER_SECOND);
      this.accumulatorMs -= MS_PER_TICK;
      ticks += 1;
    }

    // The simulation always advances; the draw is skipped while the tab is
    // hidden. There is nobody to show the frame to, and a phone in a pocket
    // should not be shading a canopy.
    const alpha = this.accumulatorMs / MS_PER_TICK;
    if (!this.hidden) this.cb.render(alpha);

    this.sampleStats(clamped, ticks);
    return ticks;
  }

  private sampleStats(frameDtMs: number, ticks: number): void {
    this.ticksThisWindow += ticks;
    this.framesThisWindow += 1;
    this.windowMs += frameDtMs;

    if (this.windowMs >= MS_PER_SECOND) {
      const seconds = this.windowMs / MS_PER_SECOND;
      const fps = Math.round(this.framesThisWindow / seconds);
      const tps = Math.round(this.ticksThisWindow / seconds);
      this.cb.onStats?.({ fps, tps });
      this.ticksThisWindow = 0;
      this.framesThisWindow = 0;
      this.windowMs = 0;
    }
  }

  /**
   * Whether the tab is hidden, and so whether drawing is worth doing.
   *
   * A backgrounded tab already has its `requestAnimationFrame` throttled to a
   * crawl by the browser, but "a crawl" is not "nothing", and on a phone the
   * difference is battery. The *simulation* still advances — the tree does not
   * stop growing because the player looked away — only the draw is skipped.
   */
  private hidden = false;

  /** Tell the loop whether its canvas is currently visible. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  /** Begin the requestAnimationFrame-driven loop. No-op if already running. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = performance.now();

    const frame = (now: number): void => {
      if (!this.running) return;
      const dt = now - this.lastTimeMs;
      this.lastTimeMs = now;
      this.advance(dt);
      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  /** Stop the loop and reset stat sampling. Safe to call when not running. */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ticksThisWindow = 0;
    this.framesThisWindow = 0;
    this.windowMs = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
