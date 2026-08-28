import { GROWTH_RULE_BY_TYPE, type TreeNodeType } from '../content/growth';
import { LATERAL_SURGE_DURATION_SECONDS, LATERAL_SURGE_GROWTH_DISCOUNT } from '../content/buffs';
import { PRUNE_REFUND_FRACTION } from '../content/prune';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import type { PruneQuote } from '../engine/prune';
import { t } from './i18n';

/**
 * What a cut would take and what it would give: the prune-mode tooltip.
 *
 * Every number here comes from the same {@link PruneQuote} the engine executes
 * against, so nothing shown can drift from what the cut actually pays. The parts
 * list is spelled out because the marked subtree can run off the top of the
 * screen — "one branch" and "one branch, four twigs and nine leaves" are very
 * different decisions and the highlight alone will not always say which it is.
 */
export interface PruneTooltipProps {
  readonly quote: PruneQuote;
}

/** "1 Branch · 3 Leaf Clusters" — what is actually coming off. */
function partsLine(byType: PruneTooltipProps['quote']['byType']): string {
  return (Object.entries(byType) as [TreeNodeType, number][])
    .map(([type, count]) => {
      const label = GROWTH_RULE_BY_TYPE[type].label;
      return `${count} ${label}${count === 1 ? '' : 's'}`;
    })
    .join(' · ');
}

export function PruneTooltip({ quote }: PruneTooltipProps) {
  return (
    <>
      <p className="tooltip__title">{t('prune.title')}</p>
      <p className="tooltip__desc">{partsLine(quote.byType)}</p>

      <dl>
        {quote.refunds.map((refund) => (
          <div className="tooltip__row" key={refund.resource}>
            <dt>
              {t('prune.refund')}
              <span className="tooltip__note">
                {t('prune.refundShare', { percent: Math.round(PRUNE_REFUND_FRACTION * 100) })}
              </span>
            </dt>
            <dd className="tooltip__gain">
              +{formatNumber(refund.amount)} {RESOURCE_BY_ID[refund.resource].label}
            </dd>
          </div>
        ))}

        <div className="tooltip__row">
          <dt>{t('prune.deadwood')}</dt>
          <dd className="tooltip__gain">+{formatNumber(quote.deadwood)}</dd>
        </div>

        <div className="tooltip__row">
          <dt>{t('prune.partsLost')}</dt>
          <dd>{quote.nodeIds.length}</dd>
        </div>
      </dl>

      {quote.apical ? (
        <p className="tooltip__hint">
          {t('prune.apical', {
            seconds: LATERAL_SURGE_DURATION_SECONDS,
            discount: Math.round(LATERAL_SURGE_GROWTH_DISCOUNT * 100),
          })}
        </p>
      ) : (
        <p className="tooltip__hint">{t('prune.notApical')}</p>
      )}
    </>
  );
}
