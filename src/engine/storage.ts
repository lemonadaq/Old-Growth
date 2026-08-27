import {
  EXPORT_PREFIX_DEFLATE,
  EXPORT_PREFIX_PLAIN,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
} from '../content/save';
import { migrateSave } from './migrations';
import { parseSaveText, type SaveEnvelope } from './save';

/**
 * Where a save lives, and how it survives being written badly.
 *
 * The whole design is one rule: **a save is replaced, never edited.** Before the
 * live key is overwritten, whatever was under it is copied to the backup key —
 * so the backup is always a file that parsed cleanly the last time it mattered.
 * A tab killed mid-write costs one autosave interval rather than the run.
 *
 * Storage itself is treated as unreliable on purpose. `localStorage` throws on a
 * full disk, in private windows on some browsers, and wherever site data is
 * blocked; every call here is guarded, and the game keeps running without
 * persistence rather than failing to start. That is why the API returns results
 * instead of throwing.
 */

/** Somewhere to keep a save. `localStorage`, or anything shaped like it. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's own storage, or `null` where there is none.
 *
 * Accessing `localStorage` can itself throw — a blocked-cookies setting turns
 * the property access into a `SecurityError` — so even reaching for it is
 * wrapped.
 */
export function browserStore(): SaveStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // A probe: some browsers hand out a `localStorage` that throws on write.
    const probe = '__og_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** How a load ended. */
export type LoadOutcome =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'loaded';
      readonly envelope: SaveEnvelope;
      readonly applied: readonly string[];
    }
  /** The live save was unreadable and the backup was used instead. */
  | {
      readonly kind: 'recovered';
      readonly envelope: SaveEnvelope;
      readonly applied: readonly string[];
      readonly reason: string;
    }
  /** Both keys failed. The reason is written for a player, not a log. */
  | { readonly kind: 'failed'; readonly reason: string };

/** Read one key and bring it up to date, or say why it could not be. */
function readSlot(store: SaveStore, key: string): LoadOutcome {
  let text: string | null = null;
  try {
    text = store.getItem(key);
  } catch {
    return { kind: 'failed', reason: 'The save could not be read from this browser.' };
  }
  if (text === null || text === '') return { kind: 'none' };

  const parsed = parseSaveText(text);
  if (!parsed.ok) return { kind: 'failed', reason: parsed.reason };

  const migrated = migrateSave(parsed.envelope);
  if (!migrated.ok) return { kind: 'failed', reason: migrated.reason };

  return { kind: 'loaded', envelope: migrated.envelope, applied: migrated.applied };
}

/**
 * Load the game, falling back to the backup if the live save is unreadable.
 *
 * A corrupt live save is not an error the player has to act on — it is a bad
 * write from a tab that died, and the backup is right there. The outcome says
 * `recovered` so the UI can mention it calmly and carry on.
 */
export function loadGame(store: SaveStore | null = browserStore()): LoadOutcome {
  if (!store) return { kind: 'none' };

  const live = readSlot(store, SAVE_KEY);
  if (live.kind === 'loaded' || live.kind === 'none') return live;

  const backup = readSlot(store, SAVE_BACKUP_KEY);
  if (backup.kind === 'loaded') {
    return {
      kind: 'recovered',
      envelope: backup.envelope,
      applied: backup.applied,
      reason: live.reason,
    };
  }

  return live;
}

/**
 * Write a save, rotating the previous one into the backup slot first.
 *
 * Returns whether it landed. A `false` here is worth surfacing once — a player
 * whose disk is full should learn it before they close the tab, not after.
 */
export function saveGame(
  envelope: SaveEnvelope,
  store: SaveStore | null = browserStore(),
): boolean {
  if (!store) return false;

  try {
    const previous = store.getItem(SAVE_KEY);
    // Only rotate a save that still parses: promoting a corrupt live file into
    // the backup slot would destroy the very thing the slot is for.
    if (previous && parseSaveText(previous).ok) {
      store.setItem(SAVE_BACKUP_KEY, previous);
    }
    store.setItem(SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/**
 * Erase both keys. What Hard Reset does, and it keeps nothing on purpose —
 * including the backup, which would otherwise let the next load undo it.
 */
export function clearSave(store: SaveStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
    store.removeItem(SAVE_BACKUP_KEY);
  } catch {
    // Nothing to do: the player asked for it gone, and it is as gone as this
    // browser will allow.
  }
}

/* ------------------------------------------------------------------ export */

/** Base64 for a byte array, without pulling in Node's `Buffer`. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The reverse. Throws on text that is not base64, which callers catch. */
function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Squash a byte array through the platform's deflate, where there is one. */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** The reverse. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * Encode a save for the clipboard: compressed base64, prefixed with the encoding
 * that produced it.
 *
 * The prefix is what lets the *reader* stay simple and lets an old browser stay
 * supported: a desktop exports `OG1:` (deflated), a browser without
 * `CompressionStream` exports `OG0:` (plain), and either imports anywhere. A
 * save is mostly repeated key names, so deflate takes a typical one down by
 * around 80% — the difference between a paste that fits in a chat message and
 * one that does not.
 */
export async function encodeSave(envelope: SaveEnvelope): Promise<string> {
  const json = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(json) as Uint8Array<ArrayBuffer>;

  if (typeof CompressionStream === 'undefined') {
    return EXPORT_PREFIX_PLAIN + bytesToBase64(bytes);
  }

  try {
    return EXPORT_PREFIX_DEFLATE + bytesToBase64(await deflate(bytes));
  } catch {
    return EXPORT_PREFIX_PLAIN + bytesToBase64(bytes);
  }
}

/**
 * Read an exported save back.
 *
 * Accepts all three shapes it could arrive in — `OG1:`, `OG0:`, and raw JSON —
 * because a player pasting a save has no idea which they were handed, and a
 * paste that fails on a stray newline is a support request. Whitespace is
 * stripped for the same reason: chat clients wrap long lines.
 */
export async function decodeSave(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // Raw JSON: what someone pasted out of devtools, or out of the backup key.
  if (trimmed.startsWith('{')) return trimmed;

  const compressed = trimmed.startsWith(EXPORT_PREFIX_DEFLATE);
  const plain = trimmed.startsWith(EXPORT_PREFIX_PLAIN);
  if (!compressed && !plain) return null;

  const body = trimmed.slice(EXPORT_PREFIX_DEFLATE.length).replace(/\s+/g, '');

  try {
    const bytes = base64ToBytes(body);
    const decoded = compressed ? await inflate(bytes) : bytes;
    return new TextDecoder().decode(decoded);
  } catch {
    return null;
  }
}
