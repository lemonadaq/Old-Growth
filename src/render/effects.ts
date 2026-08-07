import type { Vec2 } from '../engine/geometry';
import { PALETTE } from './palette';

/**
 * Transient feedback: floating "+N" numbers, hit ripples, and the foliage a
 * prune shakes loose.
 *
 * All three effect kinds are **object-pooled**. The pools are allocated once at
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

/**
 * How long a shaken-loose leaf takes to fall out of frame, in ms.
 *
 * Long by the standards of the other effects on purpose: a cut is the most
 * consequential thing a player can do to their tree, and the drift down is the
 * only part of it that reads as *loss*. It should outlast the click that caused
 * it.
 */
export const LEAF_FALL_DURATION_MS = 1600;

/** Downward speed a falling leaf settles at, in CSS px per second. */
const LEAF_FALL_SPEED_PX = 130;

/** Sideways drift of a falling leaf, in CSS px per second. */
const LEAF_DRIFT_PX = 34;

/** How far a falling leaf swings across its drift, in CSS px. */
const LEAF_SWAY_PX = 11;

/** Full swings per second as a leaf falls. */
const LEAF_SWAY_RATE = 1.6;

/**
 * How long a scrap of confetti stays up, in ms.
 *
 * Longer than anything else here, and unapologetically so: it fires once per
 * *new* hybrid — a few dozen times in a whole run — and a discovery that is over
 * before the player has read the toast is not a celebration.
 */
export const CONFETTI_DURATION_MS = 2200;

/** Initial upward speed of a scrap of confetti, in CSS px/s. */
const CONFETTI_LAUNCH_PX = 340;

/** Downward pull on confetti, in CSS px/s². */
const CONFETTI_GRAVITY_PX = 620;

const FLOAT_CAPACITY = 128;
const RIPPLE_CAPACITY = 64;
const LEAF_CAPACITY = 96;
const CONFETTI_CAPACITY = 120;

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

/** One scrap of foliage tumbling down from a cut. */
interface FallingLeaf {
  active: boolean;
  x: number;
  y: number;
  /** Sideways drift in px/s; sign decides which way it slides. */
  drift: number;
  /** Fall speed in px/s. Varied so a burst does not fall as a sheet. */
  speed: number;
  /** Radians per second of tumble. */
  spin: number;
  /** Phase offset into the sway, so neighbours swing out of step. */
  phase: number;
  /** Half-length of the leaf in px. */
  size: number;
  color: string;
  spawnedAt: number;
}

/** One scrap of confetti thrown by a discovery. */
interface Confetto {
  active: boolean;
  x: number;
  y: number;
  /** Launch velocity in px/s. */
  vx: number;
  vy: number;
  spin: number;
  size: number;
  color: string;
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
  private readonly leaves: FallingLeaf[] = [];
  private readonly confetti: Confetto[] = [];
  /** Alternating sign so consecutive numbers drift to opposite sides. */
  private driftSign = 1;

