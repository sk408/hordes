# W7A SLICE 2 - META UPGRADES BY MEASURED MARGINAL VALUE + WEAPON-UNLOCK DILUTION

Goal it serves: **BUILD_PLAN W7a (SIM TOOLING)**, the execution-order item
`H1 -> P1 -> A1 -> A2 -> E1 -> W7a-tooling -> W7b -> E2 -> S1 -> M1 -> ranked queue`
(`docs/HORDES_GOALS_2026-09-12.md` :1188-1210). Slice 1 (the arch-buff model) is in flight / just
landed; THIS is the remaining half of W7a-tooling, and it is an OWNER DIRECTIVE, not an invention:
**Sk408, verbatim** (`docs/HORDES_GOALS_2026-09-12.md` :2084-2100, G5 section):

> *"loops should also include meta upgrades. Weapon spots are valuable, new weapons can be valuable but
> also dilute picks with limited weapon spots. You might want to rank the meta upgrades to determine
> how they are simulated."*
> - *"Meta upgrades must be SIMULATED IN A RANKED ORDER DERIVED FROM MEASURED MARGINAL VALUE, not a
>   hardcoded greedy list. Report the ranking and where the assumed order was wrong."*
> - *"Weapon unlocks must be modelled as +1 option AND draft-pool DILUTION against a scarce slot count.
>   Report each unlock's NET value at the real slot counts, and answer whether unlocking is ever
>   net-negative at 3 slots. Design intelligence the owner explicitly wants."*
> - *"Divergence (G6) must be reported for BOTH a fresh profile and a developed one."* (measurement
>   only in this slice - see REMAINS; do NOT touch the balance ladder, G6 is frozen by owner ruling.)

## GATE - READ BEFORE PLANNING ANY WORK

**TOOLS + TEST ONLY. No `src/` file may be edited** (not `src/meta.js`, not `src/main.js`, not
`src/rewrites.js`), and **no balance change of any kind** - this slice MEASURES the ladder that ships and
REPORTS what it finds. If the meta ladder, the slot counts or the offer weights look wrong while you
model them, that is a **FINDING**: report it with raw numbers and STOP on that item. A defect you fix
without instructions is a scope violation, and a balance you retune is a violation of the owner's
standing freeze on the G6/W7b ladder.

## HOUSE RULES (binding, same as every slice)

- **ONE WRITER PER FILE.** New work goes in NEW files. `tools/balance_sim.mjs`, `tools/draft_sim.mjs`
  and `tools/real_loop.mjs` are SHARED (run_curve.mjs, economy_ledger.mjs, w7b_draft_ab.mjs drive them) -
  ADD ONLY; never change an existing behaviour, signature or output line. Slice 1's own additions
  (`tools/arch_model.mjs`, the real_loop arch counters, the `--arches` block, `test/test_arch_model.mjs`)
  are LANDED WORK: do not edit or "improve" them; if one of them is broken, that is a finding.
- **NO git state commands** (commit/checkout/reset/stash/clean). Leave the tree dirty and report the
  dirty count. Commits belong to the orchestrator.
- **NO EMOJIS anywhere. Integer pixels. 60Hz AND 120Hz both correct** - nothing may assume a fixed dt.
- **THE OWNER'S STANDING 60-SECOND CAP** (`G27`, `docs/HORDES_GOALS_2026-09-12.md` :2570+). No single
  command may exceed 60 s wall. Cohorts are CHUNKED: one run per process through the EXISTING one-run
  seam (`node tools/run_curve.mjs --run <stage> --seed <s> --out /tmp/w7a2_meta/<stage>_<seed>.log`).
  Do NOT build a second harness. Do NOT re-run the maxed stage (1800 s wall) - quote the existing
  `MEASURED.maxed` and `/tmp/g17_1b/maxed_r1.log` when a developed profile is needed.
  **Budget the sweep before you run it**: state the number of cells (rows x levels x arms x seeds) and
  the wall estimate in the report; cap any single cell at ~8 paired runs and STOP AT THE SIGN.
- Append a timestamped heartbeat line to `/tmp/w7a2_meta_progress.log` BEFORE and AFTER every step that
  can exceed a few seconds. Never run the suite concurrently with another suite.
- **EVIDENCE DISCIPLINE:** every number in the report is quoted from a raw log under `/tmp/w7a2_meta/`,
  never retyped from memory. A self-report is a claim; the numbers must be greppable.
- Full suite after the work: `bash tools/run_suite.sh` must end `redfiles=0`; report the
  `TREE ... dirty=n` and `SUITE greenfiles=N redfiles=0` lines verbatim. Tests may be RETARGETED
  (file + line + why) but never weakened, deleted or no-op'd.
