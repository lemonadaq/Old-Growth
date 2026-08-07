import { MAX_TOTEMS, TOTEMS, TOTEM_BY_ID } from '../content/totems';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { totemCost } from '../engine/totems';
import { useGameStore } from './useGameStore';
import './Workshop.css';

/**
 * The Workshop: where Deadwood becomes something.
 *
 * Pruning is only a real decision if the timber it makes is worth having, so
 * this panel is the other half of STEP 9 rather than a side feature. It is
 * deliberately tiny — three recipes, three slots, no tabs — and driven entirely
 * by the `TOTEMS` content list, so a new recipe is a data edit.
 *
 * The slots are shown *before* the recipes because scarcity is the mechanic:
 * what the player needs to know first is that there are only three.
 */
export interface WorkshopProps {
  readonly onCraft: (totemId: string) => void;
}

export function Workshop({ onCraft }: WorkshopProps) {
  const totems = useGameStore((s) => s.snapshot.totems);
  const deadwood = useGameStore((s) => s.snapshot.resources.deadwood);
  const full = totems.length >= MAX_TOTEMS;

  return (
    <aside className="workshop" aria-label="workshop">
      <h2 className="workshop__title">Workshop</h2>

      <p className="workshop__stock">
        <span aria-hidden>{RESOURCE_BY_ID.deadwood.glyph}</span>
        <b>{formatNumber(deadwood)}</b> Deadwood
      </p>

      <ol className="workshop__slots" aria-label={`totem slots, ${totems.length} of ${MAX_TOTEMS}`}>
        {Array.from({ length: MAX_TOTEMS }, (_, slot) => {
          const planted = totems[slot];
          const def = planted ? TOTEM_BY_ID[planted] : undefined;
          return (
            <li
              className={`workshop__slot${def ? ' workshop__slot--filled' : ''}`}
              key={slot}
              title={def ? def.name : 'Empty — carve a totem to plant one here'}
              style={def ? { borderColor: def.color } : undefined}
            >
              <span aria-hidden>{def ? def.glyph : '·'}</span>
            </li>
          );
        })}
      </ol>

      <ul className="workshop__list">
        {TOTEMS.map((def) => {
          const affordable = deadwood.gte(def.cost);
          const disabled = full || !affordable;

          return (
            <li key={def.id}>
              <button
                type="button"
                className="totem"
                disabled={disabled}
                onClick={() => onCraft(def.id)}
                title={def.description}
                style={{ borderLeftColor: def.color }}
              >
                <span className="totem__name">
                  <span aria-hidden>{def.glyph}</span> {def.name}
                </span>
                <span className="totem__desc">{def.description}</span>
                <span className="totem__cost">
                  {full ? 'No room at the base' : `${formatNumber(totemCost(def))} Deadwood`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="workshop__hint">
        Carved totems are permanent. Prune a limb (P) to make Deadwood.
      </p>
    </aside>
  );
}
