import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_STEP } from '../engine/camera';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import { formatNumber } from '../engine/format';
import type { PricedGrowthOption } from '../engine/growth';
import type { PruneQuote } from '../engine/prune';
import { RESOURCE_BY_ID } from '../content/resources';
import { enableTestProducers, disableTestProducers } from '../engine/debugProducers';
import { Renderer } from '../render/canvas';
import { GrowOptionTooltip } from './GrowOptionTooltip';
import { Hud } from './Hud';
import { LeafTooltip } from './LeafTooltip';
import { PruneTooltip } from './PruneTooltip';
import { Tooltip } from './Tooltip';
import { UpgradePanel } from './UpgradePanel';
import { Workshop } from './Workshop';
import { playSnip } from './sfx';
import { attachTreeInput } from './treeInput';
import './App.css';

/**
 * What the tooltip is currently pointing at, in viewport coordinates.
 *
 * Three things on the canvas can explain themselves: a dial in the grow menu
 * (what a part would cost and add), a leaf cluster already on the tree (how much
 * sky it can still see), and — with the scissors out — a limb about to be cut
 * (what it pays and what it costs). Prune mode owns the pointer entirely while
 * it is on; otherwise the menu wins where it overlaps a leaf.
 */
type HoverState =
  | {
      readonly kind: 'option';
      readonly priced: PricedGrowthOption;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'leaf'; readonly nodeId: string; readonly x: number; readonly y: number }
  | { readonly kind: 'prune'; readonly quote: PruneQuote; readonly x: number; readonly y: number };

/** How far above the tap the Dew number is spawned, so it clears the "+N". */
const DEW_LABEL_OFFSET_PX = 26;

