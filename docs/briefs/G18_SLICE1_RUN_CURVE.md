## FILLED DISPATCH ANCHOR CHECK (goal-pilot tick 71, 2026-09-15 21:45 UTC, HEAD `0c13b08` dirty=23 — the pilot RE-RAN every anchor below on the LIVE tree at dispatch and all of them HOLD) — SUPERSEDES EVERY LINE NUMBER BELOW

- `bash tools/run_suite.sh` run BY THE PILOT at dispatch time => `TREE: /home/claude/projects/hordes @ 0c13b08 | dirty=23`, `SUITE greenfiles=98 redfiles=0`, REDLIST empty. The brief's STOP CONDITION is CLEAR: `src/death_cine.js` (G15), `src/escape/*` (V1b/V1c), `test/test_death_screen.mjs` and `test/test_v1_escape.mjs` are ALL GREEN on this tree. Still run the suite FIRST yourself; if it is red, post `blocked:` and do not build on it.
- Run structure — the brief's numbers HOLD UNCHANGED: `src/config.js` :724 `LIMIT: 1800`, :727 `DEPTH_BONUS: 150`, :728 `MAW_HP: 2_500_000`, :729 `MAW_WINDOW: 90`, :731 `MAW_UNLOCK: 'HYPER'`, :744 `WAVES: 15`.
- Survived / end-of-run path — HOLDS: `src/main.js` :3291 `function runSurvived()`, :3295 `state.runWon = true`, :3306 the lead text, :3345 `if (state.time >= C.RUN.LIMIT) { runSurvived(); return true; }`, :3353 `endRun()`, :3394 `die()`, :456 `runWon: false`.
- Instrument — HOLDS: `tools/economy_ledger.mjs` :57 `MEASURED` = :58 fresh `n:8 seed:1337 goldMean:164.5 goldMedian:71 lenMeanS:11.6 tier:0`, :59 partial `n:8 156.3/98/26.4 tier:1`, :60 maxed `n:1 754689/754689/1800 tier:3`; :67 `goldPerHour(stage)` (the divisor IS the measured length); :170 and :176 the `onRun` hook; :181 `onProgress`.
- Harness — HOLDS: `tools/real_loop.mjs` :142 `onRun(record, i)`, :143 `onProgress(r, st)` fired from INSIDE the single frame loop :162, :151 `maxSeconds = CFG.RUN.LIMIT + 60`, :210-222 the record shape (`cause: 'RUN SURVIVED'` on a win), :225 the `onRun` call site.
- ONE DRIFT, recorded not hidden: the brief's author-time escalation anchor `enemyHpMult(t)` (author-time `src/config.js` ~:885) DOES NOT EXIST on this tree — the escalation model is now `ladderHp` / `ladderDmg` (`src/config.js` :894 `export function ladderDmg(w)`, consumed at `src/main.js` :1849 via `ladderDmg(Math.floor(state.time / 30))`). Nothing in this brief's deliverables reads it; it is noted so the builder does not hunt a dead symbol.
- FREEZE COMPLIANCE (the owner's standing 60-second measurement cap — the brief's chunked path IS the intended compliance, restated so there is no doubt): no single sim or measurement command may exceed 60 s of wall clock; ONE run per process through the brief's own `--run <stage> --seed <s> --out <log>` path; **maxed (1800 s wall) is NOT re-run** — quote `MEASURED.maxed` and the existing raw `/tmp/g17_1b/maxed_r1.log` instead; fresh/partial re-measured at n >= 4 with seeds PRINTED. Never run the suite concurrently with another suite.
- The tree is UNCOMMITTED and dirty=23 (the orchestrator owns commits). NO git state command. Do NOT edit `src/portal_cine.js`, `src/escape/*` or `src/death_cine.js` — G15 / V1b / V1c / G16 work landed there and is awaiting commit.
- Append a timestamped line to `/tmp/g18_curve_progress.log` BEFORE and AFTER every step that can exceed a few seconds.

# G18 SLICE 1 — THE RUN-LENGTH CURVE AND INCOME PER HOUR, MEASURED (instrumentation only)

Goal it serves: **G18 — RUN LENGTH MUST BE A PROGRESSION AXIS**, marked in
`docs/HORDES_GOALS_2026-09-12.md` as *"NOW THE TOP STRUCTURAL PRIORITY"* and still `open`.
It also unblocks G5, which the owner answered on 2026-09-15 and which is *"blocked on TOOLING ONLY"*.

## HOUSE RULES (binding on this slice, same as every slice)

- **ONE WRITER PER FILE.** Anything new goes in a NEW file. `src/main.js` is not to be restructured.
- **NO git state commands** (`commit/checkout/reset/stash/clean`). Leave the tree dirty and report the dirty count.
- **NO EMOJIS. Integer pixels. 60Hz AND 120Hz both correct** — nothing may assume a fixed dt.
- **THE OWNER'S STANDING 60-SECOND MEASUREMENT CAP.** No single sim or measurement command may exceed
  60 s of wall clock. Long cohorts are CHUNKED: one process per run, an append-only heartbeat line
  BEFORE every long step (`/tmp/g18_curve_progress.log`). Never raise a timeout; never let a run wedge
  -- the watchdog kills zero-progress tasks at 900 s.
