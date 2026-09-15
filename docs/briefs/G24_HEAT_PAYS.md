# G24 SLICE 1 - HEAT MUST PAY: THE PAYOUT CHANNELS + THE READOUT + THE MEASUREMENT - BUILD BRIEF

**Slice:** G24 slice 1 (OPT-IN DIFFICULTY THAT PAYS), ranked-queue item that runs after G21 slice 2.
READ THE FULL G24 ENTRY FIRST: `docs/HORDES_GOALS_2026-09-12.md` :2575 (the goals doc is authoritative;
this brief is the executable half of it).
**Builder:** `cli:kimi-hordes-g8` (or whichever lane answers the dispatch probe).
**Brief authored by:** the goal pilot, 2026-09-15 (tick 48), during a provider stall, so it is written
OUTSIDE the repo. EVERY LINE NUMBER BELOW IS AUTHOR-TIME (HEAD `974b86c`, tree clean, G21 slice 1
committed at `d08ba68`). The dispatch tick MUST run the DISPATCH ANCHOR CHECK below and correct them in
place before issuing this task - do not build against stale numbers.
**Ordering:** runs AFTER `docs/briefs/G21_SLICE2_COMBOS.md` (G21 slice 2) has landed and been
pilot-verified, on a tree whose suite ends `redfiles=0`.

**PILOT RE-ANCHORED 2026-09-15 ~06:40 UTC (goal-pilot tick 50) on HEAD `6d2103b`, tree dirty=4.**
`bash tools/run_suite.sh` => `TREE: /home/claude/projects/hordes @ 6d2103b | dirty=4` / `SUITE greenfiles=91 redfiles=0`
(measured by the pilot this tick, not read from a report). G21 slice 1+2 PRESENCE CONFIRMED on the artifact:
`src/config.js:387 REWRITE_SLOTS: 4`, `src/rewrites.js:505 onWeaponHit`, the singles `glacier`/`wildfire`/`overload`
at `src/rewrites.js:137-153`, the combos `thermalshock`/`stormreaper`/`glacialorbit` at `src/rewrites.js:159-177`.
The pilot ALSO re-verified G21 slice 2 in a REAL browser at 390x844 @dpr3 (the orchestrator had measured it; the
pilot had not): `node tools/verify_g21_combos.mjs` => ALL 8 CHECKS PASSED (real tap start, sim clock 1.083s asserted
BEFORE measuring, negative control 0 hits / 400 attempts, Glacial Orbit dealt through the REAL openDraft seam at
attempt 173, desc `ORBIT+FROST - ...` fully inside the card bounds, PNG 1170x2532 ink=152072) and
`node tools/verify_card_coverage.mjs` => 9/9 (including `retiredBoxInDom: false`, i.e. the `6d2103b` one-activation
directive holds). **NO LANE WAS AVAILABLE THIS TICK, so nothing was dispatched**: kimi is still on the 7-DAY wall
(`403 You've reached your weekly (7-day) usage limit`), and glm - the only other lane - reports
`429 Weekly/Monthly Limit Exhausted`, reset 2026-09-15 07:49:58 UTC (provider-local +8h, per the tick-49 correction).
Every line number in this brief was re-resolved BY THE PILOT against `6d2103b` and corrected in place; the dispatch
tick must still RUN the DISPATCH ANCHOR CHECK block below, but a drift of zero is the expected case.

## WHAT ALREADY EXISTS (measured at author time, not remembered)

