# G17 SLICE 1b - THE REPRICE (PRICES ONLY) - BUILD BRIEF

**Slice:** G17 slice 1b (THE ECONOMY MUST REQUIRE A REAL GRIND). This is the SECOND half of slice 1.
Slice 1a (FILL + PROVE THE LEDGER: `tools/economy_ledger.mjs` and its MEASURED baseline) is the
PREREQUISITE and must already be landed, measured and pilot-verified before this task is issued.
Slice 2 (the BREADTH pass that adds the missing mid-priced CONTENT) is chartered separately in
`/tmp/hordes_briefs/G17_SLICE2_BREADTH.md` and is NOT in this task.
**Builder:** whichever lane answers the dispatch probe (glm is the live lane; the kimi lane is on a
7-day provider wall).
**Brief authored by:** the goal pilot, 2026-09-15 (tick 59), OUTSIDE the repo while slice 1a was in
flight; **CORRECTED AND ISSUED by the goal pilot at tick 61 (2026-09-15 14:45 UTC) on a tree where
slice 1a is LANDED and PILOT-VERIFIED (HEAD `18eaa8b`, dirty=6)**. The TICK 61 CORRECTION BLOCK below
is the result of that dispatch anchor check and SUPERSEDES every drifted number in this file.
**Ordering:** runs AFTER `docs/briefs/G17_SLICE1A_MEASURE.md` has landed and been pilot-verified, on a
tree whose suite ends `redfiles=0` and whose ledger prints a REAL (non-zero) MEASURED table and an
EMPTY cap-violation list under the OLD prices (the BEFORE reading that this slice must beat).
**Read FIRST:** `docs/HORDES_GOALS_2026-09-12.md` :2349 (the authoritative G17 entry, including the
owner's verbatim hard targets) and the parent brief `docs/briefs/G17_REPRICING.md` (slice 1's full
scope; its items 1-2 and its item 4 body were executed by slice 1a, its items 3, 6, 7 are this task).

## TICK 61 CORRECTION BLOCK - SUPERSEDES DRIFTED TEXT BELOW (authored by the pilot 2026-09-15 14:45 UTC, AFTER slice 1a landed)

**1a IS LANDED AND PILOT-VERIFIED. The prerequisite gate (below, step 1) PASSES on the tree you are handed.**
This block is part of the brief: where it disagrees with the body text, THIS WINS.

