# G17 SLICE 1a - FINISH THE LEDGER: MEASURE THE BASELINE (THE DIVISOR) - BUILD BRIEF

**Slice:** G17 slice 1a (THE ECONOMY MUST REQUIRE A REAL GRIND). This is the FIRST of two halves of the
slice that ranked-queue item G17 owns; slice 1b (the actual REPRICE) is chartered separately and is NOT
in this brief. READ THE FULL G17 ENTRY FIRST: `docs/HORDES_GOALS_2026-09-12.md` :2349, and the parent
brief `docs/briefs/G17_REPRICING.md` (which is the executable half of slice 1).
**Builder:** whichever lane answers the dispatch probe (glm is the live lane; kimi is on the provider wall).
**Brief authored by:** the goal pilot, 2026-09-15 (tick 57). Every anchor below was MEASURED ON THIS TREE
THIS TICK unless it says otherwise. HEAD `c40abcb`, dirty=28, `SUITE greenfiles=92 redfiles=0`,
REDLIST empty - all three pilot-measured on this tree this tick.

## WHAT ALREADY EXISTS (measured on this tree, not remembered)

- `tools/economy_ledger.mjs` **EXISTS** (10317 B, written 11:04 by the previous attempt). `node --check`
  passes. So the parent brief's "the ledger does NOT exist" premise is SPENT - the ledger is written;
  what is missing is its BASELINE, and that is this slice.
- Running it now FAILS, raw:
  `Error: economy_ledger: no measured baseline for stage maxed`
  `at goldPerHour (tools/economy_ledger.mjs:69:45)` - because the `MEASURED` table at :58-62 is still the
  zero placeholder (`{ n: 0, seed: 0, goldMean: 0, goldMedian: 0, lenMeanS: 1, tier: 0 }` for all three
  stages) and `goldPerHour()` :67-70 throws when `n === 0`. Every other part of the tool is built:
  `ledgerRows()` :79, `ledger()` :96, `printLedger()` :125, and the `--measure` path :160-176.
- The measure path (`measure()` :160-176) is REAL and it WORKS - pilot-ran this tick, raw:
  `node tools/economy_ledger.mjs --measure fresh 2 1337` =>
  `run: time=7s wave=1 cause=contact:CHASER kills=0 gold=320` /
  `run: time=16s wave=1 cause=contact:CHASER kills=1 gold=322` /
  `BASELINE fresh: n=2 seed=1337 goldMean=321.0 goldMedian=321 lenMeanS=11.5 won=0/2`, 0.6s wall.
  It boots through the shared harness `runRealCohort` (`tools/real_loop.mjs` :138) - never a second loop.
- THE COST PROBLEM THAT KILLED THE LAST ATTEMPT (this is the whole reason this slice is separate):
  a MAXED run is long. Pilot-ran `--measure maxed 2 1337` this tick: killed by a 400s wall cap with NO
  output at all; `--measure maxed 1 1337` was still running at 4m13s wall, never having printed a line.
  And `measure()` :164-175 prints EVERYTHING ONLY AFTER the whole cohort resolves - so a big maxed
  cohort is a FLAT LOG for tens of minutes. The worker watchdog kills a task after 900s of zero
  progress (cpu+log+files all flat, design #62 §4.5); the previous attempt was killed exactly that way
  (`WEDGE: killed after 900s of zero progress`, task msg_01M2JBEAQE60AR4C60VQV6HB67, exit -9, twice).
  A flat log is therefore a DEFECT this slice must fix, not a nuisance.
- The harness ALREADY exposes an incremental hook: `runRealCohort(stage, runs, { maxSeconds, onRun })`
  - `onRun` is in the signature at `tools/real_loop.mjs` :138-139. USE IT. Do not add a second loop.

## THE GAP THIS SLICE CLOSES

The ledger cannot compute a single hour figure without a MEASURED baseline, because the whole point of
G17's ledger is that hours are `gold / (MEASURED run length)`, never `gold / RUN.LIMIT` (the owner's
target model in `docs/DESIGN_TARGETS.md` :43-49 forbids computing the 60h figure from the limit). The
tool exists; the numbers do not. Fill them, from the real loop, with the run length MEASURED.

