## DISPATCH ANCHOR CHECK — FILLED BY THE GOAL-PILOT TICK 2026-09-15 21:20 UTC (HEAD `0c13b08` dirty=11)

Re-resolved on the LIVE tree at dispatch, NOT trusted from author time. The dispatch tree is POST-G15 and
POST-V1b/V1c: the death movie (`src/death_cine.js`) and the escape's test button are COMMITTED at
`0c13b08`; the V1b/V1c escape art (`src/escape/render.js`, `sim.js`, `fx.js`, `sprites.js`,
`src/art/format.js`) is present but UNCOMMITTED. Every `main.js` line number below therefore sits LATER
than the author-time block's. **TRUST THE SYMBOL, NOT THE NUMBER.**

- `src/main.js` :73 `import * as CINE`; mode-list comment :319; `cinePending` decl :294, route :1088,
  runner hook :2550; the portal-cine skip clause (any key) :5928, gated by `C.CINE.SKIPPABLE` =
  `src/config.js` :414; `chromeOn()` :6307, `syncChrome()` :6319; `cineT0`/`lastCinePhase` :6640;
  `startPortalCine()` :6641; `endPortalCine()` :6647 (END_WAVE -> `startFinale()` first, then the
  **V1 wave-1 -> `startEscape()` branch — OUT OF SCOPE, DO NOT TOUCH**, then `openIntermission()`);
  the portal-cine frame branch :7078-7082 (`CINE.render` :7079, `CINE.phaseAt` :7080,
  `audio.playPortalCue(cph)` :7081, `CINE.isDone` -> `endPortalCine()` :7082);
  `triggerEarnedMoment()` :3079.
- `src/portal_cine.js` :26/:27/:28 (`CINE_SPEED` 0.7 / `SCENE_DURATION` 3800 / `CINE_DURATION` 5429),
  `SCENE` :30, `wall()` :36, `PHASES` :40, `isDone` :47, `phaseAt` :51, `PX = 8` :63, `HERO_PALETTE` :103,
  the portal constants (`PORTAL_CX/CY/RX/RY`) :107, `drawGridScaled` :130, `heroX` :151, `dissolveU` :158,
  `render(g, tRaw)` :173, `CINE_TEST` :303. Frozen-API header :13.
- `src/audio.js` `PORTAL_CUES` :243, `playPortalCue` :266.
- `src/art/portal.js` `PORTAL_ART` :33, `PORTAL_BOX` :243, `portalFrame` :245; `src/art/index.js`
  :19/:28/:56; the lint gate `test/test_art_lint.mjs` :299 (`maxKeys 8, minFrames 4, minCoverage >= 0.10`)
  and :300.
- `test/test_portal_cine.mjs` timeline pin :45-51, black hold :156-158; `test/test_cinematic_input_guard.mjs`
  (item 5, the portal cine arms the guard); `test/smoke.mjs` :10 / :917; `test/test_v1_escape.mjs`
  (28 checks, GREEN).

**TWO CORRECTIONS TO THE AUTHOR-TIME TEXT — both verified on THIS tree:**

