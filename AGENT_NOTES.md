# Agent Notes

Working notes for agents building **Old Growth**. Read `PROJECT_SPEC.md` first
for the design and architecture. Keep everything data-driven and strictly typed.
Do not refactor unrelated code.

## Conventions

- `/src/engine` is pure TypeScript — **never** import React there.
- Resources are `Decimal` (break_infinity.js). Format for display via
  `src/engine/format.ts`.
- Content lives in `/src/content` as typed data, not hard-coded in logic.
- Before finishing any task: `npm run lint`, `npm test`, `npm run build` must all
  pass. Then append a dated changelog entry below with open TODOs.

## Changelog

### 2026-08-27 — STEP 16: Audio and game feel

Fifteen steps of a game that was silent apart from one synthesised snip. This
one gives it a voice and a bit of weight — and does both without adding a single
byte of downloaded asset, because no licensed sound exists yet and inventing a
dependency on files nobody has recorded would block the step on a purchase.

- `src/content/audio.ts` — **new, and the whole bank is data.** Every cue is a
  short list of _voices_ — a tone or a burst of filtered noise, each with an
  offset, a length and an envelope — rendered by WebAudio at the moment it is
  asked for. Nine cues: `click`, `crit`, `grow`, `prune`, `graft`, `prestige`,
  and the three weather warnings. Synthesised rather than sampled on purpose:
  weightless, tunable in a text editor between two taps, and **parametric** — the
  click is pitched ±10% per tap from one spec, which is what stops ten taps a
  second sounding like a machine gun.
- `src/ui/audio/` — **new**: `synth.ts` (voices and envelopes), `music.ts` (the
  seasonal pad), `ambience.ts` (rain and wind), `manager.ts` (the one thing that
  owns sound), plus `fakeContext.ts` so all of it is testable with no audio
  hardware.
  - **Howler owns the master bus.** Everything synthesised is routed into
    `Howler.masterGain`, and master volume and mute go through `Howler.volume()`
    and `Howler.mute()` rather than a gain of our own. Not ceremony to justify
    the dependency: it is what makes the eventual swap to real assets a
    non-event — a `Howl` created for a recorded snip connects to that same bus by
    construction, already at the right volume and already muted if the player is.
  - **Every public method is a no-op with no context to play into.** Audio is
    decoration; it must never break the interaction that triggered it.
  - **The pad has no phrase and no loop point.** Notes are drawn from a
    pentatonic scale at a slow jittered interval and left to ring two or three
    times the gap between them. "Must never be annoying" is satisfied
    _structurally_ rather than by being quiet: there is nothing to learn, so
    there is nothing to get sick of, and no seam to notice on the fortieth pass.
    Notes are queued **ahead of the clock**, because `setTimeout` in a
    backgrounded tab is throttled and WebAudio's timeline is not.
  - **Weather gusts are an LFO on filter cutoff, not on gain.** Wind that swells
    in volume sounds like someone riding a fader; wind that moves in _timbre_
    sounds like air changing direction, which is what it is.
- `src/ui/sfx.ts` — **deleted**, exactly as STEP 9 said it should be: "Replace
  wholesale in STEP 16. Delete the module, don't extend it."
- `src/ui/tween.ts` — HUD totals slide toward their target instead of jumping.
  Legibility rather than prettiness: a counter climbing at 40/s changes its last
  digit every frame, and a digit that changes every frame cannot be read.
- `src/ui/motion.ts` — `prefers-reduced-motion`, watched live rather than read
  once, with the pre-Safari-14 listener API as a fallback. It reaches the
  renderer as one flag: sway off, particles off _and cleared_, parallax off,
  scale-in landing at full size. The tree still says everything it says about
  shade, species and season; it simply stops moving.
- `public/audio/ASSETS_TODO.md` — what should eventually replace the synth bank,
  by name, length and mood.
- Tests: **1098 pass** (up from 1016). The audio modules are covered against a
  fake `AudioContext`; `motion.test.ts` covers the query and its fallbacks.
- **A gap I found and closed:** nothing asserted the acceptance criterion
  _"reduced-motion mode verified"_ for the canopy — `effects.test.ts` covered
  particles, `motion.test.ts` covered the media query, and the still tree was
  covered by nobody. `render/tree.test.ts` now records what `drawTree` puts on a
  canvas and asserts two frames 1.5 s apart are **the same drawing** with motion
  off, with a control test proving they differ with it on, and a third proving
  the same _number of parts_ is drawn either way — it stops moving, it does not
  stop showing.
- Verified in a real browser (Chromium/Playwright, production build): the mixer
  opens at **70/70/70**, **M** mutes and the mute survives a reload, and dragging
  Music to 30% and Effects to 45% wrote `{"masterVolume":0.7,"musicVolume":0.3,
"sfxVolume":0.45}` into the save, which came back after a reload. Under an
  emulated `prefers-reduced-motion: reduce` the page runs clean with no errors.

**Design decisions worth knowing**

- **The mixer stays visible while muted, and disabled rather than reset.** Mute
  is a pause, not a preference: a player who unmutes should get back the mix they
  had.
- **Reduced motion is reported in Settings, not offered there.** It is read from
  the system setting the player already made once for everything they own;
  showing it is so that a still canopy reads as _working as asked_ rather than as
  broken.
- **A pixel diff could not verify reduced motion.** Two canvas frames a second
  apart differ even with motion off, because the sun still moves and the sky
  still lerps — and both are _information_, not decoration. The check that
  actually works is the drawing-level test described above. Worth remembering
  before trusting a screenshot comparison on a scene with a clock in it.

**Open TODOs**

- [ ] **Every sound is a placeholder.** `ASSETS_TODO.md` is the list; the swap is
      a `Howl` per cue on the same master bus, keyed by the same `SfxId`, and
      nothing above `manager.ts` has to move.
- [ ] The pad is one scale per season and no more. It does not yet respond to
      weather, night, or a prestige ceremony — the ceremony in particular is six
      seconds that currently plays over ordinary summer music.
- [ ] Volume changes write to the save on the next autosave rather than
      immediately, so a mixer tweak followed by a hard tab close inside 30 s is
      lost. The same "no write on consequential actions" TODO as STEP 15's.
- [ ] Reduced motion does not yet reach the prestige ceremony (STEP 13 flagged
      this); it is still a six-second animation regardless of the setting.
- [ ] No audio on the away modal's count-up, and none on a symbiont arriving —
      two of the few moments that currently have visual feedback and no sound.

### 2026-08-27 — STEP 15: Save system and migrations

Fourteen steps of state that lived exactly as long as a tab. This one writes it
down — and, more to the point, is built around the assumption that **writing it
down will sometimes go wrong**: a disk that is full, a tab killed mid-write, a
browser that refuses storage, a file from a build that does not exist yet.

- `src/content/save.ts` + `src/content/settings.ts` — the format version, the
  two storage keys, the 30 s autosave interval, the `UPROOT` phrase, the export
  markers; and `GameSettings`, read through `normaliseSettings` so a file written
  before a field existed still loads.
- `src/engine/save.ts` — `captureSave` / `restoreState`, and the whole file is
  written to the rule that **the strict gate is at the door and everything past
  it is defensive**. `validateEnvelope` refuses anything without a version, a
  timestamp and a tree; after that, every field is read through `num`, `count`,
  `str` and friends, and an id the game no longer has is skipped rather than
  fatal. A save is a file a player may have edited.
  - **Derived state is not saved.** Modifiers, producers, exposures, hydration
    and the season are all rebuilt by `hydrate()` on the way in. Saving them
    would let a load double an aura that is also re-granted — and a save format
    that carries derived values is one that goes stale the moment a balance
    number moves.
  - Cadence intervals come from the _catalogue_, not the file, so a change to how
    often the songbird sings reaches saves that already exist.
  - A buff whose time ran out while the tab was shut is dropped on load rather
    than restored-then-expired, which would flash its modifiers across one frame.
- `src/engine/migrations.ts` — an ordered list of one-version steps, walked one
  at a time so a save three versions behind is migrated three times rather than
  jumped. **Empty at 1.0, and that is the point**: the machinery runs on every
  load _before_ the first breaking change rather than being written after it.
  Versions compare as numbers, so `1.10` is correctly newer than `1.9`, and a
  save from a newer build is refused with a sentence rather than guessed at.
- `src/engine/storage.ts` — one rule: **a save is replaced, never edited.** The
  live key is rotated into the backup key before it is overwritten, and only if
  it still parses — promoting a corrupt file into the backup slot would destroy
  the very thing the slot is for. Every `localStorage` call is wrapped, including
  the _reach_ for it (a blocked-cookies setting throws on property access), so a
  browser that refuses storage gets a playable game and a warning rather than a
  blank screen.
  - Export is deflate-then-base64 behind an `OG1:` marker, with an `OG0:` plain
    fallback for browsers without `CompressionStream`; the reader is driven by
    the marker, so a save exported on a desktop imports on an old phone. Raw
    JSON is accepted too, and whitespace is stripped, because chat clients wrap
    long lines and a paste that fails on a newline is a support request.
- `src/engine/simulation.ts` — `save()`, `load()`, `hardReset()`, and
  `playtimeSeconds` advancing only on ticks a person sat through (an offline
  catch-up moves the _tree's_ clock, and calling that "time played" would make
  the stat a measure of how long the tab was shut). **A failed load changes
  nothing**: the fresh state is built and fully populated before it is swapped
  in, the same swap-don't-unwind shape `goToSeed` uses.
- `src/ui/Settings.tsx` + `.css` — mute, Export (to clipboard, with the text
  shown as well because clipboard permission is not guaranteed), Import
  (validated _before_ anything is replaced), and Hard Reset behind the typed
  phrase. `src/ui/App.tsx` loads before the offline catch-up — reversed, a
  returning player would be paid for time their seedling was never alive for —
  and autosaves on three triggers: the interval, `visibilitychange` (the only one
  iOS Safari reliably delivers), and `pagehide`.
- Tests: **1016 pass** (up from 981). New `engine/save.test.ts` (35) covers the
  round-trip against a fingerprint of every subsystem with its own restore path,
  a load that fails changing nothing, unknown ids, lapsed buffs, playtime,
  migrations (including the newer-than-us refusal and the `1.10 > 1.9` ordering),
  the backup rotation, the corrupt-live fallback, a store that throws on every
  call, and **the acceptance case: export → hard reset → import restores the
  exact state**.
- Verified in a real browser (Chromium/Playwright, production build): 80 taps →
  **231.72 Sap**, a `visibilitychange` wrote `old-growth:save`, a reload came
  back at **231.72**; Export produced a **772-character `OG1:` string**; Hard
  Reset with `UPROOT` emptied the game to **0**; Import restored **231.72**.
  Recovery was checked in a pre-seeded context (truncated live save, good
  backup): the game opened at **144.32** with the toast _"Recovered from a
  backup — the last save was damaged, so the one before it was opened instead"_,
  and a context with both slots wrecked opened a fresh tree saying _"Save could
  not be read"_. No page errors.

**Manual test — verifying an offline absence**

STEP 14's note asked for this once saves existed, and now they do. In devtools:

```js
const save = JSON.parse(localStorage['old-growth:save']);
save.data.lastUpdatedAt -= 5 * 3600 * 1000; // five hours ago
localStorage['old-growth:save'] = JSON.stringify(save);
location.reload();
```

The "While you were away" modal opens on a five-hour absence. The same edit with
a number past the cap shows the capped line.

**Design decisions worth knowing**

- **The registry is empty and tested anyway.** A migration system written after
  the first breaking change has to be retrofitted to a format nobody planned to
  migrate. One written before it costs an afternoon and a test that starts
  failing the moment someone adds a step with a gap in the chain.
- **Refuse forward, never convert backward.** A player on an old tab is told
  their save is too new. A lossy down-conversion would be silent data loss
  dressed as helpfulness.
- **Hard Reset clears the backup too.** A reset the next load could undo is not
  a reset.
- **The corruption guard could not be demonstrated by reloading the page** —
  `pagehide` fires on reload, so the app's own autosave overwrote the deliberate
  corruption before the next load could see it. That is the autosave doing its
  job; the browser check seeds a fresh context instead. Worth remembering the
  next time something "cannot be reproduced" in a live tab.

**Open TODOs**

- [ ] **`ENGINE_VERSION` is kept in step with `package.json` by hand.** A
      build-time define would drag Vite's config into the engine's tests for the
      sake of a string; STEP 20 owns the release build and is the place to
      revisit it.
- [ ] Settings holds one preference. STEP 16 (volumes) and STEP 18 (font scale,
      colour-blind patterns, reduced motion) both add fields, and
      `normaliseSettings` is where they land.
- [ ] No autosave on prestige or on a graft — the interval covers them within
      30 s, but the two most consequential single actions in the game deserve a
      write of their own.
- [ ] The export is a string in a textarea. A `.ogsave` file download is the
      obvious next step and belongs with STEP 18's final UI.
- [ ] Nothing prunes an old backup: two keys is the whole scheme. A rotating
      three-deep history would survive a corruption that happened to be autosaved
      twice, which this does not.

### 2026-08-27 — STEP 14: Offline progress

Thirteen steps of systems that only run while someone is watching. This one asks
what the tree does with the other twenty-three hours, and answers it with the
oldest rule in the game: **the tree rests and the roots work.**

