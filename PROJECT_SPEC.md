# Old Growth — Project Spec

## Design Summary

Old Growth is a clicker where the upgrade tree is a literal, procedurally drawn
tree. The player clicks the trunk for Sap and spends it to grow branches/leaves
(canopy = active play, produces Light) and roots (underground = idle play,
produces Water/Minerals, works offline). Placement matters: leaves shade each
other, deep roots find minerals. Key mechanics: pruning (cut limbs for a partial
refund + Deadwood resource, triggers 'apical dominance' buffs), grafting (combine
two species into discoverable hybrids), symbiont creatures (bees, ants, fungi,
songbird, squirrel), seasons + weather events, and prestige ('Go to Seed'): the
old tree joins a permanent Old Growth forest in the background while Seeds buy
Heirloom meta-upgrades. Resources: Sap, Light, Water, Minerals, Leaf Litter,
Deadwood, Seeds. Tone: cozy, warm, botanical.

## Tech Stack

- **Build:** Vite
- **UI:** React 18 + TypeScript (strict mode)
- **State:** Zustand (vanilla store bridges engine ↔ UI)
- **Numbers:** break_infinity.js (`Decimal`) for large-magnitude resources
- **Audio:** Howler
- **Rendering:** HTML5 Canvas 2D
- **Tests:** Vitest

## Architecture

The codebase is split into four layers with a strict one-way dependency rule:

| Folder         | Responsibility                                   | Constraints                          |
| -------------- | ------------------------------------------------ | ------------------------------------ |
| `/src/engine`  | Pure game logic: state, fixed-timestep loop, sim | **No React imports.** Framework-free |
| `/src/render`  | Canvas 2D drawing of the scene                   | Reads snapshots, no game mutation    |
| `/src/ui`      | React components, HUD overlay, input             | Wires engine + render together       |
| `/src/content` | Data definitions (resources, later: species…)    | Plain data, strictly typed           |

### The loop

A single `requestAnimationFrame` render loop drives an **accumulator-based fixed
timestep** simulation. The simulation advances in fixed 100 ms steps
(`TICK_RATE = 10` ticks/sec) regardless of frame rate; rendering happens every
animation frame and is decoupled from simulation stepping. Large frame gaps are
clamped to avoid the "spiral of death". This keeps game logic deterministic and
framerate-independent, which matters for an idle game that must also compute
offline progress later.

### State flow

```
Simulation (mutable GameState)
      │  tick(dt)         ← fixed 100 ms steps
      ▼
  snapshot()             ← immutable copy pushed each tick
      ▼
  Zustand vanilla store  ← engine writes, no React dependency
      ▼
  React HUD (useStore)   ← reads snapshot + debug stats
```
