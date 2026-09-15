# G17 SLICE 1c - THE BEATABILITY TEST (the owner's actual target) - BUILD BRIEF

## DISPATCH RE-ANCHOR - FILLED BY THE PILOT ON THE LIVE POST-1b TREE (2026-09-15 15:52 UTC; the placeholder block below is SUPERSEDED by this one, kept only as the checklist it was)

Slice 1b (THE REPRICE) IS LANDED AND PILOT-VERIFIED AS OF THIS DISPATCH. Raw evidence, this tree:

1. **PREREQUISITE GATE - PASSED (raw).** `node tools/economy_ledger.mjs` => rc=0, prints the WHOLE ledger, no throw; `MEASURED` (:58-62) = fresh n=8/1337 `164.5/71/11.6s won 0/8`, partial n=8/1337 `156.3/98/26.4s won 0/8`, maxed n=1/1337 `754689/754689/1800.0s won 1/1`. Ledger lines verbatim: catalogue `29590633g across 32 items (MID 10 / TOP 2 / OTHER 20)`; partition MID `20740200g`, TOP `8700000g`, OTHER `150433g`; divisor `tier-3 754689g/run / 1800s measured mean run length = 1509378g/hour`; single-item cap `4528134g`; `CAP VIOLATIONS: (none)`; `10-good-run mid-tier share: 36.4%` (band 30-40%); `first-purchase index: 2.86 runs` (band 1-3); `catalogue hours @ end-game rate: 19.6h` (owner target 60+; shortfall 40.4h to slice 2).
2. **ANCHOR.** `git log --oneline -3` => HEAD `18eaa8b` ("G17 slice 1 (PARTIAL, unmeasured): economy ledger harness + boss_sim hours:H arm"); `git status --porcelain | wc -l` => **dirty=12**.
3. **SUITE - PASSED (raw final line, run SERIALLY by the pilot on a quiet box):** `TREE: /home/claude/projects/hordes @ 18eaa8b | dirty=12` / `SUITE greenfiles=93 redfiles=0` / empty REDLIST. Do NOT run the suite yourself.
4. **RE-RESOLVED ANCHORS (post-1b, this tree).** `src/meta.js`: `GOLD_MODEL` :214, `TOP_TIER_MIN_GOOD_RUNS: 5` :248, `WEAPON_PRICES` :358 (ORBIT 200 / ZAP 600000 / NOVA_PULSE 1200000 / SCYTHE 2000000 / SEEKER 2800000 / MINE 4200000 / BEAM 4500000), `ELITE_MODIFIERS` :377 (SWIFT 1000000 / SPLITTING 1800000 / VAMPIRIC 2800000), `SHOP_UPGRADES` :408 (luck baseCost 140000 growth 2.0 x5 => 4,340,000 full buy; arcade 4200000), `APEX_UPGRADES` :654 (UNTOUCHED, never counted). `tools/balance_sim.mjs`: `SIM_TUNING.GOOD_RUN_TARGET: 120` :78, `MID_TIER_TOL: [0.30, 0.40]` :88; `SIM_ASSUMPTIONS.apex: false` :165. `test/test_meta.mjs`: the re-baselined `halfRuns` band is `:617-619` = `[12.5, 16.7]` ("half the mid-tier catalog costs ~14 good runs"). The divisor 1b chose and its arithmetic: **the MEASURED maxed record** - `INCOME_TIERS[3] = 754689g/run`, replacing the stale 300s-capped 11000 constant (69x), divided by the measured 1800s run => **1,509,378g/hour**; asserted at `test/test_economy_reprice.mjs` :33-34 (`INCOME_TIERS[3].gold === MEASURED.maxed.goldMean`).
5. **THE ARM YOU MUST USE IS INTACT.** `tools/boss_sim.mjs` `--profile fresh|partial|maxed|hours:H` (:25 usage, :43-52 doc, :53 parse, :161-174 build: `budget = Math.round(HOURS * goldPerHour('maxed'))` :163, spent along `balance_sim`'s exported `GREEDY_PRIORITY` :162/:167 through the real `buyUpgrade`, budget line printed :173-174). 1b DID touch this file, ONE line at the maxed stage only (:145 grant `10_000_000` -> `1_000_000_000`, disclosed: the repriced catalogue is 29.6M so 10M armed only a PARTIAL build); the `hours:H` arm itself is unmodified. `tools/real_loop.mjs` `stageProfile` `fresh|partial|maxed` present, maxed grant likewise 1e9.
6. **BEFORE/AFTER ON THE BINDING NUMBERS (tie every cohort claim to these).** 10-good-run mid share **271.6% -> 36.4%**; catalogue **440,933g / 0.3h -> 29,590,633g / 19.6h**; first-purchase index **5.71 -> 2.86 runs**; cap violations none both sides. Payouts provably frozen: post-reprice fresh n=8, partial n=8 and the maxed n=1 runs are **BYTE-IDENTICAL** to their pre-reprice logs (`diff`/`cmp` clean on `/tmp/g17_1b/{fresh,partial}_n8_seed1337{,_postreprice}.log` and `maxed_r1.log` vs `maxed_n1_seed1337_postreprice.log`), and the maxed post-reprice wall was `maxed_postreprice_start` 1789484313 -> `maxed_postreprice_end` 1789486876 = **2563s**.

### THE SATURATION FINDING YOU MUST HANDLE - RUN THIS ARITHMETIC BEFORE CHOOSING YOUR COHORTS

`hours:40` x 1,509,378g/h = **60,375,120g, which is 2.04x the ENTIRE 29,590,633g catalogue**, so `--profile hours:40` and `--profile maxed` construct the **IDENTICAL profile**: with the flat end-game rate, every `H >= 19.6` saturates. Consequences, state them in your report rather than rediscovering them:

- Item 4 of your scope is not a footnote here, it is the whole curve: the flat model makes the 20-40h "lucky-run" band and the 40-50h "regular-run" band **indistinguishable**, because both are the same FULL build. Quantify the overstatement in gold and in hours (the honest career-integrated budget at tier 0-1 banks ~70-160g/run, so a real 40h career owns far less than 60.4M) and say plainly that the shipped catalogue cannot represent the owner's 40h point until slice 2 breadth lands.
- Because of that, **probe the CROSSING BELOW saturation, cheapest first**, and report each point as a clear rate with its n and seed: `hours:40` (the saturated endpoint = the maxed build, the owner's own 40h wording), then descending `hours:19.6` (the full-catalogue budget), `hours:10` (15.1M), `hours:5` (7.5M), `hours:2` (3.0M). STOP at the first point where the clear rate leaves 0 and the point below it, do not grind the whole list - and if your budget only covers two points, the pair that matters is fresh (cannot) vs the saturated 40h build (can), with the middle band recorded as NOT LOCATED.
- **WALL COST IS ASYMMETRIC - plan around it.** A profile that SURVIVES costs a full run: the maxed post-reprice run is a MEASURED **2563s (42:43) WALL** for 1800s of sim time. A `fresh` run dies at a MEASURED mean of **11.6s**, so the fresh cohort is CHEAP (the n=8 fresh cohort has been run twice end-to-end inside ~90s wall). So: take the fresh arm at a real n (n>=8, cheap, genuine deaths from the real loop), take ONE saturated `hours:40` run if that is all you can pay, and only spend on middle points with whatever wall time is left. Never a single 1800s foreground call - `mkdir -p /tmp/g17_1c && date +%T >> /tmp/g17_1c/heartbeat.log` first, then `nohup timeout 2700 node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed <S> > /tmp/g17_1c/<name>.log 2>&1 &` and poll with SEPARATE <=240s commands that print `(sleep 240; date +%T; tail -c 300 <log>)`, appending to the heartbeat between polls (`zero progress (cpu+log+files) for 900s` is the watchdog's kill rule, design #62 sec 4.5).
- **`test/test_beatability.mjs` MUST STAY SUITE-CHEAP.** Default mode: measure the fresh arm LIVE through the real loop (cheap, its deaths are genuine) and assert the recording; keep the expensive "can clear" side as a RECORDED measurement (n, seed, the exact boss_sim command, and the raw log path in the file header, the same pattern `MEASURED` uses in `tools/economy_ledger.mjs` :58-62), re-measured only under an explicit `--full` flag. If the recorded side was never measured, do NOT assert it as if it had been - put it in COULD NOT VERIFY.
- **DO NOT REPRICE ANYTHING, DO NOT WAIT FOR THE LANE.** The lane was re-minted at 15:43:22 (watchdog group-CPU probe + unique temp name in `_write_json`) and its stale pending queue was cancelled; the worker is IDLE with an EMPTY queue. A `done:` for 1b did arrive (`msg_01M2JVQMB0AZ2SKAMWDY37GGR4`), but treat it as a claim only: the pilot verified the numbers above on the artifact.


**Slice:** G17 slice 1c (THE ECONOMY MUST REQUIRE A REAL GRIND). The THIRD and final slice of slice 1.
**Builder:** whichever lane answers the dispatch probe (glm is the live lane; the kimi lane is on a
7-day provider wall - do not spend a probe on it).
**Brief authored by:** the goal pilot, 2026-09-15 14:57 UTC (tick 62), OUTSIDE the repo while slice 1b
was IN FLIGHT; RE-ANCHORED AND ISSUED 2026-09-15 15:52 UTC on the post-1b tree (HEAD `18eaa8b`, dirty=12,
`SUITE greenfiles=93 redfiles=0`). It therefore carries a DISPATCH RE-ANCHOR BLOCK (below) that the issuing tick MUST run and
fill on the live tree BEFORE the task is issued - slice 1b's repriced numbers are not yet known here and
eEvery number the FILLED re-anchor block needs is measured and pasted above.
**Ordering:** runs ONLY AFTER slice 1b (THE REPRICE, brief `docs/briefs/G17_SLICE1B_REPRICE.md`) has landed
and been pilot-verified and the suite ends `redfiles=0`. Do NOT issue this slice on a red tree, a tree
whose repriced table is unreviewed, or on top of an unfinished 1b.
**Read FIRST:** `docs/HORDES_GOALS_2026-09-12.md` :2356 (the G17 entry with the owner's verbatim hard
targets) and :2412-2445 (THE ACCEPTANCE TEST FOR BEATABILITY + THE PROGRESSION CURVE - OWNER'S BENCHMARK,
which is the authoritative statement of what this slice must measure).

## (SUPERSEDED - kept as the checklist it was) DISPATCH RE-ANCHOR BLOCK - THE ISSUING TICK MUST RUN THIS AND FILL IT

Every number below must come from a command run on the live tree at dispatch time, on the post-1b prices:
1. **PREREQUISITE GATE.** `node tools/economy_ledger.mjs` - paste raw. It must print the whole ledger with
   no throw, a REAL `MEASURED` table, and the repriced catalogue. If it throws or the catalogue still reads
   ~440,933g, slice 1b did NOT land: STOP, do not issue, re-verify 1b first.
2. `git log --oneline -3` + `git status --porcelain | wc -l` - record HEAD and the dirty count.
3. `bash tools/run_suite.sh` run SERIALLY (a concurrent run clobbers `/tmp/hordes_suite`) - paste its
   verbatim final line. If it does not end `redfiles=0`, STOP.
4. Re-resolve and record: the REPRICED `WEAPON_PRICES` / `ELITE_MODIFIERS` / `SHOP_UPGRADES` /
   `APEX_UPGRADES` (untouched) line numbers in `src/meta.js`; the new `SIM_TUNING` targets and
   `GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS` in `tools/balance_sim.mjs`; the divisor `test/test_economy_reprice.mjs`
   asserts; the new `halfRuns` band in `test/test_meta.mjs`. State which divisor 1b chose and its arithmetic.
5. Confirm the beatability arm is still present and unmodified: `tools/boss_sim.mjs` :43-53/:156-173
   (`--profile hours:H`), and `tools/real_loop.mjs` `stageProfile` (`fresh` / `partial` / `maxed`).
6. Record the reprice's BEFORE/AFTER mid-tier share and catalogue hours (the ledger's own lines) so this
   slice's cohort claim is tied to the exact price table it was measured against.

## THE PROBLEM THIS SLICE EXISTS TO CLOSE

Nothing in the repo measures **"can a developed player win"** - the owner's actual target. The economy
slices (1a/1b) prove the PRICE LADDER; they do not prove the GAME IS BEATABLE at the intended point, nor
that it is NOT beatable before it. Owner's spec, verbatim from the goal doc:

> simulate a profile with ~40 play hours of purchases (order 600-700 runs of income at the target rate)
> and show the finale is clearable at a meaningful rate; simulate a fresh profile and show it is not.

And the shape it must reproduce (owner's benchmark, `docs/HORDES_GOALS_2026-09-12.md` :2427-2440):

| hours | capability |
|---|---|
| 0-20h | CANNOT survive a full long run; runs end early, often in minutes |
| ~20h | can survive the entire 30-minute run |
| ~20-40h | can beat the final boss on a LUCKY run |
| ~40-50h | can beat the final boss on a mostly REGULAR run |
| 50h+ | completion / mastery |

**Reached when:** a ~40-hour profile clears the finale at a meaningful rate, a fresh profile does not,
and the sim's own targets encode the NEW intent (the old 35-65% / 30-good-run targets encode the old,
faster economy).

## WHAT ALREADY EXISTS - REUSE, NEVER REBUILD (pilot-read on the live tree 2026-09-15 14:57 UTC, HEAD `18eaa8b`)

- **`tools/boss_sim.mjs` ALREADY HAS THE ARM.** `:25` usage `--profile fresh|partial|maxed|hours:H`;
  `:43-52` documents `hours:H` as "a save with ~H PLAY HOURS of shop items"; `:53` parses it; `:156-173`
  builds it - `budget = Math.round(HOURS * goldPerHour('maxed'))` (`:163`) then spends along
  `balance_sim`'s exported `GREEDY_PRIORITY` (`:162`, `:167`) through the REAL `buyUpgrade` path, and
  `:173` prints the budget line. **Do not write a second profile builder and do not write a second
  purchase order** - using a second priority order would make the result incomparable to the W7a work.
- The sim runs the REAL frame loop headless (DOM shim + rafQueue + overlay auto-play) and records death
  via `state.deathBy`; runs that reach the run limit are recorded `RUN SURVIVED` via `state.runWon`, and
  `--max-seconds` defaults to 31*60 = 1860s so a legitimate 30:00 run is not truncated into a fake death.
  Death-cause tables are per-wave, which is exactly the ladder read this slice needs.
- `tools/real_loop.mjs` `stageProfile('maxed')` (`:41-50`) currently grants a 1e9 gold budget with a comment
  stating the repriced catalogue is 29.6M - i.e. slice 1b's reprice IS on the tree, but as UNREVIEWED
  in-flight work at the time this brief was written. **Treat 1b's table as landed only if the dispatch
  anchor check says so.**
- `tools/economy_ledger.mjs` `MEASURED` (:58-62) and `goldPerHour` - the income rate the `hours:H` budget
  is priced at. Its maxed figure was measured on the PRE-REPRICE tree; if 1b changed only prices, income
  per run should NOT have moved, and slice 1c's first job is to say whether that held (raw output).
- **WALL COST IS THE TRAP.** A maxed 1800s run is a MEASURED **2432s (40:32) wall** (`/tmp/g17_1b/maxed_r1.log`),
  and this sim's runs are up to 1860s of sim time. One run costs about as much as one real 40-minute session.

## SCOPE (do these; nothing else)

1. **RUN THE LADDER AT 40 HOURS.** `node tools/boss_sim.mjs --profile hours:40 --seed <printed> --runs N`
   with a printed seed and honest n, on the POST-REPRICE table. Report the raw per-wave death table and
   the finale clear rate (cleared / N). State the wall time you actually spent.
2. **RUN THE FRESH CONTROL.** Same command with `--profile fresh`, same seed and n. The claim under test is
   clear rate == 0. If fresh clears the finale ANY number of times, that is a FINDING: report the rate
   and the death-wave table raw; do not tune it away inside this slice.
3. **LOCATE THE CURVE, if budget allows.** `hours:20` and one more point of your choosing from the owner's
   table (the lucky-run vs regular-run band at 20-50h). Report each as a clear rate with its n.
4. **FIX THE BUDGET'S DISCLOSED OPTIMISM - this is in scope and it is the honest hard part.** Today the
   budget prices ALL H play hours at the END-GAME hourly rate (`goldPerHour('maxed')`), which the goal doc
   itself contradicts: early runs bank a small fraction of that (`0-20h` hours are minutes-long runs), so a
   flat `H x endGameRate` OVERSTATES what a 40-hour player actually owns. Either (a) integrate the tier
   curve so an hours:H budget reflects income earned along the way, or (b) keep the flat model, SAY SO
   explicitly, and QUANTIFY the overstatement in gold and in equivalent hours. State the arithmetic either
   way. A profile whose budget is 2x the real one is not evidence for a 40-hour claim.
5. **AUTHOR `test/test_beatability.mjs`** (new file, standalone, `node test/test_beatability.mjs`):
   it asserts the two directional claims against the CURRENT price table and prints every measured number
   with its n and seed. It must assert, at minimum: fresh clear rate is 0 across its cohort; the 40-hour
   profile's clear rate is strictly greater than 0 at the n it actually ran; and the budget arithmetic it
   used is printed. **It must be cheap enough to run in a normal suite** - if a full 1860s cohort is too
   slow for CI, gate the expensive cohort behind an explicit flag (e.g. `--full`) and have the default run
   a SHORT, REPRODUCIBLE cohort that still exercises the real loop. Say plainly in the file header which
   mode the suite runs and which numbers were measured in `--full` mode.
6. **DISCLOSE THE G18 DEPENDENCY - do not implement it.** Run length is itself a progression axis (G18):
   early runs are short, late runs approach the cap. Every number this slice produces is priced against a
   constant run length. State that limit in the report under COULD NOT VERIFY.

## OUT OF SCOPE (do NOT touch)

- **Prices and payouts.** Slice 1b owns the table; this slice MEASURES against it. If the measurement says
  the table is wrong, report it - do not silently edit it.
- **New catalogue content (breadth)** - that is slice 2, chartered at `/tmp/hordes_briefs/G17_SLICE2_BREADTH.md`.
- The **apex tier** (G25): never counted, never repriced, `SIM_ASSUMPTIONS.apex` stays `false`.
- `src/heat.js`, `src/challenges.js`, `src/save.js` / any schema change; the arch model (G5/W7a tooling).
- **Do not run `tools/run_suite.sh`** - the pilot owns that reading; a concurrent run clobbers `/tmp/hordes_suite`.
- **No git state commands of any kind** (no commit/checkout/reset/stash/clean). Leave the tree dirty and
  report the dirty count; the orchestrator owns commits.

## BUDGET AND THE WEDGE TRAP (this is what killed three earlier attempts on this lane)

- No single command may block longer than 300s except a BACKGROUNDED measurement. The watchdog kills a model
  with `zero progress (cpu+log+files) for 900s`, and a long foreground run looks exactly like a wedge.
- Before you start any cohort: `mkdir -p /tmp/g17_1c && date +%T >> /tmp/g17_1c/heartbeat.log`, and keep
  appending to that heartbeat between polls so the tick has a liveness signal that is not your log.
- Run cohorts ONE RUN PER PROCESS, backgrounded:
  `nohup timeout 2700 node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed <S> > /tmp/g17_1c/<name>.log 2>&1 &`
  then poll with SEPARATE commands of <=240s that print `(sleep 240; date +%T; tail -c 300 <log>)`.
  Never a single 1800s foreground call.
- **REDUCE n HONESTLY RATHER THAN HANG.** n=1 is an acceptable honest result for a 40-minute-per-run stage
  if you say so and put the missing n in COULD NOT VERIFY. Do NOT report a rate with a denominator you did
  not actually run, and do NOT fabricate a cohort.
- A builder self-report is a CLAIM, not evidence. Every number in your report must appear as RAW tool
  output with its n and seed.

## ACCEPTANCE BAR (the pilot verifies each of these on the artifact, not on your report)

1. The repriced table is quoted with `HEAD` + dirty count as the anchor it was measured against.
2. Fresh cohort: raw death-wave table + clear rate, with n and seed printed, and the wall time.
3. `hours:40` cohort: raw death-wave table + clear rate, with n and seed printed, and the wall time.
4. The budget arithmetic is STATED (gold per hour used, total budget, what was bought) and the flat-model
   overstatement is either fixed or quantified in gold and equivalent hours.
5. `test/test_beatability.mjs` exists, `node --check` clean, and its default mode PASSES standalone with
   the number of cases it ran printed. If it asserts the fresh-cannot / 40h-can pair, both sides must be
   measured, not assumed.
6. Nothing outside your scope changed: payouts byte-identical, `APEX_UPGRADES` untouched, no new content
   rows, no schema change.
7. Every retarget or any assertion you touched is enumerated as file + line + why. NEVER weaken or delete an
   assertion to go green - a red you cannot fix goes in COULD NOT VERIFY.

## REPORT FORMAT (post `done:`/`blocked:` FIRST, then the evidence)

Post `done: <one line>` or `blocked: <one line>` to the channel BEFORE the long evidence, then:

- **WHAT LANDED** - files + line counts touched, dirty count, HEAD.
- **RAW MEASUREMENTS** - each command verbatim with its output: fresh, hours:40, plus any extra points.
- **THE CLAIM UNDER TEST** - fresh clear rate, 40h clear rate, and the hours at which the curve crosses
  (or why it cannot be located within budget).
- **BUDGET ARITHMETIC** - the divisor/rate, the budget, the purchase order used, the overstatement figure.
- **COULD NOT VERIFY** - everything you did not measure, including anything needing the arch model, G18's
  run-length curve, a skipped cohort, or an n you reduced. Honesty over faking is a PASS condition here.
