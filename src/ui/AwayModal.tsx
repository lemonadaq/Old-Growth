import { useEffect, useRef, useState } from 'react';
import { COLLECT_COUNT_UP_MS } from '../content/offline';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { formatDuration, type OfflineReport } from '../engine/offline';
import './AwayModal.css';

/**
 * "While you were away".
 *
 * The one modal in the game, and it earns the interruption: it is the only place
 * the player learns what the tree did without them, and a HUD that had silently
 * grown by four hours of Water would read as a bug.
 *
 * The gains are **already in the balances** — the simulation ran, and holding
 * numbers back from their own systems to hand over on a button would be a second
 * source of truth. What Collect animates is the *count-up*: each row runs from
 * zero to its total over {@link COLLECT_COUNT_UP_MS}, and the modal clears when
 * it lands. Nothing is riding on the button but the ceremony, which is why it can
 * be skipped by pressing it again.
 */
export interface AwayModalProps {
  readonly report: OfflineReport;
  readonly onCollect: () => void;
}

/** Eased progress of the count-up, in `[0, 1]`. */
function easeOut(t: number): number {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

export function AwayModal({ report, onCollect }: AwayModalProps) {
  const [progress, setProgress] = useState(0);
  const [counting, setCounting] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    if (!counting) return;

    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / COLLECT_COUNT_UP_MS);
      setProgress(easeOut(t));
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        onCollect();
      }
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [counting, onCollect]);

  const collect = () => {
    // A second press is "yes, I have read it" — the count-up is a flourish, and
    // one nobody should have to sit through twice.
    if (counting) onCollect();
    else setCounting(true);
  };

  return (
    <div className="away" role="dialog" aria-modal="true" aria-label="while you were away">
      <div className="away__card">
        <h2 className="away__title">While you were away</h2>
        <p className="away__duration">
          {formatDuration(report.plan.simulatedSeconds)} of growing
          {report.plan.capped && (
            <span className="away__capped">
              {' '}
              — you were gone {formatDuration(report.plan.elapsedSeconds)}, and the tree can only
              carry on for so long alone
            </span>
          )}
        </p>

        {report.gains.length > 0 ? (
          <ul className="away__gains">
            {report.gains.map((gain) => {
              const def = RESOURCE_BY_ID[gain.resource];
              const shown = counting ? gain.amount.mul(progress) : gain.amount.mul(0);
              return (
                <li className="away__gain" key={gain.resource} style={{ borderColor: def.color }}>
                  <span className="away__glyph" aria-hidden>
                    {def.glyph}
                  </span>
                  <span className="away__label">{def.label}</span>
                  <span className="away__amount">+{formatNumber(shown)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="away__quiet">
            The tree held its ground. Grow some roots and they will keep working while you are gone.
          </p>
        )}

        {report.notes.length > 0 && (
          <ul className="away__notes">
            {report.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}

        <button type="button" className="away__collect" onClick={collect} autoFocus>
          {counting ? 'Skip' : 'Collect'}
        </button>
      </div>
    </div>
  );
}