- `src/content/offline.ts` — **new**. The threshold (60 s), the chunk (60 s), the
  canopy's offline share (0.25), the tag it lands on, and the count-up's 1.5 s.
- `src/engine/offline.ts` — **new**, and pure throughout: `planOffline` (how much
  of an absence counts), `offlineSteps` (how it is cut up), `offlineModifiers`
  (what the canopy works under), `offlineNotes` (what to say about it),
  `gainBetween`, `formatDuration`.
- `src/engine/simulation.ts` — `catchUpOffline(now?, minSeconds?)`, and the whole
  design is that **it drives ordinary ticks**. The season, the sky, the
  symbionts' clocks, the litter, the lapsing buffs — every one of them advances
  through exactly the code that advances it while the player is watching. A
  second implementation that "simulates the same thing faster" is a second
  implementation to keep in step, and it would drift within two steps.
  - **The canopy penalty is one revocable modifier on the `canopy` tag**, not a
    branch in the payout loop. Underground producers carry `OFFLINE_TAG` and not
    that one, so the rule is expressed by _which producers the modifier can
    reach_. It is granted in a `try` and revoked in the matching `finally`:
    leaving it published would quarter the canopy for the rest of the session,
    and that is a bug that would look like balance.
  - **Rings are not special-cased.** `updateSeason` pays every boundary the clock
    crossed, so a winter the tree stood through pays whether anyone watched it.
  - Per-second rates are re-read _after_ the penalty is revoked, so the HUD opens
    on the tree's real Light/s rather than on a quarter of it.
- `src/engine/weather.ts` — `update()` gained `allowAny`. STEP 12's `allowStorm`
  only skipped the storm, so **a drought fired during the first offline test
  run** — a penalty applied to somebody who was not there to react to it, which
  is exactly the "never cause losses" line this step is supposed to hold. Weather
  already _running_ when the player left still ends normally; only what has yet
  to land is skipped, and the schedule rolls on rather than queueing a backlog.
- `src/ui/AwayModal.tsx` + `.css` — **new**, and the only modal in the game. The
  gains are **already in the balances** when it opens: the simulation ran, and
  holding numbers back from their own systems to hand over on a button would be a
  second source of truth. Collect animates the _count-up_ — each row from zero to
  its total over 1.5 s — and a second press skips it.
- Tests: **981 pass** (up from 939). New `engine/offline.test.ts` (30) covers the
  threshold from both sides, the cap at and past its edge, a clock that ran
  backwards, a `NaN`/`Infinity` elapsed, chunking that sums to exactly what it
  was given, the penalty's shape and revocability, the never-negative floor, and
  every note line. `simulation.test.ts` gained 12, including the three the
  acceptance criteria name — **30 s (no modal), 2 h (roots in full, canopy at a
  quarter), 20 h (capped)** — plus the penalty never outliving the catch-up, the
  weather staying away, and the symbionts' clocks advancing.
- Verified in a real browser (Chromium/Playwright, dev server, harness deleted
  before commit): a 5 h absence rendered **300 chunks → +1.73K Light, +12.23K
  Water**, with the season turn, the songbird's 100 fragments and the squirrel's
  37 nuts written out underneath; Collect counted both rows up and fired its
  callback. A 20 h absence rendered **capped to 8 h**, its line reading "8h of
  growing — you were gone 20h". No page errors beyond the pre-existing favicon 404.

**Manual test — how to verify an absence by hand**

Nothing persists yet (STEP 15), so `lastUpdatedAt` cannot be edited in a save
file. Until it can, either of these works:

1. **In the running game**, from the devtools console before the first frame is
   awkward — the `Simulation` is held in a React ref. Easiest is to add a
   temporary line to `App.tsx` immediately before `sim.catchUpOffline()`:
   `sim.state.lastUpdatedAt = Date.now() - 5 * 3600 * 1000;` — reload, and the
   modal opens on a five-hour absence. Delete the line afterwards.
2. **From a test**, which needs no edit at all:
   `sim.state.lastUpdatedAt = Date.now() - hours * 3600 * 1000; sim.catchUpOffline();`
   — this is what `simulation.test.ts`'s `away(secondsAgo)` helper does.

Once STEP 15 lands, the intended route is to edit `lastSeen` in the exported save
and re-import it; this note should be replaced with that.

**Design decisions worth knowing**

- **60-second chunks, not finer.** Every system the catch-up advances is written
  against elapsed seconds rather than tick counts, so a smaller step buys nothing
  but arithmetic. Twelve hours is 720 chunks; the same span at the live 100 ms
  step would be 432,000 and the load would hang.
- **A broken clock earns nothing.** A negative elapsed (timezone change, NTP
  correction, a save carried between machines) is treated as zero, and so are
  `NaN` and `Infinity` — paying out the cap for a corrupt timestamp would turn a
  broken clock into a reward.
- **`gainBetween` floors at zero even though nothing offline spends.** The
  guarantee belongs where the number is produced, not in the memory of whoever
  later adds a system that _does_ spend while away.
- **The cap is stated, not hidden.** A 20 h absence says "you were gone 20h" next
  to what it paid. A player who lost eight hours should be told, once, in the
  quiet voice — that is what makes Tempo's "+4h offline cap" legible as an
  upgrade rather than as a number in a menu.

**Open TODOs**

- [ ] **The squirrel's cadence is loud over a long absence.** A day is 480 s, so
      five hours buries 37 nuts and a full 12 h cap buries ~90 — every one of
      which sprouts a free root segment on the next load. Correct per STEP 11's
      data and harmless to this step's arithmetic, but it is the first place the
      offline multiplier makes a per-day payout look different. STEP 19 owns it.
- [ ] The songbird pays 100 fragments — a whole Seed — in five idle hours, same
      cause, same owner.
- [ ] Nothing persists (STEP 15), so `lastUpdatedAt` only ever spans one page
      session and the modal is unreachable in ordinary play. Everything below the
      clock is finished and tested; it is one field away from being live.
- [ ] The count-up runs in the modal's own rows. STEP 16 owns "HUD numbers tween
      instead of jumping", and when it lands the two should share one tween
      rather than the modal keeping its own.
- [ ] `catchUpOffline` is not called again on `visibilitychange`. A tab left open
      but backgrounded is throttled rather than stopped, so it drifts slowly
      behind wall-clock time; STEP 15's autosave hooks are the natural place to
      settle that.

### 2026-08-27 — STEP 13: Prestige — Go to Seed, Heirlooms, Old Growth forest

Every system so far has made the tree bigger. This is the first one that takes it
away, and the whole step is about making that trade legible before it is made and
visible after: a maturity gate the player can watch fill, a payout quoted on the
button they press, six seconds in which the canopy leaves, and a hill that is one
tree fuller every time.

- `src/content/prestige.ts` — **new**. The gate, the yield, the forest bonus, and
  the Seed Vault as data: four branches of five nodes, each knowing what a level
  of it grants. Adding an heirloom is an edit here and nowhere else.
  - **The maturity gate is set _equal to_ the yield's divisor, not near it.**
    `Seeds = ⌊√(light / 1e6)⌋`, so the tree can seed at exactly 1e6 lifetime
    Light — the point the formula first pays a whole Seed. A prestige that reset
    the run and handed back nothing would be a trap, and tying the two constants
    together is the one line that makes it impossible. There is a test asserting
    it that will fail if either moves without the other.
  - **The height gate had to be measured before it could be chosen.** A canopy has
    a hard ceiling: `depthFalloff` shrinks every generation, so each branch above
    the last buys less height, and a tree grown as greedily upward as the rules
    allow tops out near 1.32 canonical units. The first pass at this file said
    1.25 — 95% of an unreachable maximum. It is 1.15, roughly a dozen deliberate
    parts, with real headroom for a player who builds a round tree instead of a
    spire.
- `src/engine/prestige.ts` — **new**, and pure throughout. Height, spread,
  dominant species, the yield, the forest's modifiers, the memory capture and the
  ceremony's clock. The gate is quoted in the HUD sixty times a second, the payout
  on the confirm button, the ceremony on the canvas — three consumers that must
  agree, and none that should be able to change anything by asking.
  - **The design's `+ seedFragments/100` awards a fraction of a Seed**, and a
    fraction of a Seed cannot buy anything: every heirloom is priced in whole
    ones. So the fragment term is floored like the other one and the remainder is
    _kept_ — ninety fragments the songbird worked for are ninety fragments in the
    next run, not a rounding error nobody sees.
- `src/engine/heirlooms.ts` — **new**. A levels-only ledger, the one in the game
  that a reset copies rather than replaces. Most heirlooms are ordinary modifiers
  under one revocable source; the rest are capabilities the engine reads directly,
  the same shape the Rake takes.
- `src/engine/simulation.ts` — **the reset is a swap, not an unwind.** A fresh
  `createInitialState` is built and the handful of things that outlive a tree are
  copied onto it. Everything else resets _because it was never carried_, which is
  the safe way round: a field added by a later step starts clean rather than
  leaking into the next run because someone forgot a line in a thirty-field
  teardown. `state` became reassignable for this, and only `goToSeed` reassigns it.
  The constructor's republish sequence is now `hydrate()`, shared by both paths.
  - **Heirlooms top the current run up rather than waiting for the next reset.**
    The Vault is spent _after_ a prestige, so a Seedcase bought with the Seed the
    reset just paid would sit inert for a whole run — the first purchase every
    player makes, appearing to do nothing. `runStartLevels` records what this run
    has already been handed, and a purchase grants the difference. A remembered
    _layout_ stays deferred, and deliberately: replaying a tree into one the
    player is already building would fight for slots that are taken.
  - Buying Quickening re-derives the season on the spot and re-marks the index as
    seen. A shorter year is a different reading of the same moment, and the
    winters that would suddenly be "behind" the tree were never lived through —
    paying rings for them would make Tempo a way to buy the one multiplier that
    cannot be bought.
- `src/render/forest.ts` — **new**. Silhouettes standing on the near hill band,
  each at the spot its own planting index gave it (golden-ratio spacing, so a new
  tree lands in the largest gap and no existing one ever moves). Past thirty it is
  a counter. The **most recent** thirty are drawn, so the tree just planted is
  always among them.
- `src/render/ceremony.ts` — **new**. The canopy lets go from the top down and
  drifts _upward_ — the one thing in the game that moves against gravity, which
  is why it reads as an ending rather than as another effect. Pure functions of
  the leaf positions and one fraction: no pool, no RNG at draw time.
- `src/ui/SeedVault.tsx` — the Vault drawn as **a trunk in cross-section**,
  because the season badge already taught the player to read rings as this tree's
  own wood. Four limbs, each a chain: a node opens only once the one before it is
  owned, so the shape on screen _is_ the dependency.
- `src/engine/resourceRegistry.ts` — `restore(id, amount, total)`: the one write
  that is neither a gain nor a spend. Carrying Seeds across into a fresh registry
  cannot be `add` — that would restate the whole lifetime as this run's earnings.
  STEP 15's loader wants exactly this for every resource.
- Tests: **939 pass** (up from 797). New `engine/prestige.test.ts` (33),
  `engine/heirlooms.test.ts` (32), `render/forest.test.ts` (19),
  `render/ceremony.test.ts` (16); `simulation.test.ts` gained 42 across both
  maturity gates, the ceremony's timing and locked payout, exactly what the reset
  keeps and gives up, the forest accumulating and paying, the Vault's chain
  gating and run-start top-up, and the acceptance criterion itself — the same
  scripted forty taps earn strictly more on the second run than the first.
- Verified in a real browser (Chromium/Playwright, 1280×800): the Vault reads
  "READY TO SEED" with both bars full; Go to Seed dims the world and sends the
  canopy up as glowing seeds on trails; the reset leaves a seedling, banks the
  Seeds and stands the old tree on the hills; buying Seedcase puts 200 Sap on the
  counter immediately. 58–59 fps, no page errors.

**Two things the screenshots changed**

- **The grove was drawn too large and too saturated.** At a tenth of the canvas
  it read as a hedge in _front_ of the ridgeline and pulled the eye straight off
  the player's own tree. It is 7.5% now, hazed 58% toward the hill behind it —
  enough that no two neighbouring species look alike and no further.
- **The counter was in the bottom-right corner, behind the upgrade panel.** Both
  corners of the sky already hold a panel; it is centred now.

**Design decisions worth knowing**

- **The ceremony's payout is locked in when it opens, not when it lands.** The
  number on the button is the number the player agreed to, and six more seconds of
  Light must not quietly change it. There is no cancel: going to seed is the one
  irreversible thing in the game, and a cancel button would make it a dialog.
- **Planted totems and residents do not survive.** The recipes are content and are
  never forgotten, but a carving stands at the base of a tree that no longer
  exists, and a creature lived in _that_ tree. Bond is the supported way to keep
  one, and it costs Seeds precisely because free symbionts across a reset would
  make the whole branch pointless.
- **The ground is carried over.** Soil does not change because a tree died — and
  it is what keeps Memory honest: a remembered root layout has to come up in the
  veins it was dug for.
- **The forest's bonus is per resource, like a Ring's.** "Base production" has to
  mean all of it, and a tag is something a future producer can forget to carry.

**Open TODOs**

