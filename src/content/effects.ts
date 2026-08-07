/**
 * The shape a piece of content uses to describe a modifier it grants.
 *
 * Buffs and totems both hand the engine a list of these and get ordinary
 * {@link Modifier}s back, so adding a new aura or a new timed effect is a data
 * edit rather than an engine edit.
 *
 * Layer note: content stays free of engine imports. `type` and `targetKind`
 * mirror the engine's modifier vocabulary by value, not by import, exactly as
 * `src/content/upgrades.ts` does.
 */
export interface EffectSpec {
  /** `'add'` sums onto the base; `'mul'` multiplies the result (1.2 = +20%). */
  readonly type: 'add' | 'mul';
  /** Whether `target` names a producer tag or a resource id. */
  readonly targetKind: 'tag' | 'resource';
  readonly target: string;
  readonly value: number;
}