## SCOPE (chartered - exactly this, no more)

1. **Make `--measure` LOG INCREMENTALLY.** Print one line per finished run AS IT FINISHES, via the
   existing `onRun` hook (or an equivalent per-run callback the harness already gives you - not a
   rewritten loop), so the process log grows every run and no watchdog can read the run as wedged.
   Print at least: index, sim seconds, wave, cause, kills, gold. Keep the final `BASELINE <stage>: ...`
   line exactly as it is (n, seed, goldMean, goldMedian, lenMeanS, won) - the pilot greps for it.
2. **Measure all three stages**, ONE PROCESS PER STAGE (the E1 discipline: `bootReal` once per process),
   output redirected to a log file, each wrapped in an explicit `timeout`:
   - `timeout 600 node tools/economy_ledger.mjs --measure fresh 8 1337`
   - `timeout 900 node tools/economy_ledger.mjs --measure partial 8 1337`
   - `timeout 1500 node tools/economy_ledger.mjs --measure maxed 3 1337`
   Budget honestly: a maxed run is ~4-5 min wall (pilot-measured), so maxed n=3 is ~15 min of solid CPU.
   That is ACCEPTABLE ONLY WITH the per-run logging from (1) in place. If a maxed run exceeds ~8 min wall
   with the log still growing, stop that stage, keep the runs you have, and report the wall time and the
   reduced n - a smaller honest n beats a hung process. If the log STOPS growing for >120s, that is a
   HANG: kill it, report the wave/mode/state it died in, and do not fight it.
3. **Fill `MEASURED` :58-62** with the measured numbers for all three stages: `n`, `seed`, `goldMean`,
   `goldMedian`, `lenMeanS`, and `tier` (0 / 1 / 3 for fresh / partial / maxed). The comment block above
   the table says these are "records of measurement, not intent" - so quote the raw BASELINE lines you
   are transcribing in your report, and change NOTHING else about the shape of the table.
4. **`node tools/economy_ledger.mjs` MUST PRINT THE WHOLE LEDGER** with no throw: catalogue total +
   count, the MID/TOP/OTHER partition, the end-game rate WITH THE DIVISOR STATED OUT LOUD, the per-item
   hours table, the CAP VIOLATIONS list (expected NON-empty on this tree - that is exactly what slice 1b
   reprices; just report what it says), the 10-good-run mid-tier share, the first-purchase index, and the
   catalogue-hours line. Quote the raw output.
5. **DO NOT REPRICE.** No edits to `src/meta.js` `SHOP_UPGRADES` / `WEAPON_PRICES` / `ELITE_MODIFIERS`,
   no new `test/test_economy_reprice.mjs`, no change to the `halfRuns` band in `test/test_meta.mjs`, no
   change to `GOLD_TIER` / `RUN_GOLD` / `GOLD_MODEL`. Those are slice 1b, and they go faster with these
   measured before-numbers in hand. If you find the ledger's numbers make a slice-1b decision obvious,
   WRITE IT IN YOUR REPORT - do not act on it.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, with the tree line
   (`TREE: ... @ <head> | dirty=<n>`) and any file you changed named.
2. The three raw `BASELINE <stage>: ...` lines, each with its stage, n and seed, as pasted tool output.
3. The per-run progress lines proving the log grew DURING the cohort (at least the last two lines before
   the BASELINE line of the maxed stage), plus the wall time you observed per maxed run.
4. `node tools/economy_ledger.mjs` raw output, in full, no throw, with the divisor line quoted.
5. The CAP VIOLATIONS line and the catalogue-hours line, raw, with your read of what slice 1b must move.
6. Every file and line changed; the dirty count; the explicit statement that no git state command was
   run; and a COULD NOT VERIFY section.

## HOUSE RULES (binding)

