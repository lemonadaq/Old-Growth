import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import type { PricedGrowthOption } from '../engine/growth';

/**
 * Tooltip body for one option in the radial grow menu: what the part is, what
 * it costs, and what it will actually add to production.
 *
 * The production line quotes the *modified* rate — the delta the player will
 * watch appear in the HUD — not the part's base rate.
 */
export interface GrowOptionTooltipProps {
  readonly priced: PricedGrowthOption;
}

export function GrowOptionTooltip({ priced }: GrowOptionTooltipProps) {
  const currency = RESOURCE_BY_ID[priced.costResource];
  const produced = priced.production ? RESOURCE_BY_ID[priced.production.resource] : null;

  return (
    <>
      <p className="tooltip__title">{priced.rule.label}</p>
      <p className="tooltip__desc">{priced.rule.description}</p>

      <dl>
        <div className="tooltip__row">
          <dt>Cost</dt>
          <dd>
            {formatNumber(priced.cost)} {currency.label}
          </dd>
        </div>

        {priced.production && produced && (
          <div className="tooltip__row">
            <dt>Produces</dt>
            <dd className={priced.production.rate.lte(0) ? 'tooltip__short' : 'tooltip__gain'}>
              +{formatNumber(priced.production.rate)} {produced.label}/s
            </dd>
          </div>
        )}

        {priced.production?.stratum && priced.production.depth !== null && (
          <div className="tooltip__row">
            <dt>Depth</dt>
            <dd>
              {Math.round(priced.production.depth)}
              <span className="tooltip__note"> {priced.production.stratum.label}</span> ×
              {priced.production.depthMultiplier.toFixed(2)}
            </dd>
          </div>
        )}

        {priced.production?.vein && (
          <div className="tooltip__row">
            <dt>Mineral vein</dt>
            <dd className="tooltip__gain">×{priced.production.vein.richness.toFixed(2)}</dd>
          </div>
        )}

        {priced.production?.exposure !== null && priced.production?.exposure !== undefined && (
          <div className="tooltip__row">
            <dt>Sunlight here</dt>
            <dd className={priced.production.exposure < 1 ? 'tooltip__short' : 'tooltip__gain'}>
              {Math.round(priced.production.exposure * 100)}%
            </dd>
          </div>
        )}

        {!priced.affordable && (
          <div className="tooltip__row">
            <dt>Short by</dt>
            <dd className="tooltip__short">
              {formatNumber(priced.missing)} {currency.label}
            </dd>
          </div>
        )}
      </dl>

      {priced.production?.missingVein && (
        <p className="tooltip__hint">
          No vein here — this tip would find no Minerals. Try another root.
        </p>
      )}

      {priced.production?.exposure !== null &&
        priced.production?.exposure !== undefined &&
        priced.production.exposure < 1 && (
          <p className="tooltip__hint">
            Already shaded — the canopy above would take part of this leaf&apos;s light.
          </p>
        )}

      {!priced.production && (
        <p className="tooltip__hint">Structural — grow leaves or roots on it to produce.</p>
      )}
    </>
  );
}
