# BRIEF — G20D: harden the two flaky probes (a green suite must not be a coin flip)

You are the builder for the HORDES repo. Workdir: /home/claude/projects/hordes.
Self-contained: the measurements below were taken on this tree by the parent; re-run them yourself.

## The problem

G20C's fix is verified and correct (probe `tools/probe_stage_stamp.mjs` => flake 0/25, unstamped foes 0,
SNOWFIELD chests 38 -> 2 over 25 cohorts, `test/test_stages.mjs` => 33 checks). But `bash /tmp/run_all.sh`
is still NOT reliably green: in three consecutive runs this tick got PASS=73, then FAIL=1
(`test/test_stages.mjs`), then PASS=73. This slice makes that flake go away BY CONSTRUCTION.

## Finding 1 (MEASURED) — test/test_stages.mjs:387 is a single-sample integer compare

The failing assertion, inside `(e) mods at the REAL seam`:

    const count = (by) => Object.values(by).reduce((n, a) => n + a.length, 0);
    if (!(count(snow) < count(base))) {
      throw new Error('SNOWFIELD spawned ' + count(snow) + ' vs base ' + count(base) + ' (spawnMult 0.7 must be fewer)');
    }

Measured with a NEW probe `tools/probe_spawn_mult.mjs` (60 paired 900-frame cohorts, SNOWFIELD vs the
default stage) on this tree:

    base   {"min":9,"max":12,"mean":"11.82"}
    snow   {"min":6,"max":15,"mean":"8.93"}
    mean ratio snow/base = 0.755   (spawnMult 0.7 => expect ~0.70)
    ties 0/60   snow>base 1/60

The GAME seam is CORRECT — `spawnMult 0.7` really does produce ~0.75x the bodies. The assertion is what is
broken: a 900-frame window holds only ~9-12 bodies, so a single-sample strict `<` ties (or inverts) by chance
when base lands at its minimum. Observed rate ~1 in 20 standalone runs, error text `SNOWFIELD spawned 9 vs base 9`.

## Finding 2 (KNOWN, secondary) — test/smoke.mjs:1292

`full tilt equals keyboard speed (joy 30.0 vs key 34.8)` — the keyboard half of the window travelled 16%
further, ~1 run in 120. Something appears to change the live speed mid-window.

## What to build (a FIX — TEST-ONLY, no new content, no src/ edits)

1. **test/test_stages.mjs** — replace the single-sample count compare with an AGGREGATE over K >= 4 cohorts
   per stage, asserting the SAME property on the same window: aggregate SNOWFIELD bodies < aggregate base
   bodies. With K=4 the aggregate means are ~47 vs ~36, so keep the STRICT `<` — do NOT introduce a tolerance
   band that a spawnMult-1.0 regression could still pass. Expected ratio over the aggregate is ~0.75; assert
   the direction, and (optionally) that the aggregate ratio is < 0.9, which the measured 0.755 clears with room.
   Keep every other check in that block (hp ratio, speed ratio, NaN guard, the two-stage-0-hp agreement, the
   whole-histogram G20C check) EXACTLY as it is.
   Reuse `collectSpawned` — do not add a second sampling path.
2. **test/smoke.mjs:1292** — name the cause of the joy/key speed mismatch WITH EVIDENCE (which field changes,
   what changes it). If you can name it, pin the probe (e.g. assert the player's speed field is unchanged
   across the comparison) WITHOUT weakening the comparison. If you cannot name the cause with evidence,
   change NOTHING there and report that explicitly.

HARD RULE: no assertion weakened, retargeted or deleted; no threshold loosened; `src/` untouched.

## Evidence bar (the parent re-runs all of this itself; a claim is not evidence)

- `node test/test_stages.mjs` => 33 checks passed, **20 times in a row, ZERO failures** (that is the point of
  the slice; report the raw tally).
- `node tools/probe_spawn_mult.mjs` => the same numbers as above (it proves you did not touch the game).
- `bash /tmp/run_all.sh` => **PASS=73 FAIL=0, three times in a row**.
- Report: files touched with line numbers, the 20-run tally, the smoke cause with evidence or an explicit
  "could not name it", and everything you could NOT verify.

## Standing rules

Acquire the lock before editing (`AGENT_HUB_PARTICIPANT=<you> ~/projects/agent-hub/sdk/agentlock acquire`)
and release it when done, including on failure. NO git commands (commit/checkout/reset/stash/clean) — the
orchestrator owns commits. No emojis. Integer pixels. Correct at 60Hz and 120Hz. One writer per file:
`test/test_stages.mjs`, `test/smoke.mjs` are yours for this slice. Reply TASK-STARTED.
