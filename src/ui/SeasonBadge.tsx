import { useState } from 'react';
import { RING_PRODUCTION_BONUS } from '../content/balance';
import { SEASONS, SEASON_BY_ID } from '../content/seasons';
import { Tooltip } from './Tooltip';
import { useGameStore } from './useGameStore';
import './SeasonBadge.css';
import { t } from './i18n';

/**
 * Where the year is, as a HUD chip — and what the tree has to show for the years
 * behind it.
 *
 * The season is the widest standing condition in the game: it moves every price
 * and every leaf's output, and it does it without the player having pressed
 * anything. A canopy quietly earning 40% less because it is February is exactly
 * the kind of thing that reads as a bug, so the badge says which season it is,
 * what that season is doing, and how long is left of it.
 *
 * The rings are the other half. A ring cannot be bought — only outlasted — so it
 * is drawn as what it is: the cross-section of a trunk, one ring per winter come
 * through.
 */

/** Most rings drawn before the badge gives up and just counts them. */
export const RING_BADGE_MAX = 5;

/** Minutes and seconds, or hours and minutes once there are hours of it. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(whole % 60).padStart(2, '0')}s`;
}

/** The trunk in cross-section: one ring per winter survived. */
function Rings({ rings }: { readonly rings: number }) {
  const drawn = Math.min(RING_BADGE_MAX, rings);

  return (
    <svg className="season__rings" viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle className="season__ring season__ring--core" cx="12" cy="12" r="2.5" />
      {Array.from({ length: drawn }, (_, i) => (
        <circle key={i} className="season__ring" cx="12" cy="12" r={4.5 + i * 1.9} />
      ))}
    </svg>
  );
}

export function SeasonBadge() {
  const season = useGameStore((s) => s.snapshot.season);
  const rings = useGameStore((s) => s.snapshot.rings);
  const ringMultiplier = useGameStore((s) => s.snapshot.ringMultiplier);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const def = SEASON_BY_ID[season.id];
  const next = SEASONS[(season.ordinal + 1) % SEASONS.length];

  return (
    <div
      className={`season season--${season.id}`}
      onPointerMove={(event) => setCursor({ x: event.clientX, y: event.clientY })}
      onPointerLeave={() => setCursor(null)}
    >
      <span className="season__glyph" aria-hidden>
        {def.glyph}
      </span>
      <span
        className="season__value"
        role="img"
        aria-label={t('season.badge', { season: def.label, day: season.day, days: season.days })}
      >
        {def.label} <b>{season.day}</b>/{season.days}
      </span>
      {rings > 0 && (
        <span className="season__ringbadge" aria-label={t('season.ringBadge', { count: rings })}>
          <Rings rings={rings} />
          <span className="season__ringcount">{rings}</span>
        </span>
      )}

      <Tooltip
        content={
          cursor ? (
            <>
              <p className="tooltip__title">
                {def.glyph} {t('season.title', { season: def.label, year: season.year + 1 })}
              </p>
              <p className="tooltip__desc">{def.flavor}</p>

              <dl>
                <div className="tooltip__row">
                  <dt>{t('season.thisSeason')}</dt>
                  <dd className={season.id === 'winter' ? 'tooltip__short' : 'tooltip__gain'}>
                    {def.effectLabel}
                  </dd>
                </div>
                <div className="tooltip__row">
                  <dt>{t('season.nextIn', { season: next.label })}</dt>
                  <dd>{clock(season.secondsRemaining)}</dd>
                </div>
                <div className="tooltip__row">
                  <dt>{t('season.rings')}</dt>
                  <dd className={rings > 0 ? 'tooltip__gain' : undefined}>
                    {t('season.ringValue', {
                      count: rings,
                      multiplier: ringMultiplier.toFixed(2),
                    })}
                  </dd>
                </div>
              </dl>

              <p className="tooltip__hint">
                {season.id === 'winter'
                  ? t('season.winterHint', {
                      multiplier: (1 + RING_PRODUCTION_BONUS).toFixed(2),
                    })
                  : t('season.ringHint')}
              </p>
            </>
          ) : null
        }
        x={cursor?.x ?? 0}
        y={cursor?.y ?? 0}
      />
    </div>
  );
}
