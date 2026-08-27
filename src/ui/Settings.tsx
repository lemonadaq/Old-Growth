import { useState } from 'react';
import { HARD_RESET_PHRASE } from '../content/save';
import './Settings.css';

/**
 * Settings: the three things a player can do to their save from outside the
 * game, plus the one preference the game can honour today.
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
  readonly muted: boolean;
  readonly onToggleMute: () => void;
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

export function Settings({
  muted,
  onToggleMute,
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
        <label className="settings__toggle">
          <input type="checkbox" checked={muted} onChange={onToggleMute} />
          Mute sound effects
        </label>
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
