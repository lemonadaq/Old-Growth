import type { BuffDef } from '../content/buffs';
import type { EffectSpec } from '../content/effects';
import type { Modifier } from './modifiers';

/**
 * Timed buffs.
 *
 * A buff is nothing more than a bundle of ordinary {@link Modifier}s granted
 * under one source id, plus an expiry. That is the whole design: the economy
 * never learns what a buff is, it just sees modifiers appear and disappear, and
 * they stack in the usual `(base + Σadds) × Πmuls` order with everything else.
 *
 * Expiries are kept in **engine seconds** (`GameState.elapsedSeconds`) rather
 * than wall-clock time, so a buff cannot be waited out by closing the tab and
 * an offline simulation advances it at exactly the rate it advances everything
 * else.
 */

/** The modifier source id a buff's effects are registered under. */
export function buffSource(id: string): string {
  return `buff:${id}`;
}

/** Turn one content {@link EffectSpec} into a live modifier under `source`. */
function toModifier(source: string, id: string, effect: EffectSpec, index: number): Modifier {
  return {
    id: `${id}:${effect.target}:${index}`,
    source,
    type: effect.type,
    targetKind: effect.targetKind,
    target: effect.target,
    value: effect.value,
  };
}

/** Every modifier a buff grants, all sharing one revocable source. */
export function buffModifiers(def: BuffDef): Modifier[] {
  const source = buffSource(def.id);
  return def.effects.map((effect, i) => toModifier(source, def.id, effect, i));
}

/** One active buff: what it is and when it lapses. */
export interface ActiveBuff {
  readonly id: string;
  /** Engine time (seconds) the buff runs out at. */
  readonly expiresAt: number;
  /** Engine time it was last granted at, so the UI can draw a drain bar. */
  readonly grantedAt: number;
}

/**
 * Which buffs are running and until when.
 *
 * Holds no modifiers of its own — {@link Simulation} owns granting and revoking
 * them — so the ledger stays plain, serialisable bookkeeping.
 */
export class BuffLedger {
  private readonly active = new Map<string, ActiveBuff>();

  /**
   * Start a buff, or **refresh** one already running: either way it now expires
   * a full duration from `now`. Returns the new expiry.
   */
  grant(def: BuffDef, now: number): ActiveBuff {
    const buff: ActiveBuff = {
      id: def.id,
      grantedAt: now,
      expiresAt: now + def.durationSeconds,
    };
    this.active.set(def.id, buff);
    return buff;
  }

  /** Whether a buff is currently running. */
  has(id: string): boolean {
    return this.active.has(id);
  }

  /** The active record for a buff, or `null`. */
  get(id: string): ActiveBuff | null {
    return this.active.get(id) ?? null;
  }

  /** Seconds left on a buff at `now`; `0` when it is not running. */
  remaining(id: string, now: number): number {
    const buff = this.active.get(id);
    if (!buff) return 0;
    return Math.max(0, buff.expiresAt - now);
  }

  /**
   * Retire every buff whose time is up at `now`, returning their ids so the
   * caller can revoke the matching modifiers.
   *
   * Expiry is `now >= expiresAt`: a buff granted at `t` for 120s is gone at
   * exactly `t + 120`, not a tick later.
   */
  expire(now: number): string[] {
    const lapsed: string[] = [];
    for (const [id, buff] of this.active) {
      if (now >= buff.expiresAt) lapsed.push(id);
    }
    for (const id of lapsed) this.active.delete(id);
    return lapsed;
  }

  /** Every running buff, in grant order. */
  entries(): ActiveBuff[] {
    return [...this.active.values()];
  }

  /**
   * Replace every running buff with the ones a save carried.
   *
   * Clears first, so a load can never leave a buff from the run before it
   * standing over the run after. The caller has already dropped anything that
   * lapsed while the tab was shut; what arrives here is what is still running.
   */
  restore(buffs: readonly ActiveBuff[]): void {
    this.active.clear();
    for (const buff of buffs) this.active.set(buff.id, { ...buff });
  }

  /** Drop every buff without reporting it. Used when loading a save. */
  clear(): void {
    this.active.clear();
  }
}
