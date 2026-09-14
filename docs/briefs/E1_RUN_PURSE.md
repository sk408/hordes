# E1 - THE RUN PURSE: TIER-WEIGHTED GOLD, IN-RUN SPEND, FIXED END AWARD, HUD READOUT - BUILD BRIEF

**Slice:** E1, EXECUTION ORDER item 5 (`docs/HORDES_GOALS_2026-09-12.md:1140-1160`). Sits after A2
(radar) and before W7a-tooling. Slice definition at `docs/HORDES_GOALS_2026-09-12.md:1323-1337`.
**Builder:** `cli:kimi-hordes-g8`. **Brief authored by:** the goal pilot, 2026-09-14, at HEAD `b8818d6`.
`git status --porcelain` was **0 lines** when the anchors below were first read, and **4 lines** at the end
of the same tick — A2 landed untracked mid-read (`?? src/radar.js`, `?? test/test_radar.mjs`) plus a
modified `docs/art/browser-verify-2026-09-12/p1-portal-phone.png`. **The dispatch tick MUST re-verify
every anchor below on ITS tree** before issuing - the line numbers here were read at `b8818d6`, and A2
(radar) plus the H1 lands touch `src/main.js`, `src/render.js`, `src/config.js` and `index.html`.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If the change legitimately invalidates an
  assertion, RETARGET it to the new invariant and SAY SO (file + line + why). The retargets this slice
  forces are enumerated under ACCEPTANCE - anything else must STOP and report.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep and
  quote. A builder self-report is a claim.
- **No emojis** anywhere (owner UI rule). Pixel-art integrity: integer pixels, no blur, no smoothing.
- **60Hz and 120Hz must both be correct.** Nothing may assume a fixed dt. Purse credits are per-KILL
  EVENTS, so they must be dt-free (the evolution-token / mana-on-kill convention,
  `src/main.js:1888-1896`).
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock before your first edit and release it when done. Do not
  self-cancel on a transient hold.
- **Scope bound:** `src/meta.js`, `src/main.js`, `src/config.js`, `src/render.js`, `src/save.js`,
  `src/shrines.js` (cost/afford seam only), `index.html` (copy/geometry only if the canvas is not
  enough), plus tests and one new verify tool. Do NOT touch `src/controllers.js` (A1 owns it) and do
  NOT touch `src/portal_cine.js`. If you believe a change outside this list is required, STOP and
  report.
- **Must NOT run in parallel with A1** (A1 edits `src/controllers.js`) or with E2/S1 - E1's measured
  numbers are the economy baseline those slices are judged against
  (`docs/HORDES_GOALS_2026-09-12.md:1151-1153`, `:1352-1353`).

## THE OWNER DIRECTIVE (verbatim)

Sk408, 2026-09-14: *"The gold floor as it is is fine. Gold at the end of the run should maybe be fixed
because we have shrines that cost money and we eventually want chest and item merchants. Gold should be
accumulated. Also have a visible on screen display."*

Then, answering the shape question (option (a), confirmed twice):

*"Yes, runs should spend earned gold for shrines and merchants. I think that's how megabonk does it for
balance."* and explicitly **"Sure, fixed amount at end of the run, yes."**

And on the weighting: *"Yes, tier weighted gold counter is needed. Needed from the start actually so
that mid wave boss gives a nice gold drop and the chaff drops a bit less. Min drop 60 like it kind of
already is is a good feature."*

The authoritative directive section (current-behaviour reading, the incentive consequence, the constants
to keep working, the bank decision, the two consequences) is **GOLD BECOMES AN IN-RUN PURSE** at
`docs/HORDES_GOALS_2026-09-12.md:757-830`. Read it in full before coding; the summary below is faithful
but the section is the spec. The chaff-density / tier-weighted-gold rules it depends on are at
`:832-916`.

## MEASURED CURRENT BEHAVIOUR (read from the tree at `b8818d6`, tree dirty=0)

**There is NO run purse today.** Every in-run purchase debits the PERSISTENT balance, and the run's gold
is added once, at the very end.

