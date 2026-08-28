import { useState, memo } from 'react';
import { HYBRIDS } from '../content/hybrids';
import { SPECIES, type SpeciesTrait } from '../content/species';
import { Help } from './Help';
import { t } from './i18n';
import { useGameStore } from './useGameStore';
import './Journal.css';

/**
 * The Journal: everything the tree could be made of, and everything it can do.
 *
 * Two tabs. **Catalogue** is two grids — the six species, each with its traits
 * and, while it is still locked, the milestone that would unlock it; then the
 * fifteen hybrids, of which the undiscovered ones are drawn as silhouettes with a
 * single line of hint. Enough to make the grid feel like a map with blanks on it
 * rather than a list of things you do not have.
 *
 * **Help** (STEP 17) is the manual, in fiction. It exists because everything else
 * the game says about itself is said *once*, at the moment it becomes true — a
 * bubble that appears when the scissors arrive and never again. A player who
 * dismissed it, or who came back after a fortnight, needs somewhere to look, and
 * the answer to "where do I look" has to be one place rather than seven tooltips.
 *
 * Nothing here is a control. The Journal is where the game explains itself, and a
 * page you can only read is a page you can read while thinking about something
 * else.
 */

type Tab = 'catalogue' | 'help';

/** One trait line. Dormant traits are greyed and say what they are waiting for. */
function Trait({ trait }: { readonly trait: SpeciesTrait }) {
  return (
    <li className={`journal__trait${trait.dormant ? ' journal__trait--dormant' : ''}`}>
      {trait.label}
      {trait.dormant && <span className="journal__soon">{t('journal.dormant')}</span>}
    </li>
  );
}

function JournalPanel() {
  const species = useGameStore((s) => s.snapshot.species);
  const discovered = new Set(species.discovered);
  const counts = species.counts;
  const [tab, setTab] = useState<Tab>('catalogue');

  return (
    <aside className="journal" aria-label={t('journal.title')}>

      <div className="journal__tabs" role="tablist" aria-label={t('journal.sections')}>
        <button
          type="button"
          role="tab"
          className="journal__tab"
          aria-selected={tab === 'catalogue'}
          onClick={() => setTab('catalogue')}
        >
          {t('journal.catalogue')}
        </button>
        <button
          type="button"
          role="tab"
          className="journal__tab"
          aria-selected={tab === 'help'}
          onClick={() => setTab('help')}
        >
          {t('journal.help')}
        </button>
      </div>

      {tab === 'help' ? (
        <Help />
      ) : (
        <>
          <section>
            <h3 className="journal__heading">
              {t('journal.species')}{' '}
              <span className="journal__count">
                {species.unlocked.length}/{SPECIES.length}
              </span>
            </h3>
            <ul className="journal__grid">
              {SPECIES.map((def) => {
                const unlock = species.unlocks.find((u) => u.id === def.id);
                const unlocked = unlock?.unlocked ?? false;
                const owned = counts.get(def.id) ?? 0;

                return (
                  <li
                    key={def.id}
                    className={`journal__card${unlocked ? '' : ' journal__card--locked'}${
                      species.planting === def.id ? ' journal__card--planting' : ''
                    }`}
                    style={{ borderLeftColor: def.palette.bark }}
                  >
                    <p className="journal__name">
                      <span aria-hidden>{def.glyph}</span> {def.name}
                      {owned > 0 && (
                        <span className="journal__owned">{t('journal.parts', { count: owned })}</span>
                      )}
                    </p>
                    <p className="journal__flavor">{def.flavor}</p>
                    <ul className="journal__traits">
                      {def.traits.map((trait, i) => (
                        <Trait key={i} trait={trait} />
                      ))}
                    </ul>
                    {!unlocked && unlock && (
                      <p className="journal__locked">
                        🔒 {unlock.hint}
                        <span className="journal__bar" aria-hidden>
                          <span style={{ width: `${Math.round(unlock.fraction * 100)}%` }} />
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="journal__heading">
              {t('journal.hybrids')}{' '}
              <span className="journal__count">
                {discovered.size}/{HYBRIDS.length}
              </span>
            </h3>
            <ul className="journal__grid">
              {HYBRIDS.map((def) => {
                const found = discovered.has(def.id);
                const owned = counts.get(def.id) ?? 0;

                // A silhouette still names its parents: the table is deterministic,
                // so a player who reads the grid can go and *make* the one they want
                // rather than grafting at random until something happens.
                return (
                  <li
                    key={def.id}
                    className={`journal__card${found ? '' : ' journal__card--silhouette'}`}
                    style={found ? { borderLeftColor: def.palette.bark } : undefined}
                  >
                    <p className="journal__name">
                      <span aria-hidden>{found ? def.glyph : '◈'}</span>{' '}
                      {found ? def.name : t('journal.undiscovered')}
                      {owned > 0 && (
                        <span className="journal__owned">{t('journal.parts', { count: owned })}</span>
                      )}
                    </p>
                    <p className="journal__parents">
                      {def.parents[0]} × {def.parents[1]}
                    </p>
                    {found ? (
                      <>
                        <p className="journal__flavor">{def.flavor}</p>
                        <ul className="journal__traits">
                          {def.traits.map((trait, i) => (
                            <Trait key={i} trait={trait} />
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="journal__hint">{def.hint}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="journal__footer">
            {species.grafts === 1
              ? t('journal.footerOne')
              : t('journal.footer', { count: species.grafts })}
          </p>
        </>
      )}
    </aside>
  );
}

/**
 * Memoised because `App` re-renders far more often than the Journal's contents
 * change — a pointer move over the canvas updates hover state sixty times a
 * second, and this panel rebuilds the whole species and hybrid grid each time
 * it renders. It takes no props at all, so the comparison always holds; its own
 * store subscription still re-renders it when a discovery lands.
 */
export const Journal = memo(JournalPanel);
