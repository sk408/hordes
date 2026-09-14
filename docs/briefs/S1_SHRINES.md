# S1 - SHRINES: WORLD-SEEDED, WHOLE-MAP, RARER, STATIC - BUILD BRIEF

**Slice:** S1, EXECUTION ORDER item 9 (`docs/HORDES_GOALS_2026-09-12.md:1162-1164`), goal entry
`docs/HORDES_GOALS_2026-09-12.md:1455-1469`, full spec `docs/HORDES_GOALS_2026-09-12.md:131-178`
(the "SHRINES - OWNER DIRECTIVE (2026-09-14)" section - READ IT before starting; it is reproduced in
substance below but the source is authoritative).
**Builder:** `cli:kimi-hordes-g8`. **Brief authored by:** the goal pilot, 2026-09-14, at HEAD `f50f1a6`;
**DISPATCH-RE-VERIFIED** by the pilot on the post-E2 tree (HEAD `b9c5571`, dirty=13 from the landed-but-uncommitted
E2 slice): every anchor re-resolved, drifted `main.js` line numbers corrected in place, three new seams
recorded below (run-start roll at 4602-4603, WAVE-11 clear at 6006, shared DRIFT.ARCH at 2153-2160).
with W7b DIRTY in the working tree (`git status --porcelain` = 10 lines) and E2 still to land -
i.e. authored BEFORE two balance slices (W7b, E2) land, so **EVERY anchor and every measured number
below MUST be re-verified by the dispatch tick on ITS OWN tree before this task is issued.**
Backlog note: S1 is a **DELETION of machinery** (the per-wave roll plus the orbit coupling), which is
why it is in scope under the SCOPE INTENT rule - prefer changes that delete machinery over changes that
add it. **S1 may NOT run in parallel with E2 or W7b** (all three touch `main.js` / `config.js` balance
surfaces). S1's shrine costs must be measured against the FINAL economy (E1 landed; W7b and E2 are the
last balance slices before this one) - measure once, on the post-E2 tree.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

Before issuing, on the dispatch tree (HEAD will be AFTER W7b AND E2 land):
1. `git status --porcelain` - record the line count and state whether the tree is clean.
2. Resolve every `file:line` anchor below and CORRECT any that drifted, IN PLACE in this file. Line
   numbers were read at `f50f1a6` + W7b-dirty and are EXPECTED to move (W7b edits `config.js`,
   `main.js`, `weapons.js`, `entities.js`; E2 edits `config.js`, `main.js`, `entities.js`,
   `enemy_types.js`, `render.js`, `meta.js`, `chests.js`).
3. RUN `bash tools/run_suite.sh` and paste its verbatim final line under MEASURED CURRENT BEHAVIOUR.
   If it does not end `redfiles=0`, STOP - S1 is not issued on a red tree.
4. The before-count baseline is DELEGATED to the builder (evidence 1): the per-wave BEFORE number
   MUST be measured on the dispatch tree BEFORE the builder's first edit (or via a toggle on the
   untouched code path), so both halves of the before/after come from the same tree. State the
   pre-edit HEAD + dirty-file count alongside the baseline.
5. Confirm `src/shrines.js` still exports `rollShrine` and that `state.shrine` (singular) is still the
   only shrine handoff between `shrines.js` and `main.js`; if E2 or W7b reshaped that seam, retarget
   the brief's anchors AND the requirements that name it.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If a change legitimately invalidates an
  assertion, RETARGET it to the new invariant and SAY SO (file + line + why). Enumerate EVERY retarget
  in your report. A retarget you do not enumerate is a defect. Widening a cohort until a marginal bar
  clears is tune-until-pass and is FORBIDDEN.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep and
  quote in the report. A builder self-report is a claim; the pilot re-measures on the artifact.
- **No emojis** anywhere (owner UI rule). **Integer pixels only** (shrine positions).
- **60Hz and 120Hz must both be correct.** Nothing may assume a fixed dt - relevant because the drift
  removal deletes the only dt-scaled shrine motion.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock before your first edit and release it when done.
- **Scope bound:** `src/shrines.js`, `src/main.js` (the shrine update / new-wave roll / tour-coachmark
  seams ONLY), `src/config.js` (shrine + drift constants ONLY), plus tests and these NEW files:
  `tools/verify_s1_shrines.mjs` and one `test/test_s1_*.mjs`. Do **NOT** touch `src/controllers.js`
  (the pilot-blind contract lives there and it must NOT be edited), `src/portal_cine.js`, `src/weapons.js`,
  the shop, the draft, or the run-structured ladder. Do NOT add a player-position term anywhere in
  shrine placement. If you believe a change outside this list is required, STOP and report.

