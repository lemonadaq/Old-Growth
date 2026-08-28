import { memo } from 'react';
import { RESOURCE_BY_ID } from '../content/resources';
import { SPECIES_BY_ID, PICKER_MIN_SPECIES } from '../content/species';
import { formatNumber } from '../engine/format';
import type { PricedGrowthOption } from '../engine/growth';
import { t } from './i18n';
import './GrowSheet.css';

/**
 * The grow menu, on a phone.
 *
 * On a desktop the options are a ring of dials around the limb you tapped,
 * which is the right shape for a mouse: the limb stays visible in the middle
 * and every option is one short movement away. On a 390px-wide screen held in
 * one hand it is the wrong shape twice over — there is no room for a ring
 * around a limb near the edge, and the top half of it ends up under the
 * player's own hand.
 *
 * So below the phone breakpoint the same options are laid out as rows in a
 * sheet from the bottom of the screen, where a thumb already is. Nothing about
 * the menu changes: same options in the same order, same prices, and pointing
 * at a row lights the same ghost preview on the tree that hovering a dial does.
 *
 * Rows that cannot be afforded are shown, disabled, with what they cost. A menu
 * that hides what you cannot buy yet is a menu that never teaches you what to
 * save for.
 */
export interface GrowSheetProps {
  /** Name of the limb the menu is hanging off — the sheet's subject. */
  readonly partLabel: string;
  readonly options: readonly PricedGrowthOption[];
  /** Species the player may plant, and the one currently chosen. */
  readonly species: { readonly unlocked: readonly string[]; readonly planting: string };
  readonly onGrow: (option: PricedGrowthOption) => void;
  /** Point at a row: previews the part on the tree. `null` clears the preview. */
  readonly onPreview: (index: number | null) => void;
  readonly onChooseSpecies: (speciesId: string) => void;
  readonly onClose: () => void;
}

function GrowSheetPanel({
  partLabel,
  options,
  species,
  onGrow,
  onPreview,
  onChooseSpecies,
  onClose,
}: GrowSheetProps) {
  // The picker earns its space only when there is a choice to make; one chip is
  // a control that cannot do anything, and on a phone the room it takes is a
  // row of options the player can no longer see.
  const showPicker = species.unlocked.length >= PICKER_MIN_SPECIES;

  return (
    <div className="grow-sheet" role="dialog" aria-label={t('grow.sheetTitle')}>
      <header className="grow-sheet__bar">
        <h2 className="grow-sheet__title">
          {t('grow.sheetTitle')}
          <span className="grow-sheet__part"> · {partLabel}</span>
        </h2>
        <button
          type="button"
          className="grow-sheet__close"
          aria-label={t('panel.close')}
          onClick={onClose}
        >
          <span aria-hidden>✕</span>
        </button>
      </header>

      {showPicker && (
        <div className="grow-sheet__species" role="group" aria-label={t('grow.species')}>
          {species.unlocked.map((id) => {
            const def = SPECIES_BY_ID[id];
            if (!def) return null;
            const chosen = id === species.planting;
            return (
              <button
                key={id}
                type="button"
                className={`grow-sheet__chip${chosen ? ' grow-sheet__chip--on' : ''}`}
                aria-pressed={chosen}
                style={{ borderColor: def.palette.leaf }}
                onClick={() => onChooseSpecies(id)}
              >
                <span aria-hidden>{def.glyph}</span> {def.name}
              </button>
            );
          })}
        </div>
      )}

      {options.length === 0 ? (
        <p className="grow-sheet__empty">{t('grow.sheetEmpty')}</p>
      ) : (
        <ul className="grow-sheet__list">
          {options.map((option, index) => {
            const currency = RESOURCE_BY_ID[option.costResource];
            const produced = option.production ? RESOURCE_BY_ID[option.production.resource] : null;
            return (
              <li key={option.option.type}>
                <button
                  type="button"
                  className="grow-sheet__option"
                  disabled={!option.affordable}
                  onFocus={() => onPreview(index)}
                  onBlur={() => onPreview(null)}
                  onPointerEnter={() => onPreview(index)}
                  onPointerLeave={() => onPreview(null)}
                  onClick={() => onGrow(option)}
                >
                  <span className="grow-sheet__name">{option.rule.label}</span>
                  <span className="grow-sheet__cost">
                    {formatNumber(option.cost)} {currency.label}
                  </span>
                  {option.production && produced && (
                    <span className="grow-sheet__gain">
                      +{formatNumber(option.production.rate)} {produced.label}/s
                    </span>
                  )}
                  {!option.affordable && (
                    <span className="grow-sheet__short">{t('grow.cannotAfford')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Memoised for the same reason the panels are: `App` re-renders far more than
 * this sheet's contents change. */
export const GrowSheet = memo(GrowSheetPanel);
