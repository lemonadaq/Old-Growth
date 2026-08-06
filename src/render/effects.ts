import { PALETTE } from './palette';

/**
 * Transient click feedback: floating "+N" numbers and hit ripples.
 *
 * Both effect kinds are **object-pooled**. The pools are allocated once at
 * construction and every slot is reused forever, so a player hammering the tree
 * at ten taps a second never triggers allocation or GC pressure in the input
 * path. When every slot is busy the oldest one is recycled — dropping the
 * effect that is closest to expiring rather than refusing the newest tap.
 *
 * Effects carry an absolute spawn timestamp instead of a countdown, so their
 * progress is a pure function of the current time and stays correct no matter
 * how the frame loop is pacing.
 */

/** Lifetime of a floating number, in ms. */
export const FLOAT_DURATION_MS = 600;

/** Lifetime of a hit ripple, in ms. */
export const RIPPLE_DURATION_MS = 380;

/** How far (CSS px) a floating number rises over its lifetime. */
const FLOAT_RISE_PX = 52;

/** Radius (CSS px) a ripple expands to. */
const RIPPLE_MAX_RADIUS_PX = 34;

/**
 * Horizontal spread (CSS px) of a floating number over its lifetime. Rapid taps
 * on one spot would otherwise stack six unreadable numbers on top of each other,
 * so consecutive numbers fan to alternating sides across this range.
 */
const DRIFT_MIN_PX = 14;
const DRIFT_RANGE_PX = 26;

const FLOAT_CAPACITY = 128;
const RIPPLE_CAPACITY = 64;

interface FloatingNumber {
  active: boolean;
  x: number;
  y: number;
  text: string;
  crit: boolean;
  spawnedAt: number;
  /** Horizontal drift in px over the full lifetime, so stacked hits fan out. */
  drift: number;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  crit: boolean;
  spawnedAt: number;
}

/** Ease-out cubic: fast at first, settling toward the end. */
function easeOut(t: number): number {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

/**
 * Take the next free slot from a pool, recycling the oldest entry when the pool
 * is saturated. Never allocates.
 */
function acquire<T extends { active: boolean; spawnedAt: number }>(pool: T[]): T {
  let oldest = pool[0];
  for (const slot of pool) {
    if (!slot.active) return slot;
    if (slot.spawnedAt < oldest.spawnedAt) oldest = slot;
  }
  return oldest;
}

export class EffectPool {
  private readonly floats: FloatingNumber[] = [];
  private readonly ripples: Ripple[] = [];
  /** Alternating sign so consecutive numbers drift to opposite sides. */
  private driftSign = 1;

  constructor(floatCapacity = FLOAT_CAPACITY, rippleCapacity = RIPPLE_CAPACITY) {
    for (let i = 0; i < floatCapacity; i += 1) {
      this.floats.push({
        active: false,
        x: 0,
        y: 0,
        text: '',
        crit: false,
        spawnedAt: 0,
        drift: 0,
      });
    }
    for (let i = 0; i < rippleCapacity; i += 1) {
      this.ripples.push({ active: false, x: 0, y: 0, crit: false, spawnedAt: 0 });
    }
  }

  /** Spawn the "+N" that rises from a hit. */
  spawnFloatingNumber(x: number, y: number, text: string, crit: boolean, now: number): void {
    const slot = acquire(this.floats);
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.crit = crit;
    slot.spawnedAt = now;
    slot.drift = this.driftSign * (DRIFT_MIN_PX + Math.random() * DRIFT_RANGE_PX);
    this.driftSign = -this.driftSign;
  }

  /** Spawn the quick ring that marks the hit point. */
  spawnRipple(x: number, y: number, crit: boolean, now: number): void {
    const slot = acquire(this.ripples);
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.crit = crit;
    slot.spawnedAt = now;
  }

  /** Convenience: the full feedback burst for one tap. */
  spawnHit(x: number, y: number, text: string, crit: boolean, now: number): void {
    this.spawnRipple(x, y, crit, now);
    this.spawnFloatingNumber(x, y, text, crit, now);
  }

  /** Retire everything that has outlived its duration at `now`. */
  prune(now: number): void {
    for (const slot of this.floats) {
      if (slot.active && now - slot.spawnedAt >= FLOAT_DURATION_MS) slot.active = false;
    }
    for (const slot of this.ripples) {
      if (slot.active && now - slot.spawnedAt >= RIPPLE_DURATION_MS) slot.active = false;
    }
  }

  /** Live floating numbers — for tests and debugging. */
  get activeFloats(): number {
    return this.floats.reduce((n, slot) => n + (slot.active ? 1 : 0), 0);
  }

  /** Live ripples — for tests and debugging. */
  get activeRipples(): number {
    return this.ripples.reduce((n, slot) => n + (slot.active ? 1 : 0), 0);
  }

  /** Deactivate every slot. */
  clear(): void {
    for (const slot of this.floats) slot.active = false;
    for (const slot of this.ripples) slot.active = false;
  }

  /** Draw all live effects. Prune first so expired slots are skipped. */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.prune(now);
    this.drawRipples(ctx, now);
    this.drawFloats(ctx, now);
  }

  private drawRipples(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    for (const slot of this.ripples) {
      if (!slot.active) continue;
      const t = (now - slot.spawnedAt) / RIPPLE_DURATION_MS;
      const radius = 4 + easeOut(t) * RIPPLE_MAX_RADIUS_PX;

      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = slot.crit ? PALETTE.crit : PALETTE.ripple;
      ctx.lineWidth = slot.crit ? 3 : 2;
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFloats(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const slot of this.floats) {
      if (!slot.active) continue;
      const t = (now - slot.spawnedAt) / FLOAT_DURATION_MS;
      const y = slot.y - easeOut(t) * FLOAT_RISE_PX;
      const x = slot.x + easeOut(t) * slot.drift;

      // Hold full opacity briefly so the number is readable, then fade out.
      ctx.globalAlpha = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      ctx.font = slot.crit ? 'bold 26px system-ui, sans-serif' : 'bold 17px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(28, 20, 12, 0.7)';
      ctx.strokeText(slot.text, x, y);
      ctx.fillStyle = slot.crit ? PALETTE.crit : PALETTE.gain;
      ctx.fillText(slot.text, x, y);
    }
    ctx.restore();
  }
}