- **THIS SLICE DOES NOT TUNE ANYTHING.** No price, hp, spawn rate, drop rate, `CONFIG.RUN.WAVES`,
  `CONFIG.RUN.LIMIT` or ladder change. **An ugly number, or a null, is an acceptable and reportable
  finding.** The only edits allowed in `src/` are a one-line print hook if a datum the report needs is
  genuinely unreadable from outside -- name the file+line if you use one.
- **Evidence discipline:** every number in the report must be quoted from a raw log, not retyped from
  memory. Post `done:` / `blocked:` to `hordes` FIRST, then the evidence.
- Full suite after the work: `bash tools/run_suite.sh` must end `redfiles=0`. A test may be retargeted
  (file+line+why) but never weakened, deleted or no-op'd.

## MEASURED STATE AT AUTHOR TIME (2026-09-15 ~20:10 UTC, re-resolve every anchor at dispatch)

- Tree `@ 5149036 dirty=7` WHILE THE LANE WAS MID-WRITE on G15 (`src/death_cine.js`, `src/main.js`,
  `test/test_death_screen.mjs`). **Every line number below is a symbol hint, not a contract: trust the
  SYMBOL.** If the tree is red or mid-write when you start, see DISPATCH ANCHOR CHECK.
- **The run structure G18 worried about already EXISTS** (this is why slice 1 is measurement, not
  construction): `src/config.js` `RUN.LIMIT: 1800` (:724, "30:00 of PLAY time"), `RUN.WAVES: 15`
  (:744, "15 x 120s = 1800s"), `DEPTH_BONUS: 150` (:727), `MAW_HP: 2_500_000` (:728),
  `MAW_WINDOW: 90` (:729), `MAW_UNLOCK: 'HYPER'` (:731); escalation `enemyHpMult(t)` around :885;
  spawner/ladder wiring :947. The RUN SURVIVED win is `runSurvived()` `src/main.js` :3291 with the
  limit checked at :3345 (`state.time >= C.RUN.LIMIT`), `state.runWon` :456, bonus form :3288.
- **The instrument that already reads the curve:** `tools/economy_ledger.mjs`
  `MEASURED` :57-61 --
  `fresh:   { n: 8, seed: 1337, goldMean: 164.5, goldMedian: 71, lenMeanS: 11.6,  tier: 0 }`,
  `partial: { n: 8, seed: 1337, goldMean: 156.3, goldMedian: 98, lenMeanS: 26.4,  tier: 1 }`,
  `maxed:   { n: 1, seed: 1337, goldMean: 754689, goldMedian: 754689, lenMeanS: 1800, tier: 3 }`.
  gold/hour is `goldPerHour(stage)` :64-78 = `goldMean / lenMeanS * 3600` (the divisor IS the measured
  length, deliberately); the end-game rate is printed at :136; the cohort hooks are `onRun` :176 and
  `onProgress` :181; raw logs from the G17 pass are under `/tmp/g17_1b/`.
- **The harness:** `tools/real_loop.mjs` -- `onRun(record, i)` :142, `onProgress(r, st)` :143 fired from
  inside the one frame loop :162, the overlay auto-play policy :170-190 ("only ever picks cards"),
  the `RUN SURVIVED` record shape :215, the `onRun` call site :225. Records carry
  `time / wave / cause / killer / won`.
- **THE OPEN FINDING THIS SLICE EXISTS TO SETTLE.** `MEASURED.fresh` reads a **11.6 s mean run**
  (median 71 g). The owner-approved model for a FRESH profile is **death at 3-6 minutes**. That is a
  **16-31x gap**, and the ledger prices the mid-tier share and the catalogue hours off it. Either the
  fresh arm is measuring something degenerate (policy / profile state / a run that ends on a non-death
  cause) or G5's difficulty bar does not hold at the fresh end. **Establish which, by measurement, and
  do not "fix" either one in this slice.**

## SCOPE — WHAT TO BUILD (three deliverables, all inside the 60 s cap)

1. **`tools/run_curve.mjs` — the curve reporter. ONE command, no sims by default, must finish in well
   under 60 s.** It reads `MEASURED` from `tools/economy_ledger.mjs` AND any per-run logs given on the
   command line, and prints, per stage (`fresh|partial|maxed`):
   `n`, the seeds, `goldMean` and `goldMedian`, `lenMeanS` and `lenMedianS`, **gold per HOUR**
   (`goldMean / lenMeanS * 3600`), the GOLD_MODEL tier, and one ratio line per stage against the stage
   below (length AND gold/hour). It must print the divisor it used out loud, per stage, so the report
   can quote it. It must exit 0 and be readable by a human in the transcript.
