import { t } from './i18n';

/**
 * The screen reader's view of a canvas.
 *
 * Everything that happens on the tree happens in pixels: a limb gains focus, a
 * tap pays out, a ring of buds opens. None of that reaches assistive tech,
 * because a `<canvas>` is one opaque element no matter what is drawn inside it.
 * This is the seam — a polite live region the keyboard handlers write short
 * sentences into.
 *
 * Polite rather than assertive: these are consequences of what the player just
 * pressed, not alarms, and interrupting someone mid-sentence to tell them they
 * moved one limb to the left is worse than saying nothing.
 *
 * Visually hidden rather than `display: none`, because a hidden element is not
 * announced at all.
 */
/** Written as an escape rather than the character itself: it is invisible. */
const ZERO_WIDTH = '\u200B';

export interface AnnouncerProps {
  /** The latest sentence. Empty says nothing. */
  readonly message: string;
  /**
   * Which announcement this is. Two identical sentences in a row are not a
   * change in content, and a live region that sees no change says nothing — so
   * the count is folded into the text as zero-width spaces, invisible on screen
   * and inaudible when read, but enough to make the second one new.
   */
  readonly seq: number;
}

export function Announcer({ message, seq }: AnnouncerProps) {
  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={t('a11y.announcements')}
    >
      {message ? `${message}${ZERO_WIDTH.repeat(seq % 2)}` : ''}
    </div>
  );
}