- **Lock discipline:** if `.agentlock` is held, sleep 20 s and re-check, up to 15 times (5 min). Never
  edit while another owner holds it. Take the lock before your first edit, release it when done.

## MEASURED STATE ON THIS TREE (pilot-read 2026-09-16 ~03:10 UTC with no lock held; RE-RESOLVE EVERY ANCHOR at dispatch - line numbers WILL have drifted by slice 1's landing)

**The meta ladder - the ONE source of truth you must read, never re-declare.**
- `src/meta.js` (:1302 lines) `SHOP_UPGRADES` starts :421 - rows carry `id`, `name`, `desc`, `maxLevel`,
  `baseCost`, `costGrowth` (e.g. `dmg` "Forged Edge" +200% weapon damage per level). `WEAPON_PRICES`
  :371 (the weapon rows the greedy order also buys). `ELITE_MODIFIERS` :390 (SWIFT/SPLITTING/VAMPIRIC).
  `STARTER_WEAPONS` :84 (`VOLLEY`, `BOOMERANG`). **`WEAPON_SLOT_START = 3` :358** and
  **`MAX_WEAPON_SLOTS = 6` :359** - the real slot counts the dilution answer must be taken at.
  `nextCost(profile, def) = round(baseCost * costGrowth ** level)` is the cost shape the sim uses
  (`tools/balance_sim.mjs` ~:486).
- `src/main.js` :367 `weaponSlots: 6` / :377 `weaponCap` / :1215 + :2378 `state.weaponSlots =
  min(weaponCap, baseWeaponSlots + bonus)` / :4463-4466 the draft offer walk (`cap = weaponSlots - 1`) /
  :5241-5246 `startRun` stamps the per-run slot count from `startWeaponSlots(profile)`. If your model
  needs the offer walk, READ it from there; if that walk is not exportable without editing `src/`, model
  it from the constants you CAN import and say so in the honesty block.

**The hardcoded order the owner is asking about (this is the thing to MEASURE against, not replace blindly).**
- `tools/balance_sim.mjs` `GREEDY_PRIORITY` (pilot-read :452-466) is a literal list: sixteen stat rows
  sorted by `baseCost` (`fleetfoot, briarmail, lodestone, hollowpoint, ironheart, hairtrigger, headsman,
  bloodpact, fanfire, deepread, aethertap, grandelixir, deepfont, eagleeye, staticfield, laststand`),
  then `weapon_beam`, `arcade`. `greedyShop()` :468 walks it top-down and buys the first affordable row.
  `shopRowDone()` :481 and `nextCost()` :486 are the row test/cost. **This order was ASSUMED, not
  measured** - the owner wants the measured ranking plus an explicit list of where this assumed order
  was WRONG.
- `tools/balance_sim.mjs` :261 `buildPower(profile)` already carries an unlock term at ~:269:
  `p *= 1 + 0.08 * max(0, profile.unlockedWeapons.length - STARTER_WEAPONS.length)` - i.e. each extra
  unlock is priced as a flat **+8% power** with NO dilution. Report, with numbers, whether that term
  survives the measured dilution model or contradicts it. Do NOT edit it; a contradiction is a FINDING.
- `tools/balance_sim.mjs` :41-42 / :217: `SIM_ASSUMPTIONS` is DERIVED from `meta.js`/`config.js` at
  import time and `test/test_meta.mjs` asserts the derivation stays locked. Your new tables must be
  derived the same way or the drift lock will read as a red.

