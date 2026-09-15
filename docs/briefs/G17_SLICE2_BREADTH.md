# G17 SLICE 2 - THE BREADTH PASS: BUY THE 60 HOURS WITH CONTENT - BUILD BRIEF

**Slice:** G17 slice 2 (THE ECONOMY MUST REQUIRE A REAL GRIND). Slice 1 (the economy ledger + the price
spine) is the prerequisite and MUST be landed and pilot-verified first. READ THE FULL G17 ENTRY FIRST:
`docs/HORDES_GOALS_2026-09-12.md` :2349 (authoritative). The run-length model the hours are computed
against is `docs/DESIGN_TARGETS.md` :43-49; the catalogue shape the breadth pass moves toward is
`docs/DESIGN_TARGETS.md` :60-66 (target ~130-150 entries: 35-45 weapons + 20-25 global scalers +
60-80 relics) and `docs/CATALOGUE_PLAN.md`.
**Builder:** whichever lane answers the dispatch probe (glm is the live lane; kimi is on the provider wall).
**Brief authored by:** the goal pilot, 2026-09-15 (tick 57), OUTSIDE the repo while G17 slice 1 was in
flight. **EVERY LINE NUMBER BELOW IS AUTHOR-TIME AND WAS MEASURED ON THE LIVE TREE THIS TICK** — but the
## FILLED DISPATCH RE-ANCHOR (goal pilot tick, 2026-09-15 17:05 UTC, HEAD `3c90291` dirty=0 — the pilot RE-RAN every anchor below at dispatch and all of them hold) — SUPERSEDES EVERY LINE NUMBER BELOW
**STATUS OF THIS FILE:** this is NOT a brief. It is the content for `docs/briefs/G17_SLICE2_BREADTH.md`'s
DISPATCH RE-ANCHOR position (`/tmp/hordes_briefs/G17_SLICE2_BREADTH.md` :130 "DISPATCH ANCHOR CHECK"), which
that brief explicitly orders the issuing tick to run and CORRECT IN PLACE. It was pre-measured while G17
slice 1c was still IN FLIGHT (the builder held the box; the pilot may not edit the repo on a busy tick), so
every anchor below is a MEASURED reading on HEAD `18eaa8b` at dirty=14 - re-read any anchor at or below the
economy tables BEFORE splicing, because 1c was still writing (`test/test_beatability.mjs`, 6089 B, 16:00).

## 1. ANCHOR (measured 2026-09-15 16:20 UTC)

- `git log --oneline -3` => HEAD **`18eaa8b`** ("G17 slice 1 (PARTIAL, unmeasured): economy ledger harness + boss_sim hours:H arm"); parent `ba4264f` (G25 slices 1+2).
- `git status --porcelain | wc -l` => **dirty=14** (1b verification read dirty=12; 1c added 2 paths - the tree is dirty BY DESIGN, the orchestrator owns commits).
- SLICE 1 PREREQUISITE GATE - re-run at dispatch, this is the state PRE-MEASUREMENT: `tools/economy_ledger.mjs` EXISTS (10995 B), `test/test_economy_reprice.mjs` EXISTS (5825 B), `MEASURED` (:58-62) carries all three stages filled (fresh n=8/1337 `164.5/71/11.6s`, partial n=8/1337 `156.3/98/26.4s`, maxed n=1/1337 `754689/754689/1800s`) and 1b's landed report read `CAP VIOLATIONS: (none)` with rc=0. `test/test_beatability.mjs` EXISTS (6089 B) - slice 1c's artifact, still IN FLIGHT, NOT yet pilot-verified: do not quote its rate as landed.

## 2. THE BEFORE COLUMN FOR THIS SLICE'S REPORT (slice 1's measurements, post-1b, recorded; re-run the ledger at dispatch, do not retype these blind)

