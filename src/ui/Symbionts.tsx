import { RESOURCE_BY_ID } from '../content/resources';
import {
  SEED_FRAGMENTS_PER_SEED,
  SYMBIONTS,
  SYMBIONT_MAX_LEVEL,
  type SymbiontDef,
} from '../content/symbionts';
import { formatNumber } from '../engine/format';
import type { SymbiontSnapshot } from '../engine/types';
import { useGameStore } from './useGameStore';
import './Symbionts.css';

/**
 * The Symbionts panel: who lives in the tree, and who might.
 *
 * Every creature is on the list from the first frame, including the four that
 * have not turned up — a locked card with a live progress bar is a *goal*, and
 * hiding it would leave the whole system invisible until it happened by
 * accident. What each card says is therefore either "here is how close you are"
 * or "here is what it is doing for you", and never nothing.
 *
 * The level pips are the other half of that: a track you can see the length of
 * is a track you can plan against.
 */
export interface SymbiontsProps {
  /** Buy the next level of a resident's track. */
  readonly onUpgrade: (id: string) => void;
}

/** `1:23` from a count of seconds — short enough to sit inside a card. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/** The level track as filled and empty pips. */
function Levels({ level }: { readonly level: number }) {
  return (
    <span className="symbiont__pips" aria-label={`level ${level} of ${SYMBIONT_MAX_LEVEL}`}>
      {Array.from({ length: SYMBIONT_MAX_LEVEL }, (_, i) => (
        <span
          key={i}
          className={`symbiont__pip${i < level ? ' symbiont__pip--filled' : ''}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

function SymbiontCard({
  def,
  row,
  onUpgrade,
}: {
  readonly def: SymbiontDef;
  readonly row: SymbiontSnapshot | undefined;
  readonly onUpgrade: (id: string) => void;
}) {
  const active = row?.active ?? false;
  const level = row?.level ?? 0;
  const cost = row?.nextCost ?? null;

  return (
    <li
      className={`symbiont${active ? '' : ' symbiont--locked'}`}
      style={{ borderLeftColor: active ? def.color : undefined }}
    >
      <p className="symbiont__name">
        <span aria-hidden>{def.glyph}</span> {def.name}
        {active && (
          <span className="symbiont__level">
            {def.levelLabel} {level}
          </span>
        )}
      </p>

      <p className="symbiont__flavor">{def.flavor}</p>
      <p className="symbiont__effect">{def.effectLabel}</p>

      {active ? (
        <>
          <Levels level={level} />
          {row?.nextPayoutIn !== null && row?.nextPayoutIn !== undefined && (
            <p className="symbiont__timer">Next in {clock(row.nextPayoutIn)}</p>
          )}
          {cost ? (
            <button
              type="button"
              className="symbiont__buy"
              disabled={!row?.affordable}
              onClick={() => onUpgrade(def.id)}
            >
              <span>
                {def.levelLabel} {level + 1}
              </span>
              <span className="symbiont__cost">
                {cost.map((line) => (
                  <span key={line.resource}>
                    {RESOURCE_BY_ID[line.resource].glyph} {formatNumber(line.amount)}
                  </span>
                ))}
              </span>
            </button>
          ) : (
            <p className="symbiont__maxed">At home here. Nothing more to give it.</p>
          )}
        </>
      ) : (
        <p className="symbiont__locked">
          🔒 {row?.hint ?? ''}
          <span className="symbiont__bar" aria-hidden>
            <span style={{ width: `${Math.round((row?.fraction ?? 0) * 100)}%` }} />
          </span>
        </p>
      )}
    </li>
  );
}

export function Symbionts({ onUpgrade }: SymbiontsProps) {
  const rows = useGameStore((s) => s.snapshot.symbionts);
  const fragments = useGameStore((s) => s.snapshot.seedFragments);
  const nuts = useGameStore((s) => s.snapshot.buriedNuts);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const resident = rows.filter((row) => row.active).length;

  return (
    <aside className="symbionts" aria-label="symbionts">
      <h2 className="symbionts__title">
        Symbionts <span className="symbionts__count">{resident}/{SYMBIONTS.length}</span>
      </h2>

      <ul className="symbionts__list">
        {SYMBIONTS.map((def) => (
          <SymbiontCard key={def.id} def={def} row={byId.get(def.id)} onUpgrade={onUpgrade} />
        ))}
      </ul>

      <p className="symbionts__footer">
        Seed Fragments {fragments}/{SEED_FRAGMENTS_PER_SEED}
        {nuts > 0 && ` · ${nuts} nut${nuts === 1 ? '' : 's'} buried for next session`}
      </p>
    </aside>
  );
}
