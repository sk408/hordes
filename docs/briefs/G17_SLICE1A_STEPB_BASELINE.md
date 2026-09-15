# G17 SLICE 1a - STEP B: FILL THE PARTIAL + MAXED BASELINE (AND MAKE A LONG RUN NEVER SILENT)

**Slice:** G17 slice 1a, STEP B (the remainder of slice 1a). STEP A landed and the pilot verified it
on the artifact this tick (2026-09-15 13:47 UTC). This is a MEASUREMENT task: it changes NO price, NO
payout and NO game behaviour. Slice 1b (the actual REPRICE, `docs/briefs/G17_REPRICING.md` item set) and
slice 2 (`/tmp/hordes_briefs/G17_SLICE2_BREADTH.md`) are NOT in this task.
**Builder:** `cli:glm-hordes-g8` (the live lane; the kimi lane is on a 7-day provider wall).
**Anchors measured ON THIS TREE THIS TICK:** HEAD `18eaa8b`, dirty=3, suite re-run by the pilot this tick.
**Read FIRST:** `docs/HORDES_GOALS_2026-09-12.md` :2356 (the authoritative G17 entry), :2548-2551 (the
"no measurement tool may sit silent for minutes" rule) and `docs/briefs/G17_SLICE1A_MEASURE.md` item 2.

## WHAT ALREADY EXISTS (measured on this tree this tick, not remembered)

- **STEP A LANDED, PILOT-VERIFIED:** `tools/economy_ledger.mjs` now logs ONE LINE PER FINISHED RUN
  through the harness's existing `onRun` hook - `:166-174` (comment + `onRun:` option + the print), fed
  by `tools/real_loop.mjs` :139 (option), :210 (`if (onRun) onRun(rec, r);`). `node --check` OK.
  Raw evidence: `/tmp/g17_1a/fresh_n4_seed1337.log`; heartbeat `/tmp/g17_1a_progress.log`.
- **`MEASURED` is at `tools/economy_ledger.mjs` :57-62** and currently reads:
  `fresh: { n: 4, seed: 1337, goldMean: 258.5, goldMedian: 321, lenMeanS: 13.3, tier: 0 }`,
  `partial: { n: 0, seed: 0, goldMean: 0, goldMedian: 0, lenMeanS: 1, tier: 1 }`,
  `maxed: { n: 0, seed: 0, goldMean: 0, goldMedian: 0, lenMeanS: 1, tier: 3 }`.
- **THE LEDGER STILL THROWS, so nothing downstream can start.** Pilot ran `node tools/economy_ledger.mjs`
  this tick, raw tail:
  `Error: economy_ledger: no measured baseline for stage maxed` at `:69` (`goldPerHour`) ->
  `ledger` `:114` -> `printLedger` `:127` -> `:192`. Filling `partial` + `maxed` is what unblocks it.
- **A COMPLETE n=8 COHORT FOR BOTH fresh AND partial ALREADY EXISTS ON DISK** - produced by the dispatch
  the goals doc wrongly recorded as "zero tokens, nothing landed". Read these two files before running
  anything; they are the reproducibility targets:
  - `/tmp/g17_measure_fresh.log` (12:29:23 UTC, complete 8 runs + BASELINE):
    `BASELINE fresh: n=8 seed=1337 goldMean=164.5 goldMedian=71 lenMeanS=11.6 won=0/8`
  - `/tmp/g17_measure_partial.log` (12:29:43 UTC, complete 8 runs + BASELINE):
    `BASELINE partial: n=8 seed=1337 goldMean=156.3 goldMedian=98 lenMeanS=26.4 won=0/8`
  The cohort is SEED-DETERMINISTIC: runs 1-4 of that fresh n=8 log (gold 320/322/70/322, times
  7/16/8/22) are byte-identical to the pilot's independent n=4 run `/tmp/g17_1a/fresh_n4_seed1337.log`.
  So a re-run of the same seed MUST land on the same numbers, and that agreement is your proof.
- **THE MAXED STAGE IS A ~35 MINUTE WALL RUN, MEASURED:** `/tmp/g17_maxed_start` = `1789476899`,
  `/tmp/g17_maxed_end` = `1789478999` => **2100 s wall for ONE maxed run**, and
  `/tmp/g17_measure_maxed.log` contains only its header line - no run line ever appeared. That silence
  is exactly what got slice 1a watchdog-killed twice (`exit -9`, `zero progress (cpu+log+files) for 900s`).
- **WHY IT IS SLOW, AND WHAT YOU MAY NOT DO ABOUT IT:** `tools/real_loop.mjs` :143-210 drives a pure
  headless fixed-step loop - `capFrames = Math.floor(maxSeconds * 60)` (:146), `h.dom.advance(dtMs)` per
  frame. The 1860 s cap is **111 600 frames** at ~0.75x real time. There is no throttle to remove and no
  honest fast-forward. **DO NOT change `dtMs`, the frame count, or the cap.** A run that reaches the cap
  is a COMPLETE run, not a censored one (:196-199 records `won: true, time: CFG.RUN.LIMIT`); a truncated
  run banks `gold=0` and is NOT a valid baseline. Changing `dt` would change spawn/death behaviour and
  would make the divisor a measurement of nothing.
- **Payouts are FROZEN** (`GOLD_TIER` `src/meta.js` :271, `RUN_GOLD` :167, purse, per-kill credit, chest
  values). This task must not touch `src/` at all. `APEX_UPGRADES` (`src/meta.js` :629) is never repriced.
- **Owner design intent, do not "fix" it:** players lose most runs early. `won=0/8` on fresh and partial
  is CORRECT, not a bug to tune away.

## THE GAP THIS TASK CLOSES

