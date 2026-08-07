import { HYBRIDS } from '../content/hybrids';
import { SPECIES, type SpeciesTrait } from '../content/species';
import { useGameStore } from './useGameStore';
import './Journal.css';

/**
 * The Journal: everything the tree could be made of.
 *
 * Two grids. The six species, each with its traits and — while it is still
 * locked — the milestone that would unlock it. Then the fifteen hybrids, of
 * which the undiscovered ones are drawn as silhouettes with a single line of
 * hint: enough to make the grid feel like a map with blanks on it rather than a
 * list of things you do not have.
 *
 * Nothing here is a control. The Journal is where the game explains itself, and
 * a page you can only read is a page you can read while thinking about something
 * else.
 */

/** One trait line. Dormant traits are greyed and say what they are waiting for. */
function Trait({ trait }: { readonly trait: SpeciesTrait }) {
  return (
    <li className={`journal__trait${trait.dormant ? ' journal__trait--dormant' : ''}`}>
      {trait.label}
      {trait.dormant && <span className="journal__soon"> — once the seasons turn</span>}
    </li>
  );
}

export function Journal() {
  const species = useGameStore((s) => s.snapshot.species);
  const discovered = new Set(species.discovered);
  const counts = species.counts;

  return (
    <aside className="journal" aria-label="journal">
      <h2 className="journal__title">Journal</h2>

      <section>
        <h3 className="journal__heading">
          Species{' '}
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
                  {owned > 0 && <span className="journal__owned">{owned} parts</span>}
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
          Hybrids{' '}
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
                  {found ? def.name : 'Undiscovered'}
                  {owned > 0 && <span className="journal__owned">{owned} parts</span>}
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
        Graft (G) two adjacent branches of different species — each carrying something of its own —
        to make a hybrid. {species.grafts} graft{species.grafts === 1 ? '' : 's'} so far.
      </p>
    </aside>
  );
}
