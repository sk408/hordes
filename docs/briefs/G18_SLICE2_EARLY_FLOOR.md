## DISPATCH ANCHOR CHECK — FILLED BY THE DISPATCHING PILOT, 2026-09-15 22:47 UTC, HEAD `1abf1b3` dirty=0

This tick is the goal-pilot (participant `subagent:spawnfa`, agentlock held while issuing). **This block
SUPERSEDES every line number in the body above — trust the SYMBOL, not the number.**

**SUITE AT DISPATCH, run by the dispatcher itself on this tree:** `TREE: /home/claude/projects/hordes @ 1abf1b3 | dirty=0`, `SUITE greenfiles=98 redfiles=0`, REDLIST empty. The tree is CLEAN: the orchestrator committed the whole outstanding backlog at `1abf1b3` (G16 portal cinematic + the V1 escape family (V1b art, V1c pursuit) + the shop-latency fix + G18 slice 1). Build on this HEAD. `bash tools/run_suite.sh` FIRST — if it is red before you edit anything, STOP and post `blocked:` with the raw line; do not build on a red tree.

**ANCHORS RE-RESOLVED ON THIS TREE (each one grepped here, not trusted from author time):**

- `src/config.js` :723 `RUN: {` — `LIMIT` :724 = 1800, `FINAL_CALL_AT` :725, `SURVIVED_BONUS` :726, `DEPTH_BONUS` :727 = 150, `MAW_HP` :728, `MAW_WINDOW` :729, `MAW_CLEAR_BONUS` :730, `MAW_UNLOCK` :731.
- `src/config.js` :742 `LADDER: {` — `WAVE_SECONDS` :743 = 120, `WAVES` :744 = 15, `KNEE_TICK` :746 = 8; the `floor(t/30)` escalation-tick doc comment is :734-741.
- **Escalation model:** `export function ladderHp` `src/config.js` :886 and `export function ladderDmg` :894, each `_tickCurve(ESCALATION.HP|DMG, min(w, KNEE_TICK)) * LADDER.HP_LATE|DMG_LATE ** max(0, w - KNEE_TICK)`. Consumption sites in `src/main.js`: :735 (`ladderHp(w) / hpScale(w)`), :1298 (`C.ENEMY.BASE_HP * ladderHp(w) *`), :1849 (`ladderDmg(Math.floor(state.time / 30)) *`). **The author-time anchor `enemyHpMult(t)` DOES NOT EXIST on this tree** (drift was recorded at tick 71 and it is still absent) — do not grep for it.
- **Win path:** `function runSurvived()` `src/main.js` :3291 with `state.runWon = true` :3295; the limit check `if (state.time >= C.RUN.LIMIT) { runSurvived(); return true; }` :3345; the `survived:` save flag :3226; the HUD clock line :1102.
- **THE FRESH-ARM KILLER:** `CHASER` `src/enemy_types.js` :37-38 — `hpMult 1.0, speedMult 1.0, sizeMult 1.0, contactDamageMult 1.0` (contact damage = the shared base x that multiplier). `CONFIG.ENEMY.BASE_SPEED` `src/config.js` :107 = 56; `BASE_HP` `src/config.js` :111 = 144.
- **CORRECTION TO THE BODY'S SEAM REFERENCE.** The one-run-per-process seam is **NOT** a `--run` flag on `tools/real_loop.mjs` — that module is a library (`export async function bootReal(stage)` :109, `runRealCohort(stage, n)` :113) and has no CLI. The seam is **`node tools/run_curve.mjs --run <stage> --seed <s> --out <log>`**: `tools/run_curve.mjs` :16 is the usage line and :37-71 is the ONE-run-per-process path, which drives the EXISTING `tools/real_loop.mjs` harness and appends the `REC {...}` json line the reporter reads. **Use THAT seam. Do not build a second harness and do not add a CLI to `real_loop.mjs`.**
- **Slice 1's raw BEFORE arm is already on disk:** `/tmp/g18_curve/fresh_{101,102,103,104}.log` and `/tmp/g18_curve/partial_{201,202,203,204}.log`, each ending in a `REC {...}` line (fresh `320.5g / 9.0s`, partial `345.3g / 30.0s`). Feed your new logs to the reporter alongside these so before/after is printed by one instrument.
- **Reporter baseline re-run by the dispatcher just now, rc=0** (`node tools/run_curve.mjs`, no args): fresh gold/hour **51052**, partial **21314**, maxed **1509378**; ratio lines partial-vs-fresh length **x2.28** gold/hour **x0.42**, maxed-vs-partial length **x68.18** gold/hour **x70.82**. That no-arg path reads `MEASURED` from `tools/economy_ledger.mjs` (baseline source line printed by the reporter); pass your own `--out` logs to have YOUR runs printed with their divisor.
- **GATE STATUS: OPEN.** Slice 1's verdict (quoted verbatim in the DATA block above) is **(b) a genuinely lethal fresh state created by the 2026-09-13 enemy buff** (commit `4202a08`: `BASE_HP` 12 -> 144, damage squared, `BASE_SPEED` 28 -> 56) — not a probe-policy artifact. So this slice IS allowed to turn a dial. The one unseparated variable (AUTO pilot dodging vs a human hand) goes in the report as a COULD-NOT-VERIFY line, **not** as a reason to stop.
- **60-SECOND CAP COMPLIANCE (per command, owner-ordered):** every run through the seam above is its own process and a fresh run is ~5-30 s wall per `/tmp/g18_curve/*.log` (a partial ~24-39 s) — chunk a >= 3-seed arm as separate commands, never one long cohort. The maxed stage (1800 s wall) is **NOT re-run at all** — quote `MEASURED.maxed` and `/tmp/g17_1b/maxed_r1.log`. Never run two suites concurrently (a concurrent suite clobbers `/tmp/hordes_suite/<file>.log` and reads as a false red).
- **THE LANE:** `cli:glm-hordes-g8`, and this brief is the only task on it. kimi/claude lanes are metered out (they share ONE 7-day meter and return 403) — do not wait on them and do not re-probe.

