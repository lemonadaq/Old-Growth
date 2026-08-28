import type Decimal from 'break_infinity.js';
import { formatNumber } from '../engine/format';
import { RESOURCES, type ResourceDef } from '../content/resources';
import { useTweenedDecimal } from './tween';
import { BuffBar } from './BuffBar';
import { Hint } from './Hint';
import { DaylightGauge } from './DaylightGauge';
import { HydrationGauge } from './HydrationGauge';
import { SeasonBadge } from './SeasonBadge';
import { WeatherBanner } from './WeatherBanner';
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

/**
 * One resource row.
 *
 * A component of its own purely so each resource can hold its own tween — hooks
 * cannot be called in a loop over a list, and seven counters easing
 * independently is the entire point.
 */
function ResourceRow({
  def,
  amount,
  rate,
  tween,
}: {
  readonly def: ResourceDef;
  readonly amount: Decimal;
  readonly rate: Decimal;
  readonly tween: boolean;
}) {
  const shown = useTweenedDecimal(amount, tween);
  return (
    <div className="hud-resource" style={{ borderColor: def.color }}>
      <span className="hud-resource__glyph" aria-hidden>
        {def.glyph}
      </span>
      <span className="hud-resource__label">{def.label}</span>
      {/*
        The tweened figure is decoration over an exact one: the rounded value a
        player reads is on its way to the truth, so the truth is what goes to a
        screen reader and to the hover title.
      */}
      <span className="hud-resource__value" title={formatNumber(amount)}>
        {formatNumber(shown)}
      </span>
      <span className="hud-resource__rate">{formatNumber(rate)}/s</span>
    </div>
  );
}

/** Resource totals + live per-second rates, driven by the content resource list. */
function ResourceReadout({ tween }: { readonly tween: boolean }) {
  const resources = useGameStore((s) => s.snapshot.resources);
  const perSecond = useGameStore((s) => s.snapshot.perSecond);
  return (
    <div className="hud-resources">
      {RESOURCES.map((def) => (
        <ResourceRow
          key={def.id}
          def={def}
          amount={resources[def.id]}
          rate={perSecond[def.id]}
          tween={tween}
        />
      ))}
    </div>
  );
}

export interface HudProps {
  /** Whether the player has asked their system for less movement. */
  readonly reducedMotion: boolean;
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
  /** Whether the Symbionts panel is open. */
  readonly symbiontsOpen: boolean;
  /** Toggle the Symbionts panel. Mirrors the S hotkey. */
  readonly onToggleSymbionts: () => void;
  /** Whether the Settings panel is open. */
  readonly settingsOpen: boolean;
  /** Toggle Settings. Mirrors the comma hotkey. */
  readonly onToggleSettings: () => void;
  /** Whether the Seed Vault is open. */
  readonly vaultOpen: boolean;
  /** Toggle the Seed Vault. Mirrors the V hotkey. */
  readonly onToggleVault: () => void;
  /** Mark a contextual hint as read, so it never shows again. */
  readonly onDismissHint: (id: string) => void;
}

/** React HUD overlay that sits above the full-screen canvas. */
export function Hud({
  reducedMotion,
  testProducers,
  onToggleTestProducers,
  pruneMode,
  onTogglePrune,
  graftMode,
  onToggleGraft,
  journalOpen,
  onToggleJournal,
  symbiontsOpen,
  onToggleVault,
  vaultOpen,
  onToggleSymbionts,
  settingsOpen,
  onToggleSettings,
  onDismissHint,
}: HudProps) {
  const discovered = useGameStore((s) => s.snapshot.species.discovered.length);
  const residents = useGameStore((s) => s.snapshot.symbionts.filter((r) => r.active).length);
  const prestige = useGameStore((s) => s.snapshot.prestige);
  // The gating table, read once. Every control below that can be absent asks
  // this and nothing else — there is no second opinion about when a tool exists.
  const unlocked = useGameStore((s) => s.snapshot.progression.unlocked);
  const hint = useGameStore((s) => s.snapshot.progression.hint);
  const maturity = Math.round(prestige.progress.fraction * 100);

  return (
    <div className="hud">
      <header className="hud-header">
        <div className="hud-header__left">
          <h1 className="hud-title">Old Growth</h1>
          <BuffBar />
        </div>
        <div className="hud-header__right">
          {/*
            Gated controls are *absent* until their system opens, not disabled.
            A greyed button is a promise the player cannot read — it says "this
            exists and you may not have it" without saying why — while a row of
            three buttons that becomes four is simply the game getting bigger.
            The one exception is the Vault, below, which has a number to show.
          */}
          {unlocked.has('pruning') && (
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
          )}
          {unlocked.has('grafting') && (
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
          )}
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
          {unlocked.has('symbionts') && (
            <button
              type="button"
              className="hud-toggle"
              aria-pressed={symbiontsOpen}
              aria-keyshortcuts="S"
              title="Symbionts (S) — the creatures living in your tree"
              onClick={onToggleSymbionts}
            >
              <span aria-hidden>🐝</span> Symbionts
              {residents > 0 && <span className="hud-toggle__badge">{residents}</span>}
            </button>
          )}
          {/*
            The Vault is the only toggle that announces itself: maturity is the
            one milestone the player cannot see on the tree, and a Go to Seed
            button buried in a panel nobody opened would be a whole system that
            never happens.

            It is also the one gated control that appears *before* it is any use
            — at three quarters grown (STEP 17), dimmed, wearing its own progress.
            That is deliberate and it is the opposite of the rule the tools
            follow: the last quarter of a run is exactly when the player should be
            deciding whether to spend it growing or to end it, and they cannot
            weigh a choice they have not been told is coming.
          */}
          {unlocked.has('prestige') && (
            <button
              type="button"
              className={`hud-toggle${
                prestige.progress.ready ? ' hud-toggle--ready' : ' hud-toggle--dim'
              }`}
              aria-pressed={vaultOpen}
              aria-keyshortcuts="V"
              title={
                prestige.progress.ready
                  ? 'Seed Vault (V) — Heirlooms, the Old Growth forest, and Go to Seed'
                  : `Seed Vault (V) — ${maturity}% grown. Go to Seed opens at full maturity.`
              }
              onClick={onToggleVault}
            >
              <span aria-hidden>🌰</span> Vault
              {prestige.progress.ready ? (
                <span className="hud-toggle__badge">ready</span>
              ) : (
                <span className="hud-toggle__badge">{maturity}%</span>
              )}
            </button>
          )}
          <button
            type="button"
            className="hud-toggle"
            aria-pressed={settingsOpen}
            aria-keyshortcuts=","
            title="Settings (,) — sound, export, import, hard reset"
            onClick={onToggleSettings}
          >
            <span aria-hidden>⚙</span> Settings
          </button>
          <SeasonBadge />
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
      <WeatherBanner />
      <ResourceReadout tween={!reducedMotion} />
      {/*
        One bubble, keyed by id so a second hint arriving replaces the first
        outright rather than inheriting its timer. It is the last thing in the
        HUD and absolutely positioned, so it can never move a control.
      */}
      {hint && <Hint key={hint.id} hint={hint} onDismiss={onDismissHint} />}
    </div>
  );
}
