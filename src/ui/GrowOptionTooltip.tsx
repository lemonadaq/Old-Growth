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
            <dd className="tooltip__gain">
              +{formatNumber(priced.production.rate)} {produced.label}/s
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

      {!priced.production && (
        <p className="tooltip__hint">Structural — grow leaves or roots on it to produce.</p>
      )}
    </>
  );
}
