import { Component, type ErrorInfo, type ReactNode } from 'react';
import { encodeSave, readRawSave } from '../engine/storage';
import { parseSaveText } from '../engine/save';
import { t } from './i18n';
import './ErrorBoundary.css';

/**
 * The last thing standing when the game falls over.
 *
 * An uncaught render error unmounts the whole tree, which in a game whose entire
 * state lives in one browser key is not "a blank page" — it is a player staring
 * at nothing with twenty hours of tree somewhere behind it, no way to reach it,
 * and no idea whether reloading will make it worse. This screen exists to answer
 * exactly that: the save is untouched, here is a copy of it you own, and here is
 * the button that tries again.
 *
 * Two decisions carry the whole thing:
 *
 * **The save text is captured in `getDerivedStateFromError`.** That runs in the
 * render phase, *before* React commits the unmount — and `App`'s cleanup writes
 * the simulation to storage on its way out. Reading storage afterwards would
 * hand the player whatever a half-dead game managed to serialise. Reading it
 * here hands them the last autosave that was written while the game still
 * worked.
 *
 * **Nothing here clears anything.** No "start fresh" button, no automatic wipe
 * on a repeated crash. A crash loop is frustrating; a crash loop that deleted
 * the file is unrecoverable, and Settings already has a Hard Reset behind a
 * typed confirmation for the player who genuinely wants one.
 */
export interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  /** The save as it stood the instant the crash was caught, or `null`. */
  readonly rescued: string | null;
  /** The export text, once the player has asked for it. */
  readonly exported: string | null;
  readonly copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    error: null,
    rescued: null,
    exported: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, rescued: readRawSave(), exported: null, copied: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Stripped from the production bundle by the build; in development this is
    // the only place the stack is legible, since the screen below deliberately
    // shows the player a message rather than a trace.
    console.error('Old Growth crashed:', error, info.componentStack);
  }

  /**
   * Turn the rescued file into the same `OG1:` text the Settings panel exports,
   * so it goes back in through the same Import box.
   *
   * If it will not parse it is handed over raw. A save this build cannot read is
   * still the player's save, and a screen that answers "we could not export it"
   * has failed at the one job it has.
   */
  private handleExport = async (): Promise<void> => {
    const { rescued } = this.state;
    if (rescued === null) return;

    const parsed = parseSaveText(rescued);
    let text = rescued;
    if (parsed.ok) {
      try {
        text = await encodeSave(parsed.envelope);
      } catch {
        // Fall back to the raw JSON: it imports too, just longer.
      }
    }

    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard permission, or an insecure origin. The textarea is the
      // fallback, and is why the text is shown rather than only copied.
    }
    this.setState({ exported: text, copied });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error, rescued, exported, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash" role="alert">
        <div className="crash__card">
          <h1 className="crash__title">{t('crash.title')}</h1>
          <p className="crash__body">{t('crash.body')}</p>
          <p className={`crash__status${rescued === null ? ' crash__status--none' : ''}`}>
            {rescued === null ? t('crash.noSave') : t('crash.saveSafe')}
          </p>

          <div className="crash__actions">
            <button type="button" className="crash__button" onClick={this.handleReload}>
              {t('crash.reload')}
            </button>
            {rescued !== null && (
              <button
                type="button"
                className="crash__button crash__button--ghost"
                onClick={() => void this.handleExport()}
              >
                {t('crash.export')}
              </button>
            )}
          </div>

          {exported !== null && (
            <>
              <p className="crash__note">{copied ? t('crash.copied') : t('crash.selectCopy')}</p>
              <textarea className="crash__text" readOnly value={exported} rows={4} />
            </>
          )}

          {/*
            The message, not the stack: a trace on the screen reads as the game
            blaming the player for something. It is here at all because "it
            broke" with nothing after it is the one bug report nobody can act on.
          */}
          <p className="crash__detail">{t('crash.detail', { message: error.message })}</p>
        </div>
      </div>
    );
  }
}