  constructor(
    floatCapacity = FLOAT_CAPACITY,
    rippleCapacity = RIPPLE_CAPACITY,
    leafCapacity = LEAF_CAPACITY,
    confettiCapacity = CONFETTI_CAPACITY,
  ) {
    for (let i = 0; i < confettiCapacity; i += 1) {
      this.confetti.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        spin: 0,
        size: 0,
        color: PALETTE.confetti[0],
        spawnedAt: 0,
      });
    }
    for (let i = 0; i < leafCapacity; i += 1) {
      this.leaves.push({
        active: false,
        x: 0,
        y: 0,
        drift: 0,
        speed: 0,
        spin: 0,
        phase: 0,
        size: 0,
        color: PALETTE.leafFall,
        spawnedAt: 0,
      });
    }
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

  /** Shake one scrap of foliage loose from a point. */
  spawnFallingLeaf(x: number, y: number, now: number): void {
    const slot = acquire(this.leaves);
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.drift = (Math.random() * 2 - 1) * LEAF_DRIFT_PX;
    slot.speed = LEAF_FALL_SPEED_PX * (0.7 + Math.random() * 0.6);
    slot.spin = (Math.random() * 2 - 1) * 3.4;
    slot.phase = Math.random() * Math.PI * 2;
    slot.size = 3.5 + Math.random() * 3;
    // A cut sheds green and dry alike; mixing the two keeps a burst from
    // reading as one flat colour.
    slot.color = Math.random() < 0.7 ? PALETTE.leafFall : PALETTE.leafFallDry;
    slot.spawnedAt = now;
  }

  /**
   * The burst a prune throws off: `perPoint` leaves from each removed part,
   * scattered a little so they do not all start from the same pixel.
   *
   * Points come from the *screen* geometry of the subtree, captured before the
   * cut — which is why the debris falls from where the limb actually was rather
   * than from the cursor.
   */
  spawnPruneBurst(points: readonly Vec2[], now: number, perPoint = 3): void {
    for (const point of points) {
      for (let i = 0; i < perPoint; i += 1) {
        this.spawnFallingLeaf(
          point.x + (Math.random() * 2 - 1) * 6,
          point.y + (Math.random() * 2 - 1) * 6,
          now,
        );
      }
    }
  }

  /**
   * Throw a burst of confetti from a point — the discovery of a hybrid nobody
   * has grown before.
   *
   * Scraps launch into a cone rather than a full circle: a fountain reads as
   * celebration, while an even sphere reads as an explosion, and a graft is a
   * good thing happening to the tree.
   */
  spawnConfetti(x: number, y: number, now: number, count = 44): void {
    const colors = PALETTE.confetti;
    for (let i = 0; i < count; i += 1) {
      const slot = acquire(this.confetti);
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 0.9;
      const speed = CONFETTI_LAUNCH_PX * (0.55 + Math.random() * 0.65);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = Math.sin(angle) * speed;
      slot.spin = (Math.random() * 2 - 1) * 8;
      slot.size = 3 + Math.random() * 3.5;
      slot.color = colors[i % colors.length];
      slot.spawnedAt = now;
    }
  }

  /** Retire everything that has outlived its duration at `now`. */
  prune(now: number): void {
    for (const slot of this.confetti) {
      if (slot.active && now - slot.spawnedAt >= CONFETTI_DURATION_MS) slot.active = false;
    }
    for (const slot of this.floats) {
      if (slot.active && now - slot.spawnedAt >= FLOAT_DURATION_MS) slot.active = false;
    }
    for (const slot of this.ripples) {
      if (slot.active && now - slot.spawnedAt >= RIPPLE_DURATION_MS) slot.active = false;
    }
    for (const slot of this.leaves) {
      if (slot.active && now - slot.spawnedAt >= LEAF_FALL_DURATION_MS) slot.active = false;
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

  /** Live falling leaves — for tests and debugging. */
  get activeLeaves(): number {
    return this.leaves.reduce((n, slot) => n + (slot.active ? 1 : 0), 0);
  }

  /** Live confetti — for tests and debugging. */
  get activeConfetti(): number {
    return this.confetti.reduce((n, slot) => n + (slot.active ? 1 : 0), 0);
  }

  /** Deactivate every slot. */
  clear(): void {
    for (const slot of this.floats) slot.active = false;
    for (const slot of this.ripples) slot.active = false;
    for (const slot of this.leaves) slot.active = false;
    for (const slot of this.confetti) slot.active = false;
  }

  /**
   * Draw all live effects. Prune first so expired slots are skipped.
   *
   * Falling debris goes underneath the numbers: a "+N Deadwood" that a leaf
   * tumbles across is harder to read than one drawn over the top of it.
   */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.prune(now);
    this.drawFallingLeaves(ctx, now);
    this.drawConfetti(ctx, now);
    this.drawRipples(ctx, now);
    this.drawFloats(ctx, now);
  }

  /** Confetti: ballistic scraps that launch, tumble, and drift back down. */
  private drawConfetti(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    for (const slot of this.confetti) {
      if (!slot.active) continue;
      const elapsed = (now - slot.spawnedAt) / 1000;
      const t = (now - slot.spawnedAt) / CONFETTI_DURATION_MS;

      const x = slot.x + slot.vx * elapsed;
      const y = slot.y + slot.vy * elapsed + 0.5 * CONFETTI_GRAVITY_PX * elapsed * elapsed;

      ctx.globalAlpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      ctx.fillStyle = slot.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(slot.spin * elapsed);
      // Rectangles, not discs: a tumbling rectangle flashes edge-on as it spins,
      // which is most of what makes confetti read as confetti.
      ctx.fillRect(-slot.size / 2, -slot.size / 4, slot.size, slot.size / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Foliage tumbling out of a cut: each leaf falls at its own speed, slides
   * along its own drift, and swings across it as it goes, so a burst spreads
   * into a shower instead of dropping as one block.
   */
  private drawFallingLeaves(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    for (const slot of this.leaves) {
      if (!slot.active) continue;
      const elapsed = (now - slot.spawnedAt) / 1000;
      const t = (now - slot.spawnedAt) / LEAF_FALL_DURATION_MS;

      const x =
        slot.x + slot.drift * elapsed + Math.sin(elapsed * LEAF_SWAY_RATE * Math.PI + slot.phase) * LEAF_SWAY_PX;
      // Eased downward: a leaf leaves the limb slowly and picks up speed.
      const y = slot.y + slot.speed * elapsed * (0.45 + 0.55 * t);

      // Hold, then fade over the back half — a leaf that vanishes the instant it
      // is cut never reads as having fallen.
      ctx.globalAlpha = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
      ctx.fillStyle = slot.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(slot.spin * elapsed);
      ctx.beginPath();
      ctx.ellipse(0, 0, slot.size, slot.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
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