- catalogue **29,590,633g across 32 items** (MID 10 / TOP 2 / OTHER 20); partition MID `20,740,200g`, TOP `8,700,000g`, OTHER `150,433g`
- divisor: tier-3 `754,689g/run` / measured `1800s` mean run = **1,509,378g/hour**; single-item cap `4,528,134g` (3h)
- **`CAP VIOLATIONS: (none)`**; 10-good-run mid-tier share **36.4%** (band 30-40%); first-purchase index **2.86 runs** (band 1-3)
- **catalogue hours @ end-game rate: 19.6h** (owner target 60+; **shortfall 40.4h = this slice's target, state it as a number first**)
- re-baselined `halfRuns` band: `test/test_meta.mjs` **:617-619** = `[12.5, 16.7]`
- beatability BEFORE: slice 1c measured the fresh arm (cannot clear) vs the saturated `hours:40` build; raw logs under `/tmp/g17_1c/` (`fresh_n8_seed1337.log`, `hours40_n1_seed1337.log`, `maxed_n1_seed1337.log`) - read 1c's `done:` post + the pilot's verification note for the landed BEFORE row rather than recomputing it.

## 3. CORRECTED ANCHORS - the brief's stored line numbers are PRE-1b AND ARE ALL STALE (they were measured on the dirty slice-1 tree). Use these.

`src/meta.js` (measured this tick):
- `GOLD_MODEL` **:214** (block containing `INCOME_TIERS` **:231**, `MID_TIER_IDS` **:251**, `TOP_TIER_IDS` **:256**)
- `MAX_WEAPON_SLOTS` **:346** (brief said 335)
- `WEAPON_PRICES` **:358** (brief said 342) | `ELITE_MODIFIERS` **:377** (brief said 362) | `SHOP_UPGRADES` **:408** (brief said 390)
- `SHOP_BY_ID` **:509** (brief said 484) | `upgradeCost` **:524** (brief said 499) | `buyUpgrade` **:533** (brief said 508)
- `APEX_UPGRADES` **:654** (brief said 629; never touch, never count)
- `applyMetaBonuses` **:914** (brief said 889)

`tools/balance_sim.mjs`: import `SHOP_UPGRADES` **:55** | `SIM_TUNING` **:67** (`GOOD_RUN_TARGET: 120` :78, `MID_TIER_TOL: [0.30, 0.40]` :88) | `SIM_ASSUMPTIONS` **:137** (`MID_TIER_IDS: GOLD_MODEL.MID_TIER_IDS` :157, `midTierCost` :161) | **the sim's catalog build is `GREEDY_PRIORITY` :407 with its `SHOP_UPGRADES.filter(kind==='weapon' && id!=='weapon_beam')` + `filter(kind==='elite')` at :409-411** (the brief's ":401-403" is stale).

`test/test_meta.mjs`: `halfRuns` **:617-619** | the mid+top partition constant is asserted **:740-744** and its CURRENT value is **`29440200`**, NOT the brief's `290500` and NOT 29,050,000 - re-read it, do not reuse any number from the brief. `test/test_art_lint.mjs`: `EXPECTED_SHOP` **:66**, icon-per-row assertion **:240-241**.

`src/main.js` `SHOP_UPGRADES` reads: import **:81**, panel build **:3030/:3034**, **:4303**, **:4359**, **:5169/:5174**. `src/achievements.js`: import **:40**, rows **:286**, `shopRows` count **:312**.

## 4. WHAT THIS SLICE MUST NOT DUPLICATE (adds to, never re-asserts)

`test/test_economy_reprice.mjs` (15 checks) already asserts the divisor identity (`INCOME_TIERS[3].gold === MEASURED.maxed.goldMean` :33-34), the cap, the mid share band and the first-purchase index; `test/test_meta.mjs` already asserts the two `MID_TIER_IDS` arrays are IDENTICAL (:688) and the partition constant (:744). This slice's NEW test work is therefore: an icon for every new row (`EXPECTED_SHOP` +1 per row), partition membership in BOTH arrays, every new `perLevel` REACHABLE through `applyMetaBonuses`, and TOTAL HOURS >= 60 at the measured divisor. Re-baselining a numeric band IS the deliverable; deleting/loosening/skipping an assertion is NOT.

## 5. SEQUENCING NOTE

Issue slice 2 only AFTER the pilot has verified slice 1c on the artifact (its `test/test_beatability.mjs` is currently unverified and its rate is the BEFORE row for acceptance item 7). If 1c reports the price table is wrong, that is a FINDING to carry into slice 2's arithmetic - not a licence to reprice inside slice 2 (out of scope in the brief).
tree was DIRTY WITH SLICE 1 IN FLIGHT, so `src/meta.js` prices, and any line at or below the economy
tables, WILL have moved by dispatch. The dispatch tick MUST run the DISPATCH ANCHOR CHECK and correct every
drifted line in place before issuing this task.
**Ordering:** runs AFTER `docs/briefs/G17_REPRICING.md` (slice 1) has landed and been pilot-verified, on a
tree whose suite ends `redfiles=0` and whose ledger prints an EMPTY cap-violation list.