**THE BEFORE READING, raw, from `node tools/economy_ledger.mjs` on this tree (acceptance 2's BEFORE):**

```
catalogue total: 440933g across 32 items (MID 10 / TOP 2 / OTHER 20)
partition: MID 40500g (weapon+elite unlocks, luck ladder) - TOP 250000g (weapon_beam, arcade) - OTHER 150433g
end-game rate (THE DIVISOR): tier-3 11000g/run (meta.js INCOME_TIERS) / 1800s measured mean run length (maxed cohort, n=1, seed=1337) = 1509378g/hour
single-item cap: 4528134g (3h x 1509378g/h)
CAP VIOLATIONS (> 4528134g): (none)
10-good-run mid-tier share: 271.6% (10 x 11000g of a 40500g mid catalogue; goal band 30-40%)
first-purchase index: 5.71 runs (cheapest real upgrade Orbit Blade 400g / tier-0/1 income 70g = must land 1-3 runs)
catalogue hours @ end-game rate: 0.3h (owner target 60+; shortfall 59.7h)
MEASURED on this tree: fresh {n:8, seed:1337, 164.5 / 71 / 11.6s, won 0/8}, partial {n:8, seed:1337, 156.3 / 98 / 26.4s, won 0/8}, maxed {n:1, seed:1337, 754689 / 754689 / 1800.0s, won 1/1}
```

**WHAT THAT MEANS FOR THIS SLICE (three corrections, all from measurement):**
- **The single-item cap is NOT violated before you start, and it is NOT the binding constraint.** 3h x the measured end-game rate = 4,528,134g; the most expensive full-buy in the game is Arcade Pass 140,000g = 0.09h of end-game income. Scope item 3's bullet *"This is what forces `weapon_beam` (110,000) and the top-tier pass row down from mega-trophy prices"* is **CONTRADICTED BY THE MEASUREMENT - do not shrink prices to fix a cap that is not violated.** The measured gaps are the other two bands: **the 10-good-run mid share (271.6% vs the 30-40% goal) and the catalogue hours (0.3h vs the 60+ target, 59.7h short)**.
- **THE DIVISOR HAS AN UNRECONCILED 69x SPLIT AND RESOLVING IT IS NOW IN SCOPE.** The ledger divides `INCOME_TIERS[3] = 11000g/run` (a constant whose own comment records a 300s-CAPPED historical cohort) by the MEASURED 1800s run length. The maxed cohort on THIS tree banked **754,689 gold in one won 1800s run** (raw `/tmp/g17_1b/maxed_r1.log`: `BASELINE maxed: n=1 seed=1337 goldMean=754689.0 goldMedian=754689 lenMeanS=1800.0 won=1/1`, cause `RUN SURVIVED`, kills 244185) - **~69x the 11000 the ledger uses**. `GOLD_MODEL.INCOME_TIERS` is "a record of measurement, not an intent knob", so it MAY be replaced with measured values. **You must (a) state which divisor you are pricing against, (b) show its arithmetic, (c) VERIFY the maxed figure is a real settled payout and not a truncation artifact - the harness settles through `settleRunGold`, so read the raw log and say so - and (d) say plainly whether the 60h target and the "few hours per top item" target are reachable together at that divisor.** A reprice on the wrong divisor is worthless; an honest "these two targets cannot both hold at the measured end-game rate, here is the split" is a PASS.
- **Wall clock (budget for acceptance 7): a maxed run costs 2432s (40:32) wall, not the ~5 min the earlier text assumed.** Fresh n=8 is ~1.5 min, partial n=8 ~3.5 min. Run maxed ONLY if you can pay 40 min; fresh + partial re-runs are the cheap proof that payouts did not move, and a skipped maxed re-run goes in COULD NOT VERIFY rather than being faked.

**1a WORK THAT IS ALREADY ON THE TREE - REUSE, NEVER REBUILD** (pilot-read, not builder-reported): `tools/real_loop.mjs` :136-138 doc + :156-157 the mid-run `onProgress` hook **inside the ONE existing frame loop** every 600 frames (186 progress lines in the raw maxed log - no second loop, no second advance, no second rAF queue); `tools/economy_ledger.mjs` :172 `onRun` per-run print, :174-177 `onProgress` wiring, :58-62 the filled `MEASURED` table. Raw cohorts: `/tmp/g17_1b/maxed_r1.log`, `fresh_n8_seed1337.log`, `partial_n8_seed1337.log`; fresh/partial reproduce the 12:29 baselines EXACTLY (164.5/71/11.6 and 156.3/98/26.4).

**DISPATCH ANCHOR CHECK - RUN BY THE PILOT THIS TICK, results below (re-run step 2/3 yourself before you edit):**
1. Prerequisite gate: PASS - the ledger prints a real table, no throw (raw above).
2. Tree: HEAD `18eaa8b`, dirty=6 at dispatch (the ledger `MEASURED.maxed` fill is the newest change; the orchestrator owns commits). G21 slice 2 / G24 slice 1 / G25 slices 1+2 intact.
3. Suite: run serially by the pilot this tick, final line recorded in the goals-doc tick-61 note; a `redfiles=0` reading is the condition of issue.
4. Anchors re-resolved on this tree: `GOLD_TIER` `src/meta.js` :271 (CHAFF 0 / GRUNT 1 / MID 3 / HEAVY 8 / ELITE 15 / MID_BOSS 60...), `RUN_GOLD` :167 (`FIRST_CLEAR: 250`, `AWARD` fixed base), `INCOME_TIERS` :231-236 (70/100/200/11000), `TOP_TIER_MIN_GOOD_RUNS: 10` :237, `WEAPON_PRICES` :342, `ELITE_MODIFIERS` :362, `SHOP_UPGRADES` :390, `upgradeCost` :499, `buyUpgrade` :508, `applyMetaBonuses` :889, `APEX_UPGRADES` :629 (NEVER repriced); `tools/balance_sim.mjs` `SIM_ASSUMPTIONS.apex: false` :157, `SIM_TUNING.MID_TIER_TOL` :80, `GOOD_RUN_TARGET` :74. Line numbers are the pilot's read; re-resolve before you trust one.
5. `test/test_economy_reprice.mjs` does NOT exist (checked this tick) - you author it; `apex: false` still present; payouts byte-identical (you re-prove this in acceptance 7).
6. `test/test_meta.mjs` :580-610 already asserts: maxed tier banks ~9-13k, tier 0 == `RUN_GOLD.AWARD`, tiers strictly increase, and **`halfRuns = (midCost/2)/good` inside the OLD band [1.5, 2.5] with the comment "(a) ~2 good runs buy ~50% of the mid-tier catalog"** plus `midCost < good * 40`. **YOUR NEW TEST MUST NOT DUPLICATE THESE** - it ADDS the single-item cap band, the first-purchase index and the 60h check. Note the tension you must resolve explicitly in the report: that comment encodes the "FAST" intent the owner is complaining about, so re-baselining `halfRuns` alone is NOT the deliverable - the band must be derived from the new intent and quoted with its arithmetic.

## WHAT ALREADY EXISTS (measured on this tree, not remembered)

- **The ledger is BUILT by slice 1a:** `tools/economy_ledger.mjs` - catalogue total + item count, the
  MID / TOP / other partition, per-item hours at the MEASURED rate with the divisor stated, the
  cap-violation list, the 10-good-run mid share, the first-purchase index; `--measure <stage> <n> <seed>`
  fills the baseline. REUSE IT. Never write a second ledger and never re-derive hours by hand.
- **`MEASURED` (`tools/economy_ledger.mjs` :58-62) is the DIVISOR and is read on BOTH sides of the
  reprice.** Its own header comment binds this slice: the payouts are FROZEN by the G17 charter, so
  re-running `--measure` after the reprice MUST reproduce the same baseline numbers (stage cohorts buy
  fixed purchases; prices do not enter them) - that reproduction IS acceptance item 7.
- **The price spine is THREE tables plus one cost authority in `src/meta.js`**, measured this tick:
  `WEAPON_PRICES` :342 (weapon unlock rows), `ELITE_MODIFIERS` :362 (elite unlock rows),
  `SHOP_UPGRADES` :390 (the stat/slot rows, `{id,name,desc,baseCost,costGrowth,maxLevel,perLevel}`),
  `MAX_WEAPON_SLOTS` :335, `upgradeCost(def, level)` :499 (the ONLY cost authority - prices are NOT the
  flat `baseCost`, they roll `costGrowth` per level), `buyUpgrade(profile, id)` :508 (the ONE purchase
  path), `applyMetaBonuses(stats, purchased)` :889 (the ONE read of purchased effects).
- **`APEX_UPGRADES` :629 is a SEPARATE array and must NEVER be repriced** (G25 charter; its partition is
  asserted apex-free).
- **The tier partition is a pair of id lists that MUST stay in lockstep:** `GOLD_MODEL.MID_TIER_IDS` /
  `TOP_TIER_IDS` (`src/meta.js` :240 block) and `SIM_ASSUMPTIONS.MID_TIER_IDS` / `TOP_TIER_IDS`
  (`tools/balance_sim.mjs` :149). `test/test_meta.mjs` asserts the two pairs are IDENTICAL arrays.
- **The sim's own targets to RE-BASELINE (this slice's item 4), measured this tick:**
  `SIM_TUNING.GOOD_RUN_TARGET: 30` (`tools/balance_sim.mjs` :74), `SIM_TUNING.MID_TIER_TOL: [0.35, 0.65]`
  (:80, consumed at :685), `GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS: 10` (`src/meta.js` :237),
  `GOLD_MODEL.INCOME_TIERS` (`src/meta.js` :231), `SIM_ASSUMPTIONS.apex: false` (:157, must stay false),
  and the `halfRuns` band `[1.5, 2.5]` in `test/test_meta.mjs` :597-601
  (`const halfRuns = (midCost / 2) / good;` - the band is what currently ENCODES "fast").