- [ ] **Nothing persists (STEP 15).** `heirlooms`, `forest`, `memory`,
      `bondSymbiont`, `runStartLevels` and the banked Seeds are all in `GameState`
      and snapshotted. `HeirloomLedger.clear()` is the load hook. Note that
      `runStartLevels` must be saved _with_ the ledger or a reload would re-grant
      every starting balance the run has already spent.
- [ ] **A million lifetime Light is roughly a day of a first-pass canopy.** The
      formula is the design's and the gate is tied to it, so the knob is
      `SEED_LIGHT_DIVISOR` alone — but STEP 19 owns whether a first prestige
      should be a day away. It is the single most important number in the file.
- [ ] `offlineCapHours` is read by the Vault and by nothing else. STEP 14 owns
      what the cap _does_; `BASE_OFFLINE_CAP_HOURS` is a placeholder until it does.
- [ ] Canopy Map replays the whole previous tree, which makes the next run mature
      on its first tick — the height gate is satisfied by construction and only
      the Light gate remains. That may be exactly right for a 25-Seed node deep in
      a branch, or it may need the gate to move. STEP 19.
- [ ] The Vault is visible from the first frame, quoting a gate the player has no
      way to understand yet. STEP 17's progressive disclosure should hide it until
      the tree is some way toward maturity.
- [ ] The ceremony ignores `prefers-reduced-motion` (STEP 16 owns this) and has no
      audio cue of its own — the largest event in the game currently happens in
      silence.
- [ ] Forest silhouettes are not culled against the viewport, and with thirty of
      them spread over 1.9 screen-widths a zoomed-in player sees only a few. The
      counter says how many there are; it does not say where.
- [ ] Achievements are named in the design's keep-list and do not exist yet
      (STEP 19). Nothing about the reset will need to change when they do — they
      are simply another ledger to copy across.

### 2026-08-26 — STEP 12: Seasons and weather events

The tree has had a clock since STEP 8 — a day that gets dark and comes back.
This gives it a **calendar**: four seasons the tree lives inside, and weather
that interrupts them. It is the first system that changes the game without the
player having done anything, so almost all of the work is in saying so clearly:
a badge that names the season, a sky that turns before the storm lands, and a
canopy that is visibly gold in October.

