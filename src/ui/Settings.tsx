import { useState, memo } from 'react';
import { HARD_RESET_PHRASE } from '../content/save';
import { MUTE_HOTKEY } from '../content/audio';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../content/settings';
import { t } from './i18n';
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
  /** Display preferences, as the game is currently drawing them. */
  readonly display: {
    readonly fontScale: number;
    readonly leafPatterns: boolean;
    readonly hintsStay: boolean;
  };
  /** Change one or more display preferences. */
  readonly onSetDisplay: (next: {
    fontScale?: number;
    leafPatterns?: boolean;
    hintsStay?: boolean;
  }) => void;
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
  if (timestamp === null) return t('time.notYet');
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return t('time.justNow');
  if (seconds < 60) return t('time.secondsAgo', { seconds });
  return t('time.minutesAgo', { minutes: Math.floor(seconds / 60) });
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
        aria-label={t('settings.volumeOf', { channel: label })}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <span className="settings__slider-value">{Math.round(value * 100)}%</span>
    </label>
  );
}

function SettingsPanel({
  volumes,
  onToggleMute,
  onSetVolume,
  reducedMotion,
  display,
  onSetDisplay,
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
    <aside className="settings" aria-label={t('settings.title')}>
      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.sound')}</h3>
        <label className="settings__toggle">
          <input type="checkbox" checked={volumes.muted} onChange={onToggleMute} />
          {t('settings.mute')} <kbd className="settings__key">{MUTE_HOTKEY.toUpperCase()}</kbd>
        </label>
        {/*
          The sliders stay visible while muted rather than disappearing, and are
          disabled rather than reset: mute is a pause, not a preference, and a
          player who unmutes should get back the mix they had.
        */}
        <VolumeSlider
          label={t('settings.master')}
          value={volumes.master}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('master', value)}
        />
        <VolumeSlider
          label={t('settings.music')}
          value={volumes.music}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('music', value)}
        />
        <VolumeSlider
          label={t('settings.effects')}
          value={volumes.sfx}
          disabled={volumes.muted}
          onChange={(value) => onSetVolume('sfx', value)}
        />
        <p className="settings__note">{t('settings.soundNote')}</p>
      </section>

      {/*
        Display sits above Motion and Hints because it is the section a player
        goes looking for: text they cannot read is the thing that sends someone
        to Settings in the first place.
      */}
      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.display')}</h3>
        <label className="settings__slider">
          <span className="settings__slider-label">{t('settings.fontScale')}</span>
          <input
            type="range"
            min={FONT_SCALE_MIN * 100}
            max={FONT_SCALE_MAX * 100}
            step={FONT_SCALE_STEP * 100}
            value={Math.round(display.fontScale * 100)}
            aria-label={t('settings.fontScale')}
            onChange={(event) => onSetDisplay({ fontScale: Number(event.target.value) / 100 })}
          />
          <span className="settings__slider-value">{Math.round(display.fontScale * 100)}%</span>
        </label>
        <p className="settings__note">{t('settings.fontScaleNote')}</p>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={display.leafPatterns}
            onChange={(event) => onSetDisplay({ leafPatterns: event.target.checked })}
          />
          {t('settings.leafPatterns')}
        </label>
        <p className="settings__note">{t('settings.leafPatternsNote')}</p>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={display.hintsStay}
            onChange={(event) => onSetDisplay({ hintsStay: event.target.checked })}
          />
          {t('settings.hintsStay')}
        </label>
        <p className="settings__note">{t('settings.hintsStayNote')}</p>
      </section>

      {/*
        The keyboard section is a reference, not a control: everything it
        describes already works, and a player who cannot use a pointer has no
        way to discover any of it from the canvas itself.
      */}
      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.keyboard')}</h3>
        <p className="settings__note">{t('settings.keyboardNote')}</p>
      </section>

      {/*
        Reported, not offered. Reduced motion is read from the system setting the
        player has already made once for everything they own; showing it here is
        so that a still canopy reads as *working as asked* rather than as broken.
      */}
      {reducedMotion && (
        <section className="settings__block">
          <h3 className="settings__heading">{t('settings.motion')}</h3>
          <p className="settings__note">{t('settings.motionNote')}</p>
        </section>
      )}

      {/*
        Hints are shown once and then never again, which is the only thing that
        makes them worth reading — and the only thing that makes an undo
        necessary. Somebody dismissed the one about grafting while reaching for
        the trunk, and there has to be a way back that is not "start a new save".
      */}
      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.hints')}</h3>
        <p className="settings__note">{t('settings.hintsNote')}</p>
        <button
          type="button"
          className="settings__button"
          onClick={() => {
            onResetHints();
            setHintsReset(true);
          }}
        >
          {t('settings.showHints')}
        </button>
        {hintsReset && <p className="settings__note">{t('settings.hintsCleared')}</p>}
      </section>

      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.save')}</h3>
        <p className={`settings__status${saveHealthy ? '' : ' settings__status--bad'}`}>
          {saveHealthy
            ? t('settings.autosaved', { when: ago(lastSavedAt) })
            : t('settings.saveRefused')}
        </p>

        <button type="button" className="settings__button" onClick={handleExport}>
          {t('settings.export')}
        </button>
        {exported && (
          <>
            <p className="settings__note">
              {copied ? t('settings.copied') : t('settings.selectCopy')}
            </p>
            <textarea className="settings__text" readOnly value={exported} rows={3} />
          </>
        )}
      </section>

      <section className="settings__block">
        <h3 className="settings__heading">{t('settings.import')}</h3>
        <textarea
          className="settings__text"
          value={importText}
          rows={3}
          placeholder={t('settings.importPaste')}
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
          {t('settings.importButton')}
        </button>
        {importError && <p className="settings__error">{importError}</p>}
      </section>

      <section className="settings__block settings__block--danger">
        <h3 className="settings__heading">{t('settings.hardReset')}</h3>
        <p className="settings__note">{t('settings.hardResetNote')}</p>
        <input
          className="settings__input"
          value={resetPhrase}
          placeholder={t('settings.hardResetPlaceholder', { phrase: HARD_RESET_PHRASE })}
          aria-label={t('settings.hardResetConfirm', { phrase: HARD_RESET_PHRASE })}
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
          {t('settings.uproot')}
        </button>
      </section>
    </aside>
  );
}

/**
 * Memoised because `App` re-renders far more often than any of these settings
 * change. Its props are all `useCallback`s and plain values from `App`, so the
 * comparison holds.
 */
export const Settings = memo(SettingsPanel);