## THE OWNER DIRECTIVE (verbatim - one quote, four requirements)

Sk408: *"Shrines should be a bit rarer. But should also be available across the entire map, yes. Not
player specific spawn. Maybe spawned on world creation like megabonk."*

Remy's calls on the two open questions (implement these unless the owner says otherwise):
- **Drop the ~6px/s drift.** A shrine that walks to the player is player-specific *in effect*, which
  contradicts "not player specific". Static means static.
- **Keep the auto-pilot blind.** `controllers.js` still never learns shrines exist. State the
  consequence plainly in your report: an AUTO/AFK run will now meet FEWER shrines, sometimes none. That
  is acceptable (blessings are optional bonuses; the owner's power model is shop buyables, not shrines)
  and it keeps the pick-up-and-leave path free of new steering code. Do NOT add shrine-seeking AI to
  "fix" it - that is scope creep and a reversal of the contract.

## MEASURED CURRENT BEHAVIOUR (dispatch-verified on the post-E2 tree, HEAD `b9c5571`, dirty=13)

Dispatch-check item 3 verbatim: `TREE: /home/claude/projects/hordes @ b9c5571 | dirty=13` /
`SUITE greenfiles=86 redfiles=0` (pilot-run 2026-09-14, exit 0). The f50f1a6-era line numbers below
were corrected where they drifted.

- `src/shrines.js:24` - `SHRINE_CHANCE = 0.6`: a per-WAVE roll, ~60% of waves get one shrine. This is
  the machinery being deleted.
- `src/shrines.js:25-27` - `SHRINE_RING_MIN = 250`, `SHRINE_RING_MAX = 420`: each shrine is placed on a
  ring around the ARENA CENTRE. The ring is deliberate - the auto-pilot idles in a counter-clockwise
  orbit of the centre (`controllers.js`), so centre-ringed placement lets AUTO runs cross shrines by
  patrol, not steering (the "PILOT-BLIND" contract documented at `src/shrines.js:12-19`).
- `src/shrines.js:36-45` - `rollShrine(wave, rng)`: gate draw, then radius + angle draws; returns
  `{ x, y, used:false }` or `null`. **3 rng draws when it spawns, 1 when it does not** - the cadence
  comment at `:33-35` says "cadence tests rely on this" (drawn from the runs' spirit - the test asserts
  cadence ~60% over N waves at `test/test_shrines.mjs:38-55`).
- `src/main.js:2174-2175` - the drift: `sh.x += (dx/len) * C.DRIFT.ARCH * dt` (and y), i.e. the shrine
  walks toward the player at `C.DRIFT.ARCH` = **6 px/s** (`src/config.js:547-550`, `DRIFT: { CHEST: 45,
  ARCH: 6 }`). This is the player-relative term being removed.
- `src/main.js:2053` - `if (len < 26)` proximity gate: touching the shrine (with enough purse gold)
  buys ONE random intermission-style blessing (`shrineBlessing(state.wave.num - 1, state.shrineRng,
  state.takenChoices)`), debits the RUN PURSE (E1), sets `sh.used = true`.
- `src/main.js:1141` - **per-wave**: `state.shrine = rollShrine(state.wave.num - 1,
  state.shrineRng)` at each wave start. `state.shrine` is a SINGLE slot (`src/main.js:309-310`), so a
  wave's shrine replaces the last - one at a time, per wave, for the whole run.
- `src/main.js:3695-3699` - the tour coachmark: `!tourFlag(TOUR_KEYS.shrine) && state.shrine &&
  !state.shrine.used` -> spots `state.shrine` and says "A SHRINE - drift close and gold buys a random
  blessing." Tour copy at `src/main.js:3328` also says "shrines - drift close, gold buys a blessing".
  **Both read `state.shrine` (singular) and BOTH must still find a shrine, or be honestly retargeted.**
- `src/shrines.js:28-30, 54-59` - cost curve `shrineCost(wave, used) = round((60 + 30*wave) *
  1.25^used)`: the wave term keeps pace with run income, the `1.25^used` term is the budget brake.
  Examples pinned by `test/test_shrines.mjs:60-69`: (0,0)=60 (2,0)=120 (5,0)=210 (0,1)=75 (0,2)=94 (4,2)=281.
- `test/test_shrines.mjs` (143 lines) - `:18-19` chance gate at exactly 0.60; `:21-31` fixed ring draws
  pin `r = 250 + 0.5*(420-250) = 335`; `:31` asserts `|x|,|y| <= 600` ("inside the arena"); `:38-55`
  cadence bounds asserting ~60% (`f > 0.53 && f < 0.67`); `:60-84` cost curve + `canAfford`; `:88-97`
  blessing determinism from the seed.
- **Economy consequence to handle rather than ignore:** a world-seeded set is ALL reachable from t=0, so
  an early rush gets a cheap blessing and only the `1.25^used` term brakes it. Keep the wave read at
  PURCHASE time (the current wave) and RE-MEASURE the spend curve; do not silently reprice.
- `src/main.js:4602-4603` - the RUN-START seam already exists: `state.shrineRng =
  mulberry32(state.choiceSeed ^ 0x5eed)` then `state.shrine = rollShrine(0, state.shrineRng)`. R1
  replaces this single-slot roll with the world-seeded SET at the same seam.
- `src/main.js:6006` - `state.shrine = null` at WAVE-11 ("no shrines past the end"). Under a static
  world set this becomes "the set is cleared/closed at the end" - retarget, do not delete the guard.
- `src/main.js:2153-2160` - `C.DRIFT.ARCH` ALSO drives the ARCHES (`a.x/a.y`). R3 removes ONLY the
  shrine's use at `src/main.js:2174-2175`; the arch drift and the constant stay untouched.
- **Caution, measured (do not let this surprise you):** the arena is ~10 screens (1200x1200 against a
  fixed 480x300 view) and a fresh run dies in ~35s, so four scattered shrines means many short runs meet
  ZERO shrines. That *is* "rarer"; if it reads as "never", the COUNT is the dial - never the centre ring
  again.

## REQUIREMENTS (numbered; the acceptance bar is at the bottom)

**R1 - WORLD-SEEDED AT RUN START, STATIC FOR THE RUN.** Replace the per-wave roll with a fixed set
chosen ONCE when the run starts (the Megabonk model) and never re-rolled: no per-wave roll, no
per-frame replacement, no respawn after use. Seed the set off the run seed via the existing
`state.shrineRng` stream (`mulberry32(choiceSeed ^ 0x5eed)`, `src/main.js:310` precedent (seeded at `src/main.js:4602`)) so
daily-seed runs replay exactly, exactly as the module's purity contract (`src/shrines.js:6-10`)
requires. The set must be reachable from t=0.

**R2 - ACROSS THE ENTIRE MAP.** Placement is a uniform scatter over the playfield bounds (rim clamp
+/-600 -> the 1200x1200 arena; positions ROUNDED to integer pixels and kept inside the rim with a
margin so a shrine is never half-offworld). NO centre ring, NO orbit coupling, NO radius band. If you
keep a minimum separation between shrines, it is a fairness/visual choice and must be stated and tested
- but the placement distribution must NOT be centre-weighted.

**R3 - NOT PLAYER-SPECIFIC.** Placement must not read the player's position, velocity, orbit phase, or
anything derived from them. **Drop the drift entirely** - remove `src/main.js:2174-2175` and the
shrine's use of `C.DRIFT.ARCH`; do not zero the constant (removing the coupling is the point; `ARCH`
and `CHEST` keep their own drift). "Static means static" is the bar.

