import { useState } from 'react';
import { HARD_RESET_PHRASE } from '../content/save';
import { MUTE_HOTKEY } from '../content/audio';
import type { AudioVolumes } from './audio';
import './Settings.css';

/**
 * Settings: the mixer, and the three things a player can do to their save from
 * outside the game.
 *
 * Export and Import exist because a browser save is one cleared-site-data away
 * from gone, and a player who has put twenty hours into a tree deserves a copy
 * they own. Hard Reset exists because the alternative — clearing site data by
 * hand — is worse, and because a game that cannot be started over is a game with
 * one shot at a first impression.
 *
 * The typed confirmation is not theatre: this is the one button in the game that
 * playing on cannot undo. Go to Seed at least leaves a forest behind.
 */
export interface SettingsProps {
  /** The three levels and the mute, as the game is currently playing them. */
  readonly volumes: AudioVolumes;
  readonly onToggleMute: () => void;
  /** Move one channel. The value is already in `[0, 1]`. */
  readonly onSetVolume: (channel: 'master' | 'music' | 'sfx', value: number) => void;
  /** Whether the system has asked for reduced motion. Reported, not settable. */
  readonly reducedMotion: boolean;
  /** Forget every contextual hint, so the game explains itself again. */
  readonly onResetHints: () => void;
  /** Produce the export text. Async: it compresses. */
  readonly onExport: () => Promise<string>;
  /** Apply pasted text. Resolves to `null` on success, or a reason it failed. */
  readonly onImport: (text: string) => Promise<string | null>;
  readonly onHardReset: () => void;
  /** Whether the game managed to write itself down last time it tried. */
  readonly saveHealthy: boolean;
  /** When the last autosave landed, or `null` before the first. */
  readonly lastSavedAt: number | null;
}

/** "just now", "2m ago" — enough to answer "did it save?" and nothing more. */
function ago(timestamp: number | null): string {
  if (timestamp === null) return 'not yet';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/** One labelled volume slider, shown as a percentage. */
function VolumeSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className={`settings__slider${disabled ? ' settings__slider--off' : ''}`}>
      <span className="settings__slider-label">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        // Whole percent steps: the ear cannot tell 63% from 64%, and a slider
        // with a coarse step is far easier to land on a phone.
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-label={`${label} volume`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <span className="settings__slider-value">{Math.round(value * 100)}%</span>
    </label>
  );
}

export function Settings({
  volumes,
  onToggleMute,
  onSetVolume,
  reducedMotion,
  onResetHints,
  onExport,
  onImport,
  onHardReset,
  saveHealthy,
  lastSavedAt,
}: SettingsProps) {
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [resetPhrase, setResetPhrase] = useState('');
  const [hintsReset, setHintsReset] = useState(false);

  const handleExport = async () => {
    const text = await onExport();
    setExported(text);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard permission, or an insecure origin. The textarea below is
      // the fallback, and it is why the text is shown rather than only copied.
      setCopied(false);
    }
  };

  const handleImport = async () => {
    setImportError(await onImport(importText));
  };

  return (
    <aside className="settings" aria-label="settings">
      <h2 className="settings__title">Settings</h2>

      <section className="settings__block">
        <h3 className="settings__heading">Sound</h3>
        <label className="settings__toggle">
          <input type="checkbox" checked={volumes.muted} onChange={onToggleMute} />
          Mute everything <kbd className="settings__key">{MUTE_HOTKEY.toUpperCase()}</kbd>
        </label>
        {/*
          The sliders stay visible while muted rather than disappearing, and are
          disabled rather than reset: mute is a pause, not a preference, and a
          player who unmutes should get back the mix they had.
        */}
        <VolumeSlider
          label="Master"
          value={volumes.master}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('master', value)}
        />
        <VolumeSlider
          label="Music"
          value={volumes.music}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('music', value)}
        />
        <VolumeSlider
          label="Effects"
          value={volumes.sfx}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('sfx', value)}
        />
        <p className="settings__note">
          Every sound in the game is currently synthesised rather than recorded — placeholders until
          the real ones are made.
        </p>
      </section>

      {/*
        Reported, not offered. Reduced motion is read from the system setting the
        player has already made once for everything they own; showing it here is
        so that a still canopy reads as *working as asked* rather than as broken.
      */}
      {reducedMotion && (
        <section className="settings__block">
          <h3 className="settings__heading">Motion</h3>
          <p className="settings__note">
            Your system asks for reduced motion, so the canopy is holding still and the drifting
            leaves are off. Numbers, colours and sound are unaffected.
          </p>
        </section>
      )}

      {/*
        Hints are shown once and then never again, which is the only thing that
        makes them worth reading — and the only thing that makes an undo
        necessary. Somebody dismissed the one about grafting while reaching for
        the trunk, and there has to be a way back that is not "start a new save".
      */}
      <section className="settings__block">
        <h3 className="settings__heading">Hints</h3>
        <p className="settings__note">
          Contextual bubbles appear once each, when the thing they are about first becomes possible.
          The Journal’s Help tab has all of it in one place, whenever you want it.
        </p>
        <button
          type="button"
          className="settings__button"
          onClick={() => {
            onResetHints();
            setHintsReset(true);
          }}
        >
          Show hints again
        </button>
        {hintsReset && <p className="settings__note">Cleared — the game will explain itself.</p>}
      </section>

      <section className="settings__block">
        <h3 className="settings__heading">Save</h3>
        <p className={`settings__status${saveHealthy ? '' : ' settings__status--bad'}`}>
          {saveHealthy
            ? `Autosaved ${ago(lastSavedAt)}.`
            : 'This browser is refusing to store the save — export a copy to keep it.'}
        </p>

        <button type="button" className="settings__button" onClick={handleExport}>
          Export save
        </button>
        {exported && (
          <>
            <p className="settings__note">
              {copied ? 'Copied to the clipboard.' : 'Select and copy this:'}
            </p>
            <textarea className="settings__text" readOnly value={exported} rows={3} />
          </>
        )}
      </section>

      <section className="settings__block">
        <h3 className="settings__heading">Import</h3>
        <textarea
          className="settings__text"
          value={importText}
          rows={3}
          placeholder="Paste an exported save"
          onChange={(event) => {
            setImportText(event.target.value);
            setImportError(null);
          }}
        />
        <button
          type="button"
          className="settings__button"
          disabled={importText.trim() === ''}
          onClick={handleImport}
        >
          Import save
        </button>
        {importError && <p className="settings__error">{importError}</p>}
      </section>

      <section className="settings__block settings__block--danger">
        <h3 className="settings__heading">Hard reset</h3>
        <p className="settings__note">
          Everything goes: the tree, the Seeds, the Vault, the Journal, the forest. There is no
          undo.
        </p>
        <input
          className="settings__input"
          value={resetPhrase}
          placeholder={`Type ${HARD_RESET_PHRASE}`}
          aria-label={`type ${HARD_RESET_PHRASE} to confirm`}
          onChange={(event) => setResetPhrase(event.target.value)}
        />
        <button
          type="button"
          className="settings__button settings__button--danger"
          disabled={resetPhrase !== HARD_RESET_PHRASE}
          onClick={() => {
            onHardReset();
            setResetPhrase('');
          }}
        >
          Uproot everything
        </button>
      </section>
    </aside>
  );
}
