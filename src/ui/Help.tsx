import { HELP_TOPICS } from '../content/help';
import { FEATURES } from '../content/progression';
import { useGameStore } from './useGameStore';
import { t } from './i18n';

/**
 * The Journal's Help tab: what kind of thing this tree is.
 *
 * Two halves, and the split is the point. The first is the mechanics that are
 * there from the first frame and are never announced by anything — tapping,
 * shade, thirst, weather, the save. The second is the systems that arrive on
 * their own, read **straight out of the gating table**: the same rows the HUD
 * uses to decide whether to draw a button, so a locked system explains itself
 * with the exact sentence the gate would have used and there is no second copy
 * of the rules to fall out of step.
 *
 * Locked systems are shown rather than hidden. A player who opens Help is asking
 * what the game contains, and answering "the parts of it you have already found"
 * would be answering a different question.
 */
export function Help() {
  const features = useGameStore((s) => s.snapshot.progression.features);
  const byId = new Map(features.map((gate) => [gate.id, gate]));

  return (
    <div className="journal__help">
      <p className="journal__help-lede">{t('help.lede')}</p>

      <section>
        <h3 className="journal__heading">{t('help.tree')}</h3>
        <ul className="journal__help-list">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.id} className="journal__help-topic">
              <p className="journal__help-title">{topic.title}</p>
              {topic.body.map((paragraph, i) => (
                <p key={i} className="journal__help-body">
                  {paragraph}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="journal__heading">{t('help.gates')}</h3>
        <ul className="journal__help-list">
          {FEATURES.map((def) => {
            const gate = byId.get(def.id);
            const unlocked = gate?.unlocked ?? false;
            return (
              <li
                key={def.id}
                className={`journal__help-topic${unlocked ? '' : ' journal__help-topic--locked'}`}
              >
                <p className="journal__help-title">
                  {def.label}
                  {unlocked && <span className="journal__help-open">{t('help.open')}</span>}
                </p>
                <p className="journal__help-body">{def.blurb}</p>
                {!unlocked && gate && (
                  <p className="journal__locked">
                    🔒 {gate.hint}
                    <span className="journal__bar" aria-hidden>
                      <span style={{ width: `${Math.round(gate.fraction * 100)}%` }} />
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