**R4 - RARER, BY MEASUREMENT.** The count is the dial: start at **4 shrines per world** and tune by
measurement. The claim to substantiate is a DROP in shrine ENCOUNTERS per run versus the current
per-wave behaviour - measured, not asserted. Report: baseline shrines-seen-per-run BEFORE (per-wave
roll on this tree) and AFTER (world-seeded), over >= 8 runs per policy, on at least TWO profiles (a
fresh one and a developed/maxed one), plus the theoretical max per run before/after. A fresh/short run
meeting ZERO shrines is an expected, reportable outcome, NOT a failure of the slice - say so with the
number.

**R5 - KEEP THE PILOT BLIND (a hard invariant, not a preference).** `src/controllers.js` is NOT edited
by this slice. The pilot must not learn shrines exist - no shrine-seeking AI, no shrine in the
controller's target set. If a test pins the pilot-blind contract (`test/test_controllers.mjs` and the
A1 acceptance suite names it), it must still pass UNCHANGED. State the AUTO consequence in the report:
AFK runs now meet fewer shrines, sometimes none - accepted.

**R6 - ECONOMY: KEEP THE FORM, RE-MEASURE, DO NOT REPRICE SILENTLY.** `shrineCost(wave, used)` keeps
its form and the wave read happens at PURCHASE time (the current wave). Because the whole set is now
reachable from t=0, RE-MEASURE the spend curve and report it as numbers (a player rushing two shrines
in wave 0 now pays 60 then 75 - state what that does to the early-run budget against measured income).
If the measurement says the curve needs to CHANGE, that is an owner decision: STOP and report with the
numbers - do not reprice on your own authority.

