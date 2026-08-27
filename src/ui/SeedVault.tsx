import { formatNumber } from '../engine/format';
import {
  FOREST_PRODUCTION_BONUS,
  HEIRLOOM_BRANCHES,
  PRESTIGE_HEIGHT_UNITS,
} from '../content/prestige';
import { SPECIES_BY_ID } from '../content/species';
import { HYBRID_BY_ID } from '../content/hybrids';
import { SYMBIONTS, SYMBIONT_BY_ID } from '../content/symbionts';
import type { HeirloomSnapshot } from '../engine/types';
import { useGameStore } from './useGameStore';
import './SeedVault.css';

/**
 * The Seed Vault: what the Seeds buy, drawn as the thing Seeds come out of.
 *
 * The panel is a **trunk in cross-section** — concentric rings, four limbs
 * radiating out of the heartwood — because that is what the rest of the game has
 * already taught the player to read: the season badge draws a ring for every
 * winter, and this is the same wood seen the same way. Each limb is a chain, and
 * a node opens only once the one before it is owned, so the shape on screen is
 * the shape of the dependency and not decoration over a list.
 *
 * Everything here is a control, which is the opposite of the Journal. There is
 * exactly one destructive button in it and it lives at the bottom, behind the
 * maturity gate, saying plainly what it will take and what it will pay.
 */

/** The dominant-species tint a forest silhouette is drawn in. */
function speciesLabel(speciesId: string): string {
  return (SPECIES_BY_ID[speciesId] ?? HYBRID_BY_ID[speciesId])?.name ?? speciesId;
}

/** One node on a limb. */
function HeirloomNode({
  branchColor,
  snapshot,
  name,
  glyph,
  description,
  maxLevel,
  onBuy,
}: {
  readonly branchColor: string;
  readonly snapshot: HeirloomSnapshot;
  readonly name: string;
  readonly glyph: string;
  readonly description: string;
  readonly maxLevel: number;
  readonly onBuy: (id: string) => void;
}) {
  const { level, cost, affordable, maxed, unlocked } = snapshot;
  const buyable = unlocked && !maxed && affordable;

  return (
    <li
      className={`vault__node${unlocked ? '' : ' vault__node--closed'}${
        level > 0 ? ' vault__node--owned' : ''
      }`}
      style={{ borderLeftColor: level > 0 ? branchColor : undefined }}
    >
      <p className="vault__name">
        <span aria-hidden>{unlocked ? glyph : '🔒'}</span> {name}
        <span className="vault__pips" aria-label={`level ${level} of ${maxLevel}`}>
          {Array.from({ length: maxLevel }, (_, i) => (
            <span
              key={i}
              className={`vault__pip${i < level ? ' vault__pip--lit' : ''}`}
              style={i < level ? { background: branchColor } : undefined}
              aria-hidden
            />
          ))}
        </span>
      </p>
      <p className="vault__desc">{description}</p>
      <button
        type="button"
        className="vault__buy"
        disabled={!buyable}
        onClick={() => onBuy(snapshot.id)}
        title={
          !unlocked
            ? 'Buy the heirloom above this one first.'
            : maxed
              ? 'Nothing more to learn here.'
              : `Costs ${formatNumber(cost)} Seeds`
        }
      >
        {maxed ? 'Complete' : `🌰 ${formatNumber(cost)}`}
      </button>
    </li>
  );
}

export interface SeedVaultProps {
  /** Buy one level of an heirloom. */
  readonly onBuyHeirloom: (id: string) => void;
  /** Choose which creature the Bond heirloom brings. */
  readonly onChooseBond: (id: string) => void;
  /** Commit to the ceremony. Only ever called while the tree is mature. */
  readonly onGoToSeed: () => void;
}

