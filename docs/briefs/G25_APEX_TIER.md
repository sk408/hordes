# G25 SLICE 1 - THE APEX TIER: THE TIER ITSELF + THE GATE + THE TOGGLE + THE PROOF - BUILD BRIEF

**Slice:** G25 slice 1 (THE APEX TIER: deliberately game-breaking prestige items), the ranked-queue item
after G24 per the EXECUTION ORDER. READ THE FULL G25 ENTRY FIRST: `docs/HORDES_GOALS_2026-09-12.md` :2597
(the goals doc is authoritative; this brief is the executable half of it) AND `docs/DESIGN_TARGETS.md` :124
("## 6. The APEX tier", the five non-negotiable protections).
**Builder:** whichever lane answers the dispatch probe on `hub` (target form `cli:kimi-hordes-g8` or
`cli:glm-hordes-g8` - the COLON form; the `@`-underscore form returns success and delivers nothing).
**Brief authored by:** the goal pilot (tick 52, 2026-09-15 ~08:25 UTC) while G24 slice 1 was still running,
so it is written OUTSIDE the repo.
**AUTHOR-TIME STATE (read this before trusting any line number):** resolved against HEAD `30d14b6` with a
DIRTY worktree (dirty=5: `src/heat.js`, `src/main.js`, `test/test_heat.mjs`, `test/test_heat_ledger.mjs`
modified + `tools/heat_pays_cohort.mjs` untracked - that is G24 slice 1 MID-FLIGHT, task
`msg_01M2J0YAWHA5FHBBNWHQ5BKDYY` on `cli:glm-hordes-g8`). **The dispatch tick MUST re-resolve every anchor
against the POST-G24 tree (run the DISPATCH ANCHOR CHECK below and correct line numbers in place) and MUST
NOT issue this task until G24 slice 1 has been pilot-verified and `bash tools/run_suite.sh` ends
`redfiles=0`. Never build against these numbers unverified.**

## HOUSE RULES (binding, unchanged)

- NO GIT STATE COMMANDS: no `git commit/checkout/reset/stash/clean/push`. The orchestrator (Remy) owns
  commits. Leave the tree dirty and report the dirty count.
- NEVER weaken an assertion to make a suite go green. If a number moves, retarget it EXPLICITLY and
  enumerate every retarget as `file + line + why` in the report.
- Every claim in the report needs MEASURED evidence (command + its real output). "Looks right" is not
  evidence. Red = red: report it, do not hide it.
- NO EMOJIS in any app UI, copy, or DOM string (owner rule). Plain, terse, uppercase-ish HUD voice,
  matching the existing strings (`RAISE THE STAKES`, `WAVE 3 CLEARED`).
- Deterministic only. The apex tier is CHOSEN, NAMED and LEGIBLE - no random rolls anywhere in it
  (the Golden Eggs cautionary tale; see the goal entry).
- ONE data table per concept: prices and effects come from ONE place in `src/meta.js`, never re-derived
  at the call site. Do not add a second price for anything.
- Do not reprice, retune or "balance" anything that is not in this slice's scope. Other goals own those
  numbers.

## WHAT ALREADY EXISTS (measured by the pilot at author time - re-verify, do not trust)

- `src/meta.js` (949 lines) owns the entire permanent catalogue:
  - `SHOP_UPGRADES` :390 -> `SHOP_BY_ID` :484 -> `upgradeCost(def, level)` :499 -> `buyUpgrade(profile, id)` :508.
  - Single-purchase rows dispatch on `kind`: `shopRowOwned(profile, def)` :600 (`kind === 'weapon'` ->
    `weaponUnlocked`, `kind === 'elite'` -> `eliteUnlocked`, else purchased-level >= maxLevel).
  - `catalogCost(rowIds)` :609 = full-buy cost of a list of row ids - the balance seam the economy tests
    assert through. `WEAPON_SLOT_START/MAX_WEAPON_SLOTS` :334/:335, `WEAPON_PRICES` :342.
  - `applyMetaBonuses(stats, purchased)` :810 is the ONE stat seam (it also publishes the A1 engagement
    radius through `setEngagementRange` :818 - the precedent for a shop row reaching a non-stat seam).
  - `GOLD_MODEL` :214 carries the measured income model. `INCOME_TIERS` :229-236:
    tier 0 ~70/run (runs 1-5), tier 1 ~100 (6-20), tier 2 ~200 (21-45), **tier 3 = 11000/run, runs 46+,
    median banked 11694, 5/6 runs CENSORED at ~287s of the 300s cap**. `MID_TIER_IDS` :240,
    `TOP_TIER_IDS` :242. `RUN_GOLD.AWARD`/`FIRST_CLEAR` :167.
