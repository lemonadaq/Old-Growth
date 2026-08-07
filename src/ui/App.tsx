import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_STEP } from '../engine/camera';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import { formatNumber } from '../engine/format';
import type { PricedGrowthOption } from '../engine/growth';
import { enableTestProducers, disableTestProducers } from '../engine/debugProducers';
import { Renderer } from '../render/canvas';
import { GrowOptionTooltip } from './GrowOptionTooltip';
import { Hud } from './Hud';
import { Tooltip } from './Tooltip';
import { UpgradePanel } from './UpgradePanel';
import { attachTreeInput } from './treeInput';
import './App.css';

/** What the tooltip is currently pointing at, in viewport coordinates. */
interface HoverState {
  readonly priced: PricedGrowthOption;
  readonly x: number;
  readonly y: number;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const [testProducers, setTestProducers] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new Simulation();
    simRef.current = sim;
    const renderer = new Renderer(canvas);

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

    // Taps resolve here, straight off pointerdown — outside the frame loop and
    // outside React state — so nothing can coalesce or defer them.
    const detachInput = attachTreeInput(canvas, {
      // The open grow menu gets first refusal on every press.
      onPress: (point) => {
        const now = Date.now();
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

        // Every part of the tree is also its own upgrade button.
        const segment = renderer.hitTest(point);
        if (segment) openMenuFor(segment.id, now);
      },

      onMiss: closeMenu,

      onPointerMove: (point) => {
        renderer.setPointer(point);
        const priced = renderer.hoverMenu(point);
        if (!priced) {
          setHover(null);
          return;
        }
        const client = toClient(point);
        setHover({ priced, x: client.x, y: client.y });
      },

      onPointerLeave: () => {
        renderer.setPointer(null);
        renderer.hoverMenu(null);
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
      if (event.key === 'Escape') {
        closeMenu();
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
    };
  }, []);

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

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Hud
        testProducers={testProducers}
        onToggleTestProducers={() => setTestProducers((on) => !on)}
      />
      <UpgradePanel onBuy={handleBuy} />
      <Tooltip
        content={hover ? <GrowOptionTooltip priced={hover.priced} /> : null}
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
      />
    </div>
  );
}
