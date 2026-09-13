# SUITE FLAKES - POWER, NOT TOLERANCE (test-only)

Pilot tick 2026-09-13 (subagent:spawnfa). Repo /home/claude/projects/hordes. Tree at dispatch: HEAD 8348e6b, dirty=0.

## HOUSE RULES (you will not be given them otherwise)
- Exactly ONE writer. Before you edit anything run ~/projects/agent-hub/sdk/agentlock status. If it is HELD by another owner, STOP and report - edit nothing. Otherwise take it yourself (~/projects/agent-hub/sdk/agentlock acquire --note suite-flakes-power) and release it when you are done. Beat as you go: ~/projects/agent-hub/sdk/agentlock beat.
- NO git state commands at all (commit / checkout / reset / stash / clean). The orchestrator owns commits.
- Your own summary is a claim, not evidence. Every number you report must come from a command you ran and pasted.
- An assertion is NEVER weakened, moved, deleted or given a tolerance band to go green. A green suite won by tolerance is a FAILURE. Base difficulty is deliberately harsh by owner order: make the PROBE durable for its scenario, never soften the game.
- If a red turns out to be a GAME defect, STOP and report it with the measurement. Do NOT patch src/.
- 60Hz and 120Hz must both stay correct; nothing may assume a fixed dt. No emojis anywhere.

## SCOPE
You may edit ONLY test/test_stages.mjs, test/test_trophy_hooks.mjs and test/_harness.mjs. src/ and tools/ are OFF LIMITS.

## MEASURED FACTS (pilot runs on this tree at 8348e6b, dirty=0 - verify, do not re-derive)
1. The four reds fixed by the previous dispatch (test_shop_mana, test_draft_sim, test_encounters, test_tour) are VERIFIED FIXED: 20/20 standalone each. DO NOT TOUCH those four files.
2. The suite is still NOT green by construction. Pilot runs of bash /tmp/run_all.sh at 8348e6b: greenfiles/redfiles = 72/1 (test_trophy_hooks), 72/1 (test_stages), 73/0. Two of three runs were red, so one green run is not the bar.
3. Residual identity A - test/test_stages.mjs spawn checks, the two clauses around line 395-410 (K=4 aggregate, strict less-than, plus the ratio under 0.9 clause):
   - pilot tally this tick: 3/10 red standalone; combined with an earlier 20-run tally, 5/30 red (about 17 percent).
   - red messages measured: SNOWFIELD spawned 34 vs base 33 over 4 cohorts; aggregate spawn ratio 0.917 / 0.939 / 0.947 over 4 cohorts.
   - cause, measured by tools/probe_spawn_mult.mjs over 60 paired 900-frame cohorts (pilot run, tick 33): body-count ratio snow/base mean 0.842, ties 5/60, inversions 14/60. The single-window and K=4 BODY COUNT estimate is inside the game own run-to-run variance. The effect itself also measurably shrank (tick 32 measured mean 0.755 on the pre-wave tree).
   - THE FIX IS POWER, NOT TOLERANCE, and there is a deterministic route: src/main.js:582 spawnWave(dt) computes state.spawnTimer = max(0.25, (C.ENEMY.SPAWN_INTERVAL - state.time * 0.008) / (heatMultipliers(heatOf(state)).spawnRate * (sm.spawnMult || 1))) and then emits ladderGroups(state.time) groups. spawnWave IS exported through the test seam (src/main.js:5826). Measure the EMISSION, not the survivors: drive T.spawnWave in a controlled harness (identical state, identical dt, identical time) and compare the emitted group/foe count per unit sim time, plus assert the computed spawnTimer interval ratio exactly (0.7x, no tolerance) on the first tick. Keep the existing body-count clauses; do not delete them, do not add a band.
   - If after the emission measurement the seam still reads diluted (ratio not distinguishable from 1.0 over 12 or more paired cohorts), STOP and report that as a GAME/balance finding for the owner with the numbers. Do not touch src/stages.js.