# G18 SLICE 2 - THE EARLY-RUN FLOOR: MAKE RUN LENGTH MONOTONE IN DEVELOPMENT (measured, one dial at a time)

Goal it serves: **G18 - RUN LENGTH MUST BE A PROGRESSION AXIS** (docs/HORDES_GOALS_2026-09-12.md
:2464 and :2603, marked "NOW THE TOP STRUCTURAL PRIORITY", still `open`). Slice 1 measured the curve and
changed nothing; this slice is the first one allowed to turn a dial.

## GATE - READ THIS BEFORE PLANNING ANY WORK

This slice is **gated on slice 1's report** (tools/run_curve.mjs output + the >= 3 raw fresh runs + the
two-sentence fresh-arm verdict). The dispatching pilot pastes slice 1's reported curve and its verdict
into the DATA block below before issuing. **If that verdict says the ~11.6 s FRESH arm is a POLICY
ARTIFACT (the probe bot dies because the harness's own policy is bad, not because the fresh state is
lethal), then STOP: report that and do no tuning.** Tuning a curve the probe cannot play honestly is how
a balance change gets justified by a measurement of the wrong thing. In that case the correct next slice
is the POLICY fix inside tools/real_loop.mjs - say so, with the quoted evidence, and end the run.

## HOUSE RULES (binding, same as every slice)

- **ONE WRITER PER FILE.** New work goes in NEW files. src/main.js is not to be restructured.
- **NO git state commands** (commit/checkout/reset/stash/clean). Leave the tree dirty and report the dirty count.
- **NO EMOJIS. Integer pixels. 60Hz AND 120Hz both correct** - nothing may assume a fixed dt.
- **THE OWNER'S STANDING 60-SECOND CAP.** No single sim or measurement command may exceed 60 s of wall
  clock. Cohorts are CHUNKED: one process per run, through the EXISTING tools/real_loop.mjs seam
  (--run <stage> --seed <s> --out /tmp/g18_curve2/<stage>_<seed>.log). Do NOT build a second harness.
  The maxed stage (1800 s wall) is **NOT re-run at all** - quote MEASURED.maxed and the existing
  /tmp/g17_1b/maxed_r1.log.
- Append a timestamped line to /tmp/g18_floor_progress.log BEFORE and AFTER every step that can exceed a
  few seconds.
- Never run the suite concurrently with another suite.
- **EVIDENCE DISCIPLINE:** every number in the report is quoted from a raw log, never retyped from
  memory. A builder's self-report is a claim; the numbers must be greppable.
- Full suite after the work: bash tools/run_suite.sh must end redfiles=0. Tests may be retargeted
  (file+line+why) but never weakened, deleted or no-op'd.

## DATA - MEASURED CURVE (pilot values in brackets are read-only readings from this tree, 2026-09-15 ~22:00 UTC, no lock held; the dispatching pilot REPLACES them with slice 1's reported curve)

- **Reporter baseline** (node tools/run_curve.mjs, run by the pilot on this tree):
  [fresh] n=8 seeds=1337 goldMean=164.5 lenMeanS=11.6 gold/hour=51052 tier=0 (INCOME_TIERS[0]=70g/run);
  [partial] n=8 goldMean=156.3 lenMeanS=26.4 gold/hour=21314 tier=1 (100g/run);
  [maxed] n=1 goldMean=754689 lenMeanS=1800.0 gold/hour=1509378 tier=3;
  ratios: partial vs fresh length x2.28, gold/hour x0.42; maxed vs partial length x68.18, gold/hour x70.82.
  **NOTE THE DIRECTION: gold per HOUR goes DOWN from fresh to partial on this baseline - the opposite of
  a progression curve. That is itself a finding to carry into G17's repricing.**
