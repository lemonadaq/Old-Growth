import { memo } from 'react';
import { t } from './i18n';
import './Dock.css';

/**
 * The bottom dock: every tool and every panel, in one row, always in the same
 * place.
 *
 * It replaces the header full of toggles the game had grown by STEP 17 — a row
 * that got one button longer per step and had begun to compete with the tree for
 * the top of the screen. The dock is at the bottom because that is where a thumb
 * is on a phone and where the eye is not on a desktop: the canopy stays the thing
 * you look at.
 *
 * Two kinds of thing sit here and are deliberately drawn the same: **modes**
 * (Grow, Prune, Graft — what a click on the tree means) and **panels** (Journal,
 * Symbionts, Vault, Settings — what is open on the right). They share a row
 * because they share an exclusivity: one mode, one panel, and picking either
 * puts back whatever it replaced.
 *
 * On a phone this becomes the bottom tab bar, by CSS alone — the markup is
 * already a labelled row of 44px targets.
 */

/** One entry in the dock. */
export interface DockItem {
  readonly id: string;
  /** Glyph shown above the label. Decorative: the label carries the meaning. */
  readonly glyph: string;
  readonly label: string;
  /** Full sentence for the tooltip and the accessible name. */
  readonly title: string;
  /** Keyboard shortcut, shown on the button so it is discoverable. */
  readonly hotkey: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  /** Small count or word in the corner — discoveries found, residents, "ready". */
  readonly badge?: string;
  /** Draws attention to the button: the Vault when a tree is ready to seed. */
  readonly highlight?: boolean;
}

export interface DockProps {
  readonly items: readonly DockItem[];
}

/**
 * Memoised, and it matters here more than anywhere: the dock re-renders on
 * nothing but its own props, while the HUD above it is re-rendering sixty times
 * a second off the snapshot.
 */
export const Dock = memo(function Dock({ items }: DockProps) {
  return (
    <nav className="dock" aria-label={t('dock.label')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`dock__button${item.active ? ' dock__button--active' : ''}${
            item.highlight ? ' dock__button--ready' : ''
          }`}
          aria-pressed={item.active}
          aria-keyshortcuts={item.hotkey}
          // The visible label can be clipped to an ellipsis on a narrow phone,
          // so the accessible name is stated rather than read off the text.
          aria-label={item.label}
          title={item.title}
          onClick={item.onSelect}
        >
          <span className="dock__glyph" aria-hidden>
            {item.glyph}
          </span>
          <span className="dock__label">{item.label}</span>
          {item.badge !== undefined && <span className="dock__badge">{item.badge}</span>}
          {/*
            The shortcut is printed rather than hidden in the tooltip: a
            keyboard player should not have to hover every control to find out
            the game has shortcuts at all.
          */}
          <kbd className="dock__key" aria-hidden>
            {item.hotkey}
          </kbd>
        </button>
      ))}
    </nav>
  );
});