**R7 - PURITY.** `src/shrines.js` stays rolls + math only: no DOM, no game loop, no meta/profile
reads, all randomness through the injectable rng. A world-seeded set still satisfies this - it is a
pure function of the run seed plus the arena bounds.

**R8 - TESTS (all new ones kept; every retarget enumerated).** See the acceptance bar for the required
assertions. The rng-cadence contract (`src/shrines.js:33-35` - 3 draws when it spawns, 1 when not) will
LEGITIMATELY change shape under a world-seeded set; retarget `test/test_shrines.mjs` to the NEW
contract (e.g. N draws at world creation, then ZERO draws per wave - which is the stronger property:
stepping waves consumes no randomness). Do NOT delete it, do NOT gut its coverage. Enumerate EVERY
retarget by file + line + why in the report.

**R9 - SUITE.** `bash tools/run_suite.sh` must end `redfiles=0`, run THREE times (the plan's flake rule),
with the final line quoted verbatim each time. Every new test is kept.

**R10 - NO REPLACEMENT MACHINERY.** This slice DELETES machinery. Do not add a shrine manager class, a
per-frame shrine scan beyond the existing single loop, or a new spawn scheduler. If your diff is
net-additive in structure, you have misread the slice - re-read `src/shrines.js:1-19`.

## EVIDENCE THIS SLICE OWES (a claim in prose is not evidence - each must be a command + raw output)

1. **Shrine-count-per-run table, before vs after**: shrines SEEN per run (not spawned - seen, i.e. the
   player actually reached them, which is the honest "rarer" measure), mean + n + spread, over >= 8
   runs per policy on >= 2 profiles, produced by `tools/verify_s1_shrines.mjs` (or a real-loop harness
   in the `tools/real_loop.mjs` style) and QUOTED raw. If you also report spawned-per-run, label the
   two separately - do not blur them.
2. **Seed identity**: the same run seed yields the IDENTICAL set, printed twice, diffed; two different
   seeds differ. Raw output.
3. **Corner-park invariance**: park the player in an arena corner (and in a second, opposite corner),
   assert the seeded set is byte-identical and that the placement code path cannot read player
   position (state the code fact you rely on: the placement function takes no player argument).
4. **Wave-step invariance**: step waves forward and assert the set is unchanged and NO shrine moved
   (positions byte-identical across waves) and no new shrine appeared.
5. **Zero-drift proof**: a shrine's position is byte-identical after N seconds of simulated time with
   the player at varying distances (i.e. the old 6px/s walk is gone). This is what kills R3.
6. **Spend-curve table** on the post-E2 economy: cost at wave 0/2/5 for used=0/1/2, plus what a
   two-shrine wave-0 rush costs against measured early income.
7. **Suite**: the final `redfiles=0` line, three consecutive runs, quoted.
8. **Real-browser phone capture** (390x844 @dpr3, PNG 1170x2532) showing a shrine ON THE FIELD: set all
   TOUR_KEYS, assert `state.time > 1.0` BEFORE measuring, then READ the screenshot back and say where
   the shrine is and what it looks like. A code claim is not evidence for anything a player looks at.
   If a random seed leaves no shrine in view, force a seed that does and say which seed you used.

## ACCEPTANCE BAR

- The per-wave roll and the drift are GONE (`SHRINE_CHANCE`, `SHRINE_RING_MIN/MAX` no longer drive
  behaviour; the `DRIFT.ARCH` coupling is removed from the shrine path), and the set is chosen once at
  world creation.
- Placement is whole-map and provably not player-relative / not centre-ringed (evidences 2, 3, 5).
- The set is provably static across waves (evidence 4).
- "Rarer" carries a measured before/after number per run on two profiles (evidence 1).
- Economy kept in form, re-measured, not silently repriced (evidence 6).
- The tour coachmark and the tour copy still find a shrine, or are honestly retargeted with the retarget
  enumerated - a coachmark that never fires is a silent regression.
- Suite `redfiles=0` x3, every retarget enumerated, no assertion weakened or deleted.
- Every number quoted from raw command output. If any bar is NOT met, say so plainly - an unmet bar
  reported honestly beats a bar met by assertion.