`MEASURED` is the DIVISOR for every hours figure the reprice will be judged against, and it is 2/3 empty.
Fill it with real numbers, from re-runs that prove reproducibility, and make a 35-minute run observable
while it happens so it cannot be killed as a flat log again.

## ITEMS (do them in this order; print a line before and after each)

1. **MID-RUN PROGRESS IN THE EXISTING LOOP (the anti-wedge fix).** Add an option `onProgress` to
   `runRealCohort` in `tools/real_loop.mjs` and call it from INSIDE the existing `for (let i...)` loop
   (:147-190) - every 600 frames (10 sim-seconds) is right, printing
   `run <r>: t=<Math.floor(st.time)>s wave=<st.wave.num> hp=<st.player.hp> mode=<st.mode>`; and call it
   once at frame 0 so a run's log line exists immediately. **NEVER add a second frame loop, a second
   `advance` call, or a second rAF queue.** Wire `tools/economy_ledger.mjs` `measure()` to pass it, so
   `--measure` output is a live log: header line, then `run r: t=...` lines, then the per-run
   `run N/n: time=.. wave=.. gold=..` line from the existing `onRun` hook, then `BASELINE ...`.
   Default `onProgress = null` keeps every other existing caller (:138-139) untouched.
2. **fresh n=8 and partial n=8, ONE PROCESS PER STAGE**, output redirected to files under `/tmp/g17_1b/`:
   `timeout 600 node tools/economy_ledger.mjs --measure fresh 8 1337 > /tmp/g17_1b/fresh_n8_seed1337.log 2>&1`
   `timeout 900 node tools/economy_ledger.mjs --measure partial 8 1337 > /tmp/g17_1b/partial_n8_seed1337.log 2>&1`
   (pilot-measured: fresh 8 is ~2 min wall, partial 8 is ~5 min wall). Their `BASELINE` lines MUST
   reproduce the two targets above exactly - paste both pairs (target vs re-run) side by side. If a
   number differs, STOP, paste the raw run lines, and report it as a reproducibility failure.
3. **Fill `MEASURED`: `.fresh` = the n=8 numbers (n: 8, seed 1337, goldMean/goldMedian/lenMeanS from the
   re-run `BASELINE` line, tier 0) and `.partial` likewise (tier 1).** Change NOTHING else about the
   table's shape; the header comment says these are records of measurement, not intent knobs.
4. **maxed, ONE RUN PER PROCESS, in the BACKGROUND under an explicit timeout, with a heartbeat.** Start
   the run, then poll it, because it is ~35 min of wall clock:
   `mkdir -p /tmp/g17_1b; nohup timeout 2700 node tools/economy_ledger.mjs --measure maxed 1 1337 > /tmp/g17_1b/maxed_r1.log 2>&1 &`
   plus a file-side heartbeat so the log keeps moving even if the model is quiet:
   `( while sleep 60; do echo "$(date +%T) hb" >> /tmp/g17_1b/heartbeat_maxed.log; done ) &`
   Then EACH wait must be its own command of 240 s or less that prints something, e.g.
   `sleep 240; date +%T; tail -c 300 /tmp/g17_1b/maxed_r1.log` - repeat until the log shows a `BASELINE`
   line or the process is gone. The `onProgress` lines from item 1 are what prove it is alive: a
   `t=`-counter that stops advancing for >120 s IS a hang - kill that run, report the sim time/wave/mode
   it died in, and do not fight it. Target n=3; **n=1 is an acceptable honest result** if wall time
   blows out. Hard stop on the whole item at 100 min of your own wall clock: keep what you have.
   Fill `MEASURED.maxed` from the run(s) you actually got (`n` = the real count, `seed: 1337`,
   goldMean/goldMedian/lenMeanS from the `BASELINE` line, `tier: 3`) and report the per-run wall time.
5. **PROVE IT:** `node --check tools/economy_ledger.mjs tools/real_loop.mjs` and
   `node tools/economy_ledger.mjs` must print THE WHOLE LEDGER with no throw. Paste that output in full:
   the catalogue total + item count, the MID/TOP/other partition, the divisor line, the CAP VIOLATIONS
   list (it may legitimately be empty under today's prices - that is the BEFORE reading slice 1b must
   beat) and the catalogue-hours line.

## WHAT TO REPORT BACK (raw output, not intentions)

1. `checkpoint:` to the hub channel FIRST, then: the item-1 diff as `file:line`; the four `BASELINE`
   lines (fresh target/re-run, partial target/re-run) and the maxed line with its n and each run's wall
   seconds; proof the log grew DURING the maxed run (at least three `t=` progress lines with increasing
   `t`, plus the tail of the heartbeat file); `node tools/economy_ledger.mjs` raw output in full; every
   file and line changed; the dirty count; the statement that no git state command was run; and a
   **COULD NOT VERIFY** section. Do not report intentions.

## HOUSE RULES (binding)

- No `git commit/checkout/reset/stash/clean` - leave the tree dirty and REPORT the dirty count.
- Never weaken or delete an assertion; touch no test file. If something goes red, report the red.
- **Do not run `tools/run_suite.sh`** - the pilot owns that reading, and a concurrent suite clobbers
  `/tmp/hordes_suite`.
- No emojis in any UI or DOM string. Reuse the existing harnesses; do not author a second ledger.
- ANTI-WEDGE PROTOCOL: your FIRST action is `date +%T >> /tmp/g17_1b/heartbeat.log`. No single command
  may block longer than 300 s except the single backgrounded maxed run (item 4). If any command has not
  returned in 300 s, kill it and post `blocked:` with what you have - never hang. A smaller honest n
  beats a hung process.
