import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PASSIVE_BRANCH_BY_ID,
  PASSIVE_MAP_RADIUS,
  PASSIVE_NEIGHBOURS,
  PASSIVE_NODES,
  PASSIVE_NODE_BY_ID,
  PASSIVE_START_ID,
  passiveCurrency,
  type PassiveKind,
} from '../content/passives';
import { allocationCheck, refundCheck } from '../engine/passives';
import {
  drawPassiveMap,
  fitScale,
  nodeAt,
  toMap,
  type MapCamera,
  type MapViewport,
} from '../render/passiveMap';
import { t } from './i18n';
import { useGameStore } from './useGameStore';
import './Heartwood.css';

/**
 * The Heartwood: the passive map, and the one screen in the game that is a map
 * rather than a list.
 *
 * It is a canvas because it has to be. Sixty-one nodes joined by seventy edges
 * is not a thing the DOM lays out well, and the interaction the screen is for —
 * drag it around, pinch it, look at where a route would go — is exactly what a
 * canvas with a camera gives you for free on a phone. Everything *about* a node
 * is still DOM, in the card at the bottom, so the part with the words in it is
 * selectable, readable by a screen reader, and has real buttons.
 *
 * The camera is the whole interaction model:
 *
 * - **One finger drags** the map. A press that moves less than a few pixels is
 *   a tap instead, which is what makes selecting a 7px node on a phone possible
 *   at all — you are not asked to be still, only to not swipe.
 * - **Two fingers pinch**, anchored on the midpoint between them, so the map
 *   zooms where the hands are rather than where the centre happens to be.
 * - **The wheel zooms** on the pointer, for the desktop half.
 * - **Arrow keys walk the edges.** The selection moves to whichever neighbour
 *   lies most nearly in the direction pressed — the same model the main tree
 *   already uses, so the keyboard story is one story.
 *
 * Nothing here decides whether a node may be taken. That is
 * `src/engine/passives.ts`, asked twice: once to draw the card, once by the
 * simulation when the button is actually pressed.
 */
export interface HeartwoodProps {
  readonly onAllocate: (id: string) => void;
  readonly onRefund: (id: string) => void;
  readonly onRespec: () => void;
}

/**
 * What each rank of node is called on the card.
 *
 * A map rather than a template (``t(`heartwood.kind.${kind}`)``) on purpose:
 * the string table's own test scans the source for quoted keys to find the ones
 * nothing uses, and a key assembled at runtime is invisible to it. Four lines
 * here keep four strings honest.
 */
const KIND_LABEL: Readonly<Record<PassiveKind, string>> = {
  start: 'heartwood.kindStart',
  minor: 'heartwood.kindMinor',
  notable: 'heartwood.kindNotable',
  keystone: 'heartwood.kindKeystone',
};

/**
 * Put a freshly resized canvas back into CSS-pixel coordinates.
 *
 * Assigning `width` or `height` resets the context completely, transform
 * included, so every resize has to restate it — draw code works in CSS pixels
 * and the transform is what scales that to the device's.
 */