- `src/save.js` owns the profile schema and its OWN convention for adding a field: `MIGRATIONS[n]` (:163,
  "upgrades a payload FROM version n TO version n+1") plus the deterministic repair block (:306-322 is the
  `purchased` one; `bannerSeen` :624 is the read-only-boolean precedent). `grep -rn "apex" src/ tools/ test/`
  is currently EMPTY - this slice creates the concept, there is nothing to collide with.
- The shop SCREEN: `showShop()` `src/main.js` :4280 (`ovTitle.textContent = 'SHOP'`, `OVSub BANK:` line,
  then a loop over `SHOP_UPGRADES` :4285 building `menuCard(name, desc + sub, onclick, disabled)` rows,
  each row carrying its G14 16x16 icon canvas). Row text contract: `name` / `desc` / `LV n/max - MAXED`,
  or `OWNED` / `<cost> gold` for `kind` rows.
- The run-END screen: `endScreenBody({...})` `src/main.js` :3031; `nextUnlockWithinReach(prof)` :3020
  walks `SHOP_UPGRADES` and would happily surface an apex row if it were in that array (Partition matters
  here). The G11-challenge / G20-stage MARK pattern is already there: a non-standard run adds a LEAD clause
  and a STANDARD run renders BYTE-IDENTICALLY to today - copy that pattern exactly.
- Run length/victory seam: `checkRunLimit()` is called first in `update(dt)` `src/main.js` :1547
  ("Reaching the limit is a victory").
- The G9 trophy gallery (`mode === 'trophies'`, `src/main.js` :4972 + `src/achievements.js`) is the
  full-screen presentation seam this tier will reuse for its gallery entry in SLICE 2 (chartered below).
- Weapon fire rate is a SINGLE mapping today: `src/weapons.js` :197-203 maps the leveled cooldown onto the
  stock `C.WEAPON.COOLDOWN` (weapons.js :143 is a per-weapon `COOLDOWN`), `p.stats.cooldown` is the input,
  `rateMult` DIVIDES cooldowns, and the volley loop in `main.js` fires when `w.cd <= 0` then re-arms from
  the mapped rate.
- Tools: `tools/run_suite.sh` (49 lines), `test/test_meta.mjs` (the economy ladder test),
  `tools/balance_sim.mjs` (`SIM_ASSUMPTIONS.goodRunGold`), `tools/browser.mjs` + the `verify_*.mjs`
  real-browser harness family (e.g. `tools/verify_g24_heat_pays.mjs`, `tools/verify_g21_combos.mjs`).
  **There is NO vision model in this job - a screenshot must be read back by INK COUNTS and STATE values,
  and the report must say so.**

## THE GAP THIS SLICE CLOSES

After ~60h of unlocks, gold becomes meaningless and the loop dies. G25 is the infinitely-scaled prestige
sink that gives late gold a purpose forever. Today NOTHING exists: no apex rows, no `apex` flag, no gate,
no toggle, no distinction between a boosted and a clean clear. G25 is too big for one builder run, so the
slice boundary is chartered here.

## SCOPE (chartered - ONE slice, end to end)

### 1. THE DATA: a separate APEX catalogue with an explicit `apex` flag (partition BY CONSTRUCTION)

Add `APEX_UPGRADES` to `src/meta.js` as its OWN exported array (NOT appended to `SHOP_UPGRADES`), every row
carrying `apex: true`, plus `APEX_BY_ID`. Why separate and not "same array, filtered": every existing
consumer of `SHOP_UPGRADES` (the shop screen, `nextUnlockWithinReach`, `catalogCost` callers, the ladder
test, the pacing sim) is then apex-free BY CONSTRUCTION, which is what the goal's "PARTITION THE DATA" rule
demands. An `apex: true` flag on every row is ALSO required (tooling must be able to ask).
Row shape: `{ id, name, desc, baseCost, apex: true, kind: 'apex', removes: '<the constraint removed, one
sentence>', proof: 'rule-breaker' | 'proof-only' }`.
Add the apex accessors next to the existing ones, same style: `apexOwned(profile, id)`,
`apexUnlocked(profile)`, `buyApex(profile, id)` (refuses when the gate is closed or gold is short, returns
false and mutates nothing), `apexEnabled(profile)`, `setApexEnabled(profile, on)`.
`SHOP_UPGRADES`, `SHOP_BY_ID`, `catalogCost`, `upgradeCost` and `buyUpgrade` must be BYTE-IDENTICAL in
behaviour: `catalogCost([...MID_TIER_IDS, ...TOP_TIER_IDS])` must print THE SAME number before and after.

