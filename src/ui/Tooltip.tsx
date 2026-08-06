import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

/**
 * The game's shared tooltip.
 *
 * Rendered through a **portal** onto `document.body` so it is never clipped by
 * the HUD's stacking or overflow, and positioned `fixed` at the cursor with a
 * flip near the viewport edges.
 *
 * It is a *controlled* component: callers pass `content` and the cursor
 * position. That is what lets the canvas drive it — the radial grow menu lives
 * on the canvas and has no DOM node to hang a `title` off, so hover state comes
 * from the renderer's hit-test instead.
 *
 * Timing: appearing is delayed by {@link DEFAULT_TOOLTIP_DELAY_MS} so sweeping
 * the cursor across the tree does not strobe. Once visible, *changing* content
 * swaps instantly — moving between two adjacent options should not make the
 * player wait again — while `content: null` hides immediately.
 */

/** Delay before an idle hover reveals its tooltip. */
export const DEFAULT_TOOLTIP_DELAY_MS = 200;

/** Gap between the cursor and the tooltip box. */
const CURSOR_OFFSET_PX = 18;

/** Space reserved so the box never sits flush against the viewport edge. */
const EDGE_MARGIN_PX = 12;

export interface TooltipProps {
  /** What to show. `null` hides the tooltip and cancels any pending reveal. */
  readonly content: ReactNode | null;
  /** Cursor position in client (viewport) coordinates. */
  readonly x: number;
  readonly y: number;
  readonly delayMs?: number;
}

export function Tooltip({ content, x, y, delayMs = DEFAULT_TOOLTIP_DELAY_MS }: TooltipProps) {
  const active = content !== null && content !== undefined;
  const [visible, setVisible] = useState(false);

  // Deliberately keyed on `active`, not on `content`: a content swap while the
  // tooltip is already up must not restart the delay.
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  if (!active || !visible || typeof document === 'undefined') return null;

  // Flip to the other side of the cursor when close to an edge. The box is
  // measured by CSS rather than JS, so this uses generous fixed estimates.
  const flipX = x > window.innerWidth - 260;
  const flipY = y > window.innerHeight - 160;

  return createPortal(
    <div
      className="tooltip"
      role="tooltip"
      style={{
        left: flipX ? undefined : x + CURSOR_OFFSET_PX,
        right: flipX ? window.innerWidth - x + CURSOR_OFFSET_PX : undefined,
        top: flipY ? undefined : y + CURSOR_OFFSET_PX,
        bottom: flipY ? window.innerHeight - y + CURSOR_OFFSET_PX : undefined,
        maxWidth: `calc(100vw - ${EDGE_MARGIN_PX * 2}px)`,
      }}
    >
      {content}
    </div>,
    document.body,
  );
}