- **The run's gold formula** - `computeRunGold` at `src/meta.js:218-230`:
  `gold = GOLD_MODEL.BASE(50) + floor(kills / KILLS_DIV(2)) + level * LEVEL_MULT(10) + floor(time / TIME_DIV(20))`
  (`:222-225`), `+ RUN_GOLD.FIRST_CLEAR(250)` when `runStats.firstClear` (`:226`), then
  `Math.round(gold * (runStats.goldMult || 1))` (`:229`). Constants: `RUN_GOLD` `src/meta.js:167-169`;
  `GOLD_MODEL` `src/meta.js:187-216` (`BASE` `:188`, `KILLS_DIV` `:189`, `LEVEL_MULT` `:190`,
  `TIME_DIV` `:191`, `RUN1` `:192`, `LATE` `:193`, `GOOD_RUN` `:200`).
  **It is a formula over a RAW kill count - there is no per-kill gold anywhere in the tree.**
- **The raw count it reads**: `p.kills++` in the death funnel, `src/main.js:1878` - no regard to enemy
  type. So the kill term cannot tell a swarmer from a herald today.
- **Where gold is AWARDED, at run end** - `settleRunGold` is the single funnel
  (`src/main.js:2739-2755`): `firstClear` compares `state.time` to `profile.bestTime` (`:2741-2742`);
  the formula is called with `goldMult: (p.stats.goldMult||1) * goldMult(manualPushes(state)) *
  rampageGoldMult()` (`:2745-2748`); **`profile.gold += gold` at `:2749`**; `recordRunAchievements(gold)`
  (`:2752`) then `saveProfile(profile)` (`:2753`). The four callers: `runSurvived` (`:2771`, settle at
  `:2782`, plus `survivedBonus()` `:2766-2769` / `C.RUN.SURVIVED_BONUS 1500` `src/config.js:666`),
  `endRun` (`:2823`, settle at `:2831`), `die` (`:2863`, settle at `:2873`), and the maw milestone
  (`:5711-5712`, `C.RUN.MAW_CLEAR_BONUS 1200` `src/config.js:670`).
- **The shrine spend seam** - the shrine block `src/main.js:1974-2005`: on proximity it caches one
  blessing (`:1981-1986`), and **`canAfford(profile.gold, sh.blessing.cost)` then
  `profile.gold -= sh.blessing.cost` at `:1989-1990`, `saveProfile(profile)` at `:1991`**. The cost curve
  is `shrineCost` (`src/shrines.js:54-59`, constants `:28-30`: `SHRINE_BASE_COST 60`,
  `SHRINE_COST_PER_WAVE 30`, `SHRINE_COST_USED_MULT 1.25`) and `canAfford` is `src/shrines.js:62-64`.
  The broke toast is `src/main.js:2000-2002`.
- **The other in-run spend seam (the paid chests)** - `buyPaidChest` `src/main.js:929-938`: gate
  `if (profile.gold < cost) return` (`:932`), then `rollPaidChest` debits the base cost
  (`src/loot.js:275-288`, debit at `:281`), the Merchant's Pact surcharge is taken at `:937`, and
  `saveProfile(profile)` at `:938`. Tiers `PAID_CHESTS` `src/loot.js:265-269` (50 / 150 / 400).
  `chestCost` / `shopPriceMult` are `src/main.js:793-798`.
- **The HUD has NO live gold readout at all.** A canvas HUD-chrome pass is the always-on readout
  (`src/render.js:1134-1533`, seam `this.hudChrome` assigned `:1533`): HP/MP labels
  (`:1212-1213`), the XP bar plus an LV badge (`:1255-1316`), a "gold goal tick" that is a 1px MARKER on
  the XP bar's far end (`:1288-1289`) - **not a counter**. Sizes come from `CONFIG.HUD`
  (`src/config.js:472-510`; `LABEL_PX 9` `:473`, `LV_PX 11` `:475`, `CLOCK_PX 11` `:476-479`). The text
  `#hud` div (`index.html:24-30`, element at `:335`) is **opt-in and OFF by default**
  (`src/render.js:1135-1136`; the toggle seams `hudText` at `src/main.js:5856`) - it CANNOT be the home
  of a required readout. Gold is printed only inside overlays: the intermission balance
  (`src/main.js:823`), the death/end card (`:2654`), the stats screen (`:3613`), the shop
  (`:3681`, `:3809`). Verified absent: `index.html` contains exactly ONE occurrence of "gold" and it is
  a CSS comment (`index.html:92`).
