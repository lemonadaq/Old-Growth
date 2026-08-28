import { memo } from 'react';
import { UPGRADES } from '../content/upgrades';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { t } from './i18n';
import { useGameStore } from './useGameStore';
import './UpgradePanel.css';

/**
 * The tap upgrades — click power, crit, combo — and what they currently add up
 * to.
 *
 * Most of this game's upgrades are the tree itself: you buy growth by clicking
 * limbs. These are the ones that have no limb to hang off, because they change
 * what a tap *is* rather than what the tree is made of, so they need a list.
 * It lives in the Grow panel alongside the Workshop, the other place Sap and
 * Deadwood are spent on something that is not a part.
 *
 * Driven entirely by the `UPGRADES` content list, so adding an upgrade needs no
 * edit here.
 */
export interface UpgradePanelProps {
  readonly onBuy: (id: string) => void;
}

function UpgradeList({ onBuy }: UpgradePanelProps) {
  const upgrades = useGameStore((s) => s.snapshot.upgrades);
  const clickStats = useGameStore((s) => s.snapshot.clickStats);
  const combo = useGameStore((s) => s.snapshot.combo);

  return (
    <aside className="upgrades" aria-label={t('upgrades.title')}>

      <dl className="upgrades__stats">
        <div>
          <dt>{t('upgrades.perTap')}</dt>
          <dd>{formatNumber(clickStats.clickPower)}</dd>
        </div>
        <div>
          <dt>{t('upgrades.crit')}</dt>
          <dd>
            {(clickStats.critChance * 100).toFixed(1)}% ×{clickStats.critMult}
          </dd>
        </div>
        <div>
          <dt>{t('upgrades.combo')}</dt>
          <dd>
            {Math.floor(combo.stacks)}/{combo.cap} (×{combo.multiplier.toFixed(2)})
          </dd>
        </div>
      </dl>

      <ul className="upgrades__list">
        {UPGRADES.map((def) => {
          const state = upgrades.find((u) => u.id === def.id);
          if (!state) return null;
          const currency = RESOURCE_BY_ID[def.costResource];
          const disabled = state.maxed || !state.affordable;

          return (
            <li key={def.id}>
              <button
                type="button"
                className="upgrade"
                disabled={disabled}
                onClick={() => onBuy(def.id)}
                title={def.description}
              >
                <span className="upgrade__name">
                  {def.name}
                  {state.level > 0 && <span className="upgrade__level">{t('upgrades.level', { level: state.level })}</span>}
                </span>
                <span className="upgrade__desc">{def.description}</span>
                <span className="upgrade__cost">
                  {state.maxed ? t('upgrades.maxed') : `${formatNumber(state.cost)} ${currency.label}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/**
 * Memoised because `App` re-renders far more often than this list changes — a
 * pointer move over the canvas updates hover state sixty times a second. Its
 * one prop is a `useCallback` from `App`, so the comparison holds; its own
 * store subscriptions still re-render it when a price or a level moves.
 */
export const UpgradePanel = memo(UpgradeList);