2. **The chunked re-measurement path.** `node tools/run_curve.mjs --run <stage> --seed <s>
   --out /tmp/g18_curve/<stage>_<seed>.log` runs EXACTLY ONE run through the EXISTING
   `tools/real_loop.mjs` seams (the same overlay policy, the same record shape) and appends to
   `/tmp/g18_curve_progress.log` before and after. **One run per process, every process under 60 s of
   wall clock.** Do not build a second harness, do not copy `real_loop.mjs`, do not wrap a cohort in a
   single process.
3. **The fresh-arm diagnosis — measured, not argued.** From the NEW raw run logs, report for at least
   THREE fresh runs: `seed, time, wave, cause, killer` quoted verbatim, plus the PROFILE STATE the run
   was measured against (which meta upgrades exist and at what level, and whether the run is being
   driven by the overlay auto-play policy rather than a player). Then state, in two sentences, which of
   the two candidate explanations the evidence supports -- (a) the arm measures a policy artifact, or
   (b) a fresh profile genuinely cannot survive past ~12 s -- and say plainly if the evidence does not
   separate them.
   **OPTIONAL, only if (a) is indicated:** ONE disclosed control run with the auto-play policy's draft
   picks disabled, so the difference between "the bot picks badly" and "the state is lethal" is
   visible. Disclose it as a control, do not tune it, do not average it into the cohort.

## DO NOT

- Do not extend the wave ladder or touch the run structure -- that is G18 slice 2, gated on these
  numbers.
- Do not retune the ladder, prices, `INCOME_TIERS`, `MEASURED` values, or any difficulty constant.
  (Filling a `MEASURED` field from a raw log IS allowed -- it is a measurement constant, not a knob --
  but only from a log you produced this slice, and say so.)
- Do not overwrite or re-run the `/tmp/g17_*` jobs; write everything new under `/tmp/g18_*`.
- Do not run the suite concurrently with another suite (the `/tmp/hordes_suite` logs clobber and
  manufacture "no assertion line captured" reds). If a red has no `/tmp/hordes_suite/<file>.log`,
  re-run it once before believing it.

## ACCEPTANCE BAR (all seven, under the 60 s cap)

1. `bash tools/run_suite.sh` ends `redfiles=0`, with the `TREE ... @ <sha> | dirty=<n>` line quoted
   verbatim and the REDLIST (or its absence) stated.
2. `node tools/run_curve.mjs` rc=0 with the raw per-stage table pasted into the report: n, seeds,
   goldMean/median, lenMean/median, gold per HOUR, and the ratio lines.
3. fresh AND partial re-measured at **n >= 4 each**, seeds PRINTED, raw logs named per run, and the
   WALL TIME of every command stated.
4. The fresh death-cause table from item 3 of SCOPE, quoted from the raw logs, plus the two-sentence
   attribution verdict and an explicit "could not separate" if that is the truth.
5. Every retarget enumerated as file:line + why, and never weakened. If a one-line print hook was added
   in `src/`, name the file and line.
6. The report states, per stage, whether the measured length matches the OWNER'S MODEL -- fresh dies
   **3-6 min**, developed (~20 h) **occasionally reaches the 30:00 limit**, maxed reaches it
   **regularly** -- and states any mismatch as a FINDING. Nothing is fixed here.
7. Nothing visual changed (no new screen, no render edit, no HUD geometry), so no browser capture is
   required -- **state that explicitly** rather than leaving it silent. If any render file was touched,
   the phone bar applies: real-browser capture at 390x844 @dpr3 with all 19 TOUR_KEYS set and
   `state.time > 1.0` asserted BEFORE measuring, PNG path + ink numbers.

## DISPATCH ANCHOR CHECK (execute at issue time; every number re-resolved on the LIVE tree)

- `grep -n "LIMIT:" src/config.js`, `grep -n "WAVES:" src/config.js` -- both must still exist; if
  either is gone the run structure moved and this brief must be RE-SCOPED, not guessed at.
- `grep -n "function runSurvived" src/main.js`, `grep -n "C.RUN.LIMIT" src/main.js` -- must exist.
- `grep -n "MEASURED" tools/economy_ledger.mjs`, `grep -n "onRun\|onProgress" tools/real_loop.mjs` --
  both hooks must exist; if the hook names moved, use the symbols you find, do NOT add a second path.
- `bash tools/run_suite.sh` FIRST. **STOP CONDITION: if the suite is red on files another in-flight
  slice owns (`src/death_cine.js`, `src/escape/*`, `test/test_death_screen.mjs`, `test/test_v1_escape.mjs`),
  post `blocked:` and do not build on a mid-flight tree.**

## REPORT FORMAT

`done: G18 slice 1 -- <what landed>` (or `blocked: <task id> <reason>`), posted to `hordes` FIRST, then
the raw evidence: files touched with the final dirty count, the TREE + SUITE lines verbatim, the
`run_curve` table verbatim, every raw log path with its wall time, the fresh death-cause table, the
retarget list (or "none"), the FLAGS section (anything measured that contradicts a doc claim), and an
explicit **COULD NOT VERIFY** section. Then append the heartbeat's last line and END THE RUN cleanly.
