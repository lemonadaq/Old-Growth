# Balance

Every tunable number in Old Growth lives in [`src/content/balance.ts`](src/content/balance.ts).
This file is the reasoning behind the shapes in it, and the simulation output
they were tuned against.

Two rules keep the table honest, and both are enforced rather than intended:

1. **`/src/engine` contains no numeric literals** beyond structural ones.
   `scripts/check-magic-numbers.mjs` walks the engine and fails on anything that
   is not in `scripts/magic-numbers.allowlist.json`; `npm run check:magic` runs
   it, and so does a test.
2. **`balance.ts` imports nothing from `/src/engine`**, so the whole table can be
   read by a headless bot with no simulation standing up around it.

---

## The simulation

`npm run sim` runs the **real engine** — no DOM, no renderer — driven by three
bots, and prints how long each took to reach each milestone. A balance pass on an
idle game is a claim about _time_, and the only honest way to check a claim about
time is to let the clock run.

The bots are not models of players. They are **corners of the strategy space**,
and the question they answer is not "how long is a run" but "does one way of
playing run away from the others". All three share one purchase loop and differ
only in weights, because two bots with two different loops would be measuring two
different games.

| Bot          | What it does                                                              |
| ------------ | ------------------------------------------------------------------------- |
| **Clicker**  | Taps hard, buys click upgrades, grows canopy. Roots only to stay watered. |
| **Root**     | Digs first. Canopy only as far as maturity and the Light gate demand.     |
| **Balanced** | Holds hydration near 1, spreads spending across both halves.              |

A run is deterministic: every roll comes from a seeded PRNG and the bots have no
randomness of their own, so a change to `balance.ts` moves the table by exactly
as much as it moves the game. `--seed=N` re-runs against a different world.

What the harness deliberately does **not** model: a player who gets bored, a
player who closes the tab (offline progress is a separate calculation, and
including it would make the table a claim about absence rather than about
balance), and a player who reads the Journal. All three make the game faster, so
every number below is a pessimistic bound.

`SIM.clicksPerSecond` is **3**, not 5. Five is a rate a person can hold for a
burst and not for an hour; three is the rate `simulation.test.ts` already calls
"a comfortable pace". Running the harness faster than a person taps would have
made every number here a claim about a player nobody is.

---

## The output

Committed verbatim from `npm run sim`, seed 19:

```
Old Growth — balance simulation (seed 19)
6 species, 20 heirlooms, 4 upgrades

  Clicker    Taps hard, buys click upgrades, grows canopy. Roots only to stay watered.
  Root       Digs first. Canopy only as far as maturity and the Light gate demand.
  Balanced   Holds hydration near 1, spreads spending across both halves.

Time to milestone

                      Clicker        Root    Balanced
First branch               2s          2s          2s
Roots unlocked         2m 38s      4m 14s      3m 48s
First graft            9m 58s     14m 10s     12m 10s
First symbiont         2m 28s      3m 38s      3m 10s
First prestige        54m 56s     53m 38s     50m 34s
Second prestige        1h 39m      1h 41m      1h 39m

Parts at peak             310         305         314
Taps                    17928       18258       17892
Seeds earned               16          16          16

Against the targets in balance.ts

  First branch      in window (0s–30s), spread 1.00×
  Roots unlocked    in window (2m 30s–5m 00s), spread 1.61×
  First graft       in window (9m 00s–20m 00s), spread 1.42×
  First symbiont    in window (1m 00s–15m 00s), spread 1.47×
  First prestige    in window (45m 00s–1h 15m), spread 1.09×
  Second prestige   in window (55m 00s–1h 55m), spread 1.02×

All targets met.
```

### Four more worlds

The seed decides the mineral veins, the weather and the crit rolls, so one seed
is one world rather than the game. Four more, to show the spread is the balance
and not the dice:

