import { memo } from 'react';
import { STAT_RESOURCES } from '../content/balance';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { t } from './i18n';
import { useGameStore } from './useGameStore';
import './Stats.css';

/**
 * The Journal's fourth tab: what this save has actually done.
 *
 * Every figure here is a *lifetime* one. The HUD says what the tree is worth
 * right now and the Vault says what it is worth to give up; this is the only
 * page that answers "how much of this have I done", which is the question a
 * player asks after the fourth prestige when the current tree is a seedling
 * again and the run they remember has been thrown away.
 *
 * Split in two for exactly that reason: the top half resets with the tree, the
 * bottom half never does.
 */

/** `2h 41m`, `18m`, `40s` — a duration a person would say out loud. */
function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return t('stats.seconds', { seconds: total });

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return t('stats.minutes', { minutes });

  return t('stats.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="stats__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatsPanel() {
  const stats = useGameStore((s) => s.snapshot.stats);
  const count = (value: number) => value.toLocaleString();

  return (
    <div className="stats">
      <section>
        <h3 className="journal__heading">{t('stats.earned')}</h3>
        <dl className="stats__list">
          {STAT_RESOURCES.map((id) => (
            <Row
              key={id}
              label={`${RESOURCE_BY_ID[id].glyph} ${RESOURCE_BY_ID[id].label}`}
              value={formatNumber(stats.lifetime[id])}
            />
          ))}
        </dl>
        <p className="stats__note">{t('stats.earnedNote')}</p>
      </section>

      <section>
        <h3 className="journal__heading">{t('stats.thisTree')}</h3>
        <dl className="stats__list">
          <Row label={t('stats.parts')} value={count(stats.parts)} />
          <Row label={t('stats.symbionts')} value={count(stats.symbionts)} />
          <Row label={t('stats.totems')} value={count(stats.totems)} />
          <Row label={t('stats.rings')} value={count(stats.rings)} />
        </dl>
      </section>

      <section>
        <h3 className="journal__heading">{t('stats.everDone')}</h3>
        <dl className="stats__list">
          <Row label={t('stats.clicks')} value={count(stats.clicks)} />
          <Row label={t('stats.prunes')} value={count(stats.prunes)} />
          <Row label={t('stats.grafts')} value={count(stats.grafts)} />
          <Row label={t('stats.discoveries')} value={count(stats.discoveries)} />
          <Row label={t('stats.stormsBraced')} value={count(stats.stormsBraced)} />
          <Row label={t('stats.trees')} value={count(stats.trees)} />
          <Row label={t('stats.heirlooms')} value={count(stats.heirloomLevels)} />
          <Row
            label={t('stats.badges')}
            value={t('stats.badgeTally', {
              earned: stats.achievementsEarned,
              total: stats.achievementsTotal,
              bonus: Math.round((stats.achievementMultiplier - 1) * 100),
            })}
          />
        </dl>
      </section>

      <section>
        <h3 className="journal__heading">{t('stats.time')}</h3>
        <dl className="stats__list">
          <Row label={t('stats.playtime')} value={duration(stats.playtimeSeconds)} />
          <Row label={t('stats.offline')} value={duration(stats.offlineSeconds)} />
        </dl>
        <p className="stats__note">{t('stats.timeNote')}</p>
      </section>
    </div>
  );
}

/** Memoised for the reason every panel is: `App` re-renders on every hover. */
export const Stats = memo(StatsPanel);
