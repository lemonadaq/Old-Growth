import { memo } from 'react';
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
import { t } from './i18n';
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
        <span
          className="vault__pips"
          aria-label={t('vault.heirloomLevel', { level, max: maxLevel })}
        >
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
            ? t('vault.heirloomLocked')
            : maxed
              ? t('vault.heirloomMaxed')
              : t('vault.heirloomCost', { amount: formatNumber(cost) })
        }
      >
        {maxed ? t('vault.heirloomComplete') : `🌰 ${formatNumber(cost)}`}
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

function SeedVaultPanel({ onBuyHeirloom, onChooseBond, onGoToSeed }: SeedVaultProps) {
  const prestige = useGameStore((s) => s.snapshot.prestige);
  const seeds = useGameStore((s) => s.snapshot.resources.seeds);
  const fragments = useGameStore((s) => s.snapshot.seedFragments);

  const byId = new Map(prestige.heirlooms.map((entry) => [entry.id, entry]));
  const { progress, yield: payout } = prestige;
  const seeding = prestige.ceremony !== null;

  return (
    <aside className="vault" aria-label={t('vault.title')}>
      <header className="vault__head">
        <p className="vault__seeds">
          <span aria-hidden>🌰</span> {t('vault.seeds', { amount: formatNumber(seeds) })}
          {fragments > 0 && (
            <span className="vault__fragments">
              {t('vault.fragments', { have: fragments, needed: 100 })}
            </span>
          )}
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
          {t('vault.maturity')}
          {progress.ready && <span className="vault__ready">{t('vault.ready')}</span>}
        </h3>
        <p className="vault__gate">
          <span>{t('vault.height')}</span>
          <span className="vault__bar" aria-hidden>
            <span style={{ width: `${Math.round(progress.heightFraction * 100)}%` }} />
          </span>
          <b>
            {progress.height.toFixed(2)}/{PRESTIGE_HEIGHT_UNITS.toFixed(2)}
          </b>
        </p>
        <p className="vault__gate">
          <span>{t('vault.lifetimeLight')}</span>
          <span className="vault__bar" aria-hidden>
            <span style={{ width: `${Math.round(progress.lightFraction * 100)}%` }} />
          </span>
          <b>
            {formatNumber(progress.light)}/{formatNumber(progress.lightNeeded)}
          </b>
        </p>
        <p className="vault__payout">
          {payout.total === 1 ? t('vault.payoutOne') : t('vault.payout', { count: payout.total })}
          {payout.fromFragments > 0 && (
            <span className="vault__muted">
              {t('vault.payoutSplit', {
                light: payout.fromLight,
                fragments: payout.fromFragments,
              })}
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
          {seeding ? t('vault.seeding') : `🌰 ${t('vault.goToSeed')}`}
        </button>
        <p className="vault__warn">{t('vault.warning')}</p>
      </section>

      <section>
        <h3 className="vault__heading">
          {t('vault.forest')}
          <span className="vault__count">
            {prestige.forest.length === 1
              ? t('vault.oneTree')
              : t('vault.trees', { count: prestige.forest.length })}
          </span>
        </h3>
        {prestige.forest.length === 0 ? (
          <p className="vault__empty">
            {t('vault.forestEmpty', { bonus: Math.round(FOREST_PRODUCTION_BONUS * 100) })}
          </p>
        ) : (
          <p className="vault__forest">
            {t('vault.forestWorth', {
              multiplier: prestige.forestMultiplier.toFixed(2),
              species: speciesLabel(prestige.forest[prestige.forest.length - 1].speciesId),
              parts: prestige.forest[prestige.forest.length - 1].parts,
            })}
          </p>
        )}
      </section>

      {prestige.remembered > 0 && (
        <p className="vault__memory">🧠 {t('vault.remembered', { parts: prestige.remembered })}</p>
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
                  {prestige.bonded ? t('vault.bondReady') : t('vault.bondLocked')}
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
                    {t('vault.bondPicked', {
                      name: SYMBIONT_BY_ID[prestige.bondSymbiont]?.name ?? '',
                    })}
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

      <p className="vault__footer">{t('vault.offline', { hours: prestige.offlineCapHours })}</p>
    </aside>
  );
}

/**
 * Memoised because `App` re-renders far more often than the vault changes — and
 * this panel draws the whole heirloom tree every time it renders. Its props are
 * all `useCallback`s from `App`, so the comparison holds; the store
 * subscriptions still re-render it when Seeds or maturity move.
 */
export const SeedVault = memo(SeedVaultPanel);
