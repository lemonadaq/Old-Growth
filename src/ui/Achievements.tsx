import { memo } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../content/achievements';
import { ACHIEVEMENT_BONUS } from '../content/balance';
import { formatNumber } from '../engine/format';
import Decimal from 'break_infinity.js';
import { t } from './i18n';
import { useGameStore } from './useGameStore';
import './Achievements.css';

/**
 * The Journal's third tab: thirty things to have done.
 *
 * Every row is shown, earned or not, with what it asks for and how far along
 * the run is. Nothing is hidden behind a "???" — an achievement list that will
 * not say what it wants is a list you cannot play toward, and this game already
 * has one place for surprises (the hybrid grid) where the surprise is the
 * point.
 *
 * Ten of them pay `+1%` on everything the tree makes. Small on purpose: a badge
 * is a record of something you did, and one worth chasing for its number would
 * turn the page into a checklist.
 */

/** `12 / 25`, or `1.2K / 10K` once the numbers stop being countable. */
function tally(have: number, need: number): string {
  const big = need >= 1000;
  const show = (value: number) => (big ? formatNumber(new Decimal(value)) : Math.floor(value));
  return `${show(Math.min(have, need))} / ${show(need)}`;
}

function AchievementsPanel() {
  const rows = useGameStore((s) => s.snapshot.achievements);
  const stats = useGameStore((s) => s.snapshot.stats);
  const byId = new Map(rows.map((row) => [row.id, row]));

  return (
    <div className="badges">
      <p className="badges__lede">
        {t('badges.summary', {
          earned: stats.achievementsEarned,
          total: stats.achievementsTotal,
          bonus: Math.round((stats.achievementMultiplier - 1) * 100),
        })}
      </p>

      {ACHIEVEMENT_CATEGORIES.map((category) => {
        const inCategory = ACHIEVEMENTS.filter((def) => def.category === category.id);
        return (
          <section key={category.id}>
            <h3 className="journal__heading">
              {category.label}{' '}
              <span className="journal__count">
                {inCategory.filter((def) => byId.get(def.id)?.earned).length}/{inCategory.length}
              </span>
            </h3>
            <ul className="journal__grid">
              {inCategory.map((def) => {
                const row = byId.get(def.id);
                const earned = row?.earned ?? false;
                return (
                  <li
                    key={def.id}
                    className={`journal__card badge${earned ? ' badge--earned' : ''}`}
                  >
                    <p className="journal__name">
                      <span aria-hidden>{earned ? def.glyph : '·'}</span> {def.name}
                      {def.bonus !== undefined && (
                        <span
                          className="badge__bonus"
                          title={t('badges.bonusTitle', {
                            percent: Math.round(ACHIEVEMENT_BONUS * 100),
                          })}
                        >
                          {t('badges.bonus', { percent: Math.round(def.bonus * 100) })}
                        </span>
                      )}
                    </p>
                    <p className="journal__flavor">{def.description}</p>
                    {!earned && row && (
                      <p className="badge__progress">
                        {tally(row.have, row.need)}
                        <span className="journal__bar" aria-hidden>
                          <span style={{ width: `${Math.round(row.fraction * 100)}%` }} />
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Memoised for the reason every panel is: `App` re-renders on every hover. */
export const Achievements = memo(AchievementsPanel);
