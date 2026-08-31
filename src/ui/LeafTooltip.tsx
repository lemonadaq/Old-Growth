import {
  BLOSSOM_BOOST,
  BLOSSOM_BOOST_MAX_STACKS,
  EXPOSURE_MIN,
  SHADE_PER_OCCLUDER,
} from '../content/light';
import { formatNumber } from '../engine/format';
import type { LeafLight } from '../engine/types';
import { useGameStore } from './useGameStore';
import { t } from './i18n';

/**
 * What one leaf cluster on the tree is actually earning, and why.
 *
 * Shading is invisible until something says it out loud: a leaf in a thicket
 * looks exactly like a leaf in the open apart from its tint. This tooltip is
 * where the tint becomes a number, and where a crowded canopy names its own fix.
 */
export interface LeafTooltipProps {
  readonly nodeId: string;
}

/** Exposure as a percentage, which is how a multiplier under 1 reads best. */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function LeafTooltip({ nodeId }: LeafTooltipProps) {
  const leaf = useGameStore((s) => s.snapshot.leafLight.get(nodeId)) as LeafLight | undefined;
  const lightFactor = useGameStore((s) => s.snapshot.lightFactor);
  const phase = useGameStore((s) => s.snapshot.day.phase);

  if (!leaf) return null;

  const floored = leaf.shade <= EXPOSURE_MIN;

  return (
    <>
      <p className="tooltip__title">{t('leaf.title')}</p>
      <p className="tooltip__desc">{t('leaf.desc')}</p>

      <dl>
        <div className="tooltip__row">
          <dt>{t('leaf.exposure')}</dt>
          <dd className={leaf.exposure < 1 ? 'tooltip__short' : 'tooltip__gain'}>
            {percent(leaf.exposure)}
          </dd>
        </div>

        <div className="tooltip__row">
          <dt>
            {t('leaf.shadedBy')}
            <span className="tooltip__note">
              {t('leaf.shadeEach', { percent: percent(SHADE_PER_OCCLUDER) })}
            </span>
          </dt>
          <dd className={leaf.occluders > 0 ? 'tooltip__short' : undefined}>
            {leaf.occluders === 1
              ? t('leaf.oneCluster')
              : t('leaf.clusters', { count: leaf.occluders })}
          </dd>
        </div>

        {leaf.blossoms > 0 && (
          <div className="tooltip__row">
            <dt>
              {t('leaf.blossoms')}
              <span className="tooltip__note">
                {t('leaf.blossomEach', { percent: percent(BLOSSOM_BOOST) })}
              </span>
            </dt>
            <dd className="tooltip__gain">×{leaf.boost.toFixed(2)}</dd>
          </div>
        )}

        <div className="tooltip__row">
          <dt>
            {t('leaf.daylight')}
            <span className="tooltip__note"> {phase}</span>
          </dt>
          <dd>×{lightFactor.toFixed(2)}</dd>
        </div>

        <div className="tooltip__row">
          <dt>{t('leaf.produces')}</dt>
          <dd className={leaf.rate.lte(0) ? 'tooltip__short' : 'tooltip__gain'}>
            {t('leaf.lightRate', { amount: formatNumber(leaf.rate) })}
          </dd>
        </div>
      </dl>

      {leaf.occluders > 0 && (
        <p className="tooltip__hint">{floored ? t('leaf.buried') : t('leaf.crowded')}</p>
      )}
      {leaf.blossoms >= BLOSSOM_BOOST_MAX_STACKS && (
        <p className="tooltip__hint">{t('leaf.blossomCap', { count: BLOSSOM_BOOST_MAX_STACKS })}</p>
      )}
    </>
  );
}