1. **"THE DETAILED PORTAL ART ... NOBODY USES IT" IS NO LONGER TRUE, AND THAT IS NOT A PROBLEM.** The
   V1b escape art now consumes it: `src/escape/render.js` :20 imports `PORTAL_ART` / `portalFrame` and
   draws the escape's destination portal at :227-228. So the `grep -rn "art/portal|PORTAL_ART|portalFrame"
   src/ | grep -v "src/art/"` check the brief asks you to run WILL return those two hits and they are
   EXPECTED — it is still true that NOTHING draws the detailed portal in the BOSS-KILL cinematic, and that
   is the wiring job. Rule 8 stands unchanged (do NOT edit `src/escape/`); consuming the same art module
   from `portal_cine.js` is NOT a writer conflict — `src/art/portal.js` stays read-only to you.
2. **FIRST ACTION is still `bash tools/run_suite.sh`, and the suite is GREEN on this tree.** Measured by
   the dispatching tick itself: `TREE: /home/claude/projects/hordes @ 0c13b08 | dirty=11`,
   `SUITE greenfiles=98 redfiles=0`, REDLIST empty. The V1 family is QUIESCENT (the V1b/V1c tasks exited 0
   at 21:07 UTC and the builder lane is idle; `node test/test_v1_escape.mjs` = 28 checks passed, and
   `tools/verify_v1_escape.mjs` / `verify_v1_test_button.mjs` / `verify_v1c_pursuit.mjs` / `verify_v1b_art.mjs`
   / `verify_death_cine.mjs` all PASS in real Chrome). A RED you see after your first edit is YOUR change,
   not an in-flight tree — but if the suite is red BEFORE you edit anything, STOP and post `blocked:`.

# G16 — PORTAL-ENTRY CINEMATIC UPGRADE (owner-ordered; a DIRECTED upgrade, not a new system)

**Owner verbatim:** *"the boss kill movie could use a tune to show a more detailed portal that the pilot
enters upon defeating the boss. it could show them approach and pause before they enter. fade the pilot
and linger on the movie for a beat or two before fading out of the movie too"*

**Sequencing:** G16 is the next unstarted numbered item after the death movie (G15, queued behind the
in-flight V1 escape). V1 hangs off `endPortalCine()`'s wave-1 branch on this same seam, so G16 must NOT
disturb it: `test/test_v1_escape.mjs` and `tools/verify_v1_escape.mjs` must stay green untouched.
This is ONE file's re-choreography plus one wiring change. One writer at a time.

## MEASURED STATE — read off the tree; re-resolve EVERY anchor before your first edit

- **The cinematic EXISTS**: `src/portal_cine.js` (309 lines). Public API is declared FROZEN in its own
  header (:13): `CINE_DURATION, PHASES, render(ctx, t), isDone(t), phaseAt(t)`. Consumed by
  `src/main.js` :73 (`import * as CINE`), the per-frame branch `src/main.js` :7006-7016, and
  `test/smoke.mjs` :10 / :917 (it imports `CINE_DURATION` and asserts the movie runs to `isDone`).
- **Timeline today** (`src/portal_cine.js`): `CINE_SPEED = 0.7` (:26), `SCENE_DURATION = 3800` (:27),
  `CINE_DURATION = Math.round(SCENE_DURATION / CINE_SPEED)` = 5429 wall-ms (:28), `SCENE` beats KILL
  0-1200 / WALK 1200-2000 / DISSOLVE 2000-3200 / FADE 3200-3800 (:31-36), `wall = scene / CINE_SPEED`
  (:37), `PHASES` in wall-ms (:41), `isDone` (:47), `phaseAt` (:51).
- **What it draws today**: fixed camera, static stars, a ground strip, the GRAVELMAW boss collapsing to
  a dust pile with a hit-flash + slash burst, and **the "portal" is a 28-dot ring of 4x4 rects**
  (constants `PORTAL_CX 340 / PORTAL_CY GROUND_Y-76 / PORTAL_RX 44 / PORTAL_RY 80 / PORTAL_DOTS 28`
  near :100; drawn in `render()`'s "Portal ring (drawn FIRST ...)" block). The hero is two 12x12 grids
  painted at `PX = 8` (:65-68 `W 480 / H 300 / GROUND_Y 232 / PX 8`), walks right and dissolves into
  rising motes (`dissolveU` :158, `drawGridScaled` :130, `render` :173). Test seam `CINE_TEST` :303.
- **THE TWO BEATS THE OWNER ASKED FOR DO NOT EXIST.** `heroX()` is monotone through WALK -> DISSOLVE:
  the hero never stops, so there is no APPROACH->PAUSE. And the white->black fade starts the instant the
  hero is gone, so there is no LINGER on the movie. Those two are the substance of this slice.
- **THE DETAILED PORTAL ART ALREADY EXISTS AND NOBODY USES IT.** `src/art/portal.js` = `PORTAL_ART`
  (id `PORTAL_DETAILED`), 48x48, 4 frames: carved stone arch + keystone runes + a 4-arm vortex
  (rotating 45 deg/frame) + drifting embers; exports `PORTAL_PALETTE`, `PORTAL_BOX`, `portalFrame(i)`
  (:33 / :246), re-exported through `src/art/index.js` (:19 / :28 / :56) and linted by
  `test/test_art_lint.mjs` :291 (`maxKeys 8, minFrames 4, minCoverage >= 0.10`). Prove the "unused"
  claim yourself before editing: `grep -rn "art/portal\|PORTAL_ART\|portalFrame" src/ | grep -v "art/"`
  -> expected: NO game-side hit. So beat 1 is a WIRING job, not an authorship job.
- **Audio keys off the PHASE STRING**: `src/main.js` :7012 calls `audio.playPortalCue(cph)` on each
  phase transition; `src/audio.js` `PORTAL_CUES` :243-247 maps KILL/BOSS_YELL -> boss yell,
  DISSOLVE -> shimmer, WALK/FADE -> `cueBlip`; `playPortalCue` (:266) returns false for an unmapped name,
  so a NEW phase name would go SILENT. See binding rule 5.
- **Skip**: any key during `'portal-cine'` -> `src/main.js` :5902-5909, gated by `C.CINE.SKIPPABLE`
  (`src/config.js` :414), which `uiGuard.arm()`s then calls `endPortalCine()`. That path is pinned by
  `test/test_cinematic_input_guard.mjs` (its item 5 is "the portal cinematic arms it too").
- **Chrome**: `chromeOn()` `src/main.js` :6275 is true ONLY for `playing`/`finale`; `syncChrome()`
  :6285 runs before the early returns, so a cinematic is chrome-OFF automatically. It must still be
  ASSERTED BY NAME (a WAVE-23 regression shipped an unregistered mode over the intro movie).
- **Earned moment**: `triggerEarnedMoment()` `src/main.js` :3072 already fires on the boss kill (slow-mo).
  G16 COMPOSES with it and adds no second trigger.
- **Downstream handoff** (`endPortalCine()` :6612): `wave.num === END_WAVE` -> `startFinale()` (:6618);
  **`wave.num === 1` -> `startEscape()` (:6623, V1, OUT OF SCOPE)**; else `openIntermission()` (:6624).

## BINDING CONSTRAINTS (not suggestions)

1. **The detailed portal is CONSUMED, not re-authored.** Draw it from `portalFrame(i)` + `PORTAL_BOX`
   (~48x48). If you judge the art insufficient, STOP at the art boundary and report it as a separate
   ask — do not silently re-author that file (one writer per file; its owner is the A1 art track and
   `test_art_lint.mjs` gates it). Extending its frames is allowed ONLY with the lint kept green and the
   change named in your report.
2. **Keep the FROZEN API surface** (`CINE_DURATION, PHASES, render, isDone, phaseAt, CINE_TEST`).
   Extending the timeline is EXPECTED (that is how a pause + linger land). Renaming or dropping an
   export is a break, not a taste call.
3. **No new shake. No second slow-motion.** Shake and slow-mo are RARE and EARNED in this game and the
   boss kill already spent its earned moment. The new beats sell themselves with framing, the vortex and
   the fade.
4. **Integer pixels, no smoothing, no emojis.** Art stays in its own module; never paste art grids into
   `main.js`.
5. **Every name in `PHASES` MUST have a `PORTAL_CUES` entry** (reuse an existing fn — `cueBlip` is the
   transitional one — for any new phase). A silent transition is a defect: assert it in the test.
6. **60Hz AND 120Hz both correct.** All beats off elapsed wall clock in integer ms; the vortex frame
   index must be `floor(t / interval) % 4` with a FIXED integer interval — never an accumulated dt.
7. **Chrome off while the movie plays**, and the skip stays the SINGLE existing route (any key/tap ->
   `uiGuard.arm()` -> `endPortalCine()`). Do not add a second skip path.
8. **`src/escape/` and `endPortalCine()`'s wave-1 branch are OUT OF SCOPE.** Do not edit, do not
   reorder, do not "tidy" them.
9. **Before editing, copy the current module aside**: `cp src/portal_cine.js /tmp/portal_cine_before.js`
   — the acceptance bar needs a measured BEFORE for the portal-detail count (see 3c).

## REQUIRED BEHAVIOUR — the owner's five beats, in order

Rework the scene timeline inside `src/portal_cine.js` so it reads, on the same fixed camera and at the
same `CINE_SPEED` model:

1. **KILL** — unchanged content: the boss blow, the collapse, the pile, the burst. (Keep the existing
   pre-blow flash and slash; do not add shake.)
2. **PORTAL OPENS / APPROACH** — the DETAILED portal art fades in (alpha ramp off the wall clock) where
   the dotted ring used to be, and the hero WALKS toward its threshold.
3. **PAUSE (NEW, the beat that sells it)** — a HELD beat of **>= 600 scene-ms** in which the hero's
   on-screen rectangle does not move by even 1 px while the vortex keeps animating frame to frame, plus
   ONE body-language tell: a 2-frame idle flicker or a 1-px forward lean authored in the module's own
   palette (integer px; NOT a camera or scene shake).
4. **FADE (the hero, not a teleport)** — the existing dissolve/alpha ramp: the hero fades INTO the
   portal, the vortex/glow brightens as it takes him.
5. **LINGER (NEW) — then fade out** — hold on the portal ALONE for **>= 500 wall-ms** with no hero
   pixels on screen (still animated, not a still frame), THEN the existing white -> black fade, then the
   SAME handoff: `isDone(t)` -> `endPortalCine()` with the frame/phase/skip plumbing untouched.

## MEASUREMENT RE-SCOPE (owner's standing directive — binding)

No sim or measurement command may exceed **60 seconds of wall clock**; a check that cannot fit the cap
is DROPPED and NAMED as dropped, never rescheduled with a bigger timeout. No cohorts, no seed tables, no
balance numbers: this is a FEATURE + CORRECTNESS slice. Alive: the correctness suite, unit/invariant
tests, and real-browser FUNCTIONAL checks. "Does it read the way the owner asked" is settled only by
the real-browser captures below. **There is no vision model in this job** — say so in the report and
leave the PNGs for the owner.

## ACCEPTANCE BAR

1. `bash tools/run_suite.sh` ends `redfiles=0`; quote the `TREE:` line verbatim (tree + HEAD + dirty).
2. `test/test_portal_cine.mjs` EXTENDED, never weakened, green, and PRINTING numbers:
   PHASES monotone, non-overlapping and covering `[0, CINE_DURATION)`; `CINE_DURATION` equals the new
   `SCENE_DURATION / CINE_SPEED` arithmetic; the PAUSE window exists and the hero's rect trace is
   BYTE-IDENTICAL at >= 3 sampled times inside it; the detailed portal is REALLY DRAWN (count the rects
   whose styles come from `PORTAL_PALETTE` — must be > 0 and > 4x the old 28-dot ring's rect count);
   black hold-frame at `t > CINE_DURATION`; `isDone` flips exactly once; every `PHASES` name has a
   `PORTAL_CUES` entry; 60Hz-vs-120Hz parity (same elapsed time -> same phase AND same vortex frame).
3. NEW `tools/verify_g16_portal_cine.mjs` in REAL Chrome at **390x844 @dpr3**, all 19 `TOUR_KEYS` set and
   `state.time > 1.0` ASSERTED before measuring, driving a REAL boss kill into the REAL cine start:
   (a) hero-region ink non-zero during approach;
   (b) **the pause proof**: two samples inside the PAUSE window where the hero region is IDENTICAL while
       the portal region CHANGES (print both deltas);
   (c) the portal-region detail count (grid-sampled distinct colours / non-background pixels in
       `PORTAL_BOX`) with the BEFORE number measured by the SAME sampler against `/tmp/portal_cine_before.js`
       rendered headlessly with the `test_portal_cine.mjs` stub-ctx pattern — print both, state the delta;
   (d) `chromeOn() === false` during the movie, asserted by name;
   (e) a REAL key skips out in < 250 ms.
   PNG 1170x2532 into `docs/art/g16-portal-cine-2026-09-15/` (>= 3 points on the timeline).
4. `test/test_cinematic_input_guard.mjs`, `test/smoke.mjs`, `test/test_v1_escape.mjs` all still green.
   `test/smoke.mjs` :917 asserts `cineFrames >= Math.ceil(CINE_DURATION / dtMs) - 2` inside a 1200-frame
   pump — so keep `CINE_DURATION <= 7000` wall-ms. If you must exceed it, retarget the pump budget in the
   same change with file + line + why. Any retarget is enumerated as file + line + why. **Never weaken an
   assertion to go green.**
5. Printed numbers: measured wall duration <= 8.0 s; skip exits in < 250 ms; the PAUSE beat's measured
   wall-ms; the LINGER's measured wall-ms.
6. An explicit `COULD NOT VERIFY` section in the report, including any check dropped for the 60 s cap.

## HOUSE RULES

No emojis. Integer pixels. 60Hz and 120Hz both correct. Do NOT run any git state command
(no commit/checkout/reset/stash/clean) — leave the tree dirty and REPORT the dirty count. Keep the
heartbeat current: append a timestamped line to `/tmp/g16_heartbeat.log` before and after every step
that can take more than a few seconds. Post `done:` or `blocked:` to the `hordes` channel FIRST, with raw
evidence, then the full detail.

**FIRST ACTION:** `bash tools/run_suite.sh`. If it is still red on V1 / escape files, STOP and post
`blocked:` rather than building on a mid-flight tree.

## DISPATCH ANCHOR CHECK (the dispatching pilot runs this, then appends the filled block at the top)

Resolved by the pilot tick on HEAD `beb0854` dirty=21 (G26 uncommitted + V1 in flight — `main.js` numbers
sit ~5-20 lines LATER than older briefs; TRUST THE SYMBOL, not the number):

- `src/main.js` :73 (`import * as CINE`), :1081 + :2543 (`state.wave.cinePending -> startPortalCine`),
  :319 (the mode-list comment), :5902-5909 (the portal-cine skip clause; `C.CINE.SKIPPABLE` :5903,
  `endPortalCine()` call :5906), :6275 `chromeOn()`, :6285 `syncChrome()`, :6605 `cineT0`/`lastCinePhase`,
  :6606 `startPortalCine()`, :6612 `endPortalCine()` (:6618 finale branch, :6623 **V1 wave-1 branch —
  DO NOT TOUCH**, :6624 `openIntermission()`), :7006-7016 the portal-cine frame branch (`CINE.render`
  :7010, `playPortalCue` :7012, `isDone -> endPortalCine` :7013), :3072 `triggerEarnedMoment()`.
- `src/portal_cine.js` :26-28 (`CINE_SPEED`/`SCENE_DURATION`/`CINE_DURATION`), :31-37 (`SCENE`, `wall`),
  :41 `PHASES`, :47 `isDone`, :51 `phaseAt`, :65-68 layout (`PX 8`), ~:100 portal constants, :130
  `drawGridScaled`, :158 `dissolveU`, :173 `render`, :303 `CINE_TEST`.
- `src/audio.js` :243-247 `PORTAL_CUES`, :266 `playPortalCue`.
- `src/art/portal.js` :33 `PORTAL_ART`, :246 `portalFrame`; `src/art/index.js` :19/:28/:56;
  `test/test_art_lint.mjs` :291.
- `test/test_portal_cine.mjs` (:45-52 timeline pin, :156-167 the black hold / `isDone`),
  `test/test_cinematic_input_guard.mjs` (item 5), `test/smoke.mjs` :10/:917, `test/test_v1_escape.mjs` :303.

STOP and re-author if any of these moved IN KIND (a symbol renamed / a seam removed) — do not dispatch a
brief whose seams no longer exist.

## REPORT FORMAT

`done:` / `blocked:` to `hordes` FIRST, then: the suite `TREE:` line verbatim + `greenfiles=N redfiles=N`;
the raw tail of `test/test_portal_cine.mjs` and of `tools/verify_g16_portal_cine.mjs`; the before/after
portal-detail counts; the PNG paths with their ink numbers; the dirty count; then the explicit
`COULD NOT VERIFY` section.
