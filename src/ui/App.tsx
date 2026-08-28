import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_STEP } from '../engine/camera';
import { GameLoop } from '../engine/loop';
import { Simulation } from '../engine/simulation';
import { gameStore } from '../engine/store';
import { formatNumber } from '../engine/format';
import type { GraftAssessment } from '../engine/graft';
import type { OfflineReport } from '../engine/offline';
import { AUTOSAVE_INTERVAL_MS } from '../content/save';
import { decodeSave, encodeSave, loadGame, saveGame, clearSave } from '../engine/storage';
import { parseSaveText } from '../engine/save';
import { migrateSave } from '../engine/migrations';
import { Settings } from './Settings';
import type { PricedGrowthOption } from '../engine/growth';
import type { PruneQuote } from '../engine/prune';
import { RESOURCE_BY_ID } from '../content/resources';
import { SEASON_BY_ID } from '../content/seasons';
import { SYMBIONT_BY_ID } from '../content/symbionts';
import { WEATHER_BY_ID } from '../content/weather';
import type { SeasonEvent } from '../engine/seasons';
import { enableTestProducers, disableTestProducers } from '../engine/debugProducers';
import { Renderer } from '../render/canvas';
import { GraftTooltip } from './GraftTooltip';
import { GrowOptionTooltip } from './GrowOptionTooltip';
import { Hud } from './Hud';
import { Journal } from './Journal';
import { LeafTooltip } from './LeafTooltip';
import { PruneTooltip } from './PruneTooltip';
import { SeedVault } from './SeedVault';
import { Symbionts } from './Symbionts';
import { AwayModal } from './AwayModal';
import { Toast } from './Toast';
import { Tooltip } from './Tooltip';
import { UpgradePanel } from './UpgradePanel';
import { Workshop } from './Workshop';
import { audio, type AudioVolumes } from './audio';
import { MUTE_HOTKEY, WEATHER_CUE } from '../content/audio';
import { ROOT_REVEAL_BODY, ROOT_REVEAL_TITLE } from '../content/progression';
import { DEFAULT_SETTINGS } from '../content/settings';
import { watchReducedMotion } from './motion';
import { attachTreeInput } from './treeInput';
import './App.css';

/**
 * What the tooltip is currently pointing at, in viewport coordinates.
 *
 * Three things on the canvas can explain themselves: a dial in the grow menu
 * (what a part would cost and add), a leaf cluster already on the tree (how much
 * sky it can still see), and — with the scissors out — a limb about to be cut
 * (what it pays and what it costs). Prune mode owns the pointer entirely while
 * it is on; otherwise the menu wins where it overlaps a leaf.
 */
type HoverState =
  | {
      readonly kind: 'option';
      readonly priced: PricedGrowthOption;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'leaf'; readonly nodeId: string; readonly x: number; readonly y: number }
  | { readonly kind: 'prune'; readonly quote: PruneQuote; readonly x: number; readonly y: number }
  | {
      readonly kind: 'graft';
      readonly assessment: GraftAssessment;
      readonly x: number;
      readonly y: number;
    };

/** The one-off card a first-time hybrid — or a newly arrived creature — throws up. */
interface DiscoveryToast {
  readonly title: string;
  readonly body: string;
  readonly glyph: string;
  readonly color: string;
  /** Bumped per discovery so a repeat of the same hybrid still re-fires. */
  readonly key: number;
}

/** How far above the tap the Dew number is spawned, so it clears the "+N". */
const DEW_LABEL_OFFSET_PX = 26;