### 2. THE GATE: unreachable until the normal catalogue is finished

`apexUnlocked(profile)` is DERIVED from real ownership, never a new hand-kept flag:
`SHOP_UPGRADES.every(def => shopRowOwned(profile, def))` (every non-apex row owned/maxed). Until that is
true the apex panel is NOT RENDERED AT ALL (not a greyed row: absent), and `buyApex` returns false.
NO achievement, trophy, stage, character or ending may require an apex item (owner rule - never required).

### 3. THE TOGGLE: apex can always be switched off

`profile.apex.enabled` (boolean, DEFAULT FALSE) plus `profile.apex.owned` (array of apex ids, default empty).
Follow `src/save.js`'s OWN convention for a new field (the `MIGRATIONS` chain at :163 + the deterministic
repair block; a wrong-typed `apex` object is repaired to the default and named in `repairs`, exactly like
every other field). Validate both fields; a save from before this slice must load with apex OFF and nothing
owned. The toggle is a row IN the apex panel (`ON/OFF`, one activation flips it, persisted immediately the
way `buyUpgrade` + `saveProfile` already do). `apexEnabled(profile)` is the ONLY reader - no call site
inspects the raw field.

### 4. THE ITEMS - EXACTLY TWO this slice (rule-breaker + pure proof)