- `src/content/balance.ts` — **new**. Every tunable this step introduced, in one
  file, because the numbers are the part that will move most (and because STEP
  13's Tempo heirloom needs one number to scale, not a definition to rewrite).
  Season length, the ring bonus, the weather cadence, the storm's brace, the
  litter rate.
- `src/content/seasons.ts` — **new**. The four as data: standing modifiers, a
  colour cast, and two flags for the mechanics that are not modifiers
  (`shedsLitter`, `earnsRing`).
  - **Winter's "−60%" is read as two things going the _same_ way.** Light ×0.4 is
    the plain reading; growth cannot also be −60% because Spring already spends
    "−20%" on making growth _cheaper_, and a winter that discounted prices
    further would reward the hardest season in the game. So winter's growth is
    ×1.6 — dearer, not cheaper. It is the one place this step reads against the
    letter of the design line, and `WINTER_PENALTY` carries the reasoning.
- `src/content/weather.ts` — **new**. Rain, storm and drought, with a telegraph
  line each. The **drought's immunity rule is data**: its modifiers are derived
  from the strata table minus `DROUGHT_IMMUNE_STRATUM`, so adding a layer to the
  ground cannot quietly leave a hole in the weather.
- **Roots now carry the layer they work in.** `partProducerTags` gained an
  optional stratum and emits `soil:clay` plus `soil:clay/water`. That two-part
  tag is the same trick `speciesResourceTag` plays, and it is the whole of the
  drought's immunity: a modifier can dry out the shallow roots and leave the
  ones that reached the rock, without naming a single node — and without
  touching Minerals, which a drought has no business taking.
- `src/engine/seasons.ts` — **new**. Which season it is is a _pure function of
  elapsed time_, exactly as the hour of the day is; the simulation stores only
  which season it last **saw**, so it can notice a boundary. Rings are the
  deliberate exception: a ring is a record of a winter lived through, so it is
  stored — prestige (STEP 13) keeps Rings and resets everything else, and a
  derived count would have nowhere to live.
  - `ringsEarnedBetween(from, to)` counts winters over the whole span rather than
    one per call, so an offline jump of a week pays exactly what sitting through
    it would have. `seasonAt` takes the season length as a parameter — that is
    the accelerated test mode, and STEP 13's Tempo knob.
- `src/engine/weather.ts` — **new**. A three-field state machine (running,
  announced, next roll) advancing on **engine seconds**, with time and randomness
  both passed in — so a whole year of weather is reproducible from one seed. Each
  transition is stamped with the moment it was _due_, not with `now`, so a long
  jump replays the schedule on its own timeline instead of bunching every event
  onto the first tick back (bounded by `MAX_WEATHER_STEPS`).
  - **Storms are online-only, enforced twice**: never drawn while `allowStorm` is
    false, and one already announced is _dropped_ rather than run if the player
    leaves before it lands. `Simulation.tick(dt, { offline })` is the switch STEP
    14 will throw.
  - The storm itself is resolved by the simulation out of pure helpers here —
    `wideLimbs` (branches leaning more than 45° off vertical; the leader points
    into the wind and is safe), `braceFraction`, `chooseSnappedLimbs` (hard cap
    of two, whatever the rolls say). What snaps pays **Deadwood only**: a storm is
    not a harvest, and there is no refund for wood nobody chose to cut.
- `src/engine/litter.ts` — **new**. Autumn's piles are _places_, not a number
  going up: each has a position at the base and is swept by clicking it. Capped
  at six, so a season spent elsewhere is worth one sweep rather than a backlog,
  and piles survive into winter — leaves left in the snow are still leaves.
- `src/content/upgrades.ts` — the **Rake**: the first upgrade that grants no
  modifiers at all. It buys a capability the engine reads directly, and it is
  priced in the thing it collects, so a few piles swept by hand buy the tool that
  sweeps the rest. Buying it sweeps the base on the spot.
- `src/engine/simulation.ts` — season and weather go into the tick right behind
  buffs, ahead of the residents: a rain that starts on this tick must be worth its
  triple _on_ this tick, and a winter that turns on it must not pay a single
  second at summer's rates.
- `src/render/weather.ts` + `src/render/litter.ts` — **new**, and everything in
  them is a pure function of engine seconds: no particle pool, no RNG, so the
  whole sky is testable without a canvas. Seasons and weather repaint the world
  by **casting** a colour over the existing palette (`ColorCast` in `./color.ts`,
  which now parses `rgb(...)` as well as hex so casts compose) — October is the
  same tree as June, tinted. The brace anchor is drawn on the trunk rather than in
  the HUD: bracing is _holding the tree_, and a button in the corner would be a
  quick-time event with a tree in the background.
- `src/ui/SeasonBadge.tsx` / `WeatherBanner.tsx` — **new**. The badge names the
  season, what it is doing to the numbers, and how long is left; the rings are
  drawn as what they are, a trunk in cross-section. The banner is the only piece
  of chrome that asks for something back, and it disappears entirely when the sky
  is clear.
- `src/ui/sfx.ts` — `playWeatherCue`, three shapes rather than three pitches:
  rain falls, a storm gathers, a drought hangs. The design asks for the telegraph
  to be audible as well as visible.
- Tests: **797 pass** (up from 664). New `engine/seasons.test.ts` (28),
  `engine/weather.test.ts` (35), `engine/litter.test.ts` (12),
  `render/weather.test.ts` (20) and `render/litter.test.ts` (10);
  `simulation.test.ts` gained 28 across the accelerated year, ring stacking and
  persistence, the offline storm ban, the brace, the litter rhythm and the Rake.
  Two existing growth-price tests now quote prices _through Spring_ — a fresh save
  opens in a growth discount, and pretending otherwise would have hidden it.
- Verified in a real browser (Chromium/Playwright, 1280×800): the four seasons
  read as four different pictures — spring fresh, summer rich, autumn gold with
  heaps of litter along the base, winter frosted through sky, foliage, hills and
  soil. Rain falls in slanted streaks; a storm darkens the whole scene, flashes,
  and puts a **BRACE** ring on the trunk with the banked brace drawn as a green
  arc; two storm frames 0.9 s apart differ, so it is live. The game itself opens
  on "🌱 Spring 1/20" in the HUD with the grow menu quoting **BR 12** rather than
  15 — the season is visible in the price before it is read in a tooltip. 60 fps,
  no page errors.

**Design decisions worth knowing**

- **A ring is the only permanent multiplier that cannot be bought.** It is the
  reason to sit through the worst season in the game rather than log off for it,
  and it is why winter had to be legible at a glance: the badge, the sky, the
  foliage and the soil all change together.
- **Rain is drawn in pale streaks, not blue ones.** A blue line over a blue sky
  is a line nobody sees. Caught in the frames.
- **Rain is clipped at the ground line.** The underground is a cross-section, and
  rain falling through the clay is the kind of small wrongness that cannot be
  un-seen once noticed. Also caught in the frames.
- **The season casts _over_ the shade tint, not instead of it.** Shade is about
  one leaf and is applied first; the month happens to the whole tree and goes on
  top. A crowded canopy still tells on itself in October.
- **A storm owns the pointer for its fifteen seconds** — the anchor gets first
  refusal on every press, ahead of prune and graft mode. It only exists during
  those fifteen seconds, so nothing is taken away from the player the rest of the
  time. A pile of leaves is the opposite: it is not part of the tree, so no mode
  has an opinion about it and it sweeps up whatever else is happening.

**Open TODOs**

- [ ] **Nothing persists (STEP 15).** `rings`, `seasonIndexSeen`, the weather
      scheduler and the litter piles are all in `GameState` and snapshotted;
      `WeatherScheduler.clear(nextRollAt)` and `LitterGround.clear()` are the load
      hooks. **A save loaded with a stale `nextRollAt` will replay the schedule**
      up to `MAX_WEATHER_STEPS` — the loader must re-arm the roll to just after
      the restored `elapsedSeconds`, which is exactly what `clear` takes an
      argument for.
- [ ] Season length (20 engine days ≈ 2h40 a season, ~10h40 a year) is the
      design's number and makes a Ring a very long-run reward. STEP 19 owns
      whether that is right; the knob is `SEASON_LENGTH_DAYS` alone.
- [ ] Weather cadence, the storm's snap chance and the litter rate are first-pass.
      In particular nothing yet stops a player from simply not being there for
      storms: there is no penalty for ignoring one beyond the two limbs.
- [ ] A storm that takes the tree's leader does **not** grant a Lateral Surge, the
      way a deliberate cut does. Arguably it should — apical dominance does not
      care who did the cutting — but a storm is not a decision and paying it out
      like one felt wrong. Revisit with STEP 19.
- [ ] The storm's damage has no debris: the toast says what was lost, but the
      limbs vanish between frames. `EffectPool.spawnPruneBurst` wants the screen
      positions of the doomed limbs, and by the time the report exists they are
      gone from the graph.
- [ ] Rain and the storm ignore `prefers-reduced-motion` (STEP 16 owns this), and
      the weather cues are synthesised in the temporary `sfx.ts`.
- [ ] Litter piles are not culled against the viewport, and the anchor is drawn
      even when the trunk is off-screen (clamped into view on purpose — but a
      zoomed-in player gets an anchor with no trunk under it).
- [ ] The Rake is visible in the upgrade panel from the first frame, priced in a
      resource the player has never seen. STEP 17's progressive disclosure should
      hide it until the first pile falls.

### 2026-08-08 — STEP 11: Symbiont creatures

Everything in the game so far has been bought. A symbiont is **attracted**: it
turns up on its own once the tree has become the kind of tree it wants to live
in, and the only way to bring one is to build toward what it needs. The tree
stops being a machine the player operates and starts being a place other things
live.

- `src/content/symbionts.ts` — **new**. The five as data: an attraction
  condition, a per-level effect, a mixed-resource upgrade track, flavour, and the
  line the arrival toast says. Conditions are plain measurements of the tree's
  shape — three blossoms, five lifetime Deadwood, a root tip in the Clay, canopy
  height, an oak branch — so the panel can show live progress toward one without
  the condition describing itself twice.
  - **Level 1 is free: it is what arriving means.** Levels 2–5 are bought, and
    every price is in **two resources**, so no track can be levelled entirely out
    of the half of the economy it belongs to. A test enforces that, and another
    enforces that no price names Leaf Litter or Seeds — nothing produces either
    yet, and a price in one would be a track that cannot be bought.
  - Two of the five do something the modifier system has no vocabulary for, so
    they say so rather than being bent into modifiers that would misrepresent
    themselves: `veinReachPerLevel` (the fungus) and `cadence` (the bird's Seed
    Fragments, the squirrel's nuts).
- `src/engine/symbionts.ts` — **new**. `SymbiontLedger` (who is here, at what
  level, and when each is next due), `symbiontContext` (every measurement the
  five conditions need, in **one** walk of the graph), `conditionProgress`,
  `symbiontModifiers`, `veinReachOf`, `symbiontLevelCost`.
  - `claimDue` counts **whole intervals**, not one per call, and advances the
    clock by exactly that many — so the cadence cannot drift when a payout is
    collected late, and the same code is correct for a 100 ms tick and for STEP
    14's offline catch-up. `MAX_CATCH_UP_PAYOUTS` bounds the latter.
  - Level scaling reuses the upgrade convention exactly (`add` × level, `mul` ^
    level). "Level 3" has to mean the same thing wherever a player reads it.
- **Vein reach.** `veinAt(soil, point, reach)` and `soilConditionsAt(..., reach)`
  widen every pocket's _radius_ without moving it or changing its richness — a
  fungal network does not create minerals, it extends how far a root can feel for
  them. It is threaded through `PartContext.veinReach` and
  `priceGrowthOptions`, so the grow menu quotes what a tip _will_ find under the
  current network before it is bought, exactly as it already did for depth.
- `src/engine/simulation.ts` — `updateSymbionts()` (arrivals + the banked
  progress rows), `collectSymbiontPayouts()`, `republishSymbionts()`,
  `upgradeSymbiont()`, `drainSymbiontArrivals()`, `plantBuriedNuts()`. Tick order
  gained one step behind buffs: **residents are a standing input**, not an event
  the tick should pay around. Growing, pruning and grafting all refresh the rows
  immediately, so the third blossom brings the bees _on the purchase_ rather than
  up to a tenth of a second later.
  - **A wider reach rebuilds the whole part pipeline.** A root tip in barren
    ground registers no producer at all (STEP 7's rule), and a producer that does
    not exist cannot be patched — so when the reach moves, `syncPartProducers()`
    runs. The constructor orders this by hand: reach first, then producers.
  - The buried nuts sprout **in the constructor**, before anything is measured,
    so a free root is part of the tree that loads rather than something that
    appears on top of it. `sproutedNuts` is the handle STEP 14's "While you were
    away" summary will read. A nut with nowhere to sprout is _kept_, not spent.
- `src/render/symbionts.ts` — **new**. A creature is a thing living _in the
  tree_, so every one is positioned off the tree's own projected geometry and
  moves with the camera: bees fly between the actual blossoms the player bought,
  the ants' road runs up the actual trunk, the bird takes the highest twig there
  is and takes a different one when a higher one is grown. `symbiontScene()`
  reduces the projection to those points once per projection change, never per
  frame; the motion is pure functions of engine seconds, so flight paths, the
  ant column and the perch are all tested without a canvas.
- `src/ui/Symbionts.tsx` + `.css` — **new**. Every creature is on the list from
  the first frame, including the four that have not arrived: a locked card with a
  live progress bar is a _goal_, and hiding it would leave the whole system
  invisible until it happened by accident.
- `src/ui/App.tsx` — the **S** hotkey, the panel (mutually exclusive with the
  Journal), and the arrival toast, driven off `drainSymbiontArrivals()`.
- Tests: **664 pass** (up from 575). New `engine/symbionts.test.ts` (45 — the
  catalogue's shape and price rules, the ledger incl. drift-free cadences and the
  catch-up cap, all five condition kinds, `symbiontContext` against a real graph,
  level scaling, modifier publication, vein reach, and the "arriving is not a
  lease" rule) and `render/symbionts.test.ts` (26 — scene extraction, the perch
  rule, bee flight incl. the single-blossom orbit, ant traffic, the squirrel's
  pauses). `simulation.test.ts` gained 15 across arrivals, the residency rule,
  the mixed-price transaction, the songbird's clock and the squirrel's nut, and
  `soil.test.ts` 3 for reach.
- Verified in a real browser (Chromium/Playwright, 1280×800, production build):
  the panel opens on **S** showing **0/5** with five locked cards, each quoting
  its own hint; 220 taps → **553.73 Sap**; growing one branch brought the
  **squirrel** — toast up, panel **1/5**, the card reading "Cache 1" with the pip
  track, "Next in 7:59" and a **Cache 2 · 80 Sap / 25 Water** button, and the HUD
  badge at 1. A separate render harness (dev server, deleted before commit) drew
  all five at level 4 on one tree: bees over the blossoms, the bird clear on a
  twig, the squirrel climbing the trunk, the ant column on its road, and the
  roots sheathed in violet hyphae with the pockets glowing at **×3** reach. Two
  frames 0.9 s apart differ, so the idle animation is live. No page errors.

**Design decisions worth knowing**

- **A resident is never evicted.** Pruning the blossoms that drew the bees does
  not send them away. Conditions are an _attraction_ mechanic, not an upkeep one;
  the alternative turns every cut into a hostage negotiation, and STEP 9 exists
  to make cutting feel free.
- **The squirrel is the earliest creature in the game, deliberately.** Its
  condition is one oak branch, so it arrives on the first purchase a new player
  makes. The first toast should land while they are still learning what a branch
  is, not forty minutes in.
- **The bird will not perch inside a bush.** The first pass took the highest
  wood, which is usually a twig with a leaf cluster drawn around its tip — the
  bird was half-buried in foliage. `symbiontScene` now excludes tips that carry
  foliage, falling back to the highest tip when every one of them does. Caught by
  looking at the rendered frame, not by reading the code.
- **The fungal web is violet, not pale.** The first pass sheathed each root in a
  light glow and bleached them into bare sticks against the brown. A violet
  sheath reads as _something growing on the root_. Also caught in the frames.
- **Ants move Sap on two lines, resource and `click.power`** — the same
  compromise Lateral Surge makes, for the same reason: taps are still the only
  Sap income in the game, so a resource-only modifier would be invisible.
- **The mineral halo grows with reach; the ore does not.** The specks stay
  exactly where they were and the halo widens and dims, so the fungus reads as
  "the ground has fewer secrets" rather than "there is more ore now".

**Open TODOs**

- [ ] **Nothing persists (STEP 15).** `symbionts`, `seedFragments`, `buriedNuts`
      and `veinReach` are all in `GameState` and snapshotted;
      `SymbiontLedger.clear()` and `republishSymbionts()` are the load hooks. The
      squirrel's whole mechanic is _next session_, so it is the one symbiont that
      cannot actually pay out until saves land — its nuts accrue and the panel
      says so, and `Simulation.sproutedNuts` is already wired.
- [ ] Seed Fragments accrue but buy nothing until STEP 13's prestige converts
      them (100 = 1 Seed). The panel shows the running count.
- [ ] The vein-reach numbers (+50%/level, so ×3.5 at level 5) and every upgrade
      price are first-pass. STEP 19 owns balance — in particular whether a
      level-5 network makes root-tip placement stop mattering, which would undo
      most of STEP 7.
- [ ] STEP 7's "vein discovery is free" TODO is **half closed**: reach is now a
      thing the fungus extends, but every pocket is still _drawn_ from the first
      frame. Hiding undetected veins is the other half and belongs with STEP 17's
      progressive disclosure.
- [ ] Symbiont conditions are re-evaluated every tick (one graph walk at 10 Hz).
      Cheap under 500 nodes; if it shows up in a profile, gate it on
      `tree.revision` plus a lifetime-total watermark.
- [ ] The creatures ignore `prefers-reduced-motion` (STEP 16 owns this) and have
      no sound. The arrival ring is the only ceremony.
- [ ] Creatures are not culled against the viewport — there are at most five of
      them, but a zoomed-in camera still pays to draw the ant column off-screen.
- [ ] The panel has no keyboard path into the upgrade buttons beyond ordinary tab
      order, and no touch layout (STEP 18).

### 2026-08-07 — STEP 10: Species and grafting discovery

Until now every part of the tree was made of the same anonymous wood. Now a part
is made of _something_: six species you unlock and choose between, and fifteen
hybrids you make at a fork by joining two limbs that grew there. The tree stops
being one plant and starts being a collection of decisions you can see from
across the screen.

- `src/content/species.ts` — **new**. The six as data: palette (eleven colours,
  all required), flavour, cost multipliers, unlock milestone, and traits. The
  interesting part is that traits are declared **relative to the species** rather
  than as raw modifier targets, through `SpeciesTraitTarget`:
  - `ownProduction` — this species' parts, optionally one resource of them.
  - `ownLimbClick` — taps landing on this species' wood.
  - `ownTag` — any tag, scoped to this species; the general form of the above.
  - `tree` — the whole tree, **scaled by this species' share of it**.
  - `price` — publishes nothing; realised by the cost multipliers, and listed
    only so the Journal can show Birch's discount as the trait it actually is.
- `src/content/hybrids.ts` — **new**. All fifteen unordered pairs, keyed by
  `pairKey`, each with its own palette, flavour, a **hint line for its
  silhouette**, and effects no other entry has. Hybrid traits are local by rule —
  a hybrid is a _place on the tree_, not another global percentage — and a test
  enforces it.
- `src/engine/species.ts` — **new**, and the whole system rides on producer
  **tags**. A willow root registers carrying `species:willow` and
  `species:willow/water`, so "willow's Water" is an ordinary tag-targeted
  modifier and the economy never learns that species exist. The two-part tag is
  load-bearing: `ModifierSet.matching` matches a producer by resource _or_ by
  tag and never by both, so the conjunction has to live in a tag name.
- `src/engine/modifiers.ts` — `scopedTag(scope, tag)` (`species:cherry` +
  `click.critChance` → `species:cherry::click.critChance`). Nothing in the
  modifier system treats it specially; it works because the **reader** asks for
  it. `resolveClickStats(modifiers, scopes)` takes the struck limb's species, so
  Ironblossom's "×1.5 crit damage **on that limb**" is real rather than a
  rounding of itself into a global bonus. `Simulation.click` now takes the node
  id the tap landed on; omitting it resolves the tree-wide stats, which is what
  the HUD readout should show.
- `src/engine/graft.ts` — **new**. `quoteGraft` is a pure read that returns
  either a full quote or **one named refusal** (`not-adjacent`, `immature`,
  `same-species`, `no-hybrid`…), checked in the order a player meets them.
  Adjacency means parent-and-child — a graft happens at a fork the tree already
  has — and the **scion** (the upper limb) takes the hybrid along with everything
  it carries, the way a real graft puts the scion's wood on the rootstock's
  roots.
- `src/engine/treeGraph.ts` — a per-species tally maintained alongside the
  per-type one, and `respeciate(nodeId, speciesId)`, which **replaces** nodes
  rather than mutating them: nodes are handed out by reference all over the
  renderer, and one whose species changed under a consumer that had already read
  it would be a bug with no stack trace.
- `src/engine/growth.ts` — `partCost` takes a species and applies its price break
  to the **list price, before** the `growth.cost` modifiers, so a cheap species
  and a growth buff compose instead of one swallowing the other.
  `priceGrowthOptions` prices the whole menu as whatever the picker is showing.
- `src/render/speciesPicker.ts` — **new**. A row of chips hanging off the grow
  menu's anchor on the **opposite side from the dials** (under a canopy menu,
  over a root menu), each filled with its species' own bark so the row reads as a
  set of woods rather than a set of buttons. Pure layout + hit-test, tested
  without a canvas. It appears only at `PICKER_MIN_SPECIES` (2): a picker
  offering one option is a control that cannot do anything.
- `src/render/graft.ts` — **new**. The chosen limb stays outlined the whole time
  the player is looking for the second one; the hovered limb is outlined **green
  when the pair works and red when it does not**, so the adjacency rule is
  learned by pointing rather than by reading. Deliberately not prune's red wash —
  cutting and joining must never look alike.
- `src/render/tree.ts` — `woodColor(kind, speciesId)` and per-species foliage and
  blossoms. **This closes STEP 4's open TODO** ("bark colour per species; species
  do not exist until STEP 10").
- `src/render/effects.ts` — `spawnConfetti`: a pooled, ballistic burst on a
  cone rather than a sphere (a fountain reads as celebration, a sphere as an
  explosion). Longest-lived effect in the game on purpose — it fires a few dozen
  times in a whole run.
- `src/ui/Journal.tsx` + `.css` — **new**. Six species with their traits and, while
  locked, the milestone and a progress bar; fifteen hybrids of which the
  undiscovered are silhouettes carrying their **parent pair and one line of
  hint**. Naming the parents is deliberate: the table is deterministic, so a
  player reading the grid can go and _make_ the one they want instead of grafting
  at random. Dormant traits are greyed and say what they are waiting for.
- `src/ui/Toast.tsx`, `src/ui/GraftTooltip.tsx` — **new**. The toast fires once
  per never-before-made hybrid and dismisses itself. The tooltip always gives a
  _sentence_ rather than a greyed-out silence.
- `src/ui/App.tsx` — graft mode (**G**), the Journal (**J**), the picker's click
  path, and Escape backing out a chosen limb before the mode. Prune and graft
  turn each other off: two intentions aimed at the same limb must never both be
  live.
- Tests: **575 pass** (up from 490). New `species.test.ts` (32 — the complete
  15-pair table, order-independence, distinct effects, the local-only rule for
  hybrids, tag composition, share dilution, unlock thresholds and progress, and
  click scoping), `graft.test.ts` (16 — cost escalation, maturity, adjacency both
  ways round, and every refusal), `render/speciesPicker.test.ts` (11).
  `simulation.test.ts` gained 12 across planting, per-species pricing and output,
  the full graft transaction, discovery bookkeeping and the hybrid's effect
  landing on its limb and nowhere else; `treeGraph.test.ts` 7; `render/tree.test.ts`
  4; `render/effects.test.ts` 3.
- Verified in a real browser (Chromium/Playwright, 1280×800, production build):
  60 taps → **171.86 Sap**; the Journal shows **21 cards, 15 of them silhouettes
  and 5 locked species**, with dormant traits greyed and milestones quoted; **G**
  toggles graft mode (button `aria-pressed`, `app-canvas--grafting` cursor) and
  Escape leaves it. A separate render harness (dev server, deleted before commit)
  drew a four-species tree with a grafted Ghostwood limb: the picker rendered six
  chips in their own barks with **Cherry selected and its blossom priced at 30
  against a list 60** — the species discount reaching the menu label — and the
  graft overlay showed green on the held limb, red on a non-adjacent one, with
  confetti over the top. No page errors beyond the pre-existing favicon 404.

**Design decisions worth knowing**

- **Oak's Sap bonus is local, not tree-wide, and that was a correction.** Written
  as a whole-tree trait it was baked into the baseline — a new tree is _entirely_
  oak — and it then read as a **penalty for planting anything else**: taps
  quietly weakening as the player diversified, with nothing on screen explaining
  why. Scoped to oak wood it is a reason to keep tapping the trunk. (It also
  moved every click number in the game by 15%, which broke thirteen tests from
  STEPs 5–9 — the tests were the symptom, the trap was the reason.)
- **Whole-tree traits are diluted by share** (`1 + (value − 1) × share`), so
  every live trait today is local and only the dormant resistances are tree-wide.
  That is the shape STEP 12's seasons and weather want, and it is fully tested
  even though no live trait uses it yet.
- **The trunk counts toward the species tally.** It is a part of the tree like
  any other, and counting it makes Oak the identity a player has to actively
  dilute rather than a free extra — which is what being the starter should mean.
- **Unlock gating lives in `setPlantingSpecies`, not in `growPart`.** One choke
  point, at the one place the player expresses the choice; `growPart` takes the
  species it is given the way it takes the node it is given. It does refuse a
  hybrid, which is made at a fork and never bought from a menu.
- **A graft needs both limbs to carry something of their own.** Without the
  maturity rule grafting is "buy two branches, press the button" — no placement,
  no patience, no decision.
- **Discovery survives the limb.** Pruning a hybrid off drops it from the tally
  but not from the Journal: the Journal is a record of the save, and (from STEP 13) of everything before it.
- **Prune refunds are still quoted at list price**, species-agnostic. A birch
  limb therefore refunds less than the fraction of what it cost — 57% of it
  rather than 40% — which is a loss either way, so there is no exploit, but the
  asymmetry is deliberate and worth knowing.

**Open TODOs**

- [ ] **The discovery toast's React wiring is not covered in the browser run.**
      The engine half (`discovered === true` on a first graft) and the confetti
      are; triggering the real toast needs a graft driven through canvas clicks,
      which needs the limb coordinates the harness has and the app does not
      expose. A dev-only handle on the renderer would make the whole flow
      scriptable and is probably worth it before STEP 13's prestige ceremony.
- [ ] Species traits are first-pass numbers, and Pine's "everything +12%" is the
      one identity that is a number rather than a mechanic. STEP 19 owns balance;
      it may also want to look at whether Birch's −30%/−15% is ever the right
      trade.
- [ ] Nothing persists (STEP 15): `plantingSpecies`, `discoveries` and `grafts`
      are in `GameState` and snapshotted, and `republishSpecies()` is the
      rehydrate hook, but a reload starts again.
- [ ] The picker has no keyboard path and no touch variant (STEP 18), and the
      chip row can overlap a crowded canopy.
- [ ] A grafted limb cannot be grafted again — deliberate (`no-hybrid`), but it
      means a three-species limb is impossible. If second-generation hybrids are
      ever wanted, the table is the only thing that needs extending.
- [ ] Everything STEP 9 left open below still stands, except STEP 4's per-species
      bark, which this step closes.

### 2026-08-07 — STEP 9: Pruning, Deadwood and apical dominance

Growing has been one-way since STEP 6: every part bought was a part kept, so a
badly placed limb was a permanent tax on the run. Pruning makes the tree
**editable**. Cutting hands back 40% of what the limb is worth and turns its
bulk into Deadwood, which is the one resource that buys the permanent auras at
the base — so a cut is a move, not a loss.

- `src/content/prune.ts` — **new**. `PRUNE_REFUND_FRACTION` (0.4),
  `DEADWOOD_PER_WOOD` (150), and `GROWTH_COST_TAG` (`'growth.cost'`), the tag
  every part price now resolves against so a discount is an ordinary modifier.
- `src/engine/prune.ts` — **new**, and the whole step turns on one decision:
  **the preview and the transaction are the same function.** `quotePrune()` is a
  pure read of the graph; `prunePart()` takes its quote _before_ touching
  anything and pays exactly that. A tooltip can never promise a number the cut
  does not honour.
  - **The refund is priced forward, not remembered.** Parts cost
    `baseCost × 1.15^owned`, so the price of putting a subtree back is fully
    determined by what the tree carries _now_ — no purchase log, no save
    migration, and rebuilding a canopy differently costs the same as rebuilding
    it identically. `rebuildCostOfType()` sums the last `n` price points, which
    is what makes that symmetry exact rather than approximate.
  - **The Deadwood is measured from bulk**, `Σ(thickness × length)` scaled by
    `DEADWOOD_PER_WOOD` — so a fat old branch is worth more timber than a spray
    of twigs that happened to cost the same Sap.
  - **Apical dominance** is judged against the whole subtree, not the cut node:
    a branch whose topmost _leaf_ is the tree's high point still costs the tree
    its leader. `APICAL_EPSILON` (1e-9) keeps the check off floating-point noise,
    since apex heights come from walking the graph.
- `src/engine/buffs.ts` + `src/content/buffs.ts` — **new**. A buff is a bundle of
  ordinary modifiers under one revocable source id plus an expiry; the economy
  never learns what a buff is. Expiries are in **engine seconds**, not wall
  clock, so a buff cannot be waited out by closing the tab and offline
  simulation advances it at the same rate as everything else. Granting one
  already running **refreshes** it — modifiers are revoked and re-granted, never
  topped up, so a refresh can't stack with its own previous instance.
  - **Lateral Surge** (120 s, `1 - 0.25` on `growth.cost`, `1.25` on Sap): real
    botany — the leading shoot suppresses the buds below it, and cutting it off
    releases them at once. It carries a third effect on `click.power`, because
    taps are the only Sap income the game has today and "Sap/s +25%" would
    otherwise be invisible; the resource-targeted modifier covers the passive
    producers later steps add.
- `src/engine/totems.ts` + `src/content/totems.ts` — **new**. Three slots, three
  recipes (Rain +20% Water / 20 Deadwood, Sun +20% Light / 45, Vigor +20% click
  / 90), permanent, no uproot path. Modifiers are keyed **by slot**, so three
  Totems of Rain genuinely stack (×1.2³) instead of one shadowing the others —
  duplicates are a legitimate build, and forbidding them would decide two of the
  three slots for the player.
- `src/engine/simulation.ts` — `pruneQuote()`, `prunePart()` (now returning a
  `PruneResult` instead of a bare node list), `grantBuff()`, `updateBuffs()`,
  `craftTotem()`, `republishTotems()`. Tick order gained one step at the front:
  **lapsed buffs expire before anything is paid out**, so a tick can never pay
  through a modifier whose time ran out before it started. `growPart()` prices
  through `state.modifiers` now, so the discount reaches the till and not just
  the menu label.
- `src/render/prune.ts` — **new**. The marked subtree is washed in red _over_ the
  tree rather than replacing it: the player is choosing between two versions of
  their own tree, and blanking the limb out would hide the thing they are
  deciding about. Red is deliberately the only red on the canvas.
- `src/render/effects.ts` — `spawnPruneBurst()`: falling leaves from every
  removed part, drifting and swinging as they settle.
- `src/render/totems.ts` — **new**. Carved stumps at the base, cut face and
  rings from the palette, accent colour from each totem's own content entry so a
  fourth recipe never needs a palette edit.
- `src/ui/App.tsx` — prune mode, the **P** hotkey, and the inline confirm:
  hovering marks, the first click _arms_, the second cuts. Escape backs out one
  layer at a time (armed cut → mode → grow menu), and moving to a different limb
  always lands unarmed, so a confirm can never be inherited by a limb the player
  did not confirm.
- `src/ui/Workshop.tsx`, `src/ui/PruneTooltip.tsx`, `src/ui/BuffBar.tsx` —
  **new**. The buff badge drains, and visibly jumps back to full when a second
  cut refreshes it.
- `src/ui/sfx.ts` — **new and explicitly temporary.** STEP 16 owns audio (Howler
  `AudioManager`, persisted volumes, full synthesised bank). This is one
  synthesised snip — two blade strokes — so the sound STEP 9 asks for is not
  silently owed for seven steps. Shaped to be deleted: one export, no state, no
  assets. Lazy `AudioContext` created on the first cut (always a user gesture),
  every path guarded so a headless environment degrades to silence.
- Tests: `prune.test.ts` (26), `buffs.test.ts` (16), `totems.test.ts` (12) — 490
  passing overall. Refund and Deadwood math, the last-`n`-price-points symmetry,
  apex detection through the subtree, buff expiry at exactly `t + duration`,
  refresh-not-stack, and slot-keyed totem stacking.

**Open TODOs**

- [ ] **Nothing persists yet.** `state.totems`, the buff ledger and `prunes`
      are in `GameState` and snapshotted, but save/load is STEP 12 — totems are
      permanent within a session only. `BuffLedger.clear()` exists for the load
      path; `republishBuffs()` is the rehydrate hook.
- [ ] Replace `src/ui/sfx.ts` wholesale in STEP 16. Delete the module, don't
      extend it.
- [ ] `DEADWOOD_PER_WOOD` and the three totem costs are first-pass numbers.
      STEP 19 owns balance — in particular whether a full base (155 Deadwood) is
      the run-long project it is currently priced as.
- [ ] Pruning a root re-shades the canopy needlessly (`updateHydration()` and
      `updateLightExposure()` both run on every cut). Cheap today at <300 parts;
      revisit if the sweep shows up in a profile.
- [ ] Totems have no uproot path by design. If STEP 10's grafting or STEP 13's
      prestige wants one, the aura republish is already a remove-then-add.

### 2026-08-07 — STEP 8: Sunlight, day/night and leaf shading

The sky stops being a backdrop and starts being an input. There is a sun in it
now, it goes down, and — the part that matters — a leaf is worth what the sky it
can _see_ makes it worth. Placement above ground finally pays the way placement
below ground has since STEP 7.

- `src/content/light.ts` — **new**. The occlusion cone (250 world units, 60°
  wide), `SHADE_PER_OCCLUDER` (0.15), `EXPOSURE_MIN` (0.1), the blossom boost
  (+25%, range 150, capped at 2 stacks), `MOONLIGHT_FRACTION` (0.1), the
  once-a-second sweep interval, and the Dew constants. Distances are in the same
  **world units** the strata table uses (`SOIL_UNITS_PER_CANONICAL` = 1000), so
  "250px" reads as the design wrote it while the geometry stays
  resolution-independent.
- `src/engine/light.ts` — **new**, and deliberately split in two halves:
  - **Exposure** is per leaf and positional. `occludes()` is the cone test —
    strictly above, within range, `dy/distance ≥ cos 30°` (no trig in the inner
    loop). `shadeFactor` **compounds** (`0.85ⁿ`) rather than subtracting, so the
    tenth leaf over a spot costs less than the second did and no pile can switch
    a leaf off; `MAX_COUNTED_OCCLUDERS` (15) is where the floor makes further
    counting pointless, and doubles as the scan's early exit.
  - **The daylight factor** is global and temporal: `lightFactorAt(t)` =
    `max(0.1, daylightAt(t))`, published as one ordinary `mul` on the _Light
    resource_ under a revocable `daylight` source. Resource-targeted rather than
    tag-targeted so every future light source is covered without having to
    remember a tag.
  - `exposureAt(point, canopy, excludeId?)` answers both questions with one
    call: omit the id and it prices a leaf that does not exist yet. That is what
    lets the grow menu warn about a shaded spot before a Sap is spent.
- `src/engine/growth.ts` — `PartSoilContext` → **`PartContext`** (`NO_SOIL_CONTEXT`
  → `NO_PART_CONTEXT`), now carrying `exposure` alongside soil. A part is scaled
  by it only if its catalogue entry says `shaded: true` — same shape as STEP 7's
  `requiresVein`, so this stayed a data edit. `ProductionDelta` gained
  `exposure`, and `priceGrowthOptions` builds one `canopyIndex` per menu and
  quotes each prospective leaf at the light of the exact spot it would land in.
- `src/engine/simulation.ts` — `updateDaylight()` and `updateLightExposure()`.
  Tick order is now **daylight → hydration → exposure → production**: the sun
  sets the ceiling, the roots set what can be paid for, and only then is it worth
  asking what each leaf earns — so the per-leaf rate banked for the tooltips is
  the one the tick actually pays out. Growing or pruning re-shades immediately
  rather than waiting for the next sweep.
  - Exposure rides on the producer's **base rate**, not on a modifier. It is per
    node and there is no tag meaning "this leaf and no other"; rebuilding the
    leaf producers wholesale keeps the pipeline itself untouched.
  - `click()` now returns a `ClickOutcome` (`ClickResult` + `dew`).
- **Dew.** The first tap of each engine day grants 60 s of Sap income — with a
  floor of 30 taps' worth, because _nothing produces Sap passively yet_ and the
  literal formula would pay exactly zero for the whole of the current game. A
  fresh save's very first tap counts as a dawn, so the bonus is discoverable
  instead of eight minutes away.
- `src/render/sky.ts` — `celestialAt(t)` (pure) plus `drawCelestial`. The sun
  owns the lit part of the day and the moon the rest, each on a half-sine; they
  swap **at the horizon**, where both are at zero altitude, so the handover is
  never visible. The moon's crescent is one even-odd path (disc minus offset
  disc), and the hills are drawn _after_ the body so a low sun sets behind the
  ridgeline.
- `src/render/tree.ts` — `shadeTint()` and per-cluster tinting toward
  `PALETTE.leafOccluded`.
- `src/ui/LeafTooltip.tsx` — **new**. Hovering a leaf on the tree now names its
  exposure, what is shading it, any blossom boost, the hour, and its own
  Light/s. Hover resolution order is menu dial → leaf → nothing.
- `src/ui/DaylightGauge.tsx` + `.css` — **new**. Phase glyph, the live ×factor,
  and a tooltip. Light halving over an afternoon and collapsing at dusk is
  alarming if nothing accounts for it; this makes a falling Light/s read as
  nightfall rather than as something the player broke.
- Tests: 436 pass (up from 370). New `light.test.ts` (35 — the cone incl. both
  edges and the exact range, compounding vs subtracting, the floor, the early
  exit, blossom cap, self-exclusion, the prospective path, and **the acceptance
  case with mocked positions**: four stacked leaves total 3.11 against four
  spread leaves' 4.00). `sky.test.ts` gained 7 (arc shape, one-way travel, the
  horizon handover, wrapping), `growth.test.ts` 6 (exposure in the context,
  including that it applies _before_ modifiers), `render/tree.test.ts` 5, and
  `simulation.test.ts` 13 across sunlight, shading and Dew.
- Verified in a real browser (Chromium/Playwright, 1280×800, production build):
  the sun arcs and sets behind the hills, the crescent moon rises at night, the
  HUD chip tracked **☀️×0.94 → ×0.99**, a leaf's tooltip read "Exposure 100% /
  0 clusters / Daylight day ×0.99 / +0.1 Light/s", and the grow menu quoted
  "Sunlight here 100%" for the first leaf and **"Sunlight here 85% — already
  shaded"** for one placed under existing foliage. A separate render harness
  drove a 16-leaf canopy through a whole day: Light/s ran 0.318 (dawn) → 1.578
  (noon) → 0.158 (night) with 10 leaves shaded and 4 blossom-boosted, and a
  pixel diff against the same frame with shading disabled confirmed the tint
  reaches the canvas. 60 fps, no page errors beyond the pre-existing favicon 404.

**Design decisions worth knowing**

- **Compounding shade, not subtracting.** "Reduced 15% per leaf" reads either
  way. Subtracting kills a leaf outright at seven occluders — a dead purchase
  with no diagnosis — while compounding keeps every leaf worth _something_ and
  makes the first mistake the expensive one, which is the right lesson.
- **The tint uses a square root.** A single occluder costs 15%, and a linear 15%
  tint is invisible against foliage already drawn in three greens: the first
  mistake would look exactly like no mistake. The curve front-loads the
  response. This was changed after looking at the rendered frames, not before.
- **The sun is measured against the visible sky, not a world height.** Anchoring
  it to the cloud ceiling was the honest reading and put it permanently
  off-screen — the tree fits the canvas, so the ceiling is several screens up at
  any normal framing. It still rises from and sets into the _projected_ ground
  line, so panning down to the roots takes it away with the horizon.
- **The blossom boost is capped at two.** Uncapped, ringing one leaf with
  blossoms would beat spreading the canopy — the exact lesson this step exists
  to teach.
- **Exposure is swept once a second**, not per tick: it is O(n²) over the canopy
  and only changes when the tree does. Purchases and prunes re-shade instantly,
  so the cadence is never felt.

**Open TODOs**

- [ ] **Two parts can land in exactly the same place.** On a leaning limb,
      `clampDirection` can snap several sibling options to the same end of the
      allowed arc, so e.g. two leaf clusters on one twig share a position
      exactly. Harmless to the light model (co-located leaves have `dy = 0` and
      do not shade each other) but it looks like one blob and wastes the
      purchase. Predates this step; visible through exposure now.
- [ ] Blossoms make Light but are not shaded themselves and do not drink (the
      STEP 7 hydration TODO). Both are defensible; neither is stated in fiction.
- [ ] `MOONLIGHT_FRACTION`, the shade rate, the cone, the blossom boost and the
      Dew floor are all first-pass values — STEP 19 owns real balance, and
      `DEW_MIN_TAPS` should shrink to irrelevance once passive Sap exists.
- [ ] The Dew burst has no sound and no ceremony beyond a gold floating number
      (STEP 16 owns audio and juice).
- [ ] Exposure is not persisted; it is recomputed from the graph on load, which
      is correct but means STEP 15's save has to be loaded _before_ the first
      sweep. `Simulation`'s constructor already does this in the right order.
- [ ] Offline progress (STEP 14) will need to advance the day cycle for the
      canopy's 25% share — `lightFactorAt` is pure and ready for it, but a long
      absence should probably be paid at a day-averaged factor rather than at
      whatever hour the player happens to return.
- [ ] `src/content/resources.ts` and `src/index.css` still fail
      `prettier --check`. Pre-existing; left alone rather than sweeping
      unrelated files into this diff.
- [ ] Everything STEPs 4, 6 and 7 left open below still stands.

### 2026-08-07 — STEP 7: Roots, soil strata and the idle economy

The underground stops being empty brown. There is a _column_ down there — four
layers with mineral pockets buried in the clay and rock — and a root is now worth
what the ground it reached is worth. The two halves of the tree are wired
together: the canopy runs at whatever rate the roots can water it.

- `src/content/soil.ts` — **new**. The strata table as data: Topsoil `0…300`,
  Clay `300…800`, Rock `800…1600`, Bedrock below, each with its own fill colours
  and a `veinWeight`. Plus the vein-generation tunables and
  `DEPTH_PRODUCTION_SCALE` (500). **Units:** depth is quoted in _soil units_
  where the surface is 0 and depth grows downward, related to the graph's
  canonical units by `SOIL_UNITS_PER_CANONICAL` = 1000. That is what lets the
  table read exactly as the design does while the geometry stays
  resolution-independent.
- `src/content/hydration.ts` — **new**. `WATER_NEED_PER_LEAF` (0.35) and the
  clamp bounds (0.25 / 1.5).
- `src/engine/soil.ts` — **new**. `depthAt` / `canonicalYAt` / `stratumAt`
  (half-open bands, so exactly 300 is Clay) / `depthMultiplier` (`1 + depth/500`,
  never a penalty above ground) / `createSoilMap` / `veinAt` /
  `soilConditionsAt`. A `SoilMap` is 24 seeded pockets and nothing else, so the
  whole underground serialises to one number.
- **Veins pick their layer before their depth**, weighted by `veinWeight`
  (clay and rock carry 8 of 9.5), which is what makes the scatter read as
  geology rather than as uniform noise. Overlapping pockets award the _richest_,
  so a tip is never punished for landing in two.
- `src/engine/growth.ts` — production is now sited. `partProducer` and
  `partProductionDelta` take a `PartSoilContext` (`{ soil, placement }`) and
  resolve the rate at the part's **far end** — the tip that is actually in the
  ore, not the joint it grew from. Roots earn `×(1 + depth/500)`; a part whose
  catalogue entry says `requiresVein` (only `rootTip`, for Minerals) earns
  `× richness` inside a pocket and **nothing at all** outside one.
  `priceGrowthOptions` places every option where growing it would put it, so the
  ghost preview's tooltip quotes the real number — "+0.43 Water/s, Depth 224
  Topsoil ×1.45" — before a single Sap is spent.
- A root tip with no vein registers **no producer**, rather than a zero one. A
  zero producer would start earning the moment some later global `+add` landed
  on Minerals; barren ground should stay barren.
- `src/engine/hydration.ts` — **new**. `waterNeed(leaves)` is purely
  proportional (no floor), `computeHydration` is
  `clamp(income / need, 0.25, 1.5)`, and `hydrationModifiers` publishes it as two
  ordinary `mul` modifiers — one on the `canopy` tag, one on `click.power` — under
  a single revocable source. Nothing bespoke: hydration stacks in the normal
  `(base + Σadds) × Πmuls` order like everything else.
- `src/engine/simulation.ts` — `updateHydration()` runs at the top of every tick
  and again immediately after any grow or prune, so the HUD and the _next tap_
  agree with the purchase that was just made instead of lagging up to 100 ms.
  It revokes the old hydration modifiers **before** measuring Water income, which
  makes the absence of a feedback loop structural rather than a coincidence of
  tagging.
- `src/engine/economy.ts` — `computeResourceRate(producers, modifiers, resource)`,
  a single-resource pass so the mid-tick hydration read does not cost a full
  pipeline evaluation.
- `src/content/growth.ts` — root producers now carry an `'offline'` tag
  (`OFFLINE_TAG`) alongside their domain and type, ready for STEP 14. `rootTip`'s
  production gained `requiresVein: true`.
- `src/render/soil.ts` — **new**. `soilBands()` is pure (clip to the visible
  soil, keep the _unclipped_ edges as gradient stops so a half-visible band still
  shades across its whole depth) and therefore tested without a canvas.
  `drawSoil()` fills the bands, draws the bedding planes and the layer names, and
  glows every on-screen pocket. Positioned through the same `TreeLayout` the tree
  is projected with, so a root you can _see_ entering the clay really is earning
  the clay's bonus.
- Ore grains are clamped to 0.9–2.6 px whatever the zoom. The first pass scaled
  them with the pocket radius and the clay came out looking like a bubble bath;
  grains that stay grain-sized read as mineral in the ground.
- `src/ui/HydrationGauge.tsx` + `.css` — **new**. A droplet that fills toward the
  ceiling with a dashed tick at break-even, coloured by mood
  (parched/thirsty/watered/overcharged), and a tooltip writing out the whole sum:
  what the roots draw, what the canopy wants, the ratio, and the applied
  multiplier with a line saying which clamp bit. Hydration is the one HUD number
  that is a _multiplier_ rather than a resource, so it gets a shape.
- `src/ui/GrowOptionTooltip.tsx` — root options now show depth, layer and the
  depth bonus; a mineral part shows its vein's richness, or a plain warning that
  there is no vein there and the tip would find nothing.
- Tests: 303 pass (up from 224). New: `soil.test.ts` (25 — conversions,
  band boundaries, the multiplier, determinism, generation bounds, the
  clay/rock bias, vein hit-testing incl. edges and overlaps),
  `hydration.test.ts` (16 — the need curve, both clamps, the neutral
  no-leaves case, and the modifiers driving Light and click power without
  touching Water), `render/soil.test.ts` (10 — band clipping, the bottomless
  band, no gaps, gradient spans). `growth.test.ts` gained 10 soil cases and
  `simulation.test.ts` 15, including **the acceptance case**: one leaf with no
  roots produces `0.4 × 0.25`, and three roots take it to `0.4 × 1.5` — a 6×
  lift, asserted as exactly `HYDRATION_MAX / HYDRATION_MIN`.
- Verified in a real browser (Chromium/Playwright against the production build,
  1280×800): strata bands and vein pockets render at 60 fps; 90 taps → 173.5 Sap;
  a branch and a leaf with no roots put **Light 0.1/s** in the HUD with the gauge
  amber at **×0.25** and "Per tap 0.25"; hovering the Root Segment dial quoted
  "+0.43 Water/s / Depth 224 Topsoil ×1.45"; three roots took it to **Water
  1.3/s, Light 0.6/s** and the gauge to **×1.50**, with the droplet's tooltip
  showing `1.3 ÷ 0.35 = 3.70 → ×1.50, capped`. No page errors beyond the
  pre-existing favicon 404.

**Design decisions worth knowing**

- `waterNeed` has **no base term**. With one, a seedling with no leaves would sit
  at the 0.25 floor and the opening of the game (before any canopy exists) would
  be four times slower for no reason the player could see. Proportional need
  means hydration is exactly 1.0 until the first leaf is bought, and the throttle
  arrives at the moment it can be understood — and one root segment (~0.44/s
  after its depth bonus) already over-supplies that first leaf, so the lesson
  costs 12 Sap to learn.
- Hydration multiplies **click Sap as well as Light**, per the spec. That is a
  sharp edge: buy a leaf with no roots and your taps drop to a quarter. The gauge
  going amber and the tooltip naming the fix are the whole mitigation for now;
  STEP 17's onboarding and STEP 19's balance pass own the rest.
- The depth a part is judged at is its **end**, not its midpoint. A long root is
  worth what it reached, which is the reading that makes chaining segments
  downward feel like digging.
- Bands are half-open (`top ≤ depth < bottom`). Without a rule the boundary
  depths are ambiguous, and "300 is where the clay starts" is the intuitive one.

**Open TODOs**

- [ ] **STEP 4 is still owed** and it now bites harder: with no camera, the deep
      strata are only visible once the layout has zoomed out far enough, so Rock
      and Bedrock are effectively unseen in the early game. Pan/zoom is what makes
      the column explorable.
- [ ] Blossoms produce Light but are not counted in `waterNeed`. Either they
      should drink too or the fiction should explain why not.
- [ ] Vein _discovery_ is free: every pocket is drawn from the first frame. The
      Mycorrhiza symbiont (STEP 11) is supposed to extend "detection radius",
      which implies undetected veins should be hidden until then.
- [ ] A root tip cannot be aimed — its angle is fixed by its slot — so hitting a
      vein is a matter of which segment you extend, not a placement decision.
      Once pruning has UI (STEP 9) that becomes retry-able; a steerable tip may
      still be worth it.
- [ ] `soilConditionsAt` is evaluated per part at grow time only. Correct today
      (placements never change once grown), but a future mechanic that _moves_
      geometry would silently stale every root's rate.
- [ ] Root production is tagged `'offline'` but nothing consumes the tag yet
      (STEP 14).
- [ ] Mineral base rate (0.12), vein richness (1–2.2) and the depth scale (500)
      are first-pass guesses; STEP 19 owns real balance.
- [ ] `src/content/resources.ts` and `src/index.css` fail `prettier --check`.
      Pre-existing, left alone rather than sweeping unrelated files into this diff.
- [ ] Everything STEP 6 left open below still stands.

### 2026-08-07 — STEP 4 (backfill): Camera, backdrop, sway and culling

STEP 6's entry recorded that STEPs 3 and 4 were only partly delivered: STEP 3's
graph model was backfilled then, STEP 4's renderer work was not. This closes it.
The pieces that were already in place — tapered limbs, blob leaf clusters,
desaturated roots below the soil line, devicePixelRatio handling, resize safety —
were left alone. What was missing:

- **Camera** (`/src/engine/camera.ts`, pure). Expressed as _the world point at
  the centre of the viewport_ plus a zoom over a base "fits the tree" scale,
  which makes the cloud-to-bedrock clamp a direct statement about where the
  viewport edges are instead of an unwound pixel offset. Pan, wheel-scroll,
  cursor-anchored zoom (0.5×–2.0×) and clamping are all pure functions.
  - It follows the auto-fit until the player first touches it, then the framing
    is theirs — growing a branch no longer yanks the view of someone who has
    deliberately panned down to their roots. `0` hands it back to the auto-fit.
  - A resize re-derives the base scale but keeps the player's zoom and place.
  - An open grow menu is re-anchored on every camera move rather than closed:
    dials left floating in space would still have been clickable there.
- **Gestures** (`/src/ui/treeInput.ts`). Drag to pan past a 6px threshold, wheel
  to scroll, ctrl/⌘+wheel (which is what a trackpad pinch reports as) to zoom at
  the cursor, `+`/`-` to zoom for mice with no pinch to offer. Panning stands
  down while a second finger is down, leaving pinch to STEP 18.
  - **Taps still resolve on `pointerdown` and are never taken back.** The drag
    threshold decides only when to _also_ start moving the camera, so STEP 5's
    zero-missed-inputs guarantee is untouched — a drag that starts on the trunk
    pays out its tap and then pans.
- **Time-of-day sky** (`/src/content/daylight.ts`, `/src/engine/daylight.ts`,
  `/src/render/sky.ts`). A minimal, pure day cycle — enough for the sky to lerp
  through seven keyframes from pre-dawn to deep night. STEP 8 owns the sun, the
  moon, and what daylight actually _does_ to production.
  - A new save starts at `DAY_START_FRACTION` (mid-morning), not at `t = 0`:
    opening the game in the dark half of dawn was a cold first impression and
    left the first clicks producing nothing.
- **Distant hills**, two bands of summed sines on the horizon with horizontal
  parallax, dimmed toward night. Reserved for the Old Growth forest (STEP 13).
- **Backdrop follows the camera.** Sky and hills are drawn against the
  _projected_ ground line, so panning to the roots takes the horizon off the top
  of the screen the way a real horizon goes.
- **Viewport culling** before every draw pass, which is what keeps a 500-node
  tree cheap once the camera is zoomed in.
- **Leaf and blossom sway**, phase-seeded per node id so neighbouring clusters
  lag one another instead of the canopy pulsing as one slab.

Tests: 46 new across camera (clamp, cursor-anchored zoom round-trip, pan/scroll
sign conventions, refit), daylight, sky/hill/colour maths, sway determinism and
bounds, culling, and the drag/wheel gesture split.

Verified in a real browser (Chromium, 900×640): scene renders at 60fps with no
console errors, wheel-pan reaches the roots, pinch-zoom holds the cursor point,
panning up stops at the cloud ceiling, branches taper and roots read against the
soil.

**Merge note.** STEP 7 landed on this branch in parallel. Where the two met —
what gets drawn below the ground line — STEP 7 wins: `drawBackdrop` now owns the
sky and hills only, `drawSoil` owns the strata, and the horizon line is drawn
once between them. The draw order in `Renderer.draw` is the seam.

**Open TODOs from this step**

- [ ] STEP 4 asks for bark colour _per species_; species do not exist until STEP 10. `woodColor()` still keys off node type — give it a species argument
      there.
- [ ] `CLOUD_LEVEL_Y` / `BEDROCK_Y` are in canonical units (±2.4). STEP 7 landed
      in parallel with this and quotes strata in _soil units_
      (`SOIL_UNITS_PER_CANONICAL` = 1000, Bedrock below 1600 — i.e. −1.6
      canonical), so the camera's floor clears the bedrock with room to spare.
      Worth folding both into `balance.ts` at STEP 19 rather than leaving two
      unit systems facing each other.
- [ ] The sky at the cloud ceiling is still empty — STEP 8's sun and moon fill
      it. (The soil half was empty when this step was written; STEP 7's strata
      have since filled it.)
- [ ] Sway and parallax should respect `prefers-reduced-motion` (STEP 16 owns
      this).
- [ ] No demo tree was added for STEP 4's acceptance wording — the real tree is
      already growable from STEP 6, and a hardcoded one would be a regression.

### 2026-08-06 — STEP 6: Growing interaction (the tree IS the skill tree)

The signature interaction. Tap a limb, a radial menu fans out of it, hover an
option to see a ghost of the part and what it will cost and produce, click to
buy. The tree is no longer a fixed drawing — it is the player's build.

**Scope note — STEPs 3 and 4 were only partly done.** STEP 5's commit produced a
procedural tree _silhouette_ (`generateTree` from a blueprint) and a renderer for
it, but not STEP 3's actual deliverables: the node-typed `TreeGraph`, its
`getValidGrowthOptions` / `grow` / `prune` API, or serialisation. STEP 6 names
`getValidGrowthOptions` directly and cannot exist without it, so the graph model
is backfilled here. STEP 5's own changelog already listed this as the open TODO
("the tree is a fixed skeleton; it should grow from game state").

- `src/content/growth.ts` — **new**, the part catalogue as data. Seven node types
  with allowed children, `maxChildren`, angular spread + jitter, where children
  attach, base dimensions, per-generation falloff, cost and production. Adding a
  part type is now a data edit, not an engine edit. `PART_COST_GROWTH` = 1.15.
- `src/engine/treeGraph.ts` — **new**, the `TreeGraph` (STEP 3 backfill). Nodes
  store only what cannot be derived: type, parentage, `angle` _relative to the
  parent's heading_, `attachT` along the parent, `length`, `thickness`, `slot`,
  `speciesId`, `level`, `createdAtTick`. World positions come from
  `computePlacements()`, a pure walk from the trunk. Full API:
  `getValidGrowthOptions` / `grow` / `prune` / `subtree` / `toSegments` /
  `toJSON` / `fromJSON`, plus a `revision` counter and `countOfType` (which is
  what drives pricing).
- **Determinism** is the load-bearing property here. The per-fork angle wobble is
  a seeded hash of `(seed, parentId, childType, slot)` rather than a running RNG,
  so `getValidGrowthOptions` can promise the _exact_ geometry a part will have
  before it is bought. That is what makes the ghost preview honest rather than
  decorative — there is a test asserting preview position equals grown position.
- `src/engine/growth.ts` — **new**, where shape meets economy. `partCost`
  (`baseCost × 1.15^owned`, counted per type), `partProducer`,
  `partProductionDelta` (evaluates the _prospective_ producer against live
  modifiers, so the tooltip quotes the real `/s` the HUD will show, not a base
  rate), and `priceGrowthOptions`.
- `src/engine/simulation.ts` — `growthOptions(nodeId)`, `growPart()` (checks the
  rules, checks affordability, spends, grows, registers the producer — nothing is
  spent on a rejected call), `prunePart()`, and `syncPartProducers()` for the
  from-scratch path. Snapshots gained `treeRevision` and `treeSize`.
- `src/engine/tree.ts` — reduced to the canonical-space ↔ screen projection.
  `TreeSegment.kind` widened from `'trunk' | 'branch'` to the full node type.
- `src/render/radialMenu.ts` — **new**. `layoutRadialMenu` fans options on a 150°
  arc, centred _upward_ for canopy parts and _downward_ for roots, so the menu
  opens into the space the part would grow into. Pure layout + hit-test, tested
  without a canvas.
- `src/render/tree.ts` — leaf clusters (deterministic overlapping blobs),
  blossoms, roots below the soil line, and tapered limbs. Limbs are now a filled
  path narrowing to `TAPER` of their base rather than a constant-width stroke —
  that taper is most of what makes a drawn tree read as a tree. `growProgress()`
  drives the 120 ms ease-out scale-in; `drawGhostPart()` draws the preview.
- `src/ui/Tooltip.tsx` — **new** shared tooltip: React portal onto `document.body`
  (never clipped by HUD stacking), `position: fixed` at the cursor with edge
  flipping, 200 ms reveal delay. Controlled by props rather than DOM events,
  because the thing being hovered lives on the canvas and has no DOM node.
- `src/ui/GrowOptionTooltip.tsx` — **new**, the tooltip body: name, flavour, cost,
  production delta, and the shortfall when unaffordable.
- `src/ui/treeInput.ts` — added `onPress` (first refusal, so a tap on a menu dial
  is never _also_ a tap on the tree) and `onMiss` (closes the menu). Both
  optional, so every STEP 5 behaviour and test is untouched.
- `src/ui/App.tsx` — wires press → menu → purchase → re-open, Escape to close,
  and pushes hover state into the tooltip. The renderer's projected tree is
  refreshed only when `tree.revision` changes, never per frame.
- Removed: `src/content/tree.ts` and `generateTree` (+ its tests). The blueprint
  silhouette is fully superseded by the graph; a run now starts as a lone
  seedling and everything above and below it is bought.
- Tests: 224 pass (up from 148). New: `treeGraph.test.ts` (34 — growth
  constraints, slot reuse after pruning, direction clamping, derived placements,
  subtree pruning, determinism, JSON round-trip, revision), `growth.test.ts` (19
  — the 1.15 curve, per-type counting, production deltas under modifiers,
  affordability and shortfall), `radialMenu.test.ts` (16 — arc placement, canopy
  vs root direction, hit-testing, arming delay). `simulation.test.ts` gained 13
  growth cases including the full STEP 6 loop end to end.
- Verified in a real browser (Chromium/Playwright against the production build):
  30 taps → 39.3 Sap; hovering the Branch dial showed nothing at 120 ms and the
  full tooltip at 320 ms (the 200 ms delay); buying took Sap 39.3 → 24.3; growing
  a leaf on that branch put **0.4 Light/s** in the HUD and it accumulated; a root
  put 0.3 Water/s in and rendered underground; the Blossom dial stayed visible
  and greyed with "Short by 42.02 Sap"; Escape closed the menu. No page errors.

**Design decisions worth knowing**

- Tapping a limb **both** pays Sap and opens its menu. STEP 5 made the tree the
  Sap button and STEP 6 makes it the upgrade button; the acceptance criteria
  ("click trunk for Sap, grow a branch on the tree") require both on the same
  target, so the tap does both rather than one mode stealing the other.
- Dials are dead for `MENU_ARM_MS` (180 ms) after opening. Without it, a player
  drumming on the trunk at 10 Hz opens the menu mid-burst and the next tap buys
  something they never chose. The dials scale in over exactly that window, so the
  animation _is_ the "not live yet" signal.
- Re-opening the menu on the same node preserves its arming clock, so a menu the
  player is already using does not go dead again under a stray second tap.
- After a purchase the menu re-opens on the same node with fresh prices, so you
  can build a limb out without re-tapping it.
- The layout scales against a `REFERENCE_HEIGHT` of 1 canonical unit rather than
  the tree's own height. Fitting a seedling to its own height blew it up to fill
  the sky and then visibly shrank it with every branch bought.
- Direction clamping snaps an out-of-arc heading to the **angularly nearer** end
  of the allowed arc. A plain numeric clamp (the first implementation, caught by
  a test) normalised a limb leaning just past straight-up-and-left into a large
  negative angle and flung it to the opposite horizon.

**Open TODOs**

- [ ] **STEP 4 is still owed**: no camera (pan/zoom/clamping to cloud level and
      bedrock), no leaf sway animation, no background hills. The renderer draws
      the whole tree every frame with no viewport culling — fine at this size,
      but the "60fps at 500 nodes" target is unverified.
- [ ] Root growth options currently fan _upward_ with the canopy ones when a
      menu mixes both (the trunk's does). Only an all-root menu arcs downward.
- [ ] Part costs and production rates are first-pass guesses (branch 15, leaf 10,
      root 12; leaf 0.4 Light/s, root 0.3 Water/s). STEP 19 owns real balance.
- [ ] `speciesId` is threaded through the graph but always `'oak'`; the species
      picker in the radial menu is STEP 10.
- [ ] `prunePart()` exists and is tested, but there is no Prune UI, no refund and
      no Deadwood yet — STEP 9.
- [ ] Roots produce Minerals from `rootTip` at a flat rate; veins, soil strata,
      depth multipliers and hydration are STEP 7. Root producers are tagged
      `'root'`, not yet `'offline'`.
- [ ] The tooltip can cover the dial it describes on a small canvas; it flips at
      viewport edges but does not avoid the menu itself.
- [ ] Radial menu has no keyboard path and no touch-friendly variant (STEP 18
      turns it into a bottom sheet on mobile).
- [ ] Replace the temporary `UpgradePanel` — still the only home for the click
      upgrades.
- [ ] Remove `debugProducers.ts` + the HUD toggle; real production now exists.
- [ ] `index.html` requests a favicon that is not in the repo (a 404 on every
      load). Pre-existing; PWA icons land in STEP 20.

### 2026-08-06 — STEP 5: Clicking, crits and combo

Active play. The tree is now a click target, taps pay Sap, and the first three
upgrades are buyable.

- `src/engine/geometry.ts` — `Vec2` / `Segment`, `distanceToSegment` (projection
  parameter clamped to `[0,1]`, so it measures to the _segment_, not the
  infinite line), `nearestSegment`, and `hitTestSegments`. A segment's own
  half-width counts toward its hit area on top of the flat tolerance, so the
  trunk is fat and forgiving while twigs stay precise.
- `src/content/tree.ts` + `src/engine/tree.ts` — the first procedural tree. A
  `TreeBlueprint` (data) drives `generateTree()` into an ordered list of
  `TreeSegment`s in **canonical tree space**: trunk base at the origin, `+y` up,
  ~1 unit ≈ tree height. Deterministic via a seeded PRNG. `treeBounds()` +
  `projectTree()` map it into screen pixels. This is the clickable _skeleton_
  only — no leaves, no player-driven growth yet.
- `src/engine/rng.ts` — `RandomSource` type + mulberry32 `createSeededRandom`,
  so crit rolls and tree jitter are injectable in tests.
- `src/engine/combo.ts` — the combo meter as `{ stacks, lastClickAt }` with the
  effective value _derived_ at read time rather than stepped per tick, so it is
  exact at any frame rate and trivially testable. Held for
  `COMBO_WINDOW_MS` (1500), then drains linearly to empty at `COMBO_DECAY_MS`
  (3000). `COMBO_BONUS_PER_STACK` = 2%, so 50 stacks = +100%; a raised cap keeps
  paying past 50 (that is what makes Rhythm of Growth worth buying).
- `src/engine/clicker.ts` — the four click stats (`clickPower` 1,
  `critChance` 2%, `critMult` ×10, `comboCap` 50) resolved from tag-targeted
  modifiers under `CLICK_STAT_TAG`, plus the pure `resolveClick()`:
  `gain = clickPower × comboMultiplier × (crit ? critMult : 1)`.
- `src/engine/modifiers.ts` — added `matchingTag(tag)`. Stats are not producers,
  so they must not pick up the resource-targeted modifiers `matching()` returns.
- `src/content/upgrades.ts` + `src/engine/upgrades.ts` — data-driven repeatable
  upgrades: cost `baseCost × growth^level`, effects re-granted wholesale under
  one `upgrade:<id>` source per level (so levels never double up). Stronger Taps
  (10 ×1.5ⁿ), Sharper Instincts (50 ×1.6ⁿ), Rhythm of Growth (250 ×2ⁿ). Only
  Stronger Taps' cost was specified; the other two base costs are chosen.
- `src/engine/simulation.ts` — `click(now, random)` resolves a tap **outside the
  tick loop**, synchronously, so a burst can never be coalesced by the frame
  loop. `buyUpgrade(id)`. `snapshot(now)` now also carries `clickStats`, the
  live `combo`, per-upgrade `UpgradeSnapshot`s, and the lifetime `clicks` count.
- `src/render/effects.ts` — object-pooled floating numbers (600 ms rise + fade,
  gold and larger on crit) and ripples (380 ms). Pools are allocated once and
  slots reused forever; when saturated the _oldest_ slot is recycled rather than
  dropping the newest tap. Effects store absolute spawn times, not countdowns.
- `src/render/tree.ts` — `computeTreeLayout()` fits the tree to the canvas from
  its **measured** bounds (height or width, whichever binds) and centres the
  silhouette rather than the trunk. Tested against five aspect ratios.
- `src/render/comboMeter.ts` — small ring meter offset to the side of the
  pointer with the live multiplier in the middle; hidden when empty.
- `src/render/canvas.ts` — owns the screen-space projection (recomputed on
  resize, not per frame) and therefore `hitTest()`; draws tree → effects → meter.
- `src/ui/treeInput.ts` — `attachTreeInput()` on **`pointerdown`**, not `click`.
  Multi-touch falls out of the pointer model (one event per contact); active
  `pointerId`s are tracked so one finger lifting does not hide the meter. The
  surface is typed structurally so the dispatch path is testable in node.
- `src/ui/UpgradePanel.tsx` — **temporary** side panel, driven entirely by the
  `UPGRADES` list.
- `src/ui/App.tsx` — wires input → `sim.click()` → effect spawn, all outside
  React state; one `Date.now()` per frame shared by snapshot and renderer.
- Tests: 148 pass (up from 42). New: `combo.test.ts` (16 — accumulation, the
  window/drain boundaries, mid-drain top-up, cap, multiplier), `clicker.test.ts`
  (13 — stat resolution incl. tag isolation and clamping, crit boundary at
  `roll < critChance`, combo × crit stacking), `geometry.test.ts` (13),
  `tree.test.ts` (11), `upgrades.test.ts` (18), `render/tree.test.ts` (8),
  `render/effects.test.ts` (6 — pooling, capacity, recycling), and
  `ui/treeInput.test.ts` (12 — including **100 taps at 10 Hz with zero drops**
  and multi-touch). `simulation.test.ts` gained 8 click/combo cases.
- Verified in a real browser (Chromium/Playwright against the production build):
  30 taps at 10 Hz credited exactly 39.3 Sap, misses credited nothing, the
  upgrade purchase took effect, the combo returned to ×1.00 after 3 s idle, and
  no page errors.

**Design decisions worth knowing**

- A tap banks its combo stack _before_ it pays out, so the meter and the number
  that flies up always agree. A lone first tap therefore pays ×1.02, not ×1.00.
- The combo drains smoothly between 1.5 s and 3 s instead of hard-resetting at
  the window edge. A click during the drain adds to whatever is left, which
  makes the drain mechanically meaningful rather than decorative.
- Everything on the click path uses `Date.now()` — mixing it with
  `performance.now()` would corrupt combo timing.

**Open TODOs**

- [ ] Replace the temporary `UpgradePanel` with in-tree purchasing (the spec's
      real UI: you buy growth by clicking limbs).
- [ ] Remove `debugProducers.ts` + the HUD toggle once real production systems
      (canopy Light, root Water/Minerals) exist. Sap-from-clicks now exists.
- [ ] The tree is a fixed skeleton; it should grow from game state (branch count
      driven by purchases) and gain leaves. `generateTree` already takes a
      blueprint, so this is a matter of deriving the blueprint from state.
- [ ] `snapshot()` allocates a full set of `Decimal`s + upgrade rows every frame.
      Fine at this size; revisit if the HUD starts costing frames.
- [ ] Click stats are recomputed on every tap and every snapshot. Cache them on
      the modifier set if the modifier list gets long.
- [ ] Audio: no sound on tap or crit yet (Howler is a dependency but unused).
- [ ] No jsdom in the test setup, so `attachTreeInput` is exercised through a
      structural fake rather than a real `HTMLCanvasElement`. The DOM binding
      itself (listener registration on the actual canvas) is covered only by the
      Playwright smoke run, not by CI.
- [ ] `clicks` is tracked but nothing reads it yet — intended for later
      achievements/statistics.

### 2026-08-05 — STEP 2: Economy foundation (resources, producers, modifiers)

- `src/engine/resourceRegistry.ts` — `ResourceRegistry` holding, per resource,
  `amount` / lifetime `total` / cached `perSecond`. `add()` accrues the lifetime
  total on positive deltas only (spending never lowers it).
- `src/engine/modifiers.ts` — `Modifier` (`type: 'add' | 'mul' | 'pow'`, `'pow'`
  reserved & ignored for now; `targetKind: 'tag' | 'resource'`; `source` id for
  clean removal). `ModifierSet` (add / `removeBySource` / `matching`) and pure
  `applyModifiers()` with the fixed stacking order **(base + Σadds) × Πmuls**.
- `src/engine/economy.ts` — `Producer` `{ id, resource, baseRate, tags }` and
  pure `computeProduction()` that sums each producer's modified rate per
  resource. Modifiers apply when they target the producer's resource or a tag.
- `src/engine/simulation.ts` — `Simulation` now owns producers + modifiers.
  `tick()` recomputes the pipeline, caches `perSecond` on the registry, and
  advances amounts by `rate × dt`. `snapshot()` now also carries `totals` and
  `perSecond`. Added `addProducer` / `removeProducer` / `addModifier` /
  `removeModifiersBySource`.
- `src/engine/format.ts` — reworked to spec: plain to 999, `K/M/B/T`, scientific
  from `1e15`, max 2 decimals (trailing zeros trimmed).
- `src/engine/debugProducers.ts` — **temporary** `enable/disableTestProducers()`
  registering a `+1/s` producer per resource (source-tagged `debug`).
- `src/ui/App.tsx` — snapshots are now pushed to the store **once per render
  frame** (in `render`), not per tick; `update` only advances the sim. Added a
  ref + effect to toggle the debug producers live.
- `src/ui/Hud.tsx` / `Hud.css` — resource rows now show a live `/s` rate, plus a
  "Start/Stop test producer" toggle button.
- Tests: `format.test.ts` (13 incl. the 10 canonical cases), `modifiers.test.ts`
  (stacking order, insertion-order independence, add/remove by source, tag vs
  resource matching, pow ignored), `economy.test.ts` (summation + tag/resource
  modifiers), extended `simulation.test.ts` (production, rate cache, producer
  removal, all-seven-resources debug tick). 42 tests pass; lint + build clean.

**Open TODOs**

- [ ] Remove `debugProducers.ts` + the HUD toggle once real production systems
      (Sap clicks, canopy Light, root Water/Minerals) exist.
- [ ] Wire the `'pow'` modifier type into `applyModifiers` when late-game
      content needs it.
- [ ] Modifier ordering across producers is currently commutative; revisit if
      order-dependent stacking (e.g. additive-after-multiplicative) is needed.

### 2026-08-05 — STEP 1: Project scaffold & design spec

- Initialized Vite + React 18 + TypeScript (strict) project.
- Tooling: ESLint (flat config) + Prettier, Vitest.
- Dependencies: Zustand, break_infinity.js, Howler.
- Created folder layers: `/src/engine`, `/src/render`, `/src/ui`, `/src/content`.
- `PROJECT_SPEC.md` with the verbatim design summary + architecture notes.
- App shell: full-screen canvas with React HUD overlay.
- Engine skeleton:
  - `loop.ts` — accumulator-based fixed timestep (10 TPS) decoupled from a
    `requestAnimationFrame` render loop, with frame-gap clamping and FPS/TPS
    stat sampling.
  - `simulation.ts` — mutable `GameState` advanced by `tick(dt)`, produces
    immutable snapshots.
  - `store.ts` — Zustand vanilla store holding the latest snapshot + debug stats;
    read by the UI, written by the engine (no React dependency).
  - `types.ts`, `format.ts` — resource state + number formatting helpers.
- `/src/content/resources.ts` — data-driven resource definitions (the seven
  resources from the spec).
- `/src/render/canvas.ts` — sky-to-soil gradient renderer sized to the viewport
  with devicePixelRatio handling.
- HUD shows an FPS/TPS debug counter and a resource readout.
- Tests: `loop.test.ts` (fixed-timestep accumulator + clamping), `simulation.test.ts`
  (initial state + tick advancement).

**Open TODOs**

- [ ] Trunk click interaction → produce Sap (core clicker loop).
- [ ] Procedural tree rendering (trunk, branches, leaves) driven by game state.
- [ ] Root system + underground view; idle/offline production.
- [ ] Resource production systems (Light from leaves, Water/Minerals from roots).
- [ ] Content: species, upgrades, symbionts as `/src/content` data.
- [ ] Prune / graft mechanics; prestige ("Go to Seed") + Heirloom meta-upgrades.
- [ ] Seasons + weather events.
- [ ] Save/load persistence + offline progress calculation.
- [ ] Audio via Howler; wire `/src/render` interpolation `alpha` for smooth motion.
