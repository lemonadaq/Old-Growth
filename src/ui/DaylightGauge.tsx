import { useState } from 'react';
import { DAY_LENGTH_SECONDS, type DayPhase } from '../content/daylight';
import { MOONLIGHT_FRACTION } from '../content/light';
import { Tooltip } from './Tooltip';
import { useGameStore } from './useGameStore';
import './DaylightGauge.css';
import { t } from './i18n';

/**
 * The sky's contribution to the canopy, as a HUD chip.
 *
 * Light halving over the course of an afternoon and then collapsing at dusk is
 * alarming if nothing accounts for it. This says which hour it is and what that
 * hour is worth, so a falling Light/s reads as *nightfall* rather than as
 * something the player broke.
 */

const PHASE_LABEL: Record<DayPhase, string> = {
  dawn: 'Dawn',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
};

/** A sun for the lit phases, a moon once it is properly dark. */
const PHASE_GLYPH: Record<DayPhase, string> = {
  dawn: '🌅',
  day: '☀️',
  dusk: '🌇',
  night: '🌙',
};

/** Minutes and seconds left of the current day. */
function remaining(t: number): string {
  const seconds = Math.max(0, Math.round((1 - t) * DAY_LENGTH_SECONDS));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function DaylightGauge() {
  const day = useGameStore((s) => s.snapshot.day);
  const lightFactor = useGameStore((s) => s.snapshot.lightFactor);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const moonlit = lightFactor <= MOONLIGHT_FRACTION;

  return (
    <div
      className={`daylight${moonlit ? ' daylight--night' : ''}`}
      onPointerMove={(event) => setCursor({ x: event.clientX, y: event.clientY })}
      onPointerLeave={() => setCursor(null)}
    >
      <span className="daylight__glyph" aria-hidden>
        {PHASE_GLYPH[day.phase]}
      </span>
      <span
        className="daylight__value"
        role="img"
        aria-label={t('daylight.badge', {
          phase: PHASE_LABEL[day.phase],
          factor: lightFactor.toFixed(2),
        })}
      >
        ×{lightFactor.toFixed(2)}
      </span>

      <Tooltip
        content={
          cursor ? (
            <>
              <p className="tooltip__title">
                {t('daylight.title', {
                  phase: PHASE_LABEL[day.phase],
                  day: day.dayNumber + 1,
                })}
              </p>
              <p className="tooltip__desc">{t('daylight.desc')}</p>

              <dl>
                <div className="tooltip__row">
                  <dt>{t('daylight.light')}</dt>
                  <dd className={moonlit ? 'tooltip__short' : 'tooltip__gain'}>
                    ×{lightFactor.toFixed(2)}
                  </dd>
                </div>
                <div className="tooltip__row">
                  <dt>{t('daylight.endsIn')}</dt>
                  <dd>{remaining(day.t)}</dd>
                </div>
              </dl>

              {moonlit ? (
                <p className="tooltip__hint">
                  {t('daylight.moonlit', { fraction: MOONLIGHT_FRACTION })}
                </p>
              ) : (
                <p className="tooltip__hint">{t('daylight.dewHint')}</p>
              )}
            </>
          ) : null
        }
        x={cursor?.x ?? 0}
        y={cursor?.y ?? 0}
      />
    </div>
  );
}
