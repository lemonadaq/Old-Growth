import { useCallback, useEffect, useRef, useState } from 'react';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import { formatNumber } from '../engine/format';
import { enableTestProducers, disableTestProducers } from '../engine/debugProducers';
import { Renderer } from '../render/canvas';
import { Hud } from './Hud';
import { UpgradePanel } from './UpgradePanel';
import { attachTreeInput } from './treeInput';
import './App.css';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const [testProducers, setTestProducers] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new Simulation();
    simRef.current = sim;
    const renderer = new Renderer(canvas);
    renderer.setTree(sim.state.tree);

    // Taps resolve here, straight off pointerdown — outside the frame loop and
    // outside React state — so nothing can coalesce or defer them.
    const detachInput = attachTreeInput(canvas, {
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
      },
      onPointerMove: (point) => renderer.setPointer(point),
      onPointerLeave: () => renderer.setPointer(null),
    });

    const loop = new GameLoop({
      // Fixed-timestep simulation: advance state only, no store writes here.
      update: (dt) => {
        sim.tick(dt);
      },
      // Once per render frame: snapshot, push to the store, and draw.
      render: (alpha) => {
        const now = Date.now();
        const snapshot = sim.snapshot(now);
        gameStore.getState().setSnapshot(snapshot);
        renderer.draw(snapshot, alpha, now);
      },
      onStats: (stats) => {
        gameStore.getState().setStats(stats);
      },
    });

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    loop.start();

    return () => {
      loop.stop();
      detachInput();
      window.removeEventListener('resize', handleResize);
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
    </div>
  );
}