## WHAT ALREADY EXISTS (measured on this tree, not remembered)

- **The catalogue is THREE priced tables in ONE module, `src/meta.js`** (slice 1 repriced them but did not
  move them): `WEAPON_PRICES` :342 (weapon unlock rows), `SHOP_UPGRADES` :390 (the stat/slot rows,
  `{id,name,desc,baseCost,costGrowth,maxLevel,perLevel}`), `ELITE_MODIFIERS` :362 (elite unlock rows).
  `SHOP_BY_ID` :484 is the id -> row map. `upgradeCost(def, level)` :499 is the ONLY cost authority
  (prices are NOT the flat `baseCost` - they roll `costGrowth` per level). `buyUpgrade(profile, id)` :508
  is the ONE purchase path; `applyMetaBonuses(stats, purchased)` :889 is the ONE read of purchased
  effects. `MAX_WEAPON_SLOTS` :335.
- **`APEX_UPGRADES` :629 is a SEPARATE array and must NEVER receive breadth rows** (G25 charter; its
  partition is asserted apex-free).
- **The tier partition is a pair of id lists that MUST stay in lockstep:** `GOLD_MODEL.MID_TIER_IDS` /
  `TOP_TIER_IDS` (`src/meta.js` :214 block) and `SIM_ASSUMPTIONS.MID_TIER_IDS` / `TOP_TIER_IDS`
  (`tools/balance_sim.mjs`). `test/test_meta.mjs` :667-669 asserts the two pairs are IDENTICAL arrays;
  `tools/balance_sim.mjs` :401-403 builds its catalog from `SHOP_UPGRADES` filtered by `kind`
  (weapon rows excluding `weapon_beam`, plus the elite rows).
- **The measurement instrument exists after slice 1:** `tools/economy_ledger.mjs` (catalogue total +
  count, the MID/TOP/other partition, per-item hours at the MEASURED rate with the divisor stated, the
  cap-violation list, the 10-good-run mid share, the first-purchase index) and
  `test/test_economy_reprice.mjs` (the re-baselined invariants). REUSE BOTH - never write a second ledger,
  never re-derive hours by hand.
- **`GOLD_MODEL.INCOME_TIERS`** (`src/meta.js` :231) is a RECORD OF MEASUREMENT (tier 3 was 11000 g/run
  before slice 1; slice 1 replaces those values with its own measurement). It is not an intent knob.
- **Art is a hard gate on catalogue rows.** `src/art/shop_icons.js` holds `SHOP_ICONS`, `SHOP_ICON_IDS`,
  `SHOP_ICON_FALLBACK_ID` and `shopIcon(id)`. `test/test_art_lint.mjs` :66-75 hard-codes `EXPECTED_SHOP`
  (every row id + the two starters + the two apex rows + `__fallback`) and asserts, BOTH from the
  hardcoded list and by importing the REAL `meta.js` (:334-352): every `SHOP_UPGRADES` row has an icon,
  every `APEX_UPGRADES` row has an icon, and no icon exists for a row that is gone. Limits contract:
  SHOP_ICON w/h in [12,16], max 5 palette keys, minCoverage 0.12, requireInk.
- **`src/achievements.js` reads the row count:** :286 iterates `SHOP_UPGRADES`, :312 `stat === 'shopRows'`
  returns `SHOP_UPGRADES.length` (the "own every row" achievement). New rows MOVE that bar.
- **The shop UI walks the same table:** `src/main.js` :3030-3035 (missing-row scan), :4303-4308 (panel row
  build, `shopRowOwned`), :4359 (remaining-row count). The panel must still fit a phone.
- **Save needs NO schema change for new rows:** `src/save.js` :317-336 builds `profile.purchased` as an
  id -> level map, PRESERVES unknown ids, and clamps known ones to `def.maxLevel`. Verify with the
  existing save tests rather than assuming.
