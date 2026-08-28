import { AudioManager } from './manager';

/**
 * The game's one {@link AudioManager}.
 *
 * A module-level singleton rather than something threaded through props or
 * context, for the same reason the placeholder it replaces was: sounds are
 * triggered from pointer handlers that are wired once on mount and from inside
 * the frame loop, and neither can read React state. There is exactly one pair of
 * speakers, so there is exactly one manager.
 */
export const audio = new AudioManager();

export type { AudioVolumes } from './manager';
export { AudioManager, busGain, clampVolume } from './manager';
