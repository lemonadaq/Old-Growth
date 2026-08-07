import { formatNumber } from '../engine/format';
import { RESOURCES } from '../content/resources';
import { BuffBar } from './BuffBar';
import { DaylightGauge } from './DaylightGauge';
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
  /** Whether the scissors are out. */
  readonly pruneMode: boolean;
  /** Toggle prune mode. Mirrors the P hotkey. */
  readonly onTogglePrune: () => void;
  /** Whether the grafting knife is out. */
  readonly graftMode: boolean;
  /** Toggle graft mode. Mirrors the G hotkey. */
  readonly onToggleGraft: () => void;
  /** Whether the Journal is open. */
  readonly journalOpen: boolean;
  /** Toggle the Journal. Mirrors the J hotkey. */
  readonly onToggleJournal: () => void;
}

/** React HUD overlay that sits above the full-screen canvas. */
export function Hud({
  testProducers,
  onToggleTestProducers,
  pruneMode,
  onTogglePrune,
  graftMode,
  onToggleGraft,
  journalOpen,
  onToggleJournal,
}: HudProps) {
  const discovered = useGameStore((s) => s.snapshot.species.discovered.length);
  return (
    <div className="hud">
      <header className="hud-header">
        <div className="hud-header__left">
          <h1 className="hud-title">Old Growth</h1>
          <BuffBar />
        </div>
        <div className="hud-header__right">
          <button
            type="button"
            className="hud-toggle hud-toggle--prune"
            aria-pressed={pruneMode}
            aria-keyshortcuts="P"
            title="Prune mode (P) — cut a limb for Sap and Deadwood"
            onClick={onTogglePrune}
          >
            <span aria-hidden>✂</span> {pruneMode ? 'Pruning' : 'Prune'}
          </button>
          <button
            type="button"
            className="hud-toggle hud-toggle--graft"
            aria-pressed={graftMode}
            aria-keyshortcuts="G"
            title="Graft mode (G) — join two limbs of different species into a hybrid"
            onClick={onToggleGraft}
          >
            <span aria-hidden>🜋</span> {graftMode ? 'Grafting' : 'Graft'}
          </button>
          <button
            type="button"
            className="hud-toggle"
            aria-pressed={journalOpen}
            aria-keyshortcuts="J"
            title="Journal (J) — species and hybrids"
            onClick={onToggleJournal}
          >
            <span aria-hidden>📖</span> Journal
            {discovered > 0 && <span className="hud-toggle__badge">{discovered}</span>}
          </button>
          <DaylightGauge />
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