- **ITEM A - rule-breaker, id `apex_endless_fire`, name `ASCENDANT ARSENAL`.** Removes the firing
  constraint: while apex is ENABLED and this item is owned, weapons never stop firing - the re-arm writes
  `w.cd = 0` (or the smallest honest frame step, one `dt`) at the SINGLE mapping seam
  (`src/weapons.js` :197-203; `main.js`'s volley loop must NOT grow a second special case). This is
  deliberately game-breaking; do NOT tune it down, do NOT cap it "for balance". Note in the report how many
  projectiles a maxed build reaches in a 10s window and that the frame budget held (measured, not guessed).
- **ITEM B - pure proof, id `apex_mark`, name `THE MARK OF THE GRIND`.** NO POWER AT ALL. Nothing but
  VISIBLE OWNERSHIP: (a) a HUD flourish line, styled like the existing HUD readout (no emoji), present ONLY
  when apex is enabled - never on a normal run; (b) the run-END screen gains an `APEX` clause through the
  EXISTING non-standard-run mark pattern, so a run completed with apex ON is DISTINGUISHABLE from a clean
  clear (the goal's "PROTECT THE INTEGRITY OF THE CLEAN CLEAR" rule). A standard run with apex OFF must
  render BYTE-IDENTICALLY to today - assert that, do not assert it by eye.

### 5. PRICING: calibrated against MEASURED end-game income, arithmetic shown

End-game income is MEASURED, not invented: `GOLD_MODEL.INCOME_TIERS` tier 3 = **11000 gold/run** (runs 46+,
median banked 11694, censored at ~287s of the 300s cap) -> **~125 runs/hour would be a fiction, so use the
run cap: 300s/run = 12 runs/hour -> ~132,000 gold/hour** at end-game income. CHARTERED:
`apex_mark` = **550,000** (~4.2h of top-tier play) and `apex_endless_fire` = **5,500,000** (~42h) - i.e.
the pure-proof item is the reachable first trophy and the rule-breaker is the long-haul goal. Put the
arithmetic in a comment beside the table (the way `GOLD_MODEL` documents its tiers) AND assert it in a test:
each `baseCost / 132000` sits inside the chartered band (2h-6h for `apex_mark`, 30h-60h for
`apex_endless_fire`). If you measure a materially different end-game income, REPORT IT and keep the hours
band rather than the gold number - the band is the contract, the gold is the calibration.

### 6. COMPLETION-TIME REPORTING EXCLUDES APEX, AND SAYS SO

The ~60h completion target and every pacing figure must be computed WITHOUT apex. Concretely:
(a) an assertion in `test/test_meta.mjs` that `catalogCost([...MID_TIER_IDS, ...TOP_TIER_IDS])` is UNCHANGED
by this slice and that the existing full-buy crossing (run 60-100) does not move; (b) `tools/balance_sim.mjs`
carries an explicit `SIM_ASSUMPTIONS.apex = false` (with a one-line comment saying apex is excluded from
completion) and prints/reuses that partition instead of silently folding apex into "time to buy everything";
(c) one added line in `docs/DESIGN_TARGETS.md` §6 (and/or the reporting surface that prints full-buy cost)
stating the exclusion out loud, so the figure is never read without it.

### 7. THE PANEL: a separate, clearly-marked tier in the shop

Add an apex panel reachable from the shop screen - its own `ovTitle` (`APEX`), a one-line sub that states
the gate (`BANK: <gold>` stays, plus what is still missing when locked), the toggle row, and one row per
apex item showing name / effect (`removes` text) / cost / `OWNED`. Reuse `menuCard` - do NOT invent a second
row widget, and keep the G14 icon convention (`shopIcon(def.id)` -> an authored 16x16 grid in
`src/art/shop_icons.js`; unknown ids fall back to `__fallback`, never an empty box). When the gate is CLOSED
the panel is not reachable from the shop screen at all.

### 8. OUT OF SCOPE - named so it is visibly deferred, not silently dropped

- The full-screen PIXEL-ART gallery entry (goal requirement 5's last clause) is SLICE 2: it reuses the G9
  gallery seam and needs authored art. Slice 1 owes only the HUD flourish + the run-end mark above.
- Items 3..6 of the apex set, the aura, and any repricing of existing rows.

## DISPATCH ANCHOR CHECK (run this FIRST, in the repo, and paste the output in the report)

1. `git log --oneline -1` (record HEAD; do NOT change it) and `git status --short | wc -l` (record dirty).
2. `bash tools/run_suite.sh` -> record `TREE: ... | dirty=N` AND `SUITE greenfiles=N redfiles=0`. If
   redfiles != 0, STOP and report `blocked:` - do not start a feature on a red tree.
3. `grep -n "export const SHOP_UPGRADES\|export function shopRowOwned\|export function catalogCost\|export function applyMetaBonuses\|INCOME_TIERS\|export const GOLD_MODEL" src/meta.js`
4. `grep -n "function showShop\|function endScreenBody\|function nextUnlockWithinReach\|checkRunLimit()" src/main.js`
5. `grep -n "p.stats.cooldown\|C.WEAPON.COOLDOWN" src/weapons.js` and the volley re-arm site in `src/main.js`
   (`grep -n "w.cd" src/main.js`)
6. `grep -n "MIGRATIONS\|bannerSeen" src/save.js | head -20`
7. `grep -rn "apex" src/ tools/ test/ || echo "NO APEX REFERENCES (expected pre-slice)"`
Correct any line number in this brief that drifted before you build against it.

## ACCEPTANCE BAR (all seven, each with the command that proves it)

1. **Suite**: `bash tools/run_suite.sh` ends `redfiles=0`, and the report pastes the tree + greenfiles line.
2. **Partition, numerically**: `node -e` (or a test) prints `catalogCost([...MID_TIER_IDS, ...TOP_TIER_IDS])`
   BEFORE and AFTER the slice - THE SAME NUMBER - and asserts that every row of `APEX_UPGRADES` carries
   `apex === true`, that no row of `SHOP_UPGRADES` does, and that `nextUnlockWithinReach(profile)` /
   the shop screen never see an apex row.
3. **Gate**: a test (fresh profile, zero purchases) asserts `apexUnlocked(profile) === false` and
   `buyApex(profile, 'apex_mark') === false` with `profile.gold = 999999999` (rich but incomplete -> still
   refused, nothing mutated); a completed profile (every `SHOP_UPGRADES` row owned) asserts
   `apexUnlocked === true` and the purchase succeeding, gold debited by exactly `baseCost`.
4. **Toggle + honest run**: with apex owned but `enabled = false`, the re-arm path is UNCHANGED
   (`w.cd` after a fire equals the pre-slice mapped value, asserted numerically) and the HUD shows no
   flourish; with `enabled = true` the cooldown re-arm reads 0/one-frame and the HUD flourish line is
   present. Toggling OFF restores the exact pre-apex value.
5. **Save**: a pre-slice profile payload loads with `apex = { owned: [], enabled: false }` and an empty
   `repairs` list; a garbage `apex: "yes"` payload is repaired to the default and `repairs` NAMES the field;
   `test_save.mjs` (or the repo's save test) covers both. The new fields survive an export/import round trip.
6. **Real browser, phone viewport** - NEW `tools/verify_g25_apex.mjs`, modelled on
   `tools/verify_g24_heat_pays.mjs`: real Chrome at **390x844 @dpr3**, a REAL TAP to start, and
   **`state.time > 1.0` ASSERTED BEFORE any measurement**. Checks, with the negative controls named:
   (a) a pre-completion profile -> the shop screen has NO apex row and no way to reach the panel
   (negative control, assert absence in the DOM); (b) a completed profile -> the panel opens, `ovTitle` is
   `APEX`, the toggle row flips real state on activation, cost text matches `baseCost`; (c) buying with
   insufficient gold is refused (gold unchanged) then succeeds with enough gold; (d) with apex ON the HUD
   flourish line is present and the run-end screen carries the `APEX` clause; with apex OFF the run-end
   screen body is BYTE-IDENTICAL to the pre-slice string (assert string equality, not eyeballing).
7. **Screenshot read back by ink + state, not by a vision model**: save a PNG at **1170x2532**, and report
   the ink count inside the apex panel box and inside the HUD box, plus the state values you asserted.
   State plainly in the report that there is NO vision model in this job, so the read-back is ink/state.

## REPORT FORMAT (post as the task answer)

`done:` / `blocked:` + in this order: (1) the DISPATCH ANCHOR CHECK output verbatim; (2) the suite line;
(3) the partition number before/after and the price arithmetic for both items with its hours band;
(4) the acceptance checks 3-7 with the actual command output each; (5) EVERY retarget
(`file + line + why`) or the words `no retargets`; (6) what you could NOT verify and why; (7) deviations
from this brief with the reason. Do not run any git state command - leave the tree dirty and report the
dirty count.

## DISPATCH RE-ANCHOR (goal-pilot tick 53, 2026-09-15 ~09:50 UTC)

- **G24 slice 1 is LANDED, COMMITTED and PILOT-VERIFIED** (`b5e86db` the feature, `c40abcb` the verify tool
  retarget). The pre-req this brief demanded before issue is MET.
- **Issued on HEAD `c40abcb`, tree CLEAN (`dirty=0`).** Suite re-run by the PILOT this tick, verbatim:
  `TREE: /home/claude/projects/hordes @ c40abcb | dirty=0` / `SUITE greenfiles=91 redfiles=0`.
- **Anchor spot-check re-run against `c40abcb`** (not author time `30d14b6`, which was mid-G24). Corrected
  in place, the author-time numbers that drifted:
  - `src/meta.js`: `GOLD_MODEL` :214 (live), `INCOME_TIERS` :231 (author-time ":229-236"), `SHOP_UPGRADES`
    :390, `shopRowOwned` :600, `catalogCost` :609, `applyMetaBonuses` :810 - all as chartered.
  - `src/main.js`: `checkRunLimit()` CALL SITE :1548 (author-time ":1547"), its definition :3225,
    `nextUnlockWithinReach` :3022 (author-time ":3020"), `endScreenBody` :3038 (author-time ":3031"),
    `showShop` :4278 (author-time ":4280").
  - `src/weapons.js`: the single cooldown mapping is :203 (`p.stats.cooldown / C.WEAPON.COOLDOWN`) - live.
  - `src/save.js`: `MIGRATIONS` :167 (author-time ":163"), `bannerSeen` :624 - live.
  - `grep -rn "apex" src/ tools/ test/` => **EMPTY**, as this brief predicts: the concept does not exist yet.
- **LANE:** `cli:glm-hordes-g8` (glm answered a direct probe this tick; the `kimi` lane is still on the 7-day
  wall and `claude` is kimi-metered). No other instruction changes; the acceptance bar and house rules above
  are unchanged and binding.
- **NOTE ON G24 (do not re-do it):** heat now pays on BOTH channels (gold + XP, MANUAL-driven only) and the HUD
  states the payout. `docs/briefs/G24_HEAT_PAYS.md` is CLOSED - do not touch `src/heat.js` readouts, the HUD
  heat line, or `HEAT_CURVES`. Your `src/main.js` edits are the SHOP/RUN-END surfaces only.
