import { UPGRADES } from '../content/upgrades';
import { RESOURCE_BY_ID } from '../content/resources';
import { formatNumber } from '../engine/format';
import { useGameStore } from './useGameStore';
import './UpgradePanel.css';

/**
 * **Temporary** upgrade panel for STEP 5.
 *
 * The real upgrade UI is the tree itself — you buy growth by clicking limbs.
 * This side panel exists only so the click-power / crit / combo upgrades are
 * reachable and testable before that lands, and is driven entirely by the
 * `UPGRADES` content list, so it needs no edits when upgrades are added.
 */
export interface UpgradePanelProps {
  readonly onBuy: (id: string) => void;
}

export function UpgradePanel({ onBuy }: UpgradePanelProps) {
  const upgrades = useGameStore((s) => s.snapshot.upgrades);
  const clickStats = useGameStore((s) => s.snapshot.clickStats);
  const combo = useGameStore((s) => s.snapshot.combo);

  return (
    <aside className="upgrades" aria-label="upgrades">
      <h2 className="upgrades__title">Upgrades</h2>

      <dl className="upgrades__stats">
        <div>
          <dt>Per tap</dt>
          <dd>{formatNumber(clickStats.clickPower)}</dd>
        </div>
        <div>
          <dt>Crit</dt>
          <dd>
            {(clickStats.critChance * 100).toFixed(1)}% ×{clickStats.critMult}
          </dd>
        </div>
        <div>
          <dt>Combo</dt>
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
                  {state.level > 0 && <span className="upgrade__level">Lv {state.level}</span>}
                </span>
                <span className="upgrade__desc">{def.description}</span>
                <span className="upgrade__cost">
                  {state.maxed ? 'Maxed' : `${formatNumber(state.cost)} ${currency.label}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