- **Slice 1's own new raw runs** (in /tmp/g18_curve/, written by the builder, pilot-read):
  fresh seeds 101/102/103/104 = time=5s, 7s, 6s, 18s, all wave=1, all cause=contact:CHASER,
  kills=0,0,0,1, gold=320,320,320,322, hp=130;
  partial seeds 201/202/203/204 = time=39s, 24s, 22s, 35s, killer=SWARMER,CHASER,CHASER,CHASER,
  kills=28,12,6,17, gold=364,340,330,347, hp=250.
  Source to paste at dispatch: [slice 1's FULL reporter output, verbatim].
- **SLICE 1 VERDICT - PASTED BY THE DISPATCHING PILOT, QUOTED VERBATIM** (builder's done: post
  msg_01M2KGZTTYAD3ZG6H0VB8632MN, 2026-09-15T21:53:53Z; full report msg_01M2KH04JP5MJ06FWH2HRT0AFC):
  "The policy arms NEVER act before death - no run reaches a level-up draft or a boss, so the overlay
  card policy and the q/e skill policy are both dormant and the only actor is the game's own AUTO pilot,
  which is the same pilot that measured 204.8-277.8s fresh runs on 2026-09-13 before commit 4202a08
  (owner enemy buff: BASE_HP 12->144, damage squared, BASE_SPEED 28->56; today's CHASERs run 56px/s vs
  the fresh hero's 60px/s with ~65 contact vs 130hp, two converge by t=5s). The evidence therefore
  supports (b) a genuinely lethal fresh state created by the 2026-09-13 enemy buff, not a policy
  artifact; the only unseparated variable is AUTO-pilot dodging vs a human player, which this slice
  cannot A/B (old code unreachable without git state commands)."
  **GATE RESULT: (b). THE GATE IS OPEN - tune the EARLY-RUN FLOOR, one dial at a time. Do NOT spend this
  slice on a real_loop.mjs policy fix.** Carry the unseparated variable (AUTO pilot vs a human hand) into
  the report as a COULD NOT VERIFY line, not as a reason to stop.
- **SLICE 1'S OWN REPORTER OUTPUT, PASTED VERBATIM** (same done: post): fresh n=4 seeds=101,102,103,104
  goldMean=320.5 goldMedian=320 lenMeanS=9.0 lenMedianS=6.5 -> gold/hour=128200 (DIVISOR 320.5/9.0s);
  partial n=4 seeds=201,202,203,204 goldMean=345.3 goldMedian=343.5 lenMeanS=30.0 lenMedianS=29.5 ->
  gold/hour=41430 (DIVISOR 345.3/30.0s); maxed NOT re-run (60s cap): MEASURED.maxed n=1 seed=1337
  754689g/1800s = 1509378g/hour, raw /tmp/g17_1b/maxed_r1.log; ratios partial vs fresh length x3.33
  gold/hour x0.32, maxed vs partial length x60.00 gold/hour x36.43. Suite verbatim: TREE @ 0c13b08 |
  dirty=25 | SUITE greenfiles=98 redfiles=0, REDLIST empty (pre-edit dirty=24, redfiles=0).
- **PILOT VERIFICATION, INDEPENDENT, READ-ONLY, NO LOCK HELD** (2026-09-15T22:14:16Z): tools/run_curve.mjs exists on
  the tree (8697 bytes, untracked) and this pilot re-ran it directly: it reproduces the reported baseline
  exactly - fresh 51052, partial 21314, maxed 1509378 gold/hour, rc=0. The suite was NOT re-run by the
  pilot: the builder is mid-task on the owner's shop-latency bug and a second suite may not run
  concurrently. Slice 1's cohort numbers are the builder's claim, read from /tmp/g18_curve/*.log and the
  done: post, NOT re-measured by this pilot.
- **Owner's approved model** (docs/HORDES_GOALS_2026-09-12.md :2606, owner-confirmed 2026-09-12, DO NOT
  REOPEN): early runs die at **3-6 min (180-360 s)**; survival is the **earned progression gate**; a
  developed player **approaches the 30:00 limit**; completed run target **8-12 min** (~10 working);
  cadence = one wave per minute + an enemy scaling ramp + a boss/elite beat every ~2-3 min. The 11.6 s /
  5-18 s fresh arm is therefore **an order of magnitude below the approved floor**, and that gap - not
  the late game - is the defect this slice exists to close.
- **Structure already exists, do not re-invent it:** src/config.js RUN.LIMIT 1800, RUN.WAVES 15,
  RUN.DEPTH_BONUS, MAW_HP / MAW_WINDOW / MAW_UNLOCK; the escalation model is ladderHp / ladderDmg
  (src/config.js ~:894, consumed in src/main.js ~:1849 - the author-time anchor enemyHpMult(t) no longer
  exists on this tree); the RUN SURVIVED win is runSurvived() src/main.js :3291 with the limit check at
  :3345 and state.runWon :456.

## SCOPE - WHAT TO BUILD (in this order, and stop where the evidence says stop)

1. **COMPONENT TABLE FIRST - diagnose, do not tune.** With the fresh profile at t=0 (hp 130) produce a
   MEASURED table of what actually kills in 5-18 s: time-to-first-contact, CHASER contact damage per hit
   against 130 hp, enemy speed vs player speed, and the wave-1 spawn cadence. Instrument with read-only
   prints if a datum is unreadable from outside (name the file+line). A component table is an acceptable,
   complete deliverable on its own.
2. **Turn the SMALLEST dial set, ONE DIAL AT A TIME.** Candidate dials: fresh hp, CHASER contact
   damage/speed, wave-1 spawn cadence, the first rungs of ladderHp/ladderDmg. Make ONE change, then
   measure it: >= 3 fresh seeds through the --run path (chunked, one process per run), fed to the
   reporter with the new logs so the divisor is printed out loud. Record before/after lenMeanS and
   before/after gold per hour per dial, in a table.
3. **Report the curve shape after the changes:** fresh lenMeanS, partial lenMeanS, the ratio lines, and
   the per-hour line for each stage. The late game is verified by quote only (maxed NOT re-run).
4. **Do not chase the target by stacking dials.** If the 180-360 s floor cannot be reached by ONE dial
   moved by at most 2x, STOP, report the component table plus the best measured single-dial result, and
   name the structural blocker. That is a design signal for the owner, not a reason to keep turning
   knobs. Never weaken the suite to land a change.

## NON-GOALS / DO NOT TOUCH

- **No price, tier or drop tuning** - INCOME_TIERS and prices belong to G17's repricing. This slice
  REPORTS gold per hour; it does not set it.
- **No wave-ladder extension beyond what the floor requires** - the 15-wave / 1800 s structure stands.
- **Do not edit src/portal_cine.js, src/escape/* or src/death_cine.js** - G15 / V1b / V1c / G16 landed
  there and await the orchestrator's commit.
- No art, no new content, no new UI.

## DISPATCH ANCHOR CHECK (the dispatching pilot resolves every line IN PLACE at issue time and splices the filled block here; trust the SYMBOL, not the number)

- grep the RUN config block in src/config.js -> LIMIT / WAVES / DEPTH_BONUS / MAW_* on the live tree.
- grep ladderHp and ladderDmg across src/config.js and src/main.js -> the escalation model and its ONE
  consumption site.
- grep "function runSurvived", "state.runWon", "C.RUN.LIMIT" in src/main.js -> must exist (:3291 / :456 /
  :3345 as of tick 71; re-resolve).
- grep CHASER in src/enemy_types.js -> the fresh-arm killer's stats (damage, speed, radius).
- grep the --run flag in tools/real_loop.mjs -> the single-run seam this slice must reuse.
- bash tools/run_suite.sh FIRST -> if it is red before any edit, STOP and post blocked: with the raw
  line; do not build on a red tree.

## ACCEPTANCE BAR (all five; a null with the blocker named is acceptable, a weakened assertion is not)

1. bash tools/run_suite.sh -> redfiles=0, banner quoted verbatim.
2. The component table is present with raw quoted lines behind every claim.
3. After the change: node tools/run_curve.mjs <new logs> prints fresh lenMeanS inside the owner's
   **180-360 s** band, with the divisor printed out loud - or a stated null plus the single-dial result
   and the named structural blocker. Partial must remain LONGER than fresh; both ratios printed.
4. **REAL-BROWSER proof the game still plays** (a number in a log is not evidence for what a player looks
   at): 390x844 @dpr3, all 19 TOUR_KEYS set, state.time > 1.0 asserted BEFORE measuring, PNG exactly
   1170x2532, zero console errors, and the screenshot READ by the builder - report what is on screen,
   not what the code says.
5. Report explicitly what could NOT be verified.

## REPORT FORMAT (post done: or blocked: to hordes FIRST, then the evidence, then end the run cleanly)

- TREE /home/claude/projects/hordes @ <HEAD> | dirty=<n>, and the suite banner verbatim.
- BEFORE/AFTER table: dial, old value -> new value, n seeds, lenMeanS, gold per hour, source log path.
- The reporter block verbatim (both stages + the ratio lines).
- Files touched (new files named), the dirty count, and an explicit COULD NOT VERIFY section.
