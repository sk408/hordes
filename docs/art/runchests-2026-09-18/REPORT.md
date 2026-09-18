# RUN-COUNT MILESTONE CHESTS — REPORT (2026-09-18)

Owner ask (2026-09-17): "reward players for the number of runs they've
played... run 50 start with a big chest on the screen that pilot collects and
it could reward maybe 10 runs worth of gold. Same at 100, 200, and 500."
Addendum: make it big and cool — drawn art, a burst, a distinct sound.

## What the previous run built (already in the tree at resume)

- The named table `RUN_CHESTS` in src/meta.js:315 (`MILESTONES: [50, 100,
  200, 500]`, `RUNS_WORTH: 10`, floor 70, cap 754,689) — one object, read by
  main.js, no second copy.
- The gate `nextRunChest` (meta.js:330) and the reward `runChestGold`
  (meta.js:341).
- The v10 save step (save.js): `milestoneChest` migrates 0, lossless; garbage
  repairs to 0 and names the field. One step per version, no collisions.
- Spawn at startRun (main.js:7639 block), the autopilot's `CHEST` act
  (controllers.js:403), the collect → direct bank + claim + card, and the
  unlosable re-offer.

## What I completed

1. **Test repairs** — §8's jumped-counter fixture (250 settled runs so the
   50→100→200 ladder is reachable; 52 could not reach 100), §9's decide() cfg
   (KITE_DIST lives on CONFIG.PLAYER, not AUTOPILOT — FLEE was unreachable
   with the wrong table). File green, now 51 checks.
2. **Latent test bug elsewhere**: test_earned_moment's chest-open regex had an
   ungrouped alternation (`/openChest|applyContents.../`) matching bare
   `openChest` anywhere — exposed by the new `openChestCard`. Regex fixed; no
   dilation actually sits in the chest path.
3. **The burst-then-card payoff** (the "big and cool" addendum): collection
   now enters mode `'burst'` — the frozen field with a wall-clock coin/spark
   shower at the spot the chest stood (render.js `drawChestBurst`: white core
   flash, an expanding gold ring, 12 deterministic-angled sparks, integer
   pixels, reduced-motion = one static fading ring) — and the card opens when
   it expires (`tickChestBurst`, main.js, aged on accumulated realDt:
   frame-rate independent). Bank + claim persist BEFORE the burst is armed,
   so a tab close mid-firework can neither double-pay nor lose the chest.
4. **The idle bounce**: the field chest is a 2px integer hop on the sim clock
   (static under reduced motion) — render.js:545.
5. **SFX toggle pin** (test_audio.mjs): the chest arp is gated by the SFX
   toggle (zero nodes when off) and is its own voice (3-note triangle chord,
   distinct from the 4-note level-up arp).
6. **Browser verifier** `tools/verify_runchests.mjs` — all green at both
   sizes, with death-retry (a run that dies before the walk-in re-offers the
   same chest: unlosable, demonstrated live).

## The counting rule

- A run counts when it STARTS: `runsStarted = totals.runs (settled) + 1`.
- A chest is due on the run that CROSSES an unclaimed milestone — `>=`, never
  `===` (a jumped counter still pays). One at a time, smallest unclaimed
  first: 50 → 100 → 200 → 500.
- The claim is ONE monotonic number, `profile.milestoneChest` (v10) = highest
  milestone COLLECTED. Claim-at-collection, not claim-at-spawn: an uncollected
  chest is re-offered by the next startRun — unlosable by construction, no
  despawn, no ttl.

## The income basis (MEASURED, not vibes)

`runChestGold(totals) = floor(clamp(totals.gold / totals.runs, 70, 754689) × 10)`
— ten runs' worth of the player's OWN stored lifetime average, floored at 70
(RUN_GOLD.AWARD — PACING §1's fresh-run measured floor) and capped at
754,689/run (PACING §1's tier-3 measured maxed-run income). The seeded
browser run (49 runs / 14,700g = 300g avg) paid exactly +3,000.

## The farm measurement (/tmp/measure_farm.mjs)

The instant-END-RUN loop (startRun → settings → END RUN → CONFIRM, 20×,
through the real seams): banks **70.0 gold/run** (award only — 0 kills, 0
purse), **0.000 sim s/run**, ~1.2ms harness wall/run. A farmed profile pins
its lifetime average at the floor, so its chest pays the **700 floor** —
farming can never inflate the reward (the average only decreases) and can
never double-claim (the monotonic number). The chest is farm-proof by
arithmetic, not by rule.
SIM: 0.0s across 1 arm (sources: [ARM] farmed settle path ×20).

## The cumulative curve vs the invariant (no constants tuned)

The invariant: "a good run is worth about one next-step upgrade at every
stage." Chest pay vs archetype averages [TABLE, SHOP_UPGRADES: 47 rows, 151
buy steps, full-buy total 98,549,753g]:

| Player archetype | avg gold/run | chest pays (10×) | ≈ next-step upgrade at that wealth |
|---|---|---|---|
| farmed / floor | 70 | 700 | Alchemy L3 (717g) |
| owner's "300g easily" | 300 | 3,000 | ~Forged Edge L4 tier |
| couple upgrades | 200 | 2,000 | Deadeye L5 (2,172g) |
| half build (60s) | 569 | 5,690 | Split Shot L10 (5,957g) |
| established | 2,000 | 20,000 | Weapon Slot L2 (14,500g) |
| maxed | 754,689 | 7,546,890 | Beam L1 (4,500,000g) |

Next-step prices at the PACING anchor spends: 270g → Forged Edge L1 (150g);
2,222g → Deep Well L1 (250g); 7,079,133g → Hollowpoint L3 (544,000g);
98,549,753g → Beam L1 (4,500,000g). The chest is worth +10 runs of income at
milestone M — i.e. 20% / 10% / 5% / 2% of cumulative income at 50 / 100 /
200 / 500: front-loaded exactly where the mid-game lags (see the mid-game
diagnosis task), fading late. **Nothing was tuned** — the numbers are the
measured table's own.

## Tests + evidence

- test/test_runchests.mjs — 51 checks: table, gate matrix, gold basis,
  migration/repair, spawn clamp, no-despawn, burst-then-card (painter pinned
  via a recording ctx: ≥12 sparks + ring + flash, all integer pixels; nothing
  once expired), bank + one-save claim, exactly-once, unlosable re-offer,
  jumped ladder, pilot beeline + FLEE precedence, real walk-in.
- test/test_audio.mjs — chest arp gated by the SFX toggle, distinct voice.
- Suite: 154 files, redfiles=0 (one transient red in test_ults was CPU
  contention from a concurrent browser run; green in isolation and on the
  clean re-run).
- tools/verify_runchests.mjs — all checks passed at 390x844 AND 320x568:
  run #50 opens with the BIG chest on-screen (x 125, y 130 — nothing clips),
  the autopilot walks in, the BURST paints the frozen field, the card reads
  "RUN 50!" / "+3,000 gold banked", the claim + bank persist
  (milestoneChest 50), GOT IT resumes, and run #51 spawns nothing.

### Shots (docs/art/runchests-2026-09-18/shots/)

| Moment | 390x844 | 320x568 |
|---|---|---|
| the BIG chest in-world at run start | runchests-field-390x844.png | runchests-field-320x568.png |
| the coin/spark burst on the frozen field | runchests-burst-390x844.png | runchests-burst-320x568.png |
| the payoff card | runchests-card-390x844.png | runchests-card-320x568.png |
