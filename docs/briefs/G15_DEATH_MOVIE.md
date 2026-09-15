# G15 — THE DEATH MOVIE (owner-ordered)

**Goal, owner verbatim:** *"we also need a death movie if we don't have one."*
This is NEW work, not a polish pass: there is no death cinematic in the tree. It must COMPOSE with the
existing death payoff screen (WAVE-26 FEATURE 1), never replace it: the movie plays first, then the
stat / cause / gold / next-unlock overlay. It is a short, skippable beat — not a wall — in a game where
the player is expected to lose most runs.

**Sequencing:** G15 is the next unstarted numbered item after the in-flight work (G26 → V1). V1 (the
escape sequence) rides the PORTAL seam and does not touch the death path, so G15 does not collide with
it. One writer at a time regardless.

## MEASURED STATE — read off the tree, re-resolve every anchor before editing

- **No death cinematic exists.** Death goes straight to the overlay: `die()` is the single death seam
  (`src/main.js` :3381) — it stamps `state.deathBy` (wave/time/cause) and sets `state.mode = 'dead'`
  (the terminal mode that already freezes the sim), then composes and shows the payoff overlay.
- **The payoff screen is NOT to be replaced:** the WAVE-26 block starts at `src/main.js` :3075; the
  overlay body comes from `endScreenBody(...)` with `deathCauseLabel()` (:3085) and
  `nextUnlockWithinReach()` (:3096); the title goes to `ovTitle.textContent`, the body to `ovSub`, the
  RETRY / TITLE cards to `ovCards`, and `overlay.style.display = 'flex'` reveals it.
- **Two other paths also land in `'dead'` and must NOT get the movie:** `runSurvived()` (:3278, the
  win — "RUN SURVIVED") and `endRun()` (:3345 area, the deliberate exit — "RUN ENDED"). Both keep their
  current instant overlay. The death movie fires on DEATH only.
- **The existing cinematic to copy (structure, NOT content):** `src/portal_cine.js` (309 lines) —
  `CINE_SPEED = 0.7` (:26), `SCENE_DURATION = 3800` (:27), `CINE_DURATION = Math.round(SCENE_DURATION /
  CINE_SPEED)` (:28) = 5429 wall-ms, `PHASES` (:40), `isDone(t)` (:47), `phaseAt(t)` (:51),
  `render(g, tRaw)` (:173), `drawGridScaled(...)` (:130), `CINE_TEST` (:303).
  Its wiring in `src/main.js`: `cineT0` / `lastCinePhase` (:6575), `startPortalCine()` (:6576, sets
  `state.mode = 'portal-cine'` :6580 and `cineT0 = performance.now()`), `endPortalCine()` (:6583), the
  per-frame branch (:6938-6945: freeze, `render(ctx, t)`, phase-cue sfx, `isDone(t) -> end`), the
  any-key skip (:5896-5900, gated by `C.CINE.SKIPPABLE`, `src/config.js` :414) which calls
  `uiGuard.arm()` before ending, and the frame-order rule at :6903 (syncChrome runs BEFORE the early
  returns).
- **Screen-chrome gate:** `chromeOn()` (:6259) returns true ONLY for `'playing'` / `'finale'`;
  `syncChrome()` (:6265) is called on the first frame of EVERY mode (:6134 / :6903), so a new mode is
  chrome-OFF automatically. It must still be ASSERTED by name (a WAVE-23 regression shipped an
  unregistered mode over the intro movie).
