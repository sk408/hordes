# BRIEF — SUITE REDS: FIXTURE RETARGET (test-only). Dispatched 2026-09-13 by the goal pilot.

## WHY THIS EXISTS / THE MEASURED BAR

`bash /tmp/run_all.sh` at the clean committed HEAD `d9d5426` reads **FAIL=4 / greenfiles=69**:

```
RED test/test_draft_sim.mjs :: survival hp+speed 0 vs good 0
RED test/test_encounters.mjs :: a herald appeared (or was already recorded)
RED test/test_shop_mana.mjs :: an AUTO kill pays the same 0.2 (+ the frame drip, got 0.4083333333333333)
RED test/test_tour.mjs :: coachmark for hordes_tour_cog mounted (stalled at mode=playing, t=17s)
```

`BUILD_PLAN.md`'s definition of "full build complete" item 3 is a green suite. The pilot has ALREADY
diagnosed all four by measurement (numbers below, reproducible with the commands given) and they are
PROBE defects, not game defects: the owner-ordered economy/enemy wave (squared enemy base hp/damage,
doubled shop rows, `fa9d81c`, `6a28b19`, `8e6d6f7`, `d9d5426`) moved the numbers these probes hardcode
or the fixture they assume. **Your job is to retarget the FIXTURES, never the assertions and never the game.**

House rule that governs this whole brief (from the goals doc, owner-sanctioned): *make the probe
character durable for a test scenario — do not soften the game.* The base difficulty is deliberately
harsh and the owner has accepted it in his own words. A red suite is not an invitation to rebalance.

## SCOPE / HARD BOUNDS

- You may edit ONLY: `test/test_draft_sim.mjs`, `test/test_encounters.mjs`, `test/test_shop_mana.mjs`,
  `test/test_tour.mjs`, and shared helpers in `test/_harness.mjs` if you need one.
- **DO NOT EDIT ANY FILE IN `src/` OR `tools/`.** If you believe a red is a genuine GAME defect, STOP and
  report it with the measurement — do not patch `src/` and do not "fix" it by weakening the test.
- **No assertion may be deleted, loosened, retargeted downward, given a tolerance band, or skipped.**
  Every red is fixed by changing the FIXTURE (the profile/loadout/durability the probe runs with, or the
  frame budget it pumps), keeping the asserted claim, its direction, its threshold and its message.
- **NO git state commands** (no commit/checkout/reset/stash/clean). The orchestrator owns all commits.
- **RUN THE TESTS ON THE TREE AS YOU FIND IT.** The owner is committing to this repo live; he does not
  take the agentlock. Before you start, run `~/projects/agent-hub/sdk/agentlock status`. If it reads HELD
  by another owner, **STOP immediately and report** — do not edit anything.
- Game constants stay as they are: 60Hz AND 120Hz both correct, nothing may assume a fixed dt. No emojis.

## R1 — test/test_shop_mana.mjs (~line 302) — one STALE LITERAL

`assert.ok(Math.abs(p.mana - (0.2 + C.MANA.REGEN / 60)) < 1e-9, ...)`. `siphon` was **owner-doubled**
(`fa9d81c`): `SHOP_BY_ID.siphon.perLevel` is now `0.10`, so L4 pays **0.40**, and the probe reads
`0.4083333333333333` = 0.40 + 0.5/60. The game is RIGHT; the retyped literal is stale.
**Fix:** read the number through the real source of truth — `SHOP_BY_ID.siphon.perLevel * level` (or the
applied `player.stats.manaOnKill` via the real stat chain, as the sibling check at ~line 258 already
does). Keep the exact `1e-9` equality and the message. Do not retype a new literal — that is how this
went stale. Confirm the file's other siphon checks still agree with the row.

## R2 — test/test_draft_sim.mjs (~lines 22-26 + 58-63) — the cohorts run a FRESH profile