- **The save/profile path a purse would have to survive a reload through** - ONE storage key:
  `STORAGE_KEY = 'hordes_profile_v1'` (`src/save.js:48`), with `RECOVERY_KEY` `:52`,
  `PROFILE_VERSION = 6` (`:43`), the migration chain `VERSION_HISTORY` (`:60`),
  `loadProfileFrom` (`:785`), `saveProfileTo` (`:840-843`, writes
  `JSON.stringify({ ...p, version: PROFILE_VERSION })`). `validateProfile` (`:269`) opens with
  `const out = { ...p }` (`:272`) so **unknown top-level fields already survive verbatim**, and it
  clamps currency with a finite/non-negative integer rule at `:274-280` (`gold`) - the exact shape a
  purse field needs. `src/meta.js` wrappers: `makeProfile` `:112`, `loadProfileResult` `:127`,
  `saveProfile` `:138`. Boot/load: `src/main.js:349-350`. **The reload flush already exists**:
  `autosave()` (`src/main.js:359-361`) is wired to `pagehide`, `beforeunload` and
  `visibilitychange`-hidden at `:362-375`.
- **There is NO run persistence anywhere in the tree.** The only `localStorage` consumers are
  `save.js`, `audio.js`, `main.js:148` (settings) and `tour.js` - and the single saved payload is the
  profile. A mid-run reload therefore **loses the run itself** (the player returns to the title). This
  is the fact the persistence requirement below has to be built around, not wished away.
- **Existing tests that touch run gold** (these are the ones that will move):
  - `test/test_meta.mjs:90-102` pins the formula exactly (`:93-95`), FIRST_CLEAR on top (`:96-97`),
    `computeRunGold({}) === 50` (`:98`), and goldMult multiplying the whole payout (`:100-101`).
  - `test/test_meta.mjs:572-607` - the ECONOMY TARGETS: GOOD_RUN `~1.8k` (`:575-576`),
    `INCOME_TIERS[0]` equals RUN1 (`:577-578`), tier 3 brackets LATE (`:579-581`), and
    **`halfRuns >= 9 && halfRuns <= 13`** for "~10 good runs buy ~50% of the mid-tier catalog"
    (`:583-587`); top-tier 30+ good runs (`:591-598`); the arcade 140k sink (`:599-600`).
  - `test/test_meta.mjs:641` - `SIM_ASSUMPTIONS.goodRunGold === computeRunGold(GOLD_MODEL.GOOD_RUN)`
    (source of truth: `tools/balance_sim.mjs:152`, consumed at `:592`, `:665`).
  - `test/smoke.mjs:983-1009` - the shrine probe asserts the BANK is debited:
    `getProfile().gold === 100 - shrineCost` (`:1004-1005`). **This assertion pins exactly the
    behaviour E1 replaces.**
  - `test/smoke.mjs:1823-1846` - END RUN: `purseAfter >= purseBefore` and the end card carries
    `GOLD EARNED: +\d+` (`:1844-1846`).
  - `test/test_trophy_gallery.mjs:319-355` - the run-end earn through the REAL win funnel
    (`T.run.runSurvived()` `:329`), asserting the purse only grows (`:344-351`); header note `:25`.
  - `test/test_trophy_hooks.mjs:10` - the death funnel through `settleRunGold`.
  - `test/test_death_screen.mjs:81-98` - `endScreenBody` composition; it hands `gold` IN as a
    parameter (`:84`, `:95`), so a fixed award does not break it. `:131` is a `\d+` regex.
  - `test/test_save.mjs:117` / `:144` / `:167` / `:201` / `:213` and
    `test/test_save_v3_characters.mjs:129` / `:178` - the gold clamp + migration chain a new field
    rides alongside.
  - `test/test_choices.mjs:100` / `:123` and `test/test_heat.mjs:100-112` - `goldMult` semantics.
  - `test/test_shrines.mjs` - the cost curve in isolation (pure module, unaffected).
- **The measurement harness that already reports run income** - `tools/real_loop.mjs`:
  `STAGES = ['fresh','partial','maxed']` (`:49`), `stageProfile` (`:28`), `bootReal` (`:103`),
  `runRealCohort` (`:138`). Per-run income is the **profile gold delta across the run**
  (`:145` `goldBefore`, `:198` `const gold = h.profile().gold - goldBefore`, `:207` `rec.gold = gold`).
  Note the doc contract above it (`:131-134`): "the REAL settled payout". One `bootReal()` per process
  (the rAF queue dies on a second call).
- **The test seam block** - `__TEST` at `src/main.js:5835-6040`. `startRun` `:5836`, `getProfile`
  `:5837`, `run: { runSurvived, survivedBonus, ... }` `:6006-6021`, `save:{ autosave, exportText,
  importText, ... }` `:6026-6039`. **`settleRunGold` is NOT exposed, and there is no purse seam.**