- **`test/test_economy_reprice.mjs` DOES NOT EXIST** (checked this tick). Item 6 authors it.
- **Payouts that are FROZEN and must stay BYTE-IDENTICAL:** `GOLD_TIER` (`src/meta.js` :271),
  `RUN_GOLD` / `RUN_GOLD.AWARD` (:167), the purse mechanic, the per-kill purse credit, the chest values.
- **The shop UI walks `SHOP_UPGRADES`** (`src/main.js` :3030-3035 / :4303-4308 / :4359) and
  `src/achievements.js` :286/:312 reads `SHOP_UPGRADES.length` ("own every row"); repricing must not
  break either. Save needs NO schema change for price moves (`src/save.js` :317-336 preserves unknown
  ids and clamps known ones to `def.maxLevel`).
- **Design rules that bind this slice:** `docs/DESIGN_TARGETS.md` rule 3 ("RULES BEAT STATS FOR DEPTH"),
  rule 9 ("ONE CURRENCY IS ENOUGH"), :43-49 ("DO NOT COMPUTE 60h FROM THE LIMIT ... average run length
  rises across a playthrough").

## THE GAP THIS SLICE CLOSES

Slice 1a produced the INSTRUMENT and the BASELINE. Nothing has been repriced yet, so the economy still
passes ITS OWN targets, which were written to the OLD, faster intent. The owner's hard targets, verbatim
(goals doc :2349): *"top tier should take a few hours to get one top tier item, let alone all of them ...
we need around 60+ play hours worth of shop items determined by gold"*, with the finale beatable at
~40 play hours. The goal's own diagnosis is **PRICES, NOT PAYOUTS**, and its arithmetic blocker is that
`arcade` + `weapon_beam` are ~48% of the whole catalogue, so a 60-hour catalogue that still lets one item
take "a few hours" is impossible while two mega-priced trophies hold half the gold - **the hours must
come from BREADTH, and no single item may exceed a few hours**.

## SCOPE (chartered - one slice, end to end)

3. **REPRICE - PRICES ONLY. NEVER PAYOUTS.** `GOLD_TIER`, `RUN_GOLD.AWARD`, the purse mechanic and the
   per-kill credits stay BYTE-IDENTICAL. Concretely:
   - the FIRST purchases stay cheap - the first purchase must still land within ~1-3 runs at tier-0/1
     income (a player who feels broke at the start never reaches the grind);
   - the MID tier is STRETCHED so **10 good runs buys roughly 30-40%** of it (down from the measured
     high-60s);
   - **cap any SINGLE item at roughly a few hours of income** at the measured end-game rate (order
     the measured cap on this tree is 4,528,134g (3h x 1,509,378g/h) and NO current row violates it -
     ~~This is what forces `weapon_beam` (110,000) and the top-tier pass row down from mega-trophy
     prices~~ STRUCK AND CORRECTED BY TICK 61 (see the correction block: the cap is not the binding
     constraint, the mid-share and 60h bands are);
   - the TOP tier stays a long-term target but still inside the cap;
   - change PRICES through `baseCost` / `costGrowth` only, and prove afterwards with `upgradeCost` that
     the real per-level costs satisfy the cap - not just the row's `baseCost`.
4. **RE-BASELINE THE SIM'S OWN TARGETS to the NEW intent** (the goal: *"leaving it in place would let a
   later agent 'fix' the grind straight back out"*): `SIM_TUNING.MID_TIER_TOL` (`tools/balance_sim.mjs`
   :80), `SIM_TUNING.GOOD_RUN_TARGET` (:74), `GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS` (`src/meta.js` :237) and
   the `test/test_meta.mjs` :597-601 band. The new band must READ the new intent (10 good runs ->
   30-40% of mid-tier) and be quoted in the report with the before/after numbers. Re-baselining a numeric
   band IS the deliverable; DELETING or loosening the assertion is NOT - it must still fail loudly if a
   later agent retunes the economy back to "fast".
6. **NEW `test/test_economy_reprice.mjs`** pinning the new invariants: no single item over the stated cap
   at the measured rate; 10-good-run mid share inside the new band; first purchase within 1-3 runs;
   catalogue hours >= 60 at the measured end-game rate **or** a quoted shortfall with the hours the
   breadth expansion must add. Assert the numbers; never weaken an assertion to go green. It must IMPORT
   the real tables / the real ledger, not carry a copied price list.
7. **REPORT THE 60h ARITHMETIC HONESTLY.** Publish the post-reprice catalogue total and its hours at the
   measured rate. The goal states repricing ALONE cannot reach 60h without breaking the single-item cap -
   if your measurement agrees, QUANTIFY the missing hours and hand them to slice 2 (breadth). Do NOT
   inflate one or two trophy prices to fake the hours: that reproduces the exact lopsidedness the goal
   forbids. This slice sets the SPINE and the measurement; slice 2 owns the added mid-priced CONTENT.

## OUT OF SCOPE (do NOT touch)

- **Payouts and income curves** - `GOLD_TIER`, `RUN_GOLD.AWARD`, the per-kill purse credit, the chest
  values. `GOLD_MODEL.INCOME_TIERS` may only be REPLACED WITH NEWLY MEASURED VALUES (it is a record of
  measurement, not an intent knob); the baseline must not MOVE because of this slice.
- The **apex tier** (G25). It is deliberately game-breaking prestige, and every completion figure stays
  apex-free (`tools/balance_sim.mjs` :154-157). Do not reprice it, do not count it.
- **Adding new catalogue CONTENT** (new rows/weapons/upgrades to reach 60h by breadth) - that is slice 2.
  This slice may only PROVE and QUANTIFY the shortfall.
- **THE BEATABILITY TEST (~40 play hours clears the finale, fresh does not).** It is the owner's actual
  target and it is DELIBERATELY DEFERRED, not forgotten: its profile builder must consume the
  POST-REPRICE price table (40 hours of purchases is a number of PRICES, not of hours), so running it
  before this slice lands would measure the old economy. It is chartered as **slice 1c** in the goal
  doc; do NOT half-build it here. The ledger's cap + the re-baselined band remain the GATE for slice 1b.
- **The arch model (G5/W7a tooling).** Do not model arches here. If a measurement is impossible without
  them, record it in COULD NOT VERIFY rather than inventing a model.
- Run length (G18), a second currency (`docs/DESIGN_TARGETS.md` :99), the bestiary, G24's heat payout,
  `src/challenges.js`, `src/heat.js`, `src/save.js` / any schema change.
- **NO new `MEASURED` measurement of a fourth stage, no re-run of `--measure` "just in case"** - the
  1a baseline is the divisor; re-run it ONLY once, as acceptance item 7, to prove payouts did not move.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. **PREREQUISITE GATE.** Run `node tools/economy_ledger.mjs` and paste the raw output. It must print a
   REAL table (every stage `n > 0`, a non-zero gold/hour, a non-empty per-item hours table) and MUST NOT
   throw. If it still throws `no measured baseline for stage <s>`, slice 1a did NOT land: STOP, do not
   issue this task, and re-verify/re-issue 1a instead.
2. `git status --porcelain | wc -l` + `git log --oneline -3` - record dirty count and HEAD. Confirm
   `tools/economy_ledger.mjs` is PRESENT and G21 slice 2 / G24 slice 1 / G25 slices 1+2 are still intact.
3. RUN `bash tools/run_suite.sh` (SERIALLY - a concurrent run clobbers `/tmp/hordes_suite`) and paste its
   verbatim final line here. If it does not end `redfiles=0`, STOP - this slice is not issued on a red
   tree. (A red reading `no assertion line captured` with no log file in `/tmp/hordes_suite` is a runner
   race between two concurrent suite runs - confirm the log exists and re-run before believing it.)
4. Re-resolve on the CURRENT tree and CORRECT ANCHORS IN PLACE: `RUN_GOLD` / `GOLD_MODEL` / `GOLD_TIER` /
   `WEAPON_PRICES` / `SHOP_UPGRADES` / `ELITE_MODIFIERS` / `upgradeCost` / `buyUpgrade` /
   `applyMetaBonuses` in `src/meta.js`; `SIM_TUNING` + `SIM_ASSUMPTIONS` in `tools/balance_sim.mjs`; the
   `halfRuns` band in `test/test_meta.mjs`; the `MEASURED` table in `tools/economy_ledger.mjs`.
5. Confirm and SAY SO: `GOLD_TIER` / `RUN_GOLD.AWARD` are unchanged from the values you recorded;
   `apex: false` is still in `SIM_ASSUMPTIONS`; `test/test_economy_reprice.mjs` still does NOT exist (if
   it does, STOP and report - someone else built it and this brief must be reconciled, not duplicated).
6. Name what `test/test_meta.mjs` :580-610 already asserts about the economy, so the new test does not
   duplicate it - it must ADD the cap band, the first-purchase index and the 60h check.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, naming the new/changed test
   files.
2. `node tools/economy_ledger.mjs` output, quoted RAW, BEFORE and AFTER the reprice: catalogue total +
   count, the partition, the per-item hours table, the cap-violation list (must be EMPTY after), the
   10-good-run mid share, the first-purchase index.
3. The measured income baseline on THIS tree, raw, with n and seeds, and an explicit statement of the
   gold/hour divisor.
4. `node test/test_economy_reprice.mjs` GREEN, printing the asserted numbers.
5. `node test/test_meta.mjs` GREEN with the RE-BASELINED band, and the before/after band values quoted
   (old `[1.5, 2.5]` runs-per-half-catalog -> the new number) with the arithmetic behind it.
6. The single-item CAP: the value, the measured rate it was derived from, and the proof (through
   `upgradeCost` at max level, not the row's `baseCost`) that no item exceeds it.
7. A PROOF that payouts did not move: `--measure` re-run post-reprice, identical to the 1a baseline (or
   the exact, justified delta if a measurement disagrees, FLAGGED rather than buried).
8. Every file and line changed; every retarget enumerated (file + line + why); the explicit statement
   that no git state command was run; the dirty count; and a COULD NOT VERIFY section.

## HOUSE RULES (binding)

- Do NOT run git commit / checkout / reset / stash / clean. Leave the tree dirty and REPORT the dirty
  count; the orchestrator owns commits.
- NEVER weaken an assertion to go green. Retarget the absolute minimum, enumerated, with the reason.
- Reuse the existing harnesses (`tools/real_loop.mjs`, `tools/balance_sim.mjs`, `tools/economy_ledger.mjs`).
  A second frame loop is a defect, not a deliverable.
- A self-report is a claim, not evidence: every number in the acceptance bar must appear as RAW tool
  output with n, or it did not happen. Do not report intentions - raw output only.
- NO EMOJIS in any UI, DOM string or CLI table.
- This slice is chartered by the pilot, not by the owner. If a design question the goal does not answer
  blocks you (e.g. the exact cap), make the smallest defensible call, DISCLOSE it, and keep going - do
  not stop to ask, and do not invent new content.
- Post `done:` / `blocked:` FIRST, then the evidence.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with its raw
output (before AND after); the new target band and the arithmetic behind it; the cap and where it came
from; the quantified 60h SHORTFALL handed to slice 2; the flag list; what you could not verify; the
dirty count; and the statement that no git state command was run.
