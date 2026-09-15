# G17 SLICE 1 - THE ECONOMY LEDGER + THE PRICE SPINE - BUILD BRIEF

**Slice:** G17 slice 1 (THE ECONOMY MUST REQUIRE A REAL GRIND), the ranked-queue item that runs after
G25 slice 2. READ THE FULL G17 ENTRY FIRST: `docs/HORDES_GOALS_2026-09-12.md` :2349 (the goals doc is
authoritative; this brief is the executable half of it, and `docs/DESIGN_TARGETS.md` :43-49 carries the
owner-approved run-length model the hours are computed against).
**Builder:** whichever lane answers the dispatch probe (glm is the live lane as of tick 54; kimi is on
the 7-day provider wall).
**Brief authored by:** the goal pilot, 2026-09-15 (tick 55), OUTSIDE the repo while G25 slice 2 was in
flight. **EVERY LINE NUMBER BELOW IS AUTHOR-TIME AND WAS MEASURED ON THE LIVE TREE THIS TICK** (`src/meta.js`
is stable - G25 slice 2 touches art/main/render, not the economy tables), but HEAD/dirty and the SUITE
line are CARRIED FROM TICK 54 and were NOT re-run this tick (the builder held the machine):
HEAD `c40abcb`, dirty=25 at dispatch (was 19 at author time), `SUITE greenfiles=92 redfiles=0`. The dispatch tick MUST run the DISPATCH
ANCHOR CHECK below and correct every drifted line in place before issuing this task.
**Ordering:** runs AFTER `docs/briefs/G25_SLICE2_GALLERY.md` (G25 slice 2) has landed and been
pilot-verified, on a tree whose suite ends `redfiles=0`.

## WHAT ALREADY EXISTS (measured on this tree, not remembered)

- **The prices** live in ONE module, `src/meta.js`, in three tables plus the shop rows:
  - `WEAPON_PRICES` :342 - ORBIT 400 / ZAP 800 / NOVA_PULSE 1300 / SCYTHE 2000 / SEEKER 3100 /
    MINE 4800 / **BEAM 110000** (the top-tier trophy). `WEAPON_SLOT_START` :334, `MAX_WEAPON_SLOTS` :335.
  - `SHOP_UPGRADES` :390 - `{id,name,desc,baseCost,costGrowth,maxLevel,perLevel}` rows, incl. the luck
    rows. RE-ANCHORED at dispatch: the LUCK row is `{id:'luck'}` :454-455 (baseCost 500, costGrowth 2.0,
    maxLevel 5) - NOT :478; :477-478 is the SPLIT row (400, 1.35, 10) and :479-480 is the `slots` row
    (5000, 2.9, 3); the top-tier pass row is `arcade` :481-482 (baseCost 140000, growth 1, max 1). Prices here are NOT the flat `baseCost`: `upgradeCost(def, level)` :499 rolls
    `costGrowth` per level - that function is the ONLY cost authority.
  - `ELITE_MODIFIERS` :362 - elite unlocks, priced in the same shape.
  - `buyUpgrade(profile, id)` :508 is the ONE purchase path; `applyMetaBonuses(stats, purchased)` :889
    is the ONE read of purchased effects.