## WHAT TO BUILD (all of it, in this one slice)

**R1 - the run purse is a PROFILE field, and it is the only wallet a run can reach.**

1. Add ONE integer field `profile.runPurse` (integer >= 0). Path, named exactly: the profile payload
   under the existing single key `STORAGE_KEY = 'hordes_profile_v1'` (`src/save.js:48`) ->
   `meta.js` `saveProfile` (`:138`) -> `save.js` `saveProfileTo` (`:840`). **Do not invent a second
   storage key**: export/import, the recovery copy and the migration chain all key off this one.
2. Validate it in `validateProfile` beside the existing currency clamp (`src/save.js:274-280`): finite,
   floored, `>= 0`, `<= MAX_SAFE_INTEGER`, and push a `repair` when it changes - copy the `gold` rule
   verbatim in shape (`:275-280`). Bump `PROFILE_VERSION` 6 -> 7 (`src/save.js:43`) and add the
   migration step + `VERSION_HISTORY` entry (`:60`): a v6 save with no `runPurse` must load as `0`, and
   the round-trip must stay lossless.
3. **Nothing in the run may read `profile.gold` for spending.** Every in-run purchase seam
   (`src/main.js:1989-1991` shrine; `:929-938` paid chest) reads and debits the PURSE instead.
   `profile.gold` stays the banked/meta balance, untouched mid-run.
4. **A run cannot spend gold it has not earned.** The purse is never seeded from `profile.gold`; the
   only two writers are (a) the per-kill credit in R2 and (b) the load/seed in R3. Assert this with the
   test in ACCEPTANCE-5.

**R2 - tier-weighted in-run earnings, at the kill funnel.**

5. Credit the purse **per kill**, at the existing kill funnel where the type flags are still in hand
   (`src/main.js:1878`, immediately beside the token/mana grants at `:1888-1896` - events, dt-free).
   Weight by ONE explicit tier source, not by re-deriving tier from hp at run end
   (`docs/HORDES_GOALS_2026-09-12.md:866-872`):
   - chaff (SWARMER / CHASER - `src/enemy_types.js:35-53`) pays **near zero**;
   - elites (an `eliteMod` is stamped on the enemy - `src/elite_mods.js:86-99`, consumed at
     `src/main.js:1840-1848`) pay **~1.0**;
   - the heavy tier (BRUTE `src/enemy_types.js:56-62` and the higher-hpMult types) pays **> 1**;
   - **mid-boss / boss pay heavily**, so a mid-wave boss reads as "a nice drop"
     (`src/main.js:1796` `e.boss`, `:1797` `e.midBoss`, flags stamped at `:1015`, `:1079`, `:1085`).
   Implement the weights as ONE data table (a `GOLD_TIER` / `purseValue(unit)` shape) in `src/meta.js`
   or `src/config.js` - one knob per tier, tunable and testable, never a squared curve
   (`docs/HORDES_GOALS_2026-09-12.md:892-894`).
6. **The payment trap:** the boss branches at `src/main.js:1797-1834` pay CHESTS, weapon XP and
   evolution tokens - **they do NOT pay gold today, so no double payment exists yet**. If you add a
   visible mid-boss gold drop there, the SAME kill must not also be paid by the end award. Decide which
   surface owns mid-boss gold, make the other not count it, and assert that in a test
   (`docs/HORDES_GOALS_2026-09-12.md:881-885`).
7. Keep a tier-weighted **kill ledger** on the run (extend `state.runCounts`, declared
   `src/main.js:266`, reset `:4106-4107`) so the weighting can be re-derived and reported honestly.
   Keep the RAW `p.kills` too - milestones/achievements genuinely want bodies
   (`docs/HORDES_GOALS_2026-09-12.md:868-869`).

**R3 - the FIXED end award replaces the formula, and the remainder BANKS.**

8. The end-of-run meta award becomes a **FIXED AMOUNT** - a new named constant next to
   `RUN_GOLD` (`src/meta.js:167-169`), NOT `computeRunGold`. `computeRunGold` is **retired as the
   payout authority** (`docs/HORDES_GOALS_2026-09-12.md:784-787`) but KEPT as a pure helper with its
   own test intact (`test/test_meta.mjs:90-102`) - do not delete it, and do not silently repoint it.
