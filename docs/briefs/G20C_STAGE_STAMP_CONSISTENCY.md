# BRIEF — G20C: the stage stamp is NOT universal (measured defect + flaky probe)

You are the builder for the HORDES repo. Workdir: /home/claude/projects/hordes.
This brief is self-contained: trust the measurements here (they were taken on this tree) and re-run them yourself.

## The system

`src/stages.js` (G20) is a declarative per-stage catalog with `mods = {hpMult, dmgMult, spawnMult, speedMult, packMult}`.
The declared contract, quoted from `src/main.js` spawnWave (the comment above the stamp):

  "stage stat mods stamp LAST, on the fully-escalated, elite- and rarity-stamped foe — a hpMult 1.5 stage
   produces exactly 1.5x the hp the same spawn would have on the default stage."

That contract is violated in FOUR places on this tree. Two of them are measured below.

## Finding 1 (MEASURED) — the chest-drop "elite-ish" test reads the STAGE-STAMPED hp

`src/chests.js:99`:
    return enemy.maxHp >= C.ENEMY.BASE_HP * CHESTS.ELITE_HP_MULT;

BASE_HP is 12, ELITE_HP_MULT is 1.5, so the bar is 18. SNOWFIELD's hpMult is exactly 1.5, so EVERY plain CHASER
spawned there has maxHp exactly 18 and reads as elite-ish. `maybeSpawnChest` then rolls `CHESTS.DROP_CHANCE = 0.35`
on EVERY kill instead of on elite kills.

Measured on this tree (`node tools/probe_stage_stamp.mjs`, 25 paired 900-frame cohorts, SNOWFIELD vs the default stage):
- **17 of 25 SNOWFIELD cohorts opened chests** (0 to 5 each; sum 38 chests over 25 runs).
- **0 of 25 default-stage cohorts opened a single chest.**
That is the entire chest economy leaking open on a stage that only meant to double the hp. Any stage with
hpMult >= 1.5 does this; confirm the id of the 1.8 stage and report the full list.

## Finding 2 (MEASURED, fingerprint match) — the chest punishment horde bypasses the stage stamp

`spawnPunishmentHorde()` (`src/chests.js:157`) calls `applyEscalation` but never the stage stamp, so its 6
`GAMBLE_HORDE_COUNT` CHASERs spawn at the DEFAULT-stage hp on every stage. Probe run 3 of 25 on this tree:
SNOWFIELD cohort CHASER maxHp histogram `{12: 6, 18: 9}` — exactly 6 unstamped 12hp foes, i.e. the horde.

Same bypass at two more sites: boss `act.summon` (`src/main.js:1529`) and boss `act.ring` (`src/main.js:1544`).
Consequence: a stage that means "1.5x hp" produces 1.0x hp minions and punishment foes.

## Why this matters beyond the two bugs: it is the flake in the suite

`test/test_stages.mjs:360` (`(e) mods at the REAL seam`) fails about 4-10% of runs with `CHASER hp ratio 1`,
because the probe takes `min(maxHp)` over every CHASER it ever saw, and the unstamped horde drags the minimum to
12. Tick 30 recorded a HYPOTHESIS that this was a leftover foe from the previous cohort; **that hypothesis is
disproven**: `startRun()` clears `state.enemies` (`src/main.js:3914`), and the observed fingerprint is 6
simultaneous unstamped CHASERs, which is the horde count exactly.

## What to build (a FIX, not a feature — no new screens, no new content)

1. **One implementation of the stamp.** Factor `stampStageStats(state, enemy)` (reads `stageMods(state.stage)` and
   applies hpMult / speedMult / dmgMult exactly as the existing inline code does — missing dial means 1.0).
   Call it from the trunk spawn seam (spawnWave) AND at every bypass: the chest punishment horde, boss `summon`,
   boss `ring`. For the chest horde the cheapest correct site is the existing post-tick loop in `src/main.js`
   (~line 1821) that already re-bases foes added by a `gambleHorde` / `hordeBait` event; prefer that and leave
   `chests.js`'s self-contained rng draw order byte-identical.
2. **Make chest eligibility stamp-independent.** Stamp the PRE-stage hp at the trunk seam (e.g. `e.preStageMaxHp`)
   and have `chests.js` read `(enemy.preStageMaxHp ?? enemy.maxHp)`. `enemy.elite` must stay sufficient on its own.
   The default stage's behaviour must be byte-identical (0.35 roll on elite kills only).
3. **New checks in `test/test_stages.mjs`** in that file's existing style, which would have caught both findings:
   (i) assert the whole CHASER maxHp HISTOGRAM of a SNOWFIELD cohort (every value == stage mult x hpScale), not
   just the minimum — the current min-only assertion is exactly what let a 12hp straggler hide in a field of 18s;
   (ii) pin "chests are an elite reward" — a 900-frame default-stage cohort opens 0 chests, and a SNOWFIELD
   cohort's plain foes must NOT be chest-eligible;
   (iii) a boss-summon/ring foe carries the stage mult.
   HARD RULE: do not weaken, retarget or delete the existing assertions. Make the GAME meet them.
4. **Secondary, only if the primary work is green:** `test/smoke.mjs:1292` fails about 1 run in 120 with
   `full tilt equals keyboard speed (joy 30.0 vs key 34.8)` — the keyboard half of the window travelled 16% further,
   so something changed the live speed mid-window. Name the cause with evidence and pin the probe's window
   (e.g. assert the player's speed field is unchanged across the comparison) WITHOUT weakening the comparison.
   If you cannot name the cause with evidence, change nothing and report it.

## Evidence bar (the parent re-runs all of this itself; a claim is not evidence)

- `node tools/probe_stage_stamp.mjs` — 25 paired cohorts — reports **0 flake** (it currently reports 1 flake in 25)
  and the SNOWFIELD chest count collapses from 38 chests/25 runs to the default stage's level. Report the
  before/after numbers you measure YOURSELF.
- `node tools/verify_g20_stages.mjs` => PASS in a real browser at 390x844 @dpr3, PNG rewritten under
  `docs/art/browser-verify-2026-09-12/`. Phone viewport is not optional.
- `bash /tmp/run_all.sh` => PASS=73+ FAIL=0, three times in a row (73 is the current file count; it must not drop).
- Report: files touched with line numbers, measured before/after chest counts and unstamped-foe counts, exact
  suite results, and an explicit list of everything you could NOT verify.

## Standing rules

Acquire the lock before editing (`AGENT_HUB_PARTICIPANT=<you> ~/projects/agent-hub/sdk/agentlock acquire`) and
release it when done, including on failure. NO git commands (commit/checkout/reset/stash/clean) — the orchestrator
owns commits. No emojis. Integer pixels. Correct at both 60Hz and 120Hz — nothing may assume a fixed dt. One writer
per file: `src/main.js`, `src/chests.js`, `test/test_stages.mjs` are yours for this slice. Reply TASK-STARTED.
