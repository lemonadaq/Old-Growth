import type Decimal from 'break_infinity.js';
import { formatNumber } from '../engine/format';
import { RESOURCES, type ResourceDef } from '../content/resources';
import { useTweenedDecimal } from './tween';
import { BuffBar } from './BuffBar';
import { t } from './i18n';
import { Hint } from './Hint';
import { DaylightGauge } from './DaylightGauge';
import { HydrationGauge } from './HydrationGauge';
import { SeasonBadge } from './SeasonBadge';
import { WeatherBanner } from './WeatherBanner';
import { useGameStore } from './useGameStore';
import './Hud.css';

/** Small debug readout: FPS / TPS sampled by the game loop. */
function DebugCounter() {
  const stats = useGameStore((s) => s.stats);
  return (
    <div className="hud-debug" role="status" aria-label={t('hud.performance')}>
      <span>
        {t('hud.fps')} <b>{stats.fps}</b>
      </span>
      <span>
        {t('hud.tps')} <b>{stats.tps}</b>
      </span>
    </div>
  );
}

/**
 * One resource row.
 *
 * A component of its own purely so each resource can hold its own tween — hooks
 * cannot be called in a loop over a list, and seven counters easing
 * independently is the entire point.
 */
function ResourceRow({
  def,
  amount,
  rate,
  tween,
}: {
  readonly def: ResourceDef;
  readonly amount: Decimal;
  readonly rate: Decimal;
  readonly tween: boolean;
}) {
  const shown = useTweenedDecimal(amount, tween);
  return (
    <div
      className="hud-resource"
      style={{ borderColor: def.color }}
      // The clipped label and rate are still in the accessibility tree on a
      // phone, but they read as three loose fragments; this states the chip as
      // one sentence instead.
      aria-label={t('hud.resourceRate', {
        amount: formatNumber(amount),
        resource: def.label,
        rate: formatNumber(rate),
      })}
    >
      <span className="hud-resource__glyph" aria-hidden>
        {def.glyph}
      </span>
      <span className="hud-resource__label">{def.label}</span>
      {/*
        The tweened figure is decoration over an exact one: the rounded value a
        player reads is on its way to the truth, so the truth is what goes to a
        screen reader and to the hover title.
      */}
      <span className="hud-resource__value" title={formatNumber(amount)}>
        {formatNumber(shown)}
      </span>
      <span className="hud-resource__rate" aria-hidden>
        {t('hud.perSecond', { rate: formatNumber(rate) })}
      </span>
    </div>
  );
}

/** Resource totals + live per-second rates, driven by the content resource list. */
function ResourceReadout({ tween }: { readonly tween: boolean }) {
  const resources = useGameStore((s) => s.snapshot.resources);
  const perSecond = useGameStore((s) => s.snapshot.perSecond);
  return (
    <div className="hud-resources" role="list" aria-label={t('hud.resources')}>
      {RESOURCES.map((def) => (
        <ResourceRow
          key={def.id}
          def={def}
          amount={resources[def.id]}
          rate={perSecond[def.id]}
          tween={tween}
        />
      ))}
    </div>
  );
}

export interface HudProps {
  /** Whether the player has asked their system for less movement. */
  readonly reducedMotion: boolean;
  /** Whether the temporary debug producers are running. */
  readonly testProducers: boolean;
  /** Toggle the temporary debug producers. */
  readonly onToggleTestProducers: () => void;
  /** Mark a contextual hint as read, so it never shows again. */
  readonly onDismissHint: (id: string) => void;
}

/** React HUD overlay that sits above the full-screen canvas. */
export function Hud({
  reducedMotion,
  testProducers,
  onToggleTestProducers,
  onDismissHint,
}: HudProps) {
  const hint = useGameStore((s) => s.snapshot.progression.hint);

  return (
    <div className="hud">
      <header className="hud-header">
        <div className="hud-header__left">
          <h1 className="hud-title">{t('app.title')}</h1>
          <BuffBar />
        </div>
        <div className="hud-header__right">
          {/*
            The header keeps only what it *reads out* — the season, the sky, the
            hydration. Every control moved to the dock at the bottom of the
            screen (STEP 18): a row that had grown one button per step was
            competing with the canopy for the top of the window, and a thumb
            cannot reach it on a phone.
          */}
          <SeasonBadge />
          <DaylightGauge />
          <HydrationGauge />
          {/*
            The development instruments: a frame counter and a switch that pours
            a resource a second into everything. Both were how the engine was
            checked while it was being built, and neither is something a player
            should find in a released game — one is noise, the other is a cheat
            with a button. `import.meta.env.DEV` is a constant at build time, so
            the release bundle does not merely hide them, it does not contain
            them.
          */}
          {import.meta.env.DEV && (
            <>
              <button
                type="button"
                className="hud-toggle"
                aria-pressed={testProducers}
                onClick={onToggleTestProducers}
              >
                {testProducers ? t('hud.debugProducerOn') : t('hud.debugProducerOff')}
              </button>
              <DebugCounter />
            </>
          )}
        </div>
      </header>
      {/*
        The chips are a full-width row under the header, not a column beside the
        title. They used to run along the bottom edge, which was fine until the
        dock arrived underneath them (STEP 18) and the two started overlapping —
        and on a phone the bottom edge is the one place a tab bar has to own.
      */}
      <ResourceReadout tween={!reducedMotion} />
      <WeatherBanner />
      {/*
        One bubble, keyed by id so a second hint arriving replaces the first
        outright rather than inheriting its timer. It is the last thing in the
        HUD and absolutely positioned, so it can never move a control.
      */}
      {hint && <Hint key={hint.id} hint={hint} onDismiss={onDismissHint} />}
    </div>
  );
}
