import { useEffect } from 'react';
import './Toast.css';
import { t } from './i18n';

/**
 * The discovery toast.
 *
 * It exists for exactly one moment: the first time a hybrid is made. Everything
 * else in the game reports itself in the HUD or on the canvas, so a card sliding
 * in from the top is unambiguous — something happened that has never happened
 * before.
 *
 * Dismissible, and self-dismissing: a celebration the player has to click away
 * stops being one the second time.
 */
export interface ToastProps {
  readonly title: string;
  readonly body: string;
  readonly glyph: string;
  /** Accent colour — a discovered hybrid's own bark. */
  readonly color: string;
  readonly onDismiss: () => void;
  /** How long it stays up, in ms. */
  readonly durationMs?: number;
}

export const TOAST_DURATION_MS = 5200;

export function Toast({
  title,
  body,
  glyph,
  color,
  onDismiss,
  durationMs = TOAST_DURATION_MS,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, durationMs, title]);

  return (
    <div className="toast" role="status" style={{ borderColor: color }}>
      <span className="toast__glyph" aria-hidden>
        {glyph}
      </span>
      <span className="toast__text">
        <b className="toast__title">{title}</b>
        <span className="toast__body">{body}</span>
      </span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label={t('common.dismiss')}>
        ×
      </button>
    </div>
  );
}