The three cohorts are built with `simulateRun(SEED, <policy>)` and **no `patch`**, i.e. a fresh profile.
Reproduce the pilot's measurement (`node` + a 6-line probe importing `tools/draft_sim.mjs`):
seed 4242 -> GREED_DAMAGE `survivalTime 52, kills 18, picks {wlevel_VOLLEY:1, dmg:1}` and SURVIVAL
**identical**, ADVERSARIAL_BAD `51s, {rule_once:1, pickup:1}`. So `s('hp')+s('speed') > g('hp')+g('speed')`
reads `0 > 0`: with a fresh profile the run dies at ~52s, gets **2 drafts**, and both policies take the
same two cards. Under the ordered design a green run is deliberately weak — that is the design working,
but it means this probe has no drafts left in which divergence can express itself.
**Fix:** retarget the FIXTURE exactly as `d9d5426` did for `test_draft_luck.mjs` — run the
archetype-divergence cohorts with a PURCHASED loadout via `patch.purchases` (read that commit's diff and
mirror its shape; the loadout it measured is `{dmg:5, split:3, thrifty:2, slots:1, weapon_orbit:1}` —
**verify every id exists as a `SHOP` row in `src/meta.js` before using it**, and keep the reproducibility
checks pointed at the same cohort definition you now use). Keep every assertion text/direction/threshold
unchanged, including "GREED-DAMAGE out-survives/out-kills/out-earns ADVERSARIAL-BAD" and the whole
cohort-verdict section. Report the before/after survival times and the after-picks for all three policies.

## R3 — test/test_encounters.mjs (~lines 292-314) — the probe never reaches the HERALD

`saw` is null after 60*400 frames and no `boss:HERALD` entry appears. The gate is
`state.time >= state.wave.midAt` (`src/main.js:1382`), with `midAt = WAVE_LENGTH * (1 - AT_FRACTION)`
set at `src/main.js:946` — read `CONFIG.ESCALATION.WAVE_LENGTH` / `MIDBOSS.AT_FRACTION` and report the
actual gate time. A default fresh run dies before that gate, so the probe cannot see the herald.
**Fix:** make the probe character DURABLE for this scenario (the sanctioned pattern: raise the probe's
run stats through the real seams, e.g. a large start `maxHp`/hp after `startRun()` — never by editing
game constants), then pump to the gate **by SIM TIME** rather than a fixed frame count. Add an explicit
diagnostic so a future stall names itself: if the run reaches `mode === 'dead'`, the failure message must
say the death time in seconds. Keep the three assertions unchanged (herald appears / `boss:HERALD` is
recorded AT SPAWN / `firstAt < 120`). Report the measured gate time, the death time before your fix, and
the after-run's `firstAt`.

## R4 — test/test_tour.mjs (~lines 344-371) — the frame budget cannot reach a TIME gate

The `hordes_tour_cog` coachmark gate is `state.time > 25` (`src/main.js:3313`). The probe's per-step
budget is a fixed **1800 FRAMES**, but coachmarks PAUSE the sim and drafts/intermission consume frames
without advancing `state.time` — so the pilot measured the probe stalling at **t=17s, t=9s and t=5s**
across three standalone runs (**2 red / 1 green**, i.e. flaky). The assertion is right; the budget is wrong.
**Fix:** budget by SIM TIME (pump until the gate can fire — e.g. until `st.time` passes the next gate
with a generous frame ceiling — or scale the ceiling off sim time actually advanced), never by a bare
frame count. Keep the chain list, the tip words, the flag-persistence and caption-length assertions
unchanged. Report the three before stall times and the after tally.

## ACCEPTANCE BAR (all of it, with numbers)

1. Each of the four tests **20/20 green standalone** (`for i in $(seq 20); do node test/<f>.mjs; done`).
   Report the tally per file and any red you saw with its exact message.
2. `bash /tmp/run_all.sh` -> **`redfiles=0`** three consecutive times. Paste the `TREE:`/`SUITE` lines.
3. `git diff --stat` shows **no `src/` and no `tools/` file touched** (state it explicitly).
4. No assertion text weakened: paste the `git diff` of each test file you changed.
5. Report the before/after measured numbers named in R1-R4. A claim is not evidence.
6. If any red is a real GAME defect, STOP and report it — do not patch `src/`.

## REPORT SHAPE (short, numbers first)

`done:` line, then per-test: what the fixture was / what it is now / the before-after number; the 20/20
tallies; the three `SUITE` lines with `redfiles=0`; the files changed; and an explicit
COULD NOT VERIFY section (anything you could not measure, and any red you consider a game defect).
