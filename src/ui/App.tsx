import { useEffect, useRef, useState } from 'react';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import { enableTestProducers, disableTestProducers } from '../engine/debugProducers';
import { Renderer } from '../render/canvas';
import { Hud } from './Hud';
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

    const loop = new GameLoop({
      // Fixed-timestep simulation: advance state only, no store writes here.
      update: (dt) => {
        sim.tick(dt);
      },
      // Once per render frame: snapshot, push to the store, and draw.
      render: (alpha) => {
        const snapshot = sim.snapshot();
        gameStore.getState().setSnapshot(snapshot);
        renderer.draw(snapshot, alpha);
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

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Hud
        testProducers={testProducers}
        onToggleTestProducers={() => setTestProducers((on) => !on)}
      />
    </div>
  );
}