/** Vertical spacing between the payout numbers a cut throws up. */
const PRUNE_LABEL_SPACING_PX = 24;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [testProducers, setTestProducers] = useState(false);
  const [pruneMode, setPruneMode] = useState(false);
  const [graftMode, setGraftMode] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [symbiontsOpen, setSymbiontsOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [toast, setToast] = useState<DiscoveryToast | null>(null);
  const [away, setAway] = useState<OfflineReport | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveHealthy, setSaveHealthy] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  // The input handlers are wired once, on mount, and must read the *current*
  // mode rather than the one that was in force when they were created.
  const pruneModeRef = useRef(false);
  const graftModeRef = useRef(false);
  /** The autosave, exposed so Settings can force one after import or reset. */
  const saveRef = useRef<(() => boolean) | null>(null);

  // The two canvas modes are mutually exclusive: they are different intentions
  // aimed at the same limb, and both live at once would make every click a guess.
  const togglePrune = useCallback(
    () =>
      setPruneMode((on) => {
        if (!on) setGraftMode(false);
        return !on;
      }),
    [],
  );
  const toggleGraft = useCallback(
    () =>
      setGraftMode((on) => {
        if (!on) setPruneMode(false);
        return !on;
      }),
    [],
  );
  // The right-hand slot holds one panel at a time; opening either closes the
  // other rather than stacking two sheets of glass over the tree.
  const toggleJournal = useCallback(
    () =>
      setJournalOpen((open) => {
        if (!open) {
          setSymbiontsOpen(false);
          setVaultOpen(false);
        }
        return !open;
      }),
    [],
  );
  const toggleSymbionts = useCallback(
    () =>
      setSymbiontsOpen((open) => {
        if (!open) {
          setJournalOpen(false);
          setVaultOpen(false);
        }
        return !open;
      }),
    [],
  );
  const toggleVault = useCallback(
    () =>
      setVaultOpen((open) => {
        if (!open) {
          setJournalOpen(false);
          setSymbiontsOpen(false);
          setSettingsOpen(false);
        }
        return !open;
      }),
    [],
  );
  const toggleSettings = useCallback(
    () =>
      setSettingsOpen((open) => {
        if (!open) {
          setJournalOpen(false);
          setSymbiontsOpen(false);
          setVaultOpen(false);
        }
        return !open;
      }),
    [],
  );

  /** Hand the current save to the clipboard, compressed. */
  const handleExport = useCallback(async () => {
    const sim = simRef.current;
    return sim ? encodeSave(sim.save()) : '';
  }, []);

  /**
   * Apply a pasted save, or say why it will not go in. Resolves to `null` on
   * success — every failure below is reported *before* anything is replaced, so
   * a bad paste can never leave the player halfway into someone else's tree.
   */
  const handleImport = useCallback(async (text: string) => {
    const sim = simRef.current;
    if (!sim) return 'The game is not running.';

    const json = await decodeSave(text);
    if (json === null) return 'That does not look like an Old Growth save.';

    const parsed = parseSaveText(json);
    if (!parsed.ok) return parsed.reason;

    const migrated = migrateSave(parsed.envelope);
    if (!migrated.ok) return migrated.reason;

    if (!sim.load(migrated.envelope)) return 'The save could not be rebuilt into a tree.';

    saveRef.current?.();
    return null;
  }, []);

  /**
   * The mixer. Held in three places at once, and it has to be: React renders the
   * sliders from state, the audio graph needs the numbers now, and the save
   * needs them written into engine state — while the M hotkey is handled by a
   * listener wired once on mount that can read none of those. The ref is what
   * that listener reads.
   */
  const [volumes, setVolumes] = useState<AudioVolumes>({
    master: DEFAULT_SETTINGS.masterVolume,
    music: DEFAULT_SETTINGS.musicVolume,
    sfx: DEFAULT_SETTINGS.sfxVolume,
    muted: DEFAULT_SETTINGS.muted,
  });
  const volumesRef = useRef(volumes);

  /** Whether the player has asked their system for less movement. */
  const [reducedMotion, setReducedMotion] = useState(false);

  /** Apply a mixer change everywhere it has to land, the save included. */
  const applyVolumes = useCallback((next: AudioVolumes) => {
    volumesRef.current = next;
    setVolumes(next);
    audio.setVolumes(next);

    const sim = simRef.current;
    if (!sim) return;
    sim.state.settings = {
      ...sim.state.settings,
      muted: next.muted,
      masterVolume: next.master,
      musicVolume: next.music,
      sfxVolume: next.sfx,
    };
  }, []);

  /** Flip the mute, in the engine's state so the save carries it. */
  const handleToggleMute = useCallback(() => {
    applyVolumes({ ...volumesRef.current, muted: !volumesRef.current.muted });
  }, [applyVolumes]);

  /** Move one slider, leaving the others (and the mute) alone. */
  const handleSetVolume = useCallback(
    (channel: 'master' | 'music' | 'sfx', value: number) => {
      applyVolumes({ ...volumesRef.current, [channel]: value });
    },
    [applyVolumes],
  );

  /**
   * Mark a hint read, and write it down on the spot.
   *
   * The autosave would carry it within thirty seconds, but "the game explained
   * the scissors to me twice" is exactly the kind of small broken promise a
   * player remembers, and a hard tab close inside that window would produce it.
   */
  const handleDismissHint = useCallback((id: string) => {
    if (simRef.current?.dismissHint(id)) saveRef.current?.();
  }, []);

  /** Let the game explain itself again from the beginning. */
  const handleResetHints = useCallback(() => {
    simRef.current?.resetHints();
    saveRef.current?.();
  }, []);

  /** Uproot everything: the state and both storage keys. */
  const handleHardReset = useCallback(() => {
    simRef.current?.hardReset();
    clearSave();
    setLastSavedAt(null);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const dismissAway = useCallback(() => setAway(null), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = new Simulation();
    simRef.current = sim;

    // Order matters here more than anywhere else on the mount path. The save is
    // read *first*, because everything below it operates on the tree it
    // restores; the offline catch-up runs *second*, on that tree, using the
    // `lastUpdatedAt` the save carried. Reversed, a returning player would be
    // paid for time their seedling was never alive for.
    const outcome = loadGame();
    if (outcome.kind === 'loaded' || outcome.kind === 'recovered') {
      if (!sim.load(outcome.envelope)) {
        setToast({
          title: 'Save could not be opened',
          body: 'The tree it described could not be rebuilt, so this run starts fresh.',
          glyph: '🌱',
          color: '#ff8a72',
          key: Date.now(),
        });
      } else if (outcome.kind === 'recovered') {
        // Calm on purpose: the player lost at most one autosave interval, and
        // the backup did exactly what it is there for.
        setToast({
          title: 'Recovered from a backup',
          body: 'The last save was damaged, so the one before it was opened instead.',
          glyph: '🛟',
          color: '#6fb7e0',
          key: Date.now(),
        });
      }
    } else if (outcome.kind === 'failed') {
      setToast({
        title: 'Save could not be read',
        body: outcome.reason,
        glyph: '🌱',
        color: '#ff8a72',
        key: Date.now(),
      });
    }

    // The save carries the mixer. The audio graph and the React sliders both
    // have to be told, since neither can read engine state.
    applyVolumes({
      master: sim.state.settings.masterVolume,
      music: sim.state.settings.musicVolume,
      sfx: sim.state.settings.sfxVolume,
      muted: sim.state.settings.muted,
    });

    // Then catch up on the time the tab was shut. Doing it here rather than
    // inside the loop means the tree the player sees on the first frame is
    // already the one they came back to, roots and all.
    setAway(sim.catchUpOffline());

    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    renderer.setSoil(sim.state.soil);

    // The OS setting, now and whenever it changes. Fires immediately, so the
    // first frame is already drawn the way the player asked for.
    const detachMotion = watchReducedMotion((reduced) => {
      renderer.setReducedMotion(reduced);
      setReducedMotion(reduced);
    });

    // The renderer caches the projected tree; re-push it only when the graph's
    // structure actually changed, never per frame.
    let treeRevision = -1;
    const syncTree = (now: number) => {
      if (sim.state.tree.revision === treeRevision) return;
      treeRevision = sim.state.tree.revision;
      renderer.setTree(sim.state.tree.toSegments(), sim.state.tree.placements(), now);
    };
    syncTree(Date.now());

    // The picker has to be hit-testable between frames, so the renderer holds
    // the species list rather than being handed it per draw. Pushed only when it
    // actually changes — an unlock or a chip click — not sixty times a second.
    let speciesKey = '';
    const syncSpecies = (snapshot: {
      species: { unlocked: readonly string[]; planting: string };
    }) => {
      const key = `${snapshot.species.planting}|${snapshot.species.unlocked.join(',')}`;
      if (key === speciesKey) return;
      speciesKey = key;
      renderer.setPlantableSpecies(snapshot.species.unlocked, snapshot.species.planting);
    };

    /** Canvas-local point → viewport point, for positioning the DOM tooltip. */
    const toClient = (point: { x: number; y: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: point.x + rect.left, y: point.y + rect.top };
    };

    const openMenuFor = (nodeId: string, now: number) => {
      renderer.openMenu(nodeId, sim.growthOptions(nodeId), now);
    };

    const closeMenu = () => {
      renderer.closeMenu();
      setHover(null);
    };

    /** Drop the prune mark and its tooltip. */
    const clearPruneMark = () => {
      renderer.setPruneSelection(null);
      setHover(null);
    };

    // Graft mode needs two targets, so the first one has to survive between
    // presses. It lives here rather than in React state because the input
    // handlers are wired once and must never read a stale closure.
    let graftFirstId: string | null = null;

    const clearGraft = () => {
      graftFirstId = null;
      renderer.setGraftSelection(null);
      setHover(null);
    };

    /**
     * Mark what graft mode has picked and what it is pointing at, and assess the
     * pair. Returns the assessment so the caller can decide whether to act on it.
     */
    const markGraft = (hoverId: string | null): GraftAssessment | null => {
      const assessment =
        graftFirstId && hoverId && hoverId !== graftFirstId
          ? sim.graftQuote(graftFirstId, hoverId)
          : null;
      renderer.setGraftSelection({ firstId: graftFirstId, hoverId, assessment });
      return assessment;
    };

    /** Execute a graft: confetti and a toast when it is the first of its kind. */
    const performGraft = (aId: string, bId: string, at: { x: number; y: number }, now: number) => {
      const result = sim.graft(aId, bId);
      if (!result) return;

      syncTree(now);
      clearGraft();

      renderer.effects.spawnFloatingNumber(at.x, at.y, `${result.hybrid.name}!`, true, now);

      if (result.discovered) {
        // The chime is for the *discovery*, not for the graft: re-growing a
        // hybrid the Journal already knows is a purchase, and purchases have
        // their own sound.
        audio.play('graft');
        renderer.effects.spawnConfetti(at.x, at.y, now);
        setToast({
          title: `${result.hybrid.glyph} ${result.hybrid.name}`,
          body: result.hybrid.flavor,
          glyph: '❖',
          color: result.hybrid.palette.bark,
          key: now,
        });
      }
    };

    /**
     * Mark the subtree at `nodeId`, quoting it against live prices.
     *
     * `armed` is the inline confirm: hovering marks, the first click arms, and
     * only a second click on the same limb cuts. Re-marking a different limb
     * always lands unarmed, so a confirm can never be inherited by a limb the
     * player did not confirm.
     */
    const markPrune = (nodeId: string, armed: boolean): PruneQuote | null => {
      const quote = sim.pruneQuote(nodeId);
      if (!quote) {
        clearPruneMark();
        return null;
      }
      renderer.setPruneSelection({
        nodeId,
        ids: new Set(quote.nodeIds),
        quote,
        armed,
      });
      return quote;
    };

    /** Execute the marked cut: snip, debris, payout numbers. */
    const performPrune = (nodeId: string, at: { x: number; y: number }, now: number) => {
      // Captured before the cut — the graph is about to forget these nodes.
      const debris = renderer.prunePoints();

      const result = sim.prunePart(nodeId);
      if (!result) {
        clearPruneMark();
        return;
      }

      audio.play('prune');
      renderer.effects.spawnPruneBurst(debris, now);
      syncTree(now);
      clearPruneMark();

      let row = 0;
      for (const refund of result.quote.refunds) {
        renderer.effects.spawnFloatingNumber(
          at.x,
          at.y - row * PRUNE_LABEL_SPACING_PX,
          `+${formatNumber(refund.amount)} ${RESOURCE_BY_ID[refund.resource].label}`,
          false,
          now,
        );
        row += 1;
      }
      renderer.effects.spawnFloatingNumber(
        at.x,
        at.y - row * PRUNE_LABEL_SPACING_PX,
        `+${formatNumber(result.quote.deadwood)} Deadwood`,
        false,
        now,
      );
      if (result.surge) {
        renderer.effects.spawnHit(
          at.x,
          at.y - (row + 1) * PRUNE_LABEL_SPACING_PX,
          'Lateral Surge!',
          true,
          now,
        );
      }
    };

    // Taps resolve here, straight off pointerdown — outside the frame loop and
    // outside React state — so nothing can coalesce or defer them.
    const detachInput = attachTreeInput(canvas, {
      // The open grow menu gets first refusal on every press — unless the
      // scissors are out, in which case prune mode owns the whole surface.
      onPress: (point) => {
        const now = Date.now();

        // Every press is a user gesture, and a user gesture is the only thing a
        // browser will start an AudioContext for. Cheap and idempotent once the
        // context is running, so it is done here rather than guarded at each of
        // the dozen places a press can end up.
        audio.unlock();

        // A storm owns the pointer while it blows. Fifteen seconds of holding
        // the trunk beats every other intention the press could have — and the
        // anchor only exists during those fifteen seconds, so nothing is being
        // taken away from the player the rest of the time.
        if (renderer.isBracePress(point)) {
          if (sim.braceStorm()) renderer.effects.spawnRipple(point.x, point.y, true, now);
          return true;
        }

        // A pile of leaves is not part of the tree, so no mode has an opinion
        // about it: it sweeps up whether the scissors are out or not.
        const pileId = renderer.litterPileAt(point);
        if (pileId) {
          const pile = sim.collectLitter(pileId);
          if (pile) {
            renderer.effects.spawnFloatingNumber(
              point.x,
              point.y,
              `+${formatNumber(pile.amount)} ${RESOURCE_BY_ID.leafLitter.label}`,
              false,
              now,
            );
          }
          return true;
        }

        if (graftModeRef.current) {
          const segment = renderer.hitTest(point);
          const nodeId = segment?.id ?? null;

          // A press on nothing puts the knife down without cutting anything —
          // the same escape hatch prune mode gives.
          if (!nodeId) {
            clearGraft();
            return true;
          }

          if (!graftFirstId) {
            graftFirstId = nodeId;
            markGraft(nodeId);
            return true;
          }

          const assessment = markGraft(nodeId);
          if (assessment?.ok) {
            performGraft(graftFirstId, nodeId, point, now);
          } else {
            // Not a pair: treat the press as choosing a new first limb rather
            // than as an error. Grafting is a two-target action and re-picking
            // is the commonest thing a player will want to do.
            graftFirstId = nodeId;
            markGraft(nodeId);
          }
          return true;
        }

        if (pruneModeRef.current) {
          const segment = renderer.hitTest(point);
          const nodeId = segment?.id ?? null;

          // Nothing cuttable under the press: cancel whatever was marked. The
          // trunk is the graph root and has no joint to be cut at.
          if (!nodeId || nodeId === sim.state.tree.rootId) {
            clearPruneMark();
            return true;
          }

          const mark = renderer.pruneMark;
          if (mark?.armed && mark.nodeId === nodeId) {
            performPrune(nodeId, point, now);
            return true;
          }

          // First press: mark and arm, so touch (which never hovers) still gets
          // its confirm.
          const quote = markPrune(nodeId, true);
          if (quote) {
            const client = toClient(point);
            setHover({ kind: 'prune', quote, x: client.x, y: client.y });
          }
          return true;
        }

        if (!renderer.isMenuArmed(now)) return false;

        // The species picker sits inside the menu, so it gets the same arming
        // delay and the same first refusal as the dials.
        const chip = renderer.pickerChipAt(point);
        if (chip) {
          if (sim.setPlantingSpecies(chip)) {
            const open = renderer.openMenuState;
            // Prices, ghosts and production quotes all move with the species, so
            // the menu is re-priced rather than merely re-tinted.
            if (open) openMenuFor(open.nodeId, now);
            renderer.hoverMenu(point);
          }
          return true;
        }

        const priced = renderer.menuOptionAt(point);
        if (!priced) return false;

        if (priced.affordable) {
          const grown = sim.growPart(priced.option.parentId, priced.option.type);
          if (grown) {
            audio.play('grow');
            syncTree(now);
            // Prices and affordability moved; re-open on the same node so the
            // player can keep building without re-tapping the limb.
            openMenuFor(priced.option.parentId, now);
            renderer.hoverMenu(point);
          }
        }
        // Consumed either way: a tap on a dial is never also a tap on the tree.
        return true;
      },

      hitTest: (point) => renderer.hitTest(point) !== null,

      onHit: (point) => {
        const now = Date.now();
        // Resolved before the tap, so the tap knows what wood it landed on — a
        // limb's own species moves its click stats.
        const struck = renderer.hitTest(point);
        const result = sim.click(now, Math.random, struck?.id);

        // The pop and the thock are the same event heard from two distances: a
        // crit is not a louder tap, it is a deeper one.
        audio.play(result.crit ? 'crit' : 'click');

        renderer.effects.spawnHit(
          point.x,
          point.y,
          `+${formatNumber(result.gain)}`,
          result.crit,
          now,
        );

        // The day's first tap shakes the Dew loose. Spawned a little above the
        // tap and flagged as a crit so it lands gold — it is the same kind of
        // event to the player, and it should not be mistaken for the tap itself.
        if (result.dew) {
          renderer.effects.spawnHit(
            point.x,
            point.y - DEW_LABEL_OFFSET_PX,
            `Dew +${formatNumber(result.dew)}`,
            true,
            now,
          );
        }

        // Every part of the tree is also its own upgrade button.
        if (struck) openMenuFor(struck.id, now);
      },

      onMiss: closeMenu,

      onPointerMove: (point) => {
        renderer.setPointer(point);
        const client = toClient(point);

        if (graftModeRef.current) {
          const segment = renderer.hitTest(point);
          const assessment = markGraft(segment?.id ?? null);
          if (assessment) {
            setHover({ kind: 'graft', assessment, x: client.x, y: client.y });
          } else {
            setHover(null);
          }
          return;
        }

        if (pruneModeRef.current) {
          const segment = renderer.hitTest(point);
          const nodeId = segment?.id ?? null;
          if (!nodeId || nodeId === sim.state.tree.rootId) {
            clearPruneMark();
            return;
          }

          const mark = renderer.pruneMark;
          // Already on this limb: keep the confirm the player has armed rather
          // than disarming it under a stray pixel of mouse movement.
          if (mark?.nodeId === nodeId) {
            setHover({ kind: 'prune', quote: mark.quote, x: client.x, y: client.y });
            return;
          }

          const quote = markPrune(nodeId, false);
          if (quote) setHover({ kind: 'prune', quote, x: client.x, y: client.y });
          return;
        }

        const priced = renderer.hoverMenu(point);
        renderer.hoverPicker(point);
        if (priced) {
          setHover({ kind: 'option', priced, x: client.x, y: client.y });
          return;
        }

        // Nothing in the menu under the cursor — is there a leaf under it?
        const segment = renderer.hitTest(point);
        if (segment?.kind === 'leafCluster') {
          setHover({ kind: 'leaf', nodeId: segment.id, x: client.x, y: client.y });
          return;
        }
        setHover(null);
      },

      onPointerLeave: () => {
        renderer.setPointer(null);
        renderer.hoverMenu(null);
        renderer.hoverPicker(null);
        if (pruneModeRef.current) renderer.setPruneSelection(null);
        // The chosen limb is *kept* when the pointer leaves: a half-finished
        // graft is a decision in progress, not a hover state.
        if (graftModeRef.current) markGraft(null);
        setHover(null);
      },

      onDrag: (dx, dy) => {
        renderer.panBy(dx, dy);
        // The tooltip was pinned to a dial that has just moved under the camera.
        setHover(null);
      },

      onScroll: (deltaX, deltaY) => {
        renderer.scrollBy(deltaX, deltaY);
        setHover(null);
      },

      onZoom: (factor, at) => {
        renderer.zoomAt(at, factor);
        setHover(null);
      },
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      // Never steal a keystroke aimed at a control the player is typing into.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }

      if (event.key === 'Escape') {
        // Escape backs out one layer at a time: a chosen limb first, then the
        // mode; an armed cut first, then the mode; then the grow menu.
        if (graftModeRef.current) {
          if (renderer.graftMark?.firstId) {
            clearGraft();
          } else {
            setGraftMode(false);
          }
          return;
        }
        if (pruneModeRef.current) {
          if (renderer.pruneMark?.armed) {
            renderer.setPruneSelection(null);
            setHover(null);
          } else {
            setPruneMode(false);
          }
          return;
        }
        closeMenu();
        return;
      }
      if (event.key.toLowerCase() === MUTE_HOTKEY) {
        handleToggleMute();
        return;
      }
      // A hotkey for a tool the player does not have yet is a way into a mode
      // with no button, no tooltip and no explanation. The gate is the same one
      // the HUD draws from, asked of the same simulation.
      if (event.key === 'p' || event.key === 'P') {
        if (sim.hasFeature('pruning')) togglePrune();
        return;
      }
      if (event.key === 'g' || event.key === 'G') {
        if (sim.hasFeature('grafting')) toggleGraft();
        return;
      }
      if (event.key === 'j' || event.key === 'J') {
        toggleJournal();
        return;
      }
      if (event.key === ',') {
        toggleSettings();
        return;
      }
      if (event.key === 's' || event.key === 'S') {
        if (sim.hasFeature('symbionts')) toggleSymbionts();
        return;
      }
      if (event.key === 'v' || event.key === 'V') {
        if (sim.hasFeature('prestige')) toggleVault();
        return;
      }
      // Zoom from the keyboard, for mice with no pinch gesture to offer.
      if (event.key === '+' || event.key === '=') {
        renderer.zoomBy(ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        renderer.zoomBy(1 / ZOOM_STEP);
      } else if (event.key === '0') {
        renderer.resetCamera();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const loop = new GameLoop({
      // Fixed-timestep simulation: advance state only, no store writes here.
      update: (dt) => {
        sim.tick(dt);
      },
      // Once per render frame: snapshot, push to the store, and draw.
      render: (alpha) => {
        const now = Date.now();
        syncTree(now);
        const snapshot = sim.snapshot(now);
        syncSpecies(snapshot);
        // The opening beat is a mark on the trunk, so the renderer owns drawing
        // it; which beat is live is a reading of the run, so the engine owns
        // deciding it. Pushed per frame because it is one field assignment, and
        // because the window can shut inside a single tap.
        renderer.setBeat(snapshot.progression.beat);
        gameStore.getState().setSnapshot(snapshot);
        renderer.draw(snapshot, alpha, now);

        // A gate opening is the game getting larger, and exactly one of them is
        // worth stopping for: the ground. The camera dips once to show the
        // player what is under their tree — and if it will not (they have taken
        // the camera themselves, or asked for less motion), the card still says
        // what happened, because the event is the unlock and not the pan.
        for (const feature of sim.drainFeatureEvents()) {
          if (feature !== 'roots') continue;
          renderer.lookBelow(now);
          setToast({
            title: ROOT_REVEAL_TITLE,
            body: ROOT_REVEAL_BODY,
            glyph: '🌱',
            color: '#a8875e',
            key: now + 5,
          });
        }

        // The pad and the weather loops are driven off the snapshot rather than
        // off events, because they are *states* rather than things that happen:
        // a season is what it is for a hundred days, and a save loaded mid-storm
        // should already be raining on the first frame. Both calls are no-ops
        // when nothing has changed.
        audio.setSeason(snapshot.season.id);
        audio.setWeather(snapshot.weather.active?.id ?? null);

        // A creature turning up is the one thing the engine does entirely on its
        // own, without the player having pressed anything — so it announces
        // itself. Drained rather than read off the snapshot: an arrival is an
        // event, and a flag would re-fire the toast every frame.
        for (const id of sim.drainSymbiontArrivals()) {
          const def = SYMBIONT_BY_ID[id];
          if (!def) continue;
          setToast({
            title: `${def.glyph} ${def.name}`,
            body: def.arrival,
            glyph: '✦',
            color: def.color,
            key: now + id.length,
          });
        }

        // The year turning is the other thing that happens without the player
        // having pressed anything. A ring outranks the season that brought it:
        // both land on the same frame, and only one of them is permanent.
        const turns = sim.drainSeasonEvents();
        const ring = turns.find(
          (event): event is Extract<SeasonEvent, { kind: 'ring' }> => event.kind === 'ring',
        );
        const turned = turns.filter((event) => event.kind === 'season').pop();

        if (ring) {
          setToast({
            title: '◎ A ring for the winter',
            body: `The cold is behind you and the trunk is thicker for it. Everything the tree makes is worth ${snapshot.ringMultiplier.toFixed(
              2,
            )}× for good.`,
            glyph: '◎',
            color: '#e8cfa8',
            key: now,
          });
        } else if (turned && turned.kind === 'season') {
          const def = SEASON_BY_ID[turned.id];
          setToast({
            title: `${def.glyph} ${def.label}`,
            body: def.flavor,
            glyph: '❋',
            color: def.tint.leaf,
            key: now + 1,
          });
        }

        // A tree going to seed is the largest thing that happens in the game,
        // and the only one the player cannot undo. Drained like the rest: the
        // ceremony lands inside a tick, and the card celebrating it belongs to
        // the frame that noticed, not to every frame afterwards.
        for (const report of sim.drainPrestigeEvents()) {
          // The camera was framed on a tree that no longer exists.
          audio.play('prestige');
          renderer.resetCamera();
          setToast({
            title: `🌰 ${report.yield.total} Seed${report.yield.total === 1 ? '' : 's'}`,
            body:
              `The old tree stands on the hills now — ${report.forestSize} of them, worth ` +
              `+${report.forestSize}% to everything the next one makes.` +
              (report.remembered > 0 ? ` ${report.remembered} parts came back from memory.` : ''),
            glyph: '🌰',
            color: '#a9c46c',
            key: now + 4,
          });
        }

        // Weather announces itself in the sky and in the ear; the banner is
        // driven off the snapshot, so all that is owed here is the cue and the
        // one-off report of what a storm did.
        for (const event of sim.drainWeatherEvents()) {
          if (event.kind === 'telegraph') {
            audio.play(WEATHER_CUE[event.id]);
            continue;
          }
          if (event.kind !== 'end' || !event.storm) continue;

          const report = event.storm;
          const def = WEATHER_BY_ID[event.id];
          if (report.snapped.length > 0) {
            setToast({
              title: `${def.glyph} The wind took ${report.snapped.length} limb${
                report.snapped.length === 1 ? '' : 's'
              }`,
              body: `What came down is yours: +${formatNumber(report.deadwood)} Deadwood.`,
              glyph: '⚡',
              color: def.color,
              key: now + 2,
            });
          } else if (report.exposed > 0) {
            setToast({
              title: `${def.glyph} Every limb held`,
              body:
                report.brace >= 1
                  ? 'Braced to the last. The storm went through the canopy and took nothing.'
                  : 'The wind found nothing to lever. It will not always be so generous.',
              glyph: '⚓',
              color: def.color,
              key: now + 3,
            });
          }
        }
      },
      onStats: (stats) => {
        gameStore.getState().setStats(stats);
      },
    });

    const handleResize = () => {
      renderer.resize();
      setHover(null);
    };
    window.addEventListener('resize', handleResize);

    loop.start();

    /**
     * Write the game down. Reported to the panel so a browser refusing storage
     * is visible before the tab closes rather than after.
     */
    const persist = () => {
      const ok = saveGame(sim.save());
      setSaveHealthy(ok);
      if (ok) setLastSavedAt(Date.now());
      return ok;
    };

    const autosave = window.setInterval(persist, AUTOSAVE_INTERVAL_MS);

    // Three triggers, because none of them fires reliably on its own: the
    // interval covers a tab left open, `visibilitychange` covers a phone being
    // pocketed (the only one iOS Safari reliably delivers), and `pagehide`
    // covers a desktop close. Saving twice costs one write; missing the last one
    // costs the session.
    const handleHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('pagehide', persist);

    saveRef.current = persist;

    return () => {
      persist();
      detachMotion();
      // The pad and the weather loop would otherwise keep running over a game
      // that no longer exists — in development, straight through a hot reload.
      audio.dispose();
      window.clearInterval(autosave);
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', persist);
      loop.stop();
      detachInput();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      saveRef.current = null;
      simRef.current = null;
      rendererRef.current = null;
    };
  }, [
    togglePrune,
    toggleGraft,
    toggleJournal,
    toggleSymbionts,
    toggleVault,
    toggleSettings,
    applyVolumes,
    handleToggleMute,
  ]);

  // Mirror the canvas modes into the places that cannot read React state: the
  // input handlers (through a ref) and the renderer (which draws the marks).
  useEffect(() => {
    pruneModeRef.current = pruneMode;
    rendererRef.current?.setPruneMode(pruneMode);
    setHover(null);
  }, [pruneMode]);

  useEffect(() => {
    graftModeRef.current = graftMode;
    rendererRef.current?.setGraftMode(graftMode);
    setHover(null);
  }, [graftMode]);

  // Toggle the temporary debug producers on the live simulation.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (testProducers) {
      enableTestProducers(sim);
    } else {
      disableTestProducers(sim);
    }
  }, [testProducers]);

  const handleBuy = useCallback((id: string) => {
    simRef.current?.buyUpgrade(id);
  }, []);

  const handleCraft = useCallback((totemId: string) => {
    simRef.current?.craftTotem(totemId);
  }, []);

  const handleSymbiontUpgrade = useCallback((id: string) => {
    simRef.current?.upgradeSymbiont(id);
  }, []);

  const handleBuyHeirloom = useCallback((id: string) => {
    simRef.current?.buyHeirloom(id);
  }, []);

  const handleChooseBond = useCallback((id: string) => {
    simRef.current?.setBondSymbiont(id);
  }, []);

  // Committing closes the Vault: the next six seconds are the ceremony, and a
  // panel of buy buttons over a tree that is coming apart would be the wrong
  // thing to be looking at.
  const handleGoToSeed = useCallback(() => {
    if (simRef.current?.goToSeed()) setVaultOpen(false);
  }, []);

  return (
    <div className="app">
      <canvas
        ref={canvasRef}
        className={`app-canvas${pruneMode ? ' app-canvas--pruning' : ''}${
          graftMode ? ' app-canvas--grafting' : ''
        }`}
      />
      <Hud
        reducedMotion={reducedMotion}
        testProducers={testProducers}
        onToggleTestProducers={() => setTestProducers((on) => !on)}
        pruneMode={pruneMode}
        onTogglePrune={togglePrune}
        graftMode={graftMode}
        onToggleGraft={toggleGraft}
        journalOpen={journalOpen}
        onToggleJournal={toggleJournal}
        symbiontsOpen={symbiontsOpen}
        onToggleSymbionts={toggleSymbionts}
        vaultOpen={vaultOpen}
        onToggleVault={toggleVault}
        settingsOpen={settingsOpen}
        onToggleSettings={toggleSettings}
        onDismissHint={handleDismissHint}
      />
      <Workshop onCraft={handleCraft} />
      {journalOpen ? (
        <Journal />
      ) : symbiontsOpen ? (
        <Symbionts onUpgrade={handleSymbiontUpgrade} />
      ) : vaultOpen ? (
        <SeedVault
          onBuyHeirloom={handleBuyHeirloom}
          onChooseBond={handleChooseBond}
          onGoToSeed={handleGoToSeed}
        />
      ) : settingsOpen ? (
        <Settings
          volumes={volumes}
          onToggleMute={handleToggleMute}
          onSetVolume={handleSetVolume}
          reducedMotion={reducedMotion}
          onResetHints={handleResetHints}
          onExport={handleExport}
          onImport={handleImport}
          onHardReset={handleHardReset}
          saveHealthy={saveHealthy}
          lastSavedAt={lastSavedAt}
        />
      ) : (
        <UpgradePanel onBuy={handleBuy} />
      )}
      {away && <AwayModal report={away} onCollect={dismissAway} />}
      {toast && (
        <Toast
          key={toast.key}
          title={toast.title}
          body={toast.body}
          glyph={toast.glyph}
          color={toast.color}
          onDismiss={dismissToast}
        />
      )}
      <Tooltip
        content={
          hover?.kind === 'option' ? (
            <GrowOptionTooltip priced={hover.priced} />
          ) : hover?.kind === 'leaf' ? (
            <LeafTooltip nodeId={hover.nodeId} />
          ) : hover?.kind === 'prune' ? (
            <PruneTooltip quote={hover.quote} />
          ) : hover?.kind === 'graft' ? (
            <GraftTooltip assessment={hover.assessment} />
          ) : null
        }
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
      />
    </div>
  );
}
