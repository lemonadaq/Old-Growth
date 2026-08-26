import Decimal from 'break_infinity.js';
import {
  LITTER_MAX_PILES,
  LITTER_MIN_AMOUNT,
  LITTER_PER_LEAF,
  LITTER_SPREAD,
} from '../content/balance';
import type { RandomSource } from './rng';

/**
 * Leaf litter: what autumn leaves on the ground.
 *
 * The canopy sheds on a clock, and what it sheds lands at the base as a **pile**
 * — a thing on the canvas with a position, not a number that goes up. Sweeping
 * it is the one active thing autumn asks for, and the Rake is the upgrade that
 * takes the asking away.
 *
 * Piles survive the season that made them. Nothing collects itself when winter
 * arrives: leaves left in the snow are still leaves, and a pile the player never
 * got round to is theirs whenever they come back for it.
 */

/** One heap of shed leaves waiting at the base of the trunk. */
export interface LitterPile {
  readonly id: string;
  /** Where it sits, in canonical units either side of the trunk. */
  readonly x: number;
  /** Leaf Litter it hands over when swept. */
  readonly amount: Decimal;
  /** Engine seconds it formed at, so the canvas can settle it in. */
  readonly spawnedAt: number;
}

/**
 * What one pile is worth, given the canopy that shed it.
 *
 * Proportional to the leaves overhead, floored so that even a nearly bare tree
 * is worth stooping for — a pile the player walks to and finds empty teaches
 * them not to bother next time.
 */
export function litterAmount(leaves: number): Decimal {
  return new Decimal(Math.max(LITTER_MIN_AMOUNT, Math.max(0, leaves) * LITTER_PER_LEAF));
}

/** A resting place for a new pile: somewhere in the band around the trunk. */
export function litterPosition(random: RandomSource): number {
  return (random() * 2 - 1) * LITTER_SPREAD;
}

/**
 * The piles currently on the ground.
 *
 * Plain, serialisable bookkeeping — it holds no resources and grants nothing.
 * {@link Simulation} owns crediting a swept pile, exactly as it owns granting a
 * buff's modifiers.
 */
export class LitterGround {
  private readonly piles: LitterPile[] = [];
  private nextId = 1;

  /**
   * Drop a new pile, or return `null` when the ground is already covered.
   *
   * The cap is what keeps autumn a rhythm rather than a chore: a player who
   * looks away for a season comes back to a base worth one sweep, not to a
   * backlog.
   */
  spawn(amount: Decimal, x: number, now: number): LitterPile | null {
    if (this.piles.length >= LITTER_MAX_PILES) return null;

    const pile: LitterPile = { id: `litter-${this.nextId}`, x, amount, spawnedAt: now };
    this.nextId += 1;
    this.piles.push(pile);
    return pile;
  }

  /** Take one pile off the ground, or `null` when there is none by that id. */
  collect(id: string): LitterPile | null {
    const index = this.piles.findIndex((pile) => pile.id === id);
    if (index < 0) return null;
    return this.piles.splice(index, 1)[0];
  }

  /** Take every pile off the ground at once — what the Rake does. */
  collectAll(): LitterPile[] {
    return this.piles.splice(0, this.piles.length);
  }

  /** Every pile, oldest first. */
  entries(): readonly LitterPile[] {
    return this.piles;
  }

  /** How many piles are waiting. */
  get size(): number {
    return this.piles.length;
  }

  /** Whether the ground is at its cap. */
  get full(): boolean {
    return this.piles.length >= LITTER_MAX_PILES;
  }

  /** Sum of everything on the ground — what one sweep would be worth. */
  total(): Decimal {
    return this.piles.reduce((sum, pile) => sum.add(pile.amount), new Decimal(0));
  }

  /** Drop every pile without crediting it. Used when loading a save. */
  clear(): void {
    this.piles.length = 0;
  }
}