/** Vertical spacing between the payout numbers a cut throws up. */
const PRUNE_LABEL_SPACING_PX = 24;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [testProducers, setTestProducers] = useState(false);
  const [pruneMode, setPruneMode] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  // The input handlers are wired once, on mount, and must read the *current*
  // mode rather than the one that was in force when they were created.
  const pruneModeRef = useRef(false);
  const togglePrune = useCallback(() => setPruneMode((on) => !on), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new Simulation();
    simRef.current = sim;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    renderer.setSoil(sim.state.soil);

    // The renderer caches the projected tree; re-push it only when the graph's
    // structure actually changed, never per frame.
    let treeRevision = -1;
    const syncTree = (now: number) => {
      if (sim.state.tree.revision === treeRevision) return;
      treeRevision = sim.state.tree.revision;
      renderer.setTree(sim.state.tree.toSegments(), sim.state.tree.placements(), now);
    };
    syncTree(Date.now());

    /** Canvas-local point → viewport point, for positioning the DOM tooltip. */
    const toClient = (point: { x: number; y: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: point.x + rect.left, y: point.y + rect.top };
    };

    const openMenuFor = (nodeId: string, now: number) => {
      renderer.openMenu(nodeId, sim.growthOptions(nodeId), now);
    };

    const closeMenu = () => {
      renderer.closeMenu();
      setHover(null);
    };

    /** Drop the prune mark and its tooltip. */
    const clearPruneMark = () => {
      renderer.setPruneSelection(null);
      setHover(null);
    };

    /**
     * Mark the subtree at `nodeId`, quoting it against live prices.
     *
     * `armed` is the inline confirm: hovering marks, the first click arms, and
     * only a second click on the same limb cuts. Re-marking a different limb
     * always lands unarmed, so a confirm can never be inherited by a limb the
     * player did not confirm.
     */
    const markPrune = (nodeId: string, armed: boolean): PruneQuote | null => {
      const quote = sim.pruneQuote(nodeId);
      if (!quote) {
        clearPruneMark();
        return null;
      }
      renderer.setPruneSelection({
        nodeId,
        ids: new Set(quote.nodeIds),
        quote,
        armed,
      });
      return quote;
    };

    /** Execute the marked cut: snip, debris, payout numbers. */
    const performPrune = (nodeId: string, at: { x: number; y: number }, now: number) => {
      // Captured before the cut — the graph is about to forget these nodes.
      const debris = renderer.prunePoints();

      const result = sim.prunePart(nodeId);
      if (!result) {
        clearPruneMark();
        return;
      }

      playSnip();
      renderer.effects.spawnPruneBurst(debris, now);
      syncTree(now);
      clearPruneMark();

      let row = 0;
      for (const refund of result.quote.refunds) {
        renderer.effects.spawnFloatingNumber(
          at.x,
          at.y - row * PRUNE_LABEL_SPACING_PX,
          `+${formatNumber(refund.amount)} ${RESOURCE_BY_ID[refund.resource].label}`,
          false,
          now,
        );
        row += 1;
      }
      renderer.effects.spawnFloatingNumber(
        at.x,
        at.y - row * PRUNE_LABEL_SPACING_PX,
        `+${formatNumber(result.quote.deadwood)} Deadwood`,
        false,
        now,
      );
      if (result.surge) {
        renderer.effects.spawnHit(
          at.x,
          at.y - (row + 1) * PRUNE_LABEL_SPACING_PX,
          'Lateral Surge!',
          true,
          now,
        );
      }
    };

    // Taps resolve here, straight off pointerdown — outside the frame loop and
    // outside React state — so nothing can coalesce or defer them.
    const detachInput = attachTreeInput(canvas, {
      // The open grow menu gets first refusal on every press — unless the
      // scissors are out, in which case prune mode owns the whole surface.
      onPress: (point) => {
        const now = Date.now();

        if (pruneModeRef.current) {
          const segment = renderer.hitTest(point);
          const nodeId = segment?.id ?? null;

          // Nothing cuttable under the press: cancel whatever was marked. The
          // trunk is the graph root and has no joint to be cut at.
          if (!nodeId || nodeId === sim.state.tree.rootId) {
            clearPruneMark();
            return true;
          }

          const mark = renderer.pruneMark;
          if (mark?.armed && mark.nodeId === nodeId) {
            performPrune(nodeId, point, now);
            return true;
          }

          // First press: mark and arm, so touch (which never hovers) still gets
          // its confirm.
          const quote = markPrune(nodeId, true);
          if (quote) {
            const client = toClient(point);
            setHover({ kind: 'prune', quote, x: client.x, y: client.y });
          }
          return true;
        }

        if (!renderer.isMenuArmed(now)) return false;

        const priced = renderer.menuOptionAt(point);
        if (!priced) return false;

        if (priced.affordable) {
          const grown = sim.growPart(priced.option.parentId, priced.option.type);
          if (grown) {
            syncTree(now);
            // Prices and affordability moved; re-open on the same node so the
            // player can keep building without re-tapping the limb.
            openMenuFor(priced.option.parentId, now);
            renderer.hoverMenu(point);
          }
        }
        // Consumed either way: a tap on a dial is never also a tap on the tree.
        return true;
      },

      hitTest: (point) => renderer.hitTest(point) !== null,

      onHit: (point) => {
        const now = Date.now();
        const result = sim.click(now);
        renderer.effects.spawnHit(
          point.x,
          point.y,
          `+${formatNumber(result.gain)}`,
          result.crit,
          now,
        );

        // The day's first tap shakes the Dew loose. Spawned a little above the
        // tap and flagged as a crit so it lands gold — it is the same kind of
        // event to the player, and it should not be mistaken for the tap itself.
        if (result.dew) {
          renderer.effects.spawnHit(
            point.x,
            point.y - DEW_LABEL_OFFSET_PX,
            `Dew +${formatNumber(result.dew)}`,
            true,
            now,
          );
        }

        // Every part of the tree is also its own upgrade button.
        const segment = renderer.hitTest(point);
        if (segment) openMenuFor(segment.id, now);
      },

      onMiss: closeMenu,

      onPointerMove: (point) => {
        renderer.setPointer(point);
        const client = toClient(point);

        if (pruneModeRef.current) {
          const segment = renderer.hitTest(point);
          const nodeId = segment?.id ?? null;
          if (!nodeId || nodeId === sim.state.tree.rootId) {
            clearPruneMark();
            return;
          }

          const mark = renderer.pruneMark;
          // Already on this limb: keep the confirm the player has armed rather
          // than disarming it under a stray pixel of mouse movement.
          if (mark?.nodeId === nodeId) {
            setHover({ kind: 'prune', quote: mark.quote, x: client.x, y: client.y });
            return;
          }

          const quote = markPrune(nodeId, false);
          if (quote) setHover({ kind: 'prune', quote, x: client.x, y: client.y });
          return;
        }

        const priced = renderer.hoverMenu(point);
        if (priced) {
          setHover({ kind: 'option', priced, x: client.x, y: client.y });
          return;
        }

        // Nothing in the menu under the cursor — is there a leaf under it?
        const segment = renderer.hitTest(point);
        if (segment?.kind === 'leafCluster') {
          setHover({ kind: 'leaf', nodeId: segment.id, x: client.x, y: client.y });
          return;
        }
        setHover(null);
      },

      onPointerLeave: () => {
        renderer.setPointer(null);
        renderer.hoverMenu(null);
        if (pruneModeRef.current) renderer.setPruneSelection(null);
        setHover(null);
      },

      onDrag: (dx, dy) => {
        renderer.panBy(dx, dy);
        // The tooltip was pinned to a dial that has just moved under the camera.
        setHover(null);
      },

      onScroll: (deltaX, deltaY) => {
        renderer.scrollBy(deltaX, deltaY);
        setHover(null);
      },

      onZoom: (factor, at) => {
        renderer.zoomAt(at, factor);
        setHover(null);
      },
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      // Never steal a keystroke aimed at a control the player is typing into.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }

      if (event.key === 'Escape') {
        // Escape backs out one layer at a time: an armed cut first, then the
        // mode, then the grow menu.
        if (pruneModeRef.current) {
          if (renderer.pruneMark?.armed) {
            renderer.setPruneSelection(null);
            setHover(null);
          } else {
            setPruneMode(false);
          }
          return;
        }
        closeMenu();
        return;
      }
      if (event.key === 'p' || event.key === 'P') {
        togglePrune();
        return;
      }
      // Zoom from the keyboard, for mice with no pinch gesture to offer.
      if (event.key === '+' || event.key === '=') {
        renderer.zoomBy(ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        renderer.zoomBy(1 / ZOOM_STEP);
      } else if (event.key === '0') {
        renderer.resetCamera();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const loop = new GameLoop({
      // Fixed-timestep simulation: advance state only, no store writes here.
      update: (dt) => {
        sim.tick(dt);
      },
      // Once per render frame: snapshot, push to the store, and draw.
      render: (alpha) => {
        const now = Date.now();
        syncTree(now);
        const snapshot = sim.snapshot(now);
        gameStore.getState().setSnapshot(snapshot);
        renderer.draw(snapshot, alpha, now);
      },
      onStats: (stats) => {
        gameStore.getState().setStats(stats);
      },
    });

    const handleResize = () => {
      renderer.resize();
      setHover(null);
    };
    window.addEventListener('resize', handleResize);

    loop.start();

    return () => {
      loop.stop();
      detachInput();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      simRef.current = null;
      rendererRef.current = null;
    };
  }, [togglePrune]);

  // Mirror prune mode into the places that cannot read React state: the input
  // handlers (through a ref) and the renderer (which draws the mark).
  useEffect(() => {
    pruneModeRef.current = pruneMode;
    rendererRef.current?.setPruneMode(pruneMode);
    setHover(null);
  }, [pruneMode]);

  // Toggle the temporary debug producers on the live simulation.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (testProducers) {
      enableTestProducers(sim);
    } else {
      disableTestProducers(sim);
    }
  }, [testProducers]);

  const handleBuy = useCallback((id: string) => {
    simRef.current?.buyUpgrade(id);
  }, []);

  const handleCraft = useCallback((totemId: string) => {
    simRef.current?.craftTotem(totemId);
  }, []);

  return (
    <div className="app">
      <canvas
        ref={canvasRef}
        className={`app-canvas${pruneMode ? ' app-canvas--pruning' : ''}`}
      />
      <Hud
        testProducers={testProducers}
        onToggleTestProducers={() => setTestProducers((on) => !on)}
        pruneMode={pruneMode}
        onTogglePrune={togglePrune}
      />
      <Workshop onCraft={handleCraft} />
      <UpgradePanel onBuy={handleBuy} />
      <Tooltip
        content={
          hover?.kind === 'option' ? (
            <GrowOptionTooltip priced={hover.priced} />
          ) : hover?.kind === 'leaf' ? (
            <LeafTooltip nodeId={hover.nodeId} />
          ) : hover?.kind === 'prune' ? (
            <PruneTooltip quote={hover.quote} />
          ) : null
        }
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
      />
    </div>
  );
}