**What already exists on the measured-value axis (do NOT duplicate it).**
- `tools/draft_sim.mjs` **already has a `--meta-value` mode** (usage :109 "every shop stat row ranked by
  MEASURED marginal value", implementation :1599). **RUN IT FIRST** (`node tools/draft_sim.mjs
  --meta-value`, well under the cap) and quote its current output verbatim in your report. Slice 2 EXTENDS
  that axis to (a) the weapon rows and elite rows, (b) the dilution term, (c) the order delta against
  `GREEDY_PRIORITY`; it does not rewrite what already measures.
- The game-side draft-pool weight lives in `src/rewrites.js` (`REWRITE_CARD_WEIGHT` :225 and the
  per-class accounting in the comment block :199-235). Read the pool composition from the game's own
  exports/constants; do not hardcode a card count.

**Baseline at authoring (RE-RUN, do not trust):** HEAD `1fda37d`, `git status --porcelain` = 12 lines
(slice 1 in flight). Run `bash tools/run_suite.sh` FIRST and post `blocked:` if it is red before you
start, quoting the REDLIST.

## SCOPE

Increase only. Files you may touch: NEW `tools/meta_rank.mjs`, NEW `test/test_meta_rank.mjs`, NEW output
logs under `/tmp/w7a2_meta/`, plus ADDITIVE edits to `tools/balance_sim.mjs`, `tools/real_loop.mjs` and
`tools/draft_sim.mjs` (add a flag/print; do not alter an existing printed line). You may add at most ONE
new verify tool beyond the ranker. Do NOT touch `src/**`, `index.html`, `tools/browser.mjs`,
`tools/arch_model.mjs`, `test/test_arch_model.mjs`, or any existing test file's assertions.

## DELIVERABLES

1. **`tools/meta_rank.mjs` (NEW) - the measured marginal-value ranker.** Import the ladder from
   `src/meta.js` at import time (every row id, `baseCost`, `costGrowth`, `maxLevel`, kind:
   weapon/elite/stat). For each purchasable row, measure the marginal value of **exactly one level**
   bought at a DECLARED baseline, and print a ranked table: `rank | id | kind | cost | delta-metric |
   delta-per-1000-gold | greedy-position | delta-vs-greedy`. Requirements:
   - Declare the baseline in the code and in the report: profile (fresh / developed / maxed - at
     minimum fresh + one developed drawn from existing measured profiles), gold budget, run index,
     slot count, character, and the METRIC (say what it is: run length, kill-gate margin, waves
     reached, or the sim's own survival index) plus why that metric.
   - PAIRED SEEDS: the same seed list for the with-row and without-row arms; print n per cell.
   - Deterministic: same seed list -> byte-identical table, and the determinism is asserted in the test.
   - Print the **order delta against `GREEDY_PRIORITY`** as an explicit list: rows the hardcoded order
     buys too early, rows it buys too late, rows whose measured marginal value is ~0. That list is the
     owner's actual ask ("where the assumed order was wrong").
2. **The weapon-unlock dilution model (in the same tool, or one extra NEW file).** For each unlockable
   weapon, at the REAL slot counts (`WEAPON_SLOT_START` 3 ... `MAX_WEAPON_SLOTS` 6, READ not hardcoded):
   - **+1 option term:** marginal value of the weapon becoming available to the draft (price it off the
     weapon's own dps curve, the way `tools/draft_sim.mjs` already prices a level-up: read that seam, do
     not invent a second dps model).
   - **Dilution term:** the cost of the extra card in the offer pool at the offer size and per-class
     weights the game actually uses (read `src/rewrites.js` / the offer code; state the offer size you
     read).
   - **NET value per unlock, per slot count**, plus the direct answer to the owner's question: **is
     unlocking ever NET-NEGATIVE at 3 slots?** The answer is policy-dependent - report it under a
     DECLARED pick policy (at minimum: random, greedy-by-dps, and the draft_sim policy) and say where
     the policies disagree. **If the net is positive at every slot count for every weapon, that is an
     HONEST NULL and a valid outcome** - say so with the numbers, and state that the owner's
     hidden-tradeoff escalation rule (a net-negative *and* irreversible purchase) does NOT trigger.
     Do NOT tune the model to manufacture a negative.
3. **`tools/balance_sim.mjs` + `tools/real_loop.mjs` - ADDITIVE ONLY.** A `--meta-order measured|greedy`
   flag for the sim (DEFAULT `greedy` = today's behaviour, output byte-identical), and ONE greppable
   per-run line in `real_loop.mjs` recording which meta order the run used plus the unlocks purchased.
   Do NOT change `GREEDY_PRIORITY`, `greedyShop`, `buildPower`, or any existing printed number. If the
   measured order changes a previously reported figure, print BOTH (before/after) and label them - never
   silently redefine a number.
4. **`test/test_meta_rank.mjs` (NEW) - drift locks against the GAME's own code, not a copy:**
   the ranked universe equals `meta.js`'s purchasable rows EXACTLY (every id present, none invented,
   asserted both directions); costs reproduce `nextCost`'s formula for a named row at level 0 and 1;
   `WEAPON_SLOT_START`/`MAX_WEAPON_SLOTS` are READ (change-the-constant test or an import identity
   assertion, the way `test_meta.mjs` pins its derivations); same seed -> identical table; the reported
   greedy-delta list is non-empty whenever the orders differ and empty when they agree; the `--meta-order
   greedy` default leaves the sim's output byte-identical (golden line compare against a raw log).
5. **THE REPORT**, per the format below.

## ACCEPTANCE BAR (all of it, or it is not done)

1. `node tools/meta_rank.mjs` rc=0, prints the ranked table, the declared baseline, n per cell, and the
   greedy-delta list.
2. `node tools/draft_sim.mjs --meta-value` still rc=0 and its output is UNCHANGED from the output you
   quoted at the start (prove it: diff the two captured logs).
3. `node tools/balance_sim.mjs` (default) still rc=0 and prints the SAME numbers as before your edits
   (diff against a pre-edit capture), and `--meta-order measured` additionally prints the measured-order
   block.
4. `node test/test_meta_rank.mjs` = ALL CHECKS PASSED, printing the values it compared.
5. `bash tools/run_suite.sh` ends `greenfiles=<n> redfiles=0` - report the count and the `TREE`/`HEAD`
   line verbatim, REDLIST empty.
6. The dilution question is ANSWERED with numbers at slots 3, 4, 5, 6 under each declared policy, or
   declared an honest NULL with the numbers that support it.
7. Every number quoted from a raw log under `/tmp/w7a2_meta/`; the sweep shape (cells, wall) is stated.
8. Nothing in `src/**` changed: prove it (`git status --porcelain src/` empty, reported verbatim).

## REPORT FORMAT

`done:`/`blocked:` post to the hordes channel FIRST (raw evidence lines, not prose), then:
1. **WHAT LANDED** - files + `node --check` results.
2. **THE MEASURED RANKING** - the table, the baseline declaration, n, and the greedy-delta list.
3. **DILUTION** - per-unlock net value at slots 3/4/5/6 per policy, and the direct answer to "ever
   net-negative at 3 slots?".
4. **BEFORE/AFTER** - the unchanged-output diffs (items 2 and 3 of the bar above).
5. **SUITE** - the `TREE ... dirty=n` line + `SUITE greenfiles=N redfiles=0` verbatim.
6. **FINDINGS / COULD NOT VERIFY** - every model limitation in an honesty block (what is not read from
   the game, what is assumed, what the 60 s cap forced you to skip), and every defect found in game code
   WITHOUT fixing it.

## REMAINS (not this slice - name them in the report so they are not lost)

- **G6 / W7b is FROZEN BY OWNER RULING, not by us** (`docs/HORDES_GOALS_2026-09-12.md` :2103): *"Keep w7b
  as is. I think the method of measurement might be off a bit to be honest."* The ladder stays
  byte-stable; the live G6 work item is the INSTRUMENT review (a coherence A/B on `tools/real_loop.mjs`),
  and it is NOT this slice. `docs/briefs/W7B_DRAFT_DIVERGENCE.md` is authored against a PRE-RULING tree
  and must NOT be re-issued verbatim - the dispatch tick re-anchors or rewrites it.
- Next after W7a-tooling in the EXECUTION ORDER is **W7b -> E2 (horde) -> S1 (shrines)**, then the ranked
  queue (G11, G12, G13/G14, G20, G21, G24, G25, G17-repricing); G5 closes only once its four bar items
  have been re-read with the arch term live (slice 1's acceptance) AND its meta directive answered (this
  slice).
- The 60 s cap means no maxed-stage re-run here - quote `MEASURED.maxed` / `/tmp/g17_1b/maxed_r1.log`.

## DISPATCH ANCHOR CHECK (to be FILLED AT DISPATCH on the live tree - every line number above MUST be
RE-RESOLVED then and any drift CORRECTED IN PLACE here, with the superseding line quoted; the dispatch
tick also states the HEAD and dirty count it re-anchored at)

- [ ] `src/meta.js` SHOP_UPGRADES / WEAPON_PRICES / ELITE_MODIFIERS / STARTER_WEAPONS /
      WEAPON_SLOT_START / MAX_WEAPON_SLOTS / nextCost
- [ ] `src/main.js` startRun slot stamping + the draft offer walk (`cap = weaponSlots - 1`)
- [ ] `src/rewrites.js` REWRITE_CARD_WEIGHT + the offer-class weight block
- [ ] `tools/balance_sim.mjs` GREEDY_PRIORITY / greedyShop / shopRowDone / nextCost / buildPower
      unlock term / SIM_ASSUMPTIONS + CAL block; the PRE-EDIT capture of its default output taken
- [ ] `tools/draft_sim.mjs` `--meta-value` mode + its output captured verbatim
- [ ] slice 1 artifacts exist (`tools/arch_model.mjs`, `test/test_arch_model.mjs`, the `--arches` flag):
      if they do NOT, STOP and report `blocked:` - slice 1 has not landed and slice 2 must not paper over it
- [ ] `bash tools/run_suite.sh` green BEFORE any edit (quote `TREE` + `SUITE` lines), else `blocked:`
- [ ] `node --check` on every file you touch; new test named per the existing `test/` convention