export function SeedVault({ onBuyHeirloom, onChooseBond, onGoToSeed }: SeedVaultProps) {
  const prestige = useGameStore((s) => s.snapshot.prestige);
  const seeds = useGameStore((s) => s.snapshot.resources.seeds);
  const fragments = useGameStore((s) => s.snapshot.seedFragments);

  const byId = new Map(prestige.heirlooms.map((entry) => [entry.id, entry]));
  const { progress, yield: payout } = prestige;
  const seeding = prestige.ceremony !== null;

  return (
    <aside className="vault" aria-label="seed vault">
      <header className="vault__head">
        <h2 className="vault__title">Seed Vault</h2>
        <p className="vault__seeds">
          <span aria-hidden>🌰</span> <b>{formatNumber(seeds)}</b> Seeds
          {fragments > 0 && <span className="vault__fragments"> · {fragments}/100 fragments</span>}
        </p>
      </header>

      {/* The trunk this whole screen is a cross-section of. */}
      <svg className="vault__grain" viewBox="0 0 120 120" aria-hidden focusable="false">
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx="60" cy="60" r={8 + i * 8} />
        ))}
      </svg>

      <section className="vault__maturity">
        <h3 className="vault__heading">
          Maturity
          {progress.ready && <span className="vault__ready">ready to seed</span>}
        </h3>
        <p className="vault__gate">
          <span>Height</span>
          <span className="vault__bar" aria-hidden>
            <span style={{ width: `${Math.round(progress.heightFraction * 100)}%` }} />
          </span>
          <b>
            {progress.height.toFixed(2)}/{PRESTIGE_HEIGHT_UNITS.toFixed(2)}
          </b>
        </p>
        <p className="vault__gate">
          <span>Lifetime Light</span>
          <span className="vault__bar" aria-hidden>
            <span style={{ width: `${Math.round(progress.lightFraction * 100)}%` }} />
          </span>
          <b>
            {formatNumber(progress.light)}/{formatNumber(progress.lightNeeded)}
          </b>
        </p>
        <p className="vault__payout">
          Going to seed now would pay <b>{payout.total}</b> Seed{payout.total === 1 ? '' : 's'}
          {payout.fromFragments > 0 && (
            <span className="vault__muted">
              {' '}
              ({payout.fromLight} from Light, {payout.fromFragments} from fragments)
            </span>
          )}
          .
        </p>
        <button
          type="button"
          className="vault__seed"
          disabled={!progress.ready || seeding}
          onClick={onGoToSeed}
        >
          {seeding ? 'Seeding…' : '🌰 Go to Seed'}
        </button>
        <p className="vault__warn">
          The tree, its residents, its totems and everything it has earned are given up. Seeds,
          Heirlooms, Rings and the Journal are not.
        </p>
      </section>

      <section>
        <h3 className="vault__heading">
          Old Growth
          <span className="vault__count">
            {prestige.forest.length} tree{prestige.forest.length === 1 ? '' : 's'}
          </span>
        </h3>
        {prestige.forest.length === 0 ? (
          <p className="vault__empty">
            Nothing on the hills yet. Every tree you give up stands there for good, and each one
            adds {Math.round(FOREST_PRODUCTION_BONUS * 100)}% to everything the next one makes.
          </p>
        ) : (
          <p className="vault__forest">
            The grove is worth <b>×{prestige.forestMultiplier.toFixed(2)}</b> to all production.
            Latest: a {speciesLabel(prestige.forest[prestige.forest.length - 1].speciesId)} of{' '}
            {prestige.forest[prestige.forest.length - 1].parts} parts.
          </p>
        )}
      </section>

      {prestige.remembered > 0 && (
        <p className="vault__memory">
          🧠 The last tree is remembered — {prestige.remembered} parts, waiting for a Memory
          heirloom to put them back.
        </p>
      )}

      <div className="vault__limbs">
        {HEIRLOOM_BRANCHES.map((branch) => (
          <section className="vault__limb" key={branch.id} style={{ borderTopColor: branch.color }}>
            <h3 className="vault__heading" style={{ color: branch.color }}>
              <span aria-hidden>{branch.glyph}</span> {branch.label}
            </h3>
            <p className="vault__blurb">{branch.blurb}</p>

            {branch.id === 'bond' && (
              <div className={`vault__bond${prestige.bonded ? '' : ' vault__bond--idle'}`}>
                <p className="vault__bondlabel">
                  {prestige.bonded
                    ? 'Who is waiting for you next run?'
                    : 'Buy Old Friend to choose a companion.'}
                </p>
                <div className="vault__chips">
                  {SYMBIONTS.map((def) => (
                    <button
                      key={def.id}
                      type="button"
                      className={`vault__chip${
                        prestige.bondSymbiont === def.id ? ' vault__chip--on' : ''
                      }`}
                      onClick={() => onChooseBond(def.id)}
                      title={def.name}
                      aria-pressed={prestige.bondSymbiont === def.id}
                    >
                      <span aria-hidden>{def.glyph}</span>
                    </button>
                  ))}
                </div>
                {prestige.bonded && prestige.bondSymbiont && (
                  <p className="vault__bondpick">
                    {SYMBIONT_BY_ID[prestige.bondSymbiont]?.name} will be here from the first tick.
                  </p>
                )}
              </div>
            )}

            <ul className="vault__nodes">
              {branch.nodes.map((def) => {
                const snapshot = byId.get(def.id);
                if (!snapshot) return null;
                return (
                  <HeirloomNode
                    key={def.id}
                    branchColor={branch.color}
                    snapshot={snapshot}
                    name={def.name}
                    glyph={def.glyph}
                    description={def.description}
                    maxLevel={def.maxLevel}
                    onBuy={onBuyHeirloom}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="vault__footer">
        Offline the roots keep working for {prestige.offlineCapHours} hours.
      </p>
    </aside>
  );
}