9. Settlement (`settleRunGold`, `src/main.js:2739-2755`) becomes:
   `profile.gold += FIXED_AWARD * goldMult-terms + profile.runPurse`, then **`profile.runPurse = 0`**.
   - `goldMult` still multiplies the payout (`docs/HORDES_GOALS_2026-09-12.md:806-807`): keep the
     existing multiplier chain at `:2747` shape - `(p.stats.goldMult||1) * goldMult(manualPushes(state))
     * rampageGoldMult()` - applied to the AWARD.
   - `RUN_GOLD.FIRST_CLEAR` (`src/meta.js:168`, applied `:226` / `src/main.js:2741`) and
     `C.RUN.MAW_CLEAR_BONUS` (`src/config.js:670`, paid "on top of the run's gold" `src/main.js:5711`)
     **stay separate additions** and must not be folded into the fixed constant.
   - **THE DOUBLE-BANK TRAP: if `runPurse` is not zeroed at settlement, the next run's end banks the
     same gold a second time.** Zeroing is part of the settlement, and it is asserted (ACCEPTANCE-6).
   - The end card must show the two parts, not one blended number (`src/main.js:2653-2654`).

**R4 - the purse PERSISTS across a mid-run reload.**

10. The purse is written at every change through the existing seams: `saveProfile(profile)`
    (`src/meta.js:138`) after each spend (the shrine/paid-chest precedent already saves there:
    `src/main.js:1991`, `:938`) and - because per-kill credits must not write on every corpse -
    at the existing exit flush (`autosave`, `src/main.js:359-361`, wired to `pagehide` /
    `beforeunload` / `visibilitychange` at `:362-375`) plus the run's own periodic/level-up save.
    **"Reload" means the combination of those, not a new mechanism.**
11. **THE FLAGGED ITEM - state it in your report so the owner can flip it.** The run does not survive a
    reload (MEASURED CURRENT BEHAVIOUR, above). So "persist the purse" resolves to: the stored purse is
    **RESUMED by the next run** - `startRun` (`src/main.js:4041`) is the ONE seeding seam, and it opens
    the run with `profile.runPurse` on the counter instead of zero, so nothing the player earned is
    confiscated (`docs/HORDES_GOALS_2026-09-12.md:812-826`). Implement that. The alternative (a stale
    purse is voided, or banked automatically) is a one-line change at the same seam - name it in your
    report, do not implement both.

**R5 - a VISIBLE on-screen gold readout, legible on a phone.**

12. Draw it in the always-on CANVAS HUD chrome (`src/render.js:1134-1533`, seam `this.hudChrome`
    `:1533`), in the existing label family (`CONFIG.HUD`, `src/config.js:472-510`; 9-11px, `:473-479`).
    **Not `#hud`** - that div is opt-in and off by default (`src/render.js:1135-1136`).
13. It obeys the H1 no-reflow contract (`docs/HORDES_GOALS_2026-09-12.md:828-830`, `:178-187`): a
    **fixed-width, tabular** readout - a reserved digit column and a dark plate (the LV-badge pattern
    at `src/render.js:1290-1305` is the precedent), so 1 digit and 5 digits occupy IDENTICAL geometry.
    A counter whose width grows as it counts reflows the control pads - the exact owner-reported bug H1
    just fixed (`index.html:150`, `:222`, `:224`).
14. **Phone legibility is a measurement, not a look** (390x844 @dpr3; the owner plays on a phone):
    the readout must be legible at that viewport with the HUD's own sizes - report the px height you
    chose and the geometry table (ACCEPTANCE-7).
15. **The word "purse" already means the BANKED balance in shipped copy** (`src/main.js:823`
    `purse: ${profile.gold} gold`; `:2654`; `:3613`) - and the directive's purse is a different,
    run-scoped thing. Disambiguate the copy (recommend: the run readout is `GOLD`, the banked total
    reads `BANK` / `purse`), and print BOTH at the intermission and on the end card, or the two
    currencies will blur - exactly the failure V1's brief guards against
    (`docs/briefs/V1_ESCAPE_SEQUENCE.md:228`).

**R6 - testable seams (do not make the tests reach through a screenshot).**

16. Add a `purse` block to `__TEST` (`src/main.js:5835-6040`): `get()` (live purse), plus the REAL
    exported `credit` / `spend` / `settle` functions the game itself calls - the `run` / `save` blocks
    (`:6006-6021`, `:6026-6039`) are the shape precedent. A headless test must drive the SAME
    functions the loop drives, never a copy.

**R7 - V1's escape payout must NOT count toward the run total (write this down, do not build V1).**

