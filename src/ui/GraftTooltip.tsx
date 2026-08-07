import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { GRAFT_REFUSAL_TEXT, type GraftAssessment } from '../engine/graft';
import { speciesOrStarter } from '../engine/species';
import { useGameStore } from './useGameStore';

/**
 * Tooltip body for graft mode: what the pair under the pointer would make, or
 * the single reason it would not.
 *
 * A refusal is a sentence, never a greyed-out silence — the adjacency and
 * maturity rules are the least guessable thing in the game, and a player who
 * cannot graft deserves to be told which of the four conditions they missed.
 */
export interface GraftTooltipProps {
  readonly assessment: GraftAssessment;
}

export function GraftTooltip({ assessment }: GraftTooltipProps) {
  const resources = useGameStore((s) => s.snapshot.resources);

  if (!assessment.ok) {
    return (
      <>
        <p className="tooltip__title">No graft here</p>
        <p className="tooltip__desc">{GRAFT_REFUSAL_TEXT[assessment.reason]}</p>
      </>
    );
  }

  const { hybrid } = assessment;
  const parents = hybrid.parents.map((id) => speciesOrStarter(id).name).join(' × ');

  return (
    <>
      <p className="tooltip__title">
        {hybrid.glyph} {assessment.firstDiscovery ? 'Something new' : hybrid.name}
      </p>
      <p className="tooltip__desc">
        {parents}
        {assessment.firstDiscovery ? '' : ` — ${hybrid.flavor}`}
      </p>

      <dl>
        {assessment.costs.map((line) => {
          const def = RESOURCE_BY_ID[line.resource];
          const short = resources[line.resource].lt(line.amount);
          return (
            <div className="tooltip__row" key={line.resource}>
              <dt>{def.label}</dt>
              <dd className={short ? 'tooltip__short' : undefined}>
                {formatNumber(line.amount)}
                {short && ` — short by ${formatNumber(line.amount.sub(resources[line.resource]))}`}
              </dd>
            </div>
          );
        })}
        <div className="tooltip__row">
          <dt>Becomes</dt>
          <dd className="tooltip__gain">
            {assessment.affected.length} part{assessment.affected.length === 1 ? '' : 's'}
          </dd>
        </div>
      </dl>

      {!assessment.firstDiscovery &&
        hybrid.traits.map((trait, i) => (
          <p className="tooltip__hint" key={i}>
            {trait.label}
          </p>
        ))}

      {assessment.firstDiscovery && (
        <p className="tooltip__hint">
          Nobody has grown this before. Graft it to find out what it does.
        </p>
      )}
    </>
  );
}
