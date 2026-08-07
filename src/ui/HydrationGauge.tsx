import { useId, useState } from 'react';
import { HYDRATION_MAX, HYDRATION_MIN, WATER_NEED_PER_LEAF } from '../content/hydration';
import { formatNumber } from '../engine/format';
import type { HydrationSnapshot } from '../engine/types';
import { Tooltip } from './Tooltip';
import { useGameStore } from './useGameStore';
import './HydrationGauge.css';

/**
 * The droplet gauge: how well the roots are supplying the canopy.
 *
 * Hydration is the one number in the HUD that is not a resource — it is a
 * *multiplier*, and an invisible one, so it gets a shape rather than a chip. The
 * droplet fills toward the ceiling and carries a tick at the break-even mark, so
 * "am I under- or over-watered" is answerable at a glance and the tooltip is
 * there for the arithmetic behind it.
 */

/** Teardrop outline: a point at the top opening into a round belly. */
const DROP_PATH = 'M12 2 C12 2 3.5 13 3.5 19.5 a8.5 8.5 0 0 0 17 0 C20.5 13 12 2 12 2 Z';

/** Top and bottom of the droplet within the 24×32 viewBox. */
const DROP_TOP = 2;
const DROP_BOTTOM = 28;

/** How the canopy is doing, which is what the gauge is colored by. */
type HydrationMood = 'parched' | 'thirsty' | 'steady' | 'overcharged';

function moodOf(value: number): HydrationMood {
  if (value <= HYDRATION_MIN) return 'parched';
  if (value < 1) return 'thirsty';
  if (value < HYDRATION_MAX) return 'steady';
  return 'overcharged';
}

const MOOD_LABEL: Record<HydrationMood, string> = {
  parched: 'Parched',
  thirsty: 'Thirsty',
  steady: 'Watered',
  overcharged: 'Overcharged',
};

/** Where a hydration value sits in the droplet, as a `[0, 1]` fill fraction. */
function hydrationFill(value: number): number {
  return Math.min(1, Math.max(0, value / HYDRATION_MAX));
}

/** Viewbox y of a fill fraction. */
function fillY(fraction: number): number {
  return DROP_BOTTOM - fraction * (DROP_BOTTOM - DROP_TOP);
}

/** The tooltip body: the whole hydration sum, written out. */
function HydrationTooltip({ hydration }: { readonly hydration: HydrationSnapshot }) {
  const clampedLow = hydration.ratio < HYDRATION_MIN;
  const clampedHigh = hydration.ratio > HYDRATION_MAX;

  return (
    <>
      <p className="tooltip__title">Hydration ×{hydration.value.toFixed(2)}</p>
      <p className="tooltip__desc">
        The roots water the canopy. Light, and the Sap a tap is worth, are both multiplied by this.
      </p>

      <dl>
        <div className="tooltip__row">
          <dt>Roots draw</dt>
          <dd className="tooltip__gain">{formatNumber(hydration.income)} Water/s</dd>
        </div>
        <div className="tooltip__row">
          <dt>
            Canopy wants
            <span className="tooltip__note"> ×{hydration.leaves}</span>
          </dt>
          <dd>{formatNumber(hydration.need)} Water/s</dd>
        </div>
        <div className="tooltip__row">
          <dt>Supply ÷ need</dt>
          <dd>{hydration.need.lte(0) ? '—' : hydration.ratio.toFixed(2)}</dd>
        </div>
        <div className="tooltip__row">
          <dt>Applied</dt>
          <dd className={clampedLow ? 'tooltip__short' : 'tooltip__gain'}>
            ×{hydration.value.toFixed(2)}
          </dd>
        </div>
      </dl>

      <p className="tooltip__hint">Every leaf cluster wants {WATER_NEED_PER_LEAF} Water/s.</p>

      {clampedLow && (
        <p className="tooltip__hint">
          Floored at ×{HYDRATION_MIN}. Grow roots — the canopy is running dry.
        </p>
      )}
      {clampedHigh && (
        <p className="tooltip__hint">
          Capped at ×{HYDRATION_MAX}. The surplus Water is going spare — grow more canopy.
        </p>
      )}
      {hydration.need.lte(0) && (
        <p className="tooltip__hint">Nothing is drinking yet. Grow a leaf cluster.</p>
      )}
    </>
  );
}

/** Droplet gauge + the tooltip explaining the maths behind it. */
export function HydrationGauge() {
  const hydration = useGameStore((s) => s.snapshot.hydration);
  const clipId = useId();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const mood = moodOf(hydration.value);
  const fill = hydrationFill(hydration.value);

  return (
    <div
      className={`hydration hydration--${mood}`}
      onPointerMove={(event) => setCursor({ x: event.clientX, y: event.clientY })}
      onPointerLeave={() => setCursor(null)}
    >
      <svg
        className="hydration__drop"
        viewBox="0 0 24 32"
        role="img"
        aria-label={`Hydration ${hydration.value.toFixed(2)} times canopy output — ${MOOD_LABEL[mood]}`}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={DROP_PATH} />
          </clipPath>
        </defs>
        <path className="hydration__drop-bed" d={DROP_PATH} />
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y={fillY(fill)} width="24" height={32} className="hydration__drop-fill" />
        </g>
        {/* Break-even tick: the level at which supply exactly meets demand. */}
        <line
          className="hydration__drop-mark"
          x1="4"
          x2="20"
          y1={fillY(hydrationFill(1))}
          y2={fillY(hydrationFill(1))}
        />
        <path className="hydration__drop-outline" d={DROP_PATH} />
      </svg>

      <span className="hydration__value">×{hydration.value.toFixed(2)}</span>

      <Tooltip
        content={cursor ? <HydrationTooltip hydration={hydration} /> : null}
        x={cursor?.x ?? 0}
        y={cursor?.y ?? 0}
      />
    </div>
  );
}
