import { formatNumber } from '../engine/format';
import { RESOURCES } from '../content/resources';
import { HydrationGauge } from './HydrationGauge';
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

/** Resource totals + live per-second rates, driven by the content resource list. */
function ResourceReadout() {
  const resources = useGameStore((s) => s.snapshot.resources);
  const perSecond = useGameStore((s) => s.snapshot.perSecond);
  return (
    <div className="hud-resources">
      {RESOURCES.map((def) => (
        <div className="hud-resource" key={def.id} style={{ borderColor: def.color }}>
          <span className="hud-resource__glyph" aria-hidden>
            {def.glyph}
          </span>
          <span className="hud-resource__label">{def.label}</span>
          <span className="hud-resource__value">{formatNumber(resources[def.id])}</span>
          <span className="hud-resource__rate">{formatNumber(perSecond[def.id])}/s</span>
        </div>
      ))}
    </div>
  );
}

export interface HudProps {
  /** Whether the temporary debug producers are running. */
  readonly testProducers: boolean;
  /** Toggle the temporary debug producers. */
  readonly onToggleTestProducers: () => void;
}

/** React HUD overlay that sits above the full-screen canvas. */
export function Hud({ testProducers, onToggleTestProducers }: HudProps) {
  return (
    <div className="hud">
      <header className="hud-header">
        <h1 className="hud-title">Old Growth</h1>
        <div className="hud-header__right">
          <HydrationGauge />
          <button
            type="button"
            className="hud-toggle"
            aria-pressed={testProducers}
            onClick={onToggleTestProducers}
          >
            {testProducers ? 'Stop test producer' : 'Start test producer'}
          </button>
          <DebugCounter />
        </div>
      </header>
      <ResourceReadout />
    </div>
  );
}