function ctxTransform(canvas: HTMLCanvasElement, dpr: number): void {
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** How far a press may travel and still count as a tap, in CSS pixels. */
const TAP_SLOP_PX = 7;

/** Zoom limits, as multiples of the scale at which the whole map fits. */
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 5;

/** One press of a zoom button, or one notch of the wheel. */
const ZOOM_STEP = 1.25;

/** Clamp a camera's scale to the range the viewport allows. */
function clampScale(scale: number, fit: number): number {
  return Math.min(fit * MAX_ZOOM, Math.max(fit * MIN_ZOOM, scale));
}

/**
 * Which neighbour of `id` lies most nearly in direction `(dx, dy)`.
 *
 * Scored by how well the step agrees with the direction pressed — the dot
 * product of the normalised step against it — so a branch that curves away is
 * still followed, and a node directly behind you is never chosen.
 */
function neighbourToward(id: string, dx: number, dy: number): string | null {
  const from = PASSIVE_NODE_BY_ID[id];
  if (!from) return null;

  let best: string | null = null;
  let bestScore = 0.2; // a floor, so "nothing that way" stays nothing

  for (const otherId of PASSIVE_NEIGHBOURS[id] ?? []) {
    const to = PASSIVE_NODE_BY_ID[otherId];
    if (!to) continue;
    const stepX = to.x - from.x;
    const stepY = to.y - from.y;
    const length = Math.hypot(stepX, stepY) || 1;
    const score = (stepX / length) * dx + (stepY / length) * dy;
    if (score > bestScore) {
      best = otherId;
      bestScore = score;
    }
  }
  return best;
}

function HeartwoodPanel({ onAllocate, onRefund, onRespec }: HeartwoodProps) {
  const passives = useGameStore((s) => s.snapshot.prestige.passives);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState<MapCamera>({ scale: 40, x: 0, y: 0 });
  const [viewport, setViewport] = useState<MapViewport>({ width: 1, height: 1 });
  const [selected, setSelected] = useState<string | null>(PASSIVE_START_ID);
  const [query, setQuery] = useState('');
  const [confirmingRespec, setConfirmingRespec] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  /** Live pointers, for telling a drag from a pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** How far the current press has travelled, so a tap can be told from a pan. */
  const travelled = useRef(0);
  /** Distance between two fingers on the last move, for the pinch ratio. */
  const pinchSpan = useRef(0);
  /** Set once the viewport is known, so the map is framed exactly once. */
  const framed = useRef(false);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === '') return null;
    return new Set(
      PASSIVE_NODES.filter((node) => {
        const branchLabel =
          node.branch === null ? '' : (PASSIVE_BRANCH_BY_ID[node.branch]?.label ?? '');
        // The rank is searchable too, and deliberately: "keystone" is the first
        // thing anyone types into a passive tree's search box, and it is the one
        // word that is true of a node without appearing anywhere in its text.
        return [node.name, node.description, branchLabel, node.kind]
          .join(' ')
          .toLowerCase()
          .includes(term);
      }).map((node) => node.id),
    );
  }, [query]);

  /* ------------------------------------------------------------- the canvas */

  /**
   * Everything the next paint needs, in a ref.
   *
   * The map is painted from two places that cannot be made into one: a React
   * effect, when something the player did changed what it should show, and the
   * `ResizeObserver` below, which fires outside React entirely. Resizing a
   * canvas *clears* it — setting `width` or `height` is a reset, not a resize —
   * so a paint that only ever ran as an effect would be wiped by the next
   * observer callback and not restored until React happened to render again.
   * That is precisely what an empty map looked like.
   *
   * So the inputs live in a ref, `paint` reads them, and both callers call it.
   */
  const inputs = useRef({ camera, viewport, passives, selected, matches });
  inputs.current = { camera, viewport, passives, selected, matches };

  /** Draw the map as it stands. Safe to call at any time, from anywhere. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const current = inputs.current;
    drawPassiveMap(
      ctx,
      current.camera,
      current.viewport,
      {
        allocated: current.passives.allocated,
        open: current.passives.open,
        selected: current.selected,
        matches: current.matches,
      },
      PASSIVE_MAP_RADIUS,
    );
  }, []);

  // Size the backing store to the element, in device pixels, and re-frame the
  // map the first time a real size arrives. A phone rotating gets a new fit.
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);

      // Only when it actually changed: assigning the same number still clears
      // the canvas, and this observer fires for sub-pixel layout settling that
      // rounds to the size it already had.
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        ctxTransform(canvas, dpr);
      }

      const known = inputs.current.viewport;
      if (known.width !== width || known.height !== height) {
        inputs.current = { ...inputs.current, viewport: { width, height } };
        setViewport({ width, height });
      }

      if (!framed.current && width > 1) {
        framed.current = true;
        const fitted = { scale: fitScale({ width, height }, PASSIVE_MAP_RADIUS), x: 0, y: 0 };
        inputs.current = { ...inputs.current, camera: fitted };
        setCamera(fitted);
      }

      // Immediately, from here: the clear above already happened, and waiting
      // for React to render would leave the map blank in between.
      paint();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [paint]);

  // And again whenever anything the player did changed what it should show.
  useEffect(() => {
    paint();
  }, [paint, camera, viewport, passives, selected, matches]);

  /* ------------------------------------------------------------- the camera */

  /** Zoom by `factor`, holding the map point under `anchor` still. */
  const zoomAt = useCallback(
    (factor: number, anchor: { x: number; y: number }) => {
      setCamera((current) => {
        const fit = fitScale(viewport, PASSIVE_MAP_RADIUS);
        const scale = clampScale(current.scale * factor, fit);
        if (scale === current.scale) return current;

        // Keep the anchor under the same map point: solve for the centre that
        // leaves `before` where it was.
        const before = toMap(anchor, current, viewport);
        const after = toMap(anchor, { ...current, scale }, viewport);
        return { scale, x: current.x + before.x - after.x, y: current.y + before.y - after.y };
      });
    },
    [viewport],
  );

  const recentre = useCallback(() => {
    setCamera({ scale: fitScale(viewport, PASSIVE_MAP_RADIUS), x: 0, y: 0 });
  }, [viewport]);

  /** Bring a node into view without changing the zoom. */
  const centreOn = useCallback((id: string) => {
    const node = PASSIVE_NODE_BY_ID[id];
    if (!node) return;
    setCamera((current) => ({ ...current, x: node.x, y: node.y }));
  }, []);

  /* ------------------------------------------------------------- the finger */

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));
    travelled.current = 0;
    pinchSpan.current = 0;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);

    const live = [...pointers.current.values()];

    if (live.length >= 2) {
      // Pinch: zoom by the ratio of the finger span, anchored between them.
      const [a, b] = live;
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchSpan.current > 0 && span > 0) {
        zoomAt(span / pinchSpan.current, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      pinchSpan.current = span;
      travelled.current = Infinity; // a pinch is never a tap
      return;
    }

    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    travelled.current += Math.hypot(dx, dy);
    setCamera((current) => ({
      ...current,
      x: current.x - dx / current.scale,
      y: current.y - dy / current.scale,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    pinchSpan.current = 0;
    if (!point || travelled.current > TAP_SLOP_PX) return;

    const hit = nodeAt(point, camera, viewport);
    if (hit) {
      setSelected(hit.id);
      setAnnouncement(`${hit.name}. ${hit.description}`);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  /* ----------------------------------------------------------- the keyboard */

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const steps: Readonly<Record<string, [number, number]>> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };

    const step = steps[event.key];
    if (step && selected) {
      const next = neighbourToward(selected, step[0], step[1]);
      if (next) {
        event.preventDefault();
        setSelected(next);
        centreOn(next);
        const node = PASSIVE_NODE_BY_ID[next];
        if (node) setAnnouncement(`${node.name}. ${node.description}`);
      }
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 });
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomAt(1 / ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 });
    } else if (event.key === '0') {
      event.preventDefault();
      recentre();
    }
  };

  /* ---------------------------------------------------------------- the card */

  const node = selected === null ? null : (PASSIVE_NODE_BY_ID[selected] ?? null);
  const branch = node?.branch === null || node === null ? null : PASSIVE_BRANCH_BY_ID[node.branch];
  const currency = node === null ? null : passiveCurrency(node.kind);
  const isAllocated = node !== null && passives.allocated.has(node.id);
  const allocation =
    node === null ? null : allocationCheck(node.id, passives.allocated, passives.wallet);
  const refund = node === null ? null : refundCheck(node.id, passives.allocated);

  const take = () => {
    if (!node) return;
    onAllocate(node.id);
    setAnnouncement(t('heartwood.tookNode', { name: node.name }));
  };

  const give = () => {
    if (!node) return;
    onRefund(node.id);
    setAnnouncement(t('heartwood.gaveNode', { name: node.name }));
  };

  const respec = () => {
    if (!confirmingRespec) {
      setConfirmingRespec(true);
      return;
    }
    onRespec();
    setConfirmingRespec(false);
    setSelected(PASSIVE_START_ID);
    setAnnouncement(t('heartwood.respecDone'));
  };

  /** The line under the node's name: what it is, and what it would cost. */
  const statusLine = (): string => {
    if (!node) return '';
    if (node.id === PASSIVE_START_ID) return t('heartwood.startNote');
    if (isAllocated) {
      return refund?.ok ? t('heartwood.takenRefundable') : t('heartwood.takenStranded');
    }
    if (allocation?.ok) {
      return currency === 'seed' ? t('heartwood.costSeed') : t('heartwood.costRing');
    }
    if (allocation?.reason === 'points') {
      return currency === 'seed' ? t('heartwood.needSeed') : t('heartwood.needRing');
    }
    return t('heartwood.unreachable');
  };

  return (
    <div className="heartwood">
      <header className="heartwood__bar">
        <div className="heartwood__pools">
          <span className="heartwood__pool" title={t('heartwood.ringPointsTitle')}>
            <span aria-hidden>◎</span>
            <b>{passives.wallet.ring.available}</b>
            <span className="heartwood__pool-label">{t('heartwood.ringPoints')}</span>
          </span>
          <span
            className="heartwood__pool heartwood__pool--seed"
            title={t('heartwood.seedPointsTitle')}
          >
            <span aria-hidden>🌰</span>
            <b>{passives.wallet.seed.available}</b>
            <span className="heartwood__pool-label">{t('heartwood.seedPoints')}</span>
          </span>
        </div>

        <input
          className="heartwood__search"
          type="search"
          value={query}
          placeholder={t('heartwood.search')}
          aria-label={t('heartwood.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      {/*
        Map and card together, because on a landscape phone they stop being one
        above the other and become side by side: the panel there is 800px wide
        and 300px tall, and a card under the map leaves the map a letterbox
        strip. The bar above them stays put either way.
      */}
      <div className="heartwood__body">
        <div className="heartwood__frame" ref={frameRef}>
          <canvas
            ref={canvasRef}
            className="heartwood__canvas"
            tabIndex={0}
            role="application"
            aria-label={t('heartwood.canvas')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
          />

          {/*
            The view controls sit over the map rather than in the bar, because on
            a phone the bar is at the top and the thumb is at the bottom.
          */}
          <div className="heartwood__view">
            <button
              type="button"
              onClick={() => zoomAt(ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 })}
              aria-label={t('heartwood.zoomIn')}
            >
              +
            </button>
            <button
              type="button"
              onClick={() =>
                zoomAt(1 / ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 })
              }
              aria-label={t('heartwood.zoomOut')}
            >
              −
            </button>
            <button type="button" onClick={recentre} aria-label={t('heartwood.recentre')}>
              ⌖
            </button>
          </div>

          {matches !== null && (
            <p className="heartwood__found">
              {matches.size === 0
                ? t('heartwood.searchNone')
                : t('heartwood.searchFound', { count: matches.size })}
            </p>
          )}
        </div>

        {node && (
          <section
            className={`heartwood__card${isAllocated ? ' heartwood__card--taken' : ''}`}
            style={branch ? { borderLeftColor: branch.color } : undefined}
          >
            <h3 className="heartwood__name">
              {branch && (
                <span className="heartwood__branch" aria-hidden>
                  {branch.glyph}
                </span>
              )}
              {node.name}
              <span className={`heartwood__kind heartwood__kind--${node.kind}`}>
                {t(KIND_LABEL[node.kind])}
              </span>
            </h3>
            <p className="heartwood__text">{node.description}</p>
            <p className="heartwood__status">{statusLine()}</p>

            <div className="heartwood__actions">
              {!isAllocated && (
                <button
                  type="button"
                  className="heartwood__button heartwood__button--take"
                  disabled={!allocation?.ok}
                  onClick={take}
                >
                  {t('heartwood.allocate')}
                </button>
              )}
              {isAllocated && node.id !== PASSIVE_START_ID && (
                <button
                  type="button"
                  className="heartwood__button"
                  disabled={!refund?.ok}
                  onClick={give}
                >
                  {t('heartwood.refund')}
                </button>
              )}
              <button
                type="button"
                className={`heartwood__button heartwood__button--respec${
                  confirmingRespec ? ' heartwood__button--confirm' : ''
                }`}
                onClick={respec}
                onBlur={() => setConfirmingRespec(false)}
              >
                {confirmingRespec ? t('heartwood.respecConfirm') : t('heartwood.respec')}
              </button>
            </div>
          </section>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/** Memoised: `App` re-renders every frame, and this one owns a canvas. */
export const Heartwood = memo(HeartwoodPanel);
