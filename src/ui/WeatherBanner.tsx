import { WEATHER_BY_ID } from '../content/weather';
import { useGameStore } from './useGameStore';
import './WeatherBanner.css';

/**
 * What the sky is doing, and what it is about to do.
 *
 * Weather is the one system in the game that both *interrupts* and *asks for
 * something back* — a storm wants fifteen seconds of the player's hands — so it
 * gets the loudest piece of chrome on the screen, and it disappears completely
 * the moment the sky clears. An empty banner would be a permanent reminder that
 * nothing is happening.
 *
 * The countdown before an event is the whole of the design's "telegraphed 10s
 * ahead": the sky is already turning by the time this appears, and this is the
 * part that says *what* is turning it.
 */
export function WeatherBanner() {
  const weather = useGameStore((s) => s.snapshot.weather);

  const pending = weather.pending;
  if (pending) {
    const def = WEATHER_BY_ID[pending.id];
    return (
      <div className="weather weather--pending" role="status" style={{ borderColor: def.color }}>
        <span className="weather__glyph" aria-hidden>
          {def.glyph}
        </span>
        <span className="weather__body">
          <span className="weather__name">{def.telegraph}</span>
          <span className="weather__effect">{def.effectLabel}</span>
        </span>
        <span className="weather__time">{Math.ceil(pending.inSeconds)}s</span>
      </div>
    );
  }

  const active = weather.active;
  if (!active) return null;

  const def = WEATHER_BY_ID[active.id];
  const storm = weather.storm;

  return (
    <div
      className={`weather${storm ? ' weather--storm' : ''}`}
      role="status"
      style={{ borderColor: def.color }}
    >
      <span className="weather__glyph" aria-hidden>
        {def.glyph}
      </span>
      <span className="weather__body">
        <span className="weather__name">
          {def.label}
          {storm && (
            <span className="weather__call"> — hold the trunk! Tap the anchor at the base.</span>
          )}
        </span>

        {storm ? (
          <>
            <span className="weather__track">
              <span
                className="weather__brace"
                style={{ width: `${Math.round(storm.brace * 100)}%` }}
              />
            </span>
            <span className="weather__effect">
              Braced {storm.taps}/{storm.target}
              {storm.brace >= 1 ? ' — held' : ''}
            </span>
          </>
        ) : (
          <>
            <span className="weather__track">
              <span
                className="weather__fill"
                style={{ width: `${Math.round(active.fraction * 100)}%`, background: def.color }}
              />
            </span>
            <span className="weather__effect">{def.effectLabel}</span>
          </>
        )}
      </span>
      <span className="weather__time">{Math.ceil(active.remainingSeconds)}s</span>
    </div>
  );
}
