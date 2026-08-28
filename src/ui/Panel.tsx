import { useEffect, useRef, type ReactNode } from 'react';
import { t } from './i18n';
import './Panel.css';

/**
 * The shell every panel now sits in: a sheet that slides in from the right, with
 * one way out that always works.
 *
 * Before this, each panel positioned itself and none of them had a close button
 * — you pressed the same dock key again, or you knew about Escape. That is fine
 * for someone who wrote the game and hostile to everyone else, and it is
 * impossible with a keyboard if the dock button is not where focus is.
 *
 * Three behaviours make it work rather than merely look right:
 *
 * - **Focus moves in.** Opening a panel puts focus on it, so the next Tab is
 *   inside the panel rather than back at the top of the page.
 * - **Focus comes back.** Closing returns focus to whatever opened it, so a
 *   keyboard player who opens the Journal from the dock lands back on the dock.
 * - **Escape closes**, from anywhere inside.
 *
 * On a phone it becomes a full-width sheet from the bottom, which is the same
 * component with a different transform.
 */
export interface PanelProps {
  /** Accessible name — the panel's own title. */
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Panel({ title, onClose, children }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** Whatever had focus when the panel opened, to give it back on the way out. */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Captured now rather than read in the cleanup: by the time the panel is
    // unmounting React has already detached the node, so `ref.current` there
    // would be `null` and the `contains` check below would never pass.
    const panel = ref.current;
    opener.current = document.activeElement as HTMLElement | null;
    panel?.focus();

    return () => {
      // Only if focus is still inside the panel: if the player has since clicked
      // the canvas, yanking them back to the dock would be worse than doing
      // nothing.
      const active = document.activeElement;
      if (active === document.body || panel?.contains(active)) {
        opener.current?.focus?.();
      }
    };
  }, []);

  return (
    <aside
      className="panel"
      role="dialog"
      aria-label={title}
      ref={ref}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="panel__bar">
        <h2 className="panel__title">{title}</h2>
        <button
          type="button"
          className="panel__close"
          aria-label={t('panel.close')}
          aria-keyshortcuts="Escape"
          onClick={onClose}
        >
          <span aria-hidden>✕</span>
          <kbd className="panel__key" aria-hidden>
            {t('panel.closeHint')}
          </kbd>
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </aside>
  );
}
