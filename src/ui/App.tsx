import { useEffect, useRef } from 'react';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import type { GameSnapshot } from '../engine/types';
import { Renderer } from '../render/canvas';
import { Hud } from './Hud';
import './App.css';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new Simulation();
    const renderer = new Renderer(canvas);

    // Latest snapshot shared between the fixed update step and the render step.
    let latest: GameSnapshot = sim.snapshot();

    const loop = new GameLoop({
      update: (dt) => {
        sim.tick(dt);
        latest = sim.snapshot();
        gameStore.getState().setSnapshot(latest);
      },
      render: (alpha) => {
        renderer.draw(latest, alpha);
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
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Hud />
    </div>
  );
}