- `src/heat.js` (128 lines) IS the whole difficulty-payout system:
  - `HEAT_CAP = 20` (:22).
  - `HEAT_SOURCES` (:25-31): WEAPON_EVOLUTION +2, NEW_ITEM_SLOT +1, ITEM_EXCHANGE +0 (permanently - the
    owner's explicit guard: heroes swap at the 4/4 cap constantly), MANUAL_PUSH +1.
  - `HEAT_CURVES` (:33-39): HP 0.12/pt, DAMAGE 0.08/pt, SPAWN_RATE 0.06/pt, GOLD 0.30 per MANUAL push.
  - `heatMultipliers` (:46), `goldMult` (:58), `initHeat` (:72), `heatOf` (:63), `manualPushes` (:67),
    `addHeat` (:92, the ONE mutator, touches only `run.heat`), `describeHeat` (:124-128) -> `HEAT 3 (+36% foe HP)`.
  - The ledger is RUN state (`run.heat = {total, manual, events}`); `grep heat src/save.js` => no hits.
- The dial: `src/main.js` :1024-1035 (`menuCard('RAISE THE STAKES')` :1029, `addHeat(state,'MANUAL_PUSH')` :1032, the `interMsg` flash :1033).
- The HUD readout: `src/main.js` :6053 (the line that renders `describeHeat(heatOf(state))`).
- Payout TODAY is ONE channel: `goldMult(manualPushes(state))` at the per-kill purse credit
  (`src/main.js` :3147) and inside `settleRunGold` (def :3136, called :3188).
- Costs land at `src/entities.js` :114-118 (foe maxHp: heat read :117, `e.maxHp = hp` :118),
  `src/main.js` :657-665 (`stampHeavy` herald, heat read :664), `src/main.js` :695-701
  (spawn clock interval / spawnRate).
- Kill XP is paid with NO heat term at `src/main.js` :2378 (the gem-collect grant `p.xp += gm.xp * ...`;
  level-up loop :2381; gems minted :2025 / :2174).

## THE GAP THIS SLICE CLOSES

The goal's own words: **"Heat must visibly PAY MORE, not just bite harder."** Today the HUD tells the
player ONLY the cost side (`HEAT 3 (+36% foe HP)`), the payout exists in exactly one channel (gold), and
it is stated only in one transient message. VS Curse and Megabonk difficulty both pay on MULTIPLE
channels (kills / XP / gold). Ours only bites.

## SCOPE (chartered - one slice, end to end)

1. **A SECOND payout channel: XP per kill.** Give MANUAL heat an XP multiplier at the kill-XP site
   (`src/main.js` :2378). Chartered starting point `HEAT_CURVES.XP = 0.12` per manual push (x1.36 at 3
   pushes), alongside the existing XP multipliers at that site - tune it to hit the acceptance bar and
   DISCLOSE the final number. One new curve constant, one new read.
2. **THE SYMMETRY RULE (binding, it is heat.js's own documented contract):** built-in heat
   (evolutions, new slots) stays COST-ONLY. Every payout channel is driven by the MANUAL count only,
   never by total heat - exactly as `goldMult` already does. Do NOT relax this rule to make the numbers
   move.
3. **Visibility - the half of the goal that is missing.** The payout must be ON SCREEN in the line the
   player already reads:
   - Extend the PURE helper surface in `src/heat.js` (e.g. `describeHeatPayout(manual)`, or an extended
     `describeHeat(heat, manual)`).
   - Use it at ALL THREE readouts: the HUD line (:6053), the RAISE THE STAKES flash (:1033), and the
     end-of-run summary.
   - Keep the COST half's wording byte-identical (`HEAT n (+x% foe HP)`); the payout is ADDED beside it,
     so any existing assertion that matches the cost string stays valid and un-weakened.
   - A new transient flash ALONE does not meet this bar.
4. **The measurement harness (the goal cannot be claimed without it).** A seeded cohort tool that plays
   REAL frame loops at MANUAL heat 0 / 3 / 6 with the SAME seeds and reports, per arm: gold/min, XP/min,
   kill count/min, survival seconds, and foe maxHp at wave 1 (proves the cost is real, not decorative).
   Acceptance: **gold/min AND XP/min both strictly increase with manual heat at equal elapsed time**,
   quoted as raw numbers with n and the seeds.
5. **Economy guard.** Heat 0 income must be UNCHANGED versus the pre-slice baseline (the payout must not
   leak into non-heat runs). Quote the baseline and the comparison. If the payout visibly moves the G17
   completion curve, report the measured delta and flag it - do NOT retune G17's targets here.

## OUT OF SCOPE (do NOT touch)

A pre-run difficulty SELECT screen; new enemy variants or modifiers; `src/challenges.js` (G11 owns the
rule axis and states in its own header that heat.js owns the difficulty axis); `src/save.js` or any
schema change (heat is run-scoped and never persisted); G25's apex tier; the bestiary; `HEAT_CAP`; the
ITEM_EXCHANGE +0 rule; drop rarity / loot quality (that is content, not this payout pass - if you believe
it belongs here, STOP and report instead of building it).

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain` + `git log --oneline -3` - record tree state and HEAD. Confirm G21 slice 2 is
   PRESENT (its new combo logic in `src/rewrites.js`), and that slice 1 is still intact
   (`REWRITE_SLOTS` in `src/config.js`, `onWeaponHit` in `src/rewrites.js`).
2. RUN `bash tools/run_suite.sh` and paste its verbatim final line here. If it does not end `redfiles=0`,
   STOP - this slice is not issued on a red tree.
3. Re-resolve, on the current tree, and CORRECT IN PLACE (the author-time numbers are in the section
   above): `HEAT_CAP` / `HEAT_SOURCES` / `HEAT_CURVES` / `describeHeat` in `src/heat.js`; the MANUAL_PUSH
   dial in `src/main.js`; the HUD heat line; the kill-XP site; the per-kill purse credit; `settleRunGold`;
   the foe-maxHp heat read in `src/entities.js`.
4. Confirm the invariants and SAY SO: `addHeat` is still the ONE mutator; `ITEM_EXCHANGE` still costs 0;
   `goldMult` still reads MANUAL only; `grep heat src/save.js` still returns nothing.
5. `ls test/test_heat.mjs test/test_heat_ledger.mjs` - both must exist; name what each already asserts so
   the extensions do not duplicate them.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, with the new/changed test
   files named.
2. `node test/test_heat.mjs` and `node test/test_heat_ledger.mjs` GREEN, printing the per-channel
   multipliers at manual 0 / 3 / 6 (cost and payout side by side).
3. The cohort tool's raw output, n and seeds included, showing BOTH payload channels rising with manual
   heat at equal elapsed time - or an honest NULL with the reason.
4. Heat-0 income UNCHANGED: the baseline numbers stated and the comparison shown.
5. `node tools/verify_g24_heat_pays.mjs` (NEW) PASS in a REAL browser at 390x844 @dpr3: a real tap starts
   the run, `state.time > 1.0` asserted BEFORE any measurement, a REAL tap advances heat, the HUD text
   contains the payout, XP per kill rises with manual heat, PNG 1170x2532 with ink read back in the HUD
   box. (No vision model exists in the pilot job - read the PNG back by ink/state and SAY SO.)
6. Every file and line changed; every retarget enumerated (file + line + why); the explicit statement
   that no git state command was run.
7. Anything you could NOT verify, stated - not silently omitted.

## HOUSE RULES (binding)

- Do NOT run git commit / checkout / reset / stash / clean. Leave the tree dirty and report; the
  orchestrator owns commits.
- NEVER weaken an assertion to go green. Retarget the absolute minimum, enumerated, with the reason.
- Pure helpers stay pure; `addHeat` stays the ONE mutator and touches only `run.heat`.
- A self-report is a claim, not evidence: every acceptance number above must appear as raw tool output
  with n, or it did not happen.
- This slice is chartered by the pilot, not by the owner; if a design question the goal does not answer
  blocks you, STOP and report it rather than inventing content.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with its raw
output; the per-channel multiplier table (manual 0/3/6); the flag list; what you could not verify; and
the statement that no git state command was run.

## DISPATCH RE-ANCHOR (goal-pilot tick 51, 2026-09-15 ~07:55 UTC)
- **Lane restored:** the `glm` lane answers a direct probe `PROBE_OK` in 4s. The earlier `429 ... reset 2026-09-15
  15:49:58` stamp is PROVIDER-LOCAL (+8h) = `07:49:58 UTC`, so the lane is live as of this tick. The `kimi` lane is
  still on the 7-DAY wall (`403 weekly (7-day) usage limit`, no reset date published); `claude` is kimi-metered.
- **Issued on HEAD `d2744a3`, tree CLEAN (`dirty=0`).** Suite re-run by the PILOT this tick, verbatim:
  `TREE: /home/claude/projects/hordes @ d2744a3 | dirty=0` / `SUITE greenfiles=91 redfiles=0`.
- **Anchor spot-check re-run against `d2744a3`** (not author time): `src/heat.js` :22 `HEAT_CAP`, :33 `HEAT_CURVES`,
  :124 `describeHeat`; `src/entities.js` :117-118 foe hp heat read + `e.maxHp`; `src/main.js` :2378 kill-XP grant,
  :3147 per-kill purse credit, :6053 HUD heat line - ALL LIVE, zero drift measured this tick.
- The dispatch tick must still RUN the DISPATCH ANCHOR CHECK block above (steps 1-5) and paste the results.
