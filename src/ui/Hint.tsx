import { useEffect } from 'react';
import { HINT_DURATION_MS } from '../content/progression';
import type { HintSnapshot } from '../engine/types';
import './Hint.css';
import { t } from './i18n';

/**
 * A contextual hint: one bubble, once ever, with a ✕ on it.
 *
 * The rules it is built to, all of which come from the same place — a hint that
 * has to be fought with is worse than no hint:
 *
 * - **It never blocks anything.** No backdrop, no focus trap, nothing under it
 *   is unclickable. It sits in a corner near the control it is about.
 * - **It goes away on its own.** After {@link HINT_DURATION_MS} it counts as
 *   read, exactly as if it had been dismissed. A player who is mid-tap and
 *   ignores it should not find it still there a minute later.
 * - **It never comes back.** Dismissing and timing out both write the id into
 *   the settings, so a save carries the list of what has already been explained.
 *   Settings can clear that list; nothing else can.
 *
 * `role="status"` rather than `alert`: it is worth hearing at the next natural
 * pause, not worth interrupting for.
 */
export interface HintProps {
  readonly hint: HintSnapshot;
  /** Mark it read. Called by the ✕ and by the timeout alike. */
  readonly onDismiss: (id: string) => void;
  /** How long it stays up. */
  readonly durationMs?: number;
}

export function Hint({ hint, onDismiss, durationMs = HINT_DURATION_MS }: HintProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(hint.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [hint.id, onDismiss, durationMs]);

  return (
    <aside className={`hint hint--${hint.anchor}`} role="status">
      <span className="hint__text">
        <b className="hint__title">{hint.title}</b>
        <span className="hint__body">{hint.body}</span>
      </span>
      <button
        type="button"
        className="hint__close"
        aria-label={t('common.dismissHint')}
        onClick={() => onDismiss(hint.id)}
      >
        ×
      </button>
    </aside>
  );
}
