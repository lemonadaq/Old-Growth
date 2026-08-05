import { formatNumber } from '../engine/format';
import { RESOURCES } from '../content/resources';
import { useGameStore } from './useGameStore';
import './Hud.css';

/** Small debug readout: FPS / TPS sampled by the game loop. */
function DebugCounter() {
  const stats = useGameStore((s) => s.stats);
  return (
    <div className="hud-debug" role="status" aria-label="performance counters">
      <span>
        FPS <b>{stats.fps}</b>
      </span>
      <span>
        TPS <b>{stats.tps}</b>
      </span>
    </div>
  );
}

/** Resource totals, driven by the content-defined resource list. */
function ResourceReadout() {
  const resources = useGameStore((s) => s.snapshot.resources);
  return (
    <div className="hud-resources">
      {RESOURCES.map((def) => (
        <div className="hud-resource" key={def.id} style={{ borderColor: def.color }}>
          <span className="hud-resource__glyph" aria-hidden>
            {def.glyph}
          </span>
          <span className="hud-resource__label">{def.label}</span>
          <span className="hud-resource__value">{formatNumber(resources[def.id])}</span>
        </div>
      ))}
    </div>
  );
}

/** React HUD overlay that sits above the full-screen canvas. */
export function Hud() {
  return (
    <div className="hud">
      <header className="hud-header">
        <h1 className="hud-title">Old Growth</h1>
        <DebugCounter />
      </header>
      <ResourceReadout />
    </div>
  );
}