- **Design rules that bind this slice:** `docs/DESIGN_TARGETS.md` rule 3 ("RULES BEAT STATS FOR DEPTH") and
  rule 9 ("ONE CURRENCY IS ENOUGH"); :43-49 ("DO NOT COMPUTE 60h FROM THE LIMIT ... average run length
  rises across a playthrough").

## THE GAP THIS SLICE CLOSES

The owner's hard targets (verbatim, goals doc :2349): *"top tier should take a few hours to get one top
tier item, let alone all of them. and the final boss should be beatable when the player has acheived
around 40 play hours worth of shop items, so we need around 60+ play hours worth of shop items determined
by gold."* Slice 1 measured the shortfall and proved the goal doc's own arithmetic: repricing alone cannot
reach 60h while no single item exceeds a few hours, because two mega-priced trophies were ~48% of the
catalogue. **Slice 2 is the half that closes it: buy the missing hours with mid-priced CONTENT, not with
trophy prices.**

## SCOPE (chartered - one slice, end to end)

1. **READ THE LEDGER FIRST, AND QUOTE IT.** `node tools/economy_ledger.mjs`. Take slice 1's post-reprice
   catalogue total, item count, per-item hours, cap-violation list, 10-good-run mid share, first-purchase
   index and TOTAL HOURS. **The shortfall (60h minus the measured total hours) is this slice's target -
   state it as a number before you add anything.** If the ledger does not exist, or its cap-violation list
   is NOT empty, STOP and report (see the anchor check's STOP conditions).
2. **DERIVE THE ADDED CONTENT ARITHMETICALLY, THEN SHOW THE ARITHMETIC.** From the measured mid-band price
   level and the measured gold/hour divisor, print the hours-per-item at the mid band, then
   `N = shortfall_hours / hours_per_item` and the price band you will place rows in. Every added row's
   price must sit inside the slice-1 single-item cap, and the SHAPE must respect the goal's own fix
   (goals doc :2349 items 1-3: cap any single item at a few hours; reach 60h by BREADTH; keep the early
   ladder cheap). Do NOT inflate one or two trophies to fake the hours - that reproduces the exact
   lopsidedness the goal forbids.
3. **ADD THE ROWS TO `SHOP_UPGRADES`** (`src/meta.js`), each as a complete `{id,name,desc,baseCost,
   costGrowth,maxLevel,perLevel}` row with a REAL effect read through the ONE path
   `applyMetaBonuses(stats, purchased)` :889. **A row whose `perLevel` no code reads is a DEAD ROW and is
   a defect, not a deliverable.** Ids are `snake_case`, distinct from every existing id and from
   `weapon_*` / `elite_*` / `apex_*` prefixes. `desc` is player-facing copy: plain, no emojis, no em
   dashes, matching the voice of the existing rows. Add a sibling array ONLY if a row genuinely cannot be a
   shop row, and disclose the reason - the shop panel, the achievement counter and the ledger all read
   `SHOP_UPGRADES`, so a second catalogue is a cost, not a free choice.
4. **PREFER RULE-SHAPED ROWS OVER PURE MULTIPLIERS where an EXISTING hook allows it** (DESIGN_TARGETS rule
   3 - depth comes from interaction, not count), e.g. a scaler that reads a condition the game already
   tracks. Do NOT invent new systems, new currencies, new save fields, or new data models to do it; if a
   row can only be a flat multiplier, ship it as one and say so.
5. **ART IS PART OF THE ROW.** Every new row gets an authored 16x16 icon in `src/art/shop_icons.js`
   following the A2 house rules already documented in that file (1 ink outline, 2 base, 3 rim light
   top-left, 4 shade bottom-right, 5 accent; max 5 palette keys; same single lighting direction), with
   `EXPECTED_SHOP` in `test/test_art_lint.mjs` updated IN THE SAME EDIT. Keep the generic fallback
   reserved, never used as a row's real icon.
6. **UPDATE THE PARTITION AND THE SIM, IN LOCKSTEP.** Every new MID-priced row id goes into BOTH
   `GOLD_MODEL.MID_TIER_IDS` (meta.js) AND `SIM_ASSUMPTIONS.MID_TIER_IDS` (balance_sim.mjs) - the two
   arrays are asserted IDENTICAL - and must be included by the sim's catalog build (:401-403). Then
   re-baseline the numeric assertions that the added content legitimately moves: at minimum the `halfRuns`
   band (`test/test_meta.mjs` :598-600) and the mid+top partition constant (:723, which slice 1 already
   retargeted once - re-read its CURRENT value, do not reuse the 290500 in this brief). Re-baselining a
   numeric band IS the deliverable; DELETING, loosening or skip()-ing an assertion is NOT. Every retarget
   enumerated with file + line + reason.
7. **RE-MEASURE AFTER, ON THE ARTIFACT, NOT BY INTENTION.** Re-run `node tools/economy_ledger.mjs` and
   publish: catalogue total + count, per-item hours table, **cap-violation list (must be EMPTY)**, the
   10-good-run mid share (must stay inside slice 1's re-baselined band), the first-purchase index (first
   purchase still lands within ~1-3 runs), and TOTAL HOURS >= 60 at the measured divisor - or a quoted
   remaining shortfall with the reason. Then RE-RUN the beatability harness slice 1 built: the ~40-hour
   profile must still clear the finale at a meaningful rate and a fresh profile must still not - BEFORE and
   AFTER breadth. **60 hours of SHOP ITEMS must not make the ~40-hour boss target unreachable**; that
   pairing IS the owner's target. Raw rates with n and seeds, or an honest NULL with the reason.
8. **THE SHOP MUST STILL BE PLAYABLE ON A PHONE.** All rows (old + new) must be reachable in the real shop
   panel at 390x844 @dpr3 - real taps, a real purchase at the price `upgradeCost` reports, and the new
   rows rendering their own icons (not the fallback). If the panel overflows, that is a defect this slice
   owns: fix it in the panel (scrolling/paging) rather than hiding rows.

## OUT OF SCOPE (do NOT touch)

- **Payouts and income curves** - `GOLD_TIER`, `RUN_GOLD`, the per-kill purse credit, chest values.
  `GOLD_MODEL.INCOME_TIERS` may only be REPLACED WITH NEWLY MEASURED VALUES; it must not move as a lever.
- The **apex tier** (G25) and `APEX_UPGRADES`. Do not reprice it, do not count it, do not add to it.
- **Run length** (G18), **characters** (G19), **a second currency** (DESIGN_TARGETS :99), the arch model
  (G5/W7a), `src/challenges.js`, `src/heat.js`, `src/art/apex.js`, any save SCHEMA change.
- Repricing the EXISTING rows a second time is not this slice's job unless the ledger proves a cap
  violation after the new content - if so, fix the violation, disclose it, and do not reopen slice 1.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain | wc -l` + `git log --oneline -3` - record HEAD and dirty count.
2. RUN `bash tools/run_suite.sh` and paste its verbatim final line. If it does not end `redfiles=0`, STOP -
   do not issue on a red tree. (A red reading `no assertion line captured` with no matching log in
   `/tmp/hordes_suite` is a runner race between two concurrent suite runs; confirm the log exists and
   re-run before believing it. NEVER run two suites at once.)
3. **STOP CONDITIONS - verify slice 1 landed before issuing this slice:**
   `ls tools/economy_ledger.mjs` must EXIST, `ls test/test_economy_reprice.mjs` must EXIST, and
   `node tools/economy_ledger.mjs` must print a cap-violation list that is EMPTY. If any of those fails,
   STOP AND REPORT: content added against an unrepriced catalogue would be repriced twice.
4. Re-resolve and CORRECT IN PLACE on the CURRENT tree: `WEAPON_PRICES` / `ELITE_MODIFIERS` /
   `SHOP_UPGRADES` / `SHOP_BY_ID` / `upgradeCost` / `buyUpgrade` / `applyMetaBonuses` / `GOLD_MODEL` /
   `APEX_UPGRADES` in `src/meta.js`; the catalog build + `SIM_TUNING` + `SIM_ASSUMPTIONS` in
   `tools/balance_sim.mjs`; the `halfRuns` band and the partition constant in `test/test_meta.mjs`;
   `EXPECTED_SHOP` in `test/test_art_lint.mjs`; the `SHOP_UPGRADES` reads in `src/main.js` :3030-3035 /
   :4303-4308 / :4359 and `src/achievements.js` :286 / :312. **Slice 1 rewrote prices and possibly line
   offsets - do not quote a line you have not re-measured.**
5. Quote slice 1's measurements as the BEFORE column of this slice's report: ledger total, count, total
   hours, mid share, first-purchase index, the cap it set, the re-baselined `halfRuns` band, and the
   beatability rates.
6. Name what `test/test_meta.mjs` :590-730 and `test/test_economy_reprice.mjs` ALREADY assert about the
   economy, so this slice's test work ADDS to them (new rows: icon coverage, partition membership,
   effect reachability through `applyMetaBonuses`, the 60h total) instead of duplicating them.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, with the new/changed test files
   named.
2. The ADDED-CONTENT ARITHMETIC, raw: the slice-1 shortfall in hours, hours-per-item at the mid band, N,
   the price band, the cap. Every added row listed with id, name, price at level 1 and at max level
   (through `upgradeCost`), and maxLevel.
3. `node tools/economy_ledger.mjs` AFTER, quoted raw, showing cap-violation list EMPTY, total hours >= 60
   (or the quoted shortfall + reason), 10-good-run mid share inside the band, first-purchase index inside
   ~1-3 runs. Plus the BEFORE column from anchor check item 5.
4. `node test/test_economy_reprice.mjs` and `node test/test_meta.mjs` GREEN, with every retargeted numeric
   assertion quoted before -> after and the reason named.
5. `node test/test_art_lint.mjs` GREEN with the new icon ids, and evidence that the new rows render their
   OWN icon (not the fallback) in the REAL shop.
6. The beatability harness raw output, before AND after breadth: ~40-hour profile clear rate vs fresh
   profile, n and seeds - or an honest NULL with the reason.
7. A REAL-BROWSER shop check at 390x844 @dpr3, run by you: sim clock asserted past 1.0s BEFORE measuring,
   every row reachable, one REAL tap purchase landing at the exact `upgradeCost` price, a PNG saved under
   `docs/art/browser-verify-2026-09-12/`, plus the ink/state read of that PNG. No vision model is required
   in this job; a code claim is not evidence for anything a player looks at.
8. Every file and line changed; every retarget enumerated (file + line + why); the explicit statement that
   NO git state command (commit/checkout/reset/stash/clean) was run, with the dirty count reported; and a
   COULD NOT VERIFY section.

## HOUSE RULES (binding)

- Do NOT run git commit / checkout / reset / stash / clean. Leave the tree dirty and REPORT the dirty
  count; the orchestrator owns commits.
- NEVER weaken an assertion to go green. Retarget the absolute minimum, enumerated, with the reason.
- REUSE the existing harnesses and the slice-1 ledger (`tools/economy_ledger.mjs`, `tools/real_loop.mjs`,
  `tools/boss_sim.mjs`, `tools/balance_sim.mjs`, `tools/gen_earned_profile.mjs`). A second frame loop or a
  second ledger is a defect.
- A self-report is a claim, not evidence: every number in the acceptance bar must appear as RAW tool
  output with n, or it did not happen.
- NO EMOJIS in any UI, DOM string, row name or row description.
- Do NOT run the suite concurrently with another suite run (the known runner race). If the pilot holds the
  machine, wait and re-run.
- This slice is chartered by the pilot, not by the owner. If a design question the goal does not answer
  blocks you (e.g. the exact price band), make the smallest defensible call, DISCLOSE it, and keep going -
  do not stop to ask, and do not invent systems.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; the shortfall arithmetic and the added
rows table; the ledger BEFORE and AFTER; the beatability BEFORE and AFTER; every retarget; the phone
shop evidence (PNG path + tap price); the flag list; what you could not verify; and the statement that no
git state command was run plus the final dirty count.

### SLICE 1c STATE AT DISPATCH (pilot-verified on the artifact this tick, HEAD `3c90291`)

- `test/test_beatability.mjs` EXISTS (7574 B): default mode ALL PASSED in 1.47s — the FRESH arm measured LIVE through the real frame loop (n=8 seed 1337, 0/8 clears, mean 11.6s, every death wave-1 contact:CHASER) and the developed side is a RECORDED measurement re-run only under `--full`.
- **YOUR BEFORE ROW (post-1b, quota it verbatim): fresh 0/8 cannot clear; `hours:2` SLAIN 1/1 (712s, died wave 6 after the kill); `hours:40` GREEDY 0/1 (died wave 1 @125s); `maxed` SLAIN 1/1 + RUN SURVIVED 1800s.** Raw logs `/tmp/g17_1c/hours40_n1_seed1337.log`, `hours2_n1_seed1337.log`, `maxed_n1_seed1337.log` (all pilot-read).
- THREE 1c FINDINGS HANDED FORWARD, to REPORT not to silently tune: (1) `GREEDY_PRIORITY` (`tools/balance_sim.mjs` :407-411) omits all 10 mana/QoL rows, so the "40h build" fights with no mana; (2) the curve is NON-MONOTONIC under that order (elite unlocks arm the enemies faster than the player); (3) 40h x 1,509,378g/h = 60,375,120g buys 51.1% nothing. FINDING 3 IS THIS SLICE'S WHOLE JOB — breadth is what makes the 40h point representable, and the acceptance bar for it is measured, not argued.

