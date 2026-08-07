import { BUFF_BY_ID } from '../content/buffs';
import { useGameStore } from './useGameStore';
import './BuffBar.css';

/**
 * Running buffs, with the time left on each.
 *
 * A buff that changes prices and payouts without saying so reads as the game
 * being inconsistent, so each one gets a badge with a bar that drains — and,
 * because Lateral Surge is *refreshable*, a bar that visibly jumps back to full
 * when a second cut renews it.
 *
 * Renders nothing at all when nothing is running: an empty slot in the HUD is
 * an invitation to wonder what belongs in it.
 */
export function BuffBar() {
  const buffs = useGameStore((s) => s.snapshot.buffs);
  if (buffs.length === 0) return null;

  return (
    <ul className="buffs" aria-label="active effects">
      {buffs.map((buff) => {
        const def = BUFF_BY_ID[buff.id];
        if (!def) return null;
        return (
          <li className="buff" key={buff.id} title={def.description}>
            <span className="buff__glyph" aria-hidden>
              {def.glyph}
            </span>
            <span className="buff__body">
              <span className="buff__name">{def.name}</span>
              <span className="buff__track">
                <span className="buff__fill" style={{ width: `${buff.fraction * 100}%` }} />
              </span>
            </span>
            <span className="buff__time">{Math.ceil(buff.remainingSeconds)}s</span>
          </li>
        );
      })}
    </ul>
  );
}