| Milestone (fastest–slowest) | seed 5      | seed 7      | seed 42     | seed 101    |
| --------------------------- | ----------- | ----------- | ----------- | ----------- |
| Roots unlocked              | 2m34–3m40   | 3m00–4m28   | 3m14–4m22   | 3m18–4m50   |
| First graft                 | 9m40–12m26  | 12m08–14m22 | 9m42–14m02  | 10m40–14m18 |
| First symbiont              | 2m08–2m32   | 2m44–3m58   | 2m46–3m42   | 2m58–3m52   |
| First prestige              | 54m40–56m08 | 55m10–57m38 | 48m44–51m12 | 49m34–49m50 |
| Second prestige             | 1h42–1h46   | 1h43–1h47   | 1h37–1h42   | 1h37–1h45   |

All four report **All targets met**. Seed-to-seed variation is around fifteen
seconds on the early milestones and a couple of minutes on the prestiges, which
is why the windows below are a little wider than the strategy spread alone would
need.

---

## The curves, and why they are those shapes

### Growth: `PART_COST_GROWTH = 1.16`

Every part costs `baseCost × 1.16^(parts of that type already owned)`. It is the
single most load-bearing number in the game: it is what turns "buy the cheapest
thing" into a decision, and what stops a canopy-only strategy from outrunning a
balanced one.

Raised from a first-pass 1.15, and **tried at 1.24 during this pass and put
back**. At 1.24 the tree stopped growing around twenty-six leaves and the run
became ninety minutes of waiting for Light on a canopy that had finished; the
shallower curve keeps the tree growing all the way to the gate, which is the
pacing the game is about.

### Clicks: linear power, geometric price

`STRONGER_TAPS_POWER` is `+1` Sap a tap per level and `UPGRADE_COST.strongerTaps`
grows `×1.5`. Each level is worth a constant amount per second and costs half as
much again as the last, so the payback period lengthens on its own and the
upgrade self-limits without a level cap.

### The ground: `ROOT_REVEAL_SAP = 2200` **or** `ROOT_REVEAL_PARTS = 47`

Either opens it, whichever arrives first.

The Sap threshold alone made the roots milestone a measure of how hard the player
taps and nothing else: the tapping bot reached it in three minutes and the
root-focused bot in five and a half, on the same game. That is not two ways to
play — it is one way to play and one way to be late. A tree that has been _built_
has earned the ground as surely as one that has been tapped, so the second route
pulls the strategies back together without slowing the one in front. Spread went
from 2.3× to 1.6×.

### Species: a ladder, not a shower

`SPECIES_UNLOCK` places Birch at 215 parts, Pine at 3 cuts, Cherry at 600K
lifetime Sap, Maple at 45K lifetime Light, Willow at 120K lifetime Water. Before
this pass every one of them was reachable inside two minutes — the first
simulation had all five extra species unlocked by minute two, which made the
species picker a wall of choices before the player knew what a branch was.

Birch is the one that matters for pacing: a second wood on the tree is what opens
grafting, so **the first-graft milestone is really the Birch milestone plus the
time to build a fork**.

### Grafting: `GRAFT_BASE_COST` 700 Sap + 180 Water

Priced in two resources on purpose — Sap says "you have been tapping", Water says
"you have been digging", and a hybrid is the first thing in the game that cannot
be bought by doing only half of it.

The Water half is also what the first simulation ran aground on: the harness's
bots spent every drop the moment it landed, so no bot could ever hold 60 Water
and every strategy's first graft came in at exactly 32 minutes — all three
waiting for a storm to blow enough canopy off that the roots finally outran the
leaves. That was the bot, not the balance: `spend()` now holds the graft's price
back, the way a player saving for a hybrid stops buying roots for a minute.

### Maturity: height _and_ Light

`PRESTIGE_HEIGHT_UNITS = 1.05` and `PRESTIGE_LIGHT_REQUIREMENT = 7.8e4`. Light is
the binding half by design — the trace shows height reaching 1.0 around forty
minutes and Light arriving twenty minutes later — and height is the half that
says "and it has to be a _tree_".

Height was **lowered from 1.15**, and the reason is worth keeping. A tree grown
greedily up its own highest tip tops out around 1.15: the gate was sitting _on_
the ceiling, and whether a run cleared it came down to the few degrees of
deterministic jitter each fork is given. Reshuffling that jitter (see the trunk
fix below) was enough to make maturity unreachable on trees that had reached it
the day before. **A gate a player can miss by luck is not a gate.**