4. Residual identity B - test/test_trophy_hooks.mjs, the check around line 69: 25 chests are pushed one at a time onto state.chests at the player position with h.pump(1) each, and st.runCounts.chests minus base must equal 25. Pilot tally this tick: 3/10 red standalone, counts 20, 1, 21. It ran red in one of the three suite runs too. LABELLED HYPOTHESIS (not a diagnosis): the loop presses one frame per chest and some chest outcome PAUSES the sim (a banner hold or an overlay mode), so the remaining pushes never process. Your FIRST job is to NAME THE CAUSE WITH EVIDENCE (log st.mode, any banner hold and the pickup counter per iteration) and only then fix the FIXTURE (drain the pause on the house pattern, or pre-mark the banner seen). If the cause is the game silently dropping chests on the pickup path, STOP and report it - that is a gameplay defect the owner wants to know about.

## ACCEPTANCE BAR (all of it)
- node test/test_stages.mjs and node test/test_trophy_hooks.mjs: 20/20 green standalone each. Paste both tallies.
- bash /tmp/run_all.sh three consecutive times, each printing redfiles=0 with its TREE line. Paste all three.
- git diff --stat must show no src/ or tools/ file touched; paste it.
- The measured before/after numbers: the spawn emission ratio per stage pair (base vs SNOWFIELD), the interval ratio on the first tick, and the trophy_hooks per-iteration log that names the cause.
- A COULD NOT VERIFY section naming anything you could not measure or believe is still a game defect. That section is expected and is not a failure.

Report as a done: line plus the sections above.

---

## TICK-36 ADDENDUM (2026-09-13, pilot tick subagent:spawnfa) - READ THIS, IT SUPERSEDES THE RATES ABOVE

**WHY THIS BRIEF IS BEING RE-ISSUED:** the previous dispatch of this exact brief
(msg_01M2E4FMR99Y47HWP6G8P39FAG) reported
`blocked: SUITE_FLAKES_POWER - agentlock held by another owner (subagent:commit-watcher, alive, "commit+push pending hordes slice")`
and did NOTHING. Nothing was edited, the slice was never attempted. That was a transient
lock collision, not a defect in the task.

**LOCK CLAUSE - CHANGED, OBEY THIS ONE (it replaces the "STOP if HELD" line in HOUSE RULES):**
if `agentlock status` reads HELD by another owner, do NOT immediately self-cancel. Sleep 20s,
re-check, and repeat up to 15 times (5 minutes total). Never edit a file, never run a git state
command, while it is held. Only if it is STILL held after 5 minutes do you post `blocked:` and stop.
Most holders here are short-lived committers.

**TREE AT THIS ADDENDUM:** HEAD 23330a9, dirty=0 (verified).

**PILOT's OWN MEASUREMENTS THIS TICK (verify, do not re-derive):**
- `bash /tmp/run_all.sh` at 23330a9: `greenfiles=72 redfiles=1`, REDLIST `test/test_stages.mjs`,
  message `Error: SNOWFIELD aggregate spawn ratio 0.971 over 4 cohorts`.
- `test/test_stages.mjs` standalone: 3 red / 15 sequential runs across two batches
  (batch of 5: 3 red; batch of 10 immediately after: 0 red). Load-correlated, ~20%.
- **NEW AND IMPORTANT - the two red clauses CO-FAIL, so they share ONE cause.**
  In EVERY red run this tick BOTH of these fired, and in all 13 green runs NEITHER fired:
    1. `FAIL (e) mods at the REAL seam: SNOWFIELD foes are exactly 1.5x hp / 0.9x speed, stage 0 exactly 1.0x`
    2. the spawn clause, on one of two messages:
       `Error: SNOWFIELD aggregate spawn ratio 0.947 over 4 cohorts (measured ~0.75; a spawnMult 1.0 regression reads ~1.0)`
       `Error: SNOWFIELD spawned 36 vs base 36 over 4 cohorts (spawnMult 0.7 must be fewer)`
  So the emission/seam route in MEASURED FACTS item 3 must cover the mods clause too: measure the
  STAGE MODS and the EMISSION deterministically at the seam (identical state / dt / time, driven
  through the exported spawnWave at src/main.js:5826), not through surviving body counts.
  KEEP every existing clause; do not delete the body-count checks, do not add a tolerance band.
- `test/test_trophy_hooks.mjs` standalone: 2 red / 10 runs, both the same message:
  `FAIL the LIVE loop counts boss kills and OPENED chests`. Name the cause with the per-iteration log
  (st.mode, banner hold, pickup counter) BEFORE touching the fixture, per MEASURED FACTS item 4.

Everything else in this brief stands unchanged, including the acceptance bar and the
COULD NOT VERIFY section.