- **Input-guard contract:** `test/test_cinematic_input_guard.mjs` pins that one tap against a cinematic
  can never both skip the movie and press the button under the same finger (items 1-6 there, with "the
  portal cinematic arms it too" as item 5). The new mode must join that contract, not bypass it.
- **Tests that must stay green:** `test/test_death_screen.mjs` (drives a REAL death through the real
  frame loop), `test/test_cinematic_input_guard.mjs`, `test/test_earned_moment.mjs`.
- **Earned-moment policy:** `triggerEarnedMoment` is called for boss (:2175), evolution (:2989) and the
  finale win (:3287 / :6846) — NOT on an ordinary death. Keep it that way (see the binding constraint
  below).

## BINDING OWNER-TASTE CONSTRAINTS (not suggestions)

1. **No new shake and no slow-motion on death.** Death happens on MOST runs; the owner's taste is that
   shake and slow-mo are RARE and EARNED. They exist for the boss kill / finale. Do not add a
   `triggerEarnedMoment` call to the death path and do not start a second slow-mo or camera shake. The
   movie's punch comes from framing, silhouette and the fade.
2. **Integer pixels, no smoothing, no emojis.** Art lives in a NEW file; never two writers in the same
   file, and never art pasted into `main.js`.
3. **60Hz AND 120Hz must both be correct** — nothing may assume a fixed dt.
4. **Chrome off while the movie plays** (pads / cog / hints are inert there anyway).

## REQUIRED BEHAVIOUR — the movie

New module `src/death_cine.js` (NEW FILE) + a new mode `'death-cine'` added to the mode list comment
(`src/main.js` :319) and to the frame dispatch. Beats, in order, time-driven off elapsed wall clock
(the portal cine's own model, so frame-rate parity is by construction rather than argued):

1. **BLOW (0 → ~900 scene-ms):** the moment of death. The killing blow reads off `state.deathBy.cause`
   — `contact` = the hero is already surrounded, `shot` = a projectile still in flight, `drain` = a
   latcher on the hero, unknown = the horde itself. A single hit-flash beat, no shake.
2. **COLLAPSE (~900 → ~2400):** the horde closes in as silhouettes converging on the hero; the hero
   falls (a 2-frame collapse, integer px, authored in the module's own palette).
3. **TAKEN (~2400 → ~3300):** the hero dissolves/fades INTO the horde (alpha ramp, the portal cine's
   `dissolveU` pattern :158 is the precedent); the horde darkens toward black.
4. **HANDOFF (→ end):** fade out, then reveal the EXISTING payoff overlay, unchanged, composed by
   `die()` before the movie starts. Total design timeline <= 4200 scene-ms at `CINE_SPEED` 0.7 (about
   6s wall), and any key OR any tap skips it via the SAME `uiGuard.arm()` path as intro/portal-cine.

Hard requirements the verifier will assert:
- the overlay is HIDDEN (not visible) for the whole movie and VISIBLE after the handoff;
- the payoff content after the handoff is IDENTICAL to what `die()` composed (stats, cause line, gold,
  next-unlock row) — read from the DOM;
- **gold is settled EXACTLY ONCE** and `state.deathBy` is not re-stamped: `die()` still owns
  `settleRunGold()` and the cine never pays out;
- the WIN path (`runSurvived`) and the deliberate exit (`endRun`) NEVER enter `'death-cine'`;
- `chromeOn()` is false during the movie, asserted by name.

## MEASUREMENT RE-SCOPE (owner's standing directive — binding)

No sim or measurement command may exceed **60 seconds of wall clock**; a check that cannot fit the cap
is DROPPED and named as dropped, never rescheduled with a bigger timeout. No cohorts, no seed tables,
no balance numbers: this is a FEATURE + CORRECTNESS slice. What stays ALIVE: the correctness suite,
unit/invariant tests, and real-browser FUNCTIONAL checks (they boot the loop for seconds and do not play
a run). "Does it read the way the owner asked" is settled by the real-browser captures below.

## ACCEPTANCE BAR

1. `bash tools/run_suite.sh` ends `redfiles=0`; quote the `TREE:` line verbatim (tree + HEAD + dirty
   count).
2. NEW `test/test_death_cine.mjs` is green and PRINTS numbers: the phase timeline is monotone and ends
   at the wall duration; `isDone` flips exactly once; the key skip AND the tap skip each exit the mode
   in one input; overlay hidden during / visible after; settle called exactly once with the gold equal
   to a scripted pre-change death; the win path and `endRun` never enter the mode; 60Hz-vs-120Hz phase
   parity (same elapsed time -> same phase and same exit).
3. NEW `tools/verify_death_cine.mjs` runs in REAL Chrome at **390x844 @dpr3**, sets all 19 `TOUR_KEYS`
   and asserts `state.time > 1.0` BEFORE measuring, drives a REAL death through the real seam (a typed
   enemy parked on the hero, the `test_death_screen.mjs` path), captures a PNG at each of >= 3 points
   on the timeline and asserts the canvas ink CHANGES between them (print the deltas), asserts the
   overlay state at each point, then reads the end-card DOM after handoff. PNG 1170x2532 into
   `docs/art/death-cine-2026-09-15/`.
   **There is no vision model in this job** — the PNG is read back by ink/state sampling, state that
   plainly in the report, and leave the PNG for the owner.
4. `test/test_death_screen.mjs`, `test/test_cinematic_input_guard.mjs` (EXTENDED with the new mode as
   its own case) and `test/test_earned_moment.mjs` are all still green. Any retarget is enumerated as
   file + line + why. **Never weaken an assertion to go green.**
5. Measured wall duration of the movie <= 6.0s and a skip exits in < 250ms, both printed by the
   verifier.
6. A `COULD NOT VERIFY` section in the report listing anything you could not prove, including the
   dropped-for-the-cap checks if any.

## HOUSE RULES

No emojis. Integer pixels. 60Hz and 120Hz both correct. Do NOT run any git state command
(no commit/checkout/reset/stash/clean) — leave the tree dirty and REPORT the dirty count. Keep the
heartbeat current: append a timestamped line to `/tmp/g15_heartbeat.log` before and after every step
that can take more than a few seconds. Post `done:` or `blocked:` to the `hordes` channel FIRST, with
raw evidence, then the full detail.

## DISPATCH ANCHOR CHECK (the dispatching pilot runs this, then appends the filled block at the top)

Every line number above was resolved on HEAD `beb0854` with the G26 tree dirty. Before issuing,
re-resolve and record: `src/main.js` mode list (:319), :3075/:3085/:3096 (the payoff block),
:3278 (`runSurvived`), :3345 (`endRun`), :3381 (`die`), :5896 (the skip clause), :6259 (`chromeOn`),
:6265 (`syncChrome`), :6575-6583 (`cineT0`/`startPortalCine`/`endPortalCine`), :6938 (the portal-cine
frame branch), :6903 (syncChrome before early return), :3066 (`triggerEarnedMoment`);
`src/portal_cine.js` :26-28/:40/:47/:51/:130/:158/:173/:303; `src/config.js` :414 (`CINE.SKIPPABLE`);
`test/test_death_screen.mjs`, `test/test_cinematic_input_guard.mjs` (item 5), `test/test_earned_moment.mjs`.
STOP and re-author if any of these moved in KIND (a symbol renamed / a seam removed) — do not dispatch a
brief whose seams no longer exist.

## REPORT FORMAT

`done:` / `blocked:` to `hordes` FIRST, then: the suite `TREE:` line verbatim + `greenfiles=N
redfiles=N`; the raw tail of `test/test_death_cine.mjs` and of `tools/verify_death_cine.mjs`; the PNG
paths with their ink numbers; the dirty count; then the explicit `COULD NOT VERIFY` section.


## DISPATCH ANCHOR CHECK (pilot tick 65, 2026-09-15 ~19:40 UTC — appended AT ISSUE TIME)

Anchors re-resolved by the pilot on the tree at HEAD `beb0854` dirty=21. The tree carries the uncommitted
G26 loadout work AND the IN-FLIGHT V1 escape edit, so the `main.js` numbers below sit ~5-20 lines LATER
than the numbers in this brief's body. **TRUST THE SYMBOL, not the number; re-resolve before your first
edit.** Every symbol the brief depends on EXISTS on this tree:

- `triggerEarnedMoment()` `src/main.js` :3072 (body says :3066)
- `runSurvived()` :3284 (:3278) — the WIN, must NOT get the movie
- `endRun()` :3346 (:3345) — the deliberate exit, must NOT get the movie
- `die()` :3387 (:3381) — the ONE death seam the movie hangs off
- `C.CINE.SKIPPABLE` :5903 (skip clause), `chromeOn()` :6275, `syncChrome()` :6285
- portal cine: `cineT0` :6605, `startPortalCine()` :6606, `endPortalCine()` :6612, skip clause :6591 / :6594,
  portal-cine frame branch ~:7009
- `src/config.js` :414 `CINE.SKIPPABLE` present; `src/portal_cine.js` present.

**IN-FLIGHT COLLISION FLAG (stated, not hidden):** `src/escape/` (V1) is being written on this tree RIGHT
NOW and `main.js` is already wired for it — mode `escape` is live and `test/smoke.mjs` +
`test/test_portal_park.mjs` are RED with `mode=escape` (suite at issue time: greenfiles=90 redfiles=7,
ALL of it V1-in-flight). Those reds are NOT yours. **First action: run `bash tools/run_suite.sh`; if it is
still red on V1 files, STOP and post `blocked:` rather than building on a mid-flight tree.**

**PILOT-VERIFIED STATE OF THE PREVIOUS SLICE (G26), for context only:** `node test/test_g26_loadout.mjs`
=> all 27 checks passed; `node tools/verify_g26_loadout.mjs` => ALL 11 CHECKS PASSED in real Chrome at
390x844 @dpr3. Full-suite re-verification of G26 was NOT reproducible this tick because V1's edits were in
flight — recorded as unverified, not waived.