17. Note in the code and in your report: the V1 escape-sequence payout (`bestGold x K`) is credited to
    the PROFILE, **outside the run purse and outside the end-of-run award**
    (`docs/HORDES_GOALS_2026-09-12.md:600-628`, `docs/briefs/V1_ESCAPE_SEQUENCE.md:211-227`). The run
    total now feeds an income guide, so escape income entering it would compound: play escape -> payout
    raises the run total -> the total raises the guide -> the next escape pays more, with no gameplay
    in between (`:603-612`). **`bestGold` does not exist in `src/` yet** - it is docs-only as of
    `b8818d6` (verified: `bestGold` matches only `docs/`) - so the honest form of this requirement now
    is: (a) the E1 settlement exposes exactly ONE run-total value for a future `bestGold` to read, and
    (b) it must never see escape income. Say in your report where that single value lives.

## ACCEPTANCE (measurable - no adjectives)

1. **The fixed award, as a NUMBER, with its ratio.** Report the constant you chose, and beside it the
   measured per-run in-run EARNED total and banked remainder for the `fresh`, `partial` and `maxed`
   cohorts (`tools/real_loop.mjs` `STAGES` `:49`). State the ratio (award / good-run in-run earnings)
   and why it holds the pacing: if the award dominates, every run pays about the same and the grind
   goes flat; if the in-run earnings dominate, the award is just a floor. The delivered ratio must make
   a BAD run still pay at least the award (`docs/HORDES_GOALS_2026-09-12.md:789-804`).