- **The payouts** are a SEPARATE, E1-shaped surface and are NOT what this slice moves:
  - `RUN_GOLD` :167 - `FIRST_CLEAR: 250`, `AWARD: 70` (the flat end-of-run floor).
  - `GOLD_TIER` :271 - per-kill purse tiers, CHAFF 0 / GRUNT 1 / MID 3 / HEAVY 8 / ELITE 15 /
    MID_BOSS 60 / BOSS 150.
  - `GOLD_MODEL` :214 - `INCOME_TIERS` (tier 0 ~70/run, tier 1 ~100, tier 2 ~200, tier 3 ~11000,
    MEASURED by E1's real-loop cohorts), `TOP_TIER_MIN_GOOD_RUNS: 10`, `MID_TIER_IDS` (10 ids),
    `TOP_TIER_IDS: ['weapon_beam','arcade']`.
- **The sim's own targets ENCODE "fast"** - this is the trap the goal names explicitly:
  - `tools/balance_sim.mjs` :80 `SIM_TUNING.MID_TIER_TOL: [0.35, 0.65]` ("tolerance around the ~50%
    directive"), :74 `GOOD_RUN_TARGET: 30`, :157 `SIM_ASSUMPTIONS.apex = false` (:154-157: the apex
    tier is EXCLUDED from every completion figure by charter).
  - `test/test_meta.mjs` :598-600 asserts `halfRuns` (**half-catalog / goodRun**) inside
    **[1.5, 2.5]** - i.e. TWO good runs buy HALF the mid-tier catalogue. :657 pins
    `SIM_ASSUMPTIONS.goodRunGold`, :667/:670/:722 pin the mid/top partition identity.
  - Target (a) printed by the sim is "~10 good runs buys ~50% of mid-tier" (:689-691).
- **The measurement machinery already exists - REUSE IT, NEVER WRITE A SECOND LOOP:**
  `tools/real_loop.mjs` (the shared headless REAL-LOOP harness: builds the three progression-stage
  profiles through the REAL meta.js API and runs whole cohorts), `tools/boss_sim.mjs` (N full runs of the
  real loop, per-wave death-cause table via `state.deathBy`), `tools/gen_earned_profile.mjs` (a
  schema-valid profile with trophies earned through the game's own `recordRun`),
  `tools/balance_sim.mjs --validate` (analytic vs real margin).
- **THERE IS NO ECONOMY LEDGER TOOL.** `ls tools/` has no `economy_ledger.mjs`, no per-item hours table,
  no single-item-cap check, and nothing that measures "can a 40-hour player win". That absence is what
  makes this slice buildable now.

## THE GAP THIS SLICE CLOSES

Owner, verbatim: *"we might still be earning too much gold per run. their feeling of being overpowered
also reads as they want to grind a bit for improvements"*, and his hard targets: *"top tier should take a
few hours to get one top tier item, let alone all of them ... we need around 60+ play hours worth of shop
items determined by gold"* with the finale beatable at ~40 play hours.

Today the economy passes ITS OWN targets, which were written to the OLD, faster intent: an average run
pays ~1,992g and 10 good runs buys **63.3%** of the mid-tier catalogue (goal text, :2355). The goal's
own diagnosis is that the fix is **PRICES, NOT PAYOUTS** (*"prefer PRICES over PAYOUTS"*): runs already
die by ~minute 5, so the shop fills fast because the CATALOGUE IS CHEAP relative to income. And the goal
names the arithmetic blocker: `arcade` + `weapon_beam` are ~48% of the whole catalogue, so a 60-hour
catalogue that still lets one item take "a few hours" is impossible while two mega-priced trophies hold
half the gold - **the hours must come from BREADTH, and no single item may exceed a few hours**.

Nothing measures any of this. This slice builds the ledger, measures the real income on THIS tree, sets
the prices ONCE against that measurement, and re-baselines the sim's targets so a later agent cannot
"fix" the grind straight back out.

## SCOPE (chartered - one slice, end to end)

1. **NEW `tools/economy_ledger.mjs` - the ledger (deterministic, reads the REAL tables through the real
   modules; NOTHING in it rolls dice).** It must print, as raw numbers:
   - the catalogue TOTAL in gold, with the item count, partitioned MID / TOP / other (weapon unlocks,
     elite unlocks, luck ladder - state the partition, do not leave it implicit), through
     `upgradeCost` :499 and `WEAPON_PRICES`/`SHOP_UPGRADES`/`ELITE_MODIFIERS`, never a copied price list;
   - **per item: price, and HOURS at the measured income tier** - state the divisor explicitly (gold/hour
     is `INCOME_TIERS` gold divided by the MEASURED average run length per stage), and print the
     single-item cap violations as a list;
   - **the mid-tier share bought by 10 GOOD runs** (the goal's headline number; measure it, do not quote
     it) and the **FIRST PURCHASE index** (runs of tier-0/1 income to the cheapest real upgrade).
2. **MEASURE the income baseline on THIS tree first - the goal's own sequence: measure, THEN set prices
   once.** Re-run the existing real-loop/sim harnesses (item 1's existing files; read them before you run
   them) and quote income per run per stage with n and seeds. Every price you set is set against THESE
   numbers. If you cannot measure a stage, SAY SO in COULD NOT VERIFY - do not substitute the goal doc's
   older figures (they were taken at commit `6f69bed` and are known stale).
3. **REPRICE - PRICES ONLY. NEVER PAYOUTS.** `GOLD_TIER`, `RUN_GOLD.AWARD`, the purse mechanic and the
   per-kill credits stay BYTE-IDENTICAL. Concretely:
   - the FIRST purchases stay cheap - the first purchase must still land within ~1-3 runs at tier-0/1
     income (a player who feels broke at the start never reaches the grind);
   - the MID tier is STRETCHED so **10 good runs buys roughly 30-40%** of it (down from the measured
     high-60s);
   - **cap any SINGLE item at roughly a few hours of income** at the measured end-game rate (order 26-30k
     - derive the cap from your own measurement and STATE it). This is what forces `weapon_beam` (110,000)
     and the top-tier pass row down from mega-trophy prices;
   - the TOP tier stays a long-term target but still inside the cap.
4. **RE-BASELINE THE SIM'S OWN TARGETS to the NEW intent** (the goal: *"leaving it in place would let a
   later agent 'fix' the grind straight back out"*): `SIM_TUNING.MID_TIER_TOL` (balance_sim :80),
   `SIM_TUNING.GOOD_RUN_TARGET` (:74), `GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS` (meta.js :214 block) and the
   `test/test_meta.mjs` :598-600 band **[1.5, 2.5]**. The new band must READ the new intent (10 good runs
   -> 30-40% of mid-tier) and be quoted in the report with the before/after numbers. Re-baselining a
   numeric band IS the deliverable here; DELETING or loosening the assertion is NOT (the assertion must
   still fail loudly if a later agent retunes the economy back to "fast").
5. **THE BEATABILITY ACCEPTANCE TEST - currently unmeasured, and it is the owner's actual target.**
   Extend `tools/boss_sim.mjs` (or add a tool that REUSES it - never a second frame loop): build a
   profile with ~40 PLAYS HOURS of purchases through the real meta API (`tools/gen_earned_profile.mjs`
   already knows how to reach the earned-profile path) and show the finale is CLEARABLE at a meaningful
   rate, while a FRESH profile is NOT. Raw rates with n and seeds. An honest NULL with the reason is
   acceptable - an unmeasured claim is not.
6. **NEW `test/test_economy_reprice.mjs`** pinning the new invariants: no single item over the stated cap
   at the measured rate; 10-good-run mid share inside the new band; first purchase within 1-3 runs;
   catalogue hours >= 60 at the measured end-game rate **or** a quoted shortfall with the hours the
   breadth expansion must add. Assert the numbers; never weaken an assertion to go green.
7. **REPORT THE 60h ARITHMETIC HONESTLY.** Publish the post-reprice catalogue total and its hours at the
   measured rate. The goal states repricing ALONE cannot reach 60h without breaking the single-item cap -
   if your measurement agrees, QUANTIFY the missing hours and hand them to slice 2 (breadth). Do NOT
   inflate one or two trophy prices to fake the hours: that reproduces the exact lopsidedness the goal
   forbids. This slice sets the SPINE and the measurement; slice 2 owns the added mid-priced CONTENT.

## OUT OF SCOPE (do NOT touch)

- **Payouts and income curves** - `GOLD_TIER`, `RUN_GOLD.AWARD`, the per-kill purse credit, the chest
  values. `GOLD_MODEL.INCOME_TIERS` may only be REPLACED WITH NEWLY MEASURED VALUES (it is a record of
  measurement, not an intent knob); the measured values must not MOVE because of this slice.
- The **apex tier** (G25). It is deliberately game-breaking prestige, and every completion figure stays
  apex-free (`tools/balance_sim.mjs` :154-157). Do not reprice it, do not count it.
- **Adding new catalogue CONTENT** (new rows/weapons/upgrades to reach 60h by breadth) - that is slice 2.
  This slice may only PROVE and QUANTIFY the shortfall.
- **The arch model (G5/W7a tooling).** Do not model arches here. If the finale/beatability measurement
  is impossible without them, record it in COULD NOT VERIFY rather than inventing a model.
- Run length (G18), a second currency (`docs/DESIGN_TARGETS.md` :99: ONE currency is enough), the
  bestiary, G24's heat payout, `src/challenges.js`, `src/heat.js`, `src/save.js` / any schema change.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain | wc -l` + `git log --oneline -3` - record dirty count and HEAD. Confirm G25
   slices 1+2 are PRESENT on the tree (the apex data partition in `src/meta.js`, the apex gallery +
   `src/art/apex.js`), and that G21 slice 2 / G24 slice 1 are still intact.
2. RUN `bash tools/run_suite.sh` and paste its verbatim final line here. If it does not end
   `redfiles=0`, STOP - this slice is not issued on a red tree. (A red reading `no assertion line
   captured` with no log file in `/tmp/hordes_suite` is a runner race between two concurrent suite
   runs - confirm the log exists and re-run before believing it.)
3. Re-resolve on the CURRENT tree and CORRECT IN PLACE: `RUN_GOLD` / `GOLD_MODEL` / `GOLD_TIER` /
   `WEAPON_PRICES` / `SHOP_UPGRADES` / `ELITE_MODIFIERS` / `upgradeCost` / `buyUpgrade` /
   `applyMetaBonuses` in `src/meta.js`; `SIM_TUNING` + `SIM_ASSUMPTIONS` in `tools/balance_sim.mjs`;
   the `halfRuns` band in `test/test_meta.mjs`. `main.js` and `src/art/apex.js` WILL have grown during
   G25 slice 2 - do not quote a main.js line without re-measuring it.
4. Confirm and SAY SO: `GOLD_TIER` / `RUN_GOLD.AWARD` are unchanged from the values above; `apex: false`
   is still in `SIM_ASSUMPTIONS`; `ls tools/economy_ledger.mjs` still does NOT exist (if it does, STOP and
   report - someone else built the ledger and this brief must be reconciled, not duplicated).
5. Name what `test/test_meta.mjs` :590-730 already asserts about the economy, so the new test does not
   duplicate it - it must ADD the cap band, the first-purchase index and the 60h check.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, with the new/changed test
   files named.
2. `node tools/economy_ledger.mjs` output, quoted raw: catalogue total + count, the partition, the
   per-item hours table, the cap-violation list (must be EMPTY after the reprice), the 10-good-run mid
   share, the first-purchase index. Both BEFORE and AFTER the reprice.
3. The measured income baseline on THIS tree, raw, with n and seeds, and an explicit statement of the
   gold/hour divisor.
4. `node test/test_economy_reprice.mjs` GREEN, printing the asserted numbers.
5. `node test/test_meta.mjs` GREEN with the RE-BASELINED band, and the before/after band values quoted
   (old `[1.5, 2.5]` runs-per-half-catalog -> the new number).
6. The beatability harness raw output: the ~40-hour profile's finale clear rate and the fresh profile's,
   with n and seeds - or an honest NULL with the reason.
7. A PROOF that payouts did not move: the income numbers before and after this slice, identical (or the
   exact, justified delta if a measurement disagree, flagged rather than buried).
8. Every file and line changed; every retarget enumerated (file + line + why); the explicit statement
   that no git state command was run; and a COULD NOT VERIFY section.

## HOUSE RULES (binding)

- Do NOT run git commit / checkout / reset / stash / clean. Leave the tree dirty and REPORT the dirty
  count; the orchestrator owns commits.
- NEVER weaken an assertion to go green. Retarget the absolute minimum, enumerated, with the reason.
- Reuse the existing harnesses (`tools/real_loop.mjs`, `tools/boss_sim.mjs`, `tools/balance_sim.mjs`,
  `tools/gen_earned_profile.mjs`). A second frame loop is a defect, not a deliverable.
- A self-report is a claim, not evidence: every number in the acceptance bar must appear as RAW tool
  output with n, or it did not happen.
- NO EMOJIS in any UI or DOM string; the ledger is a CLI tool and prints plain text tables.
- This slice is chartered by the pilot, not by the owner. If a design question the goal does not answer
  blocks you (e.g. what the exact cap should be), make the smallest defensible call, DISCLOSE it, and
  keep going - do not stop to ask, and do not invent new content.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with its raw
output (before AND after); the new target band and the arithmetic behind it; the cap and where it came
from; the flag list; what you could not verify; and the statement that no git state command was run.

## DISPATCH RE-ANCHOR (measured by the goal pilot ON THIS TREE at dispatch, tick 56, 2026-09-15 ~10:58 UTC)

- HEAD `c40abcb`, **dirty=25** (`git log --oneline -3` => c40abcb / b5e86db / 30d14b6).
- `bash tools/run_suite.sh` run by the PILOT this tick => `TREE: /home/claude/projects/hordes @ c40abcb
  | dirty=25` / `SUITE greenfiles=92 redfiles=0` / empty REDLIST.
- G25 SLICES 1+2 ARE LANDED AND PILOT-VERIFIED (uncommitted): `APEX_UPGRADES` src/meta.js :629,
  `APEX_BY_ID` :657, src/art/apex.js (7525 B), the apex gallery in src/main.js (7 APEX_* hits),
  tools/verify_g25_apex.mjs (19/19) and tools/verify_g25_apex_gallery.mjs (**ALL 17 CHECKS PASSED** in
  real Chrome 390x844 @dpr3 this tick). G21 slice 2 / G24 slice 1 intact (their tests are green).
- CORRECTED IN PLACE, every drift named:
  1. `MAX_WEAPON_SLOTS` :336 -> **:335**.
  2. "the luck ladder (:478, baseCost 400, growth 1.35, max 10)" -> :478 is the **SPLIT** row; the luck
     row is **:454-455** (baseCost 500, costGrowth 2.0, maxLevel 5).
  3. "the top-tier pass row (:480, baseCost 5000, growth 2.9, max 3)" -> :479-480 is the **`slots`** row;
     the top-tier pass row is **`arcade` :481-482** (baseCost 140000, growth 1, max 1).
  4. header `dirty=19` -> **25**.
- RE-CONFIRMED UNCHANGED (the slice's premise holds): RUN_GOLD :167 (FIRST_CLEAR 250, AWARD 70 :181);
  GOLD_MODEL :214, INCOME_TIERS :231, TOP_TIER_MIN_GOOD_RUNS :237, TOP_TIER_IDS :245; GOLD_TIER :271
  (ELITE 15 :276 / MID_BOSS 60 :277 / BOSS 150 :278); WEAPON_PRICES :342 (BEAM 110000 :352);
  ELITE_MODIFIERS :362; SHOP_UPGRADES :390; upgradeCost :499; buyUpgrade :508; applyMetaBonuses :889;
  balance_sim SIM_TUNING :67 (GOOD_RUN_TARGET :74, MID_TIER_TOL :80), SIM_ASSUMPTIONS.apex:false :157;
  test_meta halfRuns band [1.5, 2.5] :599-601; docs/DESIGN_TARGETS.md :43-49; goals doc :2349.
- `ls tools/economy_ledger.mjs` => **No such file or directory** - the ledger does NOT exist; this
  slice builds it (STOP-and-report condition does not fire).
- VERDICT: every line number in this brief other than the four above is correct as written on this tree.