- Do NOT run git commit / checkout / reset / stash / clean. Leave the tree dirty and REPORT the dirty
  count; the orchestrator owns commits.
- NEVER weaken an assertion to go green. This slice changes no assertion at all; if a test goes red,
  report it as a red with its file and line - do not touch the band.
- Reuse the existing harnesses (`tools/real_loop.mjs` with its `onRun` hook, `tools/boss_sim.mjs`,
  `tools/balance_sim.mjs`). A second frame loop is a defect, not a deliverable.
- A self-report is a claim, not evidence: every number in the acceptance bar must appear as RAW tool
  output with n and seed, or it did not happen.
- Run the suite SERIALLY and confirm `/tmp/hordes_suite/<basename>.log` exists before believing a red
  reading that captured no assertion line (known concurrent-run clobber race).
- NO EMOJIS anywhere; the ledger prints plain-text tables.
- This slice is chartered by the pilot. If a design question blocks you, make the smallest defensible
  call, DISCLOSE it, and keep going - do not stop to ask, and do not invent new content.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; the three raw BASELINE lines; the
per-run progress sample; the full raw ledger output; the cap-violation + catalogue-hours lines with your
slice-1b read; the wall time per maxed run; the dirty count; what you could not verify; and the statement
that no git state command was run.

## DISPATCH RE-ANCHOR (measured by the goal pilot ON THIS TREE at dispatch, tick 57, 2026-09-15 ~11:55 UTC)

- HEAD `c40abcb`, **dirty=28** (`git log --oneline -3` => c40abcb / b5e86db / 30d14b6).
- `bash tools/run_suite.sh`, run by the PILOT this tick => `TREE: /home/claude/projects/hordes @ c40abcb
  | dirty=28` / `SUITE greenfiles=92 redfiles=0` / empty REDLIST.
- `ls tools/economy_ledger.mjs` => **10317 B, exists**, untracked. `test/test_economy_reprice.mjs` =>
  **does not exist**. The wedge-killed attempt (task msg_01M2JBEAQE60AR4C60VQV6HB67, exit -9) landed the
  tool and NOTHING else: `git status --short` shows no `src/` file modified by it beyond the G25/G24
  baseline already listed in `docs/briefs/G17_REPRICING.md`'s dispatch block.
- G25 slices 1+2 remain LANDED and PILOT-VERIFIED (uncommitted): `APEX_UPGRADES` src/meta.js :629,
  `APEX_BY_ID` :657, src/art/apex.js, the apex gallery in src/main.js, `tools/verify_g25_apex.mjs`,
  `tools/verify_g25_apex_gallery.mjs`. G21 slice 2 / G24 slice 1 intact. TREAT AS BASELINE - never
  rewrite them.
- RE-CONFIRMED from the parent brief's anchor block, all still true on this tree: `RUN_GOLD` :167
  (FIRST_CLEAR 250, AWARD 70 :181); `GOLD_MODEL` :214, `INCOME_TIERS` :231, `TOP_TIER_MIN_GOOD_RUNS` :237,
  `TOP_TIER_IDS` :245; `GOLD_TIER` :271; `WEAPON_PRICES` :342 (BEAM 110000 :352); `ELITE_MODIFIERS` :362;
  `SHOP_UPGRADES` :390; `upgradeCost` :499; `catalogCost` (used by the ledger at :104); `buyUpgrade` :508;
  `applyMetaBonuses` :889; `docs/DESIGN_TARGETS.md` :43-49; goals doc :2349.
- CORRECTED IN PLACE vs the parent brief (1 drift, named): the parent's step-4 STOP condition
  (`ls tools/economy_ledger.mjs` must NOT exist) HAS FIRED - the ledger exists, written by the
  wedge-killed run. That is why this slice exists instead of a re-issue of slice 1, and the parent brief
  must be read as "build the ledger" = ALREADY DONE, "fill + prove the ledger" = THIS SLICE.
- VERDICT: every other line number in the parent brief is correct as written on this tree.