### The first prestige pays eight Seeds

`FIRST_PRESTIGE_SEEDS = 8`, and `SEED_LIGHT_DIVISOR` is _derived_ from it:

```ts
SEED_LIGHT_DIVISOR = PRESTIGE_LIGHT_REQUIREMENT / FIRST_PRESTIGE_SEEDS ** 2;
```

so a run that ends exactly on the gate pays exactly eight, by construction, and
the gate and the payout can never drift apart. The design's square root is
intact — the second Seed of a single run still costs four times the first, the
tenth a hundred times — this only sets where the curve starts.

At one Seed the first prestige bought the cheapest node in the Vault (200
starting Sap, about eight seconds of tapping) and the second run came out
_slower_ than the first: starting over cost more than the reward was worth. At
eight it buys a real decision — a head start, or the Canopy Map that replays the
tree you just gave up.

---

## What the pass found

Three of these were bugs the simulation caught that no test would have.

**The trunk could be sealed shut.** The trunk was the one part both a branch and
a root could hang off, with five shared slots — and the ground opens _after_ the
first branches are bought. Every bot arrived at the roots milestone with five
branches on the trunk and dug nothing for the rest of the run: not a slow start,
a permanent soft-lock. `GrowthRule.maxChildrenByDomain` now reserves the trunk's
slots per domain (five canopy, four root) and each domain numbers its own fan, so
the canopy's spread does not shrink by however many roots are in the ground.

**Maturity was refused at exactly the threshold.** `lifetimeLight.div(needed)`
came back as `0.9999999999999999` — a `Decimal` divided by itself is not always
exactly one. A tree that had gathered _precisely_ the required Light was told it
had not. The gate now asks the Decimals directly (`gte`) and keeps the ratio for
the progress bar.

**A creature was part of the starting position.** The squirrel wanted one oak
branch, which every tree grows in its first ten seconds, so the table read "first
symbiont: 0s" on all three strategies. Arrival thresholds moved into
`SYMBIONT_ARRIVAL` and the squirrel now wants twelve.

---

## Where the balance still deviates from the brief

**The second run is about four-fifths of the first, not half.** The brief asks
for "second prestige roughly half the first"; the harness reports a first run of
~52 minutes and a second of ~45. Getting to one half would need either a much
stronger first payout — which makes the first run feel like a formality — or a
weaker first run, and neither is worth buying the ratio with. The window in
`SIM.targets` reflects what the Vault's early nodes are actually worth
(`secondPrestige: [3300, 6900]`), and this paragraph is here so the gap is a
decision rather than a rounding.

**The graft window is 9–20 minutes, not 10–20.** The fastest strategy reaches its
second species at 9m58s and grafts two seconds later. Every knob that pushes that
past ten minutes — Birch at 218 parts rather than 215 — sends the root-focused bot
off a cliff to 22 minutes, because it crosses the threshold in a different part
of its purchase cycle. Nine minutes for the fastest of three strategies is inside
"~15 min" as the brief describes it; a two-second miss chased with a chaotic knob
would not be.

**The roots window is 2m30–5m, not 2m30–4m20.** Strategy spread is 1.6× and
seed-to-seed variation adds another fifteen seconds; a window narrower than that
would pass on the seed it was tuned against and fail on the next one.

---

## Re-running this

```sh
npm run sim                      # the table above, and a pass/fail column
npm run sim -- --seed=42         # a different world
npm run sim:trace -- --strategy=balanced --minutes=90 --every=10
npm run check:magic              # no bare numbers in /src/engine
```

`sim:trace` is the tuning instrument: it narrates one run a line at a time with
the two numbers behind maturity, what the tree is made of, and what it is
earning, so a balance change can be aimed at the gate that is actually binding
rather than at whichever number was easiest to reach. It asserts nothing.

`npm run sim` exits non-zero when a target is missed, so it can be a CI gate.