2. **THE BAD-vs-LOADOUT MULTIPLE - the headline number.** Through `tools/real_loop.mjs`
   (`runRealCohort` `:138`, one fresh process per arm, same seed per run index, `bootReal` once per
   process), report per-run banked income for `fresh` vs `maxed` (the owner's loadout run). **The
   maxed-run banked total must be a >= 2x multiple of the fresh-run total**, and you must ALSO report
   the in-run earned / awarded / spent split for both arms so the multiple is attributable. If 2x
   cannot be held without distorting the award, report the number you got and STOP rather than
   tuning the shop.
3. **`INCOME_TIERS` re-derived, honestly.** `GOLD_MODEL.INCOME_TIERS` (`src/meta.js:201-206`, the
   documented band 700 / 1200 / 1800 / 2800) must be re-derived from the NEW model and the tier tests
   retargeted (`test/test_meta.mjs:577-581`). Quote the BEFORE and AFTER tier numbers, and the BEFORE
   and AFTER value of `halfRuns` from the "~10 good runs buy ~50% of the mid-tier catalog" assertion
   (`test/test_meta.mjs:583-587`, currently `>= 9 && <= 13`), plus `SIM_ASSUMPTIONS.goodRunGold`
   (`test/test_meta.mjs:641`, `tools/balance_sim.mjs:152`). **Do not reprice the shop to keep a test
   green** (`docs/HORDES_GOALS_2026-09-12.md:819-823`).
4. **NEW headless test `test/test_run_purse.mjs`** driving the REAL exported seams (never copies):
   - per-kill credit is tier-weighted: chaff pays ~0, elite ~1x, heavy > 1x, mid-boss/boss heavily, at
     the SAME funnel the loop uses; the tier ledger and the raw `p.kills` both advance;
   - **60Hz vs 120Hz parity**: the same seeded run credits the identical purse total at both frame
     steps (the credit is a per-kill event, never a per-frame amount);
   - **no banked gold is reachable**: with `profile.gold = 0` and purse `0`, walking a shrine does NOT
     purchase (and does not debit the bank); with purse `== cost` it does - the shrine probe's
     invariant, moved to the purse;
   - **settlement banks once**: fixed award + remainder lands in `profile.gold`, `runPurse` returns to
     `0`, `FIRST_CLEAR` and the maw bonus still ride on top, `goldMult` still multiplies;
   - **the double-bank trap**: settle twice in a row (or settle then settle a second run) and assert the
     second settlement does NOT re-bank the already-banked remainder;
   - **the mid-run reload preserves the purse**: start a run, credit a purse, flush (`autosave()` /
     `saveProfile`), then construct a NEW profile from the SAME storage via the real
     `loadProfileResult` / `loadProfileFrom` (`src/save.js:785`) against a fake storage - the reload
     pattern `test/test_save.mjs` already uses - and assert the purse value is byte-identical, that a
     v6 payload with no `runPurse` migrates to `0`, and that a corrupt/negative purse repairs to `0`
     and is REPORTED through the repair list;
   - **V1 separation**: assert the settlement's run-total value is unchanged by any escape-credit path
     (a direct call, since V1 does not exist) - i.e. the run total has exactly one writer.
5. **The banked-gold test above is the "cannot spend what it has not earned" proof** and it must fail
   against the pre-change tree (keep the raw output of both runs).
6. **NEW real-browser tool `tools/verify_e1_purse.mjs`**: 390x844 @dpr3, **all 19 `TOUR_KEYS` set
   (`src/tour.js:28-50`) and `state.time > 1.0` asserted BEFORE measuring anything** (the tick-38
   frozen-game defect; copy the guard from `tools/verify_h1_pad_reflow.mjs` /
   `tools/verify_n1_chain_q.mjs`), `hordes_onboarded` preset. It must:
   - drive a run till the purse readout is live, then capture the readout's GEOMETRY at 1-digit and at
     5-digit values and assert **byte-identical** rects/ink-box (the H1 standard) - a screenshot is not
     evidence for a reflow bug (`docs/HORDES_GOALS_2026-09-12.md:183-187`);
   - do a REAL page reload and read the persisted purse back out of `localStorage` under
     `hordes_profile_v1`, then assert the resumed run's opening purse equals it;
   - write ONE PNG at 1170x2532 and report its dimensions and the ink-bbox (no vision model exists on
     this host - geometry and pixel sampling are the evidence, per the project skill).
7. **HUD phone legibility, reported as numbers**: the readout's px height, its x/y/width/height, and
   the digit-column width, measured at 390x844 @dpr3 - plus the statement that it clears the pads'
   96px budget (`index.html:150`, `:222`) on both sides.
8. **`bash tools/run_suite.sh` => `redfiles=0`, three consecutive runs**, each with its TREE line
   (tree + HEAD + dirty count) quoted. **Pre-authorised retargets - these and only these:**
   - `test/smoke.mjs:983-1009` (the shrine debit assertion `:1004-1005`) -> retarget from
     `getProfile().gold` to the PURSE; retarget it, do not delete it, and say so;
   - `test/smoke.mjs:1823-1846` -> retarget the "banked with the same payout accounting" clause to the
     new settlement shape (award + remainder), keeping the `GOLD EARNED` copy assertion;
   - `test/test_meta.mjs:572-607` -> the tier / economy-target numbers (ACCEPTANCE-3);
   - `test/test_trophy_gallery.mjs:344-351` -> the "purse only grows" clause only if the new
     settlement legitimately violates the inequality; quote the numbers either way.
   Anything else that reds is a STOP-and-report, not a retarget.
9. **Report, in the completion message:** the fixed award + the ratio (ACCEPTANCE-1); the fresh-vs-maxed
   multiple table with earned/awarded/spent/banked per arm (ACCEPTANCE-2); the BEFORE/AFTER tier and
   `halfRuns` numbers (ACCEPTANCE-3); the purse schema path and migration result (R1, R4); the
   double-bank result (ACCEPTANCE-4); the HUD geometry table + PNG path/dimensions + suite TREE lines;
   where the single run-total value lives (R7); and anything you could NOT verify, named as UNVERIFIED.
   A `done:` line without those numbers is not a completion.

## DO NOT

- Do not add a second storage key, a second profile, or a run-snapshot mechanism to hold the purse.
  The purse rides `hordes_profile_v1` through `validateProfile` (`src/save.js:48`, `:269`).
- Do not let any in-run seam read `profile.gold` for affordability or debit it. Not the shrine, not the
  paid chest, not a new one.
- Do not delete or weaken `computeRunGold` or its test (`src/meta.js:218-230`,
  `test/test_meta.mjs:90-102`) - it is retired as the PAYOUT, not as a function.
- Do not fold `FIRST_CLEAR` (`src/meta.js:168`) or `MAW_CLEAR_BONUS` (`src/config.js:670`) into the
  fixed award; they are separate additions and stay separately assertable.
- Do not reprice the shop, the weapons or the arcade sink to make an income assertion green. Retarget
  the assertion to the new model and report both numbers.
- Do not pay one kill twice: if a mid-boss gets an in-run gold drop, the end award must not pay for it
  again (`src/main.js:1797-1834` pays chests/XP/tokens today, not gold).
- Do not let the escape sequence (V1) touch the run total, the purse or the award - it credits the
  profile only (`docs/HORDES_GOALS_2026-09-12.md:600-628`).
- Do not put the readout in `#hud` (opt-in, off by default) or let it change width as it counts.
- Do not touch `src/controllers.js`, `src/portal_cine.js`, or the draft/intermission BLESSING
  mechanics beyond their payment source.
- Do not soften or delete a test assertion to reach green. If something is genuinely broken, STOP and
  report `blocked:` with the raw evidence (command + output), and leave the tree dirty.

## UNVERIFIED / OPEN - do not guess, ask or state an assumption

- **The literal "Min drop 60".** The owner praised a per-source minimum of 60 gold, and **no `60`
  constant exists in `GOLD_MODEL`** today - the real floor is `BASE 50` plus the level and time terms
  (`src/meta.js:188-191`; `computeRunGold({}) === 50`, pinned `test/test_meta.mjs:98`). The goals doc
  explicitly flags this as an owner question (`docs/HORDES_GOALS_2026-09-12.md:873-877`). **UNVERIFIED:
  whether the owner wants a literal per-source minimum of 60.** Do not invent one; if you need a floor,
  use `BASE 50`-derived numbers and say so.
- **The paid chests' wallet.** The directive names "shrines now, chest and item merchants later", and
  the intermission's paid chests (`src/main.js:929-938`) are in-run spending that exists TODAY. The
  pilot's call, stated so it can be flipped: all in-run spending debits the purse, including the paid
  chests; "merchants later" refers to the FUTURE in-run chest/item merchants, not these. Name it in your
  report.
- **Where the fixed award's value comes from.** The owner gave no number - only "fixed"
  (`docs/HORDES_GOALS_2026-09-12.md:799-804`). The builder picks it to hold the pacing and states the
  ratio; the owner confirms the number, not the builder.
- **Whether the stored purse resumes or voids after a reload** (R4/11) - the pilot's call is RESUME;
  flagged for the owner.
- **Scope overlap with E2 on "chaff drops ~zero".** `docs/HORDES_GOALS_2026-09-12.md:1330` assigns the
  phrase to E1, while `:851-855` and the E2 entry (`:1339-1350`) own the chaff-density change. E1's
  gold change is explicitly NOT a drop-rate change (`:1333-1334`, `:861-864`) - so this brief scopes E1
  to the GOLD channels only (the purse + the weighting + the award) and leaves the four per-kill drop
  rolls (`entities.js` XP, `chests.js` tokens/chests, `config.js:317` potions) to E2/S1. Flagged, not
  resolved.
- **Whether `goldMult` scales in-run earnings too.** The recorded rule is "a fixed base times goldMult"
  (`docs/HORDES_GOALS_2026-09-12.md:806-807`), which says the AWARD. The pilot's call: `goldMult`
  multiplies the award; if the owner wants it on in-run drops as well, that is one multiplication at
  the credit seam. Assert whichever you implement.

## ANCHOR CHECK (goal pilot, 2026-09-14, tree `b8818d6`)

Every anchor above was read on THIS tree in this tick, against `HEAD b8818d6`. `src/meta.js` 167-169 / 187-216 / 218-230 /
238-248 / 706; `src/main.js` 266, 340-375, 793-798, 823, 929-938, 1015, 1079, 1085, 1796-1834,
1840-1848, 1871, 1878, 1888-1896, 1974-2005, 2639-2654, 2739-2755, 2766-2769, 2771, 2823, 2863,
3613, 3681, 3809, 4041, 4106-4135, 5179-5198, 5711-5712, 5835-6040; `src/save.js` 43, 48, 52, 60,
269-280, 785, 840-843; `src/shrines.js` 28-30, 54-59, 62-64; `src/loot.js` 265-269, 275-288;
`src/config.js` 472-510, 663-670; `src/render.js` 1134-1316, 1533; `src/elite_mods.js` 86-99;
`src/enemy_types.js` 35-62; `index.html` 24-30, 92, 150, 222, 224, 335-351; `test/test_meta.mjs`
90-102, 572-607, 641; `test/test_death_screen.mjs` 81-98, 131; `test/smoke.mjs` 983-1009, 1823-1846;
`test/test_trophy_gallery.mjs` 319-355; `tools/real_loop.mjs` 28, 49, 103, 131-134, 138-207;
`tools/balance_sim.mjs` 152. The four doc sections quoted are `HORDES_GOALS_2026-09-12.md` 757-830,
832-916, 600-628, 1323-1337.
